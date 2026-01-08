import express from 'express';
import {
  comprarCurso,
  comprarClasePersonalizada,
  listarComprasEstudiante,
  obtenerCompra,
  listarTodasCompras,
  obtenerFranjasProfesor
} from '../controllers/compraController.js';
import {
  validarComprarCurso,
  validarComprarClasePersonalizada,
  validarObtenerCompra,
  validarListarCompras
} from '../validators/compra.validator.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validationMiddleware.js';
import { verifyToken } from '../utils/jwt.js';

const router = express.Router();

/**
 * Middleware opcional para autenticación
 * Intenta autenticar pero no falla si no hay token
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No hay token, continuar sin usuario
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = verifyToken(token);
      
      // Agregar datos del usuario al request
      req.user = {
        id: decoded.id,
        email: decoded.email,
        rol: decoded.rol
      };
      
      next();
    } catch (error) {
      // Token inválido, continuar sin usuario
      req.user = null;
      next();
    }

  } catch (error) {
    console.error('Error en optionalAuth:', error);
    req.user = null;
    next();
  }
};

// ============================================
// RUTAS PÚBLICAS (sin autenticación requerida)
// ============================================

/**
 * POST /api/compras/curso
 * CU-029: Comprar curso (con o sin registro previo)
 * Acepta: usuario autenticado O datos de nuevo estudiante
 */
router.post('/curso', (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Endpoint deshabilitado. Usa /api/pagos/mercadopago/checkout'
  });
});
/**
 * POST /api/compras/clase-personalizada
 * CU-030: Comprar clase personalizada (con o sin registro previo)
 * CU-031: Asignación automática de profesor
 */
router.post('/clase-personalizada', (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Endpoint deshabilitado. Usa /api/pagos/mercadopago/checkout'
  });
});

// ============================================
// RUTAS PROTEGIDAS - ESTUDIANTE
// ============================================

/**
 * GET /api/compras/estudiante
 * Listar compras del estudiante autenticado
 */
router.get(
  '/estudiante',
  authenticate,
  authorize('estudiante'),
  listarComprasEstudiante
);

/**
 * GET /api/compras/:id
 * Obtener detalle de una compra específica
 * Acceso: Estudiante dueño o Administrador
 */
router.get(
  '/:id',
  authenticate,
  validarObtenerCompra,
  handleValidationErrors,
  obtenerCompra
);

// ============================================
// RUTAS PROTEGIDAS - ADMINISTRADOR
// ============================================

/**
 * GET /api/compras
 * Admin: Listar todas las compras con filtros
 */
router.get(
  '/',
  authenticate,
  authorize('administrador'),
  validarListarCompras,
  handleValidationErrors,
  listarTodasCompras
);

// ============================================
// RUTAS AUXILIARES
// ============================================

/**
 * GET /api/compras/profesor/:profesor_id/franjas
 * Obtener franjas horarias disponibles de un profesor
 * (Útil para el frontend al mostrar opciones de fecha/hora)
 */
router.get(
  '/profesor/:profesor_id/franjas',
  obtenerFranjasProfesor
);

export default router;
