// src/utils/generarSesionesCurso.js

import { DateTime } from 'luxon';

const DAY_MAP = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7
};

const isValidTimeHHMM = (v) => /^\d{2}:\d{2}$/.test(String(v || ''));

const parseHHMM = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map((x) => Number(x));
  return { hour: h, minute: m };
};

const normalizeDays = (days_of_week) => {
  const arr = Array.isArray(days_of_week) ? days_of_week : [];
  const mapped = arr
    .map((d) => String(d || '').trim().toUpperCase())
    .filter((d) => DAY_MAP[d]);
  return [...new Set(mapped)];
};

const diffMinutes = ({ startHHMM, endHHMM }) => {
  const s = parseHHMM(startHHMM);
  const e = parseHHMM(endHHMM);

  const start = DateTime.fromObject({ hour: s.hour, minute: s.minute });
  const end = DateTime.fromObject({ hour: e.hour, minute: e.minute });

  const mins = Math.round(end.diff(start, 'minutes').minutes);
  return mins;
};

/**
 * Genera sesiones semanales entre fecha_inicio y fecha_fin (inclusive),
 * usando timezone IANA. La duración sale de hora_inicio/hora_fin.
 *
 * @param {Object} params
 * @param {string} params.fecha_inicio
 * @param {string} params.fecha_fin
 * @param {string} params.timezone - IANA (ej: America/Bogota)
 * @param {string[]} params.days_of_week - ['MON','THU'] o ['MON','TUE','WED','THU','FRI']
 * @param {string} params.hora_inicio - 'HH:mm' (hora local)
 * @param {string} params.hora_fin - 'HH:mm' (hora local)
 * @param {string[]} params.exclude_dates - array de fechas 'YYYY-MM-DD' en timezone local
 * @param {string} params.estado - default 'programada'
 * @returns {Array<{ fecha_hora: string, duracion_min: number, link_meet: null, estado: string }>}
 */
export function generarSesionesSemanalesPorRangoHora({
  fecha_inicio,
  fecha_fin,
  timezone,
  days_of_week,
  hora_inicio,
  hora_fin,
  exclude_dates = [],
  estado = 'programada'
}) {
  if (!fecha_inicio || !fecha_fin) throw new Error('fecha_inicio y fecha_fin son requeridas para generar sesiones');

  if (!timezone || typeof timezone !== 'string') throw new Error('timezone (IANA) es requerida');

  const days = normalizeDays(days_of_week);
  if (days.length === 0) throw new Error('days_of_week debe tener al menos un día válido (MON..SUN)');

  if (!hora_inicio || !isValidTimeHHMM(hora_inicio)) throw new Error('hora_inicio debe tener formato HH:mm');
  if (!hora_fin || !isValidTimeHHMM(hora_fin)) throw new Error('hora_fin debe tener formato HH:mm');

  const duracion_min = diffMinutes({ startHHMM: hora_inicio, endHHMM: hora_fin });
  if (!Number.isFinite(duracion_min) || duracion_min <= 0) {
    throw new Error('hora_fin debe ser posterior a hora_inicio (duración > 0)');
  }

  const { hour, minute } = parseHHMM(hora_inicio);

  let start = DateTime.fromISO(String(fecha_inicio), { setZone: true }).setZone(timezone).startOf('day');
  let end = DateTime.fromISO(String(fecha_fin), { setZone: true }).setZone(timezone).endOf('day');

  if (!start.isValid || !end.isValid) throw new Error('fecha_inicio o fecha_fin no son válidas (ISO recomendado)');
  if (end < start) throw new Error('fecha_fin debe ser posterior a fecha_inicio');

  const excludeSet = new Set((exclude_dates || []).map((d) => String(d).trim()));

  const sesiones = [];
  let cursor = start;

  while (cursor <= end) {
    const weekday = cursor.weekday; // 1..7

    const shouldCreate = days.some((d) => DAY_MAP[d] === weekday);
    if (shouldCreate) {
      const dateKey = cursor.toFormat('yyyy-LL-dd');
      if (!excludeSet.has(dateKey)) {
        const dt = cursor.set({ hour, minute, second: 0, millisecond: 0 });

        sesiones.push({
          fecha_hora: dt.toISO(), // perfecto para timestamptz
          duracion_min,
          link_meet: null,
          estado
        });
      }
    }

    cursor = cursor.plus({ days: 1 });
  }

  return sesiones;
}
