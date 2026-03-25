const express = require("express");

const prisma = require("../../lib/prisma");
const { buildAmazonUrl, detectPlatform, isAsin } = require("../../processors/urlProcessor");

const router = express.Router();

function normalizeProductInput(body) {
  const asinValue = typeof body?.asin === "string" ? body.asin.trim().toUpperCase() : "";
  const urlValue = typeof body?.url === "string" ? body.url.trim() : "";

  if (!asinValue && !urlValue) {
    return { error: "Se requiere req.body.url o req.body.asin." };
  }

  if (asinValue) {
    if (!isAsin(asinValue)) {
      return { error: "El ASIN debe tener 10 caracteres alfanumericos." };
    }

    return {
      asin: asinValue,
      plataforma: "amazon",
      url: buildAmazonUrl(asinValue),
    };
  }

  const plataforma = detectPlatform(urlValue);
  if (plataforma === "unsupported") {
    return { error: "La URL no corresponde a una plataforma soportada." };
  }

  const amazonAsinMatch = plataforma === "amazon"
    ? urlValue.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)
    : null;

  return {
    asin: amazonAsinMatch ? amazonAsinMatch[1].toUpperCase() : null,
    plataforma,
    url: urlValue,
  };
}

router.get("/", async (_req, res, next) => {
  try {
    const productos = await prisma.producto.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        registros: {
          orderBy: { timestamp: "desc" },
          take: 1,
          select: { timestamp: true, status: true },
        },
      },
    });

    return res.json({
      items: productos.map((producto) => ({
        ...producto,
        ultimoRegistro: producto.registros[0] || null,
        registros: undefined,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  const normalized = normalizeProductInput(req.body);

  if (normalized.error) {
    return res.status(400).json({ error: normalized.error });
  }

  try {
    const producto = await prisma.producto.create({
      data: {
        url: normalized.url,
        asin: normalized.asin,
        plataforma: normalized.plataforma,
      },
    });

    return res.status(201).json(producto);
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un producto registrado con esa URL." });
    }

    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "El id debe ser un entero positivo." });
  }

  if (typeof req.body?.prioritario !== "boolean") {
    return res.status(400).json({ error: "Se requiere req.body.prioritario como boolean." });
  }

  try {
    const producto = await prisma.producto.update({
      where: { id },
      data: { prioritario: req.body.prioritario },
    });

    return res.json(producto);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Producto no encontrado." });
    }

    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "El id debe ser un entero positivo." });
  }

  try {
    await prisma.producto.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Producto no encontrado." });
    }

    return next(error);
  }
});

router.get("/:id/historial", async (req, res, next) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "El id debe ser un entero positivo." });
  }

  try {
    const producto = await prisma.producto.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!producto) {
      return res.status(404).json({ error: "Producto no encontrado." });
    }

    const historial = await prisma.registroPrecio.findMany({
      where: { productoId: id },
      orderBy: { timestamp: "desc" },
    });

    return res.json({ items: historial });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
