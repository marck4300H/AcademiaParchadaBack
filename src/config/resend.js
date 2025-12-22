import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

// Inicializar cliente de Resend
export const resend = new Resend(process.env.RESEND_API_KEY);

// Email por defecto del remitente
export const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@tudominio.com';
