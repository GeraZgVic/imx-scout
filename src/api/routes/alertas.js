const express = require("express");

const prisma = require("../../lib/prisma");

const router = express.Router();

router.get("/", async (_req, res, next) => {
  try {
    const alertas = await prisma.alerta.findMany({
      where: { leida: false },
      orderBy: { timestamp: "desc" },
      include: {
        producto: {
          select: {
            id: true,
            url: true,
            asin: true,
            plataforma: true,
            nombre: true,
          },
        },
      },
    });

    return res.json({ items: alertas });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/leida", async (req, res, next) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "El id debe ser un entero positivo." });
  }

  try {
    const alerta = await prisma.alerta.update({
      where: { id },
      data: { leida: true },
    });

    return res.json(alerta);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Alerta no encontrada." });
    }

    return next(error);
  }
});

module.exports = router;
