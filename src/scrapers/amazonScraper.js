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

  ubicacion_entrega: [
    "#glow-ingress-line2",
    "#glow-ingress-block",
    "#nav-global-location-data-modal-action",
    "#contextualIngressPtLabel_deliveryShortLine",
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

async function extractLocationText(page) {
  return extractFirst(page, SELECTORS.ubicacion_entrega);
}

async function isDeliveryZipApplied(page) {
  const locationText = await extractLocationText(page);
  return {
    applied: typeof locationText === "string" && locationText.includes(DELIVERY_ZIP),
    locationText,
  };
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

    await page.waitForTimeout(2_000);

    const confirmSelectors = [
      "#GLUXConfirmClose",
      "input[name='glowDoneButton']",
      "input.a-button-input",
      "#a-autoid-1-announce",
    ];

    for (const selector of confirmSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.count()) {
          await button.click({ force: true, timeout: 2_000 });
          break;
        }
      } catch {
        continue;
      }
    }

    await page.waitForLoadState("domcontentloaded").catch(() => {});

    for (let attempt = 0; attempt < 3; attempt++) {
      const { applied, locationText } = await isDeliveryZipApplied(page);

      if (applied) {
        logger.info(
          { zip: DELIVERY_ZIP, locationText },
          "[Amazon] Ubicación de entrega confirmada"
        );
        return { applied: true, locationText };
      }

      if (attempt < 2) {
        await page.waitForTimeout(2_000);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
      }
    }

    const { locationText } = await isDeliveryZipApplied(page);
    logger.warn(
      { zip: DELIVERY_ZIP, locationText: locationText ?? null },
      "[Amazon] No se pudo confirmar el ZIP de entrega"
    );
    return { applied: false, locationText };
  } catch (err) {
    logger.warn(`[Amazon] No se pudo configurar la ubicación de entrega: ${err.message}`);
    return { applied: false, locationText: null };
  }
}

// ─── Scraper principal ────────────────────────────────────────────────────────

/**
 * Extrae datos de un producto de Amazon US.
 *
 * @param {import("playwright").Page} page - Página activa de Playwright
 * @param {string} url - URL del producto en Amazon
 * @returns {Promise<{ nombre: string|null, precio: string|null, envio: string|null, tiempo_entrega: string|null, destino_consultado: string|null }>}
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
  const deliveryLocation = await setDeliveryZip(page);

  const nombre         = await extractFirst(page, SELECTORS.nombre);
  const precio         = await extractFirst(page, SELECTORS.precio);
  const envio          = await extractFirst(page, SELECTORS.envio);
  const tiempo_entrega = await extractFirst(page, SELECTORS.tiempo_entrega);

  logger.info(`[Amazon] nombre:         ${nombre         ?? "null"}`);
  logger.info(`[Amazon] precio:         ${precio         ?? "null"}`);
  logger.info(`[Amazon] envio:          ${envio          ?? "null"}`);
  logger.info(`[Amazon] tiempo_entrega: ${tiempo_entrega ?? "null"}`);
  const destino_consultado = deliveryLocation.locationText ?? null;

  logger.info(
    {
      locationApplied: deliveryLocation.applied,
      locationText: destino_consultado,
    },
    "[Amazon] delivery_location"
  );

  return { nombre, precio, envio, tiempo_entrega, destino_consultado };
}

module.exports = { scrapeAmazon };
