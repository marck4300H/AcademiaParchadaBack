import { body, param, query } from 'express-validator';

// Validación para comprar curso
export const validarComprarCurso = [
  body('curso_id')
    .notEmpty().withMessage('El ID del curso es obligatorio')
    .isUUID().withMessage('El ID del curso debe ser un UUID válido'),

  // Si no está autenticado, debe enviar datos de estudiante
  body('estudiante.email')
    .optional()
    .isEmail().withMessage('Email inválido'),
  
  body('estudiante.nombre')
    .optional()
    .notEmpty().withMessage('El nombre es obligatorio'),
  
  body('estudiante.apellido')
    .optional()
    .notEmpty().withMessage('El apellido es obligatorio'),
  
  body('estudiante.password')
    .optional()
    .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  
  body('estudiante.telefono')
    .optional()
];

// Validación para comprar clase personalizada
export const validarComprarClasePersonalizada = [
  body('clase_personalizada_id')
    .notEmpty().withMessage('El ID de la clase personalizada es obligatorio')
    .isUUID().withMessage('El ID debe ser un UUID válido'),

  body('descripcion_estudiante')
    .notEmpty().withMessage('La descripción de lo que necesitas es obligatoria')
    .isLength({ min: 10 }).withMessage('La descripción debe tener al menos 10 caracteres')
    .isLength({ max: 1000 }).withMessage('La descripción no puede exceder 1000 caracteres'),

  body('fecha_hora')
    .notEmpty().withMessage('La fecha y hora de la clase es obligatoria')
    .isISO8601().withMessage('La fecha debe estar en formato ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)')
    .custom((value) => {
      const fechaClase = new Date(value);
      const ahora = new Date();
      
      if (fechaClase <= ahora) {
        throw new Error('La fecha de la clase debe ser futura');
      }
      
      return true;
    }),

  // Datos de estudiante (si no está autenticado)
  body('estudiante.email')
    .optional()
    .isEmail().withMessage('Email inválido'),
  
  body('estudiante.nombre')
    .optional()
    .notEmpty().withMessage('El nombre es obligatorio'),
  
  body('estudiante.apellido')
    .optional()
    .notEmpty().withMessage('El apellido es obligatorio'),
  
  body('estudiante.password')
    .optional()
    .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  
  body('estudiante.telefono')
    .optional()
];

// Validación para obtener compra por ID
export const validarObtenerCompra = [
  param('id')
    .isUUID().withMessage('El ID debe ser un UUID válido')
];

// Validación para listar compras (admin)
export const validarListarCompras = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('La página debe ser un número mayor o igual a 1'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),
  
  query('estado')
    .optional()
    .isIn(['pendiente', 'completado', 'fallido', 'cancelado'])
    .withMessage('Estado inválido'),
  
  query('tipo_compra')
    .optional()
    .isIn(['curso', 'clase_personalizada'])
    .withMessage('Tipo de compra inválido')
];
