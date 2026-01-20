// src/controllers/passwordResetController.js
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

const FRONTEND_URL = process.env.FRONTENDURL || 'http://localhost:5173';

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Respuesta genérica (solo para "no existe" o para no filtrar demasiado)
    const genericOk = () =>
      res.json({
        success: true,
        message: 'Si el correo existe, se enviará un link para restablecer la contraseña.',
      });

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'Email es requerido' });
    }

    // Buscar usuario
    const { data: user, error: userErr } = await supabase
      .from('usuario')
      .select('id, email, nombre, password_hash')
      .eq('email', email)
      .maybeSingle();

    if (userErr) throw userErr;

    // Si no existe, responder genérico
    if (!user?.id) return genericOk();

    // Si no tiene password_hash => cuenta Google (no password local)
    // PEDIDO: responder explícito
    if (!user.password_hash) {
      return res.status(400).json({
        success: false,
        message: 'Esta cuenta es de Google (sin contraseña). Debes iniciar sesión con Google.',
      });
    }

    // Generar token (se manda en claro por email, se guarda HASH en BD)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 min

    // Guardar hash + expiración
    const { error: upErr } = await supabase
      .from('usuario')
      .update({
        reset_token_hash: tokenHash,
        reset_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (upErr) throw upErr;

    // Link al front (tu front debe leer token+email y llamar POST /reset-password)
    const resetLink = `${FRONTEND_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(
      email
    )}`;

    // Enviar correo
    await sendPasswordResetEmail({
      to: email,
      nombre: user?.nombre || null,
      resetLink,
    });

    // Responder OK (puedes dejar genérico o algo como "Revisa tu correo")
    return genericOk();
  } catch (error) {
    console.error('forgotPassword error:', error);
    return res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
};

/**
 * POST /api/auth/reset-password
 * Body: { email, token, newPassword }
 */
export const resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'email, token y newPassword son requeridos',
      });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres',
      });
    }

    const tokenHash = sha256(token);

    const { data: user, error: userErr } = await supabase
      .from('usuario')
      .select('id, reset_token_hash, reset_token_expires_at, password_hash')
      .eq('email', email)
      .maybeSingle();

    if (userErr) throw userErr;

    if (!user?.id) {
      return res.status(400).json({ success: false, message: 'Token inválido' });
    }

    // Google => no password local
    if (!user.password_hash) {
      return res.status(400).json({
        success: false,
        message: 'Esta cuenta es de Google (sin contraseña). Inicia sesión con Google.',
      });
    }

    if (!user.reset_token_hash || user.reset_token_hash !== tokenHash) {
      return res.status(400).json({ success: false, message: 'Token inválido' });
    }

    const exp = user.reset_token_expires_at ? new Date(user.reset_token_expires_at) : null;
    if (!exp || Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'Token expirado. Solicita uno nuevo.' });
    }

    // Hashear nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    // Actualizar password + invalidar token
    const { error: upErr } = await supabase
      .from('usuario')
      .update({
        password_hash: newHash,
        reset_token_hash: null,
        reset_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (upErr) throw upErr;

    return res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    console.error('resetPassword error:', error);
    return res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
};
