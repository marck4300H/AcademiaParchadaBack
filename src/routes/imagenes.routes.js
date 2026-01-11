// src/routes/imagenes.routes.js
import express from 'express';

import { authenticate, authorize } from '../middlewares/auth.js';
import { uploadSingle } from '../middlewares/uploadMemory.js';

import {
  uploadCursoImage,
  uploadClaseImage
} from '../controllers/imagenesController.js';

const router = express.Router();

/**
 * PUT /api/imagenes/cursos/:id
 * Admin: actualizar imagen de curso
 * multipart/form-data: image
 */
router.put(
  '/cursos/:id',
  authenticate,
  authorize('administrador'),
  uploadSingle('image'),
  uploadCursoImage
);

/**
 * PUT /api/imagenes/clases-personalizadas/:id
 * Admin: actualizar imagen de clase personalizada
 * multipart/form-data: image
 */
router.put(
  '/clases-personalizadas/:id',
  authenticate,
  authorize('administrador'),
  uploadSingle('image'),
  uploadClaseImage
);

export default router;
