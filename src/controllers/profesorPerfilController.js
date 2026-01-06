// src/controllers/profesorPerfilController.js
import { supabase } from '../config/supabase.js';

/**
 * CU-045: Editar perfil de profesor (solo campos básicos)
 * PUT /api/profesor/perfil
 * Body: { nombre?, apellido?, telefono? }
 */
export const updateMiPerfilProfesor = async (req, res) => {
  try {
    const profesor_id = req.user.id;
    const { nombre, apellido, telefono } = req.body;

    const updateData = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (apellido !== undefined) updateData.apellido = apellido;
    if (telefono !== undefined) updateData.telefono = telefono;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No hay campos para actualizar' });
    }

    updateData.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('usuario')
      .update(updateData)
      .eq('id', profesor_id)
      .select('id, email, nombre, apellido, telefono, rol, created_at, updated_at')
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: 'Perfil actualizado',
      data: { usuario: updated }
    });
  } catch (error) {
    console.error('Error en updateMiPerfilProfesor:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};
