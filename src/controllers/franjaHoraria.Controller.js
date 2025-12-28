import { supabase } from '../config/supabase.js';
import { 
  dividirEnFranjasDeUnaHora, 
  validarFormatoHora,
  calcularDiferenciaHoras 
} from '../utils/franjaHelpers.js';

/**
 * Crear franja(s) horaria(s) para un profesor
 * Divide automáticamente en bloques de 1 hora
 */
export const crearFranjaHoraria = async (req, res) => {
  try {
    const { profesor_id, dia_semana, hora_inicio, hora_fin } = req.body;

    // Validar formato de horas
    if (!validarFormatoHora(hora_inicio) || !validarFormatoHora(hora_fin)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de hora inválido. Use HH:MM:SS (ej: 14:00:00)'
      });
    }

    // Validar que hora_fin sea mayor que hora_inicio
    const duracionTotal = calcularDiferenciaHoras(hora_inicio, hora_fin);
    if (duracionTotal <= 0) {
      return res.status(400).json({
        success: false,
        message: 'La hora de fin debe ser mayor que la hora de inicio'
      });
    }

    // Verificar que el profesor existe
    const { data: profesor, error: profesorError } = await supabase
      .from('usuario')
      .select('id, rol')
      .eq('id', profesor_id)
      .single();

    if (profesorError || !profesor) {
      return res.status(404).json({
        success: false,
        message: 'Profesor no encontrado'
      });
    }

    if (profesor.rol !== 'profesor' && profesor.rol !== 'administrador') {
      return res.status(400).json({
        success: false,
        message: 'El usuario debe tener rol de profesor o administrador'
      });
    }

    console.log(`📅 Creando disponibilidad para profesor ${profesor_id}`);
    console.log(`   Día: ${dia_semana}`);
    console.log(`   Horario: ${hora_inicio} - ${hora_fin} (${duracionTotal}h)`);

    // Dividir en franjas de 1 hora
    const franjasDeUnaHora = dividirEnFranjasDeUnaHora(hora_inicio, hora_fin);
    
    console.log(`✂️ Dividiendo en ${franjasDeUnaHora.length} franjas de 1 hora`);

    // Preparar datos para inserción
    const franjasParaInsertar = franjasDeUnaHora.map(franja => ({
      profesor_id,
      dia_semana,
      hora_inicio: franja.hora_inicio,
      hora_fin: franja.hora_fin
    }));

    // Verificar solapamientos con franjas existentes
    const { data: franjasExistentes } = await supabase
      .from('franja_horaria')
      .select('*')
      .eq('profesor_id', profesor_id)
      .eq('dia_semana', dia_semana);

    if (franjasExistentes && franjasExistentes.length > 0) {
      for (const nuevaFranja of franjasParaInsertar) {
        const hayConflicto = franjasExistentes.some(existente => {
          // Verificar si hay solapamiento
          return (
            nuevaFranja.hora_inicio < existente.hora_fin &&
            nuevaFranja.hora_fin > existente.hora_inicio
          );
        });

        if (hayConflicto) {
          return res.status(400).json({
            success: false,
            message: `Ya existe una franja que se solapa con ${nuevaFranja.hora_inicio} - ${nuevaFranja.hora_fin}`
          });
        }
      }
    }

    // Insertar todas las franjas
    const { data: franjasCreadas, error: insertError } = await supabase
      .from('franja_horaria')
      .insert(franjasParaInsertar)
      .select();

    if (insertError) {
      console.error('Error al crear franjas:', insertError);
      throw insertError;
    }

    console.log(`✅ Se crearon ${franjasCreadas.length} franjas horarias`);

    return res.status(201).json({
      success: true,
      message: `Se crearon ${franjasCreadas.length} franjas horarias de 1 hora`,
      data: {
        franjas: franjasCreadas,
        resumen: {
          total_franjas: franjasCreadas.length,
          bloque_original: `${hora_inicio} - ${hora_fin}`,
          duracion_total: `${duracionTotal}h`
        }
      }
    });

  } catch (error) {
    console.error('❌ Error al crear franja horaria:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al crear franja horaria',
      error: error.message
    });
  }
};

/**
 * Listar franjas horarias de un profesor
 */
export const listarFranjasProfesor = async (req, res) => {
  try {
    const { profesor_id } = req.params;
    const { dia_semana } = req.query;

    let query = supabase
      .from('franja_horaria')
      .select('*')
      .eq('profesor_id', profesor_id)
      .order('dia_semana', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (dia_semana) {
      query = query.eq('dia_semana', dia_semana);
    }

    const { data: franjas, error } = await query;

    if (error) {
      console.error('Error al listar franjas:', error);
      throw error;
    }

    // Agrupar franjas por día
    const franjasPorDia = {};
    franjas.forEach(franja => {
      if (!franjasPorDia[franja.dia_semana]) {
        franjasPorDia[franja.dia_semana] = [];
      }
      franjasPorDia[franja.dia_semana].push(franja);
    });

    return res.status(200).json({
      success: true,
      data: {
        franjas,
        franjas_por_dia: franjasPorDia,
        total: franjas.length
      }
    });

  } catch (error) {
    console.error('❌ Error al listar franjas:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener franjas horarias',
      error: error.message
    });
  }
};

/**
 * Eliminar una franja horaria específica
 */
export const eliminarFranjaHoraria = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que no haya sesiones programadas usando esta franja
    const { data: sesionesConFranja } = await supabase
      .from('sesion_clase')
      .select('id')
      .contains('franja_horaria_ids', [id])
      .eq('estado', 'programada');

    if (sesionesConFranja && sesionesConFranja.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar esta franja porque tiene sesiones programadas'
      });
    }

    const { error } = await supabase
      .from('franja_horaria')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error al eliminar franja:', error);
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: 'Franja horaria eliminada exitosamente'
    });

  } catch (error) {
    console.error('❌ Error al eliminar franja:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar franja horaria',
      error: error.message
    });
  }
};

/**
 * Eliminar todas las franjas de un profesor en un día específico
 */
export const eliminarFranjasPorDia = async (req, res) => {
  try {
    const { profesor_id } = req.params;
    const { dia_semana } = req.body;

    // Obtener IDs de las franjas a eliminar
    const { data: franjasAEliminar } = await supabase
      .from('franja_horaria')
      .select('id')
      .eq('profesor_id', profesor_id)
      .eq('dia_semana', dia_semana);

    if (!franjasAEliminar || franjasAEliminar.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron franjas para ese día'
      });
    }

    const idsAEliminar = franjasAEliminar.map(f => f.id);

    // Verificar sesiones programadas
    const { data: sesionesConFranjas } = await supabase
      .from('sesion_clase')
      .select('id')
      .overlaps('franja_horaria_ids', idsAEliminar)
      .eq('estado', 'programada');

    if (sesionesConFranjas && sesionesConFranjas.length > 0) {
      return res.status(400).json({
        success: false,
        message: `No se pueden eliminar estas franjas porque ${sesionesConFranjas.length} sesión(es) están programadas`
      });
    }

    // Eliminar franjas
    const { error } = await supabase
      .from('franja_horaria')
      .delete()
      .eq('profesor_id', profesor_id)
      .eq('dia_semana', dia_semana);

    if (error) {
      console.error('Error al eliminar franjas:', error);
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: `Se eliminaron ${franjasAEliminar.length} franjas del ${dia_semana}`
    });

  } catch (error) {
    console.error('❌ Error al eliminar franjas por día:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar franjas horarias',
      error: error.message
    });
  }
};

/**
 * Obtener resumen de disponibilidad de un profesor
 * Agrupa franjas consecutivas en bloques
 */
export const obtenerResumenDisponibilidad = async (req, res) => {
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

    // Agrupar franjas consecutivas
    const bloquesPorDia = {};
    
    franjas.forEach(franja => {
      if (!bloquesPorDia[franja.dia_semana]) {
        bloquesPorDia[franja.dia_semana] = [];
      }

      const bloques = bloquesPorDia[franja.dia_semana];
      const ultimoBloque = bloques[bloques.length - 1];

      if (ultimoBloque && ultimoBloque.hora_fin === franja.hora_inicio) {
        // Extender el bloque existente
        ultimoBloque.hora_fin = franja.hora_fin;
        ultimoBloque.franjas_ids.push(franja.id);
      } else {
        // Crear nuevo bloque
        bloques.push({
          hora_inicio: franja.hora_inicio,
          hora_fin: franja.hora_fin,
          franjas_ids: [franja.id]
        });
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        bloques_disponibilidad: bloquesPorDia,
        total_franjas: franjas.length
      }
    });

  } catch (error) {
    console.error('❌ Error al obtener resumen:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener resumen de disponibilidad',
      error: error.message
    });
  }
};
