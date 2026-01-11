// src/controllers/sesionDocumentoController.js
import { supabase } from '../config/supabase.js';
import { uploadToSupabaseBucket, removeFromSupabaseBucket, safeName } from '../services/storageService.js';

const BUCKET = 'pdfs';
const ALLOWED = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar'
]);

export const uploadDocumentoSesion = async (req, res) => {
  try {
    const { sesionId } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Archivo requerido (field: file)' });
    }
    if (!ALLOWED.has(req.file.mimetype)) {
      return res.status(400).json({ success: false, message: `Tipo no permitido: ${req.file.mimetype}` });
    }

    // traer sesión para permisos (profesor solo su sesión; estudiante solo si es dueño por compra)
    const { data: sesion, error } = await supabase
      .from('sesion_clase')
      .select(`
        id,
        profesor_id,
        documento_path,
        compra:compra_id (
          id,
          estudiante_id
        )
      `)
      .eq('id', sesionId)
      .single();

    if (error || !sesion) return res.status(404).json({ success: false, message: 'Sesión no encontrada' });

    // permisos
    if (req.user.rol === 'profesor' && sesion.profesor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta sesión' });
    }
    if (req.user.rol === 'estudiante' && sesion?.compra?.estudiante_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta sesión' });
    }

    // borrar anterior si existía
    if (sesion.documento_path) {
      await removeFromSupabaseBucket({ bucket: BUCKET, path: sesion.documento_path });
    }

    const filename = safeName(req.file.originalname);
    const path = `sesiones/${sesionId}/${Date.now()}_${filename}`;

    const up = await uploadToSupabaseBucket({
      bucket: BUCKET,
      fileBuffer: req.file.buffer,
      mimetype: req.file.mimetype,
      path
    });

    const { data: updated, error: uErr } = await supabase
      .from('sesion_clase')
      .update({
        documento_url: up.publicUrl,
        documento_path: up.path,
        updated_at: new Date().toISOString()
      })
      .eq('id', sesionId)
      .select('id, documento_url, documento_path')
      .single();

    if (uErr) throw uErr;

    return res.status(200).json({
      success: true,
      message: 'Documento actualizado',
      data: { sesion: updated }
    });
  } catch (err) {
    console.error('uploadDocumentoSesion:', err);
    return res.status(500).json({ success: false, message: 'Error interno', error: err.message });
  }
};
