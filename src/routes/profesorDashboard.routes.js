// src/routes/profesorDashboard.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import {
  getMisClasesProfesor,
  getMisCursosProfesor
} from '../controllers/profesorDashboardController.js';

const router = express.Router();

/**
 * CU-040: Mis clases asignadas (Profesor)
 * GET /api/profesor/clases
 */
router.get(
  '/clases',
  authenticate,
  authorize('profesor'),
  getMisClasesProfesor
);

/**
 * CU-041: Mis cursos asignados (Profesor)
 * GET /api/profesor/cursos
 */
router.get(
  '/cursos',
  authenticate,
  authorize('profesor'),
  getMisCursosProfesor
);

export default router;
