import { verifyToken } from '../utils/jwt.js';

/**
 * CU-065: Middleware de Autenticación JWT
 * Verifica que el usuario tenga un token válido
 */
export const authenticate = async (req, res, next) => {
  try {
    // 1. Obtener token del header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No se proporcionó token de autenticación'
      });
    }

    const token = authHeader.split(' ')[1];

    // 2. Verificar y decodificar token
    try {
      const decoded = verifyToken(token);
      
      // 3. Agregar datos del usuario al request
      req.user = {
        id: decoded.id,
        email: decoded.email,
        rol: decoded.rol
      };

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message || 'Token inválido o expirado'
      });
    }

  } catch (error) {
    console.error('Error en middleware de autenticación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar autenticación',
      error: error.message
    });
  }
};

/**
 * CU-066: Middleware de Autorización por Rol
 * Verifica que el usuario tenga uno de los roles permitidos
 * @param {Array<string>} rolesPermitidos - Array de roles permitidos (ej: ['admin', 'profesor'])
 */
export const authorize = (...rolesPermitidos) => {
  return (req, res, next) => {
    // Verificar que el usuario esté autenticado (debe usarse después de authenticate)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    // Verificar que el rol del usuario esté en los roles permitidos
    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a este recurso',
        requiredRoles: rolesPermitidos,
        yourRole: req.user.rol
      });
    }

    next();
  };
};
