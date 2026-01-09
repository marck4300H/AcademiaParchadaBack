// src/utils/asignarProfesor.js
import { supabase } from '../config/supabase.js';
import { buscarFranjasConsecutivas } from './franjaHelpers.js';

export const asignarProfesorOptimo = async (asignaturaId, fechaHora, duracionHoras) => {
  try {
    const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const diaSemana = diasSemana[fechaHora.getDay()];
    const horaInicio = fechaHora.toTimeString().slice(0, 8);

    console.log('📅 Buscando profesores disponibles:');
    console.log(' Asignatura ID:', asignaturaId);
    console.log(' Día:', diaSemana);
    console.log(' Hora inicio:', horaInicio);
    console.log(' Duración:', `${duracionHoras}h`);

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

    const profesoresConMetricas = await Promise.all(
      profesoresAsignatura.map(async (pa) => {
        const profesorId = pa.profesor_id;
        const profesor = pa.usuario;

        if (!profesor?.id) {
          return { profesor: null, tieneDisponibilidad: false, score: Infinity, franjasConsecutivas: null };
        }

        const { count: sesionesActivas } = await supabase
          .from('sesion_clase')
          .select('*', { count: 'exact', head: true })
          .eq('profesor_id', profesorId)
          .eq('estado', 'programada');

        const { count: franjasDisponibles } = await supabase
          .from('franja_horaria')
          .select('*', { count: 'exact', head: true })
          .eq('profesor_id', profesorId);

        const { data: franjasDelDia } = await supabase
          .from('franja_horaria')
          .select('*')
          .eq('profesor_id', profesorId)
          .eq('dia_semana', diaSemana)
          .order('hora_inicio', { ascending: true });

        let franjasConsecutivas = null;
        if (franjasDelDia && franjasDelDia.length > 0) {
          franjasConsecutivas = buscarFranjasConsecutivas(franjasDelDia, horaInicio, duracionHoras);
        }

        const tieneFranjasConsecutivas = franjasConsecutivas !== null;

        let tieneConflicto = false;
        if (tieneFranjasConsecutivas) {
          const fechaInicio = new Date(fechaHora);
          fechaInicio.setHours(0, 0, 0, 0);
          const fechaFinDia = new Date(fechaHora);
          fechaFinDia.setHours(23, 59, 59, 999);

          const { data: sesionesExistentes } = await supabase
            .from('sesion_clase')
            .select('franja_horaria_ids')
            .eq('profesor_id', profesorId)
            .eq('estado', 'programada')
            .gte('fecha_hora', fechaInicio.toISOString())
            .lte('fecha_hora', fechaFinDia.toISOString());

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
          franjasConsecutivas,
          tieneDisponibilidad,
          score
        };
      })
    );

    profesoresConMetricas.sort((a, b) => a.score - b.score);

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
