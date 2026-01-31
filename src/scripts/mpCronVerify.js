// scripts/mpCronVerify.js
import dotenv from 'dotenv';
dotenv.config();

import { supabase } from '../src/config/supabase.js';
import { mpPayment } from '../src/config/mercadopago.js';

import {
  notifyClasePersonalizadaAfterSessionCreated,
  notifyCompraCursoAfterPaymentApproved,
  notifyPaqueteHorasAfterPaymentApproved
} from '../src/services/emailService.js';

const isNumericId = (value) => /^\d+$/.test(String(value || '').trim());

const computeEstadoPago = (status) => {
  const isApproved = status === 'approved' || status === 'accredited';
  if (isApproved) return 'completado';
  if (status === 'rejected' || status === 'cancelled') return 'fallido';
  return 'pendiente';
};

const ejecutarPostPago = async (compra, paymentRaw) => {
  // CURSO
  if (compra.tipo_compra === 'curso' && compra.curso_id) {
    try {
      const { data: existente, error: errExist } = await supabase
        .from('inscripcion_curso')
        .select('id')
        .eq('estudiante_id', compra.estudiante_id)
        .eq('curso_id', compra.curso_id)
        .maybeSingle();

      if (errExist) throw errExist;

      if (!existente?.id) {
        const { error: errIns } = await supabase
          .from('inscripcion_curso')
          .insert([{
            estudiante_id: compra.estudiante_id,
            curso_id: compra.curso_id,
            fecha_inscripcion: new Date().toISOString()
          }]);

        if (errIns) throw errIns;
      }

      // Vincular sesiones existentes del curso al estudiante
      try {
        const { data: sesiones, error: errSes } = await supabase
          .from('curso_sesion')
          .select('id')
          .eq('curso_id', compra.curso_id);

        if (errSes) throw errSes;

        if (Array.isArray(sesiones) && sesiones.length > 0) {
          const links = sesiones.map((s) => ({
            curso_sesion_id: s.id,
            estudiante_id: compra.estudiante_id
          }));

          const { error: errLink } = await supabase
            .from('curso_sesion_estudiante')
            .upsert(links, { onConflict: 'curso_sesion_id,estudiante_id' });

          if (errLink) throw errLink;
        }
      } catch (e) {
        console.error('⚠️ CRON: no se pudo vincular curso_sesion_estudiante:', e?.message || e);
      }

      await notifyCompraCursoAfterPaymentApproved({ compraId: compra.id });
    } catch (e) {
      console.error('❌ CRON: post-pago curso:', e?.message || e);
    }
    return;
  }

  // PAQUETE HORAS
  if (compra.tipo_compra === 'paquete_horas') {
    try {
      const meta = paymentRaw?.metadata || compra?.mp_raw?.metadata || {};
      const horas = Number(meta?.cantidad_horas);

      if (!horas || horas <= 0) {
        console.error('❌ CRON: paquete_horas sin metadata.cantidad_horas', { compraId: compra.id, meta });
        return;
      }

      const yaAsignado =
        compra.horas_totales !== null &&
        compra.horas_totales !== undefined &&
        Number(compra.horas_totales) > 0;

      if (!yaAsignado) {
        const { error: errHoras } = await supabase
          .from('compra')
          .update({
            horas_totales: horas,
            horas_usadas: 0,
            horas_disponibles: horas
          })
          .eq('id', compra.id);

        if (errHoras) throw errHoras;
      }

      await notifyPaqueteHorasAfterPaymentApproved({ compraId: compra.id });
    } catch (e) {
      console.error('❌ CRON: post-pago paquete_horas:', e?.message || e);
    }
    return;
  }

  // CLASE PERSONALIZADA
  if (compra.tipo_compra === 'clase_personalizada' && compra.clase_personalizada_id) {
    try {
      const { data: sesionExist } = await supabase
        .from('sesion_clase')
        .select('id')
        .eq('compra_id', compra.id)
        .maybeSingle();

      if (sesionExist?.id) return;

      const meta = paymentRaw?.metadata || compra?.mp_raw?.metadata || {};
      const fechaHora = meta?.fecha_hora || null;
      const profesorId = meta?.profesor_id || null;
      const franjaIds = meta?.franja_horaria_ids || [];
      const descripcionEst = meta?.descripcion_estudiante || null;
      const documentoUrl = meta?.documento_url || null;

      if (!fechaHora || !profesorId || !Array.isArray(franjaIds) || franjaIds.length === 0) {
        console.error('❌ CRON: metadata incompleta sesion_clase', {
          compraId: compra.id,
          fechaHora,
          profesorId,
          franjaIds
        });
        return;
      }

      const { data: sesionCreada, error: sesionError } = await supabase
        .from('sesion_clase')
        .insert([{
          compra_id: compra.id,
          profesor_id: profesorId,
          descripcion_estudiante: descripcionEst,
          documento_url: documentoUrl,
          fecha_hora: new Date(fechaHora).toISOString(),
          link_meet: null,
          estado: 'programada',
          franja_horaria_ids: franjaIds
        }])
        .select()
        .single();

      if (sesionError) {
        console.error('❌ CRON: error creando sesion_clase:', sesionError);
        return;
      }

      try {
        await notifyClasePersonalizadaAfterSessionCreated({ sesionId: sesionCreada.id });
      } catch (e) {
        console.error('❌ CRON: error email clase personalizada:', e?.message || e);
      }
    } catch (e) {
      console.error('❌ CRON: post-pago clase_personalizada:', e?.message || e);
    }
  }
};

const main = async () => {
  try {
    const LIMIT = Number(process.env.MP_CRON_LIMIT || 50);

    const { data: compras, error: errList } = await supabase
      .from('compra')
      .select('id, estudiante_id, tipo_compra, curso_id, clase_personalizada_id, mp_payment_id, mp_raw, horas_totales, horas_usadas, horas_disponibles')
      .eq('proveedor_pago', 'mercadopago')
      .eq('estado_pago', 'pendiente')
      .not('mp_payment_id', 'is', null)
      .order('fecha_compra', { ascending: true })
      .limit(LIMIT);

    if (errList) throw errList;

    let scanned = compras?.length || 0;
    let updated = 0;
    let completed = 0;
    let failed = 0;

    for (const compra of compras || []) {
      const paymentId = String(compra.mp_payment_id || '').trim();
      if (!isNumericId(paymentId)) continue;

      let payment;
      try {
        payment = await mpPayment.get({ id: paymentId });
      } catch (e) {
        console.error('❌ CRON: mpPayment.get error', compra.id, e?.message || e);
        continue;
      }

      const status = payment?.status || null;
      const status_detail = payment?.status_detail || null;
      const merchant_order_id = payment?.order?.id ? String(payment.order.id) : null;

      const nuevoEstado = computeEstadoPago(status);

      const { error: errUpd } = await supabase
        .from('compra')
        .update({
          estado_pago: nuevoEstado,
          mp_status: status,
          mp_status_detail: status_detail,
          mp_merchant_order_id: merchant_order_id,
          mp_raw: payment
        })
        .eq('id', compra.id);

      if (errUpd) {
        console.error('❌ CRON: update compra error', compra.id, errUpd);
        continue;
      }

      updated++;

      if (nuevoEstado === 'completado') {
        completed++;
        await ejecutarPostPago(compra, payment);
      } else if (nuevoEstado === 'fallido') {
        failed++;
      }
    }

    console.log(JSON.stringify({ ok: true, scanned, updated, completed, failed, limit: LIMIT }));
    process.exit(0);
  } catch (e) {
    console.error('❌ CRON main error:', e?.message || e);
    process.exit(1);
  }
};

main();
