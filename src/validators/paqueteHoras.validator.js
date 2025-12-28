import { body, param } from 'express-validator';

export const validarComprarPaquete = [
  body('clase_personalizada_id')
    .isUUID()
    .withMessage('El ID de la clase debe ser un UUID válido'),
  
  body('cantidad_horas')
    .isInt({ min: 1, max: 20 })
    .withMessage('La cantidad de horas debe ser entre 1 y 20'),
  
  body('estudiante')
    .optional()
    .isObject()
    .withMessage('Los datos del estudiante deben ser un objeto'),
  
  body('estudiante.email')
    .optional()
    .isEmail()
    .withMessage('Email inválido'),
  
  body('estudiante.nombre')
    .optional()
    .notEmpty()
    .withMessage('El nombre es requerido'),
  
  body('estudiante.apellido')
    .optional()
    .notEmpty()
    .withMessage('El apellido es requerido'),
  
  body('estudiante.password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
  
  body('estudiante.telefono')
    .optional()
    .matches(/^\+?[0-9]{10,15}$/)
    .withMessage('Formato de teléfono inválido')
];

export const validarAgendarSesion = [
  param('compra_id')
    .isUUID()
    .withMessage('El ID de la compra debe ser un UUID válido'),
  
  body('fecha_hora')
    .isISO8601()
    .withMessage('Formato de fecha inválido. Usa ISO 8601 (YYYY-MM-DDTHH:MM:SS±HH:MM)'),
  
  body('duracion_horas')
    .isInt({ min: 1, max: 8 })
    .withMessage('La duración debe ser entre 1 y 8 horas'),
  
  body('descripcion_estudiante')
    .optional()
    .isString()
    .withMessage('La descripción debe ser texto')
];
