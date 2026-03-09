/**
 * index.js
 * Punto de entrada principal de IMX Scout.
 *
 * Flujo:
 *   1. Leer lista de URLs desde input/urls.json
 *   2. Clasificar cada URL por plataforma (Amazon / eBay)
 *   3. Abrir navegador con Playwright
 *   4. Ejecutar el scraper correspondiente por cada URL
 *   5. Normalizar los datos extraídos
 *   6. Exportar resultados en JSON y CSV
 */

const fs         = require("fs");
const path       = require("path");
const { chromium } = require("playwright");

const logger           = require("./utils/logger");
const { processUrls }  = require("./processors/urlProcessor");
const { scrapeAmazon } = require("./scrapers/amazonScraper");
const { scrapeEbay }   = require("./scrapers/ebayScraper");
const { buildSuccess, buildError } = require("./parsers/dataParser");
const { exportJson, exportCsv }    = require("./exporters/resultExporter");

// ─── Configuración ────────────────────────────────────────────────────────────

const INPUT_FILE = path.resolve(__dirname, "../input/urls.json");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Lee y valida el archivo de entrada.
 * @returns {string[]} Lista de URLs
 */
function readInputUrls() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Archivo de entrada no encontrado: ${INPUT_FILE}`);
  }

  const raw  = fs.readFileSync(INPUT_FILE, "utf-8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data.urls)) {
    throw new Error('El archivo de entrada debe tener la forma { "urls": [...] }');
  }

  const valid   = [];
  const invalid = [];

  for (const entry of data.urls) {
    if (typeof entry === "string" && entry.trim() !== "") {
      valid.push(entry.trim());
    } else {
      invalid.push(entry);
    }
  }

  if (invalid.length > 0) {
    logger.warn(`Se ignoraron ${invalid.length} entradas no válidas: ${JSON.stringify(invalid)}`);
  }

  if (valid.length === 0) {
    throw new Error("El archivo de entrada no contiene ninguna URL válida.");
  }

  return valid;
}

// ─── Flujo principal ──────────────────────────────────────────────────────────

async function main() {
  logger.info("=== IMX Scout iniciado ===");

  // 1. Leer URLs
  const rawUrls = readInputUrls();
  logger.info(`URLs cargadas: ${rawUrls.length}`);

  // 2. Clasificar por plataforma
  const classified = processUrls(rawUrls);
  logger.info(`URLs válidas a procesar: ${classified.length}`);

  if (classified.length === 0) {
    logger.warn("No hay URLs válidas para procesar. Finalizando.");
    return;
  }

  // 3. Iniciar navegador
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const results = [];

  try {
    // Contexto con user-agent real para evitar detección anti-bot (requerido por eBay).
    // navigator.webdriver se oculta vía initScript antes de cualquier navegación.
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const page = await context.newPage();

    // 4. Procesar cada URL
    for (const { platform, url } of classified) {
      try {
        let datos;

        if (platform === "amazon") {
          datos = await scrapeAmazon(page, url);
        } else if (platform === "ebay") {
          datos = await scrapeEbay(page, url);
        }

        // 5. Normalizar resultado exitoso
        results.push(buildSuccess(url, platform, datos));

      } catch (err) {
        logger.error(`Error procesando ${url}: ${err.message}`);

        // 5b. Normalizar resultado de error (no interrumpe el flujo)
        results.push(buildError(url, platform, err.message));
      }
    }

    await context.close();

  } finally {
    // Garantiza el cierre del navegador aunque ocurra un error inesperado
    await browser.close();
  }

  // 6. Exportar resultados
  exportJson(results);
  exportCsv(results);

  logger.info(`=== IMX Scout finalizado. ${results.length} resultados guardados. ===`);
}

main().catch((err) => {
  logger.error(`Error fatal: ${err.message}`);
  process.exit(1);
});