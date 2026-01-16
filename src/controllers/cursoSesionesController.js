// src/controllers/cursoSesionesController.js
import { supabase } from '../config/supabase.js';
import { notifyCursoSesionMeetLinkAssigned } from '../services/emailService.js';

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

/**
 * POST /api/cursos/:cursoId/sesiones
 * Admin crea N sesiones para un curso grupal
 * Body: { sesiones: [{ fecha_hora, duracion_min? }, ...] }
 */
export const crearSesionesCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { sesiones } = req.body;

    if (!cursoId) {
      return res.status(400).json({ success: false, message: 'cursoId es requerido' });
    }

    if (!Array.isArray(sesiones) || sesiones.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debes enviar sesiones: [{ fecha_hora, duracion_min? }].'
      });
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

    // Normalizar y validar fechas
    const rows = sesiones.map((s) => {
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
        duracion_min: dur,
        estado: 'programada',
        link_meet: null
      };
    });

    // Insertar sesiones
    const { data: created, error: insErr } = await supabase
      .from('curso_sesion')
      .insert(rows)
      .select();

    if (insErr) throw insErr;

    // ✅ NUEVO: Vincular estas sesiones a TODOS los estudiantes actualmente inscritos
    // (sin notificar por email)
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
      // Best-effort: si falla esto, igual devolvemos sesiones creadas
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

    // Validar acceso estudiante
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
 *
 * Regla: solo se notifica aquí (no al crear sesión)
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

    // Traer sesión curso (debe pertenecer al curso)
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

    // Actualizar
    const { data: updated, error: upErr } = await supabase
      .from('curso_sesion')
      .update({ link_meet: link_meet.trim(), updated_at: new Date().toISOString() })
      .eq('id', sesionId)
      .select()
      .single();

    if (upErr) throw upErr;

    // ✅ NUEVO: notificar a todos los inscritos del curso
    // Best-effort: si falla el envío, igual devolvemos success (y reportamos resultado)
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
