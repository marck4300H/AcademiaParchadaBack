// src/routes/estudiante.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { getMisCursos, getMisClases } from '../controllers/estudianteController.js';
import {
  getMiPerfilEstudiante,
  updateMiPerfilEstudiante,
  deleteMiCuentaEstudiantePreservandoCompras
} from '../controllers/estudiantePerfilController.js';

const router = express.Router();

// CU-034: Mis cursos (estudiante)
router.get('/cursos', authenticate, authorize('estudiante'), getMisCursos);

// CU-036: Mis clases (estudiante)
router.get('/clases', authenticate, authorize('estudiante'), getMisClases);

// Perfil (ver)
router.get('/perfil', authenticate, authorize('estudiante'), getMiPerfilEstudiante);

// Perfil (editar)
router.put('/perfil', authenticate, authorize('estudiante'), updateMiPerfilEstudiante);

// “Eliminar cuenta” preservando compras (ver explicación en controller)
router.delete('/cuenta', authenticate, authorize('estudiante'), deleteMiCuentaEstudiantePreservandoCompras);

export default router;
