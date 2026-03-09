/**
 * resultExporter.js
 * Guarda los resultados del scraping en los formatos soportados:
 *   - JSON
 *   - CSV
 */

const fs   = require("fs");
const path = require("path");

const logger = require("../utils/logger");

const OUTPUT_DIR = path.resolve(__dirname, "../../output");

/**
 * Asegura que el directorio de salida exista.
 */
function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Guarda los resultados como JSON.
 *
 * @param {object[]} results
 * @param {string} filename - Nombre del archivo (sin extensión)
 */
function exportJson(results, filename = "results") {
  ensureOutputDir();
  const filepath = path.join(OUTPUT_DIR, `${filename}.json`);
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2), "utf-8");
  logger.info(`Resultados exportados como JSON: ${filepath}`);
}

/**
 * Guarda los resultados como CSV.
 *
 * @param {object[]} results
 * @param {string} filename - Nombre del archivo (sin extensión)
 */
function exportCsv(results, filename = "results") {
  ensureOutputDir();

  if (results.length === 0) {
    logger.warn("No hay resultados para exportar como CSV.");
    return;
  }

  const headers = Object.keys(results[0]);
  const rows = results.map((row) =>
    headers.map((h) => {
      const value = row[h] ?? "";
      // Escapar comillas dobles dentro del valor
      const escaped = String(value).replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");

  const filepath = path.join(OUTPUT_DIR, `${filename}.csv`);
  fs.writeFileSync(filepath, csv, "utf-8");
  logger.info(`Resultados exportados como CSV: ${filepath}`);
}

module.exports = { exportJson, exportCsv };