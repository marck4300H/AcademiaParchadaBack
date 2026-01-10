// src/controllers/pagosMercadoPagoController.js

import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

import { supabase } from '../config/supabase.js';
import { mpPreference, mpPayment } from '../config/mercadopago.js';

import { asignarProfesorOptimo } from '../utils/asignarProfesor.js';

import {
  getAdminEmail,

  sendCompraCursoAdminEmail,
  sendCompraCursoProfesorEmail,
  sendCompraCursoEstudianteEmail,

  sendCompraClasePersonalizadaAdminEmail,
  sendCompraClasePersonalizadaProfesorEmail,
  sendCompraClasePersonalizadaEstudianteEmail,

  sendCompraPaqueteHorasAdminEmail,
  sendCompraPaqueteHorasEstudianteEmail
} from '../services/emailService.js';

dotenv.config();

const DEFAULT_TZ = 'America/Bogota';

const extractMercadoPagoId = (req) => {
  const raw =
    req.query?.id ||
    req.query?.['data.id'] ||
    req.body?.data?.id ||
    req.body?.id ||
    req.body?.resource ||
    req.body?.body?.resource ||
    req.body?.body?.id;

  if (!raw) return null;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('http')) {
      return trimmed.split('/').filter(Boolean).pop() || null;
    }
    return trimmed;
  }

  if (typeof raw === 'number') return String(raw);

  if (typeof raw === 'object') {
    const candidate = raw.id || raw.data?.id || raw.resource;
    if (!candidate) return null;
    if (typeof candidate === 'string' && candidate.startsWith('http')) {
      return candidate.split('/').filter(Boolean).pop() || null;
    }
    return String(candidate);
  }

  return null;
};

const isNumericId = (value) => /^\d+$/.test(String(value || '').trim());
const noop = Promise.resolve(null);

const notificarCompraClasePersonalizada = async ({ compra, sesionCreada, profesorId }) => {
  const metaEmail = compra?.mp_raw?.metadata || {};

  const { data: estudiante } = await supabase
    .from('usuario')
    .select('id,nombre,apellido,email,telefono,timezone')
    .eq('id', compra.estudiante_id)
    .single();

  const { data: profesor } = await supabase
    .from('usuario')
    .select('id,nombre,apellido,email,timezone')
    .eq('id', profesorId)
    .single();

  const adminEmail = await getAdminEmail();

  const tasks = [
    adminEmail
      ? sendCompraClasePersonalizadaAdminEmail({
          adminEmail,
          compraId: compra.id,
          montoTotal: compra.monto_total,
          profesor,
          estudiante
        })
      : noop,

    profesor?.email
      ? sendCompraClasePersonalizadaProfesorEmail({
          profesorEmail: profesor.email,
          compraId: compra.id,
          asignaturaNombre: metaEmail?.asignatura_nombre || 'Clase personalizada',
          fechaHoraIso: metaEmail?.fecha_hora || sesionCreada?.fecha_hora,
          duracionHoras: metaEmail?.duracion_horas || null,
          profesorTimeZone: metaEmail?.profesor_timezone || profesor?.timezone || DEFAULT_TZ,
          estudiante
        })
      : noop,

    estudiante?.email
      ? sendCompraClasePersonalizadaEstudianteEmail({
          estudianteEmail: estudiante.email,
          compraId: compra.id,
          profesor
        })
      : noop
  ];

  const results = await Promise.allSettled(tasks);
  results.forEach((r) => {
    if (r.status === 'rejected') console.error('❌ Error enviando correo (clase_personalizada):', r.reason);
  });

  if (!adminEmail) {
    console.error('⚠️ Admin email no resuelto (ADMIN_EMAIL/ADMINEMAIL/BD). No se envió correo a admin.', {
      compraId: compra?.id
    });
  }
};

const notificarCompraCurso = async ({ compra, estudiante, curso, profesor }) => {
  const adminEmail = await getAdminEmail();

  const tasks = [
    adminEmail
      ? sendCompraCursoAdminEmail({
          adminEmail,
          compraId: compra.id,
          montoTotal: compra.monto_total,
          cursoNombre: curso?.nombre,
          profesor,
          estudiante
        })
      : noop,

    profesor?.email
      ? sendCompraCursoProfesorEmail({
          profesorEmail: profesor.email,
          cursoNombre: curso?.nombre,
          compraId: compra.id,
          estudiante
        })
      : noop,

    estudiante?.email
      ? sendCompraCursoEstudianteEmail({
          estudianteEmail: estudiante.email,
          compraId: compra.id,
          profesor,
          cursoNombre: curso?.nombre
        })
      : noop
  ];

  const results = await Promise.allSettled(tasks);
  results.forEach((r) => {
    if (r.status === 'rejected') console.error('❌ Error enviando correo (curso):', r.reason);
  });

  if (!adminEmail) {
    console.error('⚠️ Admin email no resuelto (ADMIN_EMAIL/ADMINEMAIL/BD). No se envió correo a admin.', {
      compraId: compra?.id
    });
  }
};

const notificarCompraPaqueteHoras = async ({ compra, estudiante, horasCompradas }) => {
  const adminEmail = await getAdminEmail();

  const tasks = [
    adminEmail
      ? sendCompraPaqueteHorasAdminEmail({
          adminEmail,
          compraId: compra.id,
          montoTotal: compra.monto_total,
          horasCompradas,
          estudiante
        })
      : noop,

    estudiante?.email
      ? sendCompraPaqueteHorasEstudianteEmail({
          estudianteEmail: estudiante.email,
          compraId: compra.id,
          horasCompradas
        })
      : noop
  ];

  const results = await Promise.allSettled(tasks);
  results.forEach((r) => {
    if (r.status === 'rejected') console.error('❌ Error enviando correo (paquete_horas):', r.reason);
  });

  if (!adminEmail) {
    console.error('⚠️ Admin email no resuelto (ADMIN_EMAIL/ADMINEMAIL/BD). No se envió correo a admin.', {
      compraId: compra?.id
    });
  }
};

export const crearCheckoutMercadoPago = async (req, res) => {
  try {
    const {
      tipo_compra,
      curso_id,
      clase_personalizada_id,
      cantidad_horas,
      estudiante,
      fecha_hora,
      estudiante_timezone,
      descripcion_estudiante,
      documento_url
    } = req.body;

    if (!tipo_compra) {
      return res.status(400).json({ success: false, message: 'tipo_compra es requerido' });
    }

    // 1) Resolver estudiante_id
    let estudiante_id = req.user?.id || null;
    let estudianteTZFromDB = null;

    if (estudiante_id) {
      const { data: estDB } = await supabase.from('usuario').select('timezone').eq('id', estudiante_id).single();
      estudianteTZFromDB = estDB?.timezone || DEFAULT_TZ;
    }

    if (!estudiante_id) {
      if (!estudiante?.email || !estudiante?.password || !estudiante?.nombre || !estudiante?.apellido) {
        return res.status(400).json({
          success: false,
          message: 'Si no hay token, debes enviar estudiante {email, password, nombre, apellido}.'
        });
      }

      const { email, password, nombre, apellido, telefono, timezone } = estudiante;

      const { data: existente } = await supabase.from('usuario').select('id').eq('email', email).single();
      if (existente?.id) {
        return res.status(400).json({
          success: false,
          message: 'El email ya está registrado. Inicia sesión para pagar.'
        });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const { data: nuevoEst, error: errNuevo } = await supabase
        .from('usuario')
        .insert([
          {
            email,
            nombre,
            apellido,
            telefono,
            // ✅ timezone en tu BD es NOT NULL
            timezone: timezone || DEFAULT_TZ,
            password_hash: passwordHash,
            rol: 'estudiante'
          }
        ])
        .select()
        .single();

      if (errNuevo) throw errNuevo;

      estudiante_id = nuevoEst.id;
      estudianteTZFromDB = nuevoEst?.timezone || DEFAULT_TZ;
    }

    const estudianteTimeZone = estudiante_timezone || estudianteTZFromDB || DEFAULT_TZ;

    // 2) Calcular monto_total y metadata
    let titulo = '';
    let monto_total = 0;
    let metadata = { tipo_compra };

    if (tipo_compra === 'curso') {
      if (!curso_id) return res.status(400).json({ success: false, message: 'curso_id es requerido' });

      const { data: curso, error } = await supabase
        .from('curso')
        .select('id,nombre,precio,profesor_id')
        .eq('id', curso_id)
        .single();

      if (error || !curso) return res.status(404).json({ success: false, message: 'Curso no encontrado' });

      titulo = `Curso: ${curso.nombre}`;
      monto_total = Number(curso.precio);
      metadata = { ...metadata, curso_id: curso.id };
    } else if (tipo_compra === 'clase_personalizada') {
      if (!clase_personalizada_id) {
        return res.status(400).json({ success: false, message: 'clase_personalizada_id es requerido' });
      }
      if (!fecha_hora) {
        return res.status(400).json({ success: false, message: 'fecha_hora es requerida para clase_personalizada' });
      }

      const { data: clase, error } = await supabase
        .from('clase_personalizada')
        .select(
          `
          id,
          precio,
          duracion_horas,
          asignatura_id,
          asignatura:asignatura_id (id,nombre)
        `
        )
        .eq('id', clase_personalizada_id)
        .single();

      if (error || !clase) return res.status(404).json({ success: false, message: 'Clase personalizada no encontrada' });

      // ✅ NO se toca tu validación/asignación de franjas
      const asignacion = await asignarProfesorOptimo(
        clase.asignatura_id,
        String(fecha_hora),
        clase.duracion_horas,
        estudianteTimeZone
      );

      if (!asignacion) {
        return res.status(400).json({
          success: false,
          message: 'No hay disponibilidad de profesores para esa fecha y hora. Por favor elige otro horario.'
        });
      }

      titulo = 'Clase personalizada';
      monto_total = Number(clase.precio);

      metadata = {
        ...metadata,
        clase_personalizada_id: clase.id,
        fecha_hora: String(fecha_hora),
        estudiante_timezone: estudianteTimeZone,
        descripcion_estudiante: descripcion_estudiante || null,
        documento_url: documento_url || null,
        profesor_id: asignacion.profesor?.id || null,
        franja_horaria_ids: asignacion.franjasUtilizadas || [],
        profesor_timezone: asignacion.profesorTimeZone || null,
        duracion_horas: clase.duracion_horas,
        asignatura_id: clase.asignatura_id,
        asignatura_nombre: clase?.asignatura?.nombre || null
      };
    } else if (tipo_compra === 'paquete_horas') {
      if (!clase_personalizada_id) {
        return res.status(400).json({ success: false, message: 'clase_personalizada_id es requerido' });
      }
      if (!cantidad_horas || Number(cantidad_horas) <= 0) {
        return res.status(400).json({ success: false, message: 'cantidad_horas debe ser > 0' });
      }

      const { data: clase, error } = await supabase
        .from('clase_personalizada')
        .select('id,precio')
        .eq('id', clase_personalizada_id)
        .single();

      if (error || !clase) return res.status(404).json({ success: false, message: 'Clase personalizada no encontrada' });

      const horas = Number(cantidad_horas);
      titulo = `Paquete de horas (${horas}h)`;
      monto_total = Number(clase.precio) * horas;

      metadata = { ...metadata, clase_personalizada_id: clase.id, cantidad_horas: horas };
    } else {
      return res.status(400).json({ success: false, message: 'tipo_compra inválido' });
    }

    // 3) Crear compra pendiente
    const compraInsert = {
      estudiante_id,
      tipo_compra,
      curso_id: tipo_compra === 'curso' ? curso_id : null,
      clase_personalizada_id: tipo_compra !== 'curso' ? clase_personalizada_id : null,
      monto_total,
      estado_pago: 'pendiente',
      fecha_compra: new Date().toISOString(),
      proveedor_pago: 'mercadopago',
      moneda: 'COP'
    };

    if (tipo_compra === 'paquete_horas') {
      compraInsert.horas_totales = Number(cantidad_horas);
      compraInsert.horas_usadas = 0;
      compraInsert.horas_disponibles = Number(cantidad_horas);
    }

    const { data: compra, error: errCompra } = await supabase.from('compra').insert([compraInsert]).select().single();
    if (errCompra) throw errCompra;

    // 4) Preferencia MP
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
    const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;
    const notification_url = `${BACKEND_PUBLIC_URL}/api/pagos/mercadopago/webhook`;

    const preferenceBody = {
      items: [{ title: titulo, quantity: 1, currency_id: 'COP', unit_price: Number(monto_total) }],
      external_reference: compra.id,
      metadata: { ...metadata, compra_id: compra.id },
      back_urls: {
        success: `${FRONTEND_URL}/pago/exitoso?compra_id=${compra.id}`,
        pending: `${FRONTEND_URL}/pago/pendiente?compra_id=${compra.id}`,
        failure: `${FRONTEND_URL}/pago/fallido?compra_id=${compra.id}`
      },
      notification_url
    };

    const mpResp = await mpPreference.create({ body: preferenceBody });
    const preference_id = mpResp?.id || null;

    const { error: errUpd } = await supabase
      .from('compra')
      .update({ mp_preference_id: preference_id, mp_raw: mpResp })
      .eq('id', compra.id);

    if (errUpd) throw errUpd;

    return res.status(201).json({
      success: true,
      message: 'Preferencia de MercadoPago creada',
      data: {
        compra_id: compra.id,
        preference_id,
        init_point: mpResp?.init_point,
        sandbox_init_point: mpResp?.sandbox_init_point
      }
    });
  } catch (error) {
    console.error('❌ Error creando checkout MercadoPago:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creando checkout de MercadoPago',
      error: error.message
    });
  }
};

export const webhookMercadoPago = async (req, res) => {
  try {
    const topic = req.query.topic || req.body?.type || req.body?.topic || req.body?.body?.topic;
    const id = extractMercadoPagoId(req);

    if (!topic || !id) return res.status(200).send('OK');

    const eventId = `${topic}:${id}`;

    const { data: yaProcesado } = await supabase
      .from('webhook_evento_pago')
      .select('id')
      .eq('proveedor_pago', 'mercadopago')
      .eq('event_id', eventId)
      .maybeSingle();

    if (yaProcesado?.id) return res.status(200).send('OK');

    await supabase.from('webhook_evento_pago').insert([
      {
        proveedor_pago: 'mercadopago',
        event_id: eventId,
        tipo_evento: topic,
        payload: { query: req.query, body: req.body, headers: req.headers }
      }
    ]);

    // ✅ Soluciona el “log/error” del 2do webhook: merchant_order se ignora
    if (topic === 'merchant_order') return res.status(200).send('OK');

    // ✅ Evita duplicar correos por payment.updated
    if (topic === 'payment.updated') return res.status(200).send('OK');

    if (topic !== 'payment') return res.status(200).send('OK');

    const paymentId = String(id || '').trim();
    if (!isNumericId(paymentId)) {
      console.error('❌ Webhook MP: payment id inválido:', { topic, rawId: id, paymentId });
      return res.status(200).send('OK');
    }

    const payment = await mpPayment.get({ id: paymentId });

    const external_reference = payment?.external_reference; // compra.id
    const status = payment?.status;
    const status_detail = payment?.status_detail;
    const merchant_order_id = payment?.order?.id ? String(payment.order.id) : null;

    if (!external_reference) return res.status(200).send('OK');

    const nuevoEstado =
      status === 'approved'
        ? 'completado'
        : status === 'rejected' || status === 'cancelled'
          ? 'fallido'
          : 'pendiente';

    await supabase
      .from('compra')
      .update({
        estado_pago: nuevoEstado,
        mp_payment_id: paymentId,
        mp_merchant_order_id: merchant_order_id,
        mp_status: status,
        mp_status_detail: status_detail,
        mp_raw: payment
      })
      .eq('id', external_reference);

    if (nuevoEstado !== 'completado') return res.status(200).send('OK');

    const { data: compra, error: errCompra } = await supabase
      .from('compra')
      .select('id,tipo_compra,estudiante_id,curso_id,clase_personalizada_id,monto_total,mp_raw,moneda,horas_totales')
      .eq('id', external_reference)
      .single();

    if (errCompra || !compra?.id) return res.status(200).send('OK');

    const { data: estudiante } = await supabase
      .from('usuario')
      .select('id,nombre,apellido,email,telefono,timezone')
      .eq('id', compra.estudiante_id)
      .single();

    // ✅ CURSO: admin + profesor + estudiante
    if (compra.tipo_compra === 'curso' && compra.curso_id) {
      const { data: curso } = await supabase.from('curso').select('id,nombre,profesor_id').eq('id', compra.curso_id).single();

      const { data: profesor } = curso?.profesor_id
        ? await supabase.from('usuario').select('id,nombre,apellido,email').eq('id', curso.profesor_id).single()
        : { data: null };

      // (recomendado) inscribir si no existe, sin romper si ya existe
      try {
        const { data: inscExist } = await supabase
          .from('inscripcion_curso')
          .select('id')
          .eq('estudiante_id', compra.estudiante_id)
          .eq('curso_id', compra.curso_id)
          .maybeSingle();

        if (!inscExist?.id) {
          await supabase.from('inscripcion_curso').insert([
            { estudiante_id: compra.estudiante_id, curso_id: compra.curso_id, fecha_inscripcion: new Date().toISOString() }
          ]);
        }
      } catch (e) {
        console.error('⚠️ No se pudo crear/verificar inscripción (se continúa):', e?.message || e);
      }

      await notificarCompraCurso({ compra, estudiante, curso, profesor });
      return res.status(200).send('OK');
    }

    // ✅ CLASE PERSONALIZADA: admin + profesor + estudiante
    if (compra.tipo_compra === 'clase_personalizada' && compra.clase_personalizada_id) {
      const { data: sesionExist } = await supabase
        .from('sesion_clase')
        .select('id,profesor_id,fecha_hora')
        .eq('compra_id', compra.id)
        .maybeSingle();

      if (sesionExist?.id) {
        await notificarCompraClasePersonalizada({ compra, sesionCreada: sesionExist, profesorId: sesionExist.profesor_id });
        return res.status(200).send('OK');
      }

      const meta = compra?.mp_raw?.metadata || {};
      const fechaHora = meta?.fecha_hora || null;
      const profesorId = meta?.profesor_id || null;
      const franjaIds = meta?.franja_horaria_ids || [];
      const descripcionEst = meta?.descripcion_estudiante || null;
      const documentoUrl = meta?.documento_url || null;

      if (!fechaHora || !profesorId || !Array.isArray(franjaIds) || franjaIds.length === 0) {
        console.error('❌ metadata incompleta para crear sesion_clase', { compraId: compra.id, fechaHora, profesorId, franjaIds });
        return res.status(200).send('OK');
      }

      const { data: sesionCreada, error: sesionError } = await supabase
        .from('sesion_clase')
        .insert([
          {
            compra_id: compra.id,
            profesor_id: profesorId,
            descripcion_estudiante: descripcionEst,
            documento_url: documentoUrl,
            fecha_hora: new Date(fechaHora).toISOString(),
            link_meet: null,
            estado: 'programada',
            franja_horaria_ids: franjaIds
          }
        ])
        .select()
        .single();

      if (sesionError) {
        console.error('❌ Error creando sesion_clase post-pago:', sesionError);
        return res.status(200).send('OK');
      }

      await notificarCompraClasePersonalizada({ compra, sesionCreada, profesorId });
      return res.status(200).send('OK');
    }

    // ✅ PAQUETE HORAS: admin + estudiante
    if (compra.tipo_compra === 'paquete_horas') {
      const meta = compra?.mp_raw?.metadata || {};
      const horasCompradas = meta?.cantidad_horas || compra?.horas_totales || null;

      await notificarCompraPaqueteHoras({ compra, estudiante, horasCompradas });
      return res.status(200).send('OK');
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Error webhook MercadoPago:', error);
    return res.status(200).send('OK');
  }
};

export const obtenerEstadoCompra = async (req, res) => {
  try {
    const { compra_id } = req.params;

    const { data: compra, error } = await supabase
      .from('compra')
      .select('id, tipo_compra, estado_pago, monto_total, mp_preference_id, mp_payment_id, mp_status, mp_status_detail')
      .eq('id', compra_id)
      .single();

    if (error || !compra) return res.status(404).json({ success: false, message: 'Compra no encontrada' });
    return res.json({ success: true, data: compra });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error consultando compra', error: error.message });
  }
};
