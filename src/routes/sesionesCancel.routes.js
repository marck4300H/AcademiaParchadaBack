import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { cancelarSesionClase } from '../controllers/sesionClaseController.js';

const sesionesCancelRoutes = Router();

const requireOwnership = async (req, res, next) => {
  try {
    const user = req.user;
    const sesionId = req.params.id;

    const { data: sesion, error } = await supabase
      .from('sesion_clase')
      .select('id, compra_id, estado, compra:compra_id(estudiante_id)')
      .eq('id', sesionId)
      .single();

    if (error || !sesion?.id) {
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    const ownerId = sesion?.compra?.estudiante_id || null;

    if (!ownerId) {
      return res.status(400).json({ success: false, message: 'La sesión no tiene compra asociada' });
    }

    if (ownerId !== user.id) {
      return res.status(403).json({ success: false, message: 'No autorizado para cancelar (sesión no es tuya)' });
    }

    req.sesion = sesion;
    return next();
  } catch (e) {
    console.error('requireOwnership error:', e?.message || e);
    return res.status(500).json({ success: false, message: 'Error validando propiedad de la sesión' });
  }
};

sesionesCancelRoutes.post('/:id/cancelar', authenticate, authorize('estudiante'), requireOwnership, cancelarSesionClase);

export default sesionesCancelRoutes;
