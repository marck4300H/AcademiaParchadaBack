// src/routes/seccionCurso.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { uploadSingle } from '../middlewares/uploadMemory.js';
import { crearSeccionCurso, listarSeccionesCurso } from '../controllers/seccionCursoController.js';

const router = express.Router();

/**
 * CU-022 / CU-056
 * POST /api/cursos/:cursoId/secciones (Admin)
 * multipart/form-data: video (file), titulo (string), descripcion (string), orden (int)
 */
router.post(
  '/:cursoId/secciones',
  authenticate,
  authorize('administrador'),
  uploadSingle('video'),
  crearSeccionCurso
);

/**
 * GET /api/cursos/:cursoId/secciones
 */
router.get('/:cursoId/secciones', listarSeccionesCurso);

export default router;
