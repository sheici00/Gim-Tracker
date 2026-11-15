import type { AppState, Exercise } from './types';

/** La parte del estado que viaja entre dispositivos (todo menos el entrenamiento en curso). */
export type SyncDoc = Pick<AppState, 'version' | 'exercises' | 'groups' | 'routines' | 'sessions' | 'activeRoutineId' | 'goal' | 'deleted' | 'prefsAt'>;

export const toSyncDoc = (s: AppState): SyncDoc => ({
  version: 1, exercises: s.exercises, groups: s.groups ?? [], routines: s.routines, sessions: s.sessions,
  activeRoutineId: s.activeRoutineId, goal: s.goal, deleted: s.deleted, prefsAt: s.prefsAt,
});

function mergeById<T extends { id: string; updatedAt?: number }>(a: T[], b: T[], deleted: Record<string, number>): T[] {
  const map = new Map<string, T>();
  for (const x of [...a, ...b]) {
    const cur = map.get(x.id);
    if (!cur || (x.updatedAt ?? 0) > (cur.updatedAt ?? 0)) map.set(x.id, x);
  }
  return [...map.values()].filter((x) => !(x.id in deleted));
}

/**
 * Fusiona el estado de dos dispositivos sin perder datos:
 *  - rutinas y sesiones: unión por id; si ambas cambiaron gana la más reciente;
 *  - lo eliminado en un dispositivo se elimina en el otro;
 *  - ejercicios: unión; meta y rutina activa: el cambio más reciente.
 * Es conmutativa e idempotente: merge(a, b) equivale a merge(b, a).
 */
export function mergeDocs(a: SyncDoc, b: SyncDoc): SyncDoc {
  const deleted: Record<string, number> = { ...b.deleted };
  for (const [id, t] of Object.entries(a.deleted ?? {})) deleted[id] = Math.max(t, deleted[id] ?? 0);

  // Ejercicios: unión; si se editó en ambos lados gana el cambio más reciente. No se borran.
  const exercises = mergeById<Exercise>(a.exercises ?? [], b.exercises ?? [], {}).sort((x, y) => x.id.localeCompare(y.id));
  const groups = mergeById(a.groups ?? [], b.groups ?? [], deleted).sort((x, y) => x.id.localeCompare(y.id));

  const routines = mergeById(a.routines ?? [], b.routines ?? [], deleted).sort((x, y) => x.id.localeCompare(y.id));
  const sessions = mergeById(a.sessions ?? [], b.sessions ?? [], deleted).sort((x, y) => x.startedAt - y.startedAt || x.id.localeCompare(y.id));
  const prefs = (b.prefsAt ?? 0) > (a.prefsAt ?? 0) ? b : a;
  const activeRoutineId = routines.some((r) => r.id === prefs.activeRoutineId) ? prefs.activeRoutineId : routines[0]?.id ?? null;

  return {
    version: 1,
    exercises, groups, routines, sessions, activeRoutineId, goal: prefs.goal, deleted,
    prefsAt: Math.max(a.prefsAt ?? 0, b.prefsAt ?? 0),
  };
}

/** JSON canónico: mismas claves en el mismo orden y sin valores undefined. */
export function canon(value: unknown): string {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v as object).filter(([, x]) => x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, norm(x)]))
        : v;
  return JSON.stringify(norm(value));
}

/** Comparación estructural independiente del orden de las claves. */
export const sameDoc = (a: unknown, b: unknown) => canon(a) === canon(b);
