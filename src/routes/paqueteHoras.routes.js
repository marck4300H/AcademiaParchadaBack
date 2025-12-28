import express from 'express';
import {
  comprarPaqueteHoras,
  agendarSesion,
  obtenerPaquete,
  listarSesionesPaquete
} from '../controllers/paqueteHorasController.js';
import {
  validarComprarPaquete,
  validarAgendarSesion
} from '../validators/paqueteHoras.validator.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validationMiddleware.js';

const router = express.Router();

/**
 * POST /api/paquetes-horas
 * Comprar un paquete de horas
 * PÚBLICO (puede crear cuenta al comprar)
 */
router.post(
  '/',
  validarComprarPaquete,
  handleValidationErrors,
  comprarPaqueteHoras
);

/**
 * POST /api/paquetes-horas/:compra_id/agendar
 * Agendar una sesión usando horas del paquete
 * ⭐ REQUIERE AUTENTICACIÓN
 */
router.post(
  '/:compra_id/agendar',
  authenticate,  // ⭐ AGREGAR ESTO
  validarAgendarSesion,
  handleValidationErrors,
  agendarSesion
);

/**
 * GET /api/paquetes-horas/:compra_id
 * Obtener detalles del paquete y sesiones agendadas
 * REQUIERE AUTENTICACIÓN
 */
router.get(
  '/:compra_id',
  authenticate,
  obtenerPaquete
);

/**
 * GET /api/paquetes-horas/:compra_id/sesiones
 * Listar todas las sesiones de un paquete
 * REQUIERE AUTENTICACIÓN
 */
router.get(
  '/:compra_id/sesiones',
  authenticate,
  listarSesionesPaquete
);

export default router;
