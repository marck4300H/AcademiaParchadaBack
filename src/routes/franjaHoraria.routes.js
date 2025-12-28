import express from 'express';
import {
  crearFranjaHoraria,
  listarFranjasProfesor,
  eliminarFranjaHoraria,
  eliminarFranjasPorDia,
  obtenerResumenDisponibilidad
} from '../controllers/franjaHoraria.Controller.js';
import {
  validarCrearFranja,
  validarListarFranjas,
  validarEliminarFranja,
  validarEliminarFranjasPorDia
} from '../validators/franjaHoraria.Validator.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validationMiddleware.js';

const router = express.Router();

/**
 * POST /api/franjas-horarias
 * Crear franja(s) horaria(s) para un profesor
 * Divide automáticamente en bloques de 1 hora
 */
router.post(
  '/',
  authenticate,
  authorize('administrador', 'profesor'),
  validarCrearFranja,
  handleValidationErrors,
  crearFranjaHoraria
);

/**
 * GET /api/franjas-horarias/profesor/:profesor_id
 * Listar todas las franjas de un profesor
 * Query params: ?dia_semana=lunes (opcional)
 */
router.get(
  '/profesor/:profesor_id',
  validarListarFranjas,
  handleValidationErrors,
  listarFranjasProfesor
);

/**
 * GET /api/franjas-horarias/profesor/:profesor_id/resumen
 * Obtener resumen de disponibilidad (agrupa franjas consecutivas)
 */
router.get(
  '/profesor/:profesor_id/resumen',
  authenticate,
  obtenerResumenDisponibilidad
);

/**
 * DELETE /api/franjas-horarias/:id
 * Eliminar una franja horaria específica
 */
router.delete(
  '/:id',
  authenticate,
  authorize('administrador', 'profesor'),
  validarEliminarFranja,
  handleValidationErrors,
  eliminarFranjaHoraria
);

/**
 * DELETE /api/franjas-horarias/profesor/:profesor_id/dia
 * Eliminar todas las franjas de un día específico
 * Body: { "dia_semana": "lunes" }
 */
router.delete(
  '/profesor/:profesor_id/dia',
  authenticate,
  authorize('administrador', 'profesor'),
  validarEliminarFranjasPorDia,
  handleValidationErrors,
  eliminarFranjasPorDia
);

export default router;
