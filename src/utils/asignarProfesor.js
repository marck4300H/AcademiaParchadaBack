import { DateTime } from 'luxon';
import { supabase } from '../config/supabase.js';
import { buscarFranjasConsecutivas } from './franjaHelpers.js';

const DEFAULT_TZ = 'America/Bogota';
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/**
 * Convierte un Date (instante) a (dia_semana, hora_inicio) en una zona específica.
 */
const getDiaSemanaYHoraEnZona = (fechaHoraDate, timezone) => {
  const tz = timezone || DEFAULT_TZ;

  const dtLocal = DateTime.fromJSDate(fechaHoraDate, { zone: 'utc' }).setZone(tz);
  if (!dtLocal.isValid) throw new Error(`Timezone inválido: ${tz}`);

  const diaSemana = DIAS_SEMANA[dtLocal.weekday % 7]; // Luxon: 1=lunes..7=domingo
  const horaInicio = dtLocal.toFormat('HH:mm:ss');

  return { tz, dtLocal, diaSemana, horaInicio };
};

/**
 * Obtiene (inicioDiaUTC, finDiaUTC) para consultar sesiones del profesor en Supabase,
 * pero calculado según el día local del profesor.
 */
const getRangoDiaUTCDesdeLocal = (dtLocal) => {
  const inicioLocal = dtLocal.startOf('day');
  const finLocal = dtLocal.endOf('day');

  const inicioUTC = inicioLocal.toUTC().toISO();
  const finUTC = finLocal.toUTC().toISO();

  return { inicioUTC, finUTC };
};

/**
 * Asigna automáticamente un profesor a una clase personalizada.
 *
 * @param {string} asignaturaId
 * @param {Date} fechaHora - Instante (Date) de la clase
 * @param {number} duracionHoras
 * @returns {Promise<{profesor: object, franjasUtilizadas: string[] } | null>}
 */
export const asignarProfesorOptimo = async (asignaturaId, fechaHora, duracionHoras) => {
  try {
    if (!(fechaHora instanceof Date) || Number.isNaN(fechaHora.getTime())) {
      throw new Error('fechaHora inválida (se esperaba Date válido)');
    }

    // 1) Traer profesores que imparten esa asignatura, incluyendo timezone del usuario
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
      throw new Error(`Error al obtener profesores: ${errorProfesores.message}`);
    }

    if (!profesoresAsignatura || profesoresAsignatura.length === 0) {
      console.log('❌ No hay profesores que impartan esta asignatura');
      return null;
    }

    console.log(`✅ Encontrados ${profesoresAsignatura.length} profesores que imparten esta asignatura`);

    // 2) Calcular métricas/disponibilidad por profesor, usando SU timezone
    const profesoresConMetricas = await Promise.all(
      profesoresAsignatura.map(async (pa) => {
        const profesorId = pa.profesor_id;
        const profesor = pa.usuario;
        const tzProfesor = profesor?.timezone || DEFAULT_TZ;

        // Día/hora en la zona del profesor
        const { dtLocal, diaSemana, horaInicio } = getDiaSemanaYHoraEnZona(fechaHora, tzProfesor);

        // 2.1 Contar sesiones activas
        const { count: sesionesActivas, error: errorSesiones } = await supabase
          .from('sesion_clase')
          .select('*', { count: 'exact', head: true })
          .eq('profesor_id', profesorId)
          .eq('estado', 'programada');

        if (errorSesiones) console.error(`Error al contar sesiones del profesor ${profesorId}:`, errorSesiones);

        // 2.2 Contar franjas totales
        const { count: franjasDisponibles, error: errorFranjas } = await supabase
          .from('franja_horaria')
          .select('*', { count: 'exact', head: true })
          .eq('profesor_id', profesorId);

        if (errorFranjas) console.error(`Error al contar franjas del profesor ${profesorId}:`, errorFranjas);

        // 2.3 Traer franjas del día local del profesor
        const { data: franjasDelDia, error: errorFranjasDelDia } = await supabase
          .from('franja_horaria')
          .select('*')
          .eq('profesor_id', profesorId)
          .eq('dia_semana', diaSemana)
          .order('hora_inicio', { ascending: true });

        if (errorFranjasDelDia) console.error(`Error al obtener franjas del día:`, errorFranjasDelDia);

        // 2.4 Buscar consecutivas
        let franjasConsecutivas = null;
        if (franjasDelDia && franjasDelDia.length > 0) {
          franjasConsecutivas = buscarFranjasConsecutivas(franjasDelDia, horaInicio, duracionHoras);
        }
        const tieneFranjasConsecutivas = franjasConsecutivas !== null;

        // 2.5 Conflictos: sesiones del profesor en el MISMO día local (convertido a UTC para query)
        let tieneConflicto = false;

        if (tieneFranjasConsecutivas) {
          const { inicioUTC, finUTC } = getRangoDiaUTCDesdeLocal(dtLocal);

          const { data: sesionesExistentes, error: errorSesionesExistentes } = await supabase
            .from('sesion_clase')
            .select('fecha_hora, franja_horaria_ids')
            .eq('profesor_id', profesorId)
            .eq('estado', 'programada')
            .gte('fecha_hora', inicioUTC)
            .lte('fecha_hora', finUTC);

          if (errorSesionesExistentes) {
            console.error(`Error al verificar conflictos:`, errorSesionesExistentes);
          }

          if (sesionesExistentes && sesionesExistentes.length > 0) {
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
          tzProfesor,
          diaSemana,
          horaInicio,
          sesionesActivas: sesionesActivas || 0,
          franjasDisponibles: franjasDisponibles || 0,
          tieneFranjasConsecutivas,
          franjasConsecutivas,
          tieneConflicto,
          tieneDisponibilidad,
          esAdmin,
          score,
        };
      })
    );

    // 3) Ordenar por score
    profesoresConMetricas.sort((a, b) => a.score - b.score);

    console.log('📊 Métricas de profesores para asignación:');
    profesoresConMetricas.forEach((p) => {
      console.log(` - ${p.profesor.nombre} ${p.profesor.apellido} (${p.profesor.rol}) TZ=${p.tzProfesor}`);
      console.log(` • Día local: ${p.diaSemana}`);
      console.log(` • Hora inicio local: ${p.horaInicio}`);
      console.log(` • Sesiones: ${p.sesionesActivas}`);
      console.log(` • Franjas totales: ${p.franjasDisponibles}`);
      console.log(` • Tiene ${duracionHoras}h consecutivas: ${p.tieneFranjasConsecutivas}`);
      console.log(` • Tiene conflicto: ${p.tieneConflicto}`);
      console.log(` • Disponible: ${p.tieneDisponibilidad}`);
      console.log(` • Score: ${p.score}`);
    });

    // 4) Elegir profesor disponible
    const profesorSeleccionado = profesoresConMetricas.find((p) => p.tieneDisponibilidad);

    if (!profesorSeleccionado) {
      console.log('❌ Ningún profesor tiene disponibilidad completa para ese horario');
      return null;
    }

    console.log(
      `✅ Profesor asignado: ${profesorSeleccionado.profesor.nombre} ${profesorSeleccionado.profesor.apellido} (${profesorSeleccionado.profesor.id})`
    );
    console.log(`📍 Franjas utilizadas: ${profesorSeleccionado.franjasConsecutivas.join(', ')}`);

    return {
      profesor: profesorSeleccionado.profesor,
      franjasUtilizadas: profesorSeleccionado.franjasConsecutivas,
    };
  } catch (error) {
    console.error('❌ Error en asignación de profesor:', error);
    return null;
  }
};

/**
 * Obtiene las franjas horarias disponibles de un profesor
 */
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
