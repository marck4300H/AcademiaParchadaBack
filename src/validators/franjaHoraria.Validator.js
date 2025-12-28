import { body, param, query } from 'express-validator';

export const validarCrearFranja = [
  body('profesor_id')
    .isUUID()
    .withMessage('El ID del profesor debe ser un UUID válido'),
  
  body('dia_semana')
    .isIn(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'])
    .withMessage('Día de la semana inválido'),
  
  body('hora_inicio')
    .matches(/^([0-1][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])$/)
    .withMessage('Formato de hora_inicio inválido. Use HH:MM:SS'),
  
  body('hora_fin')
    .matches(/^([0-1][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])$/)
    .withMessage('Formato de hora_fin inválido. Use HH:MM:SS')
];

export const validarListarFranjas = [
  param('profesor_id')
    .isUUID()
    .withMessage('El ID del profesor debe ser un UUID válido'),
  
  query('dia_semana')
    .optional()
    .isIn(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'])
    .withMessage('Día de la semana inválido')
];

export const validarEliminarFranja = [
  param('id')
    .isUUID()
    .withMessage('El ID de la franja debe ser un UUID válido')
];

export const validarEliminarFranjasPorDia = [
  param('profesor_id')
    .isUUID()
    .withMessage('El ID del profesor debe ser un UUID válido'),
  
  body('dia_semana')
    .isIn(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'])
    .withMessage('Día de la semana inválido')
];
