// src/controllers/estudiantePerfilController.js
import { supabase } from '../config/supabase.js';

export const getMiPerfilEstudiante = async (req, res) => {
  try {
    const estudianteId = req.user.id;

    const { data: usuario, error } = await supabase
      .from('usuario')
      .select('id, email, nombre, apellido, telefono, rol, timezone, activo, created_at, updated_at')
      .eq('id', estudianteId)
      .eq('rol', 'estudiante')
      .single();

    if (error || !usuario) {
      return res.status(404).json({ success: false, message: 'Estudiante no encontrado' });
    }

    // Si está inactivo, lo tratamos como no disponible para el front
    if (usuario.activo === false) {
      return res.status(403).json({
        success: false,
        message: 'Tu cuenta está inactiva. Contacta soporte si necesitas reactivarla.'
      });
    }

    return res.json({ success: true, data: { usuario } });
  } catch (error) {
    console.error('Error en getMiPerfilEstudiante:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

export const updateMiPerfilEstudiante = async (req, res) => {
  try {
    const estudianteId = req.user.id;
    const { nombre, apellido, telefono, timezone } = req.body;

    // 0) Verificar que el usuario esté activo
    const { data: current, error: currentErr } = await supabase
      .from('usuario')
      .select('id, rol, activo')
      .eq('id', estudianteId)
      .single();

    if (currentErr || !current) {
      return res.status(404).json({ success: false, message: 'Estudiante no encontrado' });
    }
    if (current.rol !== 'estudiante') {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }
    if (current.activo === false) {
      return res.status(403).json({
        success: false,
        message: 'Tu cuenta está inactiva. No puedes editar el perfil.'
      });
    }

    // Whitelist de campos editables
    const updateData = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (apellido !== undefined) updateData.apellido = apellido;
    if (telefono !== undefined) updateData.telefono = telefono;
    if (timezone !== undefined) updateData.timezone = timezone;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No se enviaron campos para actualizar' });
    }

    const { data: updated, error } = await supabase
      .from('usuario')
      .update(updateData)
      .eq('id', estudianteId)
      .eq('rol', 'estudiante')
      .select('id, email, nombre, apellido, telefono, rol, timezone, activo, created_at, updated_at')
      .single();

    if (error || !updated) {
      return res.status(500).json({ success: false, message: 'Error al actualizar perfil', error: error?.message });
    }

    return res.json({ success: true, message: 'Perfil actualizado', data: { usuario: updated } });
  } catch (error) {
    console.error('Error en updateMiPerfilEstudiante:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

/**
 * “Eliminar cuenta” preservando historial de compras:
 * - Borra sesiones del estudiante (sesion_clase via compra_id)
 * - Borra material_estudio ligado a esas sesiones
 * - Borra inscripciones (inscripcion_curso)
 * - Borra relación curso_sesion_estudiante
 * - NO borra compras
 * - NO borra usuario (porque compras lo referencian con FK NOT NULL)
 * - Marca usuario.activo=false y anonimiza campos sensibles
 */
export const deleteMiCuentaEstudiantePreservandoCompras = async (req, res) => {
  try {
    const estudianteId = req.user.id;

    // 0) Validar que exista y sea estudiante
    const { data: user, error: userErr } = await supabase
      .from('usuario')
      .select('id, rol, email, activo')
      .eq('id', estudianteId)
      .single();

    if (userErr || !user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    if (user.rol !== 'estudiante') {
      return res.status(403).json({ success: false, message: 'Solo un estudiante puede eliminar su cuenta aquí' });
    }

    // Si ya estaba inactivo, devolvemos ok idempotente
    if (user.activo === false) {
      return res.json({
        success: true,
        message: 'La cuenta ya estaba inactiva.'
      });
    }

    // 1) Obtener compras del estudiante (para borrar sesiones_clase que dependen de compra)
    const { data: compras, error: comprasErr } = await supabase
      .from('compra')
      .select('id')
      .eq('estudiante_id', estudianteId);

    if (comprasErr) throw comprasErr;

    const compraIds = (compras || []).map(c => c.id);

    // 2) Obtener ids de sesiones (para borrar material_estudio antes)
    let sesionIds = [];
    if (compraIds.length > 0) {
      const { data: sesiones, error: sesErr } = await supabase
        .from('sesion_clase')
        .select('id')
        .in('compra_id', compraIds);

      if (sesErr) throw sesErr;
      sesionIds = (sesiones || []).map(s => s.id);
    }

    // 3) Borrar material_estudio asociado a esas sesiones
    if (sesionIds.length > 0) {
      const { error: delMatErr } = await supabase
        .from('material_estudio')
        .delete()
        .in('sesion_clase_id', sesionIds);

      if (delMatErr) throw delMatErr;
    }

    // 4) Borrar sesiones_clase del estudiante (via compra_id)
    if (compraIds.length > 0) {
      const { error: delSesionesErr } = await supabase
        .from('sesion_clase')
        .delete()
        .in('compra_id', compraIds);

      if (delSesionesErr) throw delSesionesErr;
    }

    // 5) Borrar inscripciones a cursos
    const { error: delInscripcionesErr } = await supabase
      .from('inscripcion_curso')
      .delete()
      .eq('estudiante_id', estudianteId);

    if (delInscripcionesErr) throw delInscripcionesErr;

    // 6) Borrar relación estudiante<->curso_sesion
    const { error: delCursoSesionEstErr } = await supabase
      .from('curso_sesion_estudiante')
      .delete()
      .eq('estudiante_id', estudianteId);

    if (delCursoSesionEstErr) throw delCursoSesionEstErr;

    // 7) Marcar usuario como inactivo + anonimizar
    // email debe seguir siendo UNIQUE, así que se cambia a uno “tombstone”.
    const tombstoneEmail = `deleted+${estudianteId}@parcheacademico.local`;

    const { error: anonErr } = await supabase
      .from('usuario')
      .update({
        activo: false,
        email: tombstoneEmail,
        password_hash: null,
        nombre: 'Cuenta',
        apellido: 'Eliminada',
        telefono: null
      })
      .eq('id', estudianteId);

    if (anonErr) throw anonErr;

    return res.json({
      success: true,
      message: 'Cuenta desactivada: se borraron sesiones e inscripciones y se preservó el historial de compras.'
    });
  } catch (error) {
    console.error('Error en deleteMiCuentaEstudiantePreservandoCompras:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};
