// src/controllers/materialEstudioController.js
import { supabase } from '../config/supabase.js';
import { uploadToSupabaseBucket, removeFromSupabaseBucket, safeName } from '../services/storageService.js';
import { uploadBufferToCloudinary, deleteFromCloudinary } from '../services/cloudinaryService.js';

const MAX_SUPABASE_BYTES = 8 * 1024 * 1024; // 8MB (ajústalo)
const SUPABASE_BUCKET_PDFS = 'pdfs';

const ALLOWED_MIME = new Set([
  // pdf
  'application/pdf',

  // doc / docx
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  // images
  'image/png',
  'image/jpeg',
  'image/webp',

  // zip/rar (ojo: rar puede variar por cliente)
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',

  // txt (opcional)
  'text/plain'
]);

function ensureMimeAllowed(file) {
  if (!file) return;
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new Error(`Tipo de archivo no permitido: ${file.mimetype}`);
  }
}

async function assertProfesorCanManageCurso({ cursoId, user }) {
  if (user.rol === 'administrador') return;

  const { data: curso, error } = await supabase
    .from('curso')
    .select('id, profesor_id')
    .eq('id', cursoId)
    .single();

  if (error || !curso) throw new Error('Curso no encontrado');
  if (curso.profesor_id !== user.id) throw new Error('No tienes permiso para gestionar material de este curso');
}

async function assertProfesorCanManageSesion({ sesionClaseId, user }) {
  if (user.rol === 'administrador') return;

  const { data: sesion, error } = await supabase
    .from('sesion_clase')
    .select('id, profesor_id')
    .eq('id', sesionClaseId)
    .single();

  if (error || !sesion) throw new Error('Sesión no encontrada');
  if (sesion.profesor_id !== user.id) throw new Error('No tienes permiso para gestionar material de esta sesión');
}

/**
 * POST /api/material-estudio
 * Roles: administrador, profesor
 * multipart/form-data:
 * - file: (archivo)
 * - titulo: string
 * - tipo: documento|video|otro|imagen
 * - curso_id (opcional)
 * - sesion_clase_id (opcional)
 */
export const createMaterialEstudio = async (req, res) => {
  try {
    const { titulo, tipo, curso_id, sesion_clase_id } = req.body;

    if (!titulo || !tipo) {
      return res.status(400).json({ success: false, message: 'titulo y tipo son obligatorios' });
    }

    if (!curso_id && !sesion_clase_id) {
      return res.status(400).json({ success: false, message: 'Debes enviar curso_id o sesion_clase_id' });
    }

    // Permisos: profesor solo lo suyo
    if (curso_id) await assertProfesorCanManageCurso({ cursoId: curso_id, user: req.user });
    if (sesion_clase_id) await assertProfesorCanManageSesion({ sesionClaseId: sesion_clase_id, user: req.user });

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Archivo requerido (field: file)' });
    }

    ensureMimeAllowed(req.file);

    let archivo_url = null;
    let storage_provider = 'supabase';
    let storage_path = null;
    let cloudinary_public_id = null;

    const mustGoCloudinary = tipo === 'video' || req.file.size > MAX_SUPABASE_BYTES;

    if (mustGoCloudinary) {
      const up = await uploadBufferToCloudinary({
        buffer: req.file.buffer,
        folder: 'material-estudio',
        resource_type: tipo === 'video' ? 'video' : 'auto'
      });

      archivo_url = up.url;
      storage_provider = 'cloudinary';
      cloudinary_public_id = up.public_id;
    } else {
      const filename = safeName(req.file.originalname);
      const base = curso_id ? `cursos/${curso_id}` : `sesiones/${sesion_clase_id}`;
      storage_path = `${base}/${Date.now()}_${filename}`;

      const up = await uploadToSupabaseBucket({
        bucket: SUPABASE_BUCKET_PDFS,
        fileBuffer: req.file.buffer,
        mimetype: req.file.mimetype,
        path: storage_path
      });

      archivo_url = up.publicUrl;
      storage_provider = 'supabase';
    }

    const payload = {
      titulo,
      tipo,
      curso_id: curso_id || null,
      sesion_clase_id: sesion_clase_id || null,
      archivo_url,
      storage_provider,
      storage_path,
      cloudinary_public_id,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('material_estudio')
      .insert([payload])
      .select('*')
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: 'Material creado exitosamente',
      data: { material: data }
    });
  } catch (error) {
    console.error('createMaterialEstudio:', error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/material-estudio
 * query: curso_id | sesion_clase_id
 * Roles: público (si quieres) o autenticado (recomendado)
 *
 * Nota: si quieres control de acceso por compra/inscripción, se agrega después.
 */
export const listMaterialEstudio = async (req, res) => {
  try {
    const { curso_id, sesion_clase_id } = req.query;

    if (!curso_id && !sesion_clase_id) {
      return res.status(400).json({ success: false, message: 'Debes enviar curso_id o sesion_clase_id' });
    }

    let query = supabase
      .from('material_estudio')
      .select('*')
      .order('created_at', { ascending: false });

    if (curso_id) query = query.eq('curso_id', curso_id);
    if (sesion_clase_id) query = query.eq('sesion_clase_id', sesion_clase_id);

    const { data, error } = await query;
    if (error) throw error;

    return res.status(200).json({ success: true, data: { materiales: data || [] } });
  } catch (error) {
    console.error('listMaterialEstudio:', error);
    return res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
};

/**
 * DELETE /api/material-estudio/:id
 * Roles: administrador, profesor (solo lo suyo)
 */
export const deleteMaterialEstudio = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: material, error: mErr } = await supabase
      .from('material_estudio')
      .select('*')
      .eq('id', id)
      .single();

    if (mErr || !material) {
      return res.status(404).json({ success: false, message: 'Material no encontrado' });
    }

    // permisos profesor
    if (req.user.rol === 'profesor') {
      if (material.curso_id) await assertProfesorCanManageCurso({ cursoId: material.curso_id, user: req.user });
      if (material.sesion_clase_id) await assertProfesorCanManageSesion({ sesionClaseId: material.sesion_clase_id, user: req.user });
    }

    // borrar archivo físico primero
    if (material.storage_provider === 'supabase') {
      await removeFromSupabaseBucket({ bucket: SUPABASE_BUCKET_PDFS, path: material.storage_path });
    } else if (material.storage_provider === 'cloudinary') {
      await deleteFromCloudinary({ public_id: material.cloudinary_public_id, resource_type: material.tipo === 'video' ? 'video' : 'auto' });
    }

    // borrar registro
    const { error: dErr } = await supabase.from('material_estudio').delete().eq('id', id);
    if (dErr) throw dErr;

    return res.status(200).json({ success: true, message: 'Material eliminado correctamente' });
  } catch (error) {
    console.error('deleteMaterialEstudio:', error);
    return res.status(400).json({ success: false, message: error.message });
  }
};
