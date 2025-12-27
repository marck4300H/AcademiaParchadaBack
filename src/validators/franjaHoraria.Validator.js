import { body, param, query } from 'express-validator';

/**
 * Validador para crear franja horaria
 */
export const createFranjaValidator = [
  body('profesor_id')
    .trim()
    .notEmpty()
    .withMessage('El ID del profesor es obligatorio')
    .isUUID()
    .withMessage('El ID del profesor debe ser un UUID válido'),
  
  body('dia_semana')
    .trim()
    .notEmpty()
    .withMessage('El día de la semana es obligatorio')
    .isIn(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'])
    .withMessage('Día de semana inválido'),
  
  body('hora_inicio')
    .trim()
    .notEmpty()
    .withMessage('La hora de inicio es obligatoria')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('La hora de inicio debe tener formato HH:MM (24 horas)'),
  
  body('hora_fin')
    .trim()
    .notEmpty()
    .withMessage('La hora de fin es obligatoria')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('La hora de fin debe tener formato HH:MM (24 horas)')
    .custom((value, { req }) => {
      const [horaInicio, minInicio] = req.body.hora_inicio.split(':').map(Number);
      const [horaFin, minFin] = value.split(':').map(Number);
      
      const minutosInicio = horaInicio * 60 + minInicio;
      const minutosFin = horaFin * 60 + minFin;
      
      if (minutosFin <= minutosInicio) {
        throw new Error('La hora de fin debe ser posterior a la hora de inicio');
      }
      
      return true;
    })
];

/**
 * Validador para actualizar franja horaria
 */
export const updateFranjaValidator = [
  param('id')
    .trim()
    .isUUID()
    .withMessage('ID de franja horaria inválido'),
  
  body('dia_semana')
    .optional()
    .trim()
    .isIn(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'])
    .withMessage('Día de semana inválido'),
  
  body('hora_inicio')
    .optional()
    .trim()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('La hora de inicio debe tener formato HH:MM (24 horas)'),
  
  body('hora_fin')
    .optional()
    .trim()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('La hora de fin debe tener formato HH:MM (24 horas)')
];

/**
 * Validador para eliminar franja horaria
 */
export const deleteFranjaValidator = [
  param('id')
    .trim()
    .isUUID()
    .withMessage('ID de franja horaria inválido')
];

/**
 * Validador para listar franjas de un profesor
 */
export const listFranjasByProfesorValidator = [
  param('profesorId')
    .trim()
    .isUUID()
    .withMessage('ID de profesor inválido'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La página debe ser un número entero mayor a 0')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El límite debe estar entre 1 y 100')
    .toInt()
];
