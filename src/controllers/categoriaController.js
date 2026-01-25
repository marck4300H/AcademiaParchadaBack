// src/controllers/categoriaController.js
import { supabase } from '../config/supabase.js';

/**
 * GET /api/categorias
 * Público (o puedes protegerlo si quieres)
 */
export const listCategorias = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categoria')
      .select('id, nombre, descripcion, created_at, updated_at')
      .order('nombre', { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      data: { categorias: data || [] }
    });
  } catch (error) {
    console.error('listCategorias:', error);
    return res.status(500).json({
      success: false,
      message: 'Error listando categorías',
      error: error.message
    });
  }
};
