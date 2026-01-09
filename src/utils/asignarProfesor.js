// src/utils/asignarProfesor.js
import { supabase } from '../config/supabase.js';
import { buscarFranjasConsecutivas } from './franjaHelpers.js';

/**
 * Asigna automáticamente un profesor a una clase personalizada
 * @param {string} asignaturaId
 * @param {Date} fechaHora
 * @param {number} duracionHoras
 * @returns {Promise<{profesor: object, franjasUtilizadas: string[]} | null>}
 */
export const asignarProfesorOptimo = async (asignaturaId, fechaHora, duracionHoras) => {
  try {
    const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const diaSemana = diasSemana[fechaHora.getDay()];
    const horaInicio = fechaHora.toTimeString().slice(0, 8); // "14:00:00"

    console.log('📅 Buscando profesores disponibles:');
    console.log(' Asignatura ID:', asignaturaId);
    console.log(' Día:', diaSemana);
    console.log(' Hora inicio:', horaInicio);
    console.log(' Duración:', `${duracionHoras}h`);

    // 1) Profesores que imparten la asignatura + datos del usuario (incluye email)
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
          rol
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

    // 2) Métricas por profesor
    const profesoresConMetricas = await Promise.all(
      profesoresAsignatura.map(async (pa) => {
        const profesorId = pa.profesor_id;
        const profesor = pa.usuario; // usuario del profesor

        // Si por algún motivo la relación no devuelve usuario, descartar
        if (!profesor?.id) {
          return {
            profesor: null,
            sesionesActivas: 0,
            franjasDisponibles: 0,
            tieneFranjasConsecutivas: false,
            franjasConsecutivas: null,
            tieneConflicto: false,
            tieneDisponibilidad: false,
            esAdmin: false,
            score: Infinity
          };
        }

        // 2.1) Contar sesiones activas
        const { count: sesionesActivas, error: errorSesiones } = await supabase
          .from('sesion_clase')
          .select('*', { count: 'exact', head: true })
          .eq('profesor_id', profesorId)
          .eq('estado', 'programada');

        if (errorSesiones) {
          console.error(`Error al contar sesiones del profesor ${profesorId}:`, errorSesiones);
        }

        // 2.2) Contar franjas totales
        const { count: franjasDisponibles, error: errorFranjas } = await supabase
          .from('franja_horaria')
          .select('*', { count: 'exact', head: true })
          .eq('profesor_id', profesorId);

        if (errorFranjas) {
          console.error(`Error al contar franjas del profesor ${profesorId}:`, errorFranjas);
        }

        // 2.3) Franjas del día
        const { data: franjasDelDia, error: errorFranjasDelDia } = await supabase
          .from('franja_horaria')
          .select('*')
          .eq('profesor_id', profesorId)
          .eq('dia_semana', diaSemana)
          .order('hora_inicio', { ascending: true });

        if (errorFranjasDelDia) {
          console.error('Error al obtener franjas del día:', errorFranjasDelDia);
        }

        // 2.4) Buscar consecutivas
        let franjasConsecutivas = null;
        if (franjasDelDia && franjasDelDia.length > 0) {
          franjasConsecutivas = buscarFranjasConsecutivas(franjasDelDia, horaInicio, duracionHoras);
        }

        const tieneFranjasConsecutivas = franjasConsecutivas !== null;

        // 2.5) Conflictos con sesiones del mismo día
        let tieneConflicto = false;

        if (tieneFranjasConsecutivas) {
          const fechaInicio = new Date(fechaHora);
          fechaInicio.setHours(0, 0, 0, 0);

          const fechaFinDia = new Date(fechaHora);
          fechaFinDia.setHours(23, 59, 59, 999);

          const { data: sesionesExistentes, error: errorSesionesExistentes } = await supabase
            .from('sesion_clase')
            .select('fecha_hora, franja_horaria_ids')
            .eq('profesor_id', profesorId)
            .eq('estado', 'programada')
            .gte('fecha_hora', fechaInicio.toISOString())
            .lte('fecha_hora', fechaFinDia.toISOString());

          if (errorSesionesExistentes) {
            console.error('Error al verificar conflictos:', errorSesionesExistentes);
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
          score = (esAdmin ? -1000 : 0) + (Number(sesionesActivas || 0) * 10) - Number(franjasDisponibles || 0);
        }

        return {
          profesor,
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

    console.log('📊 Métricas de profesores para asignación:');
    profesoresConMetricas.forEach((p) => {
      if (!p.profesor) return;
      console.log(` - ${p.profesor.nombre} ${p.profesor.apellido} (${p.profesor.rol}):`);
      console.log(`   • Sesiones: ${p.sesionesActivas}`);
      console.log(`   • Franjas totales: ${p.franjasDisponibles}`);
      console.log(`   • Tiene ${duracionHoras}h consecutivas: ${p.tieneFranjasConsecutivas}`);
      console.log(`   • Tiene conflicto: ${p.tieneConflicto}`);
      console.log(`   • Disponible: ${p.tieneDisponibilidad}`);
      console.log(`   • Score: ${p.score}`);
    });

    const profesorSeleccionado = profesoresConMetricas.find((p) => p.tieneDisponibilidad && p.profesor?.id);

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
      franjasUtilizadas: profesorSeleccionado.franjasConsecutivas
    };
  } catch (error) {
    console.error('❌ Error en asignación de profesor:', error);
    return null;
  }
};
