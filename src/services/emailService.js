// src/services/emailService.js
import { resend, EMAIL_FROM } from '../config/resend.js';
import { supabase } from '../config/supabase.js';

const formatDateTimeCO = (isoString) => {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  } catch {
    return isoString;
  }
};

export const getAdminEmail = async () => {
  if (process.env.ADMIN_EMAIL) return process.env.ADMIN_EMAIL;

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

// CU-051
export const sendWelcomeEmail = async ({ to, nombre }) => {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: '¡Bienvenido a Academia Parchada!',
      html: `
        <h1>¡Hola ${nombre}!</h1>
        <p>Bienvenido a <strong>Academia Parchada</strong>.</p>
        <p>Tu cuenta fue creada exitosamente.</p>
      `
    });
  } catch (err) {
    console.error('Error sendWelcomeEmail:', err);
  }
};

// CU-052 (compra exitosa) - versión mínima alineada a tu mensaje
export const sendCompraExitosaEmails = async ({ compra, estudianteEmail, profesorEmail, profesorNombre, tipo, detalle }) => {
  try {
    const adminEmail = await getAdminEmail();

    const htmlEstudiante = `
      <h2>Compra exitosa</h2>
      <p>Tu compra fue confirmada exitosamente.</p>
      <p><strong>Tipo:</strong> ${tipo}</p>
      ${detalle ? `<p>${detalle}</p>` : ''}
      <p>Pronto recibirás un correo con el link de tu clase (si aplica).</p>
    `;

    const htmlAdmin = `
      <h2>Nueva compra confirmada</h2>
      <p><strong>Compra:</strong> ${compra?.id}</p>
      <p><strong>Tipo:</strong> ${tipo}</p>
      ${profesorNombre ? `<p><strong>Profesor asignado:</strong> ${profesorNombre}</p>` : ''}
      ${detalle ? `<p>${detalle}</p>` : ''}
    `;

    const htmlProfesor = `
      <h2>Tienes una clase asignada</h2>
      <p>Se te asignó una sesión. Por favor crea el link de Google Meet y regístralo en el sistema.</p>
      ${detalle ? `<p>${detalle}</p>` : ''}
    `;

    const tasks = [];

    if (estudianteEmail) {
      tasks.push(resend.emails.send({
        from: EMAIL_FROM,
        to: estudianteEmail,
        subject: 'Compra confirmada - Academia Parchada',
        html: htmlEstudiante
      }));
    }

    if (adminEmail) {
      tasks.push(resend.emails.send({
        from: EMAIL_FROM,
        to: adminEmail,
        subject: `Compra confirmada #${compra?.id || ''}`,
        html: htmlAdmin
      }));
    }

    // Solo enviar al profesor si existe (normalmente solo para clase personalizada)
    if (profesorEmail) {
      tasks.push(resend.emails.send({
        from: EMAIL_FROM,
        to: profesorEmail,
        subject: 'Nueva clase asignada',
        html: htmlProfesor
      }));
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    console.error('Error sendCompraExitosaEmails:', err);
  }
};

// CU-054 (link Meet)
export const sendMeetLinkEmails = async ({ sesion, estudianteEmail, profesorEmail }) => {
  try {
    const adminEmail = await getAdminEmail();
    const when = formatDateTimeCO(sesion?.fecha_hora);
    const link = sesion?.link_meet;

    const tasks = [];

    if (estudianteEmail) {
      tasks.push(resend.emails.send({
        from: EMAIL_FROM,
        to: estudianteEmail,
        subject: 'Tu clase ya tiene link de Meet',
        html: `
          <h2>Link de clase listo</h2>
          <p><strong>Fecha/Hora:</strong> ${when}</p>
          <p><strong>Link Meet:</strong> <a href="${link}">${link}</a></p>
        `
      }));
    }

    if (adminEmail) {
      tasks.push(resend.emails.send({
        from: EMAIL_FROM,
        to: adminEmail,
        subject: `Link Meet asignado - Sesión #${sesion?.id || ''}`,
        html: `
          <h2>Link Meet asignado</h2>
          <p><strong>Sesión:</strong> ${sesion?.id}</p>
          <p><strong>Fecha/Hora:</strong> ${when}</p>
          <p><strong>Link:</strong> <a href="${link}">${link}</a></p>
        `
      }));
    }

    // opcional: copia al profesor
    if (profesorEmail) {
      tasks.push(resend.emails.send({
        from: EMAIL_FROM,
        to: profesorEmail,
        subject: 'Link Meet registrado',
        html: `
          <h2>Link Meet registrado</h2>
          <p><strong>Fecha/Hora:</strong> ${when}</p>
          <p><strong>Link:</strong> <a href="${link}">${link}</a></p>
        `
      }));
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    console.error('Error sendMeetLinkEmails:', err);
  }
};

// CU-055 (queda listo para engancharlo cuando creemos profesor)
export const sendCredencialesProfesorEmail = async ({ to, nombre, email, passwordTemp }) => {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: 'Credenciales de profesor - Academia Parchada',
      html: `
        <h2>Cuenta de profesor creada</h2>
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Contraseña temporal:</strong> ${passwordTemp}</p>
      `
    });
  } catch (err) {
    console.error('Error sendCredencialesProfesorEmail:', err);
  }
};
