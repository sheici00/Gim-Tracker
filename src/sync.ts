import { useEffect, useState } from 'preact/hooks';
import { getDevice, isNative, setDevice } from './device';
import { mergeDocs, sameDoc, toSyncDoc, type SyncDoc } from './domain/merge';
import { applySyncDoc, getState, setOnLocalChange } from './store';

export type SyncStatus = { state: 'off' | 'idle' | 'syncing' | 'offline' | 'error'; error?: string };

let status: SyncStatus = { state: getDevice().token ? 'idle' : 'off' };
const subs = new Set<() => void>();
export const setStatus = (s: SyncStatus) => { status = s; subs.forEach((f) => f()); };

export function useSyncStatus(): SyncStatus {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return status;
}

class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) { super(message); }
}

async function api(method: string, path: string, body?: unknown, token = getDevice().token) {
  const base = getDevice().serverUrl.replace(/\/+$/, '');
  if (!base && isNative()) throw new ApiError(0, 'Indicá la dirección de tu servidor de Gym Tracker.');
  const res = await fetch(base + '/api' + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!isJson) throw new ApiError(res.status, 'Esta dirección no tiene servidor de sincronización. Abrí la app desde el servidor de Gym Tracker.');
  if (!res.ok && res.status !== 409) throw new ApiError(res.status, data?.error ?? `Error ${res.status}`, data);
  return { status: res.status, data };
}

let running: Promise<void> | null = null;
let again = false;

/** Trae el estado del servidor, lo fusiona con el local y sube el resultado si hace falta. */
export function syncNow(): Promise<void> {
  if (!getDevice().token) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    setStatus({ state: 'syncing' });
    try {
      let { data: remote } = await api('GET', '/state') as { data: { rev: number; data: SyncDoc | null } };
      for (let attempt = 0; attempt < 4; attempt++) {
        const local = toSyncDoc(getState());
        const merged = remote.data ? mergeDocs(local, remote.data) : local;
        if (!sameDoc(merged, local)) applySyncDoc(merged);
        if (remote.data && sameDoc(merged, remote.data)) { setDevice({ rev: remote.rev, lastSync: Date.now() }); break; }
        const put = await api('PUT', '/state', { baseRev: remote.rev, data: merged });
        if (put.status === 200) { setDevice({ rev: put.data.rev, lastSync: Date.now() }); break; }
        remote = put.data; // 409: otro dispositivo escribió antes; se fusiona de nuevo.
      }
      setStatus({ state: 'idle' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setDevice({ token: '', rev: 0 });
        setStatus({ state: 'off', error: 'La sesión venció. Volvé a iniciar sesión.' });
      } else if (e instanceof ApiError) setStatus({ state: 'error', error: e.message });
      else setStatus({ state: 'offline' });
    } finally {
      running = null;
      if (again) { again = false; void syncNow(); }
    }
  })();
  return running;
}

export async function signIn(mode: 'login' | 'register', username: string, password: string) {
  try {
    const { data } = await api('POST', '/' + mode, { username, password }, '');
    setDevice({ token: data.token, username: data.username, rev: 0 });
  } catch (e) {
    throw new Error(e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor.');
  }
  await syncNow();
}

export async function signOut() {
  try { await api('POST', '/logout'); } catch { /* sin conexión: se cierra igual en este dispositivo */ }
  setDevice({ token: '', username: '', rev: 0, lastSync: 0 });
  setStatus({ state: 'off' });
}

/** Activa la sincronización automática: tras cada cambio, al volver a la app y cada minuto. */
export function startSync() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  setOnLocalChange(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 1500);
  });
  const visible = () => { if (document.visibilityState === 'visible') void syncNow(); };
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('online', () => void syncNow());
  setInterval(visible, 60_000);
  void syncNow();
}
