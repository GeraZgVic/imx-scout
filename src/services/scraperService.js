/**
 * services/scraperService.js
 * Orquestador del scraping para IMX Scout v2.
 *
 * Responsabilidades:
 *   - Clasificar entradas (URLs / ASINs) con urlProcessor
 *   - Abrir navegador Playwright con configuración anti-bot
 *   - Ejecutar scrapers en paralelo con p-limit
 *   - Aplicar timeout por URL con Promise.race()
 *   - Persistir resultados en RegistroPrecio via Prisma
 *   - Delegar detección de cambios a alertaService
 *   - Mantener estado en memoria para GET /api/scraping/estado
 *   - Garantizar cierre del navegador con try/finally
 */

const { chromium }   = require("playwright");
const pLimit         = require("p-limit");

const logger           = require("../utils/logger");
const prisma           = require("../lib/prisma");
const { processUrls }  = require("../processors/urlProcessor");
const { scrapeAmazon } = require("../scrapers/amazonScraper");
const { scrapeEbay }   = require("../scrapers/ebayScraper");
const { buildSuccess, buildError } = require("../parsers/dataParser");
const { detectarYCrearAlertas }    = require("./alertaService");

// ─── Configuración ────────────────────────────────────────────────────────────

const MAX_CONCURRENT_SCRAPERS = Number(process.env.MAX_CONCURRENT_SCRAPERS || 5);
const MAX_URLS_PER_REQUEST    = Number(process.env.MAX_URLS_PER_REQUEST    || 100);
const SCRAPER_TIMEOUT_MS      = Number(process.env.SCRAPER_TIMEOUT_MS      || 30000);

const SCRAPERS = {
  amazon: scrapeAmazon,
  ebay:   scrapeEbay,
};

// ─── Estado en memoria ────────────────────────────────────────────────────────

// Una sola instancia del contenedor hace suficiente una variable en memoria.
// Si se necesita persistencia entre reinicios, migrar a tabla ScrapeJob en v3.
let estadoActual = {
  activo:    false,
  inicio:    null,
  total:     0,
  procesados: 0,
  errores:   0,
};

/**
 * Devuelve el estado actual del scraping.
 * @returns {object}
 */
function getEstado() {
  return { ...estadoActual };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Promesa que rechaza después de ms milisegundos.
 * Se usa con Promise.race() para limitar el tiempo por URL.
 *
 * @param {number} ms
 * @returns {Promise<never>}
 */
function timeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout: el scraper excedió ${ms}ms`)), ms)
  );
}

/**
 * Busca o crea un Producto en la base de datos por URL.
 * Si ya existe, actualiza el nombre si ahora está disponible.
 *
 * @param {{ platform: string, url: string }} target
 * @param {string|null} nombre
 * @returns {Promise<Producto>}
 */
async function upsertProducto(target, nombre) {
  return prisma.producto.upsert({
    where: { url: target.url },
    create: {
      url:        target.url,
      plataforma: target.platform,
      asin:       extraerAsin(target.url),
      nombre:     nombre ?? null,
      activo:     true,
    },
    update: {
      // Solo actualiza el nombre si se obtuvo uno nuevo
      ...(nombre ? { nombre } : {}),
      updatedAt: new Date(),
    },
  });
}

/**
 * Extrae el ASIN de una URL de Amazon, si aplica.
 * Ejemplo: https://www.amazon.com/dp/B08N5WRWNW → B08N5WRWNW
 *
 * @param {string} url
 * @returns {string|null}
 */
function extraerAsin(url) {
  try {
    const match = url.match(/\/dp\/([A-Z0-9]{10})/i);
    return match ? match[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Guarda un RegistroPrecio en la base de datos.
 *
 * @param {number} productoId
 * @param {object} resultado - Resultado normalizado de dataParser
 * @returns {Promise<RegistroPrecio>}
 */
async function guardarRegistro(productoId, resultado) {
  return prisma.registroPrecio.create({
    data: {
      productoId,
      precio:         resultado.precio         ?? null,
      envio:          resultado.envio           ?? null,
      tiempo_entrega: resultado.tiempo_entrega  ?? null,
      status:         resultado.status,
      error_mensaje:  resultado.error_mensaje   ?? null,
      timestamp:      new Date(resultado.timestamp),
    },
  });
}

// ─── Scraper por URL ──────────────────────────────────────────────────────────

/**
 * Ejecuta el scraper correspondiente para una URL, con timeout.
 * Persiste el resultado en la base de datos.
 * Devuelve el resultado normalizado.
 *
 * @param {import("playwright").Browser} browser
 * @param {{ platform: string, url: string }} target
 * @returns {Promise<object>} Resultado normalizado (buildSuccess o buildError)
 */
async function procesarUrl(browser, target) {
  const page = await browser.newPage();

  try {
    const scraper = SCRAPERS[target.platform];

    // Promise.race: el scraper compite contra el timeout
    const datos = await Promise.race([
      scraper(page, target.url),
      timeout(SCRAPER_TIMEOUT_MS),
    ]);

    const resultado = buildSuccess(target.url, target.platform, datos);

    // Persistir en DB
    const producto = await upsertProducto(target, datos.nombre);
    const registro = await guardarRegistro(producto.id, resultado);

    logger.info(
      { url: target.url, plataforma: target.platform, precio: datos.precio, registroId: registro.id },
      "scrape_success"
    );

    estadoActual.procesados++;
    return { resultado, productoId: producto.id, registroId: registro.id };

  } catch (err) {
    const resultado = buildError(target.url, target.platform, err.message);

    // Intentar persistir el error también (puede fallar si la URL nunca existió)
    try {
      const producto = await upsertProducto(target, null);
      await guardarRegistro(producto.id, resultado);
    } catch (dbErr) {
      logger.warn({ url: target.url, err: dbErr }, "error_guardando_registro_fallido");
    }

    logger.error({ url: target.url, err: err.message }, "scrape_error");
    estadoActual.errores++;
    return { resultado, productoId: null, registroId: null };

  } finally {
    await page.close().catch(() => {});
  }
}

// ─── Orquestador principal ────────────────────────────────────────────────────

/**
 * Ejecuta el scraping completo para una lista de entradas.
 * Valida entradas, abre navegador, ejecuta scrapers en paralelo,
 * persiste resultados y genera alertas.
 *
 * @param {string[]} entries - Lista de URLs o ASINs
 * @returns {Promise<{ total: number, exitosos: number, errores: number, resultados: object[] }>}
 * @throws {Error} Si ya hay un scraping en curso o las entradas son inválidas
 */
async function ejecutarScraping(entries) {

  // Validaciones previas
  if (estadoActual.activo) {
    throw new Error("Ya hay un scraping en curso. Espera a que termine.");
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Se requiere una lista de entradas no vacía.");
  }

  if (entries.length > MAX_URLS_PER_REQUEST) {
    throw new Error(`Máximo ${MAX_URLS_PER_REQUEST} entradas por ejecución.`);
  }

  const targets = processUrls(entries);

  if (targets.length === 0) {
    throw new Error("Ninguna entrada corresponde a una URL o ASIN válido.");
  }

  // Marcar inicio
  estadoActual = {
    activo:     true,
    inicio:     new Date().toISOString(),
    total:      targets.length,
    procesados: 0,
    errores:    0,
  };

  logger.info({ total: targets.length }, "scraping_iniciado");

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const resultados       = [];
  const productoIds      = [];

  try {
    // Configurar contexto anti-bot (igual que v1)
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "en-US",
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    // Reemplazar browser por un objeto que usa el contexto compartido
    // Los scrapers reciben una page del contexto anti-bot
    const browserConContexto = {
      newPage: () => context.newPage(),
    };

    const limit = pLimit(MAX_CONCURRENT_SCRAPERS);

    const promesas = targets.map((target) =>
      limit(() => procesarUrl(browserConContexto, target))
    );

    const respuestas = await Promise.all(promesas);

    for (const { resultado, productoId } of respuestas) {
      resultados.push(resultado);
      if (productoId) productoIds.push(productoId);
    }

    await context.close();

  } finally {
    // Garantiza cierre del navegador aunque ocurra error inesperado
    await browser.close().catch(() => {});

    estadoActual = {
      activo:     false,
      inicio:     null,
      total:      0,
      procesados: 0,
      errores:    0,
    };
  }

  // Detectar cambios y generar alertas (fuera del try/finally del browser)
  if (productoIds.length > 0) {
    try {
      await detectarYCrearAlertas(productoIds);
    } catch (err) {
      // Las alertas no son críticas — un fallo aquí no debe romper la respuesta
      logger.warn({ err: err.message }, "alertas_error");
    }
  }

  const exitosos = resultados.filter(r => r.status === "ok").length;
  const errores  = resultados.filter(r => r.status === "error").length;

  logger.info({ total: resultados.length, exitosos, errores }, "scraping_finalizado");

  return {
    total:      resultados.length,
    exitosos,
    errores,
    resultados,
  };
}

module.exports = { ejecutarScraping, getEstado };
