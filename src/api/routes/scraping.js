/**
 * api/routes/scraping.js
 * Disparo y estado del scraping.
 */

const router = require("express").Router();
const prisma = require("../../lib/prisma");
const { ejecutarScraping, getEstado } = require("../../services/scraperService");

// GET /api/scraping/estado
// Devuelve si hay un scraping en curso y cuántas URLs se han procesado
router.get("/estado", (_req, res) => {
  res.json(getEstado());
});

// POST /api/scraping/ejecutar
// Recibe { entries: ["url1", "ASIN1", ...] } y ejecuta el scraping
router.post("/ejecutar", async (req, res, next) => {
  try {
    const entries = req.body?.entries;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array "entries" no vacío.' });
    }

    const resultado = await ejecutarScraping(entries);
    res.json(resultado);

  } catch (err) {
    if (
      err.message.includes("Ya hay un scraping") ||
      err.message.includes("Máximo") ||
      err.message.includes("Ninguna entrada")
    ) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post("/prioritarios", async (_req, res, next) => {
  try {
    const productos = await prisma.producto.findMany({
      where: { prioritario: true, activo: true },
      orderBy: { updatedAt: "asc" },
      select: { url: true },
    });

    const entries = productos.map((producto) => producto.url).filter(Boolean);

    if (entries.length === 0) {
      return res.status(400).json({ error: "No hay productos prioritarios para consultar." });
    }

    const resultado = await ejecutarScraping(entries);
    return res.json(resultado);
  } catch (err) {
    if (
      err.message.includes("Ya hay un scraping") ||
      err.message.includes("Máximo") ||
      err.message.includes("Ninguna entrada")
    ) {
      return res.status(400).json({ error: err.message });
    }

    return next(err);
  }
});

module.exports = router;
