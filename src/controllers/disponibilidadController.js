// src/controllers/disponibilidadController.js

import { supabase } from '../config/supabase.js';
import { DateTime } from 'luxon';
import { buscarFranjasConsecutivas } from '../utils/franjaHelpers.js';

const DEFAULT_TZ = 'America/Bogota';

/**
 * GET /api/disponibilidad/franjas
 * Query params:
 * - fecha: YYYY-MM-DD (ej: "2026-01-21")
 * - asignatura_id: UUID
 * - duracion_horas: entero >= 1
 * - timezone: (opcional) timezone del cliente (default: America/Bogota)
 */
export const obtenerFranjasDisponibles = async (req, res) => {
  try {
    const { fecha, asignatura_id, duracion_horas, timezone } = req.query;

    // ===== Validaciones =====
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

    // ===== Parse de fecha (día) en TZ del cliente =====
    const dtCliente = DateTime.fromISO(fecha, { zone: clienteTimeZone }).startOf('day');

    if (!dtCliente.isValid) {
      return res.status(400).json({
        success: false,
        message: `Fecha inválida: ${fecha}. Use formato YYYY-MM-DD`,
      });
    }

    // ===== Obtener profesores de la asignatura =====
    const { data: profesoresAsignatura, error: errorProfesores } = await supabase
      .from('profesor_asignatura')
      .select(
        `
        profesor_id,
        usuario:profesor_id (
          id,
          nombre,
          apellido,
          email,
          timezone
        )
      `
      )
      .eq('asignatura_id', asignatura_id);

    if (errorProfesores) throw errorProfesores;

    if (!profesoresAsignatura || profesoresAsignatura.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          fecha: dtCliente.toISODate(),
          asignatura_id,
          duracion_horas: duracion,
          timezone: clienteTimeZone,
          franjas_disponibles: [],
          total: 0,
          mensaje: 'No hay profesores disponibles para esta asignatura',
        },
      });
    }

    const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const bloquesDisponibles = [];

    for (const pa of profesoresAsignatura) {
      const profesorId = pa.profesor_id;
      const profesor = pa.usuario;
      const profesorTZ = profesor?.timezone || DEFAULT_TZ;

      // Convertir "el día del cliente" al TZ del profesor (mismo instante)
      const dtProfesorBase = dtCliente.setZone(profesorTZ);

      // Día de semana en español
      const diaSemana = diasSemana[dtProfesorBase.weekday % 7];

      // Obtener franjas del profesor para ese día de semana
      const { data: franjasDelDia, error: errorFranjasDelDia } = await supabase
        .from('franja_horaria')
        .select('*')
        .eq('profesor_id', profesorId)
        .eq('dia_semana', diaSemana)
        .order('hora_inicio', { ascending: true });

      if (errorFranjasDelDia || !franjasDelDia || franjasDelDia.length === 0) {
        continue;
      }

      // Rango del día EN TZ del profesor, convertido a UTC para comparar con fecha_hora (timestamptz)
      const inicioDiaUTC = dtProfesorBase.startOf('day').toUTC().toISO();
      const finDiaUTC = dtProfesorBase.endOf('day').toUTC().toISO();

      // Generar posibles horas de inicio (00:00 a 23:00)
      for (let hora = 0; hora < 24; hora++) {
        const horaInicio = `${hora.toString().padStart(2, '0')}:00:00`;

        const franjasConsecutivas = buscarFranjasConsecutivas(franjasDelDia, horaInicio, duracion);
        if (!franjasConsecutivas) continue;

        // Verificar conflicto SOLO en el día consultado
        const { data: sesionesExistentes, error: errorSesiones } = await supabase
          .from('sesion_clase')
          .select('id')
          .eq('profesor_id', profesorId)
          .eq('estado', 'programada')
          .gte('fecha_hora', inicioDiaUTC)
          .lte('fecha_hora', finDiaUTC)
          .overlaps('franja_horaria_ids', franjasConsecutivas);

        if (errorSesiones) continue;

        if (!sesionesExistentes || sesionesExistentes.length === 0) {
          // construir fecha/hora inicio-fin en TZ profesor
          const [hh, mm, ss] = horaInicio.split(':').map(Number);
          const inicioProfesor = dtProfesorBase.set({ hour: hh, minute: mm, second: ss });
          const finProfesor = inicioProfesor.plus({ hours: duracion });

          // NUEVO: horas convertidas a la TZ del estudiante (cliente)
          const inicioEstudiante = inicioProfesor.setZone(clienteTimeZone);
          const finEstudiante = finProfesor.setZone(clienteTimeZone);

          bloquesDisponibles.push({
            hora_inicio: horaInicio,
            hora_fin: finProfesor.toFormat('HH:mm:ss'),

            fecha_hora_inicio_iso: inicioProfesor.toUTC().toISO(),
            fecha_hora_fin_iso: finProfesor.toUTC().toISO(),

            // NUEVO: mismas franjas, pero en TZ del estudiante
            inicio_estudiante: inicioEstudiante.toFormat('HH:mm:ss'),
            fin_estudiante: finEstudiante.toFormat('HH:mm:ss'),

            duracion_horas: duracion,
            franja_horaria_ids: franjasConsecutivas,
            profesor: {
              id: profesor?.id,
              nombre: profesor?.nombre,
              apellido: profesor?.apellido,
              email: profesor?.email,
              timezone: profesorTZ,
            },
          });
        }
      }
    }

    bloquesDisponibles.sort((a, b) => {
      const c = a.fecha_hora_inicio_iso.localeCompare(b.fecha_hora_inicio_iso);
      return c !== 0 ? c : a.hora_inicio.localeCompare(b.hora_inicio);
    });

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
