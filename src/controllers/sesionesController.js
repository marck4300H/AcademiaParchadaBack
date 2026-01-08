// src/controllers/sesionesController.js
import { supabase } from '../config/supabase.js';
import { sendMeetLinkEmails } from '../services/emailService.js';

export const listarSesionesPendientesLink = async (req, res) => {
  try {
    const isProfesor = req.user?.rol === 'profesor';

    let query = supabase
      .from('sesion_clase')
      .select(`
        id,
        compra_id,
        profesor_id,
        fecha_hora,
        estado,
        link_meet,
        compra:compra_id (
          id,
          tipo_compra,
          estudiante:estudiante_id (
            id,
            nombre,
            apellido,
            email
          ),
          clase_personalizada:clase_personalizada_id (
            id,
            asignatura:asignatura_id (
              id,
              nombre
            )
          )
        ),
        profesor:profesor_id (
          id,
          nombre,
          apellido,
          email
        )
      `)
      .is('link_meet', null)
      .eq('estado', 'programada')
      .order('fecha_hora', { ascending: true });

    if (isProfesor) query = query.eq('profesor_id', req.user.id);

    const { data, error } = await query;

    if (error) {
      console.error('Error listarSesionesPendientesLink:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al listar sesiones pendientes',
        error: error.message
      });
    }

    return res.status(200).json({
      success: true,
      data: { sesiones: data || [] }
    });

  } catch (error) {
    console.error('❌ Error listarSesionesPendientesLink:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al listar sesiones pendientes',
      error: error.message
    });
  }
};

export const asignarLinkMeet = async (req, res) => {
  try {
    const { sesionId } = req.params;
    const { link_meet } = req.body;

    if (!link_meet || typeof link_meet !== 'string' || !link_meet.startsWith('http')) {
      return res.status(400).json({
        success: false,
        message: 'link_meet es obligatorio y debe ser una URL válida.'
      });
    }

    const { data: sesion, error: sesionError } = await supabase
      .from('sesion_clase')
      .select(`
        id,
        compra_id,
        profesor_id,
        fecha_hora,
        estado,
        link_meet,
        compra:compra_id (
          id,
          estudiante:estudiante_id (
            id,
            nombre,
            apellido,
            email
          )
        ),
        profesor:profesor_id (
          id,
          nombre,
          apellido,
          email
        )
      `)
      .eq('id', sesionId)
      .single();

    if (sesionError || !sesion) {
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    if (req.user.rol === 'profesor' && sesion.profesor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta sesión' });
    }

    if (sesion.estado !== 'programada') {
      return res.status(400).json({
        success: false,
        message: 'Solo se puede asignar link a sesiones en estado programada'
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from('sesion_clase')
      .update({ link_meet })
      .eq('id', sesionId)
      .select('id, compra_id, profesor_id, fecha_hora, estado, link_meet')
      .single();

    if (updateError) {
      console.error('Error asignarLinkMeet update:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Error al actualizar link_meet',
        error: updateError.message
      });
    }

    const estudianteEmail = sesion?.compra?.estudiante?.email || null;
    const profesorEmail = sesion?.profesor?.email || null;

    await sendMeetLinkEmails({
      sesion: updated,
      estudianteEmail,
      profesorEmail
    });

    return res.status(200).json({
      success: true,
      message: 'Link de Meet asignado exitosamente',
      data: { sesion: updated }
    });

  } catch (error) {
    console.error('❌ Error asignarLinkMeet:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al asignar link de Meet',
      error: error.message
    });
  }
};
