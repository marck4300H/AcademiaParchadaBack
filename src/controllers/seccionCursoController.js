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

    // Subir video (opcional pero CU-056 lo pide cuando haya archivo)
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

    const { data, error } = await supabase
      .from('seccion_curso')
      .select('*')
      .eq('curso_id', cursoId)
      .order('orden', { ascending: true });

    if (error) throw error;

    return res.json({ success: true, data: { secciones: data || [] } });
  } catch (error) {
    console.error('listarSeccionesCurso:', error);
    return res.status(500).json({ success: false, message: 'Error listando secciones', error: error.message });
  }
};
