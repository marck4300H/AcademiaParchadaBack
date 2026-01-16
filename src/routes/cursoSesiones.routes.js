// src/routes/cursoSesiones.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';

import {
  crearSesionesCurso,
  listarSesionesCurso,
  asignarLinkMeetCursoSesion
} from '../controllers/cursoSesionesController.js';

const router = express.Router();

// POST /api/cursos/:cursoId/sesiones (Admin)
router.post(
  '/:cursoId/sesiones',
  authenticate,
  authorize('administrador'),
  crearSesionesCurso
);

// GET /api/cursos/:cursoId/sesiones (estudiante/profesor/admin)
router.get(
  '/:cursoId/sesiones',
  authenticate,
  authorize('estudiante', 'profesor', 'administrador'),
  listarSesionesCurso
);

// PUT /api/cursos/:cursoId/sesiones/:sesionId/meet (SOLO Admin)
router.put(
  '/:cursoId/sesiones/:sesionId/meet',
  authenticate,
  authorize('administrador'),
  asignarLinkMeetCursoSesion
);

export default router;
