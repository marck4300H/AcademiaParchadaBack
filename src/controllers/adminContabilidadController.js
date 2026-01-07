// src/controllers/adminContabilidadController.js
import { supabase } from '../config/supabase.js';

/**
 * CU-047: Métricas de Contabilidad
 * GET /api/admin/contabilidad?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
 *
 * Basado en tu schema:
 * - compra.fecha_compra (timestamp)
 * - compra.estado_pago ('completado')
 * - compra.tipo_compra ('curso' | 'clase_personalizada' | 'paquete_horas')
 * - curso.tipo_pago_profesor ('porcentaje' | 'monto_fijo')
 * - clase_personalizada.tipo_pago_profesor ('porcentaje' | 'monto_fijo')
 * - ingreso_adicional.fecha_ingreso (timestamp)
 * - sesion_clase.compra_id (FK)
 */
export const getContabilidad = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({
        success: false,
        message: "fechaInicio y fechaFin son obligatorios (YYYY-MM-DD)."
      });
    }

    // Rango inclusivo por día
    const desde = `${fechaInicio}T00:00:00.000Z`;
    const hasta = `${fechaFin}T23:59:59.999Z`;

    // 1) Compras completadas en rango (con joins a curso / clase_personalizada)
    const { data: compras, error: comprasError } = await supabase
      .from('compra')
      .select(`
        id,
        tipo_compra,
        monto_total,
        estado_pago,
        fecha_compra,
        curso:curso_id (
          id,
          profesor_id,
          tipo_pago_profesor,
          valor_pago_profesor
        ),
        clase_personalizada:clase_personalizada_id (
          id,
          tipo_pago_profesor,
          valor_pago_profesor
        )
      `)
      .eq('estado_pago', 'completado')
      .gte('fecha_compra', desde)
      .lte('fecha_compra', hasta);

    if (comprasError) {
      console.error('Error al consultar compras:', comprasError);
      return res.status(500).json({
        success: false,
        message: 'Error al consultar compras para contabilidad',
        error: comprasError.message
      });
    }

    const comprasList = compras || [];

    // 2) Ingresos totales
    const ingresos_totales = comprasList.reduce((acc, c) => acc + Number(c.monto_total || 0), 0);

    // Helper pago profesor
    const calcularPagoProfesor = ({ monto_total, tipo_pago_profesor, valor_pago_profesor }) => {
      const monto = Number(monto_total || 0);
      const valor = Number(valor_pago_profesor || 0);

      if (!tipo_pago_profesor) return 0;

      if (tipo_pago_profesor === 'porcentaje') {
        return monto * (valor / 100);
      }

      // 'monto_fijo'
      return valor;
    };

    // 3) Para clases y paquetes: necesito saber profesor_id desde sesion_clase (por compra_id)
    // Hacemos 1 consulta para todas las compras de tipo clase_personalizada/paquete_horas
    const compraIdsClases = comprasList
      .filter(c => c.tipo_compra === 'clase_personalizada' || c.tipo_compra === 'paquete_horas')
      .map(c => c.id);

    let sesionesPorCompra = new Map(); // compra_id -> array sesiones
    if (compraIdsClases.length > 0) {
      const { data: sesiones, error: sesionesError } = await supabase
        .from('sesion_clase')
        .select('id, compra_id, profesor_id')
        .in('compra_id', compraIdsClases);

      if (sesionesError) {
        console.error('Error al consultar sesion_clase:', sesionesError);
        return res.status(500).json({
          success: false,
          message: 'Error al consultar sesiones para contabilidad',
          error: sesionesError.message
        });
      }

      for (const s of (sesiones || [])) {
        const arr = sesionesPorCompra.get(s.compra_id) || [];
        arr.push(s);
        sesionesPorCompra.set(s.compra_id, arr);
      }
    }

    // 4) Calcular pagos por profesor
    const pagosPorProfesorMap = new Map(); // profesor_id -> total

    for (const compra of comprasList) {
      // Caso curso
      if (compra.tipo_compra === 'curso' && compra.curso) {
        const profesorId = compra.curso.profesor_id;
        const pago = calcularPagoProfesor({
          monto_total: compra.monto_total,
          tipo_pago_profesor: compra.curso.tipo_pago_profesor,
          valor_pago_profesor: compra.curso.valor_pago_profesor
        });

        if (profesorId) {
          pagosPorProfesorMap.set(profesorId, (pagosPorProfesorMap.get(profesorId) || 0) + pago);
        }
      }

      // Caso clase_personalizada / paquete_horas
      if (
        (compra.tipo_compra === 'clase_personalizada' || compra.tipo_compra === 'paquete_horas') &&
        compra.clase_personalizada
      ) {
        const sesiones = sesionesPorCompra.get(compra.id) || [];

        // Regla MVP (y consistente con CU-047):
        // - El pago al profesor se registra 1 vez por compra (no por cada sesión del paquete),
        //   usando la configuración de clase_personalizada.
        // - Se asigna al/los profesor(es) asociado(s) a sesiones de esa compra.
        //
        // Si tu negocio es "pago por sesión" en paquetes, se ajusta luego (pero CU-047 no lo define así).
        const pago = calcularPagoProfesor({
          monto_total: compra.monto_total,
          tipo_pago_profesor: compra.clase_personalizada.tipo_pago_profesor,
          valor_pago_profesor: compra.clase_personalizada.valor_pago_profesor
        });

        // Si hay varias sesiones con distintos profesores (no debería normalmente),
        // repartimos el pago entre los profesores únicos para no duplicar.
        const profesoresUnicos = Array.from(new Set(sesiones.map(s => s.profesor_id).filter(Boolean)));

        if (profesoresUnicos.length === 0) continue;

        const pagoPorProfesor = pago / profesoresUnicos.length;

        for (const profesorId of profesoresUnicos) {
          pagosPorProfesorMap.set(profesorId, (pagosPorProfesorMap.get(profesorId) || 0) + pagoPorProfesor);
        }
      }
    }

    const pagos_profesores_total = Array.from(pagosPorProfesorMap.values()).reduce(
      (acc, v) => acc + Number(v || 0),
      0
    );

    // 5) Datos de profesores (usuario)
    const profesorIds = Array.from(pagosPorProfesorMap.keys());

    let profesoresInfoMap = new Map();
    if (profesorIds.length > 0) {
      const { data: usuarios, error: usuariosError } = await supabase
        .from('usuario')
        .select('id, nombre, apellido, email')
        .in('id', profesorIds);

      if (usuariosError) {
        console.error('Error al consultar usuarios (profesores):', usuariosError);
      } else {
        profesoresInfoMap = new Map((usuarios || []).map(u => [u.id, u]));
      }
    }

    const pagos_por_profesor = profesorIds
      .map((id) => {
        const info = profesoresInfoMap.get(id);
        return {
          profesor_id: id,
          nombre: info?.nombre || null,
          apellido: info?.apellido || null,
          email: info?.email || null,
          total_pago_profesor: Number(pagosPorProfesorMap.get(id) || 0)
        };
      })
      .sort((a, b) => b.total_pago_profesor - a.total_pago_profesor);

    // 6) Ingresos adicionales (tabla ingreso_adicional.fecha_ingreso)
    let ingresos_adicionales = 0;
    {
      const { data: adicionales, error: adicionalesError } = await supabase
        .from('ingreso_adicional')
        .select('monto, fecha_ingreso')
        .gte('fecha_ingreso', desde)
        .lte('fecha_ingreso', hasta);

      if (adicionalesError) {
        console.error('Error al consultar ingreso_adicional:', adicionalesError);
        return res.status(500).json({
          success: false,
          message: 'Error al consultar ingresos adicionales',
          error: adicionalesError.message
        });
      }

      ingresos_adicionales = (adicionales || []).reduce((acc, x) => acc + Number(x.monto || 0), 0);
    }

    // 7) Neto
    const neto = ingresos_totales - pagos_profesores_total + ingresos_adicionales;

    return res.status(200).json({
      success: true,
      data: {
        rango: { fechaInicio, fechaFin },
        ingresos_totales,
        pagos_profesores_total,
        ingresos_adicionales,
        neto,
        pagos_por_profesor
      }
    });

  } catch (error) {
    console.error('❌ Error en getContabilidad:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al calcular contabilidad',
      error: error.message
    });
  }
};
