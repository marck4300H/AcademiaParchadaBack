// src/routes/clasePersonalizadaRoutes.js

import express from 'express';
import {
  createClasePersonalizada,
  listClasesPersonalizadas,
  getClasePersonalizadaById,
  updateClasePersonalizada,
  deleteClasePersonalizada
} from '../controllers/clasePersonalizadaController.js';
// ✅ CORREGIDO: Importar desde auth.js con nombres correctos
import { authenticate, authorize } from '../middlewares/auth.js';

const router = express.Router();

/**
 * @route   POST /api/clases-personalizadas
 * @desc    Crear plantilla de clase personalizada
 * @access  Administrador
 */
router.post(
  '/',
  authenticate,
  authorize('administrador'),
  createClasePersonalizada
);

/**
 * @route   GET /api/clases-personalizadas
 * @desc    Listar clases personalizadas
 * @access  Público
 */
router.get(
  '/',
  listClasesPersonalizadas
);

/**
 * @route   GET /api/clases-personalizadas/:id
 * @desc    Obtener clase personalizada por ID
 * @access  Público
 */
router.get(
  '/:id',
  getClasePersonalizadaById
);

/**
 * @route   PUT /api/clases-personalizadas/:id
 * @desc    Editar clase personalizada
 * @access  Administrador
 */
router.put(
  '/:id',
  authenticate,
  authorize('administrador'),
  updateClasePersonalizada
);

/**
 * @route   DELETE /api/clases-personalizadas/:id
 * @desc    Eliminar clase personalizada
 * @access  Administrador
 */
router.delete(
  '/:id',
  authenticate,
  authorize('administrador'),
  deleteClasePersonalizada
);

export default router;
