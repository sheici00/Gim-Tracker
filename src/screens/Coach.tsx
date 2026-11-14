import { useEffect, useRef, useState } from 'preact/hooks';
import type { ChatMessage } from '../claude';
import { useDevice } from '../device';
import { audit, buildSystemPrompt } from '../domain/coach';
import { getGoal } from '../domain/goals';
import { CATEGORY_LABEL, type Category } from '../domain/types';
import { categorySets, exMap } from '../domain/volume';
import { getState, useStore } from '../store';
import { Header, type Go } from '../ui';

const SEV = { alta: 'Prioridad alta', media: 'A mejorar', info: 'Para tener en cuenta', ok: 'Todo en orden' };
const QUICK = [
  'Auditá mi rutina completa y decime qué cambiarías primero.',
  '¿Cómo vengo progresando según mis últimas sesiones?',
  'Armame una semana de descarga con mi rutina actual.',
];

// La conversación vive mientras la app esté abierta (no se guarda ni se sincroniza).
let history: ChatMessage[] = [];

export function Coach({ go }: { go: Go }) {
  const s = useStore();
  const dev = useDevice();
  const [messages, setMessages] = useState<ChatMessage[]>(history);
  const [draft, setDraft] = useState('');
  const [partial, setPartial] = useState<string | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { history = messages; }, [messages]);
  useEffect(() => () => abort.current?.abort(), []);

  const findings = audit(s);
  const routine = s.routines.find((r) => r.id === s.activeRoutineId);
  const cat = routine ? categorySets(routine, exMap(s.exercises)) : null;
  const busy = partial !== null;

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text.trim() }];
    setMessages(next); setDraft(''); setError(''); setPartial('');
    abort.current = new AbortController();
    let acc = '';
    try {
      const { chat } = await import('../claude');
      const full = await chat(buildSystemPrompt(getState()), next, (d) => { acc += d; setPartial(acc); end.current?.scrollIntoView({ block: 'end' }); }, abort.current.signal);
      setMessages([...next, { role: 'assistant', content: full }]);
    } catch (e) {
      const { errorMessage } = await import('../claude');
      if (acc) setMessages([...next, { role: 'assistant', content: acc }]);
      if (!abort.current?.signal.aborted) setError(errorMessage(e));
    } finally { setPartial(null); }
  };

  return (
    <>
      <Header title="Coach" />
      {routine && <p class="muted">Auditoría de "{routine.name}" para la meta {getGoal(s.goal).name.toLowerCase()}.</p>}

      <div class="section">Asistente Claude</div>
      {!dev.apiKey ? (
        <div class="card">
          <p class="muted">Conectá tu cuenta de Claude para charlar con un coach que conoce tu rutina, tu meta y tu historial.</p>
          <button class="btn sm block primary mt" onClick={() => go({ n: 'settings' })}>Conectar Claude</button>
        </div>
      ) : (
        <div class="card">
          {!messages.length && !busy && QUICK.map((q) => (
            <button class="btn sm block quick" key={q} onClick={() => send(q)}>{q}</button>
          ))}
          {messages.map((m, i) => <div class={'msg ' + m.role} key={i}>{m.content}</div>)}
          {busy && <div class="msg assistant">{partial || 'Pensando…'}</div>}
          {error && <p class="err">{error}</p>}
          <div ref={end} />
          <form class="row mt" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
            <input class="grow" placeholder="Preguntale a tu coach…" value={draft} onInput={(e) => setDraft(e.currentTarget.value)} />
            {busy
              ? <button type="button" class="btn sm" onClick={() => abort.current?.abort()}>Frenar</button>
              : <button class="btn sm primary" disabled={!draft.trim()}>Enviar</button>}
          </form>
          {messages.length > 0 && !busy && <button class="btn sm block mt" onClick={() => setMessages([])}>Nueva conversación</button>}
        </div>
      )}

      {cat && (
        <>
          <div class="section">Balance por patrón</div>
          <div class="card">
            <p class="muted">Series semanales</p>
            {(['empuje_h', 'empuje_v', 'traccion_h', 'traccion_v', 'rodilla', 'cadera'] as Category[]).map((c) => (
              <div class="row between small mt" key={c}><span class="muted">{CATEGORY_LABEL[c]}</span><b>{cat[c]}</b></div>
            ))}
          </div>
        </>
      )}

      <div class="section">Análisis automático</div>
      {findings.map((f, i) => (
        <div class={'card finding ' + f.severity} key={i}>
          <span class="tag">{SEV[f.severity]}</span>
          <h3 class="mt">{f.title}</h3>
          <p class="muted">{f.detail}</p>
          <div class="act">→ {f.action}</div>
        </div>
      ))}
    </>
  );
}
