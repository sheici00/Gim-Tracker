import type { ActivityGroup, AppState, Exercise, Measure, Routine } from './types';

/** Grupos que vienen con la app. El usuario puede sumar los suyos. */
export const BUILTIN_GROUPS: ActivityGroup[] = [
  { id: 'fuerza', name: 'Gimnasio (fuerza)', measure: 'peso', builtin: true },
  { id: 'movilidad', name: 'Movilidad articular', measure: 'seg', builtin: true },
  { id: 'aerobico', name: 'Aeróbico', measure: 'min', builtin: true },
];

export const MEASURE_LABEL: Record<Measure, string> = {
  peso: 'Peso y repeticiones', seg: 'Tiempo en segundos', min: 'Tiempo en minutos',
};

export const allGroups = (state: Pick<AppState, 'groups'>): ActivityGroup[] => [...BUILTIN_GROUPS, ...(state.groups ?? [])];

export const groupOf = (e: Exercise | undefined, groups: ActivityGroup[]): ActivityGroup =>
  groups.find((g) => g.id === e?.group) ?? BUILTIN_GROUPS[0];

export const measureOf = (e: Exercise | undefined, groups: ActivityGroup[]): Measure => groupOf(e, groups).measure;

/** La rutina solo con los ejercicios que se miden con peso: es lo que cuenta para volumen y balance muscular. */
export function strengthOnly(routine: Routine, ex: Map<string, Exercise>, groups: ActivityGroup[]): Routine {
  return {
    ...routine,
    days: routine.days.map((d) => ({ ...d, items: d.items.filter((i) => measureOf(ex.get(i.exerciseId), groups) === 'peso') })),
  };
}

/** Cantidad de ejercicios por grupo en un día, en el orden de los grupos: "5 fuerza · 2 movilidad". */
export function daySummary(items: { exerciseId: string }[], ex: Map<string, Exercise>, groups: ActivityGroup[]): string {
  const count = new Map<string, number>();
  for (const i of items) { const g = groupOf(ex.get(i.exerciseId), groups); count.set(g.id, (count.get(g.id) ?? 0) + 1); }
  if (count.size <= 1) return `${items.length} ejercicios`;
  return groups.filter((g) => count.has(g.id)).map((g) => `${count.get(g.id)} ${g.name.toLowerCase()}`).join(' · ');
}
