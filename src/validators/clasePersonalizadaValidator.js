// src/validators/clasePersonalizadaValidator.js

import { body, param, query } from 'express-validator';

export const createClasePersonalizadaValidator = [
  body('asignatura_id')
    .notEmpty().withMessage('El ID de la asignatura es obligatorio')
    .isUUID().withMessage('El ID de la asignatura debe ser un UUID válido'),
  
  body('precio')
    .notEmpty().withMessage('El precio es obligatorio')
    .isFloat({ min: 0.01 }).withMessage('El precio debe ser mayor a 0'),
  
  body('duracion_horas')
    .notEmpty().withMessage('La duración en horas es obligatoria')
    .isInt({ min: 1 }).withMessage('La duración debe ser al menos 1 hora'),
  
  body('tipo_pago_profesor')
    .notEmpty().withMessage('El tipo de pago al profesor es obligatorio')
    .isIn(['porcentaje', 'monto_fijo']).withMessage('El tipo de pago debe ser "porcentaje" o "monto_fijo"'),
  
  body('valor_pago_profesor')
    .notEmpty().withMessage('El valor de pago al profesor es obligatorio')
    .isFloat({ min: 0 }).withMessage('El valor de pago debe ser mayor o igual a 0')
    .custom((value, { req }) => {
      if (req.body.tipo_pago_profesor === 'porcentaje' && (value < 0 || value > 100)) {
        throw new Error('El porcentaje debe estar entre 0 y 100');
      }
      return true;
    })
];

export const updateClasePersonalizadaValidator = [
  param('id')
    .isUUID().withMessage('El ID debe ser un UUID válido'),
  
  body('asignatura_id')
    .optional()
    .isUUID().withMessage('El ID de la asignatura debe ser un UUID válido'),
  
  body('precio')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('El precio debe ser mayor a 0'),
  
  body('duracion_horas')
    .optional()
    .isInt({ min: 1 }).withMessage('La duración debe ser al menos 1 hora'),
  
  body('tipo_pago_profesor')
    .optional()
    .isIn(['porcentaje', 'monto_fijo']).withMessage('El tipo de pago debe ser "porcentaje" o "monto_fijo"'),
  
  body('valor_pago_profesor')
    .optional()
    .isFloat({ min: 0 }).withMessage('El valor de pago debe ser mayor o igual a 0')
];

export const getClasePersonalizadaValidator = [
  param('id')
    .isUUID().withMessage('El ID debe ser un UUID válido')
];

export const listClasesPersonalizadasValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('La página debe ser un número mayor a 0'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),
  
  query('asignatura_id')
    .optional()
    .isUUID().withMessage('El ID de asignatura debe ser un UUID válido')
];
