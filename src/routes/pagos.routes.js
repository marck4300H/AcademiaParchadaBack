import express from 'express';

import {
  crearCheckoutMercadoPago,
  webhookMercadoPago,
  obtenerEstadoCompra
} from '../controllers/pagosMercadoPagoController.js';

import { verifyToken } from '../utils/jwt.js';

const router = express.Router();

/**
 * Middleware opcional:
 * - Si viene Authorization: Bearer <token> válido => setea req.user
 * - Si no viene token o viene inválido => req.user = null y continúa
 *
 * Esto permite comprar:
 * - Registrado (con token)
 * - No registrado (sin token, enviando estudiante{...} en el body)
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = verifyToken(token);
      req.user = {
        id: decoded.id,
        email: decoded.email,
        rol: decoded.rol
      };
    } catch (error) {
      // Token inválido/expirado => se trata como no autenticado
      req.user = null;
    }

    return next();
  } catch (error) {
    console.error('Error en optionalAuth (pagos):', error);
    req.user = null;
    return next();
  }
};

/**
 * Crear preferencia / checkout (Checkout Pro)
 * POST /api/pagos/mercadopago/checkout
 *
 * Acepta:
 * - Usuario autenticado (Authorization Bearer TOKEN)
 * - O usuario no autenticado (enviar estudiante {email,password,nombre,apellido,telefono?})
 */
router.post('/mercadopago/checkout', optionalAuth, crearCheckoutMercadoPago);

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
