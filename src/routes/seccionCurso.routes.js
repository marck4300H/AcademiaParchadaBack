// src/routes/seccionCurso.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { uploadSingle } from '../middlewares/uploadMemory.js';

import {
  crearSeccionCurso,
  listarSeccionesCurso,
  editarSeccionCurso,
  eliminarSeccionCurso
} from '../controllers/seccionCursoController.js';

const router = express.Router();

/**
 * Crear sección (Admin)
 * POST /api/cursos/:cursoId/secciones
 * multipart/form-data: video (file opcional), titulo (string), descripcion (string), orden (int)
 */
router.post(
  '/:cursoId/secciones',
  authenticate,
  authorize('administrador'),
  uploadSingle('video'),
  crearSeccionCurso
);

/**
 * Listar secciones (Estudiante/Admin/Profesor)
 * GET /api/cursos/:cursoId/secciones
 *
 * Estudiante: requiere inscripción en inscripcion_curso (se valida en controller)
 */
router.get(
  '/:cursoId/secciones',
  authenticate,
  authorize('estudiante', 'administrador', 'profesor'),
  listarSeccionesCurso
);

/**
 * Editar sección (Admin)
 * PUT /api/cursos/:cursoId/secciones/:seccionId
 * multipart/form-data opcional: video (file), titulo, descripcion, orden
 */
router.put(
  '/:cursoId/secciones/:seccionId',
  authenticate,
  authorize('administrador'),
  uploadSingle('video'),
  editarSeccionCurso
);

/**
 * Eliminar sección (Admin)
 * DELETE /api/cursos/:cursoId/secciones/:seccionId
 */
router.delete(
  '/:cursoId/secciones/:seccionId',
  authenticate,
  authorize('administrador'),
  eliminarSeccionCurso
);

export default router;
