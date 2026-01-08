// src/routes/sesiones.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { listarSesionesPendientesLink, asignarLinkMeet } from '../controllers/sesionesController.js';

const router = express.Router();

/**
 * CU-050
 * GET /api/sesiones/pendientes
 * Lista sesiones programadas sin link_meet
 */
router.get(
  '/pendientes',
  authenticate,
  authorize('administrador', 'profesor'),
  listarSesionesPendientesLink
);

/**
 * CU-050
 * PUT /api/sesiones/:sesionId/meet
 * Body: { link_meet }
 */
router.put(
  '/:sesionId/meet',
  authenticate,
  authorize('administrador', 'profesor'),
  asignarLinkMeet
);

export default router;
