import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validationMiddleware.js';
import {
  createFranjaValidator,
  updateFranjaValidator,
  deleteFranjaValidator,
  listFranjasByProfesorValidator
} from '../validators/franjaHoraria.Validator.js';  // ✅ CORREGIDO: Validator con V mayúscula
import {
  createFranjaHoraria,
  listFranjasByProfesor,
  updateFranjaHoraria,
  deleteFranjaHoraria
} from '../controllers/franjaHoraria.Controller.js';

const router = express.Router();

/**
 * CU-013: Crear Franja Horaria
 * POST /api/franjas-horarias
 * Acceso: profesor, administrador
 * 
 */
router.post(
  '/',
  authenticate,
  authorize('profesor', 'administrador'),
  createFranjaValidator,
  handleValidationErrors,
  createFranjaHoraria
);

/**
 * CU-014: Listar Franjas Horarias de Profesor
 * GET /api/franjas-horarias/profesor/:profesorId
 * Acceso: profesor (solo propias), administrador
 */
router.get(
  '/profesor/:profesorId',
  authenticate,
  authorize('profesor', 'administrador'),
  listFranjasByProfesorValidator,
  handleValidationErrors,
  listFranjasByProfesor
);

/**
 * CU-015: Editar Franja Horaria
 * PUT /api/franjas-horarias/:id
 * Acceso: profesor (solo propias), administrador
 */
router.put(
  '/:id',
  authenticate,
  authorize('profesor', 'administrador'),
  updateFranjaValidator,
  handleValidationErrors,
  updateFranjaHoraria
);

/**
 * CU-016: Eliminar Franja Horaria
 * DELETE /api/franjas-horarias/:id
 * Acceso: profesor (solo propias), administrador
 */
router.delete(
  '/:id',
  authenticate,
  authorize('profesor', 'administrador'),
  deleteFranjaValidator,
  handleValidationErrors,
  deleteFranjaHoraria
);

export default router;