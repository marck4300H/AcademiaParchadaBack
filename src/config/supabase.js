import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// ⬇️ IMPORTANTE: Cargar variables AQUÍ ⬇️
dotenv.config();

// Verificación temporal
console.log('\n🔍 [supabase.js] Verificando variables:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL || '❌ NO DEFINIDA');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ Definida' : '❌ NO DEFINIDA');

// Validar que existan
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('\n❌ ERROR: Faltan variables de entorno de Supabase');
  console.error('Verifica tu archivo .env\n');
  throw new Error('Faltan variables de entorno de Supabase');
}

// Crear cliente de Supabase
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  }
);

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);
