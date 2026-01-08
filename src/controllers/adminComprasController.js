// src/controllers/adminComprasController.js
import { supabase } from '../config/supabase.js';

/**
 * CU-049: Ver Todas las Compras (Admin)
 * GET /api/admin/compras
 * Query params (opcionales):
 * - estado_pago: 'pendiente' | 'completado' | 'fallido'
 * - tipo_compra: 'curso' | 'clase_personalizada' | 'paquete_horas'
 * - fechaInicio: YYYY-MM-DD
 * - fechaFin: YYYY-MM-DD
 * - page: number (default 1)
 * - limit: number (default 10, max 50)
 */
export const getComprasAdmin = async (req, res) => {
  try {
    const {
      estado_pago,
      tipo_compra,
      fechaInicio,
      fechaFin,
      page = 1,
      limit = 10
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = supabase
      .from('compra')
      .select(`
        id,
        estudiante_id,
        tipo_compra,
        curso_id,
        clase_personalizada_id,
        monto_total,
        estado_pago,
        fecha_compra,
        moneda,
        proveedor_pago,
        mp_preference_id,
        mp_payment_id,
        mp_merchant_order_id,
        mp_status,
        mp_status_detail,
        estudiante:estudiante_id (
          id,
          nombre,
          apellido,
          email
        ),
        curso:curso_id (
          id,
          nombre,
          precio,
          profesor_id
        ),
        clase_personalizada:clase_personalizada_id (
          id,
          precio,
          duracion_horas,
          asignatura_id,
          asignatura:asignatura_id (
            id,
            nombre
          )
        )
      `, { count: 'exact' })
      .order('fecha_compra', { ascending: false });

    if (estado_pago) query = query.eq('estado_pago', estado_pago);
    if (tipo_compra) query = query.eq('tipo_compra', tipo_compra);

    if (fechaInicio && fechaFin) {
      const desde = `${fechaInicio}T00:00:00.000Z`;
      const hasta = `${fechaFin}T23:59:59.999Z`;
      query = query.gte('fecha_compra', desde).lte('fecha_compra', hasta);
    } else if (fechaInicio && !fechaFin) {
      const desde = `${fechaInicio}T00:00:00.000Z`;
      query = query.gte('fecha_compra', desde);
    } else if (!fechaInicio && fechaFin) {
      const hasta = `${fechaFin}T23:59:59.999Z`;
      query = query.lte('fecha_compra', hasta);
    }

    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error al consultar compras (admin):', error);
      return res.status(500).json({
        success: false,
        message: 'Error al consultar compras',
        error: error.message
      });
    }

    const total = Number(count || 0);
    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      success: true,
      data: {
        compras: data || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages
        },
        filters: {
          estado_pago: estado_pago || null,
          tipo_compra: tipo_compra || null,
          fechaInicio: fechaInicio || null,
          fechaFin: fechaFin || null
        }
      }
    });

  } catch (error) {
    console.error('❌ Error en getComprasAdmin:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al listar compras',
      error: error.message
    });
  }
};
