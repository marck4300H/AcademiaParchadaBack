// src/controllers/pagosMercadoPagoController.js

import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

import { supabase } from '../config/supabase.js';
import { mpPreference, mpPayment, mpMerchantOrder } from '../config/mercadopago.js';

import { asignarProfesorOptimo } from '../utils/asignarProfesor.js';

import {
  getAdminEmail,

  sendCompraCursoAdminEmail,
  sendCompraCursoProfesorEmail,
  sendCompraCursoEstudianteEmail,

  sendCompraClasePersonalizadaAdminEmail,
  sendCompraClasePersonalizadaProfesorEmail,
  sendCompraClasePersonalizadaEstudianteEmail
} from '../services/emailService.js';

dotenv.config();

/**
 * POST /api/pagos/mercadopago/checkout
 */
export const crearCheckoutMercadoPago = async (req, res) => {
  try {
    const {
      tipo_compra,
      curso_id,
      clase_personalizada_id,
      cantidad_horas,
      estudiante,
      fecha_hora,
      descripcion_estudiante,
      documento_url
    } = req.body;

    if (!tipo_compra) {
      return res.status(400).json({ success: false, message: 'tipo_compra es requerido' });
    }

    // 1) Resolver estudiante_id
    let estudiante_id = req.user?.id || null;

    if (!estudiante_id) {
      if (!estudiante?.email || !estudiante?.password || !estudiante?.nombre || !estudiante?.apellido) {
        return res.status(400).json({
          success: false,
          message: 'Si no hay token, debes enviar estudiante {email, password, nombre, apellido}.'
        });
      }

      const { email, password, nombre, apellido, telefono } = estudiante;

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
        .insert([{
          email,
          nombre,
          apellido,
          telefono,
          password_hash: passwordHash,
          rol: 'estudiante'
        }])
        .select()
        .single();

      if (errNuevo) throw errNuevo;
      estudiante_id = nuevoEst.id;
    }

    // 2) Calcular monto_total y metadata
    let titulo = '';
    let monto_total = 0;
    let metadata = { tipo_compra };

    if (tipo_compra === 'curso') {
      if (!curso_id) return res.status(400).json({ success: false, message: 'curso_id es requerido' });

      const { data: curso, error } = await supabase
        .from('curso')
        .select('id,nombre,precio')
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

      const dt = new Date(fecha_hora);
      if (Number.isNaN(dt.getTime())) {
        return res.status(400).json({ success: false, message: 'fecha_hora inválida (ISO)' });
      }

      const { data: clase, error } = await supabase
        .from('clase_personalizada')
        .select('id,precio')
        .eq('id', clase_personalizada_id)
        .single();

      if (error || !clase) return res.status(404).json({ success: false, message: 'Clase personalizada no encontrada' });

      titulo = `Clase personalizada`;
      monto_total = Number(clase.precio);

      metadata = {
        ...metadata,
        clase_personalizada_id: clase.id,
        fecha_hora: dt.toISOString(),
        descripcion_estudiante: descripcion_estudiante || null,
        documento_url: documento_url || null
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

      metadata = {
        ...metadata,
        clase_personalizada_id: clase.id,
        cantidad_horas: horas
      };

    } else {
      return res.status(400).json({ success: false, message: 'tipo_compra inválido' });
    }

    // 3) Crear compra en estado "pendiente"
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
    const topic = req.query.topic || req.body?.type || req.body?.topic;

    let id =
      req.query.id ||
      req.query['data.id'] ||
      req.body?.data?.id ||
      req.body?.id ||
      req.body?.resource;

    if (typeof id === 'string' && id.startsWith('http')) {
      id = id.split('/').filter(Boolean).pop();
    }

    if (!topic || !id) return res.status(200).send('OK');

    const eventId = `${topic}:${id}`;

    const { data: yaProcesado } = await supabase
      .from('webhook_evento_pago')
      .select('id')
      .eq('proveedor_pago', 'mercadopago')
      .eq('event_id', eventId)
      .maybeSingle();

    if (yaProcesado?.id) return res.status(200).send('OK');

    await supabase
      .from('webhook_evento_pago')
      .insert([{
        proveedor_pago: 'mercadopago',
        event_id: eventId,
        tipo_evento: topic,
        payload: { query: req.query, body: req.body, headers: req.headers }
      }]);

    if (topic === 'payment' || topic === 'payment.updated') {
      const paymentId = String(id);
      const payment = await mpPayment.get({ id: paymentId });

      const external_reference = payment?.external_reference; // compra.id
      const status = payment?.status;
      const status_detail = payment?.status_detail;
      const merchant_order_id = payment?.order?.id ? String(payment.order.id) : null;

      if (!external_reference) return res.status(200).send('OK');

      const nuevoEstado =
        status === 'approved' ? 'completado'
          : (status === 'rejected' || status === 'cancelled') ? 'fallido'
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

      const { data: compra } = await supabase
        .from('compra')
        .select(`
          id,
          tipo_compra,
          estudiante_id,
          curso_id,
          clase_personalizada_id,
          monto_total,
          mp_raw
        `)
        .eq('id', external_reference)
        .single();

      if (!compra?.id) return res.status(200).send('OK');

      // CLAVE: estudiante con email + telefono + timezone
      const { data: estudiante } = await supabase
        .from('usuario')
        .select('id,nombre,apellido,email,telefono,timezone')
        .eq('id', compra.estudiante_id)
        .single();

      const adminEmail = await getAdminEmail();

      // ===== CURSO =====
      if (compra.tipo_compra === 'curso' && compra.curso_id) {
        const { data: inscExist } = await supabase
          .from('inscripcion_curso')
          .select('id')
          .eq('estudiante_id', compra.estudiante_id)
          .eq('curso_id', compra.curso_id)
          .maybeSingle();

        if (!inscExist?.id) {
          await supabase
            .from('inscripcion_curso')
            .insert([{
              estudiante_id: compra.estudiante_id,
              curso_id: compra.curso_id,
              fecha_inscripcion: new Date().toISOString()
            }]);
        }

        const { data: curso } = await supabase
          .from('curso')
          .select(`
            id,
            nombre,
            profesor:profesor_id (id,nombre,apellido,email)
          `)
          .eq('id', compra.curso_id)
          .single();

        await Promise.allSettled([
          sendCompraCursoAdminEmail({
            adminEmail,
            compraId: compra.id,
            montoTotal: compra.monto_total,
            cursoNombre: curso?.nombre,
            profesor: curso?.profesor,
            estudiante
          }),
          sendCompraCursoProfesorEmail({
            profesorEmail: curso?.profesor?.email,
            cursoNombre: curso?.nombre,
            compraId: compra.id,
            estudiante
          }),
          // ESTUDIANTE (AQUÍ)
          sendCompraCursoEstudianteEmail({
            estudianteEmail: estudiante?.email,
            compraId: compra.id,
            profesor: curso?.profesor,
            cursoNombre: curso?.nombre
          })
        ]);

        return res.status(200).send('OK');
      }

      // ===== CLASE PERSONALIZADA =====
      if (compra.tipo_compra === 'clase_personalizada' && compra.clase_personalizada_id) {
        const { data: sesionExist } = await supabase
          .from('sesion_clase')
          .select('id,fecha_hora,profesor_id')
          .eq('compra_id', compra.id)
          .maybeSingle();

        let sesionCreada = sesionExist || null;
        let profesorId = sesionExist?.profesor_id || null;

        const { data: clase } = await supabase
          .from('clase_personalizada')
          .select(`
            id,
            duracion_horas,
            asignatura:asignatura_id (id,nombre)
          `)
          .eq('id', compra.clase_personalizada_id)
          .single();

        const meta = compra?.mp_raw?.metadata || {};
        const fechaHoraIso = meta?.fecha_hora || sesionExist?.fecha_hora;

        if (!sesionExist?.id) {
          if (!fechaHoraIso) {
            console.error('Falta metadata.fecha_hora en mp_raw para compra', compra.id);
            return res.status(200).send('OK');
          }

          const asignacion = await asignarProfesorOptimo(
            clase?.asignatura?.id || clase?.asignatura_id,
            new Date(fechaHoraIso),
            clase?.duracion_horas
          );

          if (!asignacion) {
            // Si no hay profesor, igual avisar al estudiante de compra exitosa (sin profesor)
            await Promise.allSettled([
              sendCompraClasePersonalizadaAdminEmail({
                adminEmail,
                compraId: compra.id,
                montoTotal: compra.monto_total,
                profesor: null,
                estudiante
              }),
              sendCompraClasePersonalizadaEstudianteEmail({
                estudianteEmail: estudiante?.email,
                compraId: compra.id,
                profesor: null,
                fechaHoraIso
              })
            ]);

            return res.status(200).send('OK');
          }

          const profesorAsignado = asignacion.profesor;
          const franjasUtilizadas = asignacion.franjasUtilizadas;
          profesorId = profesorAsignado?.id;

          const { data: sesion } = await supabase
            .from('sesion_clase')
            .insert([{
              compra_id: compra.id,
              profesor_id: profesorAsignado.id,
              descripcion_estudiante: meta?.descripcion_estudiante || null,
              documento_url: meta?.documento_url || null,
              fecha_hora: new Date(fechaHoraIso).toISOString(),
              link_meet: null,
              estado: 'programada',
              franja_horaria_ids: franjasUtilizadas
            }])
            .select()
            .single();

          sesionCreada = sesion || null;
        }

        // Traer profesor (con timezone)
        let profesorFull = null;
        if (profesorId) {
          const { data: prof } = await supabase
            .from('usuario')
            .select('id,nombre,apellido,email,timezone')
            .eq('id', profesorId)
            .single();
          profesorFull = prof || null;
        }

        await Promise.allSettled([
          sendCompraClasePersonalizadaAdminEmail({
            adminEmail,
            compraId: compra.id,
            montoTotal: compra.monto_total,
            profesor: profesorFull,
            estudiante
          }),
          sendCompraClasePersonalizadaProfesorEmail({
            profesorEmail: profesorFull?.email,
            compraId: compra.id,
            asignaturaNombre: clase?.asignatura?.nombre,
            fechaHoraIso: sesionCreada?.fecha_hora || fechaHoraIso,
            duracionHoras: clase?.duracion_horas, // DURACIÓN
            profesorTimeZone: profesorFull?.timezone,
            estudiante
          }),
          // ESTUDIANTE (AQUÍ estaba faltando en muchos casos)
          sendCompraClasePersonalizadaEstudianteEmail({
            estudianteEmail: estudiante?.email,
            compraId: compra.id,
            profesor: profesorFull,
            fechaHoraIso: sesionCreada?.fecha_hora || fechaHoraIso
          })
        ]);

        return res.status(200).send('OK');
      }

      return res.status(200).send('OK');
    }

    if (topic === 'merchant_order') {
      const orderId = String(id);
      await mpMerchantOrder.get({ id: orderId });
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
