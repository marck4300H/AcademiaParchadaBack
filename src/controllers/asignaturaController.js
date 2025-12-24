import { supabase } from '../config/supabase.js';

/**
 * CU-005: Crear Asignatura
 * POST /api/asignaturas
 * Solo rol: administrador
 */
export const createAsignatura = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;

    // Verificar duplicado por nombre (case-insensitive)
    const { data: existing, error: existingError } = await supabase
      .from('asignatura')
      .select('id')
      .ilike('nombre', nombre)
      .maybeSingle();

    if (existingError) {
      console.error('Error verificando asignatura existente:', existingError);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar asignatura existente'
      });
    }

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una asignatura con ese nombre'
      });
    }

    const { data: inserted, error } = await supabase
      .from('asignatura')
      .insert({
        nombre,
        descripcion: descripcion || null
      })
      .select()
      .single();

    if (error) {
      console.error('Error al crear asignatura:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al crear la asignatura'
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Asignatura creada exitosamente',
      data: { asignatura: inserted }
    });
  } catch (err) {
    console.error('Error inesperado en createAsignatura:', err);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * CU-006: Listar Asignaturas con paginación
 * GET /api/asignaturas?page=1&limit=10
 * Acceso: público (admin/profesor/estudiante)
 */
export const listAsignaturas = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('asignatura')
      .select('*', { count: 'exact' })
      .order('nombre', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error al listar asignaturas:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener las asignaturas'
      });
    }

    return res.json({
      success: true,
      data: {
        asignaturas: data,
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (err) {
    console.error('Error inesperado en listAsignaturas:', err);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener una asignatura por ID
 * GET /api/asignaturas/:id
 * Acceso: público
 */
export const getAsignaturaById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('asignatura')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Asignatura no encontrada'
        });
      }
      console.error('Error al obtener asignatura:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener la asignatura'
      });
    }

    return res.json({
      success: true,
      data: { asignatura: data }
    });
  } catch (err) {
    console.error('Error inesperado en getAsignaturaById:', err);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * CU-007: Editar Asignatura
 * PUT /api/asignaturas/:id
 * Solo rol: administrador
 */
export const updateAsignatura = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion } = req.body;

    // Verificar que exista
    const { data: existing, error: existingError } = await supabase
      .from('asignatura')
      .select('*')
      .eq('id', id)
      .single();

    if (existingError) {
      if (existingError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Asignatura no encontrada'
        });
      }
      console.error('Error verificando asignatura:', existingError);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar la asignatura'
      });
    }

    // Si cambia nombre, verificar que no exista otra con ese nombre
    if (nombre && nombre !== existing.nombre) {
      const { data: duplicate, error: dupError } = await supabase
        .from('asignatura')
        .select('id')
        .ilike('nombre', nombre)
        .neq('id', id)
        .maybeSingle();

      if (dupError) {
        console.error('Error verificando nombre duplicado:', dupError);
        return res.status(500).json({
          success: false,
          message: 'Error al verificar nombre duplicado'
        });
      }

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otra asignatura con ese nombre'
        });
      }
    }

    const payload = {};
    if (nombre !== undefined) payload.nombre = nombre;
    if (descripcion !== undefined) payload.descripcion = descripcion;

    const { data: updated, error } = await supabase
      .from('asignatura')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error al actualizar asignatura:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al actualizar la asignatura'
      });
    }

    return res.json({
      success: true,
      message: 'Asignatura actualizada exitosamente',
      data: { asignatura: updated }
    });
  } catch (err) {
    console.error('Error inesperado en updateAsignatura:', err);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * CU-008: Eliminar Asignatura
 * DELETE /api/asignaturas/:id
 * Solo rol: administrador
 */
export const deleteAsignatura = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si está usada en curso
    const { data: cursos, error: cursosError } = await supabase
      .from('curso')
      .select('id')
      .eq('asignatura_id', id)
      .limit(1); // si aún no existe esta FK, quitamos esto más adelante

    if (cursosError) {
      // Si tu tabla curso todavía no tiene asignatura_id, puedes comentar este bloque.
      console.error('Error verificando cursos relacionados:', cursosError);
    }

    if (cursos && cursos.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar la asignatura porque tiene cursos asociados'
      });
    }

    // Verificar si está usada en clase_personalizada
    const { data: clases, error: clasesError } = await supabase
      .from('clase_personalizada')
      .select('id')
      .eq('asignatura_id', id)
      .limit(1);

    if (clasesError) {
      console.error('Error verificando clases personalizadas relacionadas:', clasesError);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar relaciones de la asignatura'
      });
    }

    if (clases && clases.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar la asignatura porque tiene clases personalizadas asociadas'
      });
    }

    const { error } = await supabase
      .from('asignatura')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error al eliminar asignatura:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al eliminar la asignatura'
      });
    }

    return res.json({
      success: true,
      message: 'Asignatura eliminada exitosamente'
    });
  } catch (err) {
    console.error('Error inesperado en deleteAsignatura:', err);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};
