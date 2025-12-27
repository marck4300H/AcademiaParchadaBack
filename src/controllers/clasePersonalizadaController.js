// src/controllers/clasePersonalizadaController.js

import { supabase } from '../config/supabase.js';

/**
 * CU-017: Crear Plantilla de Clase Personalizada
 * POST /api/clases-personalizadas
 * Rol: Administrador
 */
export const createClasePersonalizada = async (req, res) => {
  try {
    const {
      asignatura_id,
      precio,
      duracion_horas,
      tipo_pago_profesor,
      valor_pago_profesor
    } = req.body;

    // Validar campos requeridos
    if (!asignatura_id || !precio || !duracion_horas || !tipo_pago_profesor || valor_pago_profesor === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son obligatorios'
      });
    }

    // Validar que precio y duracion_horas sean positivos
    if (precio <= 0 || duracion_horas <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El precio y la duración deben ser mayores a 0'
      });
    }

    // Validar tipo_pago_profesor
    if (!['porcentaje', 'monto_fijo'].includes(tipo_pago_profesor)) {
      return res.status(400).json({
        success: false,
        message: 'El tipo de pago profesor debe ser "porcentaje" o "monto_fijo"'
      });
    }

    // Validar valor_pago_profesor según tipo
    if (tipo_pago_profesor === 'porcentaje') {
      if (valor_pago_profesor < 0 || valor_pago_profesor > 100) {
        return res.status(400).json({
          success: false,
          message: 'El porcentaje debe estar entre 0 y 100'
        });
      }
    } else {
      if (valor_pago_profesor < 0) {
        return res.status(400).json({
          success: false,
          message: 'El monto fijo debe ser mayor o igual a 0'
        });
      }
    }

    // Verificar que la asignatura existe
    const { data: asignatura, error: asignaturaError } = await supabase
      .from('asignatura')
      .select('id, nombre')
      .eq('id', asignatura_id)
      .single();

    if (asignaturaError || !asignatura) {
      return res.status(404).json({
        success: false,
        message: 'Asignatura no encontrada'
      });
    }

    // Crear clase personalizada
    const { data: clasePersonalizada, error } = await supabase
      .from('clase_personalizada')
      .insert([{
        asignatura_id,
        precio,
        duracion_horas,
        tipo_pago_profesor,
        valor_pago_profesor
      }])
      .select(`
        *,
        asignatura:asignatura_id (
          id,
          nombre,
          descripcion
        )
      `)
      .single();

    if (error) {
      console.error('Error al crear clase personalizada:', error);
      throw error;
    }

    res.status(201).json({
      success: true,
      message: 'Clase personalizada creada exitosamente',
      data: {
        clase_personalizada: clasePersonalizada
      }
    });

  } catch (error) {
    console.error('Error en createClasePersonalizada:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-018: Listar Clases Personalizadas
 * GET /api/clases-personalizadas
 * Rol: Administrador, Estudiante
 */
export const listClasesPersonalizadas = async (req, res) => {
  try {
    const { page = 1, limit = 10, asignatura_id } = req.query;
    const offset = (page - 1) * limit;

    // Construir query base
    let query = supabase
      .from('clase_personalizada')
      .select(`
        *,
        asignatura:asignatura_id (
          id,
          nombre,
          descripcion
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    // Filtrar por asignatura si se proporciona
    if (asignatura_id) {
      query = query.eq('asignatura_id', asignatura_id);
    }

    // Paginación
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: clasesPersonalizadas, error, count } = await query;

    if (error) {
      console.error('Error al listar clases personalizadas:', error);
      throw error;
    }

    res.json({
      success: true,
      data: {
        clases_personalizadas: clasesPersonalizadas || [],
        pagination: {
          total: count || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil((count || 0) / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error en listClasesPersonalizadas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-018: Obtener Clase Personalizada por ID
 * GET /api/clases-personalizadas/:id
 * Rol: Administrador, Estudiante
 */
export const getClasePersonalizadaById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: clasePersonalizada, error } = await supabase
      .from('clase_personalizada')
      .select(`
        *,
        asignatura:asignatura_id (
          id,
          nombre,
          descripcion
        )
      `)
      .eq('id', id)
      .single();

    if (error || !clasePersonalizada) {
      return res.status(404).json({
        success: false,
        message: 'Clase personalizada no encontrada'
      });
    }

    res.json({
      success: true,
      data: {
        clase_personalizada: clasePersonalizada
      }
    });

  } catch (error) {
    console.error('Error en getClasePersonalizadaById:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-019: Editar Clase Personalizada
 * PUT /api/clases-personalizadas/:id
 * Rol: Administrador
 */
export const updateClasePersonalizada = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      asignatura_id,
      precio,
      duracion_horas,
      tipo_pago_profesor,
      valor_pago_profesor
    } = req.body;

    // Verificar que la clase personalizada existe
    const { data: claseExistente, error: claseError } = await supabase
      .from('clase_personalizada')
      .select('*')
      .eq('id', id)
      .single();

    if (claseError || !claseExistente) {
      return res.status(404).json({
        success: false,
        message: 'Clase personalizada no encontrada'
      });
    }

    // Construir objeto de actualización (solo campos proporcionados)
    const updateData = {};

    if (asignatura_id !== undefined) {
      // Verificar que la asignatura existe
      const { data: asignatura, error: asignaturaError } = await supabase
        .from('asignatura')
        .select('id')
        .eq('id', asignatura_id)
        .single();

      if (asignaturaError || !asignatura) {
        return res.status(404).json({
          success: false,
          message: 'Asignatura no encontrada'
        });
      }
      updateData.asignatura_id = asignatura_id;
    }

    if (precio !== undefined) {
      if (precio <= 0) {
        return res.status(400).json({
          success: false,
          message: 'El precio debe ser mayor a 0'
        });
      }
      updateData.precio = precio;
    }

    if (duracion_horas !== undefined) {
      if (duracion_horas <= 0) {
        return res.status(400).json({
          success: false,
          message: 'La duración debe ser mayor a 0'
        });
      }
      updateData.duracion_horas = duracion_horas;
    }

    if (tipo_pago_profesor !== undefined) {
      if (!['porcentaje', 'monto_fijo'].includes(tipo_pago_profesor)) {
        return res.status(400).json({
          success: false,
          message: 'El tipo de pago profesor debe ser "porcentaje" o "monto_fijo"'
        });
      }
      updateData.tipo_pago_profesor = tipo_pago_profesor;
    }

    if (valor_pago_profesor !== undefined) {
      // Validar según tipo de pago
      const tipoActual = updateData.tipo_pago_profesor || claseExistente.tipo_pago_profesor;

      if (tipoActual === 'porcentaje') {
        if (valor_pago_profesor < 0 || valor_pago_profesor > 100) {
          return res.status(400).json({
            success: false,
            message: 'El porcentaje debe estar entre 0 y 100'
          });
        }
      } else {
        if (valor_pago_profesor < 0) {
          return res.status(400).json({
            success: false,
            message: 'El monto fijo debe ser mayor o igual a 0'
          });
        }
      }
      updateData.valor_pago_profesor = valor_pago_profesor;
    }

    // Si no hay campos para actualizar
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar'
      });
    }

    updateData.updated_at = new Date().toISOString();

    // Actualizar clase personalizada
    const { data: claseActualizada, error } = await supabase
      .from('clase_personalizada')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        asignatura:asignatura_id (
          id,
          nombre,
          descripcion
        )
      `)
      .single();

    if (error) {
      console.error('Error al actualizar clase personalizada:', error);
      throw error;
    }

    res.json({
      success: true,
      message: 'Clase personalizada actualizada exitosamente',
      data: {
        clase_personalizada: claseActualizada
      }
    });

  } catch (error) {
    console.error('Error en updateClasePersonalizada:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-020: Eliminar Clase Personalizada
 * DELETE /api/clases-personalizadas/:id
 * Rol: Administrador
 */
export const deleteClasePersonalizada = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que la clase personalizada existe
    const { data: claseExistente, error: claseError } = await supabase
      .from('clase_personalizada')
      .select('id')
      .eq('id', id)
      .single();

    if (claseError || !claseExistente) {
      return res.status(404).json({
        success: false,
        message: 'Clase personalizada no encontrada'
      });
    }

    // Verificar que no tenga compras asociadas
    const { data: compras, error: comprasError } = await supabase
      .from('compra')
      .select('id')
      .eq('clase_personalizada_id', id)
      .limit(1);

    if (comprasError) {
      console.error('Error al verificar compras:', comprasError);
      throw comprasError;
    }

    if (compras && compras.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar la clase personalizada porque tiene compras asociadas'
      });
    }

    // Eliminar clase personalizada
    const { error } = await supabase
      .from('clase_personalizada')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error al eliminar clase personalizada:', error);
      throw error;
    }

    res.json({
      success: true,
      message: 'Clase personalizada eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error en deleteClasePersonalizada:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};
