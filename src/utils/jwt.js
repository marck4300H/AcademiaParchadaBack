import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Genera un token JWT
 * @param {Object} payload - Datos a incluir en el token (id, email, rol)
 * @returns {string} Token JWT
 */
export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
};

/**
 * Verifica y decodifica un token JWT
 * @param {string} token - Token a verificar
 * @returns {Object} Payload decodificado
 * @throws {Error} Si el token es inválido o expiró
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expirado');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Token inválido');
    }
    throw error;
  }
};

/**
 * Decodifica un token sin verificar (útil para debugging)
 * @param {string} token - Token a decodificar
 * @returns {Object} Payload decodificado
 */
export const decodeToken = (token) => {
  return jwt.decode(token);
};
