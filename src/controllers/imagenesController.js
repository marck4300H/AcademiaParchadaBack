// src/controllers/imagenesController.js
import { supabase } from '../config/supabase.js';
import { uploadToSupabaseBucket, removeFromSupabaseBucket, buildImagePath } from '../services/storageService.js';

export const uploadCursoImage = async (req, res) => {
  try {
    const { id: cursoId } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'Archivo requerido (field: image)' });

    // validar curso existe
    const { data: curso, error: errCurso } = await supabase.from('curso').select('id, imagen_path').eq('id', cursoId).single();
    if (errCurso || !curso) return res.status(404).json({ success: false, message: 'Curso no encontrado' });

    const path = buildImagePath({ entity: 'cursos', entityId: cursoId, mimetype: req.file.mimetype });

    // borrar anterior si existía
    if (curso.imagen_path) {
      await removeFromSupabaseBucket({ bucket: 'images', path: curso.imagen_path });
    }

    const uploaded = await uploadToSupabaseBucket({
      bucket: 'images',
      fileBuffer: req.file.buffer,
      mimetype: req.file.mimetype,
      path
    });

    const { data: updated, error: errUp } = await supabase
      .from('curso')
      .update({ imagen_url: uploaded.publicUrl, imagen_path: uploaded.path, updated_at: new Date().toISOString() })
      .eq('id', cursoId)
      .select('id, imagen_url, imagen_path')
      .single();

    if (errUp) throw errUp;

    return res.json({ success: true, message: 'Imagen de curso actualizada', data: { curso: updated } });
  } catch (error) {
    console.error('uploadCursoImage:', error);
    return res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
};

export const uploadClaseImage = async (req, res) => {
  try {
    const { id: claseId } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'Archivo requerido (field: image)' });

    const { data: clase, error: errClase } = await supabase.from('clase_personalizada').select('id, imagen_path').eq('id', claseId).single();
    if (errClase || !clase) return res.status(404).json({ success: false, message: 'Clase personalizada no encontrada' });

    const path = buildImagePath({ entity: 'clases', entityId: claseId, mimetype: req.file.mimetype });

    if (clase.imagen_path) {
      await removeFromSupabaseBucket({ bucket: 'images', path: clase.imagen_path });
    }

    const uploaded = await uploadToSupabaseBucket({
      bucket: 'images',
      fileBuffer: req.file.buffer,
      mimetype: req.file.mimetype,
      path
    });

    const { data: updated, error: errUp } = await supabase
      .from('clase_personalizada')
      .update({ imagen_url: uploaded.publicUrl, imagen_path: uploaded.path, updated_at: new Date().toISOString() })
      .eq('id', claseId)
      .select('id, imagen_url, imagen_path')
      .single();

    if (errUp) throw errUp;

    return res.json({ success: true, message: 'Imagen de clase actualizada', data: { clase_personalizada: updated } });
  } catch (error) {
    console.error('uploadClaseImage:', error);
    return res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
};
