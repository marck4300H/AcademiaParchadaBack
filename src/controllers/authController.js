// src/controllers/authController.js

import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { generateToken } from '../utils/jwt.js';
import { sendWelcomeEmail } from '../services/emailService.js';

const splitNombreApellido = (fullNameRaw) => {
  const fullName = String(fullNameRaw || '').trim().replace(/\s+/g, ' ');
  if (!fullName) return { nombre: 'Estudiante', apellido: '-' };

  const parts = fullName.split(' ');
  if (parts.length === 1) return { nombre: parts[0], apellido: '-' };

  return {
    nombre: parts.slice(0, -1).join(' '),
    apellido: parts.slice(-1).join(' ')
  };
};

/**
 * CU-001: Registro de Usuario (Estudiante)
 * POST /api/auth/register
 * + CU-051: Email de bienvenida
 */
export const register = async (req, res) => {
  try {
    const { email, password, nombre, apellido, telefono, timezone } = req.body;

    // 1. Verificar si el usuario ya existe
    const { data: existingUser } = await supabase
      .from('usuario')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'El email ya está registrado'
      });
    }

    // 2. Hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Crear el usuario en la base de datos
    const { data: newUser, error: insertError } = await supabase
      .from('usuario')
      .insert([{
        email,
        password_hash: passwordHash,
        nombre,
        apellido,
        telefono: telefono || null,
        timezone: timezone || 'America/Bogota',
        rol: 'estudiante'
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Error al crear usuario:', insertError);
      return res.status(500).json({
        success: false,
        message: 'Error al crear el usuario',
        error: insertError.message
      });
    }

    // 4. Generar JWT
    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      rol: newUser.rol
    });

    // 5. Email bienvenida (no bloquea)
    await sendWelcomeEmail({ to: email, nombre });

    // 6. Respuesta exitosa
    return res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          nombre: newUser.nombre,
          apellido: newUser.apellido,
          telefono: newUser.telefono,
          timezone: newUser.timezone,
          rol: newUser.rol
        },
        token
      }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-002: Inicio de Sesión
 * POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: user, error: findError } = await supabase
      .from('usuario')
      .select('*')
      .eq('email', email)
      .single();

    if (findError || !user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Si el usuario se creó con Google y no tiene password_hash, no puede usar login por password
    if (!user.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'Este usuario debe iniciar sesión con Google'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      rol: user.rol
    });

    return res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          apellido: user.apellido,
          telefono: user.telefono,
          timezone: user.timezone,
          rol: user.rol
        },
        token
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Login/Registro con Google (solo estudiante)
 * POST /api/auth/google
 * Body: { access_token }
 *
 * El access_token lo obtiene el frontend desde Supabase Auth (Google OAuth).
 */
export const loginGoogle = async (req, res) => {
  try {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({
        success: false,
        message: 'Falta access_token'
      });
    }

    // 1) Validar token con Supabase y obtener perfil
    // Nota: el cliente Supabase en backend usa SERVICE_ROLE_KEY, por eso puede consultar auth.
    const { data, error } = await supabase.auth.getUser(access_token);

    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        message: 'Token de Google/Supabase inválido o expirado'
      });
    }

    const sbUser = data.user;
    const email = String(sbUser.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Google no devolvió email'
      });
    }

    const meta = sbUser.user_metadata || {};
    const fullName = meta.full_name || meta.name || meta.nombre || '';

    const { nombre, apellido } = splitNombreApellido(fullName);

    // 2) Buscar usuario local
    const { data: existing, error: findErr } = await supabase
      .from('usuario')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (findErr) throw findErr;

    let user = existing;

    // 3) Si no existe, crear como estudiante (password_hash NULL)
    if (!user) {
      const { data: created, error: createErr } = await supabase
        .from('usuario')
        .insert([{
          email,
          password_hash: null,
          nombre,
          apellido,
          telefono: null,
          timezone: 'America/Bogota',
          rol: 'estudiante'
        }])
        .select('*')
        .single();

      if (createErr) {
        console.error('Error creando usuario Google:', createErr);
        return res.status(500).json({
          success: false,
          message: 'Error al crear usuario con Google',
          error: createErr.message
        });
      }

      user = created;

      // Email bienvenida (no bloquea)
      await sendWelcomeEmail({ to: user.email, nombre: user.nombre });
    }

    // 4) Forzar que solo sea estudiante
    if (user.rol !== 'estudiante') {
      return res.status(403).json({
        success: false,
        message: 'Este acceso con Google solo está habilitado para estudiantes'
      });
    }

    // 5) Emitir JWT propio
    const token = generateToken({
      id: user.id,
      email: user.email,
      rol: user.rol
    });

    return res.json({
      success: true,
      message: 'Inicio de sesión con Google exitoso',
      data: {
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          apellido: user.apellido,
          telefono: user.telefono,
          timezone: user.timezone,
          rol: user.rol
        },
        token
      }
    });
  } catch (error) {
    console.error('Error en loginGoogle:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-004: Cierre de Sesión
 * POST /api/auth/logout
 */
export const logout = async (req, res) => {
  try {
    return res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });
  } catch (error) {
    console.error('Error en logout:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al cerrar sesión',
      error: error.message
    });
  }
};

/**
 * GET /api/auth/me
 */
export const getMe = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('usuario')
      .select('id, email, nombre, apellido, telefono, timezone, rol, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    return res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};
