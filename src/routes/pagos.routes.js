import express from 'express';
import {
  crearCheckoutMercadoPago,
  webhookMercadoPago,
  obtenerEstadoCompra
} from '../controllers/pagosMercadoPagoController.js';

// Si quieres proteger crearCheckout con JWT, importa tu middleware aquí:
// import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * Crear preferencia / checkout (Checkout Pro)
 * POST /api/pagos/mercadopago/checkout
 *
 * Nota: si quieres exigir login, añade middleware authenticate aquí.
 */
router.post('/mercadopago/checkout', /* authenticate, */ crearCheckoutMercadoPago);

/**
 * Webhook MercadoPago (NO requiere auth)
 * POST /api/pagos/mercadopago/webhook
 */
router.post('/mercadopago/webhook', webhookMercadoPago);

/**
 * Consultar estado de compra
 * GET /api/pagos/mercadopago/estado/:compra_id
 */
router.get('/mercadopago/estado/:compra_id', obtenerEstadoCompra);

export default router;
