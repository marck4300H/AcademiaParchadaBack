// src/controllers/adminIngresosAdicionalesController.js
import { supabase } from '../config/supabase.js';

/**
 * CU-048: Registrar Ingreso Adicional
 * POST /api/admin/ingresos-adicionales
 * Body:
 * - descripcion: string (requerido)
 * - monto: number (requerido, >=0)
 * - fecha_ingreso: ISO string (requerido)
 */
export const createIngresoAdicional = async (req, res) => {
  try {
    const { descripcion, monto, fecha_ingreso } = req.body;

    if (!descripcion || typeof descripcion !== 'string' || descripcion.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'descripcion es obligatoria.'
      });
    }

    const montoNum = Number(monto);
    if (Number.isNaN(montoNum) || montoNum < 0) {
      return res.status(400).json({
        success: false,
        message: 'monto debe ser un número válido (>= 0).'
      });
    }

    if (!fecha_ingreso) {
      return res.status(400).json({
        success: false,
        message: 'fecha_ingreso es obligatoria (ISO string).'
      });
    }

    const fecha = new Date(fecha_ingreso);
    if (Number.isNaN(fecha.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'fecha_ingreso inválida. Enviar en formato ISO (ej: 2026-01-07T15:00:00.000Z).'
      });
    }

    const { data, error } = await supabase
      .from('ingreso_adicional')
      .insert([
        {
          descripcion: descripcion.trim(),
          monto: montoNum,
          fecha_ingreso: fecha.toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error al crear ingreso_adicional:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al crear ingreso adicional',
        error: error.message
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Ingreso adicional creado exitosamente',
      data
    });

  } catch (error) {
    console.error('❌ Error en createIngresoAdicional:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al crear ingreso adicional',
      error: error.message
    });
  }
};
