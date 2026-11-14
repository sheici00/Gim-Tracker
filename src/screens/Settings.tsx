import { useState } from 'preact/hooks';
import { isNative, MODELS, setDevice, useDevice } from '../device';
import { exportBackup, restoreBackup } from '../store';
import { signIn, signOut, syncNow, useSyncStatus } from '../sync';
import { Header, saveTextFile, type Go } from '../ui';

const STATUS = { off: 'Sin iniciar sesión', idle: 'Sincronizado', syncing: 'Sincronizando…', offline: 'Sin conexión: se sincroniza al volver', error: 'Error' };

export function Settings({ go }: { go: Go }) {
  const dev = useDevice();
  const sync = useSyncStatus();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [working, setWorking] = useState(false);
  const [key, setKey] = useState(dev.apiKey);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);

  const auth = async (mode: 'login' | 'register') => {
    setAuthErr(''); setWorking(true);
    try { await signIn(mode, user, pass); setPass(''); }
    catch (e) { setAuthErr((e as Error).message); }
    finally { setWorking(false); }
  };
  const saveKey = async () => {
    setDevice({ apiKey: key.trim() });
    if (!key.trim()) { setTest(null); return; }
    setTest({ ok: true, text: 'Probando…' });
    const { testKey, errorMessage } = await import('../claude');
    try { await testKey(); setTest({ ok: true, text: '✓ Conectado con Claude.' }); }
    catch (e) { setTest({ ok: false, text: errorMessage(e) }); }
  };
  const download = () => void saveTextFile(`gym-tracker-${new Date().toISOString().slice(0, 10)}.json`, exportBackup());
  const restore = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    if (confirm('Esto reemplaza todos los datos actuales por los del archivo. ¿Continuar?'))
      alert(restoreBackup(await f.text()) ? 'Datos restaurados.' : 'El archivo no es una copia válida de Gym Tracker.');
    input.value = '';
  };

  return (
    <>
      <Header title="Ajustes" back={() => go({ n: 'home' })} />

      <div class="section">Cuenta y sincronización</div>
      <div class="card">
        {dev.token ? (
          <>
            <div class="row between"><h3>{dev.username}</h3><span class={'tag ' + (sync.state === 'idle' ? 'accent' : '')}>{STATUS[sync.state]}</span></div>
            <p class="muted mt">
              Tus rutinas e historial se comparten entre todos los dispositivos donde inicies sesión con este usuario.
              {dev.lastSync > 0 && ` Última sincronización: ${new Date(dev.lastSync).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`}
            </p>
            {sync.error && <p class="err">{sync.error}</p>}
            <div class="row mt">
              <button class="btn sm grow" disabled={sync.state === 'syncing'} onClick={() => void syncNow()}>Sincronizar ahora</button>
              <button class="btn sm grow danger" onClick={() => confirm('¿Cerrar sesión en este dispositivo? Los datos quedan guardados acá y en tu cuenta.') && void signOut()}>Cerrar sesión</button>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void auth('login'); }}>
            <p class="muted">Iniciá sesión con el mismo usuario en el celular y en la PC para tener los mismos datos en ambos.</p>
            {sync.error && <p class="err">{sync.error}</p>}
            <label class="field mt">Servidor{isNative() ? '' : ' (opcional: vacío usa esta misma dirección)'}
              <input type="url" inputMode="url" autocapitalize="none" placeholder="https://mi-servidor.com" value={dev.serverUrl}
                onChange={(e) => setDevice({ serverUrl: e.currentTarget.value.trim() })} />
            </label>
            <label class="field mt">Usuario
              <input autocapitalize="none" autocomplete="username" value={user} onInput={(e) => setUser(e.currentTarget.value)} />
            </label>
            <label class="field mt">Contraseña (mínimo 8 caracteres)
              <input type="password" autocomplete="current-password" value={pass} onInput={(e) => setPass(e.currentTarget.value)} />
            </label>
            {authErr && <p class="err">{authErr}</p>}
            <div class="row mt">
              <button class="btn sm grow primary" disabled={working || !user || pass.length < 8 || (isNative() && !dev.serverUrl)}>Iniciar sesión</button>
              <button type="button" class="btn sm grow" disabled={working || !user || pass.length < 8} onClick={() => void auth('register')}>Crear cuenta</button>
            </div>
          </form>
        )}
      </div>

      <div class="section">Claude</div>
      <div class="card">
        <p class="muted">
          Cada dispositivo usa su propia clave de API de Claude, que se crea en la consola de Anthropic (platform.claude.com → API keys).
          La clave se guarda solo en este dispositivo: no se sincroniza ni pasa por el servidor de la app. El uso se factura en tu cuenta de Anthropic.
        </p>
        <label class="field mt">Clave de API
          <input type="password" autocomplete="off" placeholder="sk-ant-…" value={key} onInput={(e) => { setKey(e.currentTarget.value); setTest(null); }} />
        </label>
        <label class="field mt">Modelo
          <select value={dev.model} onChange={(e) => setDevice({ model: e.currentTarget.value })}>
            {MODELS.map((m) => <option value={m.id}>{m.label}</option>)}
          </select>
        </label>
        {test && <p class={test.ok ? 'muted mt' : 'err'}>{test.text}</p>}
        <div class="row mt">
          <button class="btn sm grow primary" disabled={key.trim() === dev.apiKey && !!test} onClick={() => void saveKey()}>{key.trim() ? 'Guardar y probar' : 'Guardar'}</button>
          {dev.apiKey && <button class="btn sm grow danger" onClick={() => { setKey(''); setDevice({ apiKey: '' }); setTest(null); }}>Quitar clave</button>}
        </div>
      </div>

      <div class="section">Copia de seguridad</div>
      <div class="card">
        <p class="muted">Descargá un archivo con todos tus datos, o restauralos desde uno.</p>
        <div class="row mt">
          <button class="btn sm grow" onClick={download}>Exportar copia</button>
          <label class="btn sm grow">Restaurar copia<input type="file" accept=".json,application/json" hidden onChange={restore} /></label>
        </div>
      </div>
    </>
  );
}
