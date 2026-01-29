import { supabase } from '../config/supabase.js';
import {
  getAdminEmail,
  sendSesionCanceladaAdminEmail,
  sendSesionCanceladaProfesorEmail,
  sendSesionCanceladaEstudianteEmail,
} from '../services/emailService.js';

export const cancelarSesionClase = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body || {};

    // 1) Cargar sesión
    const { data: sesion, error: errSesion } = await supabase
      .from('sesion_clase')
      .select('id, compra_id, profesor_id, fecha_hora, estado')
      .eq('id', id)
      .single();

    if (errSesion || !sesion?.id) {
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    if (sesion.estado !== 'programada') {
      return res
        .status(400)
        .json({ success: false, message: `No se puede cancelar una sesión en estado: ${sesion.estado}` });
    }

    // 2) Cargar compra (se usa para validar ownership + monto para email)
    const { data: compra, error: errCompra } = await supabase
      .from('compra')
      .select('id, estudiante_id, monto_total, tipo_compra')
      .eq('id', sesion.compra_id)
      .single();

    if (errCompra || !compra?.id) {
      return res.status(500).json({ success: false, message: 'No se pudo cargar la compra de la sesión' });
    }

    // 3) Permisos: admin, profesor asignado, o estudiante dueño de la compra
    const user = req.user;

    const isAdmin = user?.rol === 'administrador';
    const isProfesorOwner = user?.rol === 'profesor' && user?.id === sesion.profesor_id;
    const isEstudianteOwner = user?.rol === 'estudiante' && user?.id === compra.estudiante_id;

    if (!isAdmin && !isProfesorOwner && !isEstudianteOwner) {
      return res.status(403).json({ success: false, message: 'No autorizado para cancelar esta sesión' });
    }

    // 4) Cargar usuario estudiante/profesor (para notificaciones)
    const { data: estudiante } = await supabase
      .from('usuario')
      .select('id, nombre, apellido, email, timezone')
      .eq('id', compra.estudiante_id)
      .single();

    const { data: profesor } = await supabase
      .from('usuario')
      .select('id, nombre, apellido, email, timezone')
      .eq('id', sesion.profesor_id)
      .single();

    // 5) Cancelar (DB) + guardar motivo
    const { error: upErr } = await supabase
      .from('sesion_clase')
      .update({
        estado: 'cancelada',
        cancelacion_motivo: motivo ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sesion.id);

    if (upErr) {
      return res.status(500).json({
        success: false,
        message: 'No se pudo cancelar la sesión',
        error: upErr.message,
      });
    }

    // 6) Correos (best-effort)
    const adminEmail = await getAdminEmail();

    try {
      if (adminEmail) {
        await sendSesionCanceladaAdminEmail({
          adminEmail,
          sesionId: sesion.id,
          compraId: compra.id,
          motivo,
          profesor,
          estudiante,
          fechaHoraIso: sesion.fecha_hora,
        });
      }
    } catch (e) {
      console.error('Fallo email admin cancelación:', e?.message || e);
    }

    try {
      if (profesor?.email) {
        await sendSesionCanceladaProfesorEmail({
          profesorEmail: profesor.email,
          sesionId: sesion.id,
          fechaHoraIso: sesion.fecha_hora,
          profesorTimeZone: profesor.timezone,
          motivo,
        });
      }
    } catch (e) {
      console.error('Fallo email profesor cancelación:', e?.message || e);
    }

    try {
      if (estudiante?.email) {
        await sendSesionCanceladaEstudianteEmail({
          estudianteEmail: estudiante.email,
          sesionId: sesion.id,
          fechaHoraIso: sesion.fecha_hora,
          estudianteTimeZone: estudiante.timezone,
          montoTotal: compra.monto_total,
        });
      }
    } catch (e) {
      console.error('Fallo email estudiante cancelación:', e?.message || e);
    }

    return res.json({
      success: true,
      message: 'Sesión cancelada exitosamente',
      data: {
        sesionId: sesion.id,
        estado: 'cancelada',
        politica_reembolso: {
          porcentaje: 80,
          monto_estimado: Number(compra.monto_total || 0) * 0.8,
        },
      },
    });
  } catch (error) {
    console.error('Error en cancelarSesionClase:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
    });
  }
};
