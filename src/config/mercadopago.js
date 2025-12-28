import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference, Payment, MerchantOrder } from 'mercadopago';

dotenv.config();

if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
  console.warn('⚠️ MERCADOPAGO_ACCESS_TOKEN no está configurado en .env');
}

export const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || ''
});

export const mpPreference = new Preference(mpClient);
export const mpPayment = new Payment(mpClient);
export const mpMerchantOrder = new MerchantOrder(mpClient);
