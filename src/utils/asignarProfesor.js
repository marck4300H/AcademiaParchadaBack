// src/utils/asignarProfesor.js

import { supabase } from '../config/supabase.js';
import { DateTime } from 'luxon';
import { buscarFranjasConsecutivas } from './franjaHelpers.js';

/**
 * Asigna automáticamente un profesor a una clase personalizada.
 *
 * IMPORTANTE (timezone):
 * - fechaHoraISO representa el horario elegido por el estudiante.
 * - Se interpreta con:
 *    a) offset/Z incluido en el string, o
 *    b) estudianteTimeZone cuando el string NO tiene offset.
 * - Luego se convierte al timezone del profesor para comparar con franja_horaria.
 *
 * @param {string} asignaturaId
 * @param {string} fechaHoraISO - ISO con offset/Z recomendado; si viene sin offset, usar estudianteTimeZone
 * @param {number} duracionHoras
 * @param {string|null} estudianteTimeZone - ej "America/Bogota"
 * @returns {Promise<{profesor: any, franjasUtilizadas: string[], profesorTimeZone: string, fechaHoraProfesorISO: string} | null>}
 */
export const asignarProfesorOptimo = async (asignaturaId, fechaHoraISO, duracionHoras, estudianteTimeZone = null) => {
  try {
    // 1) Parse robusto del input del estudiante
    if (!fechaHoraISO || typeof fechaHoraISO !== 'string') return null;

    const hasZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(fechaHoraISO);
    const baseZone = estudianteTimeZone || 'America/Bogota';

    const dtEstudiante = hasZone
      ? DateTime.fromISO(fechaHoraISO, { setZone: true })          // respeta offset/Z
      : DateTime.fromISO(fechaHoraISO, { zone: baseZone });        // interpreta como zona del estudiante

    if (!dtEstudiante.isValid) return null;

    // 2) Obtener profesores que imparten esta asignatura (incluye timezone)
    const { data: profesoresAsignatura, error: errorProfesores } = await supabase
      .from('profesor_asignatura')
      .select(`
        profesor_id,
        usuario:profesor_id (
          id,
          nombre,
          apellido,
          email,
          telefono,
          rol,
          timezone
        )
      `)
      .eq('asignatura_id', asignaturaId);

    if (errorProfesores) {
      console.error('Error al obtener profesores:', errorProfesores);
      return null;
    }

    if (!profesoresAsignatura || profesoresAsignatura.length === 0) {
      return null;
    }

    // Helper: dia_semana en español (como lo usas en BD) [file:254]
    const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

    // 3) Calcular métricas y disponibilidad por profesor (en su TZ)
    const profesoresConMetricas = await Promise.all(
      profesoresAsignatura.map(async (pa) => {
        const profesorId = pa.profesor_id;
        const profesor = pa.usuario;

        const profesorTZ = profesor?.timezone || 'America/Bogota';

        // Convertir el instante elegido por estudiante a TZ del profesor
        const dtProfesor = dtEstudiante.setZone(profesorTZ);

        const diaSemana = diasSemana[dtProfesor.weekday % 7]; // luxon: 1..7 (lunes..domingo)
        // Ajuste para que domingo sea 0:
        // weekday 7 => domingo, weekday%7 = 0 => 'domingo' OK

        const horaInicio = dtProfesor.toFormat('HH:mm:ss');

        // 3.1 Contar sesiones activas
        const { count: sesionesActivas } = await supabase
          .from('sesion_clase')
          .select('*', { count: 'exact', head: true })
          .eq('profesor_id', profesorId)
          .eq('estado', 'programada');

        // 3.2 Contar franjas totales
        const { count: franjasDisponibles } = await supabase
          .from('franja_horaria')
          .select('*', { count: 'exact', head: true })
          .eq('profesor_id', profesorId);

        // 3.3 Obtener franjas del día (del profesor)
        const { data: franjasDelDia, error: errorFranjasDelDia } = await supabase
          .from('franja_horaria')
          .select('*')
          .eq('profesor_id', profesorId)
          .eq('dia_semana', diaSemana)
          .order('hora_inicio', { ascending: true });

        if (errorFranjasDelDia) {
          console.error('Error al obtener franjas del día:', errorFranjasDelDia);
          return { profesor, score: Infinity, tieneDisponibilidad: false };
        }

        // 3.4 Buscar franjas consecutivas
        let franjasConsecutivas = null;
        if (franjasDelDia && franjasDelDia.length > 0) {
          franjasConsecutivas = buscarFranjasConsecutivas(franjasDelDia, horaInicio, duracionHoras);
        }

        const tieneFranjasConsecutivas = franjasConsecutivas !== null;

        // 3.5 Verificar conflictos contra sesiones programadas en el día del profesor
        let tieneConflicto = false;

        if (tieneFranjasConsecutivas) {
          // Ventana de ese día EN TZ del profesor, pero almacenado como ISO UTC en BD.
          const inicioDiaProfesor = dtProfesor.startOf('day').toUTC().toISO();
          const finDiaProfesor = dtProfesor.endOf('day').toUTC().toISO();

          const { data: sesionesExistentes, error: errorSesionesExistentes } = await supabase
            .from('sesion_clase')
            .select('franja_horaria_ids')
            .eq('profesor_id', profesorId)
            .eq('estado', 'programada')
            .gte('fecha_hora', inicioDiaProfesor)
            .lte('fecha_hora', finDiaProfesor);

          if (errorSesionesExistentes) {
            console.error('Error al verificar conflictos:', errorSesionesExistentes);
          } else if (sesionesExistentes && sesionesExistentes.length > 0) {
            tieneConflicto = sesionesExistentes.some((sesion) => {
              if (!sesion.franja_horaria_ids) return false;
              return franjasConsecutivas.some((franjaId) => sesion.franja_horaria_ids.includes(franjaId));
            });
          }
        }

        const tieneDisponibilidad = tieneFranjasConsecutivas && !tieneConflicto;
        const esAdmin = profesor?.rol === 'administrador';

        let score = Infinity;
        if (tieneDisponibilidad) {
          score = (esAdmin ? -1000 : 0) + ((sesionesActivas || 0) * 10) - (franjasDisponibles || 0);
        }

        return {
          profesor,
          profesorTZ,
          fechaHoraProfesorISO: dtProfesor.toISO(), // útil para logs/metadata si quieres
          sesionesActivas: sesionesActivas || 0,
          franjasDisponibles: franjasDisponibles || 0,
          tieneFranjasConsecutivas,
          franjasConsecutivas,
          tieneConflicto,
          tieneDisponibilidad,
          esAdmin,
          score
        };
      })
    );

    profesoresConMetricas.sort((a, b) => a.score - b.score);

    const profesorSeleccionado = profesoresConMetricas.find((p) => p.tieneDisponibilidad);
    if (!profesorSeleccionado) return null;

    return {
      profesor: profesorSeleccionado.profesor,
      franjasUtilizadas: profesorSeleccionado.franjasConsecutivas,
      profesorTimeZone: profesorSeleccionado.profesorTZ,
      fechaHoraProfesorISO: profesorSeleccionado.fechaHoraProfesorISO
    };
  } catch (error) {
    console.error('❌ Error en asignación de profesor:', error);
    return null;
  }
};

export const obtenerFranjasDisponibles = async (profesorId) => {
  try {
    const { data: franjas, error } = await supabase
      .from('franja_horaria')
      .select('*')
      .eq('profesor_id', profesorId)
      .order('dia_semana', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (error) throw new Error(`Error al obtener franjas: ${error.message}`);
    return franjas || [];
  } catch (error) {
    console.error('❌ Error al obtener franjas disponibles:', error);
    throw error;
  }
};
