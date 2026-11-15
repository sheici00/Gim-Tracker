// Sincronización dentro de un artefacto: los datos se guardan en el espacio
// privado de cada persona (data/users/<id>/), así que aparecen en cualquier
// dispositivo donde abra la página con su cuenta de Claude. No hay servidor propio.
import { canon, mergeDocs, toSyncDoc, type SyncDoc } from './domain/merge';
import type { Exercise, Routine, Session } from './domain/types';
import { applySyncDoc, getState, setOnLocalChange } from './store';
import { setStatus } from './sync';

/** Un documento por rutina y por sesión, más uno con las preferencias. */
function toDocs(doc: SyncDoc): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  out.set('meta', {
    goal: doc.goal, activeRoutineId: doc.activeRoutineId, prefsAt: doc.prefsAt, deleted: doc.deleted,
    exercises: doc.exercises.filter((e) => e.custom || e.updatedAt), groups: doc.groups,
  });
  for (const r of doc.routines) out.set('r_' + r.id, { routine: r });
  for (const s of doc.sessions) out.set('s_' + s.id, { session: s });
  return out;
}

function fromDocs(docs: Map<string, Record<string, unknown>>): SyncDoc {
  const meta = (docs.get('meta') ?? {}) as Partial<SyncDoc>;
  const routines: Routine[] = [], sessions: Session[] = [];
  for (const [id, body] of docs) {
    if (id.startsWith('r_') && body.routine) routines.push(body.routine as Routine);
    if (id.startsWith('s_') && body.session) sessions.push(body.session as Session);
  }
  return {
    version: 1, routines, sessions, exercises: (meta.exercises ?? []) as Exercise[], groups: meta.groups ?? [],
    goal: meta.goal ?? 'hipertrofia_general', activeRoutineId: meta.activeRoutineId ?? null,
    deleted: meta.deleted ?? {}, prefsAt: meta.prefsAt ?? 0,
  };
}

export async function startArtifactSync() {
  const [db, user] = await Promise.all([window.claude?.use('db') ?? null, window.claude?.use('user') ?? null]);
  const uid = (await user?.id()) ?? null;
  if (!db || !uid) { setStatus({ state: 'off', error: 'Iniciá sesión en Claude para guardar tus datos en tu cuenta. Mientras tanto quedan solo en este dispositivo.' }); return; }

  const col = db.collection('data/users/' + uid);
  let remote = new Map<string, string>(); // id del documento -> contenido canónico
  let loaded = false;
  let pushing = false, pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Sube solo los documentos que cambiaron, de a uno por vez.
  const push = async () => {
    if (!loaded) return;
    if (pushing) { pending = true; return; }
    pushing = true;
    try {
      const wanted = toDocs(toSyncDoc(getState()));
      for (const [id, body] of wanted) {
        const text = canon(body);
        if (remote.get(id) === text) continue;
        await col.doc(id).set(JSON.parse(text));
        remote.set(id, text);
      }
      for (const id of [...remote.keys()]) {
        if (wanted.has(id) || id === 'meta') continue;
        await col.doc(id).delete();
        remote.delete(id);
      }
      setStatus({ state: 'idle' });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setStatus({
        state: 'error',
        error: code === 'quota_exceeded' ? 'Se llenó el espacio de datos de esta página. Borrá sesiones viejas del historial.'
          : 'No se pudieron guardar los cambios en tu cuenta. Si esta página te la compartieron, pedí acceso de Colaborador.',
      });
    } finally {
      pushing = false;
      if (pending) { pending = false; void push(); }
    }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void push(), 1200); };

  setStatus({ state: 'syncing' });
  const slow = setTimeout(() => { if (!loaded) setStatus({ state: 'offline' }); }, 10_000);

  col.onSnapshot((snap) => {
    const docs = new Map<string, Record<string, unknown>>();
    for (const d of snap.docs) { const body = d.data(); if (d.exists && body) docs.set(d.id, body); }
    if (!snap.metadata.fromCache) {
      clearTimeout(slow);
      loaded = true;
      remote = new Map([...docs].map(([id, body]) => [id, canon(body)]));
    }
    // Lo que llega de otro dispositivo se fusiona con lo local.
    if (docs.size) {
      const local = toSyncDoc(getState());
      const merged = mergeDocs(local, fromDocs(docs));
      if (canon(merged) !== canon(local)) applySyncDoc(merged);
    }
    if (loaded) { setStatus({ state: 'idle' }); schedule(); }
  }, () => { clearTimeout(slow); setStatus({ state: 'error', error: 'Se perdió la conexión con tus datos. Recargá la página.' }); });

  setOnLocalChange(schedule);
}
