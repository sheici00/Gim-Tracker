import { useEffect, useState } from 'preact/hooks';
import { SEED_EXERCISES } from './domain/exercises';
import { suggestFor } from './domain/progression';
import type { SyncDoc } from './domain/merge';
import { allGroups, measureOf } from './domain/groups';
import type { AppState, Exercise, PostMetrics, Routine, Session } from './domain/types';
import { uid } from './domain/types';

const KEY = 'gym-tracker-v1';

const initial = (): AppState => ({
  version: 1, exercises: SEED_EXERCISES, groups: [], routines: [], sessions: [],
  activeRoutineId: null, goal: 'hipertrofia_general', active: null, deleted: {}, prefsAt: 0,
});

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      // Incorpora ejercicios nuevos de la biblioteca sin pisar los del usuario.
      const ids = new Set(s.exercises.map((e) => e.id));
      s.exercises.push(...SEED_EXERCISES.filter((e) => !ids.has(e.id)));
      return { ...initial(), ...s };
    }
  } catch { /* almacenamiento vacío o corrupto: se arranca de cero */ }
  return initial();
}

let state = load();
const subs = new Set<() => void>();

export const getState = () => state;

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sin espacio */ }
  subs.forEach((f) => f());
}

/** Se llama después de cada cambio local; lo usa la sincronización. */
let onLocalChange: () => void = () => {};
export const setOnLocalChange = (fn: () => void) => { onLocalChange = fn; };

export function update(fn: (draft: AppState) => void) {
  const prev = state;
  const draft = structuredClone(state);
  fn(draft);
  // Marca qué cambió y qué se borró, para poder fusionar con otros dispositivos.
  const now = Date.now();
  for (const key of ['routines', 'sessions', 'groups', 'exercises'] as const) {
    const before = new Map<string, { id: string }>((prev[key] as { id: string }[]).map((x) => [x.id, x]));
    for (const x of draft[key] as { id: string; updatedAt?: number }[]) {
      const old = before.get(x.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(x)) x.updatedAt = now;
      before.delete(x.id);
    }
    // Los ejercicios no se eliminan; el resto deja una marca para sincronizar el borrado.
    if (key !== 'exercises') for (const id of before.keys()) draft.deleted[id] = now;
  }
  if (draft.goal !== prev.goal || draft.activeRoutineId !== prev.activeRoutineId) draft.prefsAt = now;
  state = draft;
  persist();
  onLocalChange();
}

/** Reemplaza los datos sincronizables por el resultado de una fusión (no cuenta como cambio local). */
export function applySyncDoc(doc: SyncDoc) {
  state = { ...state, ...structuredClone(doc) };
  persist();
}

export function useStore(): AppState {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return state;
}

/* ---------- Acciones ---------- */

export function addRoutines(routines: Routine[], newExercises: Exercise[] = []) {
  update((s) => {
    s.exercises.push(...newExercises);
    s.routines.push(...routines);
    if (!s.activeRoutineId && routines[0]) s.activeRoutineId = routines[0].id;
  });
}

const lastEntry = (sessions: Session[], itemId: string) => {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const e = sessions[i].entries.find((x) => x.itemId === itemId);
    if (e) return e;
  }
};

export function startSession(routineId: string, dayId: string) {
  update((s) => {
    const day = s.routines.find((r) => r.id === routineId)?.days.find((d) => d.id === dayId);
    if (!day) return;
    s.active = {
      id: uid(), routineId, dayId, dayName: day.name, startedAt: Date.now(),
      entries: day.items.map((it) => {
        const prev = lastEntry(s.sessions, it.id);
        return {
          itemId: it.id, exerciseId: it.exerciseId, repMin: it.repMin, repMax: it.repMax,
          targetWeight: it.setWeights?.length ? Math.min(...it.setWeights) : it.weight, increment: it.increment,
          unit: it.unit, restSec: it.restSec, targetRpe: it.targetRpe, tempo: it.tempo, notes: it.notes,
          // Se precargan las reps de la última vez (o el mínimo del rango) para registrar rápido.
          sets: Array.from({ length: it.sets }, (_, i) => ({
            weight: it.setWeights?.[i] ?? it.weight, reps: prev?.sets[i]?.done ? prev.sets[i].reps : it.repMin, done: false,
          })),
        };
      }),
    };
  });
}

/** Cierra la sesión en curso, calcula las sugerencias de auto-regulación y devuelve su id. */
export function finishSession(post: PostMetrics): string | null {
  let id: string | null = null;
  update((s) => {
    const a = s.active;
    if (!a) return;
    a.finishedAt = Date.now();
    a.post = post;
    // La sobrecarga progresiva solo aplica a lo que se mide con peso.
    const groups = allGroups(s);
    const exById = new Map(s.exercises.map((e) => [e.id, e]));
    a.suggestions = a.entries
      .filter((e) => measureOf(exById.get(e.exerciseId), groups) === 'peso')
      .map((e) => suggestFor(e, post, lastEntry(s.sessions, e.itemId)));
    s.sessions.push(a);
    s.active = null;
    id = a.id;
  });
  return id;
}

/** Vuelca a la rutina los pesos sugeridos para la próxima sesión. */
export function applySuggestions(sessionId: string, itemIds: string[]) {
  update((s) => {
    const ses = s.sessions.find((x) => x.id === sessionId);
    const routine = s.routines.find((r) => r.id === ses?.routineId);
    if (!ses || !routine) return;
    for (const sug of ses.suggestions ?? []) {
      if (!itemIds.includes(sug.itemId)) continue;
      const item = routine.days.flatMap((d) => d.items).find((i) => i.id === sug.itemId);
      if (!item) continue;
      // Con pesos por serie se desplaza toda la escalera por la misma diferencia.
      if (item.setWeights) item.setWeights = item.setWeights.map((w) => Math.max(0, w + sug.to - sug.from));
      item.weight = sug.to;
    }
    ses.applied = true;
  });
}

export function exportBackup(): string {
  return JSON.stringify(state, null, 2);
}

export function restoreBackup(json: string): boolean {
  try {
    const data = JSON.parse(json) as AppState;
    if (data.version !== 1 || !Array.isArray(data.routines) || !Array.isArray(data.sessions)) return false;
    update((s) => Object.assign(s, initial(), data, { prefsAt: Date.now() }));
    return true;
  } catch { return false; }
}
