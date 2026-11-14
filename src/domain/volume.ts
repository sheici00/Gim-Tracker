import type { Category, Exercise, Muscle, Routine } from './types';
import { MUSCLES } from './types';

export type ExMap = Map<string, Exercise>;
export const exMap = (list: Exercise[]): ExMap => new Map(list.map((e) => [e.id, e]));

/** Series semanales por músculo: 1 por serie al músculo principal, 0,5 a los secundarios. */
export function weeklySets(routine: Routine, ex: ExMap): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const day of routine.days)
    for (const it of day.items) {
      const e = ex.get(it.exerciseId);
      if (!e) continue;
      out[e.muscle] += it.sets;
      for (const s of e.secondary) out[s] += it.sets * 0.5;
    }
  return out;
}

/** Series semanales por patrón de movimiento. */
export function categorySets(routine: Routine, ex: ExMap): Record<Category, number> {
  const out: Record<Category, number> = {
    empuje_h: 0, empuje_v: 0, traccion_h: 0, traccion_v: 0, rodilla: 0, cadera: 0, core: 0, accesorio: 0,
  };
  for (const day of routine.days)
    for (const it of day.items) {
      const e = ex.get(it.exerciseId);
      if (e) out[e.category] += it.sets;
    }
  return out;
}

/** En cuántos días por semana se trabaja cada músculo (principal o secundario). */
export function muscleFrequency(routine: Routine, ex: ExMap): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const day of routine.days) {
    const hit = new Set<Muscle>();
    for (const it of day.items) {
      const e = ex.get(it.exerciseId);
      if (!e) continue;
      hit.add(e.muscle);
      e.secondary.forEach((s) => hit.add(s));
    }
    hit.forEach((m) => out[m]++);
  }
  return out;
}

export const e1rm = (weight: number, reps: number) => weight * (1 + reps / 30);
