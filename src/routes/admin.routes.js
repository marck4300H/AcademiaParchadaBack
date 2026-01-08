// src/routes/admin.routes.js
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { getContabilidad } from '../controllers/adminContabilidadController.js';
import { getMetricasAdmin } from '../controllers/adminMetricasController.js';
import { createIngresoAdicional } from '../controllers/adminIngresosAdicionalesController.js';
import { getComprasAdmin } from '../controllers/adminComprasController.js';

const router = express.Router();

/**
 * CU-047
 * GET /api/admin/contabilidad?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
 */
router.get(
  '/contabilidad',
  authenticate,
  authorize('administrador'),
  getContabilidad
);

/**
 * CU-046
 * GET /api/admin/metricas?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
 * (fechaInicio/fechaFin opcionales; si no vienen, usa últimos 30 días)
 */
router.get(
  '/metricas',
  authenticate,
  authorize('administrador'),
  getMetricasAdmin
);

/**
 * CU-048
 * POST /api/admin/ingresos-adicionales
 * Body: { descripcion, monto, fecha_ingreso }
 */
router.post(
  '/ingresos-adicionales',
  authenticate,
  authorize('administrador'),
  createIngresoAdicional
);

/**
 * CU-049
 * GET /api/admin/compras?estado_pago=&tipo_compra=&page=&limit=&fechaInicio=&fechaFin=
 */
router.get(
  '/compras',
  authenticate,
  authorize('administrador'),
  getComprasAdmin
);

export default router;
