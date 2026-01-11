// src/routes/cursoRoutes.js
import express from 'express';
import {
  createCurso,
  listCursos,
  getCursoById,
  updateCurso,
  deleteCurso,
  buscarCursos
} from '../controllers/cursoController.js';

import { authenticate, authorize } from '../middlewares/auth.js';
import { uploadSingle } from '../middlewares/uploadMemory.js';

const router = express.Router();

/**
 * POST /api/cursos
 * Admin
 * multipart/form-data opcional:
 * - image: File (opcional)
 */
router.post(
  '/',
  authenticate,
  authorize('administrador'),
  uploadSingle('image'),
  createCurso
);

router.get('/', listCursos);

/**
 * CU-059: Buscar cursos
 * GET /api/cursos/buscar?q=matematicas
 */
router.get('/buscar', buscarCursos);

router.get('/:id', getCursoById);

router.put('/:id', authenticate, authorize('administrador'), updateCurso);

router.delete('/:id', authenticate, authorize('administrador'), deleteCurso);

export default router;
