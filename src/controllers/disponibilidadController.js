// src/controllers/disponibilidadController.js

import { supabase } from '../config/supabase.js';
import { DateTime } from 'luxon';
import { buscarFranjasConsecutivas } from '../utils/franjaHelpers.js';

const DEFAULT_TZ = 'America/Bogota';

/**
 * GET /api/disponibilidad/franjas
 * Obtiene franjas horarias disponibles para una fecha y asignatura específicas
 * 
 * Query params:
 * - fecha: YYYY-MM-DD (ej: "2026-01-21")
 * - asignatura_id: UUID de la asignatura
 * - duracion_horas: número entero (1, 2, 3, etc.)
 * - timezone: (opcional) timezone del cliente (default: "America/Bogota")
 * 
 * PÚBLICO - No requiere autenticación
 */
export const obtenerFranjasDisponibles = async (req, res) => {
  try {
    const { fecha, asignatura_id, duracion_horas, timezone } = req.query;

    // ========== VALIDACIONES ==========
    if (!fecha) {
      return res.status(400).json({
        success: false,
        message: 'El parámetro "fecha" es requerido (formato: YYYY-MM-DD)',
      });
    }

    if (!asignatura_id) {
      return res.status(400).json({
        success: false,
        message: 'El parámetro "asignatura_id" es requerido',
      });
    }

    if (!duracion_horas) {
      return res.status(400).json({
        success: false,
        message: 'El parámetro "duracion_horas" es requerido',
      });
    }

    const duracion = Number(duracion_horas);
    if (!Number.isInteger(duracion) || duracion < 1) {
      return res.status(400).json({
        success: false,
        message: 'duracion_horas debe ser un número entero mayor a 0',
      });
    }

    const clienteTimeZone = timezone || DEFAULT_TZ;

    // ========== PARSEAR FECHA ==========
    const dtCliente = DateTime.fromISO(fecha, { zone: clienteTimeZone }).startOf('day');
    
    if (!dtCliente.isValid) {
      return res.status(400).json({
        success: false,
        message: `Fecha inválida: ${fecha}. Use formato YYYY-MM-DD`,
      });
    }

    // ========== OBTENER PROFESORES DE LA ASIGNATURA ==========
    const { data: profesoresAsignatura, error: errorProfesores } = await supabase
      .from('profesor_asignatura')
      .select(`
        profesor_id,
        usuario:profesor_id (
          id,
          nombre,
          apellido,
          email,
          timezone
        )
      `)
      .eq('asignatura_id', asignatura_id);

    if (errorProfesores) {
      console.error('Error al obtener profesores:', errorProfesores);
      throw errorProfesores;
    }

    if (!profesoresAsignatura || profesoresAsignatura.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          fecha: dtCliente.toISODate(),
          asignatura_id,
          duracion_horas: duracion,
          franjas_disponibles: [],
          total: 0,
          mensaje: 'No hay profesores disponibles para esta asignatura',
        },
      });
    }

    // ========== DÍAS DE LA SEMANA ==========
    const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

    // ========== BUSCAR DISPONIBILIDAD POR CADA PROFESOR ==========
    const bloquesDisponibles = [];

    for (const pa of profesoresAsignatura) {
      const profesorId = pa.profesor_id;
      const profesor = pa.usuario;
      const profesorTZ = profesor?.timezone || DEFAULT_TZ;

      // Convertir fecha cliente a timezone del profesor
      const dtProfesor = dtCliente.setZone(profesorTZ);
      const diaSemana = diasSemana[dtProfesor.weekday % 7]; // luxon: 1..7

      // Obtener franjas del profesor para ese día
      const { data: franjasDelDia, error: errorFranjasDelDia } = await supabase
        .from('franja_horaria')
        .select('*')
        .eq('profesor_id', profesorId)
        .eq('dia_semana', diaSemana)
        .order('hora_inicio', { ascending: true });

      if (errorFranjasDelDia || !franjasDelDia || franjasDelDia.length === 0) {
        continue; // Sin franjas para este profesor en ese día
      }

      // Buscar bloques consecutivos de N horas
      const horasDelDia = [];
      
      // Generar todas las posibles horas de inicio (desde 00:00 hasta 23:00)
      for (let hora = 0; hora < 24; hora++) {
        const horaInicio = `${hora.toString().padStart(2, '0')}:00:00`;
        
        const franjasConsecutivas = buscarFranjasConsecutivas(
          franjasDelDia,
          horaInicio,
          duracion
        );

        if (franjasConsecutivas) {
          horasDelDia.push({
            hora_inicio: horaInicio,
            franja_horaria_ids: franjasConsecutivas,
          });
        }
      }

      // Para cada bloque encontrado, verificar si NO tiene conflicto con sesiones programadas
      for (const bloque of horasDelDia) {
        // Construir fecha_hora completa en TZ del profesor
        const [hh, mm, ss] = bloque.hora_inicio.split(':').map(Number);
        const fechaHoraProfesor = dtProfesor.set({ hour: hh, minute: mm, second: ss });
        const fechaHoraUTC = fechaHoraProfesor.toUTC().toISO();

        // Verificar si hay sesión programada en esas franjas
        const { data: sesionesExistentes, error: errorSesiones } = await supabase
          .from('sesion_clase')
          .select('id')
          .eq('profesor_id', profesorId)
          .eq('estado', 'programada')
          .overlaps('franja_horaria_ids', bloque.franja_horaria_ids);

        if (errorSesiones) {
          console.error('Error al verificar sesiones:', errorSesiones);
          continue;
        }

        // Si NO hay sesiones, el bloque está disponible
        if (!sesionesExistentes || sesionesExistentes.length === 0) {
          // Calcular hora_fin
          const [hh, mm, ss] = bloque.hora_inicio.split(':').map(Number);
          const fechaHoraInicio = dtProfesor.set({ hour: hh, minute: mm, second: ss });
          const fechaHoraFin = fechaHoraInicio.plus({ hours: duracion });

          bloquesDisponibles.push({
            hora_inicio: bloque.hora_inicio,
            hora_fin: fechaHoraFin.toFormat('HH:mm:ss'),
            fecha_hora_inicio_iso: fechaHoraUTC,
            fecha_hora_fin_iso: fechaHoraFin.toUTC().toISO(),
            duracion_horas: duracion,
            franja_horaria_ids: bloque.franja_horaria_ids,
            profesor: {
              id: profesor?.id,
              nombre: profesor?.nombre,
              apellido: profesor?.apellido,
              email: profesor?.email,
            },
          });
        }
      }
    }

    // ========== ORDENAR Y RETORNAR ==========
    bloquesDisponibles.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

    return res.status(200).json({
      success: true,
      data: {
        fecha: dtCliente.toISODate(),
        asignatura_id,
        duracion_horas: duracion,
        timezone: clienteTimeZone,
        franjas_disponibles: bloquesDisponibles,
        total: bloquesDisponibles.length,
      },
    });

  } catch (error) {
    console.error('❌ Error en obtenerFranjasDisponibles:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener franjas disponibles',
      error: error.message,
    });
  }
};
