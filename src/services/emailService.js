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
 * ✅ Envío robusto (sin duplicar):
 * - Normaliza email
 * - Reintenta SOLO si hay error real (throw / resp.error)
 * - Soporta respuesta { data, error }
 * - NO lanza error solo porque no venga id (evita reintentos innecesarios)
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
    html,
  };
  if (bccNorm) payload.bcc = bccNorm;

  let lastErr = null;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      if (EMAIL_DEBUG) {
        console.log('📤 Sending email (Resend)', {
          to: toNorm,
          subject,
          attempt,
          bcc: bccNorm || null,
        });
      }

      const resp = await resend.emails.send(payload);

      // Resend suele responder { data, error }
      if (resp?.error) {
        throw new Error(resp.error?.message || JSON.stringify(resp.error));
      }

      // id puede venir como resp.data.id (o resp.id según versión)
      const resendId = resp?.data?.id ?? resp?.id ?? null;

      if (EMAIL_DEBUG) {
        console.log('📨 Resend response', { to: toNorm, subject, resendId });
        if (!resendId) console.log('ℹ️ Resend raw response (no id)', resp);
      }

      // Importante: NO fallar si no hay id (para no duplicar por reintentos)
      return { resendId, to: toNorm };
    } catch (err) {
      lastErr = err;
      console.error('❌ Resend send failed', {
        to: toNorm,
        subject,
        attempt,
        error: err?.message || String(err),
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
      `),
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
      `),
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
      `),
    },
    2
  );
};

// ======================================
// Compra clase personalizada: Admin
// ======================================
export const sendCompraClasePersonalizadaAdminEmail = async ({
  adminEmail,
  compraId,
  montoTotal,
  profesor,
  estudiante,
}) => {
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
      `),
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
  estudiante,
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
      `),
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
  estudianteTimeZone,
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
      `),
    },
    2
  );
};

/**
 * ✅ Orquestador: consulta BD y envía a admin + profesor + estudiante.
 * Marca ok=true si NO hubo excepción (aunque resendId venga null).
 */
export const notifyClasePersonalizadaAfterSessionCreated = async ({ sesionId }) => {
  const result = {
    admin: { ok: false, error: null, to: null, resendId: null },
    profesor: { ok: false, error: null, to: null, resendId: null },
    estudiante: { ok: false, error: null, to: null, resendId: null },
  };

  const adminEmail = normalizeEmail(await getAdminEmail());

  // 1) Sesión
  const { data: sesion, error: errSesion } = await supabase
    .from('sesion_clase')
    .select('id,compra_id,profesor_id,fecha_hora')
    .eq('id', sesionId)
    .single();

  if (errSesion || !sesion?.id) {
    throw new Error(
      `notifyClasePersonalizadaAfterSessionCreated: sesion_clase no encontrada (${sesionId})`
    );
  }

  // 2) Compra
  const { data: compra, error: errCompra } = await supabase
    .from('compra')
    .select('id,estudiante_id,monto_total,mp_raw')
    .eq('id', sesion.compra_id)
    .single();

  if (errCompra || !compra?.id) {
    throw new Error(
      `notifyClasePersonalizadaAfterSessionCreated: compra no encontrada (${sesion.compra_id})`
    );
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
      errProf: errProf ? (errProf.message || String(errProf)) : null,
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
      estudiante,
    });

    result.admin = {
      ok: true,
      error: null,
      to: sent?.to ?? adminEmail,
      resendId: sent?.resendId ?? null,
    };
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
      estudiante,
    });

    result.profesor = {
      ok: true,
      error: null,
      to: sent?.to ?? profesorEmail,
      resendId: sent?.resendId ?? null,
    };
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
      estudianteTimeZone: estudianteTZ,
    });

    result.estudiante = {
      ok: true,
      error: null,
      to: sent?.to ?? estudianteEmail,
      resendId: sent?.resendId ?? null,
    };
  } catch (e) {
    result.estudiante.error = e?.message || String(e);
    result.estudiante.to = normalizeEmail(estudiante?.email);
    console.error('❌ notify: fallo estudiante', { sesionId, error: result.estudiante.error });
  }

  console.log('✅ notifyClasePersonalizadaAfterSessionCreated final', { sesionId, result });
  return result;
};
// =============================
// COMPRA CURSO (emails + orquestador)
// =============================

export const sendCompraCursoAdminEmail = async ({
  adminEmail,
  compraId,
  montoTotal,
  cursoNombre,
  profesor,
  estudiante,
}) => {
  if (!adminEmail) return null;

  return sendEmailStrict(
    {
      to: adminEmail,
      subject: `Compra de curso confirmada #${safe(compraId)}`,
      html: wrapHtml(`
        <h2>Nueva compra de curso ✅</h2>
        <p><strong>Compra ID:</strong> ${safe(compraId)}</p>
        <p><strong>Curso:</strong> ${safe(cursoNombre)}</p>
        <p><strong>Profesor:</strong> ${safe(profesor?.nombre)} ${safe(profesor?.apellido)} (${safe(profesor?.email)})</p>
        <p><strong>Monto:</strong> ${safe(montoTotal)} COP</p>
        <hr/>
        <h3>Datos del estudiante</h3>
        <p><strong>Nombre:</strong> ${safe(estudiante?.nombre)} ${safe(estudiante?.apellido)}</p>
        <p><strong>Email:</strong> ${safe(estudiante?.email)}</p>
        <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
        <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
      `),
    },
    2
  );
};

export const sendCompraCursoProfesorEmail = async ({
  profesorEmail,
  cursoNombre,
  compraId,
  estudiante,
}) => {
  if (!profesorEmail) return null;

  return sendEmailStrict(
    {
      to: profesorEmail,
      subject: `Nuevo estudiante - ${safe(cursoNombre)}`,
      html: wrapHtml(`
        <h2>Nuevo estudiante en tu curso ✅</h2>
        <p><strong>Curso:</strong> ${safe(cursoNombre)}</p>
        <p><strong>Compra ID:</strong> ${safe(compraId)}</p>
        <hr/>
        <h3>Datos del estudiante</h3>
        <p><strong>Nombre:</strong> ${safe(estudiante?.nombre)} ${safe(estudiante?.apellido)}</p>
        <p><strong>Email:</strong> ${safe(estudiante?.email)}</p>
        <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
        <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
      `),
    },
    2
  );
};

export const sendCompraCursoEstudianteEmail = async ({
  estudianteEmail,
  compraId,
  profesor,
  cursoNombre,
}) => {
  if (!estudianteEmail) return null;

  return sendEmailStrict(
    {
      to: estudianteEmail,
      subject: 'Tu compra de curso fue exitosa - Parche Académico',
      html: wrapHtml(`
        <h2>Compra exitosa ✅</h2>
        <p><strong>ID de tu compra:</strong> ${safe(compraId)}</p>
        <p>Gracias por adquirir tu curso pregrabado en Parche Académico.</p>
        <p><strong>Curso:</strong> ${safe(cursoNombre)}</p>
        <hr/>
        <h3>Datos del profesor</h3>
        <p><strong>Nombre:</strong> ${safe(profesor?.nombre)} ${safe(profesor?.apellido)}</p>
        <p><strong>Email:</strong> ${safe(profesor?.email)}</p>
        <p>Parche Académico</p>
      `),
    },
    2
  );
};

/**
 * ✅ Orquestador CURSO:
 * - Busca compra + curso + estudiante + profesor
 * - (Opcional pero recomendado) crea inscripcion_curso si no existe
 * - Envía correos a admin + profesor + estudiante
 */
export const notifyCompraCursoAfterPaymentApproved = async ({ compraId }) => {
  const result = {
    admin: { ok: false, error: null, to: null, resendId: null },
    profesor: { ok: false, error: null, to: null, resendId: null },
    estudiante: { ok: false, error: null, to: null, resendId: null },
  };

  // 1) Compra
  const { data: compra, error: errCompra } = await supabase
    .from('compra')
    .select('id,tipo_compra,estudiante_id,curso_id,monto_total,mp_raw')
    .eq('id', compraId)
    .single();

  if (errCompra || !compra?.id) {
    throw new Error(`notifyCompraCursoAfterPaymentApproved: compra no encontrada (${compraId})`);
  }
  if (compra.tipo_compra !== 'curso' || !compra.curso_id) {
    throw new Error(`notifyCompraCursoAfterPaymentApproved: compra no es de curso (${compraId})`);
  }

  // 2) Estudiante
  const { data: estudiante } = await supabase
    .from('usuario')
    .select('id,nombre,apellido,email,telefono,timezone')
    .eq('id', compra.estudiante_id)
    .single();

  // 3) Curso + profesor
  const { data: curso, error: errCurso } = await supabase
    .from('curso')
    .select('id,nombre,profesor:profesor_id(id,nombre,apellido,email)')
    .eq('id', compra.curso_id)
    .single();

  if (errCurso || !curso?.id) {
    throw new Error(`notifyCompraCursoAfterPaymentApproved: curso no encontrado (${compra.curso_id})`);
  }

  const profesor = curso?.profesor || null;

  // 4) Inscripción idempotente (para que el estudiante tenga acceso)
  try {
    const { data: inscExist } = await supabase
      .from('inscripcion_curso')
      .select('id')
      .eq('estudiante_id', compra.estudiante_id)
      .eq('curso_id', compra.curso_id)
      .maybeSingle();

    if (!inscExist?.id) {
      await supabase.from('inscripcion_curso').insert([
        {
          estudiante_id: compra.estudiante_id,
          curso_id: compra.curso_id,
          fecha_inscripcion: new Date().toISOString(),
        },
      ]);
    }
  } catch (e) {
    console.error('⚠️ No se pudo asegurar inscripcion_curso (se envían correos igual):', e?.message || e);
  }

  const adminEmail = normalizeEmail(await getAdminEmail());

  // 5) Envíos (secuencial, mismo estilo que clase personalizada)
  try {
    if (!adminEmail) throw new Error('ADMIN_EMAIL/ADMINEMAIL no configurado.');
    const sent = await sendCompraCursoAdminEmail({
      adminEmail,
      compraId: compra.id,
      montoTotal: compra.monto_total,
      cursoNombre: curso.nombre,
      profesor,
      estudiante,
    });
    result.admin = { ok: true, error: null, to: sent?.to ?? adminEmail, resendId: sent?.resendId ?? null };
  } catch (e) {
    result.admin.error = e?.message || String(e);
    result.admin.to = adminEmail;
  }

  try {
    const profesorEmail = normalizeEmail(profesor?.email);
    if (!profesorEmail) throw new Error('Profesor sin email en curso.profesor_id.');
    const sent = await sendCompraCursoProfesorEmail({
      profesorEmail,
      cursoNombre: curso.nombre,
      compraId: compra.id,
      estudiante,
    });
    result.profesor = { ok: true, error: null, to: sent?.to ?? profesorEmail, resendId: sent?.resendId ?? null };
  } catch (e) {
    result.profesor.error = e?.message || String(e);
    result.profesor.to = normalizeEmail(profesor?.email);
  }

  try {
    const estudianteEmail = normalizeEmail(estudiante?.email);
    if (!estudianteEmail) throw new Error('Estudiante sin email en BD.');
    const sent = await sendCompraCursoEstudianteEmail({
      estudianteEmail,
      compraId: compra.id,
      profesor,
      cursoNombre: curso.nombre,
    });
    result.estudiante = { ok: true, error: null, to: sent?.to ?? estudianteEmail, resendId: sent?.resendId ?? null };
  } catch (e) {
    result.estudiante.error = e?.message || String(e);
    result.estudiante.to = normalizeEmail(estudiante?.email);
  }

  console.log('✅ notifyCompraCursoAfterPaymentApproved final', { compraId: compra.id, result });
  return result;
};

// =============================
// PAQUETE HORAS (emails + orquestador)
// =============================

export const sendCompraPaqueteHorasAdminEmail = async ({
  adminEmail,
  compraId,
  montoTotal,
  cantidadHoras,
  asignaturaNombre,
  estudiante,
}) => {
  if (!adminEmail) return null;

  return sendEmailStrict(
    {
      to: adminEmail,
      subject: `Compra de paquete de horas confirmada #${safe(compraId)}`,
      html: wrapHtml(`
        <h2>Nueva compra de paquete de horas ✅</h2>
        <p><strong>Compra ID:</strong> ${safe(compraId)}</p>
        <p><strong>Horas compradas:</strong> ${safe(cantidadHoras)}</p>
        <p><strong>Asignatura:</strong> ${safe(asignaturaNombre)}</p>
        <p><strong>Monto:</strong> ${safe(montoTotal)} COP</p>
        <hr/>
        <h3>Datos del estudiante</h3>
        <p><strong>Nombre:</strong> ${safe(estudiante?.nombre)} ${safe(estudiante?.apellido)}</p>
        <p><strong>Email:</strong> ${safe(estudiante?.email)}</p>
        <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
        <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
      `),
    },
    2
  );
};

export const sendCompraPaqueteHorasEstudianteEmail = async ({
  estudianteEmail,
  compraId,
  montoTotal,
  cantidadHoras,
  asignaturaNombre,
}) => {
  if (!estudianteEmail) return null;

  return sendEmailStrict(
    {
      to: estudianteEmail,
      subject: 'Tu paquete de horas fue confirmado - Parche Académico',
      html: wrapHtml(`
        <h2>Compra exitosa ✅</h2>
        <p><strong>ID de tu compra:</strong> ${safe(compraId)}</p>
        <p><strong>Horas compradas:</strong> ${safe(cantidadHoras)}</p>
        <p><strong>Asignatura:</strong> ${safe(asignaturaNombre)}</p>
        <p><strong>Monto:</strong> ${safe(montoTotal)} COP</p>
        <p>Ya puedes agendar sesiones usando tus horas disponibles.</p>
        <p>Parche Académico</p>
      `),
    },
    2
  );
};

/**
 * ✅ Orquestador PAQUETE:
 * - Busca compra + estudiante + clase_personalizada(+asignatura)
 * - Envía correos a admin + estudiante
 */
export const notifyPaqueteHorasAfterPaymentApproved = async ({ compraId }) => {
  const result = {
    admin: { ok: false, error: null, to: null, resendId: null },
    estudiante: { ok: false, error: null, to: null, resendId: null },
  };

  // 1) Compra
  const { data: compra, error: errCompra } = await supabase
    .from('compra')
    .select('id,tipo_compra,estudiante_id,clase_personalizada_id,monto_total,horas_totales,mp_raw')
    .eq('id', compraId)
    .single();

  if (errCompra || !compra?.id) {
    throw new Error(`notifyPaqueteHorasAfterPaymentApproved: compra no encontrada (${compraId})`);
  }
  if (compra.tipo_compra !== 'paquete_horas') {
    throw new Error(`notifyPaqueteHorasAfterPaymentApproved: compra no es paquete_horas (${compraId})`);
  }

  // 2) Estudiante
  const { data: estudiante } = await supabase
    .from('usuario')
    .select('id,nombre,apellido,email,telefono,timezone')
    .eq('id', compra.estudiante_id)
    .single();

  // 3) Clase personalizada + asignatura (solo para mostrar nombre)
  let asignaturaNombre = 'Clase personalizada';
  try {
    if (compra.clase_personalizada_id) {
      const { data: clase } = await supabase
        .from('clase_personalizada')
        .select('id,asignatura:asignatura_id(id,nombre)')
        .eq('id', compra.clase_personalizada_id)
        .single();
      asignaturaNombre = clase?.asignatura?.nombre || asignaturaNombre;
    }
  } catch (e) {
    console.error('⚠️ No se pudo leer asignatura para paquete_horas:', e?.message || e);
  }

  const meta = compra?.mp_raw?.metadata || {};
  const cantidadHoras = Number(compra?.horas_totales ?? meta?.cantidad_horas ?? 0) || null;

  const adminEmail = normalizeEmail(await getAdminEmail());

  // 4) Envíos
  try {
    if (!adminEmail) throw new Error('ADMIN_EMAIL/ADMINEMAIL no configurado.');
    const sent = await sendCompraPaqueteHorasAdminEmail({
      adminEmail,
      compraId: compra.id,
      montoTotal: compra.monto_total,
      cantidadHoras,
      asignaturaNombre,
      estudiante,
    });
    result.admin = { ok: true, error: null, to: sent?.to ?? adminEmail, resendId: sent?.resendId ?? null };
  } catch (e) {
    result.admin.error = e?.message || String(e);
    result.admin.to = adminEmail;
  }

  try {
    const estudianteEmail = normalizeEmail(estudiante?.email);
    if (!estudianteEmail) throw new Error('Estudiante sin email en BD.');
    const sent = await sendCompraPaqueteHorasEstudianteEmail({
      estudianteEmail,
      compraId: compra.id,
      montoTotal: compra.monto_total,
      cantidadHoras,
      asignaturaNombre,
    });
    result.estudiante = { ok: true, error: null, to: sent?.to ?? estudianteEmail, resendId: sent?.resendId ?? null };
  } catch (e) {
    result.estudiante.error = e?.message || String(e);
    result.estudiante.to = normalizeEmail(estudiante?.email);
  }

  console.log('✅ notifyPaqueteHorasAfterPaymentApproved final', { compraId: compra.id, result });
  return result;
};
