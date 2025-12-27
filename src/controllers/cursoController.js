// src/controllers/cursoController.js

import { supabase } from '../config/supabase.js';

/**
 * CU-021: Crear Curso
 * POST /api/cursos
 * Rol: Administrador
 */
export const createCurso = async (req, res) => {
  try {
    const {
      nombre,
      descripcion,
      precio,
      duracion_horas,
      tipo,
      tipo_pago_profesor,
      valor_pago_profesor,
      fecha_inicio,
      fecha_fin,
      asignatura_id,      // UNA sola asignatura
      profesor_id,        // UN solo profesor
      franja_horaria_ids  // Array de IDs de franjas
    } = req.body;

    // Validar campos requeridos
    if (!nombre || !precio || !duracion_horas || !tipo || !asignatura_id) {
      return res.status(400).json({
        success: false,
        message: 'Los campos nombre, precio, duracion_horas, tipo y asignatura_id son obligatorios'
      });
    }

    // Validar que precio y duracion_horas sean positivos
    if (precio <= 0 || duracion_horas <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El precio y la duración en horas deben ser mayores a 0'
      });
    }

    // Validar tipo de curso
    if (!['grupal', 'pregrabado'].includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: 'El tipo debe ser "grupal" o "pregrabado"'
      });
    }

    // Validar tipo_pago_profesor si se proporciona
    if (tipo_pago_profesor && !['porcentaje', 'monto_fijo'].includes(tipo_pago_profesor)) {
      return res.status(400).json({
        success: false,
        message: 'El tipo de pago profesor debe ser "porcentaje" o "monto_fijo"'
      });
    }

    // Validar valor_pago_profesor según tipo si se proporciona
    if (tipo_pago_profesor && valor_pago_profesor !== undefined) {
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
    }

    // Validar fechas si se proporcionan
    if (fecha_inicio && fecha_fin) {
      const fechaInicioDate = new Date(fecha_inicio);
      const fechaFinDate = new Date(fecha_fin);

      if (fechaFinDate <= fechaInicioDate) {
        return res.status(400).json({
          success: false,
          message: 'La fecha de fin debe ser posterior a la fecha de inicio'
        });
      }
    }

    // Validar que asignatura_id existe
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

    // Validar que profesor_id existe si se proporciona
    if (profesor_id) {
      const { data: profesor, error: profesorError } = await supabase
        .from('usuario')
        .select('id, rol')
        .eq('id', profesor_id)
        .single();

      if (profesorError || !profesor) {
        return res.status(404).json({
          success: false,
          message: 'Profesor no encontrado'
        });
      }

      if (profesor.rol !== 'profesor') {
        return res.status(400).json({
          success: false,
          message: 'El usuario especificado no es un profesor'
        });
      }
    }

    // Validar franjas horarias si se proporcionan
    if (franja_horaria_ids && Array.isArray(franja_horaria_ids) && franja_horaria_ids.length > 0) {
      const { data: franjas, error: franjasError } = await supabase
        .from('franja_horaria')
        .select('id')
        .in('id', franja_horaria_ids);

      if (franjasError || franjas.length !== franja_horaria_ids.length) {
        return res.status(400).json({
          success: false,
          message: 'Una o más franjas horarias no son válidas'
        });
      }
    }

    // Crear curso
    const cursoData = {
      nombre,
      descripcion,
      precio,
      duracion_horas,
      tipo,
      asignatura_id,
      estado: 'activo'
    };

    // Agregar campos opcionales
    if (profesor_id) cursoData.profesor_id = profesor_id;
    if (tipo_pago_profesor) cursoData.tipo_pago_profesor = tipo_pago_profesor;
    if (valor_pago_profesor !== undefined) cursoData.valor_pago_profesor = valor_pago_profesor;
    if (fecha_inicio) cursoData.fecha_inicio = fecha_inicio;
    if (fecha_fin) cursoData.fecha_fin = fecha_fin;
    if (franja_horaria_ids) cursoData.franja_horaria_ids = franja_horaria_ids;

    const { data: curso, error: cursoError } = await supabase
      .from('curso')
      .insert([cursoData])
      .select()
      .single();

    if (cursoError) {
      console.error('Error al crear curso:', cursoError);
      throw cursoError;
    }

    // Obtener curso con relaciones
    const cursoCompleto = await obtenerCursoConRelaciones(curso.id);

    res.status(201).json({
      success: true,
      message: 'Curso creado exitosamente',
      data: {
        curso: cursoCompleto
      }
    });

  } catch (error) {
    console.error('Error en createCurso:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-022: Listar Cursos
 * GET /api/cursos
 * Rol: Público
 */
export const listCursos = async (req, res) => {
  try {
    const { page = 1, limit = 10, estado, tipo, asignatura_id, profesor_id } = req.query;
    const offset = (page - 1) * limit;

    // Construir query base
    let query = supabase
      .from('curso')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Filtros
    if (estado) query = query.eq('estado', estado);
    if (tipo) query = query.eq('tipo', tipo);
    if (asignatura_id) query = query.eq('asignatura_id', asignatura_id);
    if (profesor_id) query = query.eq('profesor_id', profesor_id);

    // Paginación
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: cursos, error, count } = await query;

    if (error) {
      console.error('Error al listar cursos:', error);
      throw error;
    }

    // Obtener relaciones para cada curso
    const cursosConRelaciones = await Promise.all(
      cursos.map(curso => obtenerCursoConRelaciones(curso.id))
    );

    res.json({
      success: true,
      data: {
        cursos: cursosConRelaciones,
        pagination: {
          total: count || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil((count || 0) / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error en listCursos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-023: Obtener Curso por ID
 * GET /api/cursos/:id
 * Rol: Público
 */
export const getCursoById = async (req, res) => {
  try {
    const { id } = req.params;

    const curso = await obtenerCursoConRelaciones(id);

    if (!curso) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado'
      });
    }

    res.json({
      success: true,
      data: {
        curso
      }
    });

  } catch (error) {
    console.error('Error en getCursoById:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-024: Editar Curso
 * PUT /api/cursos/:id
 * Rol: Administrador
 */
export const updateCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      descripcion,
      precio,
      duracion_horas,
      tipo,
      tipo_pago_profesor,
      valor_pago_profesor,
      estado,
      fecha_inicio,
      fecha_fin,
      asignatura_id,
      profesor_id,
      franja_horaria_ids
    } = req.body;

    // Verificar que el curso existe
    const { data: cursoExistente, error: cursoError } = await supabase
      .from('curso')
      .select('*')
      .eq('id', id)
      .single();

    if (cursoError || !cursoExistente) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado'
      });
    }

    // Construir objeto de actualización
    const updateData = {};

    if (nombre !== undefined) updateData.nombre = nombre;
    if (descripcion !== undefined) updateData.descripcion = descripcion;

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
          message: 'La duración en horas debe ser mayor a 0'
        });
      }
      updateData.duracion_horas = duracion_horas;
    }

    if (tipo !== undefined) {
      if (!['grupal', 'pregrabado'].includes(tipo)) {
        return res.status(400).json({
          success: false,
          message: 'El tipo debe ser "grupal" o "pregrabado"'
        });
      }
      updateData.tipo = tipo;
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
      const tipoActual = updateData.tipo_pago_profesor || cursoExistente.tipo_pago_profesor;

      if (tipoActual === 'porcentaje') {
        if (valor_pago_profesor < 0 || valor_pago_profesor > 100) {
          return res.status(400).json({
            success: false,
            message: 'El porcentaje debe estar entre 0 y 100'
          });
        }
      } else if (tipoActual === 'monto_fijo') {
        if (valor_pago_profesor < 0) {
          return res.status(400).json({
            success: false,
            message: 'El monto fijo debe ser mayor o igual a 0'
          });
        }
      }
      updateData.valor_pago_profesor = valor_pago_profesor;
    }

    if (estado !== undefined) {
      if (!['activo', 'inactivo', 'finalizado'].includes(estado)) {
        return res.status(400).json({
          success: false,
          message: 'El estado debe ser "activo", "inactivo" o "finalizado"'
        });
      }
      updateData.estado = estado;
    }

    if (fecha_inicio !== undefined) updateData.fecha_inicio = fecha_inicio;
    if (fecha_fin !== undefined) updateData.fecha_fin = fecha_fin;
    if (asignatura_id !== undefined) updateData.asignatura_id = asignatura_id;
    if (profesor_id !== undefined) updateData.profesor_id = profesor_id;
    if (franja_horaria_ids !== undefined) updateData.franja_horaria_ids = franja_horaria_ids;

    // Validar fechas si se están actualizando
    const fechaInicioFinal = updateData.fecha_inicio || cursoExistente.fecha_inicio;
    const fechaFinFinal = updateData.fecha_fin || cursoExistente.fecha_fin;

    if (fechaInicioFinal && fechaFinFinal) {
      const fechaInicioDate = new Date(fechaInicioFinal);
      const fechaFinDate = new Date(fechaFinFinal);

      if (fechaFinDate <= fechaInicioDate) {
        return res.status(400).json({
          success: false,
          message: 'La fecha de fin debe ser posterior a la fecha de inicio'
        });
      }
    }

    // Si no hay campos para actualizar
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar'
      });
    }

    // Actualizar curso
    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('curso')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error al actualizar curso:', error);
      throw error;
    }

    // Obtener curso actualizado con relaciones
    const cursoActualizado = await obtenerCursoConRelaciones(id);

    res.json({
      success: true,
      message: 'Curso actualizado exitosamente',
      data: {
        curso: cursoActualizado
      }
    });

  } catch (error) {
    console.error('Error en updateCurso:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-025: Eliminar Curso
 * DELETE /api/cursos/:id
 * Rol: Administrador
 */
export const deleteCurso = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el curso existe
    const { data: cursoExistente, error: cursoError } = await supabase
      .from('curso')
      .select('id')
      .eq('id', id)
      .single();

    if (cursoError || !cursoExistente) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado'
      });
    }

    // Verificar que no tenga compras asociadas
    const { data: compras, error: comprasError } = await supabase
      .from('compra')
      .select('id')
      .eq('curso_id', id)
      .limit(1);

    if (comprasError) {
      console.error('Error al verificar compras:', comprasError);
      throw comprasError;
    }

    if (compras && compras.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el curso porque tiene compras asociadas'
      });
    }

    // Verificar que no tenga inscripciones
    const { data: inscripciones, error: inscripcionesError } = await supabase
      .from('inscripcion_curso')
      .select('id')
      .eq('curso_id', id)
      .limit(1);

    if (inscripcionesError) {
      console.error('Error al verificar inscripciones:', inscripcionesError);
      throw inscripcionesError;
    }

    if (inscripciones && inscripciones.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el curso porque tiene inscripciones asociadas'
      });
    }

    // Eliminar curso
    const { error } = await supabase
      .from('curso')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error al eliminar curso:', error);
      throw error;
    }

    res.json({
      success: true,
      message: 'Curso eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error en deleteCurso:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Función auxiliar para obtener un curso con sus relaciones
 */
async function obtenerCursoConRelaciones(cursoId) {
  // Obtener curso base
  const { data: curso, error: cursoError } = await supabase
    .from('curso')
    .select(`
      *,
      asignatura:asignatura_id (
        id,
        nombre,
        descripcion
      ),
      profesor:profesor_id (
        id,
        nombre,
        apellido,
        email,
        telefono
      )
    `)
    .eq('id', cursoId)
    .single();

  if (cursoError || !curso) {
    return null;
  }

  // Obtener franjas horarias si existen
  if (curso.franja_horaria_ids && curso.franja_horaria_ids.length > 0) {
    const { data: franjas, error: franjasError } = await supabase
      .from('franja_horaria')
      .select('*')
      .in('id', curso.franja_horaria_ids);

    if (!franjasError && franjas) {
      curso.franjas_horarias = franjas;
    } else {
      curso.franjas_horarias = [];
    }
  } else {
    curso.franjas_horarias = [];
  }

  return curso;
}
