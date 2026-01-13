// src/routes/materialEstudio.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { uploadSingle } from '../middlewares/uploadMemory.js';
import {
  createMaterialEstudio,
  listMaterialEstudio,
  deleteMaterialEstudio,
  descargarMaterialEstudio
} from '../controllers/materialEstudioController.js';

const router = express.Router();

// Crear material (admin/profesor)
router.post(
  '/',
  authenticate,
  authorize('administrador', 'profesor'),
  uploadSingle('file'),
  createMaterialEstudio
);

// Listar material (por curso o sesión)
// protegido; y si es estudiante + curso_id, valida inscripción dentro del controller
router.get(
  '/',
  authenticate,
  authorize('administrador', 'profesor', 'estudiante'),
  listMaterialEstudio
);

// Descargar material (estudiante/admin/profesor)
router.get(
  '/:id/descargar',
  authenticate,
  authorize('administrador', 'profesor', 'estudiante'),
  descargarMaterialEstudio
);

// Eliminar material (admin/profesor)
router.delete(
  '/:id',
  authenticate,
  authorize('administrador', 'profesor'),
  deleteMaterialEstudio
);

export default router;
