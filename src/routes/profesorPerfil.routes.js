// src/routes/profesorPerfil.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { updateMiPerfilProfesor } from '../controllers/profesorPerfilController.js';

const router = express.Router();

router.put(
  '/',
  authenticate,
  authorize('profesor'),
  updateMiPerfilProfesor
);

export default router;
