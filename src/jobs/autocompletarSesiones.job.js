import cron from 'node-cron';
import { supabase } from '../config/supabase.js';

export const runAutocompletarSesionesOnce = async () => {
  const graceMinutes = Number(process.env.SESION_COMPLETE_GRACE_MINUTES || 1);

  const { data, error } = await supabase.rpc('autocompletar_sesiones_clase', {
    grace_minutes: graceMinutes,
  });

  if (error) {
    console.error('[autocompletar_sesiones_clase] error:', error);
    return;
  }

  if (data && Number(data) > 0) {
    console.log(`[autocompletar_sesiones_clase] actualizadas: ${data}`);
  }
};

export const startAutocompletarSesionesJob = () => {
  cron.schedule('* * * * *', runAutocompletarSesionesOnce);
};
