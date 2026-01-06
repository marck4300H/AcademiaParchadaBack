// src/controllers/profesorAsignaturasController.js
import { supabase } from '../config/supabase.js';

/**
 * CU-044: Ver mis asignaturas
 * GET /api/profesor/asignaturas
 */
export const getMisAsignaturas = async (req, res) => {
  try {
    const profesor_id = req.user.id;

    const { data, error } = await supabase
      .from('profesor_asignatura')
      .select(`
        id,
        asignatura:asignatura_id (
          id,
          nombre,
          descripcion
        )
      `)
      .eq('profesor_id', profesor_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({
      success: true,
      data: {
        asignaturas: (data || []).map(x => x.asignatura).filter(Boolean),
        total: (data || []).length
      }
    });
  } catch (error) {
    console.error('Error en getMisAsignaturas:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

/**
 * CU-044: Agregar asignatura a mi perfil
 * POST /api/profesor/asignaturas/:asignaturaId
 */
export const addAsignatura = async (req, res) => {
  try {
    const profesor_id = req.user.id;
    const { asignaturaId } = req.params;

    // Validar existe asignatura
    const { data: asig, error: errAsig } = await supabase
      .from('asignatura')
      .select('id')
      .eq('id', asignaturaId)
      .single();

    if (errAsig || !asig) return res.status(404).json({ success: false, message: 'Asignatura no encontrada' });

    // Evitar duplicado
    const { data: exist } = await supabase
      .from('profesor_asignatura')
      .select('id')
      .eq('profesor_id', profesor_id)
      .eq('asignatura_id', asignaturaId)
      .maybeSingle();

    if (exist?.id) {
      return res.status(400).json({ success: false, message: 'Ya tienes esta asignatura asignada' });
    }

    const { data, error } = await supabase
      .from('profesor_asignatura')
      .insert([{ profesor_id, asignatura_id: asignaturaId }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, message: 'Asignatura agregada', data });
  } catch (error) {
    console.error('Error en addAsignatura:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

/**
 * CU-044: Quitar asignatura
 * DELETE /api/profesor/asignaturas/:asignaturaId
 */
export const removeAsignatura = async (req, res) => {
  try {
    const profesor_id = req.user.id;
    const { asignaturaId } = req.params;

    const { error } = await supabase
      .from('profesor_asignatura')
      .delete()
      .eq('profesor_id', profesor_id)
      .eq('asignatura_id', asignaturaId);

    if (error) throw error;

    return res.json({ success: true, message: 'Asignatura removida' });
  } catch (error) {
    console.error('Error en removeAsignatura:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};
