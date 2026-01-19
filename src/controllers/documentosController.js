// src/controllers/documentosController.js
import dotenv from 'dotenv';
import { supabase } from '../config/supabase.js';

dotenv.config();

const BUCKET_DOCUMENTOS = process.env.SUPABASE_BUCKET_DOCUMENTOS || 'pdfs';
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/octet-stream',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain'
]);

const safeName = (name = 'archivo') =>
  String(name)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '');

const buildDocPath = ({ estudianteId, originalname }) => {
  const base = safeName(originalname || 'documento');
  const ts = Date.now();
  return `documentos/clases_personalizadas/${estudianteId || 'anon'}/${ts}-${base}`;
};

const uploadToSupabase = async ({ bucket, path, buffer, contentType }) => {
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true
  });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: pub?.publicUrl || null, path };
};

/**
 * POST /api/documentos/clase-personalizada
 * Sube documento ANTES del pago Wompi
 */
export const uploadDocumentoClasePersonalizada = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'documento es requerido (File).' });
    }

    if (req.file.size > MAX_FILE_BYTES) {
      return res.status(400).json({ success: false, message: 'Archivo demasiado grande (máx 25MB).' });
    }

    const mimetype = req.file.mimetype || 'application/octet-stream';
    if (!ALLOWED_MIME.has(mimetype)) {
      return res.status(400).json({ success: false, message: `Tipo de archivo no permitido: ${mimetype}` });
    }

    const estudianteId = req.user?.id || null; // si viene token
    const path = buildDocPath({ estudianteId, originalname: req.file.originalname });

    const up = await uploadToSupabase({
      bucket: BUCKET_DOCUMENTOS,
      path,
      buffer: req.file.buffer,
      contentType: mimetype
    });

    return res.status(201).json({
      success: true,
      message: 'Documento subido exitosamente',
      data: {
        documento_url: up.publicUrl,
        documento_path: up.path,
        content_type: mimetype,
        size: req.file.size
      }
    });
  } catch (error) {
    console.error('❌ Error uploadDocumentoClasePersonalizada:', error);
    return res.status(500).json({
      success: false,
      message: 'Error subiendo documento',
      error: error.message
    });
  }
};
