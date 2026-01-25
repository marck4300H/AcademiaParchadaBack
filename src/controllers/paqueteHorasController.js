import bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';
import { supabase } from '../config/supabase.js';
import { asignarProfesorOptimo } from '../utils/asignarProfesor.js';

// Si ya tienes esta función en tu emailService (como lo implementamos antes), déjala.
// Si tu export se llama diferente, ajusta el import/nombre.
import { notifyProfesorAfterPaqueteHorasSessionCreated } from '../services/emailService.js';

/**
 * Descuento paquete horas:
 * - 1 hora: 0%
 * - >= 2 horas: 10% fijo sobre el total
 *
 * Nota: el "tope 60%" no se alcanza con 10% fijo, pero lo dejamos listo por si luego cambias reglas.
 */
const DESCUENTO_FIJO = 0.10;
const DESCUENTO_MIN_HORAS = 2;
const DESCUENTO_MAX = 0.60;

const calcDescuentoPct = (horas) => {
  if (!Number.isFinite(horas) || horas <= 0) return 0;
  const pct = horas >= DESCUENTO_MIN_HORAS ? DESCUENTO_FIJO : 0;
  return Math.min(pct, DESCUENTO_MAX);
};


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
      .select(
        `
        *,
        asignatura:asignatura_id (
          id,
          nombre
        )
      `
      )
      .eq('id', clase_personalizada_id)
      .single();

    if (claseError || !clase) {
      return res.status(404).json({
        success: false,
        message: 'Clase personalizada no encontrada'
      });
    }

    // 2. Calcular precio total (precio por hora × cantidad) + descuento
    const horas = Number(cantidad_horas);

    if (!Number.isFinite(horas) || horas <= 0) {
      return res.status(400).json({
        success: false,
        message: 'cantidad_horas debe ser un número mayor a 0'
      });
    }

    // (Opcional) si deseas forzar enteros:
    // if (!Number.isInteger(horas)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'cantidad_horas debe ser un entero'
    //   });
    // }

    const precioPorHora = Number(clase.precio);
    const subtotal = precioPorHora * horas;

    const descuento_pct = calcDescuentoPct(horas);
    const monto_total = Math.max(0, subtotal * (1 - descuento_pct));

    // 3. Determinar estudiante (autenticado o nuevo)
    let estudiante_id;

    if (req.user && req.user.rol === 'estudiante') {
      estudiante_id = req.user.id;
    } else if (datosEstudiante) {
      const { email, nombre, apellido, password, telefono } = datosEstudiante;

      // Verificar si el email ya existe (usar maybeSingle para evitar error si no existe)
      const { data: usuarioExistente, error: errExist } = await supabase
        .from('usuario')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (errExist) {
        console.error('Error verificando usuario existente:', errExist);
        throw errExist;
      }

      if (usuarioExistente?.id) {
        return res.status(400).json({
          success: false,
          message: 'El email ya está registrado. Por favor inicia sesión.'
        });
      }

      // Hash de contraseña
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Crear nuevo estudiante (timezone tiene default en BD)
      const { data: nuevoEstudiante, error: estudianteError } = await supabase
        .from('usuario')
        .insert([
          {
            email,
            nombre,
            apellido,
            password_hash: passwordHash,
            telefono,
            rol: 'estudiante'
          }
        ])
        .select()
        .single();

      if (estudianteError) {
        console.error('Error al crear estudiante:', estudianteError);
        throw estudianteError;
      }

      estudiante_id = nuevoEstudiante.id;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Debes proporcionar datos de estudiante o estar autenticado'
      });
    }

    // 4. Simular procesamiento de pago
    // (si luego migras a MP, aquí solo crearías compra "pendiente")
    // 5. Crear compra tipo "paquete_horas"
    const { data: compra, error: compraError } = await supabase
      .from('compra')
      .insert([
        {
          estudiante_id,
          clase_personalizada_id,
          tipo_compra: 'paquete_horas',
          horas_totales: horas,
          horas_usadas: 0,
          horas_disponibles: horas,
          monto_total,
          estado_pago: 'completado',
          fecha_compra: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (compraError) {
      console.error('Error al crear compra:', compraError);
      throw compraError;
    }

    // 6. Responder
    return res.status(201).json({
      success: true,
      message: `Paquete de ${horas} horas comprado exitosamente`,
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
        pricing: {
          subtotal,
          descuento_pct,
          total: monto_total
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
 * Permite agendar una sesión usando horas del paquete
 * ⭐ REQUIERE AUTENTICACIÓN
 * ✅ SOPORTA DOCUMENTO (documento_url opcional en body)
 */
export const agendarSesion = async (req, res) => {
  try {
    const { compra_id } = req.params;
    const {
      fecha_hora,
      duracion_horas,
      descripcion_estudiante,
      documento_url  // ← NUEVO: URL del documento previamente subido
    } = req.body;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Debes iniciar sesión para agendar sesiones'
      });
    }

    const duracion = Number(duracion_horas);

    // 1) Verificar que la compra existe y es un paquete (traer timezone del estudiante)
    const { data: compra, error: compraError } = await supabase
      .from('compra')
      .select(
        `
        *,
        clase_personalizada:clase_personalizada_id(
          *,
          asignatura:asignatura_id(*)
        ),
        estudiante:estudiante_id(
          id,
          nombre,
          apellido,
          email,
          telefono,
          timezone
        )
      `
      )
      .eq('id', compra_id)
      .single();

    if (compraError || !compra) {
      return res.status(404).json({
        success: false,
        message: 'Paquete no encontrado'
      });
    }

    // 2) Validar que sea un paquete de horas
    if (compra.tipo_compra !== 'paquete_horas') {
      return res.status(400).json({
        success: false,
        message: 'Esta compra no es un paquete de horas. Usa el endpoint de clase personalizada.'
      });
    }

    // (extra recomendado) no permitir agendar si no está pagado
    if (compra.estado_pago !== 'completado') {
      return res.status(400).json({
        success: false,
        message: 'El paquete aún no está pagado/completado. No puedes agendar sesiones.'
      });
    }

    // 3) Validar dueño del paquete
    if (req.user.rol === 'estudiante' && req.user.id !== compra.estudiante_id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para agendar sesiones de este paquete. Solo el dueño puede hacerlo.'
      });
    }

    // 4) Validar horas disponibles
    if (Number(compra.horas_disponibles) < duracion) {
      return res.status(400).json({
        success: false,
        message: `Solo tienes ${compra.horas_disponibles} hora(s) disponible(s). No puedes agendar ${duracion} hora(s).`
      });
    }

    // 5) Normalizar/validar fecha_hora con timezone del estudiante (para guardar bien en BD)
    const estudianteTimeZone = compra?.estudiante?.timezone || 'America/Bogota';
    const rawFecha = String(fecha_hora);

    const hasZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(rawFecha);
    const dtEstudiante = hasZone
      ? DateTime.fromISO(rawFecha, { setZone: true })
      : DateTime.fromISO(rawFecha, { zone: estudianteTimeZone });

    if (!dtEstudiante.isValid) {
      return res.status(400).json({
        success: false,
        message: 'fecha_hora inválida. Usa ISO 8601 (ideal con offset).'
      });
    }

    // Esto es lo que se guarda en timestamp with time zone (instant real, en UTC)
    const fechaHoraToStore = dtEstudiante.toUTC().toISO();

    // 6) Asignar profesor automáticamente VALIDANDO franjas (misma lógica que MP)
    const resultadoAsignacion = await asignarProfesorOptimo(
      compra.clase_personalizada.asignatura_id,
      rawFecha, // OJO: string ISO (no Date)
      duracion,
      estudianteTimeZone
    );

    if (!resultadoAsignacion) {
      return res.status(400).json({
        success: false,
        message: 'No hay disponibilidad de profesores para esa fecha y hora. Por favor elige otro horario.'
      });
    }

    const profesorAsignado = resultadoAsignacion.profesor;
    const franjasUtilizadas = resultadoAsignacion.franjasUtilizadas || [];

    if (!Array.isArray(franjasUtilizadas) || franjasUtilizadas.length !== duracion) {
      return res.status(400).json({
        success: false,
        message: 'No hay suficientes franjas consecutivas disponibles para esa duración.'
      });
    }

    // 7) Crear la sesión de clase
    const { data: sesion, error: sesionError } = await supabase
      .from('sesion_clase')
      .insert([
        {
          compra_id: compra.id,
          profesor_id: profesorAsignado.id,
          descripcion_estudiante: descripcion_estudiante || null,
          documento_url: documento_url || null,  // ← NUEVO
          fecha_hora: fechaHoraToStore,
          franja_horaria_ids: franjasUtilizadas,
          estado: 'programada'
        }
      ])
      .select()
      .single();

    if (sesionError) {
      console.error('Error al crear sesión:', sesionError);
      throw sesionError;
    }

    // 8) Actualizar horas usadas y disponibles
    const nuevasHorasUsadas = Number(compra.horas_usadas) + duracion;
    const nuevasHorasDisponibles = Number(compra.horas_disponibles) - duracion;

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

    // 9) Notificar al profesor (email service ya listo)
    try {
      await notifyProfesorAfterPaqueteHorasSessionCreated({ sesionId: sesion.id });
    } catch (e) {
      // No se revienta el agendamiento si el correo falla
      console.error('❌ Error notificando profesor (paquete horas):', e?.message || e);
    }

    // 10) Responder
    return res.status(201).json({
      success: true,
      message: 'Sesión agendada exitosamente',
      data: {
        sesion: {
          id: sesion.id,
          fecha_hora: sesion.fecha_hora,
          estado: sesion.estado,
          descripcion_estudiante: sesion.descripcion_estudiante,
          documento_url: sesion.documento_url,  // ← NUEVO EN RESPONSE
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
      .select(
        `
        *,
        clase_personalizada:clase_personalizada_id(
          *,
          asignatura:asignatura_id(*)
        ),
        estudiante:estudiante_id(
          id,
          nombre,
          apellido,
          email,
          telefono,
          timezone
        )
      `
      )
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
      .select(
        `
        *,
        profesor:profesor_id(
          id,
          nombre,
          apellido,
          email,
          telefono,
          timezone
        )
      `
      )
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
      .select(
        `
        *,
        profesor:profesor_id(
          id,
          nombre,
          apellido,
          email,
          telefono,
          timezone
        )
      `
      )
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
