// src/controllers/adminMetricasController.js
import { supabase } from '../config/supabase.js';

/**
 * CU-046: Ver Métricas Generales (Admin)
 * GET /api/admin/metricas?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
 *
 * Si no se envían fechas, por defecto usa últimos 30 días.
 *
 * Métricas incluidas:
 * - Total usuarios por rol
 * - Total cursos y cursos activos
 * - Ingresos del rango (compras completadas)
 * - Serie diaria (ingresos por día) para gráficas
 */
export const getMetricasAdmin = async (req, res) => {
  try {
    let { fechaInicio, fechaFin } = req.query;

    // Default: últimos 30 días
    if (!fechaInicio || !fechaFin) {
      const hoy = new Date();
      const hace30 = new Date(hoy);
      hace30.setDate(hoy.getDate() - 30);

      const yyyyMmDd = (d) => d.toISOString().slice(0, 10);

      fechaInicio = fechaInicio || yyyyMmDd(hace30);
      fechaFin = fechaFin || yyyyMmDd(hoy);
    }

    const desde = `${fechaInicio}T00:00:00.000Z`;
    const hasta = `${fechaFin}T23:59:59.999Z`;

    // 1) Usuarios (contar por rol)
    const { data: usuarios, error: usuariosError } = await supabase
      .from('usuario')
      .select('id, rol');

    if (usuariosError) {
      console.error('Error al consultar usuario para métricas:', usuariosError);
      return res.status(500).json({
        success: false,
        message: 'Error al consultar usuarios para métricas',
        error: usuariosError.message
      });
    }

    const usuariosList = usuarios || [];
    const totalUsuarios = usuariosList.length;

    const usuariosPorRol = usuariosList.reduce((acc, u) => {
      acc[u.rol] = (acc[u.rol] || 0) + 1;
      return acc;
    }, {});

    // 2) Cursos (total y activos)
    const { data: cursos, error: cursosError } = await supabase
      .from('curso')
      .select('id, estado');

    if (cursosError) {
      console.error('Error al consultar curso para métricas:', cursosError);
      return res.status(500).json({
        success: false,
        message: 'Error al consultar cursos para métricas',
        error: cursosError.message
      });
    }

    const cursosList = cursos || [];
    const totalCursos = cursosList.length;
    const cursosActivos = cursosList.filter(c => c.estado === 'activo').length;

    // 3) Compras completadas en rango (ingresos)
    const { data: compras, error: comprasError } = await supabase
      .from('compra')
      .select('id, monto_total, fecha_compra')
      .eq('estado_pago', 'completado')
      .gte('fecha_compra', desde)
      .lte('fecha_compra', hasta)
      .order('fecha_compra', { ascending: true });

    if (comprasError) {
      console.error('Error al consultar compra para métricas:', comprasError);
      return res.status(500).json({
        success: false,
        message: 'Error al consultar compras para métricas',
        error: comprasError.message
      });
    }

    const comprasList = compras || [];
    const ingresosRango = comprasList.reduce((acc, c) => acc + Number(c.monto_total || 0), 0);

    // 4) Serie diaria para gráficas (agrupación en Node)
    // Formato: [{ fecha: 'YYYY-MM-DD', ingresos: number, compras: number }]
    const serieMap = new Map();

    for (const c of comprasList) {
      const fecha = new Date(c.fecha_compra).toISOString().slice(0, 10);
      const prev = serieMap.get(fecha) || { fecha, ingresos: 0, compras: 0 };
      prev.ingresos += Number(c.monto_total || 0);
      prev.compras += 1;
      serieMap.set(fecha, prev);
    }

    const serieIngresosPorDia = Array.from(serieMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));

    return res.status(200).json({
      success: true,
      data: {
        rango: { fechaInicio, fechaFin },
        usuarios: {
          total: totalUsuarios,
          por_rol: {
            administrador: usuariosPorRol.administrador || 0,
            profesor: usuariosPorRol.profesor || 0,
            estudiante: usuariosPorRol.estudiante || 0
          }
        },
        cursos: {
          total: totalCursos,
          activos: cursosActivos
        },
        ingresos: {
          total_rango: ingresosRango,
          serie_por_dia: serieIngresosPorDia
        }
      }
    });

  } catch (error) {
    console.error('❌ Error en getMetricasAdmin:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al calcular métricas',
      error: error.message
    });
  }
};
