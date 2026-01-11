// src/routes/clasePersonalizadaRoutes.js
import express from 'express';

import {
  createClasePersonalizada,
  listClasesPersonalizadas,
  getClasePersonalizadaById,
  updateClasePersonalizada,
  deleteClasePersonalizada
} from '../controllers/clasePersonalizadaController.js';

import { authenticate, authorize } from '../middlewares/auth.js';
import { uploadSingle } from '../middlewares/uploadMemory.js';

const router = express.Router();

/**
 * POST /api/clases-personalizadas
 * Admin
 * Ahora acepta multipart/form-data opcional con:
 * - image: File (opcional)
 * y los campos como Text.
 * También sigue funcionando con JSON (sin archivo).
 */
router.post(
  '/',
  authenticate,
  authorize('administrador'),
  uploadSingle('image'), // opcional
  createClasePersonalizada
);

router.get('/', listClasesPersonalizadas);

router.get('/:id', getClasePersonalizadaById);

router.put('/:id', authenticate, authorize('administrador'), updateClasePersonalizada);

router.delete('/:id', authenticate, authorize('administrador'), deleteClasePersonalizada);

export default router;
