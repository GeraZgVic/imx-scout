/**
 * amazonScraper.js
 * Extrae información de un producto desde una página de Amazon US.
 *
 * Dirección de entrega:
 *   Antes de extraer datos, el scraper cambia la ubicación de entrega al
 *   ZIP 78041 (Laredo, TX) — dirección de la paquetería del equipo de IMX.
 *   Esto garantiza que el precio, envío y tiempo de entrega reflejen la
 *   disponibilidad real hacia esa dirección, independientemente de la IP
 *   desde la que se ejecute el sistema.
 *
 * Estrategia de selección:
 *   Cada campo usa una lista de selectores ordenados por prioridad.
 *   Se intenta cada uno en orden y se devuelve el primero que produzca
 *   texto no vacío. Si ninguno funciona, el campo devuelve null.
 */

const logger = require("../utils/logger");

// ─── Selectores por campo ─────────────────────────────────────────────────────
//
// Ordenados de más específico a más genérico.
// Amazon varía el layout según categoría, tipo de vendedor y experimentos A/B,
// por lo que mantener varios fallbacks es la estrategia más estable para el MVP.

const SELECTORS = {

  nombre: [
    "#productTitle",                        // Página estándar de producto
    "#title span",                          // Variante en algunos listados
    "h1.a-size-large",                      // Fallback genérico h1
  ],

  precio: [
    "#corePrice_feature_div .a-price .a-offscreen", // Precio principal accesible (confirmado)
    ".priceToPay .a-offscreen",             // Variante priceToPay
    ".priceToPay span.a-price-whole",       // Variante priceToPay (split entero)
    ".priceToPay",                          // Variante priceToPay completo
    "#priceblock_ourprice",                 // Layout antiguo
    "#priceblock_dealprice",                // Precio de oferta (layout antiguo)
    ".a-price.apex-pricetopay-value .a-offscreen", // Clase apex (confirmada en diagnóstico)
  ],

  envio: [
    "#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE", // Confirmado: costo + fecha
    "#deliveryMessageMirId",                // Variante MIR antigua
    "#deliveryBlockMessage",                // Bloque de entrega completo
    "#delivery-message",                    // ID genérico
  ],

  tiempo_entrega: [
    "#mir-layout-DELIVERY_BLOCK-slot-SECONDARY_DELIVERY_MESSAGE_LARGE", // Confirmado: "Or fastest delivery..."
    "#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE .a-text-bold",
    "#deliveryMessageMirId .a-text-bold",
  ],

};

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Intenta extraer texto visible de una lista de selectores CSS,
 * devolviendo el primer resultado no vacío que encuentre.
 *
 * @param {import("playwright").Page} page
 * @param {string[]} selectors
 * @returns {Promise<string|null>}
 */
async function extractFirst(page, selectors) {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (!element) continue;

      const text = await element.innerText();
      const clean = text.trim().replace(/\s+/g, " ");

      if (clean.length > 0) return clean;
    } catch {
      // El selector lanzó un error (ej: elemento en iframe o shadow DOM)
      // Se continúa con el siguiente sin interrumpir
      continue;
    }
  }
  return null;
}

// ─── Dirección de entrega ─────────────────────────────────────────────────────

// ZIP de la paquetería en Laredo, TX a la que el equipo de IMX envía los productos.
// Esta constante centraliza la dirección: cambiarla aquí la actualiza en todo el scraper.
const DELIVERY_ZIP = "78041";

/**
 * Cambia la ubicación de entrega en Amazon al ZIP configurado (Laredo, TX).
 *
 * Flujo documentado del modal de Amazon:
 *   1. Clic en "#nav-global-location-popover-link" → abre modal "Choose your location"
 *   2. Escribir ZIP en "#GLUXZipUpdateInput" + presionar Enter → Amazon valida el ZIP
 *   3. Amazon muestra modal de confirmación "You're now shopping for delivery to: XXXXX"
 *      con un botón Continue (input#GLUXConfirmClose, inicialmente hidden en el DOM)
 *   4. Disparar click via dispatchEvent sobre #GLUXConfirmClose (no es visible, no
 *      puede clickearse con Playwright directamente)
 *   5. Esperar a que Amazon recargue el buybox con la nueva ubicación
 *
 * @param {import("playwright").Page} page
 */
async function setDeliveryZip(page) {
  try {
    await page.click("#nav-global-location-popover-link");
    await page.waitForSelector("#GLUXZipUpdateInput", { timeout: 8_000 });

    await page.click("#GLUXZipUpdateInput");
    await page.fill("#GLUXZipUpdateInput", "");
    await page.type("#GLUXZipUpdateInput", DELIVERY_ZIP, { delay: 80 });
    await page.press("#GLUXZipUpdateInput", "Enter");

    // Esperar a que Amazon procese el ZIP y renderice el modal de confirmación
    await page.waitForTimeout(2_000);

    // El botón Continue (#GLUXConfirmClose) está en el DOM pero marcado como hidden.
    // Playwright no puede clickearlo directamente; se dispara el evento desde el DOM.
    await page.evaluate(() => {
      const btn = document.querySelector("#GLUXConfirmClose");
      if (btn) btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    // Esperar a que Amazon recargue el buybox con la nueva ubicación
    await page.waitForTimeout(4_000);

    logger.info(`[Amazon] Ubicación de entrega configurada: ZIP ${DELIVERY_ZIP} (Laredo, TX)`);
  } catch (err) {
    logger.warn(`[Amazon] No se pudo configurar la ubicación de entrega: ${err.message}`);
  }
}

// ─── Scraper principal ────────────────────────────────────────────────────────

/**
 * Extrae datos de un producto de Amazon US.
 *
 * @param {import("playwright").Page} page - Página activa de Playwright
 * @param {string} url - URL del producto en Amazon
 * @returns {Promise<{ nombre: string|null, precio: string|null, envio: string|null, tiempo_entrega: string|null }>}
 */
async function scrapeAmazon(page, url) {
  logger.info(`[Amazon] Cargando: ${url}`);

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  // Esperar a que el título del producto esté presente antes de continuar.
  // Si no aparece en 10s, se continúa igualmente (el campo quedará null).
  try {
    await page.waitForSelector(SELECTORS.nombre[0], { timeout: 10_000 });
  } catch {
    logger.warn("[Amazon] El selector de nombre no apareció en 10s. Continuando con extracción parcial.");
  }

  // Cambiar la ubicación de entrega a Laredo TX (ZIP 78041) antes de extraer.
  // Esto garantiza que precio, envío y tiempos de entrega reflejen la disponibilidad
  // real hacia la dirección de la paquetería del equipo, no hacia México.
  await setDeliveryZip(page);

  const nombre         = await extractFirst(page, SELECTORS.nombre);
  const precio         = await extractFirst(page, SELECTORS.precio);
  const envio          = await extractFirst(page, SELECTORS.envio);
  const tiempo_entrega = await extractFirst(page, SELECTORS.tiempo_entrega);

  logger.info(`[Amazon] nombre:         ${nombre         ?? "null"}`);
  logger.info(`[Amazon] precio:         ${precio         ?? "null"}`);
  logger.info(`[Amazon] envio:          ${envio          ?? "null"}`);
  logger.info(`[Amazon] tiempo_entrega: ${tiempo_entrega ?? "null"}`);

  return { nombre, precio, envio, tiempo_entrega };
}

module.exports = { scrapeAmazon };