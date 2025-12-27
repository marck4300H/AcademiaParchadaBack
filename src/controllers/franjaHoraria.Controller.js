import { supabase } from '../config/supabase.js';

/**
 * CU-013: Crear Franja Horaria
 * POST /api/franjas-horarias
 * Acceso: profesor (solo sus propias franjas), admin
 */
export const createFranjaHoraria = async (req, res) => {
  try {
    const { profesor_id, dia_semana, hora_inicio, hora_fin } = req.body;
    const userRole = req.user.rol;
    const userId = req.user.id;

    // 1. Verificar permisos: profesor solo puede crear sus propias franjas
    if (userRole === 'profesor' && userId !== profesor_id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear franjas horarias de otro profesor'
      });
    }

    // 2. Verificar que el profesor existe
    const { data: profesor, error: profesorError } = await supabase
      .from('usuario')
      .select('id, nombre, apellido')
      .eq('id', profesor_id)
      .eq('rol', 'profesor')
      .single();

    if (profesorError || !profesor) {
      return res.status(404).json({
        success: false,
        message: 'Profesor no encontrado'
      });
    }

    // 3. Verificar que no se solape con otra franja del mismo profesor
    const { data: franjasExistentes, error: solapamientoError } = await supabase
      .from('franja_horaria')
      .select('id, hora_inicio, hora_fin')
      .eq('profesor_id', profesor_id)
      .eq('dia_semana', dia_semana);

    if (solapamientoError) {
      console.error('Error al verificar solapamiento:', solapamientoError);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar franjas existentes'
      });
    }

    // Verificar solapamiento
    const [horaInicioNueva, minInicioNueva] = hora_inicio.split(':').map(Number);
    const [horaFinNueva, minFinNueva] = hora_fin.split(':').map(Number);
    const minutosInicioNueva = horaInicioNueva * 60 + minInicioNueva;
    const minutosFinNueva = horaFinNueva * 60 + minFinNueva;

    for (const franja of franjasExistentes) {
      const [horaInicioExist, minInicioExist] = franja.hora_inicio.split(':').map(Number);
      const [horaFinExist, minFinExist] = franja.hora_fin.split(':').map(Number);
      const minutosInicioExist = horaInicioExist * 60 + minInicioExist;
      const minutosFinExist = horaFinExist * 60 + minFinExist;

      if (minutosInicioNueva < minutosFinExist && minutosFinNueva > minutosInicioExist) {
        return res.status(400).json({
          success: false,
          message: `La franja horaria se solapa con otra existente (${franja.hora_inicio} - ${franja.hora_fin})`
        });
      }
    }

    // 4. Crear franja horaria
    const { data: nuevaFranja, error: insertError } = await supabase
      .from('franja_horaria')
      .insert([
        {
          profesor_id,
          dia_semana,
          hora_inicio,
          hora_fin
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Error al crear franja horaria:', insertError);
      return res.status(500).json({
        success: false,
        message: 'Error al crear la franja horaria',
        error: insertError.message
      });
    }

    // 5. Respuesta exitosa
    res.status(201).json({
      success: true,
      message: 'Franja horaria creada exitosamente',
      data: {
        franja: {
          ...nuevaFranja,
          profesor: {
            id: profesor.id,
            nombre: profesor.nombre,
            apellido: profesor.apellido
          }
        }
      }
    });

  } catch (error) {
    console.error('Error en createFranjaHoraria:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-014: Listar Franjas Horarias de Profesor
 * GET /api/franjas-horarias/profesor/:profesorId
 * Acceso: admin, profesor (solo sus propias franjas)
 */
export const listFranjasByProfesor = async (req, res) => {
  try {
    const { profesorId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const userRole = req.user.rol;
    const userId = req.user.id;

    // 1. Verificar permisos
    if (userRole === 'profesor' && userId !== profesorId) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver las franjas horarias de otro profesor'
      });
    }

    // 2. Verificar que el profesor existe
    const { data: profesor, error: profesorError } = await supabase
      .from('usuario')
      .select('id, nombre, apellido, email')
      .eq('id', profesorId)
      .eq('rol', 'profesor')
      .single();

    if (profesorError || !profesor) {
      return res.status(404).json({
        success: false,
        message: 'Profesor no encontrado'
      });
    }

    // 3. Obtener franjas horarias con paginación
    const { data: franjas, error: franjasError, count } = await supabase
      .from('franja_horaria')
      .select('*', { count: 'exact' })
      .eq('profesor_id', profesorId)
      .order('dia_semana', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .range(offset, offset + limit - 1);

    if (franjasError) {
      console.error('Error al obtener franjas horarias:', franjasError);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener franjas horarias',
        error: franjasError.message
      });
    }

    // 4. Agrupar franjas por día
    const diasOrden = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    const franjasPorDia = {};
    
    diasOrden.forEach(dia => {
      franjasPorDia[dia] = franjas.filter(f => f.dia_semana === dia);
    });

    // 5. Respuesta exitosa
    res.json({
      success: true,
      data: {
        profesor: {
          id: profesor.id,
          nombre: profesor.nombre,
          apellido: profesor.apellido,
          email: profesor.email
        },
        franjas: franjas,
        franjasPorDia: franjasPorDia,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error en listFranjasByProfesor:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-015: Editar Franja Horaria
 * PUT /api/franjas-horarias/:id
 * Acceso: profesor (solo sus propias franjas), admin
 */
export const updateFranjaHoraria = async (req, res) => {
  try {
    const { id } = req.params;
    const { dia_semana, hora_inicio, hora_fin } = req.body;
    const userRole = req.user.rol;
    const userId = req.user.id;

    // 1. Verificar que la franja existe
    const { data: franjaExistente, error: franjaError } = await supabase
      .from('franja_horaria')
      .select('*')
      .eq('id', id)
      .single();

    if (franjaError || !franjaExistente) {
      return res.status(404).json({
        success: false,
        message: 'Franja horaria no encontrada'
      });
    }

    // 2. Verificar permisos
    if (userRole === 'profesor' && userId !== franjaExistente.profesor_id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para editar franjas horarias de otro profesor'
      });
    }

    // 3. Preparar datos a actualizar
    const datosActualizados = {};
    if (dia_semana) datosActualizados.dia_semana = dia_semana;
    if (hora_inicio) datosActualizados.hora_inicio = hora_inicio;
    if (hora_fin) datosActualizados.hora_fin = hora_fin;

    // Verificar que hora_fin > hora_inicio
    const horaInicioFinal = hora_inicio || franjaExistente.hora_inicio;
    const horaFinFinal = hora_fin || franjaExistente.hora_fin;

    const [hInicio, mInicio] = horaInicioFinal.split(':').map(Number);
    const [hFin, mFin] = horaFinFinal.split(':').map(Number);
    const minutosInicio = hInicio * 60 + mInicio;
    const minutosFin = hFin * 60 + mFin;

    if (minutosFin <= minutosInicio) {
      return res.status(400).json({
        success: false,
        message: 'La hora de fin debe ser posterior a la hora de inicio'
      });
    }

    // 4. Verificar solapamiento con otras franjas del mismo día
    const diaFinal = dia_semana || franjaExistente.dia_semana;

    const { data: otrasFranjas, error: solapamientoError } = await supabase
      .from('franja_horaria')
      .select('id, hora_inicio, hora_fin')
      .eq('profesor_id', franjaExistente.profesor_id)
      .eq('dia_semana', diaFinal)
      .neq('id', id);

    if (solapamientoError) {
      console.error('Error al verificar solapamiento:', solapamientoError);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar solapamiento'
      });
    }

    // Verificar solapamiento
    for (const franja of otrasFranjas) {
      const [hInicioExist, mInicioExist] = franja.hora_inicio.split(':').map(Number);
      const [hFinExist, mFinExist] = franja.hora_fin.split(':').map(Number);
      const minutosInicioExist = hInicioExist * 60 + mInicioExist;
      const minutosFinExist = hFinExist * 60 + mFinExist;

      if (minutosInicio < minutosFinExist && minutosFin > minutosInicioExist) {
        return res.status(400).json({
          success: false,
          message: `La franja horaria se solapa con otra existente (${franja.hora_inicio} - ${franja.hora_fin})`
        });
      }
    }

    // 5. Actualizar franja
    const { data: franjaActualizada, error: updateError } = await supabase
      .from('franja_horaria')
      .update(datosActualizados)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error al actualizar franja horaria:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Error al actualizar la franja horaria',
        error: updateError.message
      });
    }

    // 6. Obtener datos del profesor
    const { data: profesor } = await supabase
      .from('usuario')
      .select('id, nombre, apellido')
      .eq('id', franjaActualizada.profesor_id)
      .single();

    // 7. Respuesta exitosa
    res.json({
      success: true,
      message: 'Franja horaria actualizada exitosamente',
      data: {
        franja: {
          ...franjaActualizada,
          profesor: profesor
        }
      }
    });

  } catch (error) {
    console.error('Error en updateFranjaHoraria:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-016: Eliminar Franja Horaria
 * DELETE /api/franjas-horarias/:id
 * Acceso: profesor (solo sus propias franjas), admin
 */
export const deleteFranjaHoraria = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.rol;
    const userId = req.user.id;

    // 1. Verificar que la franja existe
    const { data: franja, error: franjaError } = await supabase
      .from('franja_horaria')
      .select('*')
      .eq('id', id)
      .single();

    if (franjaError || !franja) {
      return res.status(404).json({
        success: false,
        message: 'Franja horaria no encontrada'
      });
    }

    // 2. Verificar permisos
    if (userRole === 'profesor' && userId !== franja.profesor_id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar franjas horarias de otro profesor'
      });
    }

    // 3. Eliminar franja
    const { error: deleteError } = await supabase
      .from('franja_horaria')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error al eliminar franja horaria:', deleteError);
      return res.status(500).json({
        success: false,
        message: 'Error al eliminar la franja horaria',
        error: deleteError.message
      });
    }

    // 4. Respuesta exitosa
    res.json({
      success: true,
      message: `Franja horaria del ${franja.dia_semana} (${franja.hora_inicio} - ${franja.hora_fin}) eliminada exitosamente`
    });

  } catch (error) {
    console.error('Error en deleteFranjaHoraria:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};
