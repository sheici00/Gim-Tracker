import type { PostMetrics, SessionEntry, Suggestion } from './types';

/** Redondeo a discos fraccionados de 0,25 kg. */
export const roundKg = (kg: number) => Math.max(0, Math.round(kg * 4) / 4);

const belowMin = (e: SessionEntry) => {
  const done = e.sets.filter((s) => s.done);
  return done.length > 0 && done.some((s) => s.reps < e.repMin);
};

/**
 * Auto-regulación por doble progresión:
 *  - Todas las series en el tope del rango  -> subir el peso (salto completo).
 *  - Idem pero costó / RPE alto             -> microcarga (medio salto).
 *  - Dentro del rango                        -> mantener y sumar repeticiones.
 *  - Bajo el mínimo dos sesiones seguidas    -> descarga del 10%.
 *  - Molestia                                -> bajar 10% y no progresar.
 * `prev` es el registro del mismo ejercicio en la sesión anterior, si existe.
 */
export function suggestFor(entry: SessionEntry, post: PostMetrics, prev?: SessionEntry): Suggestion {
  const done = entry.sets.filter((s) => s.done);
  const base = done.length ? Math.min(...done.map((s) => s.weight)) : entry.targetWeight;
  const mk = (action: Suggestion['action'], to: number, reason: string): Suggestion => ({
    itemId: entry.itemId, exerciseId: entry.exerciseId, action, from: entry.targetWeight || base, to: roundKg(to), reason,
  });

  const inc = (n: number) => String(n).replace('.', ',');

  if (!done.length) return mk('mantener', entry.targetWeight, 'No registraste series: se mantiene el peso.');

  if (post.pain.includes(entry.exerciseId))
    return mk('bajar', base * 0.9, 'Marcaste molestia: bajá ~10%, cuidá la técnica y, si se repite, cambiá el ejercicio.');

  const complete = done.length === entry.sets.length;
  const allTop = complete && done.every((s) => s.reps >= entry.repMax);
  const allMin = complete && done.every((s) => s.reps >= entry.repMin);
  const fatigued = post.rpe >= 9.5 || post.feeling <= 3;
  const hard = post.hard.includes(entry.exerciseId);

  if (allTop) {
    if (fatigued)
      return mk('mantener', base, 'Cumpliste el objetivo, pero la sesión fue muy exigente: consolidá este peso una vez más.');
    if (hard || post.rpe >= 9)
      return mk('microcarga', base + entry.increment / 2,
        `Objetivo cumplido pero costó: microcarga de +${inc(entry.increment / 2)} kg.`);
    return mk('subir', base + entry.increment,
      base === 0
        ? `Tope de repeticiones con peso corporal: agregá ${inc(entry.increment)} kg de lastre.`
        : `Todas las series en ${entry.repMax}+ reps: +${inc(entry.increment)} kg.`);
  }

  if (allMin)
    return mk('mantener', base, `Dentro del rango: mismo peso y buscá sumar 1 repetición por serie hasta llegar a ${entry.repMax}.`);

  if (belowMin(entry) && prev && belowMin(prev) && prev.targetWeight >= base)
    return mk('bajar', base * 0.9, `Dos sesiones seguidas por debajo de ${entry.repMin} reps: descarga del 10% y volvé a construir.`);

  return mk('mantener', base, complete
    ? `Quedaste por debajo de ${entry.repMin} reps en alguna serie: repetí el peso la próxima.`
    : 'No completaste todas las series: repetí el peso la próxima.');
}
