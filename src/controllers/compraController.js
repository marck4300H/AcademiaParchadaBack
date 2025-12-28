import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { asignarProfesorOptimo } from '../utils/asignarProfesor.js';

/**
 * CU-029: Comprar Curso
 * Permite a un usuario (autenticado o no) comprar un curso
 * Si no está autenticado, se crea el usuario automáticamente
 */
export const comprarCurso = async (req, res) => {
  try {
    const { curso_id, estudiante: datosEstudiante } = req.body;

    // 1. Verificar que el curso existe y está activo
    const { data: curso, error: cursoError } = await supabase
      .from('curso')
      .select(`
        *,
        profesor:profesor_id (
          id,
          nombre,
          apellido,
          email
        )
      `)
      .eq('id', curso_id)
      .single();

    if (cursoError || !curso) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado'
      });
    }

    if (curso.estado !== 'activo') {
      return res.status(400).json({
        success: false,
        message: 'Este curso no está disponible para compra'
      });
    }

    // 2. Determinar el estudiante (autenticado o nuevo)
    let estudiante_id;

    if (req.user && req.user.rol === 'estudiante') {
      // Usuario ya autenticado
      estudiante_id = req.user.id;
      console.log(`✅ Usuario autenticado: ${req.user.email}`);
    } else if (datosEstudiante) {
      // Crear nuevo estudiante
      const { email, nombre, apellido, password, telefono } = datosEstudiante;

      // Verificar si el email ya existe
      const { data: usuarioExistente } = await supabase
        .from('usuario')
        .select('id')
        .eq('email', email)
        .single();
      
      if (usuarioExistente) {
        return res.status(400).json({
          success: false,
          message: 'El email ya está registrado. Por favor inicia sesión.'
        });
      }

      // Hash de contraseña
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Crear nuevo usuario estudiante
      const { data: nuevoEstudiante, error: estudianteError } = await supabase
        .from('usuario')
        .insert([{
          email,
          nombre,
          apellido,
          password_hash: passwordHash,
          telefono,
          rol: 'estudiante'
        }])
        .select()
        .single();

      if (estudianteError) {
        console.error('Error al crear estudiante:', estudianteError);
        throw estudianteError;
      }

      estudiante_id = nuevoEstudiante.id;
      console.log(`✅ Nuevo estudiante creado: ${email}`);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Debes proporcionar datos de estudiante o estar autenticado'
      });
    }

    // 3. Verificar que no haya comprado ya este curso
    const { data: compraExistente } = await supabase
      .from('compra')
      .select('id')
      .eq('estudiante_id', estudiante_id)
      .eq('curso_id', curso_id)
      .eq('estado_pago', 'completado')
      .single();

    if (compraExistente) {
      return res.status(400).json({
        success: false,
        message: 'Ya has comprado este curso'
      });
    }

    // 4. Simular procesamiento de pago
    console.log('💳 Procesando pago (MOCK)...');
    console.log(`   Monto: $${curso.precio}`);
    console.log(`   Curso: ${curso.nombre}`);

    // 5. Crear la compra
    const { data: compra, error: compraError } = await supabase
      .from('compra')
      .insert([{
        estudiante_id,
        curso_id,
        tipo_compra: 'curso',
        monto_total: curso.precio,
        estado_pago: 'completado',
        fecha_compra: new Date().toISOString()
      }])
      .select()
      .single();

    if (compraError) {
      console.error('Error al crear compra:', compraError);
      throw compraError;
    }

    // 6. Crear la inscripción
    const { data: inscripcion, error: inscripcionError } = await supabase
      .from('inscripcion_curso')
      .insert([{
        estudiante_id,
        curso_id,
        fecha_inscripcion: new Date().toISOString()
      }])
      .select()
      .single();

    if (inscripcionError) {
      console.error('Error al crear inscripción:', inscripcionError);
      throw inscripcionError;
    }

    console.log('✅ Compra y inscripción creadas exitosamente');

    // 7. Responder con los datos completos
    return res.status(201).json({
      success: true,
      message: 'Compra realizada exitosamente',
      data: {
        compra: {
          id: compra.id,
          monto_total: compra.monto_total,
          estado_pago: compra.estado_pago,
          fecha_compra: compra.fecha_compra
        },
        curso: {
          id: curso.id,
          nombre: curso.nombre,
          descripcion: curso.descripcion,
          tipo: curso.tipo,
          duracion_horas: curso.duracion_horas,
          profesor: curso.profesor
        },
        inscripcion: {
          id: inscripcion.id,
          fecha_inscripcion: inscripcion.fecha_inscripcion
        }
      }
    });

  } catch (error) {
    console.error('❌ Error al procesar compra de curso:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la compra',
      error: error.message
    });
  }
};

/**
 * CU-030: Comprar Clase Personalizada
 * CU-031: Asignación automática de profesor
 */
export const comprarClasePersonalizada = async (req, res) => {
  try {
    const { 
      clase_personalizada_id, 
      descripcion_estudiante, 
      fecha_hora,
      estudiante: datosEstudiante 
    } = req.body;

    // 1. Verificar que la clase personalizada existe
    const { data: clase, error: claseError } = await supabase
      .from('clase_personalizada')
      .select(`
        *,
        asignatura:asignatura_id (
          id,
          nombre
        )
      `)
      .eq('id', clase_personalizada_id)
      .single();

    if (claseError || !clase) {
      return res.status(404).json({
        success: false,
        message: 'Clase personalizada no encontrada'
      });
    }

    // 2. Determinar el estudiante (autenticado o nuevo)
    let estudiante_id;

    if (req.user && req.user.rol === 'estudiante') {
      estudiante_id = req.user.id;
      console.log(`✅ Usuario autenticado: ${req.user.email}`);
    } else if (datosEstudiante) {
      const { email, nombre, apellido, password, telefono } = datosEstudiante;

      const { data: usuarioExistente } = await supabase
        .from('usuario')
        .select('id')
        .eq('email', email)
        .single();
      
      if (usuarioExistente) {
        return res.status(400).json({
          success: false,
          message: 'El email ya está registrado. Por favor inicia sesión.'
        });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const { data: nuevoEstudiante, error: estudianteError } = await supabase
        .from('usuario')
        .insert([{
          email,
          nombre,
          apellido,
          password_hash: passwordHash,
          telefono,
          rol: 'estudiante'
        }])
        .select()
        .single();

      if (estudianteError) {
        console.error('Error al crear estudiante:', estudianteError);
        throw estudianteError;
      }

      estudiante_id = nuevoEstudiante.id;
      console.log(`✅ Nuevo estudiante creado: ${email}`);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Debes proporcionar datos de estudiante o estar autenticado'
      });
    }

    // 3. Asignar profesor automáticamente ANTES de crear la compra (CU-031)
    console.log('🤖 Ejecutando algoritmo de asignación de profesor...');
    const resultadoAsignacion = await asignarProfesorOptimo(
      clase.asignatura_id,
      new Date(fecha_hora),
      clase.duracion_horas
    );

    if (!resultadoAsignacion) {
      return res.status(400).json({
        success: false,
        message: 'No hay profesores disponibles para esta asignatura en el horario solicitado'
      });
    }

    const profesorAsignado = resultadoAsignacion.profesor;
    const franjasUtilizadas = resultadoAsignacion.franjasUtilizadas;

    console.log(`✅ Profesor asignado: ${profesorAsignado.nombre} ${profesorAsignado.apellido} (${profesorAsignado.id})`);
    console.log(`📍 Franjas horarias utilizadas: ${franjasUtilizadas.join(', ')}`);

    // 4. Simular procesamiento de pago
    console.log('💳 Procesando pago (MOCK)...');
    console.log(`   Monto: $${clase.precio}`);
    console.log(`   Clase: ${clase.asignatura.nombre}`);
    console.log(`   Duración: ${clase.duracion_horas}h`);

    // 5. Crear la compra
    const { data: compra, error: compraError } = await supabase
      .from('compra')
      .insert([{
        estudiante_id,
        clase_personalizada_id,
        tipo_compra: 'clase_personalizada',
        monto_total: clase.precio,
        estado_pago: 'completado',
        fecha_compra: new Date().toISOString()
      }])
      .select()
      .single();

    if (compraError) {
      console.error('Error al crear compra:', compraError);
      throw compraError;
    }

    // 6. Crear la sesión de clase
    const { data: sesion, error: sesionError } = await supabase
      .from('sesion_clase')
      .insert([{
        compra_id: compra.id,
        profesor_id: profesorAsignado.id,
        descripcion_estudiante,
        fecha_hora: new Date(fecha_hora).toISOString(),
        franja_horaria_ids: franjasUtilizadas,
        estado: 'programada'
      }])
      .select()
      .single();

    if (sesionError) {
      console.error('Error al crear sesión:', sesionError);
      throw sesionError;
    }

    console.log('✅ Compra y sesión de clase creadas exitosamente');

    // 7. Responder con los datos completos
    return res.status(201).json({
      success: true,
      message: 'Compra de clase personalizada realizada exitosamente',
      data: {
        compra: {
          id: compra.id,
          monto_total: compra.monto_total,
          estado_pago: compra.estado_pago,
          fecha_compra: compra.fecha_compra
        },
        clase: {
          id: clase.id,
          asignatura: clase.asignatura,
          duracion_horas: clase.duracion_horas
        },
        sesion: {
          id: sesion.id,
          fecha_hora: sesion.fecha_hora,
          estado: sesion.estado,
          descripcion_estudiante: sesion.descripcion_estudiante,
          franja_horaria_ids: sesion.franja_horaria_ids
        },
        profesor_asignado: {
          id: profesorAsignado.id,
          nombre: profesorAsignado.nombre,
          apellido: profesorAsignado.apellido,
          email: profesorAsignado.email,
          telefono: profesorAsignado.telefono
        }
      }
    });

  } catch (error) {
    console.error('❌ Error al procesar compra de clase personalizada:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la compra',
      error: error.message
    });
  }
};

/**
 * Listar compras de un estudiante específico
 */
export const listarComprasEstudiante = async (req, res) => {
  try {
    const estudiante_id = req.user.id;

    const { data: compras, error } = await supabase
      .from('compra')
      .select(`
        *,
        curso:curso_id (
          id,
          nombre,
          tipo,
          profesor:profesor_id (
            nombre,
            apellido
          )
        ),
        clase_personalizada:clase_personalizada_id (
          id,
          duracion_horas,
          asignatura:asignatura_id (
            nombre
          )
        )
      `)
      .eq('estudiante_id', estudiante_id)
      .order('fecha_compra', { ascending: false });

    if (error) {
      console.error('Error al listar compras:', error);
      throw error;
    }

    // Para cada compra de clase personalizada, obtener info de la sesión
    const comprasConDetalles = await Promise.all(
      compras.map(async (compra) => {
        if (compra.tipo_compra === 'clase_personalizada') {
          const { data: sesion } = await supabase
            .from('sesion_clase')
            .select(`
              *,
              profesor:profesor_id (
                nombre,
                apellido,
                email
              )
            `)
            .eq('compra_id', compra.id)
            .order('fecha_hora', { ascending: false })
            .limit(1)
            .single();
          
          return { ...compra, sesion };
        }
        
        return compra;
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        compras: comprasConDetalles,
        total: compras.length
      }
    });

  } catch (error) {
    console.error('❌ Error al listar compras:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las compras',
      error: error.message
    });
  }
};

/**
 * Obtener detalle de una compra específica
 */
export const obtenerCompra = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.user;

    const { data: compra, error } = await supabase
      .from('compra')
      .select(`
        *,
        estudiante:estudiante_id (
          id,
          nombre,
          apellido,
          email
        ),
        curso:curso_id (
          id,
          nombre,
          descripcion,
          tipo,
          profesor:profesor_id (
            nombre,
            apellido,
            email
          )
        ),
        clase_personalizada:clase_personalizada_id (
          *,
          asignatura:asignatura_id (
            nombre
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error || !compra) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }

    // Verificar permisos (solo el estudiante dueño o administrador)
    if (usuario.rol === 'estudiante' && compra.estudiante_id !== usuario.id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver esta compra'
      });
    }

    // Si es clase personalizada, obtener info de la sesión
    if (compra.tipo_compra === 'clase_personalizada') {
      const { data: sesion } = await supabase
        .from('sesion_clase')
        .select(`
          *,
          profesor:profesor_id (
            nombre,
            apellido,
            email,
            telefono
          )
        `)
        .eq('compra_id', compra.id)
        .single();
      
      compra.sesion = sesion;
    }

    return res.status(200).json({
      success: true,
      data: {
        compra
      }
    });

  } catch (error) {
    console.error('❌ Error al obtener compra:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener la compra',
      error: error.message
    });
  }
};

/**
 * Admin: Listar todas las compras con filtros
 */
export const listarTodasCompras = async (req, res) => {
  try {
    const { page = 1, limit = 10, estado, tipo_compra } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('compra')
      .select(`
        *,
        estudiante:estudiante_id (
          nombre,
          apellido,
          email
        ),
        curso:curso_id (
          nombre
        ),
        clase_personalizada:clase_personalizada_id (
          asignatura:asignatura_id (
            nombre
          )
        )
      `, { count: 'exact' })
      .order('fecha_compra', { ascending: false });

    if (estado) query = query.eq('estado_pago', estado);
    if (tipo_compra) query = query.eq('tipo_compra', tipo_compra);

    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: compras, error, count } = await query;

    if (error) {
      console.error('Error al listar todas las compras:', error);
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: {
        compras,
        pagination: {
          total: count || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil((count || 0) / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('❌ Error al listar todas las compras:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las compras',
      error: error.message
    });
  }
};

/**
 * Obtener franjas horarias disponibles de un profesor
 */
export const obtenerFranjasProfesor = async (req, res) => {
  try {
    const { profesor_id } = req.params;

    const { data: franjas, error } = await supabase
      .from('franja_horaria')
      .select('*')
      .eq('profesor_id', profesor_id)
      .order('dia_semana', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (error) {
      console.error('Error al obtener franjas:', error);
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: { franjas: franjas || [] }
    });

  } catch (error) {
    console.error('❌ Error al obtener franjas:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener franjas horarias',
      error: error.message
    });
  }
};
