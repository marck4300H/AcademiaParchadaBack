import { body } from 'express-validator';

export const validarComprarPaquete = [
  body('clase_personalizada_id')
    .notEmpty()
    .withMessage('clase_personalizada_id es requerido')
    .isUUID()
    .withMessage('clase_personalizada_id debe ser un UUID válido'),

  body('cantidad_horas')
    .notEmpty()
    .withMessage('cantidad_horas es requerido')
    .isInt({ min: 1 })
    .withMessage('cantidad_horas debe ser un entero mayor a 0'),

  // Validaciones de estudiante (si no hay token)
  body('estudiante.email')
    .optional()
    .isEmail()
    .withMessage('email debe ser válido'),

  body('estudiante.nombre')
    .optional()
    .notEmpty()
    .withMessage('nombre del estudiante es requerido'),

  body('estudiante.apellido')
    .optional()
    .notEmpty()
    .withMessage('apellido del estudiante es requerido'),

  body('estudiante.password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('password debe tener al menos 6 caracteres'),

  body('estudiante.telefono')
    .optional()
    .isMobilePhone()
    .withMessage('telefono debe ser válido')
];

export const validarAgendarSesion = [
  body('fecha_hora')
    .notEmpty()
    .withMessage('fecha_hora es requerida')
    .isISO8601()
    .withMessage('fecha_hora debe estar en formato ISO 8601'),

  body('duracion_horas')
    .notEmpty()
    .withMessage('duracion_horas es requerida')
    .isInt({ min: 1 })
    .withMessage('duracion_horas debe ser un entero mayor a 0'),

  body('descripcion_estudiante')
    .optional()
    .isString()
    .withMessage('descripcion_estudiante debe ser texto'),

  // ← NUEVO: Validación opcional de documento_url
  body('documento_url')
    .optional()
    .isURL()
    .withMessage('documento_url debe ser una URL válida')
];
