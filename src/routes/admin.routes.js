// src/routes/admin.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { getContabilidad } from '../controllers/adminContabilidadController.js';

const router = express.Router();

router.get(
  '/contabilidad',
  authenticate,
  authorize('administrador'),
  getContabilidad
);

export default router;
