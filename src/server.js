/**
 * server.js
 * Punto de entrada de IMX Scout v2.
 *
 * En desarrollo: Express sirve solo la API en :3000.
 *   El frontend corre en Vite (:5173) y proxea /api/* hacia aquí.
 *
 * En producción: Express sirve la API en /api/* y el build
 *   estático de React en /* desde el directorio /dist.
 */

const path    = require("path");
const express = require("express");
const cors    = require("cors");
const logger  = require("./utils/logger");

const productosRoutes = require("./api/routes/productos");
const scrapingRoutes  = require("./api/routes/scraping");
const alertasRoutes   = require("./api/routes/alertas");

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, "request");
  next();
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use("/api/productos", productosRoutes);
app.use("/api/scraping",  scrapingRoutes);
app.use("/api/alertas",   alertasRoutes);

// ─── Frontend estático (solo producción) ─────────────────────────────────────

if (process.env.NODE_ENV === "production") {
  const distPath = path.resolve(__dirname, "../dist");
  app.use(express.static(distPath));

  // SPA fallback: cualquier ruta no-API devuelve index.html
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ─── Error handler global ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  logger.error({ err }, "unhandled_error");
  res.status(500).json({ error: "Error interno del servidor" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || "development" }, "server_started");
});