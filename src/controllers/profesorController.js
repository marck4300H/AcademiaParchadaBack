import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { Resend } from 'resend';
import { sendCredencialesProfesorEmail } from '../services/emailService.js';


const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Función auxiliar para generar contraseña temporal
 * @returns {string} Contraseña de 8 caracteres aleatorios
 */
const generateTempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

/**
 * CU-009: Crear Profesor
 * POST /api/profesores
 * Acceso: admin
 */
export const createProfesor = async (req, res) => {
  try {
    const { email, nombre, apellido, telefono, asignaturas, timezone } = req.body;

    // 1) Verificar que el email no exista
    const { data: existingUser, error: existingErr } = await supabase
      .from('usuario')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingErr) {
      console.error('Error verificando email existente:', existingErr);
      return res.status(500).json({
        success: false,
        message: 'Error verificando email del profesor',
        error: existingErr.message
      });
    }

    if (existingUser?.id) {
      return res.status(400).json({ success: false, message: 'El email ya está registrado' });
    }

    // 2) Verificar asignaturas
    const { data: asignaturasExistentes, error: asignaturasError } = await supabase
      .from('asignatura')
      .select('id')
      .in('id', asignaturas || []);

    if (asignaturasError) {
      return res.status(500).json({
        success: false,
        message: 'Error verificando asignaturas',
        error: asignaturasError.message
      });
    }

    if (!Array.isArray(asignaturas) || asignaturas.length === 0) {
      return res.status(400).json({ success: false, message: 'asignaturas es obligatorio y debe ser un array con al menos 1 id' });
    }

    if ((asignaturasExistentes || []).length !== asignaturas.length) {
      return res.status(400).json({ success: false, message: 'Una o más asignaturas no existen' });
    }

    // 3) Generar contraseña temporal y hashearla
    const tempPassword = generateTempPassword();
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(tempPassword, salt);

    // 4) Crear usuario con rol 'profesor'
    const { data: newProfesor, error: insertError } = await supabase
      .from('usuario')
      .insert([
        {
          email,
          password_hash: passwordHash,
          nombre,
          apellido,
          telefono: telefono || null,
          rol: 'profesor',
          ...(timezone !== undefined ? { timezone } : {})
        }
      ])
      .select()
      .single();

    if (insertError || !newProfesor?.id) {
      console.error('Error al crear profesor:', insertError);
      return res.status(500).json({
        success: false,
        message: 'Error al crear el profesor',
        error: insertError?.message
      });
    }

    // 5) Insertar relaciones en profesor_asignatura
    const asignaturasRelaciones = asignaturas.map((asignaturaId) => ({
      profesor_id: newProfesor.id,
      asignatura_id: asignaturaId
    }));

    const { error: relacionError } = await supabase
      .from('profesor_asignatura')
      .insert(asignaturasRelaciones);

    if (relacionError) {
      // Rollback: eliminar el profesor creado
      await supabase.from('usuario').delete().eq('id', newProfesor.id);

      console.error('Error al asignar asignaturas:', relacionError);
      return res.status(500).json({
        success: false,
        message: 'Error al asignar asignaturas al profesor',
        error: relacionError.message
      });
    }

    // 6) Enviar email con credenciales (CU-055) usando emailService.js
    // No se revienta la creación si el correo falla (se deja log).
    try {
      await sendCredencialesProfesorEmail({
        to: email,
        nombre: `${nombre} ${apellido}`.trim(),
        email,
        passwordTemp: tempPassword
      });
    } catch (emailError) {
      console.error('Error al enviar email de credenciales (emailService):', emailError?.message || emailError);
    }

    // 7) Obtener asignaturas para la respuesta
    const { data: asignaturasData, error: asigRespErr } = await supabase
      .from('asignatura')
      .select('id, nombre')
      .in('id', asignaturas);

    if (asigRespErr) {
      console.error('Error trayendo asignaturas para respuesta:', asigRespErr);
    }

    // 8) Respuesta exitosa
    return res.status(201).json({
      success: true,
      message: 'Profesor creado exitosamente',
      data: {
        profesor: {
          id: newProfesor.id,
          email: newProfesor.email,
          nombre: newProfesor.nombre,
          apellido: newProfesor.apellido,
          telefono: newProfesor.telefono,
          rol: newProfesor.rol,
          timezone: newProfesor.timezone,
          asignaturas: asignaturasData || []
        },
        // ⚠️ Esto solo debería verse en admin; nunca exponerlo al front público.
        credenciales: {
          email,
          password_temporal: tempPassword
        }
      }
    });
  } catch (error) {
    console.error('Error en createProfesor:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * CU-010: Listar Profesores con sus asignaturas
 * GET /api/profesores?page=1&limit=10
 * Acceso: admin
 */
export const listProfesores = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // 1. Obtener profesores con paginación
    const { data: profesores, error: profesoresError, count } = await supabase
      .from('usuario')
      .select('id, email, nombre, apellido, telefono, timezone, created_at', { count: 'exact' })
      .eq('rol', 'profesor')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (profesoresError) {
      console.error('Error al obtener profesores:', profesoresError);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener profesores',
        error: profesoresError.message,
      });
    }

    // 2. Obtener asignaturas de cada profesor
    const profesoresIds = profesores.map((p) => p.id);

    const { data: relaciones, error: relacionesError } = await supabase
      .from('profesor_asignatura')
      .select(
        `
        profesor_id,
        asignatura:asignatura_id (
          id,
          nombre,
          descripcion
        )
      `
      )
      .in('profesor_id', profesoresIds);

    if (relacionesError) {
      console.error('Error al obtener asignaturas:', relacionesError);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener asignaturas de profesores',
        error: relacionesError.message,
      });
    }

    // 3. Mapear asignaturas a cada profesor
    const profesoresConAsignaturas = profesores.map((profesor) => ({
      ...profesor,
      asignaturas: relaciones
        .filter((rel) => rel.profesor_id === profesor.id)
        .map((rel) => rel.asignatura),
    }));

    // 4. Respuesta exitosa
    res.json({
      success: true,
      data: {
        profesores: profesoresConAsignaturas,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    console.error('Error en listProfesores:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

/**
 * Obtener profesor por ID con sus asignaturas
 * GET /api/profesores/:id
 * Acceso: admin
 */
export const getProfesorById = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Obtener profesor
    const { data: profesor, error: profesorError } = await supabase
      .from('usuario')
      .select('id, email, nombre, apellido, telefono, timezone, rol, created_at')
      .eq('id', id)
      .eq('rol', 'profesor')
      .single();

    if (profesorError || !profesor) {
      return res.status(404).json({ success: false, message: 'Profesor no encontrado' });
    }

    // 2. Obtener asignaturas del profesor
    const { data: relaciones, error: relacionesError } = await supabase
      .from('profesor_asignatura')
      .select(
        `
        asignatura:asignatura_id (
          id,
          nombre,
          descripcion
        )
      `
      )
      .eq('profesor_id', id);

    if (relacionesError) {
      console.error('Error al obtener asignaturas:', relacionesError);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener asignaturas del profesor',
        error: relacionesError.message,
      });
    }

    // 3. Respuesta exitosa
    res.json({
      success: true,
      data: {
        profesor: {
          ...profesor,
          asignaturas: relaciones.map((rel) => rel.asignatura),
        },
      },
    });
  } catch (error) {
    console.error('Error en getProfesorById:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

/**
 * CU-011: Editar Profesor
 * PUT /api/profesores/:id
 * Acceso: admin
 */
export const updateProfesor = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, telefono, asignaturas, timezone } = req.body;

    // 1. Verificar que el profesor existe
    const { data: profesor, error: profesorError } = await supabase
      .from('usuario')
      .select('id')
      .eq('id', id)
      .eq('rol', 'profesor')
      .single();

    if (profesorError || !profesor) {
      return res.status(404).json({ success: false, message: 'Profesor no encontrado' });
    }

    // 2. Preparar datos para actualizar
    const updateData = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (apellido !== undefined) updateData.apellido = apellido;
    if (telefono !== undefined) updateData.telefono = telefono;
    if (timezone !== undefined) updateData.timezone = timezone;

    // 3. Actualizar datos del profesor si hay cambios
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase.from('usuario').update(updateData).eq('id', id);

      if (updateError) {
        console.error('Error al actualizar profesor:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Error al actualizar profesor',
          error: updateError.message,
        });
      }
    }

    // 4. Actualizar asignaturas si se enviaron
    if (asignaturas && asignaturas.length > 0) {
      // Verificar que todas las asignaturas existan
      const { data: asignaturasExistentes, error: asignaturasError } = await supabase
        .from('asignatura')
        .select('id')
        .in('id', asignaturas);

      if (asignaturasError || asignaturasExistentes.length !== asignaturas.length) {
        return res.status(400).json({ success: false, message: 'Una o más asignaturas no existen' });
      }

      // Eliminar relaciones antiguas
      const { error: deleteError } = await supabase.from('profesor_asignatura').delete().eq('profesor_id', id);

      if (deleteError) {
        console.error('Error al eliminar asignaturas antiguas:', deleteError);
        return res.status(500).json({
          success: false,
          message: 'Error al actualizar asignaturas',
          error: deleteError.message,
        });
      }

      // Insertar nuevas relaciones
      const asignaturasRelaciones = asignaturas.map((asignaturaId) => ({
        profesor_id: id,
        asignatura_id: asignaturaId,
      }));

      const { error: insertError } = await supabase.from('profesor_asignatura').insert(asignaturasRelaciones);

      if (insertError) {
        console.error('Error al insertar nuevas asignaturas:', insertError);
        return res.status(500).json({
          success: false,
          message: 'Error al actualizar asignaturas',
          error: insertError.message,
        });
      }
    }

    // 5. Obtener profesor actualizado con sus asignaturas
    const { data: profesorActualizado, error: getError } = await supabase
      .from('usuario')
      .select('id, email, nombre, apellido, telefono, rol, created_at')
      .eq('id', id)
      .single();

    const { data: relaciones } = await supabase
      .from('profesor_asignatura')
      .select(
        `
        asignatura:asignatura_id (
          id,
          nombre,
          descripcion
        )
      `
      )
      .eq('profesor_id', id);

    // 6. Respuesta exitosa
    res.json({
      success: true,
      message: 'Profesor actualizado exitosamente',
      data: {
        profesor: {
          ...profesorActualizado,
          asignaturas: relaciones.map((rel) => rel.asignatura),
        },
      },
    });
  } catch (error) {
    console.error('Error en updateProfesor:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

/**
 * CU-012: Eliminar Profesor
 * DELETE /api/profesores/:id
 * Acceso: admin
 */
export const deleteProfesor = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Verificar que el profesor existe
    const { data: profesor, error: profesorError } = await supabase
      .from('usuario')
      .select('id, nombre, apellido')
      .eq('id', id)
      .eq('rol', 'profesor')
      .single();

    if (profesorError || !profesor) {
      return res.status(404).json({ success: false, message: 'Profesor no encontrado' });
    }

    // 2. Verificar que no tenga clases pendientes o programadas
    // Como fecha_hora es NOT NULL, verificamos clases con estado 'programada'
    const { data: clasesPendientes, error: clasesError } = await supabase
      .from('sesion_clase')
      .select('id, estado')
      .eq('profesor_id', id)
      .in('estado', ['programada']);

    if (clasesError) {
      console.error('Error al verificar clases:', clasesError);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar clases del profesor',
        error: clasesError.message,
      });
    }

    if (clasesPendientes && clasesPendientes.length > 0) {
      return res.status(400).json({
        success: false,
        message: `No se puede eliminar el profesor porque tiene ${clasesPendientes.length} clase(s) pendiente(s)`,
        data: {
          clasesPendientes: clasesPendientes.length,
        },
      });
    }

    // 3. Verificar cursos activos asignados
    const { data: cursosActivos, error: cursosError } = await supabase
      .from('curso')
      .select('id, nombre')
      .eq('profesor_id', id)
      .in('estado', ['activo']);

    if (cursosError) {
      console.error('Error al verificar cursos:', cursosError);
    }

    if (cursosActivos && cursosActivos.length > 0) {
      return res.status(400).json({
        success: false,
        message: `No se puede eliminar el profesor porque tiene ${cursosActivos.length} curso(s) activo(s) asignado(s)`,
        data: {
          cursosActivos: cursosActivos.length,
        },
      });
    }

    // 4. Eliminar profesor (cascade eliminará las relaciones en profesor_asignatura)
    const { error: deleteError } = await supabase.from('usuario').delete().eq('id', id);

    if (deleteError) {
      console.error('Error al eliminar profesor:', deleteError);
      return res.status(500).json({
        success: false,
        message: 'Error al eliminar profesor',
        error: deleteError.message,
      });
    }

    // 5. Respuesta exitosa
    res.json({
      success: true,
      message: `Profesor ${profesor.nombre} ${profesor.apellido} eliminado exitosamente`,
    });
  } catch (error) {
    console.error('Error en deleteProfesor:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};
