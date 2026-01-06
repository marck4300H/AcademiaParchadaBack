// src/routes/profesorAsignaturas.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { getMisAsignaturas, addAsignatura, removeAsignatura } from '../controllers/profesorAsignaturasController.js';

const router = express.Router();

router.get(
  '/',
  authenticate,
  authorize('profesor'),
  getMisAsignaturas
);

router.post(
  '/:asignaturaId',
  authenticate,
  authorize('profesor'),
  addAsignatura
);

router.delete(
  '/:asignaturaId',
  authenticate,
  authorize('profesor'),
  removeAsignatura
);

export default router;
