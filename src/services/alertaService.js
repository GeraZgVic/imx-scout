/**
 * services/alertaService.js
 * Detecta cambios entre el último y penúltimo registro de cada producto
 * y crea alertas en la base de datos cuando corresponde.
 *
 * Se ejecuta automáticamente al final de cada scraping exitoso.
 * Los fallos en este servicio no interrumpen la respuesta al cliente.
 *
 * Tipos de alerta:
 *   - precio_cambio:        el precio cambió entre registros
 *   - disponibilidad_cambio: el envío cambió entre registros
 */

const logger = require("../utils/logger");
const prisma = require("../lib/prisma");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Obtiene los dos últimos registros exitosos de un producto.
 * Necesitamos dos para poder comparar actual vs anterior.
 *
 * @param {number} productoId
 * @returns {Promise<RegistroPrecio[]>} Array de 0, 1 o 2 registros (más reciente primero)
 */
async function obtenerUltimosRegistros(productoId) {
  return prisma.registroPrecio.findMany({
    where: {
      productoId,
      status: "ok",
    },
    orderBy: { timestamp: "desc" },
    take: 2,
  });
}

/**
 * Crea una alerta en la base de datos.
 *
 * @param {number} productoId
 * @param {"precio_cambio"|"disponibilidad_cambio"} tipo
 * @param {string} valorAnterior
 * @param {string} valorNuevo
 */
async function crearAlerta(productoId, tipo, valorAnterior, valorNuevo) {
  await prisma.alerta.create({
    data: {
      productoId,
      tipo,
      valor_anterior: valorAnterior,
      valor_nuevo:    valorNuevo,
      leida:          false,
    },
  });

  logger.info(
    { productoId, tipo, valorAnterior, valorNuevo },
    "alerta_creada"
  );
}

// ─── Comparador principal ─────────────────────────────────────────────────────

/**
 * Compara dos registros y crea alertas si detecta cambios.
 *
 * @param {number} productoId
 * @param {object} actual   - Registro más reciente
 * @param {object} anterior - Registro previo
 */
async function compararYAlertar(productoId, actual, anterior) {

  // Comparar precio
  if (
    actual.precio !== null &&
    anterior.precio !== null &&
    actual.precio !== anterior.precio
  ) {
    await crearAlerta(
      productoId,
      "precio_cambio",
      anterior.precio,
      actual.precio
    );
  }

  // Comparar disponibilidad / envío
  if (
    actual.envio !== null &&
    anterior.envio !== null &&
    actual.envio !== anterior.envio
  ) {
    await crearAlerta(
      productoId,
      "disponibilidad_cambio",
      anterior.envio,
      actual.envio
    );
  }
}

// ─── Entrada principal ────────────────────────────────────────────────────────

/**
 * Detecta cambios y genera alertas para una lista de productos.
 * Se llama al final de cada ejecución de scraping.
 *
 * @param {number[]} productoIds - IDs de productos procesados en el scraping
 */
async function detectarYCrearAlertas(productoIds) {
  logger.info({ total: productoIds.length }, "alertas_verificando");

  for (const productoId of productoIds) {
    try {
      const registros = await obtenerUltimosRegistros(productoId);

      // Necesitamos al menos 2 registros para comparar
      if (registros.length < 2) continue;

      const [actual, anterior] = registros;
      await compararYAlertar(productoId, actual, anterior);

    } catch (err) {
      // Un error en un producto no detiene la verificación de los demás
      logger.warn({ productoId, err: err.message }, "alertas_error_producto");
    }
  }

  logger.info({ total: productoIds.length }, "alertas_verificacion_completa");
}

module.exports = { detectarYCrearAlertas };
