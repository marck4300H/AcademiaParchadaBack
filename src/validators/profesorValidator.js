import { body, param, query, validationResult } from 'express-validator';


/**
 * CU-009: Validadores para crear profesor
 */
export const createProfesorValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('El email es obligatorio')
    .isEmail()
    .withMessage('Debe ser un email válido')
    .normalizeEmail(),
  
  body('nombre')
    .trim()
    .notEmpty()
    .withMessage('El nombre es obligatorio')
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  
  body('apellido')
    .trim()
    .notEmpty()
    .withMessage('El apellido es obligatorio')
    .isLength({ min: 2, max: 100 })
    .withMessage('El apellido debe tener entre 2 y 100 caracteres'),
  
  body('telefono')
    .optional()
    .trim()
    .isLength({ min: 7, max: 20 })
    .withMessage('El teléfono debe tener entre 7 y 20 caracteres'),
  
  body('asignaturas')
    .isArray({ min: 1 })
    .withMessage('Debe seleccionar al menos una asignatura')
    .custom((asignaturas) => {
      // Verificar que todos los elementos sean UUIDs válidos
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const allValid = asignaturas.every(id => uuidRegex.test(id));
      if (!allValid) {
        throw new Error('Todos los IDs de asignaturas deben ser UUIDs válidos');
      }
      return true;
    })
];

/**
 * CU-011: Validadores para editar profesor
 */
export const updateProfesorValidator = [
  param('id')
    .isUUID()
    .withMessage('ID de profesor inválido'),
  
  body('nombre')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  
  body('apellido')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El apellido debe tener entre 2 y 100 caracteres'),
  
  body('telefono')
    .optional()
    .trim()
    .isLength({ min: 7, max: 20 })
    .withMessage('El teléfono debe tener entre 7 y 20 caracteres'),
  
  body('asignaturas')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Si se envían asignaturas, debe ser al menos una')
    .custom((asignaturas) => {
      if (asignaturas && asignaturas.length > 0) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const allValid = asignaturas.every(id => uuidRegex.test(id));
        if (!allValid) {
          throw new Error('Todos los IDs de asignaturas deben ser UUIDs válidos');
        }
      }
      return true;
    })
];

/**
 * CU-012: Validador para eliminar/obtener profesor por ID
 */
export const idProfesorValidator = [
  param('id')
    .isUUID()
    .withMessage('ID de profesor inválido')
];

/**
 * Validadores para paginación en listado
 */
export const listProfesoresValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La página debe ser un número entero mayor a 0'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El límite debe ser un número entre 1 y 100')
];

/**
 * Función auxiliar para validar (puedes usar handleValidationErrors del middleware)
 */
export const validateProfesor = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};
