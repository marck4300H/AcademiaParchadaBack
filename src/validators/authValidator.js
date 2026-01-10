import { body, validationResult } from 'express-validator';
import { DateTime } from 'luxon';

/**
 * Validaciones para registro de usuario
 */
export const registerValidator = [
  body('email')
    .isEmail()
    .withMessage('Debe proporcionar un email válido')
    .normalizeEmail(),

  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
    .matches(/\d/)
    .withMessage('La contraseña debe contener al menos un número'),

  body('nombre')
    .trim()
    .notEmpty()
    .withMessage('El nombre es obligatorio')
    .isLength({ min: 2 })
    .withMessage('El nombre debe tener al menos 2 caracteres'),

  body('apellido')
    .trim()
    .notEmpty()
    .withMessage('El apellido es obligatorio')
    .isLength({ min: 2 })
    .withMessage('El apellido debe tener al menos 2 caracteres'),

  body('telefono')
    .optional()
    .isMobilePhone('any')
    .withMessage('Debe proporcionar un teléfono válido'),

  // NUEVO: timezone del usuario (IANA). Ej: "America/Bogota"
  body('timezone')
    .optional()
    .isString()
    .trim()
    .custom((tz) => {
      const ok = DateTime.now().setZone(tz).isValid;
      if (!ok) throw new Error('Timezone inválido (debe ser IANA, ej: America/Bogota)');
      return true;
    }),
];

/**
 * Validaciones para login
 */
export const loginValidator = [
  body('email')
    .isEmail()
    .withMessage('Debe proporcionar un email válido')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('La contraseña es obligatoria'),
];

/**
 * Middleware para verificar si hay errores de validación
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }

  next();
};
