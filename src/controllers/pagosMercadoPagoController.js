import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { supabase } from '../config/supabase.js';
import { mpPreference, mpPayment, mpMerchantOrder } from '../config/mercadopago.js';

dotenv.config();

/**
 * Crea (o reutiliza) una compra en estado "pendiente" y genera una preferencia de MercadoPago Checkout Pro.
 *
 * Endpoint: POST /api/pagos/mercadopago/checkout
 *
 * Body soportado:
 * - Flujo autenticado (requiere token si lo deseas): { tipo_compra, curso_id | clase_personalizada_id | (paquete) clase_personalizada_id + cantidad_horas, ... }
 * - Flujo sin login: incluye "estudiante" para crear usuario automáticamente.
 *
 * Nota: Para simplificar el arranque de FASE 9, este endpoint maneja el inicio del pago.
 * Luego, el webhook confirma y actualiza compra.estado_pago.
 */
export const crearCheckoutMercadoPago = async (req, res) => {
  try {
    const {
      tipo_compra,
      curso_id,
      clase_personalizada_id,
      cantidad_horas,
      estudiante
    } = req.body;

    if (!tipo_compra) {
      return res.status(400).json({ success: false, message: 'tipo_compra es requerido' });
    }

    // 1) Resolver estudiante_id (token o creación automática)
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

    // 2) Calcular monto_total según tipo_compra
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

      const { data: clase, error } = await supabase
        .from('clase_personalizada')
        .select('id,precio')
        .eq('id', clase_personalizada_id)
        .single();

      if (error || !clase) return res.status(404).json({ success: false, message: 'Clase personalizada no encontrada' });

      titulo = `Clase personalizada`;
      monto_total = Number(clase.precio);
      metadata = { ...metadata, clase_personalizada_id: clase.id };

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

    // Campos específicos para paquete
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

    // 4) Crear preferencia de MercadoPago
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
    const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;

    const notification_url = `${BACKEND_PUBLIC_URL}/api/pagos/mercadopago/webhook`;

    const preferenceBody = {
      items: [
        {
          title: titulo,
          quantity: 1,
          currency_id: 'COP',
          unit_price: Number(monto_total)
        }
      ],
      external_reference: compra.id, // clave: el webhook la trae y con eso cerramos la compra
      metadata: {
        ...metadata,
        compra_id: compra.id
      },
      back_urls: {
        success: `${FRONTEND_URL}/pago/exitoso?compra_id=${compra.id}`,
        pending: `${FRONTEND_URL}/pago/pendiente?compra_id=${compra.id}`,
        failure: `${FRONTEND_URL}/pago/fallido?compra_id=${compra.id}`
      },
      //auto_return: 'approved',
      notification_url
    };

    const mpResp = await mpPreference.create({ body: preferenceBody });

    // 5) Guardar preference_id en compra
    const preference_id = mpResp?.id || null;

    const { error: errUpd } = await supabase
      .from('compra')
      .update({
        mp_preference_id: preference_id,
        mp_raw: mpResp
      })
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

/**
 * Webhook MercadoPago (IPN/Notifications).
 *
 * Endpoint: POST /api/pagos/mercadopago/webhook
 *
 * MercadoPago puede enviar:
 * - Query: ?topic=payment&id=123
 * - Query (a veces): ?topic=payment&data.id=123
 * - Body: { type: "payment", data: { id: "123" } }
 * - Body (a veces): { topic: "payment|merchant_order", resource: "123" o "https://.../merchant_orders/123" }
 */
export const webhookMercadoPago = async (req, res) => {
  try {
    const topic = req.query.topic || req.body?.type || req.body?.topic;

    // --- FIX: extracción robusta del ID (evita "Invalid Id") ---
    let id =
      req.query.id ||
      req.query['data.id'] ||
      req.body?.data?.id ||
      req.body?.id ||
      req.body?.resource;

    // Si viene como URL en resource (merchant_order), extraer el último segmento
    if (typeof id === 'string' && id.startsWith('http')) {
      id = id.split('/').filter(Boolean).pop();
    }
    // --- FIN FIX ---

    // Responder rápido para que MP no reintente por timeout
    if (!topic || !id) {
      return res.status(200).send('OK');
    }

    // Idempotencia (event_id = topic:id)
    const eventId = `${topic}:${id}`;

    const { data: yaProcesado } = await supabase
      .from('webhook_evento_pago')
      .select('id')
      .eq('proveedor_pago', 'mercadopago')
      .eq('event_id', eventId)
      .maybeSingle();

    if (yaProcesado?.id) {
      return res.status(200).send('OK');
    }

    await supabase
      .from('webhook_evento_pago')
      .insert([{
        proveedor_pago: 'mercadopago',
        event_id: eventId,
        tipo_evento: topic,
        payload: { query: req.query, body: req.body, headers: req.headers }
      }]);

    // Procesamiento principal
    if (topic === 'payment' || topic === 'payment.updated') {
      const paymentId = String(id);
      const payment = await mpPayment.get({ id: paymentId });

      const external_reference = payment?.external_reference; // compra.id
      const status = payment?.status; // approved, pending, rejected, cancelled
      const status_detail = payment?.status_detail;
      const merchant_order_id = payment?.order?.id ? String(payment.order.id) : null;

      if (!external_reference) {
        return res.status(200).send('OK');
      }

      const nuevoEstado =
        status === 'approved' ? 'completado'
          : (status === 'rejected' || status === 'cancelled') ? 'fallido'
            : 'pendiente';

      // Update compra
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

      // Activación post-pago (mínima e idempotente)
      if (nuevoEstado === 'completado') {
        const { data: compra } = await supabase
          .from('compra')
          .select('id, tipo_compra, estudiante_id, curso_id')
          .eq('id', external_reference)
          .single();

        if (compra?.tipo_compra === 'curso' && compra?.curso_id) {
          // Crear inscripción si no existe
          const { data: inscExist } = await supabase
            .from('inscripcion_curso')
            .select('id')
            .eq('estudiante_id', compra.estudiante_id)
            .eq('curso_id', compra.curso_id)
            .maybeSingle();

          if (!inscExist?.id) {
            await supabase.from('inscripcion_curso').insert([{
              estudiante_id: compra.estudiante_id,
              curso_id: compra.curso_id,
              fecha_inscripcion: new Date().toISOString()
            }]);
          }
        }
      }

      return res.status(200).send('OK');
    }

    if (topic === 'merchant_order') {
      // Opcional: se puede usar para reconciliar órdenes
      const orderId = String(id);
      await mpMerchantOrder.get({ id: orderId });

      // Si trae external_reference, también podrías actualizar estado
      // (pero dejamos payment como fuente de verdad)
      return res.status(200).send('OK');
    }

    return res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Error webhook MercadoPago:', error);
    // Aun así devolver 200 para evitar reintentos agresivos mientras debuggeas
    return res.status(200).send('OK');
  }
};

/**
 * Consultar estado de una compra (útil para frontend después del return_url).
 * Endpoint: GET /api/pagos/mercadopago/estado/:compra_id
 */
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
