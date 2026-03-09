/**
 * utils/logger.js
 * Logger estructurado con pino.
 *
 * En desarrollo: salida legible con pino-pretty.
 * En producción: JSON puro, optimizado para docker logs.
 *
 * Uso:
 *   logger.info({ url, plataforma, duracion }, "scrape_success")
 *   logger.warn("mensaje de advertencia")
 *   logger.error({ err }, "scrape_error")
 */

const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
    : undefined,
});

module.exports = logger;