// src/services/emailService.js

import { resend, EMAIL_FROM } from '../config/resend.js';
import { supabase } from '../config/supabase.js';
import { DateTime } from 'luxon';

const DEFAULT_TZ = 'America/Bogota';

export const getAdminEmail = async () => {
  // ✅ Soporta ambos nombres por si en prod lo tienes distinto
  if (process.env.ADMIN_EMAIL) return process.env.ADMIN_EMAIL;
  if (process.env.ADMINEMAIL) return process.env.ADMINEMAIL;

  const { data, error } = await supabase
    .from('usuario')
    .select('email')
    .eq('rol', 'administrador')
    .limit(1)
    .single();

  if (error) {
    console.error('Error getAdminEmail:', error);
    return null;
  }
  return data?.email || null;
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

// =====================
// 1) Bienvenida (CU-051)
// =====================
export const sendWelcomeEmail = async ({ to, nombre }) => {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
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
    });
  } catch (err) {
    console.error('Error sendWelcomeEmail:', err);
  }
};

// ============================================
// 2) Link Meet (CU-054) => SOLO estudiante
// ============================================
export const sendMeetLinkEmails = async ({ sesion, estudianteEmail, estudianteTimeZone }) => {
  try {
    if (!estudianteEmail) return;

    const when = formatDateTimeInTZ(sesion?.fecha_hora, estudianteTimeZone || DEFAULT_TZ);
    const link = sesion?.link_meet;

    await resend.emails.send({
      from: EMAIL_FROM,
      to: estudianteEmail,
      subject: 'Tu clase ya tiene link de Meet',
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>Link de tu clase listo ✅</h2>
          <p><strong>Fecha y hora:</strong> ${safe(when)}</p>
          <p><strong>Link Meet:</strong> <a href="${safe(link)}">${safe(link)}</a></p>
        </div>
      `
    });
  } catch (err) {
    console.error('Error sendMeetLinkEmails:', err);
  }
};

// ============================================
// 3) Credenciales profesor (CU-055)
// ============================================
export const sendCredencialesProfesorEmail = async ({ to, nombre, email, passwordTemp }) => {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
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
    });
  } catch (err) {
    console.error('Error sendCredencialesProfesorEmail:', err);
  }
};

// ===============================
// 4-6) Correos compra de CURSO
// ===============================
export const sendCompraCursoAdminEmail = async ({ adminEmail, compraId, montoTotal, cursoNombre, profesor, estudiante }) => {
  try {
    if (!adminEmail) return;

    await resend.emails.send({
      from: EMAIL_FROM,
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
          <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
          <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
        </div>
      `
    });
  } catch (err) {
    console.error('Error sendCompraCursoAdminEmail:', err);
  }
};

export const sendCompraCursoProfesorEmail = async ({ profesorEmail, cursoNombre, compraId, estudiante }) => {
  try {
    if (!profesorEmail) return;

    await resend.emails.send({
      from: EMAIL_FROM,
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
          <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
          <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
        </div>
      `
    });
  } catch (err) {
    console.error('Error sendCompraCursoProfesorEmail:', err);
  }
};

export const sendCompraCursoEstudianteEmail = async ({ estudianteEmail, compraId, profesor, cursoNombre }) => {
  try {
    if (!estudianteEmail) return;

    await resend.emails.send({
      from: EMAIL_FROM,
      to: estudianteEmail,
      subject: 'Tu compra de curso fue exitosa - Parche Académico',
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>Compra exitosa ✅</h2>
          <p><strong>ID de tu compra:</strong> ${safe(compraId)}</p>
          <p>Tu compra fue confirmada.</p>
          <p><strong>Curso:</strong> ${safe(cursoNombre)}</p>

          <hr/>
          <h3>Datos del profesor</h3>
          <p><strong>Nombre:</strong> ${safe(profesor?.nombre)} ${safe(profesor?.apellido)}</p>
          <p><strong>Email:</strong> ${safe(profesor?.email)}</p>

          <p>Parche Académico</p>
        </div>
      `
    });
  } catch (err) {
    console.error('Error sendCompraCursoEstudianteEmail:', err);
  }
};

// ======================================
// 7-9) Correos compra CLASE PERSONALIZADA
// ======================================
export const sendCompraClasePersonalizadaAdminEmail = async ({ adminEmail, compraId, montoTotal, profesor, estudiante }) => {
  try {
    if (!adminEmail) return;

    await resend.emails.send({
      from: EMAIL_FROM,
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
          <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
          <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
        </div>
      `
    });
  } catch (err) {
    console.error('Error sendCompraClasePersonalizadaAdminEmail:', err);
  }
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
  try {
    if (!profesorEmail) return;

    const whenProfesor = formatDateTimeInTZ(fechaHoraIso, profesorTimeZone || DEFAULT_TZ);

    await resend.emails.send({
      from: EMAIL_FROM,
      to: profesorEmail,
      subject: 'Nueva clase personalizada asignada - Parche Académico',
      html: `
        <div style="font-family:Arial;line-height:1.6">
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
          <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
          <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
        </div>
      `
    });
  } catch (err) {
    console.error('Error sendCompraClasePersonalizadaProfesorEmail:', err);
  }
};

export const sendCompraClasePersonalizadaEstudianteEmail = async ({ estudianteEmail, compraId, profesor }) => {
  try {
    if (!estudianteEmail) return;

    await resend.emails.send({
      from: EMAIL_FROM,
      to: estudianteEmail,
      subject: 'Tu clase personalizada fue confirmada - Parche Académico',
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>Compra exitosa ✅</h2>
          <p><strong>ID de tu compra:</strong> ${safe(compraId)}</p>
          <p>Tu compra fue confirmada.</p>
          <p>Pronto será enviado tu link de Meet para dicha clase.</p>

          <hr/>
          <h3>Profesor asignado</h3>
          <p><strong>Nombre:</strong> ${safe(profesor?.nombre)} ${safe(profesor?.apellido)}</p>
          <p><strong>Email:</strong> ${safe(profesor?.email)}</p>

          <p>Parche Académico</p>
        </div>
      `
    });
  } catch (err) {
    console.error('Error sendCompraClasePersonalizadaEstudianteEmail:', err);
  }
};

// ================================
// 10-11) Correos PAQUETE DE HORAS
// ================================
export const sendCompraPaqueteHorasAdminEmail = async ({ adminEmail, compraId, montoTotal, horasCompradas, estudiante }) => {
  try {
    if (!adminEmail) return;

    await resend.emails.send({
      from: EMAIL_FROM,
      to: adminEmail,
      subject: `Compra paquete de horas confirmada #${safe(compraId)}`,
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>Nueva compra de paquete de horas ✅</h2>
          <p><strong>Compra ID:</strong> ${safe(compraId)}</p>
          <p><strong>Horas compradas:</strong> ${safe(horasCompradas)}</p>
          <p><strong>Monto:</strong> ${safe(montoTotal)} COP</p>

          <hr/>
          <h3>Datos del estudiante</h3>
          <p><strong>Nombre:</strong> ${safe(estudiante?.nombre)} ${safe(estudiante?.apellido)}</p>
          <p><strong>Email:</strong> ${safe(estudiante?.email)}</p>
          <p><strong>Timezone:</strong> ${safe(estudiante?.timezone)}</p>
          <p><strong>Teléfono:</strong> ${safe(estudiante?.telefono)}</p>
        </div>
      `
    });
  } catch (err) {
    console.error('Error sendCompraPaqueteHorasAdminEmail:', err);
  }
};

export const sendCompraPaqueteHorasEstudianteEmail = async ({ estudianteEmail, compraId, horasCompradas }) => {
  try {
    if (!estudianteEmail) return;

    await resend.emails.send({
      from: EMAIL_FROM,
      to: estudianteEmail,
      subject: 'Tu compra de paquete de horas fue exitosa - Parche Académico',
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>Compra exitosa ✅</h2>
          <p><strong>ID de tu compra:</strong> ${safe(compraId)}</p>
          <p><strong>Horas compradas:</strong> ${safe(horasCompradas)}</p>
          <p>Parche Académico</p>
        </div>
      `
    });
  } catch (err) {
    console.error('Error sendCompraPaqueteHorasEstudianteEmail:', err);
  }
};
