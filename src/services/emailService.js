// src/services/emailService.js

import { resend, EMAIL_FROM } from '../config/resend.js';
import { supabase } from '../config/supabase.js';
import { DateTime } from 'luxon';

const DEFAULT_TZ = 'America/Bogota';

export const getAdminEmail = async () => {
  // ✅ Prioridad: variables de entorno (como lo quieres)
  return process.env.ADMIN_EMAIL || process.env.ADMINEMAIL || null;
};

const safe = (v) => (v === null || v === undefined ? '' : String(v));

const formatDateTimeInTZ = (isoString, timeZone) => {
  try {
    const tz = timeZone || DEFAULT_TZ;
    const dt = DateTime.fromISO(isoString, { zone: 'utc' }).setZone(tz);
    if (!dt.isValid) return isoString;
    return dt.toFormat('dd/MM/yyyy HH:mm') + ` (${tz})`;
  } catch {
    return isoString;
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sendEmailWithRetry = async ({ to, subject, html }, retries = 2) => {
  let lastErr = null;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const resp = await resend.emails.send({
        from: EMAIL_FROM,
        to,
        subject,
        html
      });
      return resp;
    } catch (err) {
      lastErr = err;
      console.error('❌ Error enviando email (Resend)', { to, subject, attempt, error: err?.message || err });
      if (attempt <= retries) await sleep(400 * attempt);
    }
  }

  throw lastErr;
};

// =====================
// 1) Bienvenida (CU-051)
// =====================
export const sendWelcomeEmail = async ({ to, nombre }) => {
  // ✅ IMPORTANTE: aquí ya NO se “traga” el error
  return sendEmailWithRetry(
    {
      to,
      subject: '¡Bienvenido a Parche Académico!',
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <p>Hola ${safe(nombre)},</p>
          <p><strong>Te damos la bienvenida a Parche Académico.</strong><br/>
          Un espacio pensado para ayudarte con matemáticas, física, química e inglés, de forma clara y sencilla.</p>

          <p>✔ Clases personalizadas<br/>
          ✔ Asesorías<br/>
          ✔ Ejercicios y trabajos resueltos<br/>
          ✔ Modalidad online</p>

          <p>👉 Revisa el contenido disponible y no dudes en escribir si necesitas apoyo.</p>
          <p>Parche Académico</p>
        </div>
      `
    },
    1
  );
};

// ============================================
// 2) Link Meet (CU-054) => SOLO estudiante
// ============================================
export const sendMeetLinkEmails = async ({ sesion, estudianteEmail, estudianteTimeZone }) => {
  if (!estudianteEmail) return null;

  const when = formatDateTimeInTZ(sesion?.fecha_hora, estudianteTimeZone || DEFAULT_TZ);
  const link = sesion?.link_meet;

  return sendEmailWithRetry(
    {
      to: estudianteEmail,
      subject: 'Tu clase ya tiene link de Meet',
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>Link de tu clase listo ✅</h2>
          <p><strong>Fecha y hora:</strong> ${safe(when)}</p>
          <p><strong>Link Meet:</strong> <a href="${safe(link)}">${safe(link)}</a></p>
        </div>
      `
    },
    2
  );
};

// ============================================
// 3) Credenciales profesor (CU-055)
// ============================================
export const sendCredencialesProfesorEmail = async ({ to, nombre, email, passwordTemp }) => {
  return sendEmailWithRetry(
    {
      to,
      subject: 'Credenciales de profesor - Parche Académico',
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>Cuenta de profesor creada ✅</h2>
          <p><strong>Nombre:</strong> ${safe(nombre)}</p>
          <p><strong>Email:</strong> ${safe(email)}</p>
          <p><strong>Contraseña temporal:</strong> ${safe(passwordTemp)}</p>
        </div>
      `
    },
    2
  );
};

// ===============================
// 4-6) Correos compra de CURSO
// ===============================
export const sendCompraCursoAdminEmail = async ({ adminEmail, compraId, montoTotal, cursoNombre, profesor, estudiante }) => {
  if (!adminEmail) return null;

  return sendEmailWithRetry(
    {
      to: adminEmail,
      subject: `Compra de curso confirmada #${safe(compraId)}`,
      html: `
        <div style="font-family:Arial;line-height:1.6">
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
        </div>
      `
    },
    2
  );
};

export const sendCompraCursoProfesorEmail = async ({ profesorEmail, cursoNombre, compraId, estudiante }) => {
  if (!profesorEmail) return null;

  return sendEmailWithRetry(
    {
      to: profesorEmail,
      subject: `Nuevo estudiante - ${safe(cursoNombre)}`,
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>Nuevo estudiante en tu curso ✅</h2>
          <p><strong>Curso:</strong> ${safe(cursoNombre)}</p>
          <p><strong>Compra ID:</strong> ${safe(compraId)}</p>

          <hr/>
          <h3>Datos del estudiante</h3>
          <p><strong>Nombre:</strong> ${safe(estudiante?.nombre)} ${safe(estudiante?.apellido)}</p>
          <p><strong>Email:</strong> ${safe(estudiante?.email)}</p>
          <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
          <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
        </div>
      `
    },
    2
  );
};

export const sendCompraCursoEstudianteEmail = async ({ estudianteEmail, compraId, profesor, cursoNombre }) => {
  if (!estudianteEmail) return null;

  return sendEmailWithRetry(
    {
      to: estudianteEmail,
      subject: 'Tu compra de curso fue exitosa - Parche Académico',
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>Compra exitosa ✅</h2>
          <p><strong>ID de tu compra:</strong> ${safe(compraId)}</p>
          <p>Gracias por adquirir tu curso pregrabado en Parche Académico.</p>
          <p><strong>Curso:</strong> ${safe(cursoNombre)}</p>

          <hr/>
          <h3>Datos del profesor</h3>
          <p><strong>Nombre:</strong> ${safe(profesor?.nombre)} ${safe(profesor?.apellido)}</p>
          <p><strong>Email:</strong> ${safe(profesor?.email)}</p>

          <p>Parche Académico</p>
        </div>
      `
    },
    2
  );
};

// ======================================
// 7-9) Correos compra CLASE PERSONALIZADA
// ======================================
export const sendCompraClasePersonalizadaAdminEmail = async ({ adminEmail, compraId, montoTotal, profesor, estudiante }) => {
  if (!adminEmail) return null;

  return sendEmailWithRetry(
    {
      to: adminEmail,
      subject: `Compra clase personalizada confirmada #${safe(compraId)}`,
      html: `
        <div style="font-family:Arial;line-height:1.6">
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
        </div>
      `
    },
    2
  );
};

export const sendCompraClasePersonalizadaProfesorEmail = async ({
  profesorEmail,
  compraId,
  asignaturaNombre,
  fechaHoraIso,
  duracionHoras,
  profesorTimeZone,
  estudiante
}) => {
  if (!profesorEmail) return null;

  const whenProfesor = fechaHoraIso ? formatDateTimeInTZ(fechaHoraIso, profesorTimeZone || DEFAULT_TZ) : '';

  return sendEmailWithRetry(
    {
      to: profesorEmail,
      subject: 'Nueva clase personalizada asignada - Parche Académico',
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>Clase personalizada asignada ✅</h2>
          <p><strong>Compra ID:</strong> ${safe(compraId)}</p>
          <p><strong>Materia:</strong> ${safe(asignaturaNombre)}</p>
          ${whenProfesor ? `<p><strong>Fecha y hora (tu zona):</strong> ${safe(whenProfesor)}</p>` : ''}
          <p><strong>Duración:</strong> ${safe(duracionHoras)} hora(s)</p>
          <p>👉 Por favor crea el link de Google Meet y regístralo en el sistema.</p>

          <hr/>
          <h3>Datos del estudiante</h3>
          <p><strong>Nombre:</strong> ${safe(estudiante?.nombre)} ${safe(estudiante?.apellido)}</p>
          <p><strong>Email:</strong> ${safe(estudiante?.email)}</p>
          <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
          <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
        </div>
      `
    },
    2
  );
};

export const sendCompraClasePersonalizadaEstudianteEmail = async ({ estudianteEmail, compraId, profesor, fechaHoraIso, estudianteTimeZone }) => {
  if (!estudianteEmail) return null;

  const whenEst = fechaHoraIso ? formatDateTimeInTZ(fechaHoraIso, estudianteTimeZone || DEFAULT_TZ) : '';

  return sendEmailWithRetry(
    {
      to: estudianteEmail,
      subject: 'Tu clase personalizada fue confirmada - Parche Académico',
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>Compra exitosa ✅</h2>
          <p><strong>ID de tu compra:</strong> ${safe(compraId)}</p>
          ${whenEst ? `<p><strong>Fecha y hora:</strong> ${safe(whenEst)}</p>` : ''}

          <p>Tu clase personalizada ya está lista.</p>
          <p>Pronto será enviado tu link de Meet para dicha clase.</p>

          <hr/>
          <h3>Profesor asignado</h3>
          <p><strong>Nombre:</strong> ${safe(profesor?.nombre)} ${safe(profesor?.apellido)}</p>
          <p><strong>Email:</strong> ${safe(profesor?.email)}</p>

          <p>Parche Académico</p>
        </div>
      `
    },
    2
  );
};

/**
 * ✅ NUEVA FUNCIÓN ÚNICA (la que vas a llamar desde el controller)
 * SOLO requiere sesionId. El emailService consulta todo en BD.
 */
export const notifyClasePersonalizadaAfterSessionCreated = async ({ sesionId }) => {
  const adminEmail = await getAdminEmail();

  const result = {
    admin: { ok: false, error: null },
    profesor: { ok: false, error: null },
    estudiante: { ok: false, error: null }
  };

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
  const { data: estudiante } = await supabase
    .from('usuario')
    .select('id,nombre,apellido,email,telefono,timezone')
    .eq('id', compra.estudiante_id)
    .single();

  const { data: profesor } = await supabase
    .from('usuario')
    .select('id,nombre,apellido,email,timezone')
    .eq('id', sesion.profesor_id)
    .single();

  // 4) Metadata
  const meta = compra?.mp_raw?.metadata || {};
  const asignaturaNombre = meta?.asignatura_nombre || 'Clase personalizada';
  const duracionHoras = meta?.duracion_horas ?? null;
  const fechaHoraIso = meta?.fecha_hora || sesion?.fecha_hora || null;

  const profesorTZ = meta?.profesor_timezone || profesor?.timezone || DEFAULT_TZ;
  const estudianteTZ = meta?.estudiante_timezone || estudiante?.timezone || DEFAULT_TZ;

  // 5) Envíos (cada uno con su propio try/catch)
  try {
    if (!adminEmail) throw new Error('ADMIN_EMAIL/ADMINEMAIL no configurado.');
    await sendCompraClasePersonalizadaAdminEmail({
      adminEmail,
      compraId: compra.id,
      montoTotal: compra.monto_total,
      profesor,
      estudiante
    });
    result.admin.ok = true;
  } catch (e) {
    result.admin.ok = false;
    result.admin.error = e?.message || String(e);
    console.error('❌ notifyClasePersonalizadaAfterSessionCreated: fallo admin', { sesionId, error: result.admin.error });
  }

  try {
    if (!profesor?.email) throw new Error('Profesor sin email en BD.');
    await sendCompraClasePersonalizadaProfesorEmail({
      profesorEmail: profesor.email,
      compraId: compra.id,
      asignaturaNombre,
      fechaHoraIso,
      duracionHoras,
      profesorTimeZone: profesorTZ,
      estudiante
    });
    result.profesor.ok = true;
  } catch (e) {
    result.profesor.ok = false;
    result.profesor.error = e?.message || String(e);
    console.error('❌ notifyClasePersonalizadaAfterSessionCreated: fallo profesor', { sesionId, error: result.profesor.error });
  }

  try {
    if (!estudiante?.email) throw new Error('Estudiante sin email en BD.');
    await sendCompraClasePersonalizadaEstudianteEmail({
      estudianteEmail: estudiante.email,
      compraId: compra.id,
      profesor,
      fechaHoraIso,
      estudianteTimeZone: estudianteTZ
    });
    result.estudiante.ok = true;
  } catch (e) {
    result.estudiante.ok = false;
    result.estudiante.error = e?.message || String(e);
    console.error('❌ notifyClasePersonalizadaAfterSessionCreated: fallo estudiante', { sesionId, error: result.estudiante.error });
  }

  return result;
};
