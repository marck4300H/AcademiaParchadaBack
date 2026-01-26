// src/controllers/estudianteController.js
import { supabase } from '../config/supabase.js';
import { DateTime } from 'luxon';

const DEFAULT_TZ = 'America/Bogota';

/**
 * CU-034: Ver Mis Cursos Comprados (Backend)
 * GET /api/estudiante/cursos
 * Requiere: JWT (estudiante)
 *
 * Estrategia:
 * - Partir desde inscripcion_curso (porque se crea cuando el pago se completa en el webhook).
 * - Validar además que exista compra completada para ese curso (según rúbrica).
 */
export const getMisCursos = async (req, res) => {
  try {
    const estudianteId = req.user.id;

    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const offset = (page - 1) * limit;

    // 1) Traer inscripciones con datos del curso (y profesor si existe)
    const { data: inscripciones, error: errInsc } = await supabase
      .from('inscripcion_curso')
      .select(
        `
        id,
        fecha_inscripcion,
        curso:curso_id (
          id,
          nombre,
          descripcion,
          precio,
          duracion_horas,
          tipo,
          estado,
          fecha_inicio,
          fecha_fin,
          asignatura_id,
          profesor_id,
          profesor:profesor_id (
            id,
            nombre,
            apellido,
            email,
            telefono,
            rol
          )
        )
        `,
        { count: 'exact' }
      )
      .eq('estudiante_id', estudianteId)
      .order('fecha_inscripcion', { ascending: false })
      .range(offset, offset + limit - 1);

    if (errInsc) throw errInsc;

    const cursosRaw = (inscripciones || [])
      .map(i => ({
        inscripcion_id: i.id,
        fecha_inscripcion: i.fecha_inscripcion,
        curso: i.curso || null
      }))
      .filter(x => x.curso?.id);

    // 2) Validar compra completada (según rúbrica)
    const cursoIds = [...new Set(cursosRaw.map(x => x.curso.id))];

    let comprasCompletadasSet = new Set();
    if (cursoIds.length > 0) {
      const { data: compras, error: errCompras } = await supabase
        .from('compra')
        .select('id, curso_id')
        .eq('estudiante_id', estudianteId)
        .eq('tipo_compra', 'curso')
        .eq('estado_pago', 'completado')
        .in('curso_id', cursoIds);

      if (errCompras) throw errCompras;

      comprasCompletadasSet = new Set((compras || []).map(c => c.curso_id));
    }

    const cursosFiltrados = cursosRaw.filter(x => comprasCompletadasSet.has(x.curso.id));

    return res.json({
      success: true,
      data: {
        cursos: cursosFiltrados,
        pagination: {
          page,
          limit,
          returned: cursosFiltrados.length
        }
      }
    });
  } catch (error) {
    console.error('Error en getMisCursos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-036: Ver Mis Clases Personalizadas (Backend)
 * GET /api/estudiante/clases
 * Requiere: JWT (estudiante)
 *
 * Estrategia:
 * - Partir desde compra (estudiante_id + estado_pago completado) y traer sesiones.
 * - Incluir: sesion_clase + profesor + clase_personalizada + asignatura.
 */
export const getMisClases = async (req, res) => {
  try {
    const estudianteId = req.user.id;

    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const offset = (page - 1) * limit;

    // ✅ 0) Obtener timezone del estudiante desde BD (y validarla)
    const { data: est, error: estErr } = await supabase
      .from('usuario')
      .select('timezone')
      .eq('id', estudianteId)
      .single();

    if (estErr) throw estErr;

    const tzCandidate = est?.timezone || DEFAULT_TZ;
    const tzIsValid = DateTime.now().setZone(tzCandidate).isValid;
    const estudianteTimeZone = tzIsValid ? tzCandidate : DEFAULT_TZ;

    // 1) Traer sesiones del estudiante (via compra)
    const { data: sesiones, error } = await supabase
      .from('sesion_clase')
      .select(
        `
        id,
        compra_id,
        profesor_id,
        descripcion_estudiante,
        documento_url,
        fecha_hora,
        link_meet,
        estado,
        franja_horaria_ids,
        created_at,
        updated_at,
        profesor:profesor_id (
          id,
          nombre,
          apellido,
          email,
          telefono,
          rol
        ),
        compra:compra_id (
          id,
          estudiante_id,
          tipo_compra,
          clase_personalizada_id,
          estado_pago,
          monto_total,
          fecha_compra,
          moneda,
          proveedor_pago,
          mp_preference_id,
          mp_payment_id,
          mp_status,
          mp_status_detail
        )
        `,
        { count: 'exact' }
      )
      .order('fecha_hora', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // 2) Filtrar por estudiante y pago completado en backend (por seguridad)
    const sesionesFiltradas = (sesiones || []).filter(
      s => s?.compra?.estudiante_id === estudianteId && s?.compra?.estado_pago === 'completado'
    );

    // ✅ 2.1) Convertir fecha_hora a timezone del estudiante (manteniendo misma key)
    const sesionesConHoraLocal = sesionesFiltradas.map(s => {
      const raw = s?.fecha_hora;

      if (!raw) return s;

      // raw viene como timestamptz (string con offset/Z en general)
      const dt = DateTime.fromISO(String(raw), { setZone: true });
      if (!dt.isValid) return s;

      return {
        ...s,
        // Misma propiedad, solo valor convertido (ISO con offset de estudianteTimeZone)
        fecha_hora: dt.setZone(estudianteTimeZone).toISO()
      };
    });

    // 3) Enriquecer con clase_personalizada + asignatura
    const claseIds = [
      ...new Set(
        sesionesConHoraLocal
          .map(s => s?.compra?.clase_personalizada_id)
          .filter(Boolean)
      )
    ];

    let claseMap = new Map();
    if (claseIds.length > 0) {
      const { data: clases, error: errClases } = await supabase
        .from('clase_personalizada')
        .select(`
          id,
          asignatura_id,
          precio,
          duracion_horas,
          tipo_pago_profesor,
          valor_pago_profesor,
          asignatura:asignatura_id (
            id,
            nombre,
            descripcion
          )
        `)
        .in('id', claseIds);

      if (errClases) throw errClases;

      claseMap = new Map((clases || []).map(c => [c.id, c]));
    }

    const payload = sesionesConHoraLocal.map(s => ({
      ...s,
      clase_personalizada: s?.compra?.clase_personalizada_id
        ? (claseMap.get(s.compra.clase_personalizada_id) || null)
        : null
    }));

    return res.json({
      success: true,
      data: {
        sesiones: payload,
        pagination: {
          page,
          limit,
          returned: payload.length
        }
      }
    });
  } catch (error) {
    console.error('Error en getMisClases:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};
