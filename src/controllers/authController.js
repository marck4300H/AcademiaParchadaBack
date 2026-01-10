// src/controllers/authController.js

import bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';

import { supabase } from '../config/supabase.js';
import { generateToken } from '../utils/jwt.js';
import { sendWelcomeEmail } from '../services/emailService.js';

/**
 * CU-001: Registro de Usuario (Estudiante)
 * POST /api/auth/register
 * + CU-051: Email de bienvenida
 */
export const register = async (req, res) => {
  try {
    const { email, password, nombre, apellido, telefono, timezone } = req.body;

    // Validar timezone (por seguridad, además del validator)
    const tz = timezone || 'America/Bogota';
    if (!DateTime.now().setZone(tz).isValid) {
      return res.status(400).json({
        success: false,
        message: 'Timezone inválido (debe ser IANA, ej: America/Bogota)',
      });
    }

    // 1. Verificar si el usuario ya existe
    const { data: existingUser } = await supabase
      .from('usuario')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'El email ya está registrado',
      });
    }

    // 2. Hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Crear el usuario en la base de datos
    const { data: newUser, error: insertError } = await supabase
      .from('usuario')
      .insert([
        {
          email,
          password_hash: passwordHash,
          nombre,
          apellido,
          telefono: telefono || null,
          rol: 'estudiante',
          timezone: tz,
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Error al crear usuario:', insertError);
      return res.status(500).json({
        success: false,
        message: 'Error al crear el usuario',
        error: insertError.message,
      });
    }

    // 4. Generar JWT
    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      rol: newUser.rol,
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
          rol: newUser.rol,
          timezone: newUser.timezone,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Error en registro:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
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
        message: 'Credenciales inválidas',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      rol: user.rol,
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
          rol: user.rol,
          timezone: user.timezone || 'America/Bogota',
        },
        token,
      },
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
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
      message: 'Sesión cerrada exitosamente',
    });
  } catch (error) {
    console.error('Error en logout:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al cerrar sesión',
      error: error.message,
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
      .select('id, email, nombre, apellido, telefono, rol, timezone, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }

    return res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
    });
  }
};
