/**
 * logger.js
 * Utilidad simple para registrar eventos del sistema en consola.
 */

const LEVELS = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
};

function timestamp() {
  return new Date().toISOString();
}

function info(message) {
  console.log(`[${timestamp()}] [${LEVELS.INFO}] ${message}`);
}

function warn(message) {
  console.warn(`[${timestamp()}] [${LEVELS.WARN}] ${message}`);
}

function error(message) {
  console.error(`[${timestamp()}] [${LEVELS.ERROR}] ${message}`);
}

module.exports = { info, warn, error };