// src/controllers/profesorHorariosController.js
import { supabase } from '../config/supabase.js';
import { dividirEnFranjasDeUnaHora, validarFormatoHora, calcularDiferenciaHoras } from '../utils/franjaHelpers.js';

/**
 * CU-043: Listar mis franjas
 * GET /api/profesor/horarios?dia_semana=lunes
 */
export const getMisHorarios = async (req, res) => {
  try {
    const profesor_id = req.user.id;
    const { dia_semana } = req.query;

    let query = supabase
      .from('franja_horaria')
      .select('*')
      .eq('profesor_id', profesor_id)
      .order('dia_semana', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (dia_semana) query = query.eq('dia_semana', dia_semana);

    const { data: franjas, error } = await query;
    if (error) throw error;

    return res.json({ success: true, data: { franjas: franjas || [], total: (franjas || []).length } });
  } catch (error) {
    console.error('Error en getMisHorarios:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

/**
 * CU-043: Crear mis franjas (divide en 1h)
 * POST /api/profesor/horarios
 * Body: { dia_semana, hora_inicio, hora_fin }
 */
export const createMisHorarios = async (req, res) => {
  try {
    const profesor_id = req.user.id;
    const { dia_semana, hora_inicio, hora_fin } = req.body;

    if (!dia_semana || !hora_inicio || !hora_fin) {
      return res.status(400).json({ success: false, message: 'dia_semana, hora_inicio y hora_fin son requeridos' });
    }

    if (!validarFormatoHora(hora_inicio) || !validarFormatoHora(hora_fin)) {
      return res.status(400).json({ success: false, message: 'Formato de hora inválido. Use HH:MM:SS' });
    }

    const duracionTotal = calcularDiferenciaHoras(hora_inicio, hora_fin);
    if (duracionTotal <= 0) {
      return res.status(400).json({ success: false, message: 'La hora de fin debe ser mayor que la hora de inicio' });
    }

    const franjasDeUnaHora = dividirEnFranjasDeUnaHora(hora_inicio, hora_fin);
    const franjasParaInsertar = franjasDeUnaHora.map(f => ({
      profesor_id,
      dia_semana,
      hora_inicio: f.hora_inicio,
      hora_fin: f.hora_fin
    }));

    // Solapamiento
    const { data: existentes } = await supabase
      .from('franja_horaria')
      .select('*')
      .eq('profesor_id', profesor_id)
      .eq('dia_semana', dia_semana);

    if (existentes?.length) {
      for (const n of franjasParaInsertar) {
        const conflicto = existentes.some(e => n.hora_inicio < e.hora_fin && n.hora_fin > e.hora_inicio);
        if (conflicto) {
          return res.status(400).json({
            success: false,
            message: `Ya existe una franja que se solapa con ${n.hora_inicio} - ${n.hora_fin}`
          });
        }
      }
    }

    const { data: creadas, error } = await supabase
      .from('franja_horaria')
      .insert(franjasParaInsertar)
      .select();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: `Se crearon ${creadas.length} franjas horarias`,
      data: { franjas: creadas }
    });
  } catch (error) {
    console.error('Error en createMisHorarios:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

/**
 * CU-043: Eliminar una franja propia
 * DELETE /api/profesor/horarios/:id
 */
export const deleteMiFranja = async (req, res) => {
  try {
    const profesor_id = req.user.id;
    const { id } = req.params;

    // Verificar que la franja es del profesor
    const { data: franja, error: errFr } = await supabase
      .from('franja_horaria')
      .select('id, profesor_id')
      .eq('id', id)
      .single();

    if (errFr || !franja) return res.status(404).json({ success: false, message: 'Franja no encontrada' });
    if (franja.profesor_id !== profesor_id) return res.status(403).json({ success: false, message: 'No puedes eliminar franjas de otro profesor' });

    // Validar que no esté en sesiones programadas
    const { data: sesionesConFranja } = await supabase
      .from('sesion_clase')
      .select('id')
      .contains('franja_horaria_ids', [id])
      .eq('estado', 'programada');

    if (sesionesConFranja?.length) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar esta franja porque tiene sesiones programadas' });
    }

    const { error } = await supabase
      .from('franja_horaria')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.json({ success: true, message: 'Franja eliminada exitosamente' });
  } catch (error) {
    console.error('Error en deleteMiFranja:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};
