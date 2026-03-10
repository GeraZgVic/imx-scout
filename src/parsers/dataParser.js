/**
 * dataParser.js
 * Normaliza los datos crudos extraídos por los scrapers
 * en una estructura de resultado uniforme.
 *
 * Estructura de resultado estándar:
 * {
 *   url:            string,
 *   plataforma:     "amazon" | "ebay",
 *   nombre:         string | null,
 *   precio:         string | null,
 *   envio:          string | null,
 *   tiempo_entrega: string | null,
 *   destino_consultado: string | null,
 *   timestamp:      string (ISO 8601),
 *   status:         "ok" | "error",
 *   error_mensaje:  string | null
 * }
 */

/**
 * Construye un resultado exitoso.
 *
 * @param {string} url
 * @param {string} plataforma
 * @param {{ nombre, precio, envio, tiempo_entrega, destino_consultado }} datos
 * @returns {object}
 */
function buildSuccess(url, plataforma, datos) {
  return {
    url,
    plataforma,
    nombre:         datos.nombre         ?? null,
    precio:         datos.precio         ?? null,
    envio:          datos.envio          ?? null,
    tiempo_entrega: datos.tiempo_entrega ?? null,
    destino_consultado: datos.destino_consultado ?? null,
    timestamp:      new Date().toISOString(),
    status:         "ok",
    error_mensaje:  null,
  };
}

/**
 * Construye un resultado de error (cuando el scraping falla).
 *
 * @param {string} url
 * @param {string} plataforma
 * @param {string} mensajeError
 * @returns {object}
 */
function buildError(url, plataforma, mensajeError) {
  return {
    url,
    plataforma,
    nombre:         null,
    precio:         null,
    envio:          null,
    tiempo_entrega: null,
    destino_consultado: null,
    timestamp:      new Date().toISOString(),
    status:         "error",
    error_mensaje:  mensajeError,
  };
}

module.exports = { buildSuccess, buildError };
