import { supabase } from '../config/supabase.js';
import { buscarFranjasConsecutivas, sumarHoras } from './franjaHelpers.js';

/**
 * Asigna automáticamente un profesor a una clase personalizada
 * basándose en:
 * 1. Profesores que imparten la asignatura
 * 2. Disponibilidad en el horario solicitado (franjas horarias consecutivas)
 * 3. Sin conflictos con otras sesiones programadas
 * 4. Menor carga de trabajo (menos sesiones activas)
 * 5. Mayor disponibilidad (más franjas horarias)
 * 6. Prioridad al administrador si imparte la asignatura
 * 
 * @param {string} asignaturaId - ID de la asignatura de la clase
 * @param {Date} fechaHora - Fecha y hora solicitada para la clase
 * @param {number} duracionHoras - Duración de la clase en horas
 * @returns {Promise<Object>} - Objeto con profesor y franjas utilizadas
 */
export const asignarProfesorOptimo = async (asignaturaId, fechaHora, duracionHoras) => {
  try {
    // 1. Calcular día de la semana y hora
    const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const diaSemana = diasSemana[fechaHora.getDay()];
    const horaInicio = fechaHora.toTimeString().slice(0, 8); // "14:00:00"
    
    console.log(`📅 Buscando profesores disponibles:`);
    console.log(`   Asignatura ID: ${asignaturaId}`);
    console.log(`   Día: ${diaSemana}`);
    console.log(`   Hora inicio: ${horaInicio}`);
    console.log(`   Duración: ${duracionHoras}h`);

    // 2. Obtener profesores que imparten esta asignatura
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

    // 3. Calcular métricas y disponibilidad de cada profesor
    const profesoresConMetricas = await Promise.all(
      profesoresAsignatura.map(async (pa) => {
        const profesorId = pa.profesor_id;
        const profesor = pa.usuario;

        // 3.1 Contar sesiones activas totales
        const { count: sesionesActivas, error: errorSesiones } = await supabase
          .from('sesion_clase')
          .select('*', { count: 'exact', head: true })
          .eq('profesor_id', profesorId)
          .eq('estado', 'programada');

        if (errorSesiones) {
          console.error(`Error al contar sesiones del profesor ${profesorId}:`, errorSesiones);
        }

        // 3.2 Contar franjas horarias totales
        const { count: franjasDisponibles, error: errorFranjas } = await supabase
          .from('franja_horaria')
          .select('*', { count: 'exact', head: true })
          .eq('profesor_id', profesorId);

        if (errorFranjas) {
          console.error(`Error al contar franjas del profesor ${profesorId}:`, errorFranjas);
        }

        // 3.3 Obtener franjas del día específico
        const { data: franjasDelDia, error: errorFranjasDelDia } = await supabase
          .from('franja_horaria')
          .select('*')
          .eq('profesor_id', profesorId)
          .eq('dia_semana', diaSemana)
          .order('hora_inicio', { ascending: true });

        if (errorFranjasDelDia) {
          console.error(`Error al obtener franjas del día:`, errorFranjasDelDia);
        }

        // 3.4 Buscar franjas consecutivas que cubran la duración
        let franjasConsecutivas = null;
        if (franjasDelDia && franjasDelDia.length > 0) {
          franjasConsecutivas = buscarFranjasConsecutivas(
            franjasDelDia,
            horaInicio,
            duracionHoras
          );
        }

        const tieneFranjasConsecutivas = franjasConsecutivas !== null;

        // 3.5 Verificar conflictos con sesiones ya programadas
        let tieneConflicto = false;
        if (tieneFranjasConsecutivas) {
          // Buscar sesiones programadas del profesor en la misma fecha
          const fechaInicio = new Date(fechaHora);
          fechaInicio.setHours(0, 0, 0, 0); // Inicio del día
          
          const fechaFinDia = new Date(fechaHora);
          fechaFinDia.setHours(23, 59, 59, 999); // Fin del día

          const { data: sesionesExistentes, error: errorSesionesExistentes } = await supabase
            .from('sesion_clase')
            .select('fecha_hora, franja_horaria_ids')
            .eq('profesor_id', profesorId)
            .eq('estado', 'programada')
            .gte('fecha_hora', fechaInicio.toISOString())
            .lte('fecha_hora', fechaFinDia.toISOString());

          if (errorSesionesExistentes) {
            console.error(`Error al verificar conflictos:`, errorSesionesExistentes);
          }

          // Verificar si alguna franja ya está ocupada
          if (sesionesExistentes && sesionesExistentes.length > 0) {
            tieneConflicto = sesionesExistentes.some(sesion => {
              if (!sesion.franja_horaria_ids) return false;
              
              // Hay conflicto si alguna franja se repite
              return franjasConsecutivas.some(franjaId => 
                sesion.franja_horaria_ids.includes(franjaId)
              );
            });
          }
        }

        const tieneDisponibilidad = tieneFranjasConsecutivas && !tieneConflicto;

        // Verificar si es administrador
        const esAdmin = profesor?.rol === 'administrador';

        // Score: priorizar disponibilidad, admin, menos carga, más franjas
        // Si NO tiene disponibilidad, score = Infinity (descartado)
        let score = Infinity;
        if (tieneDisponibilidad) {
          score = (esAdmin ? -1000 : 0) + (sesionesActivas * 10) - franjasDisponibles;
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

    // 4. Ordenar por score (menor es mejor)
    profesoresConMetricas.sort((a, b) => a.score - b.score);

    console.log('📊 Métricas de profesores para asignación:');
    profesoresConMetricas.forEach(p => {
      console.log(`  - ${p.profesor.nombre} ${p.profesor.apellido} (${p.profesor.rol}):`);
      console.log(`    • Sesiones: ${p.sesionesActivas}`);
      console.log(`    • Franjas totales: ${p.franjasDisponibles}`);
      console.log(`    • Tiene ${duracionHoras}h consecutivas: ${p.tieneFranjasConsecutivas}`);
      console.log(`    • Tiene conflicto: ${p.tieneConflicto}`);
      console.log(`    • Disponible: ${p.tieneDisponibilidad}`);
      console.log(`    • Score: ${p.score}`);
    });

    // 5. Seleccionar el profesor con mejor score Y que tenga disponibilidad
    const profesorSeleccionado = profesoresConMetricas.find(p => p.tieneDisponibilidad);

    if (!profesorSeleccionado) {
      console.log('❌ Ningún profesor tiene disponibilidad completa para ese horario');
      return null;
    }

    console.log(`✅ Profesor asignado: ${profesorSeleccionado.profesor.nombre} ${profesorSeleccionado.profesor.apellido} (${profesorSeleccionado.profesor.id})`);
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

/**
 * Obtiene las franjas horarias disponibles de un profesor
 * @param {string} profesorId - ID del profesor
 * @returns {Promise<Array>} - Array de franjas horarias
 */
export const obtenerFranjasDisponibles = async (profesorId) => {
  try {
    const { data: franjas, error } = await supabase
      .from('franja_horaria')
      .select('*')
      .eq('profesor_id', profesorId)
      .order('dia_semana', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (error) {
      throw new Error(`Error al obtener franjas: ${error.message}`);
    }

    return franjas || [];
  } catch (error) {
    console.error('❌ Error al obtener franjas disponibles:', error);
    throw error;
  }
};
