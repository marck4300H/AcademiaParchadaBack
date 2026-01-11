// src/controllers/pagosMercadoPagoController.js

import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

import { supabase } from '../config/supabase.js';
import { mpPreference, mpPayment, mpMerchantOrder } from '../config/mercadopago.js';

import { asignarProfesorOptimo } from '../utils/asignarProfesor.js';
import {
  notifyClasePersonalizadaAfterSessionCreated,
  notifyCompraCursoAfterPaymentApproved,
  notifyPaqueteHorasAfterPaymentApproved
} from '../services/emailService.js';

dotenv.config();

/**
 * Extrae el id del webhook de MercadoPago de forma segura.
 */
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
      const { data: estDB } = await supabase
        .from('usuario')
        .select('timezone')
        .eq('id', estudiante_id)
        .single();

      estudianteTZFromDB = estDB?.timezone || null;
    }

    if (!estudiante_id) {
      if (!estudiante?.email || !estudiante?.password || !estudiante?.nombre || !estudiante?.apellido) {
        return res.status(400).json({
          success: false,
          message: 'Si no hay token, debes enviar estudiante {email, password, nombre, apellido}.'
        });
      }

      const { email, password, nombre, apellido, telefono, timezone } = estudiante;

      const { data: existente } = await supabase
        .from('usuario')
        .select('id')
        .eq('email', email)
        .single();

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
            timezone: timezone || null,
            password_hash: passwordHash,
            rol: 'estudiante'
          }
        ])
        .select()
        .single();

      if (errNuevo) throw errNuevo;

      estudiante_id = nuevoEst.id;
      estudianteTZFromDB = nuevoEst?.timezone || null;
    }

    const estudianteTimeZone = estudiante_timezone || estudianteTZFromDB || null;

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

      // ✅ No tocar franjas/validación (tu lógica)
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

    const { data: compra, error: errCompra } = await supabase
      .from('compra')
      .insert([compraInsert])
      .select()
      .single();

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

    // Si llegan ambos webhooks, no rompas nada
    if (topic === 'merchant_order') {
      // Opcional: no consultar merchant_order para evitar ruido/errores
      return res.status(200).send('OK');
    }

    if (topic === 'payment' || topic === 'payment.updated') {
      const paymentId = String(id || '').trim();

      if (!isNumericId(paymentId)) return res.status(200).send('OK');

      const payment = await mpPayment.get({ id: paymentId });

      const external_reference = payment?.external_reference;
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
        .select('id,tipo_compra,curso_id,clase_personalizada_id,mp_raw')
        .eq('id', external_reference)
        .single();

      if (errCompra || !compra?.id) return res.status(200).send('OK');

      // ===============================
      // ✅ CURSO: solo llamar emailService
      // ===============================
      if (compra.tipo_compra === 'curso' && compra.curso_id) {
        try {
          const notifyResult = await notifyCompraCursoAfterPaymentApproved({ compraId: compra.id });
          console.log('✅ notifyCompraCursoAfterPaymentApproved result:', { compraId: compra.id, notifyResult });
        } catch (e) {
          console.error('❌ Error notificando curso (emailService):', e?.message || e);
        }
        return res.status(200).send('OK');
      }

      // ===============================
      // ✅ PAQUETE HORAS: solo llamar emailService
      // ===============================
      if (compra.tipo_compra === 'paquete_horas') {
        try {
          const notifyResult = await notifyPaqueteHorasAfterPaymentApproved({ compraId: compra.id });
          console.log('✅ notifyPaqueteHorasAfterPaymentApproved result:', { compraId: compra.id, notifyResult });
        } catch (e) {
          console.error('❌ Error notificando paquete_horas (emailService):', e?.message || e);
        }
        return res.status(200).send('OK');
      }

      // ===============================
      // CLASE PERSONALIZADA (se mantiene igual)
      // ===============================
      if (compra.tipo_compra === 'clase_personalizada' && compra.clase_personalizada_id) {
        const { data: sesionExist } = await supabase
          .from('sesion_clase')
          .select('id')
          .eq('compra_id', compra.id)
          .maybeSingle();

        if (sesionExist?.id) return res.status(200).send('OK');

        const meta = compra?.mp_raw?.metadata || {};
        const fechaHora = meta?.fecha_hora || null;
        const profesorId = meta?.profesor_id || null;
        const franjaIds = meta?.franja_horaria_ids || [];
        const descripcionEst = meta?.descripcion_estudiante || null;
        const documentoUrl = meta?.documento_url || null;

        if (!fechaHora || !profesorId || !Array.isArray(franjaIds) || franjaIds.length === 0) {
          console.error('❌ metadata incompleta para crear sesion_clase', {
            compraId: compra.id,
            fechaHora,
            profesorId,
            franjaIds
          });
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

        // ✅ ÚNICO LLAMADO: emailService consulta todo
        try {
          const notifyResult = await notifyClasePersonalizadaAfterSessionCreated({ sesionId: sesionCreada.id });
          console.log('✅ notifyClasePersonalizadaAfterSessionCreated result:', {
            sesionId: sesionCreada.id,
            notifyResult
          });
        } catch (e) {
          // No devolver 500 a MP para no causar reintentos infinitos
          console.error('❌ Error notificando clase personalizada (emailService):', e?.message || e);
        }

        return res.status(200).send('OK');
      }

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

    if (error || !compra) {
      return res.status(404).json({ success: false, message: 'Compra no encontrada' });
    }

    return res.json({ success: true, data: compra });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error consultando compra', error: error.message });
  }
};
