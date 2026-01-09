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
        <p>Hola ${nombre || ''},</p>
        <p>Bienvenido a <b>Academia Parchada</b>.</p>
        <p>Tu cuenta fue creada exitosamente.</p>
      `
    });
  } catch (err) {
    console.error('Error sendWelcomeEmail:', err);
  }
};

// Helpers de contenido
const buildEmailCompra = ({ tipo, detalle }) => {
  const tipoLabel =
    tipo === 'curso' ? 'Curso'
      : tipo === 'clase_personalizada' ? 'Clase personalizada'
        : tipo === 'paquete_horas' ? 'Paquete de horas'
          : (tipo || 'Compra');

  return {
    tipoLabel,
    detalleSafe: detalle || ''
  };
};

// CU-052 (compra exitosa) + (clase asignada solo si aplica)
export const sendCompraExitosaEmails = async ({
  compra,
  estudianteEmail,
  profesorEmail,
  profesorNombre,
  tipo,
  detalle
}) => {
  try {
    const adminEmail = await getAdminEmail();
    const { tipoLabel, detalleSafe } = buildEmailCompra({ tipo, detalle });

    // ESTUDIANTE
    const htmlEstudiante =
      tipo === 'clase_personalizada'
        ? `
          <p>Tu compra fue confirmada exitosamente.</p>
          <p><b>Tipo:</b> ${tipoLabel}</p>
          ${detalleSafe ? `<p>${detalleSafe}</p>` : ''}
          <p>Pronto recibirás un correo con el link de tu clase (cuando el profesor lo cree).</p>
        `
        : `
          <p>Tu compra fue confirmada exitosamente.</p>
          <p><b>Tipo:</b> ${tipoLabel}</p>
          ${detalleSafe ? `<p>${detalleSafe}</p>` : ''}
          <p>Ya puedes acceder a tu contenido desde la plataforma.</p>
        `;

    // ADMIN
    const htmlAdmin = `
      <p><b>Compra:</b> ${compra?.id || ''}</p>
      <p><b>Tipo:</b> ${tipoLabel}</p>
      ${profesorNombre ? `<p><b>Profesor:</b> ${profesorNombre}</p>` : ''}
      ${detalleSafe ? `<p>${detalleSafe}</p>` : ''}
    `;

    // PROFESOR (solo aplica para clase personalizada)
    const htmlProfesorClase = `
      <p>Se te asignó una sesión.</p>
      <p>Por favor crea el link de Google Meet y regístralo en el sistema.</p>
      ${detalleSafe ? `<p>${detalleSafe}</p>` : ''}
    `;

    const tasks = [];

    if (estudianteEmail) {
      tasks.push(
        resend.emails.send({
          from: EMAIL_FROM,
          to: estudianteEmail,
          subject: 'Compra confirmada - Academia Parchada',
          html: htmlEstudiante
        })
      );
    }

    if (adminEmail) {
      tasks.push(
        resend.emails.send({
          from: EMAIL_FROM,
          to: adminEmail,
          subject: `Compra confirmada #${compra?.id || ''}`,
          html: htmlAdmin
        })
      );
    }

    // Aquí estaba el error lógico: estabas enviando al profesor SIEMPRE que hubiera profesorEmail,
    // incluso en cursos. Se limita a clase_personalizada.
    if (tipo === 'clase_personalizada' && profesorEmail) {
      tasks.push(
        resend.emails.send({
          from: EMAIL_FROM,
          to: profesorEmail,
          subject: 'Nueva clase asignada',
          html: htmlProfesorClase
        })
      );
    }

    const results = await Promise.allSettled(tasks);
    results.forEach((r) => {
      if (r.status === 'rejected') console.error('Email send rejected:', r.reason);
    });
  } catch (err) {
    console.error('Error sendCompraExitosaEmails:', err);
  }
};

// CU-054 (link Meet) => SOLO estudiante
export const sendMeetLinkEmails = async ({ sesion, estudianteEmail }) => {
  try {
    const when = formatDateTimeCO(sesion?.fecha_hora);
    const link = sesion?.link_meet;

    if (!estudianteEmail) return;

    await resend.emails.send({
      from: EMAIL_FROM,
      to: estudianteEmail,
      subject: 'Tu clase ya tiene link de Meet',
      html: `
        <p>Tu clase ya tiene link de Google Meet.</p>
        <p><b>Fecha/Hora:</b> ${when}</p>
        <p><b>Link Meet:</b> ${link || ''}</p>
      `
    });
  } catch (err) {
    console.error('Error sendMeetLinkEmails:', err);
  }
};

// CU-055 (credenciales profesor)
export const sendCredencialesProfesorEmail = async ({ to, nombre, email, passwordTemp }) => {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: 'Credenciales de profesor - Academia Parchada',
      html: `
        <p>Hola ${nombre || ''},</p>
        <p>Estas son tus credenciales de acceso:</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Contraseña temporal:</b> ${passwordTemp}</p>
      `
    });
  } catch (err) {
    console.error('Error sendCredencialesProfesorEmail:', err);
  }
};
