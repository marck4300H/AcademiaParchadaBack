// src/controllers/profesorDashboardController.js
import { supabase } from '../config/supabase.js';

/**
 * CU-040: Ver Mis Clases Asignadas (Profesor)
 * GET /api/profesor/clases?page=1&limit=10
 *
 * Retorna sesiones_clase asignadas al profesor autenticado,
 * incluyendo: compra (para sacar estudiante_id), estudiante, clase_personalizada, asignatura.
 */
export const getMisClasesProfesor = async (req, res) => {
  try {
    const profesorId = req.user.id;

    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const offset = (page - 1) * limit;

    // 1) Traer sesiones asignadas al profesor + compra
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
        compra:compra_id (
          id,
          estudiante_id,
          tipo_compra,
          clase_personalizada_id,
          estado_pago,
          monto_total,
          fecha_compra,
          moneda,
          proveedor_pago
        )
        `,
        { count: 'exact' }
      )
      .eq('profesor_id', profesorId)
      .order('fecha_hora', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const sesionesFiltradas = (sesiones || []).filter(s => s?.compra);

    // 2) Enriquecer: estudiante (usuario) + clase_personalizada + asignatura
    const estudianteIds = [
      ...new Set(sesionesFiltradas.map(s => s.compra?.estudiante_id).filter(Boolean))
    ];
    const claseIds = [
      ...new Set(sesionesFiltradas.map(s => s.compra?.clase_personalizada_id).filter(Boolean))
    ];

    // Estudiantes
    let estudianteMap = new Map();
    if (estudianteIds.length > 0) {
      const { data: estudiantes, error: errEst } = await supabase
        .from('usuario')
        .select('id, nombre, apellido, email, telefono, rol')
        .in('id', estudianteIds);

      if (errEst) throw errEst;
      estudianteMap = new Map((estudiantes || []).map(u => [u.id, u]));
    }

    // Clases personalizadas + asignatura
    let claseMap = new Map();
    if (claseIds.length > 0) {
      const { data: clases, error: errCl } = await supabase
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

      if (errCl) throw errCl;
      claseMap = new Map((clases || []).map(c => [c.id, c]));
    }

    const payload = sesionesFiltradas.map(s => {
      const estudiante = s?.compra?.estudiante_id
        ? (estudianteMap.get(s.compra.estudiante_id) || null)
        : null;

      const clase_personalizada = s?.compra?.clase_personalizada_id
        ? (claseMap.get(s.compra.clase_personalizada_id) || null)
        : null;

      return {
        ...s,
        estudiante,
        clase_personalizada
      };
    });

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
    console.error('Error en getMisClasesProfesor:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-041: Ver Mis Cursos Asignados (Profesor)
 * GET /api/profesor/cursos?page=1&limit=10
 *
 * Retorna cursos donde curso.profesor_id = profesor autenticado.
 */
export const getMisCursosProfesor = async (req, res) => {
  try {
    const profesorId = req.user.id;

    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const offset = (page - 1) * limit;

    const { data: cursos, error } = await supabase
      .from('curso')
      .select(`
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
        created_at,
        updated_at,
        asignatura:asignatura_id (
          id,
          nombre,
          descripcion
        )
      `)
      .eq('profesor_id', profesorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return res.json({
      success: true,
      data: {
        cursos: cursos || [],
        pagination: {
          page,
          limit,
          returned: (cursos || []).length
        }
      }
    });
  } catch (error) {
    console.error('Error en getMisCursosProfesor:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};
