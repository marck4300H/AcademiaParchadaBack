// src/controllers/cursoController.js

import { supabase } from '../config/supabase.js';
import { uploadToSupabaseBucket, buildImagePath, safeName } from '../services/storageService.js';
import { generarSesionesSemanalesPorRangoHora } from '../utils/generarSesionesCurso.js';

/**
 * Helper: validar/consultar inscripción de estudiante a un curso.
 * - Admin/Profesor: no requiere inscripción
 * - Estudiante: requiere inscripcion_curso
 */
async function assertEstudianteTieneInscripcionCurso({ cursoId, user }) {
  if (!user) {
    const err = new Error('No se proporcionó token de autenticación');
    err.statusCode = 401;
    throw err;
  }

  if (user.rol !== 'estudiante') return;

  const { data: insc, error: inscErr } = await supabase
    .from('inscripcion_curso')
    .select('id')
    .eq('estudiante_id', user.id)
    .eq('curso_id', cursoId)
    .maybeSingle();

  if (inscErr) throw inscErr;

  if (!insc?.id) {
    const err = new Error('No tienes acceso a este curso. Debes comprarlo primero.');
    err.statusCode = 403;
    throw err;
  }
}

async function getInscritoFlag({ cursoId, user }) {
  if (!user) return false;
  if (user.rol !== 'estudiante') return true; // para prof/admin lo tratamos como "tiene acceso"

  const { data: insc, error } = await supabase
    .from('inscripcion_curso')
    .select('id')
    .eq('estudiante_id', user.id)
    .eq('curso_id', cursoId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(insc?.id);
}

/**
 * CU-021: Crear Curso
 * POST /api/cursos
 * Rol: Administrador
 *
 * NUEVO (opcional):
 * - sesiones_programadas: {
 *    timezone: 'America/Bogota',
 *    days_of_week: ['MON','THU'] o ['MON','TUE','WED','THU','FRI'],
 *    hora_inicio: '16:00',
 *    hora_fin: '18:00',
 *    exclude_dates?: ['YYYY-MM-DD', ...],
 *    estado?: 'programada'
 * }
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
      asignatura_id,
      profesor_id,
      franja_horaria_ids,
      capacidad_maxima,
      sesiones_programadas // ✅ NUEVO (opcional)
    } = req.body;

    // helper: parse franja_horaria_ids cuando viene como string en form-data
    let franjasParsed = franja_horaria_ids;
    if (typeof franjasParsed === 'string') {
      try {
        franjasParsed = JSON.parse(franjasParsed);
      } catch {
        // si no es JSON válido, queda como string y fallará en la validación de array más abajo
      }
    }

    // ✅ parse sesiones_programadas si viene en form-data como string
    let sesionesProgramadasParsed = sesiones_programadas;
    if (typeof sesionesProgramadasParsed === 'string') {
      try {
        sesionesProgramadasParsed = JSON.parse(sesionesProgramadasParsed);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'sesiones_programadas debe ser un JSON válido si se envía como string.'
        });
      }
    }

    if (!nombre || !precio || !duracion_horas || !tipo || !asignatura_id) {
      return res.status(400).json({
        success: false,
        message: 'Los campos nombre, precio, duracion_horas, tipo y asignatura_id son obligatorios'
      });
    }

    if (Number(precio) <= 0 || Number(duracion_horas) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El precio y la duración en horas deben ser mayores a 0'
      });
    }

    if (!['grupal', 'pregrabado'].includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: 'El tipo debe ser "grupal" o "pregrabado"'
      });
    }

    // NUEVO: capacidad_maxima (default 25 si no se especifica)
    let capacidadMax = 25;
    if (capacidad_maxima !== undefined && capacidad_maxima !== null && String(capacidad_maxima).trim() !== '') {
      capacidadMax = Number(capacidad_maxima);
      if (!Number.isFinite(capacidadMax) || capacidadMax <= 0) {
        return res.status(400).json({
          success: false,
          message: 'capacidad_maxima debe ser un número entero mayor a 0'
        });
      }
      capacidadMax = Math.trunc(capacidadMax);
    }

    if (tipo_pago_profesor && !['porcentaje', 'monto_fijo'].includes(tipo_pago_profesor)) {
      return res.status(400).json({
        success: false,
        message: 'El tipo de pago profesor debe ser "porcentaje" o "monto_fijo"'
      });
    }

    if (tipo_pago_profesor && valor_pago_profesor !== undefined) {
      if (tipo_pago_profesor === 'porcentaje') {
        if (Number(valor_pago_profesor) < 0 || Number(valor_pago_profesor) > 100) {
          return res.status(400).json({
            success: false,
            message: 'El porcentaje debe estar entre 0 y 100'
          });
        }
      } else {
        if (Number(valor_pago_profesor) < 0) {
          return res.status(400).json({
            success: false,
            message: 'El monto fijo debe ser mayor o igual a 0'
          });
        }
      }
    }

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

    // ✅ Validación adicional: si viene sesiones_programadas, debe ser curso grupal + fechas obligatorias
    if (sesionesProgramadasParsed) {
      if (tipo !== 'grupal') {
        return res.status(400).json({
          success: false,
          message: 'sesiones_programadas solo aplica para cursos tipo "grupal".'
        });
      }
      if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({
          success: false,
          message: 'Para generar sesiones, debes enviar fecha_inicio y fecha_fin en el curso.'
        });
      }

      // Validar presencia de hora_inicio/hora_fin/days_of_week (lo demás lo valida el util)
      if (!sesionesProgramadasParsed.hora_inicio || !sesionesProgramadasParsed.hora_fin) {
        return res.status(400).json({
          success: false,
          message: 'sesiones_programadas.hora_inicio y sesiones_programadas.hora_fin son obligatorias.'
        });
      }
      if (!Array.isArray(sesionesProgramadasParsed.days_of_week) || sesionesProgramadasParsed.days_of_week.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'sesiones_programadas.days_of_week debe ser un array con al menos un día (MON..SUN).'
        });
      }
    }

    // Validar asignatura
    const { data: asignatura, error: asignaturaError } = await supabase
      .from('asignatura')
      .select('id')
      .eq('id', asignatura_id)
      .single();

    if (asignaturaError || !asignatura) {
      return res.status(404).json({ success: false, message: 'Asignatura no encontrada' });
    }

    // Validar profesor si viene
    if (profesor_id) {
      const { data: profesor, error: profesorError } = await supabase
        .from('usuario')
        .select('id, rol')
        .eq('id', profesor_id)
        .single();

      if (profesorError || !profesor) {
        return res.status(404).json({ success: false, message: 'Profesor no encontrado' });
      }

      if (profesor.rol !== 'profesor') {
        return res.status(400).json({ success: false, message: 'El usuario especificado no es un profesor' });
      }
    }

    // Validar franjas si vienen
    if (franjasParsed && Array.isArray(franjasParsed) && franjasParsed.length > 0) {
      const { data: franjas, error: franjasError } = await supabase
        .from('franja_horaria')
        .select('id')
        .in('id', franjasParsed);

      if (franjasError || (franjas?.length || 0) !== franjasParsed.length) {
        return res.status(400).json({ success: false, message: 'Una o más franjas horarias no son válidas' });
      }
    }

    const cursoData = {
      nombre,
      descripcion: descripcion ?? null,
      precio: Number(precio),
      duracion_horas: Number(duracion_horas),
      tipo,
      asignatura_id,
      estado: 'activo',
      capacidad_maxima: capacidadMax
    };

    if (profesor_id) cursoData.profesor_id = profesor_id;
    if (tipo_pago_profesor) cursoData.tipo_pago_profesor = tipo_pago_profesor;
    if (valor_pago_profesor !== undefined) cursoData.valor_pago_profesor = Number(valor_pago_profesor);
    if (fecha_inicio) cursoData.fecha_inicio = fecha_inicio;
    if (fecha_fin) cursoData.fecha_fin = fecha_fin;
    if (franjasParsed) cursoData.franja_horaria_ids = franjasParsed;

    // 1) Crear curso
    const { data: curso, error: cursoError } = await supabase
      .from('curso')
      .insert([cursoData])
      .select('*')
      .single();

    if (cursoError) throw cursoError;

    // ✅ 1.1) Generar sesiones si aplica (opcional)
    if (sesionesProgramadasParsed) {
      const timezone = sesionesProgramadasParsed.timezone || 'America/Bogota';

      const days_of_week = sesionesProgramadasParsed.days_of_week;
      const hora_inicio = sesionesProgramadasParsed.hora_inicio;
      const hora_fin = sesionesProgramadasParsed.hora_fin;
      const exclude_dates = sesionesProgramadasParsed.exclude_dates || [];
      const estado = sesionesProgramadasParsed.estado || 'programada';

      const sesiones = generarSesionesSemanalesPorRangoHora({
        fecha_inicio,
        fecha_fin,
        timezone,
        days_of_week,
        hora_inicio,
        hora_fin,
        exclude_dates,
        estado
      });

      if (sesiones.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'La regla de sesiones no generó ninguna sesión dentro del rango fecha_inicio/fecha_fin.'
        });
      }

      const rows = sesiones.map((s) => ({
        curso_id: curso.id,
        fecha_hora: s.fecha_hora,
        duracion_min: s.duracion_min,
        link_meet: null,
        estado: s.estado
      }));

      const { error: sesErr } = await supabase.from('curso_sesion').insert(rows);
      if (sesErr) throw sesErr;
    }

    // 2) Si hay imagen, subirla y actualizar curso
    if (req.file) {
      const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
      if (!allowed.has(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `Tipo de imagen no permitido: ${req.file.mimetype}`
        });
      }

      const path = buildImagePath({
        entity: 'curso',
        id: curso.id,
        originalname: safeName(req.file.originalname)
      });

      // Nota: en tu proyecto se usa bucket 'pdfs' para imágenes también
      const up = await uploadToSupabaseBucket({
        bucket: 'pdfs',
        fileBuffer: req.file.buffer,
        mimetype: req.file.mimetype,
        path
      });

      const { data: updated, error: upErr } = await supabase
        .from('curso')
        .update({
          imagen_url: up.publicUrl,
          imagen_path: up.path,
          updated_at: new Date().toISOString()
        })
        .eq('id', curso.id)
        .select('*')
        .single();

      if (upErr) throw upErr;

      return res.status(201).json({
        success: true,
        message: 'Curso creado exitosamente',
        data: { curso: updated }
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Curso creado exitosamente',
      data: { curso }
    });
  } catch (error) {
    console.error('Error en createCurso:', error);
    return res.status(500).json({
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
 *
 * CU-060: Filtros por precio
 * Query soportada:
 * - minPrecio
 * - maxPrecio
 */
export const listCursos = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      estado,
      tipo,
      asignatura_id,
      profesor_id,
      minPrecio,
      maxPrecio
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from('curso')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (estado) query = query.eq('estado', estado);
    if (tipo) query = query.eq('tipo', tipo);
    if (asignatura_id) query = query.eq('asignatura_id', asignatura_id);
    if (profesor_id) query = query.eq('profesor_id', profesor_id);

    if (minPrecio !== undefined && minPrecio !== '') query = query.gte('precio', Number(minPrecio));
    if (maxPrecio !== undefined && maxPrecio !== '') query = query.lte('precio', Number(maxPrecio));

    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: cursos, error, count } = await query;

    if (error) {
      console.error('Error al listar cursos:', error);
      throw error;
    }

    const cursosConRelaciones = await Promise.all(
      (cursos || []).map((curso) => obtenerCursoConRelaciones(curso.id))
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
 * CU-035: Contenido del curso (unificado)
 * GET /api/cursos/:cursoId/contenido
 */
export const getCursoContenido = async (req, res) => {
  try {
    const { cursoId } = req.params;

    const curso = await obtenerCursoConRelaciones(cursoId);
    if (!curso) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    }

    const inscrito = await getInscritoFlag({ cursoId, user: req.user });
    await assertEstudianteTieneInscripcionCurso({ cursoId, user: req.user });

    const { data: secciones, error: secErr } = await supabase
      .from('seccion_curso')
      .select('*')
      .eq('curso_id', cursoId)
      .order('orden', { ascending: true });

    if (secErr) throw secErr;

    const { data: materialesCompletos, error: matErr } = await supabase
      .from('material_estudio')
      .select('*')
      .eq('curso_id', cursoId)
      .order('created_at', { ascending: false });

    if (matErr) throw matErr;

    const materiales = (materialesCompletos || []).map(m => ({
      id: m.id,
      curso_id: m.curso_id,
      titulo: m.titulo,
      tipo: m.tipo,
      url: m.archivo_url,
      created_at: m.created_at
    }));

    let sesiones = [];
    if (curso.tipo === 'grupal') {
      const { data: ses, error: sesErr } = await supabase
        .from('curso_sesion')
        .select('id, curso_id, fecha_hora, duracion_min, link_meet, estado, created_at, updated_at')
        .eq('curso_id', cursoId)
        .order('fecha_hora', { ascending: true });

      if (sesErr) throw sesErr;
      sesiones = ses || [];
    }

    return res.status(200).json({
      success: true,
      data: {
        inscrito,
        curso,
        secciones: secciones || [],
        materiales,
        materiales_completos: materialesCompletos || [],
        sesiones
      }
    });
  } catch (error) {
    console.error('getCursoContenido:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Error obteniendo contenido del curso',
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
      franja_horaria_ids,
      capacidad_maxima
    } = req.body;

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

    const updateData = {};

    if (nombre !== undefined) updateData.nombre = nombre;
    if (descripcion !== undefined) updateData.descripcion = descripcion;

    if (precio !== undefined) {
      if (Number(precio) <= 0) {
        return res.status(400).json({ success: false, message: 'El precio debe ser mayor a 0' });
      }
      updateData.precio = Number(precio);
    }

    if (duracion_horas !== undefined) {
      if (Number(duracion_horas) <= 0) {
        return res.status(400).json({ success: false, message: 'La duración en horas debe ser mayor a 0' });
      }
      updateData.duracion_horas = Number(duracion_horas);
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
        if (Number(valor_pago_profesor) < 0 || Number(valor_pago_profesor) > 100) {
          return res.status(400).json({
            success: false,
            message: 'El porcentaje debe estar entre 0 y 100'
          });
        }
      } else if (tipoActual === 'monto_fijo') {
        if (Number(valor_pago_profesor) < 0) {
          return res.status(400).json({
            success: false,
            message: 'El monto fijo debe ser mayor o igual a 0'
          });
        }
      }
      updateData.valor_pago_profesor = Number(valor_pago_profesor);
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

    if (capacidad_maxima !== undefined) {
      const cap = Number(capacidad_maxima);
      if (!Number.isFinite(cap) || cap <= 0) {
        return res.status(400).json({ success: false, message: 'capacidad_maxima debe ser > 0' });
      }
      updateData.capacidad_maxima = Math.trunc(cap);
    }

    if (fecha_inicio !== undefined) updateData.fecha_inicio = fecha_inicio;
    if (fecha_fin !== undefined) updateData.fecha_fin = fecha_fin;
    if (asignatura_id !== undefined) updateData.asignatura_id = asignatura_id;
    if (profesor_id !== undefined) updateData.profesor_id = profesor_id;
    if (franja_horaria_ids !== undefined) updateData.franja_horaria_ids = franja_horaria_ids;

    if (req.file) {
      const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
      if (!allowed.has(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `Tipo de imagen no permitido: ${req.file.mimetype}`
        });
      }

      const path = buildImagePath({
        entity: 'curso',
        id,
        originalname: safeName(req.file.originalname)
      });

      const up = await uploadToSupabaseBucket({
        bucket: 'pdfs',
        fileBuffer: req.file.buffer,
        mimetype: req.file.mimetype,
        path
      });

      updateData.imagen_url = up.publicUrl;
      updateData.imagen_path = up.path;
    }

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

    if (Object.keys(updateData).length === 0 && !req.file) {
      return res.status(400).json({
        success: false,
        message: 'No hay campos para actualizar'
      });
    }

    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('curso')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error al actualizar curso:', error);
      throw error;
    }

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

/**
 * CU-059: Buscar cursos por nombre o descripción
 * GET /api/cursos/buscar?q=...
 */
export const buscarCursos = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Debes enviar query param q'
      });
    }

    const { data, error } = await supabase
      .from('curso')
      .select(`
        id,
        nombre,
        descripcion,
        precio,
        duracion_horas,
        tipo,
        estado,
        profesor_id,
        asignatura_id,
        imagen_url,
        fecha_inicio,
        fecha_fin,
        created_at,
        updated_at,
        capacidad_maxima
      `)
      .or(`nombre.ilike.%${q}%,descripcion.ilike.%${q}%`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({
      success: true,
      data: { cursos: data || [] }
    });
  } catch (error) {
    console.error('buscarCursos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error buscando cursos',
      error: error.message
    });
  }
};
