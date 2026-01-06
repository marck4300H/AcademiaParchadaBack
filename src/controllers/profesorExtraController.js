// src/controllers/profesorExtraController.js
import { supabase } from '../config/supabase.js';

/**
 * CU-042 (Curso): Ver inscritos de un curso
 * GET /api/profesor/cursos/:cursoId/inscritos
 * Requiere: profesor (dueño del curso)
 */
export const getInscritosCursoProfesor = async (req, res) => {
  try {
    const profesorId = req.user.id;
    const { cursoId } = req.params;

    // Verificar que el curso pertenece al profesor autenticado
    const { data: curso, error: errCurso } = await supabase
      .from('curso')
      .select('id, profesor_id, nombre')
      .eq('id', cursoId)
      .single();

    if (errCurso || !curso) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    }

    if (curso.profesor_id !== profesorId) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para ver inscritos de este curso' });
    }

    const { data: inscripciones, error } = await supabase
      .from('inscripcion_curso')
      .select(`
        id,
        fecha_inscripcion,
        estudiante:estudiante_id (
          id,
          nombre,
          apellido,
          email,
          telefono,
          rol
        )
      `)
      .eq('curso_id', cursoId)
      .order('fecha_inscripcion', { ascending: false });

    if (error) throw error;

    return res.json({
      success: true,
      data: {
        curso: { id: curso.id, nombre: curso.nombre },
        inscritos: inscripciones || [],
        total: (inscripciones || []).length
      }
    });
  } catch (error) {
    console.error('Error en getInscritosCursoProfesor:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

/**
 * CU-042 (Clase): Ver detalle de una sesión (incluye estudiante + clase/asignatura)
 * GET /api/profesor/clases/:sesionId
 * Requiere: profesor asignado a la sesión
 */
export const getDetalleSesionProfesor = async (req, res) => {
  try {
    const profesorId = req.user.id;
    const { sesionId } = req.params;

    const { data: sesion, error } = await supabase
      .from('sesion_clase')
      .select(`
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
          moneda
        )
      `)
      .eq('id', sesionId)
      .single();

    if (error || !sesion) {
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    if (sesion.profesor_id !== profesorId) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para ver esta sesión' });
    }

    // Estudiante
    let estudiante = null;
    if (sesion?.compra?.estudiante_id) {
      const { data: est } = await supabase
        .from('usuario')
        .select('id, nombre, apellido, email, telefono, rol')
        .eq('id', sesion.compra.estudiante_id)
        .single();
      estudiante = est || null;
    }

    // Clase personalizada + asignatura
    let clase_personalizada = null;
    if (sesion?.compra?.clase_personalizada_id) {
      const { data: clase } = await supabase
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
        .eq('id', sesion.compra.clase_personalizada_id)
        .single();
      clase_personalizada = clase || null;
    }

    return res.json({
      success: true,
      data: {
        sesion,
        estudiante,
        clase_personalizada
      }
    });
  } catch (error) {
    console.error('Error en getDetalleSesionProfesor:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};
