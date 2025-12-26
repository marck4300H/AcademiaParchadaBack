import express from 'express';
import {
  createProfesor,
  listProfesores,
  getProfesorById,
  updateProfesor,
  deleteProfesor
} from '../controllers/profesorController.js';
import {
  createProfesorValidator,
  updateProfesorValidator,
  idProfesorValidator,
  listProfesoresValidator,
  validateProfesor
} from '../validators/profesorValidator.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = express.Router();

/**
 * CU-009: Crear profesor
 * POST /api/profesores
 * Acceso: admin
 */
router.post(
  '/',
  authenticate,
  authorize('administrador'),
  createProfesorValidator,
  validateProfesor,
  createProfesor
);

/**
 * CU-010: Listar profesores con paginación
 * GET /api/profesores?page=1&limit=10
 * Acceso: admin
 */
router.get(
  '/',
  authenticate,
  authorize('administrador'),
  listProfesoresValidator,
  validateProfesor,
  listProfesores
);

/**
 * Obtener profesor por ID
 * GET /api/profesores/:id
 * Acceso: admin
 */
router.get(
  '/:id',
  authenticate,
  authorize('administrador'),
  idProfesorValidator,
  validateProfesor,
  getProfesorById
);

/**
 * CU-011: Editar profesor
 * PUT /api/profesores/:id
 * Acceso: admin
 */
router.put(
  '/:id',
  authenticate,
  authorize('administrador'),
  updateProfesorValidator,
  validateProfesor,
  updateProfesor
);

/**
 * CU-012: Eliminar profesor
 * DELETE /api/profesores/:id
 * Acceso: admin
 */
router.delete(
  '/:id',
  authenticate,
  authorize('administrador'),
  idProfesorValidator,
  validateProfesor,
  deleteProfesor
);

export default router;
