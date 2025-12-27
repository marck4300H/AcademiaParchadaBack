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

const router = express.Router();

/**
 * @route   POST /api/cursos
 * @desc    Crear curso
 * @access  Administrador
 */
router.post(
  '/',
  authenticate,
  authorize('administrador'),
  createCurso
);

/**
 * @route   GET /api/cursos
 * @desc    Listar cursos
 * @access  Público
 */
router.get(
  '/',
  listCursos
);

/**
 * @route   GET /api/cursos/:id
 * @desc    Obtener curso por ID
 * @access  Público
 */
router.get(
  '/:id',
  getCursoById
);

/**
 * @route   PUT /api/cursos/:id
 * @desc    Actualizar curso
 * @access  Administrador
 */
router.put(
  '/:id',
  authenticate,
  authorize('administrador'),
  updateCurso
);

/**
 * @route   DELETE /api/cursos/:id
 * @desc    Eliminar curso
 * @access  Administrador
 */
router.delete(
  '/:id',
  authenticate,
  authorize('administrador'),
  deleteCurso
);

export default router;
