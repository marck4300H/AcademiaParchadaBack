import express from 'express';
import {
  createAsignatura,
  listAsignaturas,
  getAsignaturaById,
  updateAsignatura,
  deleteAsignatura
} from '../controllers/asignaturaController.js';
import {
  createAsignaturaValidator,
  updateAsignaturaValidator,
  idAsignaturaValidator,
  validateAsignatura
} from '../validators/asignaturaValidator.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = express.Router();

/**
 * CU-005: Crear asignatura
 * POST /api/asignaturas
 * Acceso: admin
 */
router.post(
  '/',
  authenticate,
  authorize('administrador'),
  createAsignaturaValidator,
  validateAsignatura,
  createAsignatura
);

/**
 * CU-006: Listar asignaturas con paginación
 * GET /api/asignaturas?page=1&limit=10
 * Acceso: público (admin/profesor/estudiante)
 */
router.get('/', listAsignaturas);

/**
 * Obtener asignatura por ID
 * GET /api/asignaturas/:id
 * Acceso: público
 */
router.get(
  '/:id',
  idAsignaturaValidator,
  validateAsignatura,
  getAsignaturaById
);

/**
 * CU-007: Editar asignatura
 * PUT /api/asignaturas/:id
 * Acceso: admin
 */
router.put(
  '/:id',
  authenticate,
  authorize('administrador'),
  updateAsignaturaValidator,
  validateAsignatura,
  updateAsignatura
);

/**
 * CU-008: Eliminar asignatura
 * DELETE /api/asignaturas/:id
 * Acceso: admin
 */
router.delete(
  '/:id',
  authenticate,
  authorize('administrador'),
  idAsignaturaValidator,
  validateAsignatura,
  deleteAsignatura
);

export default router;
