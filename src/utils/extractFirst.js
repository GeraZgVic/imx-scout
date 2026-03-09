/**
 * utils/extractFirst.js
 * Helper compartido por amazonScraper y ebayScraper.
 *
 * Intenta extraer texto visible de una lista de selectores CSS,
 * devolviendo el primer resultado no vacío que encuentre.
 * Si ningún selector produce texto, devuelve null.
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
      // El selector lanzó un error (ej: elemento en iframe o shadow DOM).
      // Se continúa con el siguiente sin interrumpir.
      continue;
    }
  }
  return null;
}

module.exports = { extractFirst };