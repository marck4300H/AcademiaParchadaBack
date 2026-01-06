// src/routes/estudiante.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { getMisCursos, getMisClases } from '../controllers/estudianteController.js';

const router = express.Router();

/**
 * CU-034: Mis cursos (estudiante)
 * GET /api/estudiante/cursos
 */
router.get(
  '/cursos',
  authenticate,
  authorize('estudiante'),
  getMisCursos
);

/**
 * CU-036: Mis clases (estudiante)
 * GET /api/estudiante/clases
 */
router.get(
  '/clases',
  authenticate,
  authorize('estudiante'),
  getMisClases
);

export default router;
