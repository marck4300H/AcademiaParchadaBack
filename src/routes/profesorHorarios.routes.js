// src/routes/profesorHorarios.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { getMisHorarios, createMisHorarios, deleteMiFranja } from '../controllers/profesorHorariosController.js';

const router = express.Router();

router.get(
  '/',
  authenticate,
  authorize('profesor'),
  getMisHorarios
);

router.post(
  '/',
  authenticate,
  authorize('profesor'),
  createMisHorarios
);

router.delete(
  '/:id',
  authenticate,
  authorize('profesor'),
  deleteMiFranja
);

export default router;
