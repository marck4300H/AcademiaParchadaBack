import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // ← CAMBIO AQUÍ (antes era SUPABASE_ANON_KEY)

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan variables de entorno de Supabase (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
}

// Cliente con Service Role Key - Bypass RLS
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('✅ Supabase configurado correctamente (Service Role)');
