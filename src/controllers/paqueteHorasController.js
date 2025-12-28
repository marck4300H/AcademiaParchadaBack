import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { asignarProfesorOptimo } from '../utils/asignarProfesor.js';

/**
 * CU-032: Comprar Paquete de Horas
 * Permite comprar un paquete de N horas para agendar después
 */
export const comprarPaqueteHoras = async (req, res) => {
  try {
    const { clase_personalizada_id, cantidad_horas, estudiante: datosEstudiante } = req.body;

    // 1. Validar clase personalizada
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

    // 2. Calcular precio total (precio por hora × cantidad)
    const monto_total = clase.precio * cantidad_horas;

    console.log(`📦 Comprando paquete de ${cantidad_horas} horas`);
    console.log(`   Asignatura: ${clase.asignatura.nombre}`);
    console.log(`   Precio unitario: $${clase.precio}`);
    console.log(`   Monto total: $${monto_total}`);

    // 3. Determinar estudiante (autenticado o nuevo)
    let estudiante_id;

    if (req.user && req.user.rol === 'estudiante') {
      estudiante_id = req.user.id;
      console.log(`✅ Usuario autenticado: ${req.user.email}`);
    } else if (datosEstudiante) {
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

      // Crear nuevo estudiante
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

    // 4. Simular procesamiento de pago
    console.log('💳 Procesando pago (MOCK)...');
    console.log(`   Monto: $${monto_total}`);

    // 5. Crear compra tipo "paquete_horas"
    const { data: compra, error: compraError } = await supabase
      .from('compra')
      .insert([{
        estudiante_id,
        clase_personalizada_id,
        tipo_compra: 'paquete_horas',
        horas_totales: cantidad_horas,
        horas_usadas: 0,
        horas_disponibles: cantidad_horas,
        monto_total,
        estado_pago: 'completado',
        fecha_compra: new Date().toISOString()
      }])
      .select()
      .single();

    if (compraError) {
      console.error('Error al crear compra:', compraError);
      throw compraError;
    }

    console.log(`✅ Paquete de ${cantidad_horas} horas comprado exitosamente`);

    // 6. Responder
    return res.status(201).json({
      success: true,
      message: `Paquete de ${cantidad_horas} horas comprado exitosamente`,
      data: {
        compra: {
          id: compra.id,
          tipo_compra: compra.tipo_compra,
          horas_totales: compra.horas_totales,
          horas_usadas: compra.horas_usadas,
          horas_disponibles: compra.horas_disponibles,
          monto_total: compra.monto_total,
          estado_pago: compra.estado_pago,
          fecha_compra: compra.fecha_compra
        },
        clase: {
          id: clase.id,
          asignatura: clase.asignatura,
          precio_por_hora: clase.precio
        },
        instrucciones: `Usa POST /api/paquetes-horas/${compra.id}/agendar para agendar tus sesiones`
      }
    });

  } catch (error) {
    console.error('❌ Error al comprar paquete de horas:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la compra',
      error: error.message
    });
  }
};

/**
 * CU-033: Agendar Sesión de Paquete
 * Permite agendar una o más sesiones usando horas del paquete
 * ⭐ REQUIERE AUTENTICACIÓN
 */
export const agendarSesion = async (req, res) => {
  try {
    const { compra_id } = req.params;
    const { fecha_hora, duracion_horas, descripcion_estudiante } = req.body;

    // ⭐ VALIDACIÓN DE AUTENTICACIÓN
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Debes iniciar sesión para agendar sesiones'
      });
    }

    // 1. Verificar que la compra existe y es un paquete
    const { data: compra, error: compraError } = await supabase
      .from('compra')
      .select(`
        *,
        clase_personalizada:clase_personalizada_id(
          *,
          asignatura:asignatura_id(*)
        ),
        estudiante:estudiante_id(
          id,
          nombre,
          apellido,
          email
        )
      `)
      .eq('id', compra_id)
      .single();

    if (compraError || !compra) {
      return res.status(404).json({
        success: false,
        message: 'Paquete no encontrado'
      });
    }

    // 2. Validar que sea un paquete de horas
    if (compra.tipo_compra !== 'paquete_horas') {
      return res.status(400).json({
        success: false,
        message: 'Esta compra no es un paquete de horas. Usa el endpoint de clase personalizada.'
      });
    }

    // ⭐ 3. VALIDAR QUE EL USUARIO SEA EL DUEÑO DEL PAQUETE
    if (req.user.rol === 'estudiante' && req.user.id !== compra.estudiante_id) {
      console.log(`❌ Usuario ${req.user.email} intentó agendar paquete de ${compra.estudiante.email}`);
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para agendar sesiones de este paquete. Solo el dueño puede hacerlo.'
      });
    }

    // ⭐ 4. VALIDAR QUE ADMIN SOLO PUEDE SI ES PARA AYUDAR
    if (req.user.rol === 'administrador') {
      console.log(`ℹ️ Administrador ${req.user.email} agendando para estudiante ${compra.estudiante.email}`);
    }

    // 5. Validar horas disponibles
    if (compra.horas_disponibles < duracion_horas) {
      return res.status(400).json({
        success: false,
        message: `Solo tienes ${compra.horas_disponibles} hora(s) disponible(s). No puedes agendar ${duracion_horas} hora(s).`
      });
    }

    console.log(`📅 Agendando sesión de paquete ${compra_id}`);
    console.log(`   Solicitante: ${req.user.email} (${req.user.rol})`);
    console.log(`   Estudiante: ${compra.estudiante.nombre} ${compra.estudiante.apellido}`);
    console.log(`   Duración: ${duracion_horas}h`);
    console.log(`   Horas disponibles: ${compra.horas_disponibles}h`);

    // 6. Asignar profesor automáticamente
    console.log('🤖 Ejecutando algoritmo de asignación de profesor...');
    const resultadoAsignacion = await asignarProfesorOptimo(
      compra.clase_personalizada.asignatura_id,
      new Date(fecha_hora),
      duracion_horas
    );

    if (!resultadoAsignacion) {
      return res.status(400).json({
        success: false,
        message: 'No hay profesores disponibles para esta asignatura en el horario solicitado'
      });
    }

    const profesorAsignado = resultadoAsignacion.profesor;
    const franjasUtilizadas = resultadoAsignacion.franjasUtilizadas;

    console.log(`✅ Profesor asignado: ${profesorAsignado.nombre} ${profesorAsignado.apellido}`);
    console.log(`📍 Franjas utilizadas: ${franjasUtilizadas.join(', ')}`);

    // 7. Crear la sesión de clase
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

    // 8. Actualizar horas usadas y disponibles
    const nuevasHorasUsadas = compra.horas_usadas + duracion_horas;
    const nuevasHorasDisponibles = compra.horas_disponibles - duracion_horas;

    const { error: updateError } = await supabase
      .from('compra')
      .update({
        horas_usadas: nuevasHorasUsadas,
        horas_disponibles: nuevasHorasDisponibles
      })
      .eq('id', compra.id);

    if (updateError) {
      console.error('Error al actualizar horas:', updateError);
      throw updateError;
    }

    console.log(`✅ Sesión agendada por ${req.user.email}. Horas restantes: ${nuevasHorasDisponibles}h`);

    // 9. Responder
    return res.status(201).json({
      success: true,
      message: 'Sesión agendada exitosamente',
      data: {
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
        },
        paquete: {
          horas_totales: compra.horas_totales,
          horas_usadas: nuevasHorasUsadas,
          horas_disponibles: nuevasHorasDisponibles
        }
      }
    });

  } catch (error) {
    console.error('❌ Error al agendar sesión:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al agendar la sesión',
      error: error.message
    });
  }
};

/**
 * Obtener detalles de un paquete de horas
 */
export const obtenerPaquete = async (req, res) => {
  try {
    const { compra_id } = req.params;

    const { data: compra, error } = await supabase
      .from('compra')
      .select(`
        *,
        clase_personalizada:clase_personalizada_id(
          *,
          asignatura:asignatura_id(*)
        ),
        estudiante:estudiante_id(
          nombre,
          apellido,
          email
        )
      `)
      .eq('id', compra_id)
      .eq('tipo_compra', 'paquete_horas')
      .single();

    if (error || !compra) {
      return res.status(404).json({
        success: false,
        message: 'Paquete no encontrado'
      });
    }

    // Validar permisos
    if (req.user && req.user.rol === 'estudiante' && req.user.id !== compra.estudiante_id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver este paquete'
      });
    }

    // Obtener sesiones agendadas
    const { data: sesiones } = await supabase
      .from('sesion_clase')
      .select(`
        *,
        profesor:profesor_id(
          nombre,
          apellido,
          email
        )
      `)
      .eq('compra_id', compra_id)
      .order('fecha_hora', { ascending: true });

    return res.status(200).json({
      success: true,
      data: {
        compra,
        sesiones: sesiones || [],
        total_sesiones: sesiones?.length || 0
      }
    });

  } catch (error) {
    console.error('❌ Error al obtener paquete:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el paquete',
      error: error.message
    });
  }
};

/**
 * Listar sesiones de un paquete
 */
export const listarSesionesPaquete = async (req, res) => {
  try {
    const { compra_id } = req.params;

    // Verificar que el paquete existe
    const { data: compra, error: compraError } = await supabase
      .from('compra')
      .select('id, estudiante_id, tipo_compra')
      .eq('id', compra_id)
      .single();

    if (compraError || !compra) {
      return res.status(404).json({
        success: false,
        message: 'Paquete no encontrado'
      });
    }

    if (compra.tipo_compra !== 'paquete_horas') {
      return res.status(400).json({
        success: false,
        message: 'Esta compra no es un paquete de horas'
      });
    }

    // Validar permisos
    if (req.user && req.user.rol === 'estudiante' && req.user.id !== compra.estudiante_id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver estas sesiones'
      });
    }

    // Obtener sesiones
    const { data: sesiones, error } = await supabase
      .from('sesion_clase')
      .select(`
        *,
        profesor:profesor_id(
          nombre,
          apellido,
          email,
          telefono
        )
      `)
      .eq('compra_id', compra_id)
      .order('fecha_hora', { ascending: true });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        sesiones: sesiones || [],
        total: sesiones?.length || 0
      }
    });

  } catch (error) {
    console.error('❌ Error al listar sesiones:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las sesiones',
      error: error.message
    });
  }
};
