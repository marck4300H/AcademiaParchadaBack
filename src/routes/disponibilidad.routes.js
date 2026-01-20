// src/routes/disponibilidad.routes.js

import express from 'express';
import { obtenerFranjasDisponibles } from '../controllers/disponibilidadController.js';

const router = express.Router();

/**
 * GET /api/disponibilidad/franjas
 * Obtiene franjas horarias disponibles para una fecha específica
 * PÚBLICO - No requiere autenticación
 */
router.get('/franjas', obtenerFranjasDisponibles);

export default router;
