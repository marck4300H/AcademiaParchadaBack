// src/services/emailService.js

import { resend, EMAIL_FROM } from '../config/resend.js';
import { supabase } from '../config/supabase.js';
import { DateTime } from 'luxon';

const DEFAULT_TZ = 'America/Bogota';
const EMAIL_DEBUG = String(process.env.EMAIL_DEBUG || '').toLowerCase() === 'true';

// Admin por ENV (como lo quieres)
export const getAdminEmail = async () => {
  return (process.env.ADMIN_EMAIL || process.env.ADMINEMAIL || '').trim() || null;
};

const safe = (v) => (v === null || v === undefined ? '' : String(v));

const normalizeEmail = (email) => {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  return e.length ? e : null;
};

const isEmailLike = (email) => {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const formatDateTimeInTZ = (isoString, timeZone) => {
  try {
    if (!isoString) return '';
    const tz = timeZone || DEFAULT_TZ;
    const dt = DateTime.fromISO(isoString, { zone: 'utc' }).setZone(tz);
    if (!dt.isValid) return isoString;
    return dt.toFormat('dd/MM/yyyy HH:mm') + ` (${tz})`;
  } catch {
    return isoString;
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ✅ Envío estricto:
 * - Normaliza email
 * - Reintenta
 * - Lanza error si Resend falla
 * - Lanza error si Resend no retorna id (para que NO marque ok=true falso)
 */
const sendEmailStrict = async ({ to, subject, html, bcc = null }, retries = 2) => {
  const toNorm = normalizeEmail(to);
  const bccNorm = normalizeEmail(bcc);

  if (!toNorm || !isEmailLike(toNorm)) {
    throw new Error(`Email inválido: "${safe(to)}"`);
  }
  if (bccNorm && !isEmailLike(bccNorm)) {
    throw new Error(`BCC inválido: "${safe(bcc)}"`);
  }

  const payload = {
    from: EMAIL_FROM,
    to: toNorm,
    subject,
    html
  };
  if (bccNorm) payload.bcc = bccNorm;

  let lastErr = null;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      if (EMAIL_DEBUG) {
        console.log('📤 Sending email (Resend)', { to: toNorm, subject, attempt, bcc: bccNorm || null });
      }

      const resp = await resend.emails.send(payload);
      const resendId = resp?.id || null;

      if (EMAIL_DEBUG) {
        console.log('📨 Resend response', { to: toNorm, subject, resendId });
      }

      if (!resendId) {
        throw new Error('Resend no retornó id; no se puede confirmar envío.');
      }

      return { resendId, to: toNorm };
    } catch (err) {
      lastErr = err;
      console.error('❌ Resend send failed', {
        to: toNorm,
        subject,
        attempt,
        error: err?.message || String(err)
      });
      if (attempt <= retries) await sleep(350 * attempt);
    }
  }

  throw lastErr;
};

const wrapHtml = (inner) => `
  <div style="font-family:Arial;line-height:1.6">
    ${inner}
  </div>
`;

// =====================
// Bienvenida (CU-051)
// =====================
export const sendWelcomeEmail = async ({ to, nombre }) => {
  return sendEmailStrict(
    {
      to,
      subject: '¡Bienvenido a Parche Académico!',
      html: wrapHtml(`
        <p>Hola ${safe(nombre)},</p>
        <p><strong>Te damos la bienvenida a Parche Académico.</strong></p>
        <p>Un espacio pensado para ayudarte con matemáticas, física, química e inglés, de forma clara y sencilla.</p>
        <p>✔ Clases personalizadas<br/>✔ Asesorías<br/>✔ Ejercicios y trabajos resueltos<br/>✔ Modalidad online</p>
        <p>👉 Revisa el contenido disponible y no dudes en escribir si necesitas apoyo.</p>
        <p>Parche Académico</p>
      `)
    },
    1
  );
};

// ============================================
// Link Meet (CU-054) => SOLO estudiante
// ============================================
export const sendMeetLinkEmails = async ({ sesion, estudianteEmail, estudianteTimeZone }) => {
  const when = formatDateTimeInTZ(sesion?.fecha_hora, estudianteTimeZone || DEFAULT_TZ);
  const link = sesion?.link_meet;

  return sendEmailStrict(
    {
      to: estudianteEmail,
      subject: 'Tu clase ya tiene link de Meet',
      html: wrapHtml(`
        <h2>Link de tu clase listo ✅</h2>
        <p><strong>Fecha y hora:</strong> ${safe(when)}</p>
        <p><strong>Link Meet:</strong> <a href="${safe(link)}">${safe(link)}</a></p>
      `)
    },
    2
  );
};

// ============================================
// Credenciales profesor (CU-055)
// ============================================
export const sendCredencialesProfesorEmail = async ({ to, nombre, email, passwordTemp }) => {
  return sendEmailStrict(
    {
      to,
      subject: 'Credenciales de profesor - Parche Académico',
      html: wrapHtml(`
        <h2>Cuenta de profesor creada ✅</h2>
        <p><strong>Nombre:</strong> ${safe(nombre)}</p>
        <p><strong>Email:</strong> ${safe(email)}</p>
        <p><strong>Contraseña temporal:</strong> ${safe(passwordTemp)}</p>
      `)
    },
    2
  );
};

// ======================================
// Compra clase personalizada: Admin
// ======================================
export const sendCompraClasePersonalizadaAdminEmail = async ({ adminEmail, compraId, montoTotal, profesor, estudiante }) => {
  return sendEmailStrict(
    {
      to: adminEmail,
      subject: `Compra clase personalizada confirmada #${safe(compraId)}`,
      html: wrapHtml(`
        <h2>Nueva compra de clase personalizada ✅</h2>
        <p><strong>Compra ID:</strong> ${safe(compraId)}</p>
        <p><strong>Profesor asignado:</strong> ${safe(profesor?.nombre)} ${safe(profesor?.apellido)} (${safe(profesor?.email)})</p>
        <p><strong>Monto:</strong> ${safe(montoTotal)} COP</p>
        <hr/>
        <h3>Datos del estudiante</h3>
        <p><strong>Nombre:</strong> ${safe(estudiante?.nombre)} ${safe(estudiante?.apellido)}</p>
        <p><strong>Email:</strong> ${safe(estudiante?.email)}</p>
        <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
        <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
      `)
    },
    2
  );
};

// ======================================
// Compra clase personalizada: Profesor
// ======================================
export const sendCompraClasePersonalizadaProfesorEmail = async ({
  profesorEmail,
  compraId,
  asignaturaNombre,
  fechaHoraIso,
  duracionHoras,
  profesorTimeZone,
  estudiante
}) => {
  const whenProfesor = formatDateTimeInTZ(fechaHoraIso, profesorTimeZone || DEFAULT_TZ);

  return sendEmailStrict(
    {
      to: profesorEmail,
      subject: 'Nueva clase personalizada asignada - Parche Académico',
      html: wrapHtml(`
        <h2>Clase personalizada asignada ✅</h2>
        <p><strong>Compra ID:</strong> ${safe(compraId)}</p>
        <p><strong>Materia:</strong> ${safe(asignaturaNombre)}</p>
        <p><strong>Fecha y hora (tu zona):</strong> ${safe(whenProfesor)}</p>
        <p><strong>Duración:</strong> ${safe(duracionHoras)} hora(s)</p>
        <p>👉 Por favor crea el link de Google Meet y regístralo en el sistema.</p>
        <hr/>
        <h3>Datos del estudiante</h3>
        <p><strong>Nombre:</strong> ${safe(estudiante?.nombre)} ${safe(estudiante?.apellido)}</p>
        <p><strong>Email:</strong> ${safe(estudiante?.email)}</p>
        <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
        <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
      `)
    },
    2
  );
};

// ======================================
// Compra clase personalizada: Estudiante
// ======================================
export const sendCompraClasePersonalizadaEstudianteEmail = async ({
  estudianteEmail,
  compraId,
  profesor,
  fechaHoraIso,
  estudianteTimeZone
}) => {
  const whenEst = formatDateTimeInTZ(fechaHoraIso, estudianteTimeZone || DEFAULT_TZ);

  return sendEmailStrict(
    {
      to: estudianteEmail,
      subject: 'Tu clase personalizada fue confirmada - Parche Académico',
      html: wrapHtml(`
        <h2>Compra exitosa ✅</h2>
        <p><strong>ID de tu compra:</strong> ${safe(compraId)}</p>
        <p><strong>Fecha y hora:</strong> ${safe(whenEst)}</p>
        <p>Tu clase personalizada ya está lista.</p>
        <p>Pronto será enviado tu link de Meet para dicha clase.</p>
        <hr/>
        <h3>Profesor asignado</h3>
        <p><strong>Nombre:</strong> ${safe(profesor?.nombre)} ${safe(profesor?.apellido)}</p>
        <p><strong>Email:</strong> ${safe(profesor?.email)}</p>
        <p>Parche Académico</p>
      `)
    },
    2
  );
};

/**
 * ✅ Orquestador: consulta BD y envía a admin + profesor + estudiante.
 * SOLO marca ok=true si hay resendId.
 */
export const notifyClasePersonalizadaAfterSessionCreated = async ({ sesionId }) => {
  const result = {
    admin: { ok: false, error: null, to: null, resendId: null },
    profesor: { ok: false, error: null, to: null, resendId: null },
    estudiante: { ok: false, error: null, to: null, resendId: null }
  };

  const adminEmail = normalizeEmail(await getAdminEmail());

  // 1) Sesión
  const { data: sesion, error: errSesion } = await supabase
    .from('sesion_clase')
    .select('id,compra_id,profesor_id,fecha_hora')
    .eq('id', sesionId)
    .single();

  if (errSesion || !sesion?.id) {
    throw new Error(`notifyClasePersonalizadaAfterSessionCreated: sesion_clase no encontrada (${sesionId})`);
  }

  // 2) Compra
  const { data: compra, error: errCompra } = await supabase
    .from('compra')
    .select('id,estudiante_id,monto_total,mp_raw')
    .eq('id', sesion.compra_id)
    .single();

  if (errCompra || !compra?.id) {
    throw new Error(`notifyClasePersonalizadaAfterSessionCreated: compra no encontrada (${sesion.compra_id})`);
  }

  // 3) Usuarios
  const { data: estudiante, error: errEst } = await supabase
    .from('usuario')
    .select('id,nombre,apellido,email,telefono,timezone')
    .eq('id', compra.estudiante_id)
    .single();

  const { data: profesor, error: errProf } = await supabase
    .from('usuario')
    .select('id,nombre,apellido,email,timezone')
    .eq('id', sesion.profesor_id)
    .single();

  if (EMAIL_DEBUG) {
    console.log('🧾 notify debug (BD fetch)', {
      sesionId,
      compraId: compra.id,
      adminEmail,
      profesorEmail: normalizeEmail(profesor?.email),
      estudianteEmail: normalizeEmail(estudiante?.email),
      errEst: errEst ? (errEst.message || String(errEst)) : null,
      errProf: errProf ? (errProf.message || String(errProf)) : null
    });
  }

  // 4) Metadata
  const meta = compra?.mp_raw?.metadata || {};
  const asignaturaNombre = meta?.asignatura_nombre || 'Clase personalizada';
  const duracionHoras = meta?.duracion_horas ?? null;
  const fechaHoraIso = meta?.fecha_hora || sesion?.fecha_hora || null;

  const profesorTZ = meta?.profesor_timezone || profesor?.timezone || DEFAULT_TZ;
  const estudianteTZ = meta?.estudiante_timezone || estudiante?.timezone || DEFAULT_TZ;

  // 5) Enviar (secuencial para logs claros)
  try {
    if (!adminEmail) throw new Error('ADMIN_EMAIL/ADMINEMAIL no configurado.');
    const sent = await sendCompraClasePersonalizadaAdminEmail({
      adminEmail,
      compraId: compra.id,
      montoTotal: compra.monto_total,
      profesor,
      estudiante
    });
    result.admin = { ok: true, error: null, to: sent.to, resendId: sent.resendId };
  } catch (e) {
    result.admin.error = e?.message || String(e);
    result.admin.to = adminEmail;
    console.error('❌ notify: fallo admin', { sesionId, error: result.admin.error });
  }

  try {
    const profesorEmail = normalizeEmail(profesor?.email);
    if (!profesorEmail) throw new Error('Profesor sin email en BD (o vino null en query).');

    const sent = await sendCompraClasePersonalizadaProfesorEmail({
      profesorEmail,
      compraId: compra.id,
      asignaturaNombre,
      fechaHoraIso,
      duracionHoras,
      profesorTimeZone: profesorTZ,
      estudiante
    });
    result.profesor = { ok: true, error: null, to: sent.to, resendId: sent.resendId };
  } catch (e) {
    result.profesor.error = e?.message || String(e);
    result.profesor.to = normalizeEmail(profesor?.email);
    console.error('❌ notify: fallo profesor', { sesionId, error: result.profesor.error });
  }

  try {
    const estudianteEmail = normalizeEmail(estudiante?.email);
    if (!estudianteEmail) throw new Error('Estudiante sin email en BD (o vino null en query).');

    const sent = await sendCompraClasePersonalizadaEstudianteEmail({
      estudianteEmail,
      compraId: compra.id,
      profesor,
      fechaHoraIso,
      estudianteTimeZone: estudianteTZ
    });
    result.estudiante = { ok: true, error: null, to: sent.to, resendId: sent.resendId };
  } catch (e) {
    result.estudiante.error = e?.message || String(e);
    result.estudiante.to = normalizeEmail(estudiante?.email);
    console.error('❌ notify: fallo estudiante', { sesionId, error: result.estudiante.error });
  }

  // Log final siempre
  console.log('✅ notifyClasePersonalizadaAfterSessionCreated final', { sesionId, result });

  return result;
};
