import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { generateToken } from '../utils/jwt.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * CU-001: Registro de Usuario (Estudiante)
 * POST /api/auth/register
 */
export const register = async (req, res) => {
  try {
    const { email, password, nombre, apellido, telefono } = req.body;

    // 1. Verificar si el usuario ya existe
    const { data: existingUser, error: checkError } = await supabase
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
      .insert([
        {
          email,
          password_hash: passwordHash,
          nombre,
          apellido,
          telefono: telefono || null,
          rol: 'estudiante'
        }
      ])
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

    // 5. Enviar email de bienvenida (CU-051)
    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: email,
        subject: '¡Bienvenido a Academia Parchada!',
        html: `
          <h1>¡Hola ${nombre}!</h1>
          <p>Bienvenido a <strong>Academia Parchada</strong>, tu plataforma de aprendizaje personalizado.</p>
          <p>Tu cuenta ha sido creada exitosamente. Ya puedes acceder a todos nuestros cursos y clases personalizadas.</p>
          <p><strong>Email:</strong> ${email}</p>
          <p>Si tienes alguna duda, no dudes en contactarnos.</p>
          <br>
          <p>¡Éxitos en tu aprendizaje!</p>
        `
      });
    } catch (emailError) {
      console.error('Error al enviar email de bienvenida:', emailError);
      // No fallar el registro si el email falla
    }

    // 6. Respuesta exitosa
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          nombre: newUser.nombre,
          apellido: newUser.apellido,
          telefono: newUser.telefono,
          rol: newUser.rol
        },
        token
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
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

    // 1. Buscar usuario por email
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

    // 2. Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // 3. Generar JWT
    const token = generateToken({
      id: user.id,
      email: user.email,
      rol: user.rol
    });

    // 4. Respuesta exitosa
    res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          apellido: user.apellido,
          telefono: user.telefono,
          rol: user.rol
        },
        token
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-004: Cierre de Sesión
 * POST /api/auth/logout
 * Nota: Con JWT, el logout es manejado en el frontend eliminando el token
 */
export const logout = async (req, res) => {
  try {
    // En una implementación con JWT, el logout es principalmente del lado del cliente
    // Aquí podríamos implementar una blacklist de tokens si es necesario
    
    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cerrar sesión',
      error: error.message
    });
  }
};

/**
 * Obtener usuario actual (útil para verificar sesión)
 * GET /api/auth/me
 */
export const getMe = async (req, res) => {
  try {
    // req.user viene del middleware de autenticación
    const { data: user, error } = await supabase
      .from('usuario')
      .select('id, email, nombre, apellido, telefono, rol, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};
