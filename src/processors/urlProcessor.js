/**
 * urlProcessor.js
 * Recibe una lista de entradas y las normaliza a URLs clasificadas por plataforma.
 *
 * Tipos de entrada aceptados:
 *   - URL completa de Amazon o eBay  → se clasifica directamente
 *   - ASIN de Amazon (10 chars alfanuméricos) → se construye la URL y se clasifica como amazon
 *
 * Entradas inválidas se omiten con un warning en el log.
 *
 * Detección de dominio:
 *   Se verifica que el hostname sea exactamente el dominio raíz
 *   o un subdominio directo (ej: www.amazon.com, www.ebay.com).
 *   Esto evita falsos positivos con dominios como "notamazon.com"
 *   o "fake-ebay.net".
 */

const logger = require("../utils/logger");

const PLATFORMS = {
  AMAZON: "amazon",
  EBAY:   "ebay",
};

// Dominios raíz permitidos por plataforma.
// El hostname debe ser exactamente uno de estos,
// o terminar en ".<dominio>" (para cubrir subdominios como www.).
const ALLOWED_DOMAINS = {
  [PLATFORMS.AMAZON]: ["amazon.com", "amazon.com.mx"],
  [PLATFORMS.EBAY]:   ["ebay.com"],
};

// Patrón de ASIN: exactamente 10 caracteres alfanuméricos.
// Los ASINs de Amazon siempre tienen este formato.
const ASIN_PATTERN = /^[A-Z0-9]{10}$/i;

// URL base para construir enlaces de producto desde un ASIN
const AMAZON_PRODUCT_URL = "https://www.amazon.com/dp/";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Comprueba si un hostname pertenece a alguno de los dominios permitidos.
 * Acepta el dominio raíz exacto o cualquier subdominio directo.
 *
 * Ejemplos válidos:   www.amazon.com, amazon.com, www.ebay.com
 * Ejemplos inválidos: notamazon.com, fake-ebay.net, amazon.com.evil.io
 *
 * @param {string} hostname
 * @param {string[]} allowedDomains
 * @returns {boolean}
 */
function matchesDomain(hostname, allowedDomains) {
  return allowedDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

/**
 * Detecta la plataforma de una URL completa.
 * @param {string} url
 * @returns {"amazon" | "ebay" | "unsupported"}
 */
function detectPlatform(url) {
  try {
    const { hostname, protocol } = new URL(url);

    if (protocol !== "http:" && protocol !== "https:") return "unsupported";

    for (const [platform, domains] of Object.entries(ALLOWED_DOMAINS)) {
      if (matchesDomain(hostname, domains)) return platform;
    }

    return "unsupported";
  } catch {
    return "unsupported";
  }
}

/**
 * Determina si una entrada es un ASIN válido de Amazon.
 * Un ASIN es exactamente 10 caracteres alfanuméricos.
 *
 * @param {string} entry
 * @returns {boolean}
 */
function isAsin(entry) {
  return ASIN_PATTERN.test(entry);
}

/**
 * Construye la URL canónica de un producto de Amazon a partir de su ASIN.
 *
 * @param {string} asin
 * @returns {string}
 */
function buildAmazonUrl(asin) {
  return `${AMAZON_PRODUCT_URL}${asin.toUpperCase()}`;
}

// ─── Procesador principal ─────────────────────────────────────────────────────

/**
 * Procesa una lista de entradas (URLs o ASINs) y devuelve
 * URLs clasificadas por plataforma, listas para ser scrapeadas.
 *
 * @param {string[]} entries - Array de URLs o ASINs
 * @returns {{ platform: string, url: string }[]}
 */
function processUrls(entries) {
  const results = [];

  for (const entry of entries) {
    // Caso 1: ASIN de Amazon
    if (isAsin(entry)) {
      const url = buildAmazonUrl(entry);
      logger.info(`ASIN detectado [${entry}] → ${url}`);
      results.push({ platform: PLATFORMS.AMAZON, url });
      continue;
    }

    // Caso 2: URL completa
    const platform = detectPlatform(entry);

    if (platform === "unsupported") {
      logger.warn(`Entrada no reconocida, se omitirá: ${entry}`);
      continue;
    }

    logger.info(`Plataforma detectada [${platform}]: ${entry}`);
    results.push({ platform, url: entry });
  }

  return results;
}

module.exports = { processUrls, detectPlatform, isAsin, buildAmazonUrl };