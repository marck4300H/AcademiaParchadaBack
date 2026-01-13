// src/controllers/seccionCursoController.js
import { supabase } from '../config/supabase.js';
import { uploadBufferToCloudinary } from '../services/cloudinaryService.js';

export const crearSeccionCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { titulo, descripcion, orden } = req.body;

    if (!cursoId) return res.status(400).json({ success: false, message: 'cursoId es requerido' });
    if (!titulo || !orden) return res.status(400).json({ success: false, message: 'titulo y orden son requeridos' });

    const ordenNum = Number(orden);
    if (!Number.isFinite(ordenNum) || ordenNum <= 0) {
      return res.status(400).json({ success: false, message: 'orden debe ser un número > 0' });
    }

    // Subir video (opcional)
    let video_url = null;
    if (req.file) {
      const up = await uploadBufferToCloudinary({
        buffer: req.file.buffer,
        folder: 'cursos/secciones',
        resource_type: 'video'
      });
      video_url = up.url;
    }

    const { data, error } = await supabase
      .from('seccion_curso')
      .insert([{
        curso_id: cursoId,
        titulo,
        descripcion: descripcion || null,
        orden: ordenNum,
        video_url
      }])
      .select('*')
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, data: { seccion: data } });
  } catch (error) {
    console.error('crearSeccionCurso:', error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const listarSeccionesCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;

    if (!cursoId) {
      return res.status(400).json({ success: false, message: 'cursoId es requerido' });
    }

    // Estudiante: debe estar inscrito. Admin/Profesor: puede ver sin inscripción.
    if (req.user?.rol === 'estudiante') {
      const { data: insc, error: inscErr } = await supabase
        .from('inscripcion_curso')
        .select('id')
        .eq('estudiante_id', req.user.id)
        .eq('curso_id', cursoId)
        .maybeSingle();

      if (inscErr) throw inscErr;

      if (!insc?.id) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este curso. Debes comprarlo primero.'
        });
      }
    }

    const { data, error } = await supabase
      .from('seccion_curso')
      .select('*')
      .eq('curso_id', cursoId)
      .order('orden', { ascending: true });

    if (error) throw error;

    return res.json({ success: true, data: { secciones: data || [] } });
  } catch (error) {
    console.error('listarSeccionesCurso:', error);
    return res.status(500).json({
      success: false,
      message: 'Error listando secciones',
      error: error.message
    });
  }
};

/**
 * Editar sección (Admin)
 * Permite actualizar: titulo, descripcion, orden y opcionalmente reemplazar video.
 */
export const editarSeccionCurso = async (req, res) => {
  try {
    const { cursoId, seccionId } = req.params;
    const { titulo, descripcion, orden } = req.body;

    if (!cursoId) return res.status(400).json({ success: false, message: 'cursoId es requerido' });
    if (!seccionId) return res.status(400).json({ success: false, message: 'seccionId es requerido' });

    // Verificar que existe y que pertenece al curso
    const { data: existente, error: errExist } = await supabase
      .from('seccion_curso')
      .select('*')
      .eq('id', seccionId)
      .eq('curso_id', cursoId)
      .single();

    if (errExist || !existente) {
      return res.status(404).json({ success: false, message: 'Sección no encontrada para este curso' });
    }

    const updateData = {};

    if (titulo !== undefined) updateData.titulo = titulo;
    if (descripcion !== undefined) updateData.descripcion = descripcion ?? null;

    if (orden !== undefined) {
      const ordenNum = Number(orden);
      if (!Number.isFinite(ordenNum) || ordenNum <= 0) {
        return res.status(400).json({ success: false, message: 'orden debe ser un número > 0' });
      }
      updateData.orden = ordenNum;
    }

    // Reemplazar video si viene archivo
    if (req.file) {
      const up = await uploadBufferToCloudinary({
        buffer: req.file.buffer,
        folder: 'cursos/secciones',
        resource_type: 'video'
      });
      updateData.video_url = up.url;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No hay campos para actualizar' });
    }

    const { data: updated, error: errUpd } = await supabase
      .from('seccion_curso')
      .update(updateData)
      .eq('id', seccionId)
      .eq('curso_id', cursoId)
      .select('*')
      .single();

    if (errUpd) throw errUpd;

    return res.json({ success: true, message: 'Sección actualizada', data: { seccion: updated } });
  } catch (error) {
    console.error('editarSeccionCurso:', error);
    return res.status(500).json({ success: false, message: 'Error actualizando sección', error: error.message });
  }
};

/**
 * Eliminar sección (Admin)
 */
export const eliminarSeccionCurso = async (req, res) => {
  try {
    const { cursoId, seccionId } = req.params;

    if (!cursoId) return res.status(400).json({ success: false, message: 'cursoId es requerido' });
    if (!seccionId) return res.status(400).json({ success: false, message: 'seccionId es requerido' });

    // Verificar que existe y que pertenece al curso
    const { data: existente, error: errExist } = await supabase
      .from('seccion_curso')
      .select('id')
      .eq('id', seccionId)
      .eq('curso_id', cursoId)
      .single();

    if (errExist || !existente) {
      return res.status(404).json({ success: false, message: 'Sección no encontrada para este curso' });
    }

    const { error: errDel } = await supabase
      .from('seccion_curso')
      .delete()
      .eq('id', seccionId)
      .eq('curso_id', cursoId);

    if (errDel) throw errDel;

    return res.json({ success: true, message: 'Sección eliminada' });
  } catch (error) {
    console.error('eliminarSeccionCurso:', error);
    return res.status(500).json({ success: false, message: 'Error eliminando sección', error: error.message });
  }
};
