// src/controllers/cursoSesionesController.js

import { supabase } from '../config/supabase.js';
import { notifyCursoSesionMeetLinkAssigned } from '../services/emailService.js';
import { generarSesionesSemanalesPorRangoHora } from '../utils/generarSesionesCurso.js';

// Helper verificar inscripción de estudiante a un curso
async function assertInscrito({ cursoId, estudianteId }) {
  const { data, error } = await supabase
    .from('inscripcion_curso')
    .select('id')
    .eq('curso_id', cursoId)
    .eq('estudiante_id', estudianteId)
    .maybeSingle();

  if (error) throw error;

  if (!data?.id) {
    const err = new Error('No tienes acceso a este curso. Debes comprarlo primero.');
    err.statusCode = 403;
    throw err;
  }
}

const normalizeSesionesRows = ({ cursoId, sesiones }) => {
  if (!Array.isArray(sesiones) || sesiones.length === 0) {
    const err = new Error('Debes enviar sesiones: [{ fecha_hora, duracion_min? }].');
    err.statusCode = 400;
    throw err;
  }

  return sesiones.map((s) => {
    const fecha = new Date(s?.fecha_hora);

    if (!s?.fecha_hora || Number.isNaN(fecha.getTime())) {
      const err = new Error('Cada sesión debe tener fecha_hora ISO válida');
      err.statusCode = 400;
      throw err;
    }

    const dur = s?.duracion_min !== undefined ? Number(s.duracion_min) : 60;

    if (!Number.isFinite(dur) || dur <= 0) {
      const err = new Error('duracion_min debe ser un entero > 0');
      err.statusCode = 400;
      throw err;
    }

    return {
      curso_id: cursoId,
      fecha_hora: fecha.toISOString(),
      duracion_min: Math.trunc(dur),
      estado: 'programada',
      link_meet: null
    };
  });
};

const buildRowsFromRegla = ({ cursoId, curso, regla }) => {
  const timezone = regla?.timezone || 'America/Bogota';
  const days_of_week = regla?.days_of_week;
  const hora_inicio = regla?.hora_inicio;
  const hora_fin = regla?.hora_fin;
  const exclude_dates = regla?.exclude_dates || [];
  const estado = regla?.estado || 'programada';

  if (!curso?.fecha_inicio || !curso?.fecha_fin) {
    const err = new Error('El curso debe tener fecha_inicio y fecha_fin para generar sesiones por regla.');
    err.statusCode = 400;
    throw err;
  }

  const sesiones = generarSesionesSemanalesPorRangoHora({
    fecha_inicio: curso.fecha_inicio,
    fecha_fin: curso.fecha_fin,
    timezone,
    days_of_week,
    hora_inicio,
    hora_fin,
    exclude_dates,
    estado
  });

  if (!Array.isArray(sesiones) || sesiones.length === 0) {
    const err = new Error('La regla no generó sesiones dentro del rango fecha_inicio/fecha_fin.');
    err.statusCode = 400;
    throw err;
  }

  return sesiones.map((s) => ({
    curso_id: cursoId,
    fecha_hora: s.fecha_hora,
    duracion_min: s.duracion_min,
    estado: s.estado,
    link_meet: null
  }));
};

/**
 * POST /api/cursos/:cursoId/sesiones
 * Admin crea sesiones para un curso grupal
 *
 * Soporta 2 modos:
 * 1) { sesiones: [{ fecha_hora, duracion_min? }, ...] }
 * 2) { regla: { timezone, days_of_week, hora_inicio, hora_fin, exclude_dates?, estado? } }
 */
export const crearSesionesCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { sesiones, regla } = req.body || {};

    if (!cursoId) {
      return res.status(400).json({ success: false, message: 'cursoId es requerido' });
    }

    // Validar curso
    const { data: curso, error: cursoErr } = await supabase
      .from('curso')
      .select('id, tipo, fecha_inicio, fecha_fin')
      .eq('id', cursoId)
      .single();

    if (cursoErr || !curso) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    }

    if (curso.tipo !== 'grupal') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden programar sesiones para cursos tipo grupal.'
      });
    }

    // Construir rows según modo
    let rows = [];
    if (regla) {
      rows = buildRowsFromRegla({ cursoId, curso, regla });
    } else {
      rows = normalizeSesionesRows({ cursoId, sesiones });
    }

    // Insertar sesiones
    const { data: created, error: insErr } = await supabase
      .from('curso_sesion')
      .insert(rows)
      .select();

    if (insErr) throw insErr;

    // Vincular estas sesiones a TODOS los estudiantes actualmente inscritos (best-effort)
    try {
      const { data: insc, error: errInsc } = await supabase
        .from('inscripcion_curso')
        .select('estudiante_id')
        .eq('curso_id', cursoId);

      if (errInsc) throw errInsc;

      const estudianteIds = (insc || []).map((x) => x.estudiante_id).filter(Boolean);

      if (estudianteIds.length > 0 && Array.isArray(created) && created.length > 0) {
        const links = [];
        for (const ses of created) {
          for (const estId of estudianteIds) {
            links.push({ curso_sesion_id: ses.id, estudiante_id: estId });
          }
        }

        const { error: errLink } = await supabase
          .from('curso_sesion_estudiante')
          .upsert(links, { onConflict: 'curso_sesion_id,estudiante_id' });

        if (errLink) throw errLink;
      }
    } catch (e) {
      console.error('⚠️ No se pudo vincular curso_sesion_estudiante al crear sesiones:', e?.message || e);
    }

    return res.status(201).json({
      success: true,
      message: 'Sesiones creadas',
      data: { sesiones: created }
    });
  } catch (error) {
    console.error('crearSesionesCurso:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error creando sesiones de curso',
      error: error.message
    });
  }
};

/**
 * GET /api/cursos/:cursoId/sesiones
 * Auth: estudiante/profesor/admin
 * - Estudiante requiere inscripción
 */
export const listarSesionesCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;

    if (!cursoId) {
      return res.status(400).json({ success: false, message: 'cursoId es requerido' });
    }

    if (req.user?.rol === 'estudiante') {
      await assertInscrito({ cursoId, estudianteId: req.user.id });
    }

    const { data, error } = await supabase
      .from('curso_sesion')
      .select('id, curso_id, fecha_hora, duracion_min, link_meet, estado, created_at, updated_at')
      .eq('curso_id', cursoId)
      .order('fecha_hora', { ascending: true });

    if (error) throw error;

    return res.json({ success: true, data: { sesiones: data || [] } });
  } catch (error) {
    console.error('listarSesionesCurso:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error listando sesiones',
      error: error.message
    });
  }
};

/**
 * PUT /api/cursos/:cursoId/sesiones/:sesionId/meet
 * Admin asigna link Meet a sesión de curso
 * Body: { link_meet }
 */
export const asignarLinkMeetCursoSesion = async (req, res) => {
  try {
    const { cursoId, sesionId } = req.params;
    const { link_meet } = req.body;

    if (!cursoId || !sesionId) {
      return res.status(400).json({
        success: false,
        message: 'cursoId y sesionId son requeridos'
      });
    }

    if (!link_meet || typeof link_meet !== 'string' || !link_meet.startsWith('http')) {
      return res.status(400).json({
        success: false,
        message: 'link_meet es obligatorio y debe ser una URL válida.'
      });
    }

    const { data: sesion, error: sesErr } = await supabase
      .from('curso_sesion')
      .select('id, curso_id, fecha_hora, estado, link_meet')
      .eq('id', sesionId)
      .eq('curso_id', cursoId)
      .single();

    if (sesErr || !sesion) {
      return res.status(404).json({
        success: false,
        message: 'Sesión no encontrada para este curso'
      });
    }

    if (sesion.estado !== 'programada') {
      return res.status(400).json({
        success: false,
        message: 'Solo se puede asignar link a sesiones en estado "programada"'
      });
    }

    const { data: updated, error: upErr } = await supabase
      .from('curso_sesion')
      .update({ link_meet: link_meet.trim(), updated_at: new Date().toISOString() })
      .eq('id', sesionId)
      .select()
      .single();

    if (upErr) throw upErr;

    let notifyResult = null;
    try {
      notifyResult = await notifyCursoSesionMeetLinkAssigned({ cursoSesionId: sesionId });
    } catch (e) {
      console.error('❌ Error notificando Meet (curso_sesion):', e?.message || e);
      notifyResult = { ok: false, error: e?.message || String(e) };
    }

    return res.json({
      success: true,
      message: 'Link de Meet asignado',
      data: {
        sesion: updated,
        notificacion: notifyResult
      }
    });
  } catch (error) {
    console.error('asignarLinkMeetCursoSesion:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error asignando link_meet',
      error: error.message
    });
  }
};
