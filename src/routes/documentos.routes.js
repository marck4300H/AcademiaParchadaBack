// src/routes/documentos.routes.js
import express from 'express';
import { uploadSingle } from '../middlewares/uploadMemory.js';
import { verifyToken } from '../utils/jwt.js';
import { uploadDocumentoClasePersonalizada } from '../controllers/documentosController.js';

const router = express.Router();

/**
 * Auth opcional (igual a pagos):
 * Si viene token válido => req.user; si no => req.user = null
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
      req.user = { id: decoded.id, email: decoded.email, rol: decoded.rol };
      return next();
    } catch {
      req.user = null;
      return next();
    }
  } catch (e) {
    req.user = null;
    return next();
  }
};

/**
 * POST /api/documentos/clase-personalizada
 * multipart/form-data:
 * - documento: File (requerido)
 */
router.post(
  '/clase-personalizada',
  optionalAuth,
  uploadSingle('documento'),
  uploadDocumentoClasePersonalizada
);

export default router;
