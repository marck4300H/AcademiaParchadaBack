// src/routes/materialEstudio.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { uploadSingle } from '../middlewares/uploadMemory.js';
import { createMaterialEstudio, listMaterialEstudio, deleteMaterialEstudio } from '../controllers/materialEstudioController.js';

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
// (por ahora protegido para evitar exposición; luego se puede abrir con control por compra)
router.get(
  '/',
  authenticate,
  authorize('administrador', 'profesor', 'estudiante'),
  listMaterialEstudio
);

// Eliminar material (admin/profesor)
router.delete(
  '/:id',
  authenticate,
  authorize('administrador', 'profesor'),
  deleteMaterialEstudio
);

export default router;
