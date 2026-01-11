// src/services/storageService.js
import { supabase } from '../config/supabase.js';

export async function uploadToSupabaseBucket({ bucket, fileBuffer, mimetype, path, upsert = true }) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, fileBuffer, { contentType: mimetype, upsert });

  if (error) throw new Error(`Supabase upload error: ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  return {
    bucket,
    path,
    publicUrl: data?.publicUrl || null
  };
}

export async function removeFromSupabaseBucket({ bucket, path }) {
  if (!path) return;

  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(`Supabase remove error: ${error.message}`);
}

/**
 * Sanitiza nombres para rutas de storage
 */
export function safeName(name) {
  return (name || 'file').replace(/[^\w.\-]+/g, '_');
}

/**
 * Construye paths consistentes para imágenes (cursos/clases).
 * Ejemplos:
 *  - cursos/123/1700000000000_banner.png
 *  - clases-personalizadas/55/1700000000000_portada.jpg
 */
export function buildImagePath({ entity, id, originalname }) {
  const filename = safeName(originalname);
  const base = entity === 'curso' ? 'cursos' : 'clases-personalizadas';
  return `${base}/${id}/${Date.now()}_${filename}`;
}
