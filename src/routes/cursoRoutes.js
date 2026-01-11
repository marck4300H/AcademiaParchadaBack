// src/routes/cursoRoutes.js
import express from 'express';
import {
  createCurso,
  listCursos,
  getCursoById,
  updateCurso,
  deleteCurso
} from '../controllers/cursoController.js';

import { authenticate, authorize } from '../middlewares/auth.js';
import { uploadSingle } from '../middlewares/uploadMemory.js';

const router = express.Router();

/**
 * POST /api/cursos
 * Admin
 * Ahora acepta multipart/form-data opcional con:
 * - image: File (opcional)
 * y los campos del curso como Text.
 * También sigue funcionando con JSON (sin archivo).
 */
router.post(
  '/',
  authenticate,
  authorize('administrador'),
  uploadSingle('image'), // opcional
  createCurso
);

router.get('/', listCursos);

router.get('/:id', getCursoById);

router.put('/:id', authenticate, authorize('administrador'), updateCurso);

router.delete('/:id', authenticate, authorize('administrador'), deleteCurso);

export default router;
