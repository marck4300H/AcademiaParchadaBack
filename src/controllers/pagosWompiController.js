// src/controllers/pagosWompiController.js

import bcrypt from "bcryptjs";
import crypto from "crypto";
import dotenv from "dotenv";
import { supabase } from "../config/supabase.js";
import { asignarProfesorOptimo } from "../utils/asignarProfesor.js";
import {
  notifyClasePersonalizadaAfterSessionCreated,
  notifyCompraCursoAfterPaymentApproved,
  notifyPaqueteHorasAfterPaymentApproved,
} from "../services/emailService.js";

dotenv.config();

const WOMPI_ENV = process.env.WOMPI_ENV || "sandbox";
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY;
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET;
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET;

const FRONTENDURL = process.env.FRONTENDURL || "http://localhost:5173";
const BACKENDPUBLICURL =
  process.env.BACKENDPUBLICURL || `http://localhost:${process.env.PORT || 5000}`;

const log = (...args) => console.log("[WOMPI]", ...args);
const warn = (...args) => console.warn("[WOMPI]", ...args);
const errLog = (...args) => console.error("[WOMPI]", ...args);

const safeString = (v) => (v === null || v === undefined ? "" : String(v));

const mapWompiStatusToEstadoPago = (status) => {
  const s = safeString(status).toUpperCase();
  if (s === "APPROVED") return "completado";
  if (["DECLINED", "ERROR", "VOID", "FAILED", "EXPIRED"].includes(s)) return "fallido";
  return "pendiente";
};

const generateReference = (compraId) => `compra_${compraId}`;

/**
 * Firma de integridad para Widget:
 * sha256(reference + amount_in_cents + currency + integrity_secret)
 */
const buildIntegritySignature = ({ reference, amount_in_cents, currency }) => {
  if (!WOMPI_INTEGRITY_SECRET) return null;
  const raw = `${reference}${amount_in_cents}${currency}${WOMPI_INTEGRITY_SECRET}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
};

const verifyEventSignatureBestEffort = (req) => {
  try {
    const headers = req.headers || {};
    const signature =
      headers["x-signature"] ||
      headers["x-wompi-signature"] ||
      headers["x-wompi-events-signature"] ||
      headers["x-event-signature"];

    if (!signature) {
      warn(
        "No se encontró header de firma en el webhook. Puede ser normal en sandbox, pero en producción NO es recomendable."
      );
      return { ok: true, reason: "no-signature" };
    }

    const secret = WOMPI_EVENTS_SECRET || WOMPI_INTEGRITY_SECRET;
    if (!secret) {
      warn("No hay WOMPI_EVENTS_SECRET ni WOMPI_INTEGRITY_SECRET configurados.");
      return { ok: true, reason: "no-secret" };
    }

    const payload = JSON.stringify(req.body || {});
    const computed = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const ok = safeString(signature).includes(computed);

    if (!ok) warn("Firma no coincide (best-effort). signature:", signature, "computed:", computed);
    return { ok, reason: ok ? "signature-ok" : "signature-mismatch" };
  } catch (e) {
    warn("Error verificando firma best-effort:", e?.message);
    return { ok: true, reason: "verify-error" };
  }
};

const fetchWompiTransaction = async (transactionId) => {
  if (!transactionId) return null;

  if (!WOMPI_PRIVATE_KEY) {
    warn("WOMPI_PRIVATE_KEY no está configurada; no se puede consultar transacción a Wompi.");
    return null;
  }

  const candidates = [
    `https://production.wompi.co/v1/transactions/${transactionId}`,
    `https://sandbox.wompi.co/v1/transactions/${transactionId}`,
    `https://wompi.co/v1/transactions/${transactionId}`,
    `https://checkout.wompi.co/v1/transactions/${transactionId}`,
  ];

  for (const url of candidates) {
    try {
      log("Consultando transacción Wompi:", url);
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
          "Content-Type": "application/json",
        },
      });

      const json = await resp.json().catch(() => null);

      if (!resp.ok) {
        warn("No OK consultando transacción", url, "status", resp.status, "body", json);
        continue;
      }

      log("Transacción obtenida OK desde", url);
      return json;
    } catch (e) {
      warn("Error consultando", url, e?.message);
    }
  }

  warn("No se pudo consultar transacción a Wompi con endpoints candidatos.");
  return null;
};

export const crearCheckoutWompi = async (req, res) => {
  const requestId = crypto.randomUUID();
  log("crearCheckoutWompi init", { requestId });

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
    } = req.body || {};

    if (!tipo_compra) {
      return res.status(400).json({ success: false, message: "tipo_compra es requerido" });
    }

    if (!WOMPI_PUBLIC_KEY) {
      return res.status(500).json({ success: false, message: "Falta WOMPI_PUBLIC_KEY en .env" });
    }

    if (!WOMPI_INTEGRITY_SECRET) {
      return res
        .status(500)
        .json({ success: false, message: "Falta WOMPI_INTEGRITY_SECRET en .env (necesaria para el widget)" });
    }

    // 1) Resolver estudiante_id
    let estudiante_id = req.user?.id || null;
    let estudianteTZFromDB = null;

    if (estudiante_id) {
      const { data: estDB } = await supabase.from("usuario").select("timezone").eq("id", estudiante_id).single();
      estudianteTZFromDB = estDB?.timezone || null;
    }

    if (!estudiante_id) {
      if (!estudiante?.email || !estudiante?.password || !estudiante?.nombre || !estudiante?.apellido) {
        return res.status(400).json({
          success: false,
          message:
            "Si no hay token, debes enviar estudiante: email, password, nombre, apellido (y opcional telefono/timezone).",
        });
      }

      const { email, password, nombre, apellido, telefono, timezone } = estudiante;

      const { data: existente } = await supabase.from("usuario").select("id").eq("email", email).maybeSingle();
      if (existente?.id) {
        return res.status(400).json({
          success: false,
          message: "El email ya está registrado. Inicia sesión para pagar.",
        });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const { data: nuevoEst, error: errNuevo } = await supabase
        .from("usuario")
        .insert({
          email,
          nombre,
          apellido,
          telefono: telefono || null,
          timezone: timezone || null,
          password_hash: passwordHash,
          rol: "estudiante",
        })
        .select()
        .single();

      if (errNuevo) throw errNuevo;

      estudiante_id = nuevoEst.id;
      estudianteTZFromDB = nuevoEst?.timezone || null;
    }

    const estudianteTimeZone = estudiante_timezone || estudianteTZFromDB || null;

    // 2) Calcular monto_total y metadata
    let titulo = "";
    let monto_total = 0;
    let metadata = { tipo_compra };

    if (tipo_compra === "curso") {
      if (!curso_id) return res.status(400).json({ success: false, message: "curso_id es requerido" });

      const { data: curso, error } = await supabase
        .from("curso")
        .select("id,nombre,precio,profesor_id")
        .eq("id", curso_id)
        .single();

      if (error || !curso) return res.status(404).json({ success: false, message: "Curso no encontrado" });

      titulo = `Curso: ${curso.nombre}`;
      monto_total = Number(curso.precio);
      metadata = { ...metadata, curso_id: curso.id };
    } else if (tipo_compra === "clase_personalizada") {
      if (!clase_personalizada_id) {
        return res.status(400).json({ success: false, message: "clase_personalizada_id es requerido" });
      }
      if (!fecha_hora) {
        return res.status(400).json({ success: false, message: "fecha_hora es requerida para clase_personalizada" });
      }

      const { data: clase, error } = await supabase
        .from("clase_personalizada")
        .select("id,precio,duracion_horas,asignatura_id, asignatura:asignatura_id(id,nombre)")
        .eq("id", clase_personalizada_id)
        .single();

      if (error || !clase) return res.status(404).json({ success: false, message: "Clase personalizada no encontrada" });

      const asignacion = await asignarProfesorOptimo(
        clase.asignatura_id,
        String(fecha_hora),
        clase.duracion_horas,
        estudianteTimeZone
      );

      if (!asignacion) {
        return res.status(400).json({
          success: false,
          message: "No hay disponibilidad de profesores para esa fecha y hora. Elige otro horario.",
        });
      }

      titulo = "Clase personalizada";
      monto_total = Number(clase.precio);

      metadata = {
        ...metadata,
        clase_personalizada_id: clase.id,
        fecha_hora: String(fecha_hora),
        estudiante_timezone: estudianteTimeZone,
        descripcion_estudiante: descripcion_estudiante || null,
        profesor_id: asignacion.profesor?.id || null,
        franja_horaria_ids: asignacion.franjasUtilizadas,
        profesor_timezone: asignacion.profesorTimeZone || null,
        duracion_horas: clase.duracion_horas,
        asignatura_id: clase.asignatura_id,
        asignatura_nombre: clase?.asignatura?.nombre || null,
      };
    } else if (tipo_compra === "paquete_horas") {
      if (!clase_personalizada_id) {
        return res.status(400).json({ success: false, message: "clase_personalizada_id es requerido" });
      }

      if (!cantidad_horas || Number(cantidad_horas) <= 0) {
        return res.status(400).json({ success: false, message: "cantidad_horas debe ser > 0" });
      }

      const { data: clase, error } = await supabase
        .from("clase_personalizada")
        .select("id,precio")
        .eq("id", clase_personalizada_id)
        .single();

      if (error || !clase) return res.status(404).json({ success: false, message: "Clase personalizada no encontrada" });

      const horas = Number(cantidad_horas);
      titulo = `Paquete de horas (${horas}h)`;
      monto_total = Number(clase.precio) * horas;
      metadata = { ...metadata, clase_personalizada_id: clase.id, cantidad_horas: horas };
    } else {
      return res.status(400).json({ success: false, message: "tipo_compra inválido" });
    }

    // 3) Insertar compra pendiente
    const compraInsert = {
      estudiante_id,
      tipo_compra,
      curso_id: tipo_compra === "curso" ? curso_id : null,
      clase_personalizada_id: tipo_compra !== "curso" ? clase_personalizada_id : null,
      monto_total,
      estado_pago: "pendiente",
      fecha_compra: new Date().toISOString(),
      proveedor_pago: "wompi",
      moneda: "COP",
      wompi_reference: null,
    };

    if (tipo_compra === "paquete_horas") {
      compraInsert.horas_totales = Number(cantidad_horas);
      compraInsert.horas_usadas = 0;
      compraInsert.horas_disponibles = Number(cantidad_horas);
    }

    log("Insertando compra pendiente", { requestId, compraInsert });

    const { data: compra, error: errCompra } = await supabase.from("compra").insert(compraInsert).select().single();
    if (errCompra) throw errCompra;

    // 4) Reference + firma integridad
    const reference = generateReference(compra.id);
    const amount_in_cents = Math.round(Number(monto_total) * 100);
    const currency = "COP";

    const signature_integrity = buildIntegritySignature({
      reference,
      amount_in_cents: String(amount_in_cents),
      currency,
    });

    // 5) Guardar reference + raw
    const { error: errUpdRef } = await supabase
      .from("compra")
      .update({
        wompi_reference: reference,
        wompi_raw: {
          metadata,
          titulo,
          env: WOMPI_ENV,
          amount_in_cents,
          currency,
          signature_integrity,
        },
      })
      .eq("id", compra.id);

    if (errUpdRef) throw errUpdRef;

    const checkoutPayload = {
      compraId: compra.id,
      reference,
      amount_in_cents,
      currency,
      publicKey: WOMPI_PUBLIC_KEY,
      signature_integrity,
      redirect_urls: {
        success: `${FRONTENDURL}/pago-exitoso?compraId=${compra.id}`,
        pending: `${FRONTENDURL}/pago-pendiente?compraId=${compra.id}`,
        failure: `${FRONTENDURL}/pago-fallido?compraId=${compra.id}`,
      },
      webhook_url: `${BACKENDPUBLICURL}/api/pagos/wompi/eventos`,
      metadata,
    };

    log("crearCheckoutWompi OK", { requestId, compraId: compra.id, reference });

    return res.status(201).json({
      success: true,
      message: "Checkout Wompi creado",
      data: checkoutPayload,
    });
  } catch (error) {
    errLog("Error creando checkout Wompi", error?.message || error, error);
    return res.status(500).json({
      success: false,
      message: "Error creando checkout de Wompi",
      error: error?.message,
    });
  }
};

export const webhookWompi = async (req, res) => {
  const requestId = crypto.randomUUID();
  log("webhookWompi init", { requestId });

  try {
    const verify = verifyEventSignatureBestEffort(req);
    log("verifyEventSignatureBestEffort", { requestId, ...verify });

    const body = req.body || {};
    const eventId = body?.id || body?.event?.id || body?.data?.id || null;
    const eventType = body?.type || body?.event?.type || body?.event_type || "unknown";

    log("Evento recibido", { requestId, eventId, eventType });

    const normalizedEventId = eventId ? String(eventId) : `no-id-${requestId}`;

    // Idempotencia de webhook
    const { data: yaProcesado } = await supabase
      .from("webhook_evento_pago")
      .select("id")
      .eq("proveedor_pago", "wompi")
      .eq("event_id", normalizedEventId)
      .maybeSingle();

    if (yaProcesado?.id) {
      log("Evento ya procesado, respondiendo OK", { requestId, normalizedEventId });
      return res.status(200).send("OK");
    }

    await supabase.from("webhook_evento_pago").insert({
      proveedor_pago: "wompi",
      event_id: normalizedEventId,
      tipo_evento: String(eventType),
      payload: body,
    });

    const transactionId =
      body?.data?.transaction?.id || body?.data?.id || body?.transaction?.id || body?.transaction_id || null;

    const reference =
      body?.data?.transaction?.reference || body?.data?.reference || body?.reference || null;

    log("Evento parsed", { requestId, transactionId, reference });

    const txResp = await fetchWompiTransaction(transactionId);
    const txData = txResp?.data || txResp || null;

    const finalReference = reference || txData?.reference || txData?.data?.reference || null;

    const status =
      txData?.status || txData?.data?.status || body?.data?.transaction?.status || body?.data?.status || null;

    const statusMessage =
      txData?.status_message ||
      txData?.data?.status_message ||
      body?.data?.transaction?.status_message ||
      body?.data?.status_message ||
      null;

    log("Estado transacción (Wompi)", { requestId, status, statusMessage, finalReference });

    if (!finalReference) {
      warn("No se pudo determinar reference; no se puede asociar compra.", { requestId });
      return res.status(200).send("OK");
    }

    const { data: compra, error: errCompra } = await supabase
      .from("compra")
      .select("id, estudiante_id, tipo_compra, curso_id, clase_personalizada_id, wompi_raw")
      .eq("wompi_reference", finalReference)
      .maybeSingle();

    if (errCompra) {
      warn("Error buscando compra por reference", { requestId, errCompra });
      return res.status(200).send("OK");
    }

    if (!compra?.id) {
      warn("Compra no encontrada para reference", { requestId, finalReference });
      return res.status(200).send("OK");
    }

    const nuevoEstado = mapWompiStatusToEstadoPago(status);

    log("Actualizando compra", { requestId, compraId: compra.id, nuevoEstado });

    await supabase
      .from("compra")
      .update({
        estado_pago: nuevoEstado,
        wompi_transaction_id: transactionId ? String(transactionId) : null,
        wompi_status: status ? String(status) : null,
        wompi_status_message: statusMessage ? String(statusMessage) : null,
        wompi_raw: txData || body,
      })
      .eq("id", compra.id);

    if (nuevoEstado !== "completado") {
      log("Estado no completado, no ejecuta post-pago", { requestId, compraId: compra.id, nuevoEstado });
      return res.status(200).send("OK");
    }

    const meta = compra?.wompi_raw?.metadata || {};

    // ===== POST-PAGO SEGÚN tipo_compra (CORREGIDO flujo/llaves) =====

    // 1) CURSO => inscripcion_curso + link a sesiones + email
    if (compra.tipo_compra === "curso" && compra.curso_id) {
      try {
        log("Post-pago curso init", { requestId, compraId: compra.id });

        const { data: existente, error: errExist } = await supabase
          .from("inscripcion_curso")
          .select("id")
          .eq("estudiante_id", compra.estudiante_id)
          .eq("curso_id", compra.curso_id)
          .maybeSingle();

        if (errExist) throw errExist;

        if (!existente?.id) {
          const { error: errIns } = await supabase.from("inscripcion_curso").insert({
            estudiante_id: compra.estudiante_id,
            curso_id: compra.curso_id,
            fecha_inscripcion: new Date().toISOString(),
          });
          if (errIns) throw errIns;
        }

        // Vincular sesiones existentes del curso al estudiante (como en MercadoPago)
        const { data: sesiones, error: errSes } = await supabase
          .from("curso_sesion")
          .select("id")
          .eq("curso_id", compra.curso_id);

        if (errSes) throw errSes;

        if (Array.isArray(sesiones) && sesiones.length > 0) {
          const rows = sesiones.map((s) => ({
            curso_sesion_id: s.id,
            estudiante_id: compra.estudiante_id,
          }));

          const { error: errLink } = await supabase
            .from("curso_sesion_estudiante")
            .upsert(rows, { onConflict: "curso_sesion_id,estudiante_id" });

          if (errLink) throw errLink;
        }

        await notifyCompraCursoAfterPaymentApproved({ compraId: compra.id });

        log("Post-pago curso OK", { requestId, compraId: compra.id });
      } catch (e) {
        errLog("Error post-pago curso", e?.message || e, e);
      }

      return res.status(200).send("OK");
    }

    // 2) PAQUETE HORAS => email (y demás lógica interna del servicio si existe)
    if (compra.tipo_compra === "paquete_horas") {
      try {
        log("Post-pago paquete_horas init", { requestId, compraId: compra.id });
        await notifyPaqueteHorasAfterPaymentApproved({ compraId: compra.id });
        log("Post-pago paquete_horas OK", { requestId, compraId: compra.id });
      } catch (e) {
        errLog("Error post-pago paquete_horas", e?.message || e, e);
      }

      return res.status(200).send("OK");
    }

    // 3) CLASE PERSONALIZADA => crear sesion_clase (idempotente) + email
    if (compra.tipo_compra === "clase_personalizada") {
      try {
        log("Post-pago clase_personalizada init", { requestId, compraId: compra.id });

        const { data: sesionExist } = await supabase
          .from("sesion_clase")
          .select("id")
          .eq("compra_id", compra.id)
          .maybeSingle();

        if (sesionExist?.id) {
          log("Sesión ya existe, no se recrea", { requestId, sesionId: sesionExist.id });
          return res.status(200).send("OK");
        }

        const fechaHora = meta?.fecha_hora || null;
        const profesorId = meta?.profesor_id || null;
        const franjaIds = meta?.franja_horaria_ids || null;
        const descripcionEst = meta?.descripcion_estudiante || null;
        const documentoUrl = meta?.documento_url || null;

        if (!fechaHora || !profesorId || !Array.isArray(franjaIds) || franjaIds.length === 0) {
          warn("Metadata incompleta para crear sesion_clase", {
            requestId,
            compraId: compra.id,
            fechaHora,
            profesorId,
            franjaIds,
          });
          return res.status(200).send("OK");
        }

        const { data: sesionCreada, error: sesionError } = await supabase
          .from("sesion_clase")
          .insert({
            compra_id: compra.id,
            profesor_id: profesorId,
            descripcion_estudiante: descripcionEst,
            documento_url: documentoUrl,
            fecha_hora: new Date(fechaHora).toISOString(),
            link_meet: null,
            estado: "programada",
            franja_horaria_ids: franjaIds,
          })
          .select()
          .single();

        if (sesionError) {
          errLog("Error creando sesion_clase post-pago", sesionError);
          return res.status(200).send("OK");
        }

        await notifyClasePersonalizadaAfterSessionCreated({ sesionId: sesionCreada.id });

        log("Post-pago clase_personalizada OK", { requestId, sesionId: sesionCreada.id });
      } catch (e) {
        errLog("Error post-pago clase_personalizada", e?.message || e, e);
      }

      return res.status(200).send("OK");
    }

    log("Post-pago: tipo_compra no manejado", { requestId, tipo_compra: compra.tipo_compra });
    return res.status(200).send("OK");
  } catch (error) {
    errLog("Error webhook Wompi", error?.message || error, error);
    return res.status(200).send("OK");
  }
};
