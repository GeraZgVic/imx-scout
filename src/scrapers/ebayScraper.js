/**
 * ebayScraper.js
 * Extrae información de un producto desde una página de eBay.
 *
 * Dirección de entrega:
 *   Antes de extraer datos de envío, el scraper abre el modal
 *   "Envíos, devoluciones y pagos", selecciona "Estados Unidos" como
 *   país e ingresa el ZIP 78041 (Laredo, TX — paquetería del equipo IMX).
 *   Los datos de envío y entrega se extraen desde dentro del modal
 *   una vez actualizado, ya que eBay no actualiza la página principal.
 *
 * Anti-bot:
 *   La configuración anti-bot se aplica en src/index.js, no aquí.
 */

const logger = require("../utils/logger");

const DELIVERY_ZIP = "78041";

const SELECTORS = {
  nombre: [
    "h1.x-item-title__mainTitle span",
    "h1.x-item-title__mainTitle",
    "h1",
  ],
  precio: [
    ".x-price-primary .ux-textspans",
    ".x-price-primary",
    ".x-bin-price__content",
  ],
};

async function extractFirst(page, selectors) {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (!element) continue;
      const text = await element.innerText();
      const clean = text.trim().replace(/\s+/g, " ");
      if (clean.length > 0) return clean;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Abre el modal de envío de eBay, selecciona Estados Unidos, ingresa el ZIP
 * de Laredo TX, hace clic en Actualizar y extrae los datos resultantes.
 *
 * Flujo documentado:
 *   1. Clic en "Ver detalles" (.ux-labels-values--shipping button.ux-action)
 *   2. Esperar #shCountry → selectOption "1" (Estados Unidos)
 *   3. Esperar #shZipCode → fill con ZIP 78041
 *   4. Clic en Actualizar (#shipping-calculator-form button[type='submit'])
 *   5. Esperar 3s → leer .ux-labels-values--deliveryto .ux-labels-values__values-content
 *      - línea 0: tipo + servicio ("Free 2-4 day delivery Standard Shipping")
 *      - línea 2: fecha estimada ("Obtenlo entre el mié. 11 mar. y el vie. 13 mar. a 78041")
 */
async function setDeliveryLocationAndExtract(page) {
  try {
    const verDetallesBtn = await page.$(".ux-labels-values--shipping button.ux-action");
    if (!verDetallesBtn) {
      logger.warn("[eBay] Botón 'Ver detalles' no encontrado.");
      return { envio: null, tiempo_entrega: null };
    }
    await verDetallesBtn.click();

    await page.waitForSelector("#shCountry", { timeout: 8_000 });
    await page.selectOption("#shCountry", "1");
    await page.waitForTimeout(2_000);

    await page.waitForSelector("#shZipCode", { timeout: 5_000 });
    await page.fill("#shZipCode", DELIVERY_ZIP);

    await page.evaluate(() => {
      const btn = document.querySelector("#shipping-calculator-form button[type='submit']") ||
                  Array.from(document.querySelectorAll("button"))
                    .find(el => el.offsetParent !== null &&
                      (el.innerText?.includes("Actualizar") || el.innerText?.includes("Update")));
      if (btn) btn.click();
    });

    // Esperar activamente a que el bloque de entrega tenga contenido
    await page.waitForFunction(
      () => {
        const el = document.querySelector(".ux-labels-values--deliveryto .ux-labels-values__values-content");
        return el && el.innerText?.trim().length > 5;
      },
      { timeout: 10_000 }
    ).catch(() => {
      // Si no aparece en 10s, continuar con lo que haya
    });

    const lines = await page.evaluate(() => {
      const el = document.querySelector(".ux-labels-values--deliveryto .ux-labels-values__values-content");
      if (!el) return [];
      return el.innerText
        .split("\n")
        .map(l => l.trim().replace(/\s+/g, " "))
        .filter(l => l.length > 0);
    });

    // lines[0]: "Free 2-4 day delivery"
    // lines[1]: "Standard Shipping"
    // lines[2]: "Obtenlo entre el mié. 11 mar. y el vie. 13 mar. a 78041"
    const envio          = lines.length > 0 ? lines.slice(0, 2).join(" — ") : null;
    const tiempo_entrega = lines[2] ?? null;

    logger.info(`[eBay] Ubicación configurada: ZIP ${DELIVERY_ZIP} (Laredo, TX)`);
    return { envio, tiempo_entrega };

  } catch (err) {
    logger.warn(`[eBay] No se pudo configurar la ubicación: ${err.message}`);
    return { envio: null, tiempo_entrega: null };
  }
}

async function scrapeEbay(page, url) {
  logger.info(`[eBay] Cargando: ${url}`);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

  try {
    await page.waitForSelector(SELECTORS.nombre[0], { timeout: 10_000 });
  } catch {
    logger.warn("[eBay] El selector de nombre no apareció en 10s. Continuando con extracción parcial.");
  }

  const nombre = await extractFirst(page, SELECTORS.nombre);
  const precio = await extractFirst(page, SELECTORS.precio);
  const { envio, tiempo_entrega } = await setDeliveryLocationAndExtract(page);

  logger.info(`[eBay] nombre:         ${nombre         ?? "null"}`);
  logger.info(`[eBay] precio:         ${precio         ?? "null"}`);
  logger.info(`[eBay] envio:          ${envio          ?? "null"}`);
  logger.info(`[eBay] tiempo_entrega: ${tiempo_entrega ?? "null"}`);

  return { nombre, precio, envio, tiempo_entrega };
}

module.exports = { scrapeEbay };