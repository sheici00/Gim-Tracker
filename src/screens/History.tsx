import { useState } from 'preact/hooks';
import { ask } from '../dialog';
import { allGroups, measureOf } from '../domain/groups';
import { applySuggestions, update, useStore } from '../store';
import { Header, kg, type Go } from '../ui';

const ACTION = { subir: 'Subir', microcarga: 'Microcarga', mantener: 'Mantener', bajar: 'Bajar' };

export function SessionDetail({ id, go }: { id: string; go: Go }) {
  const s = useStore();
  const ses = s.sessions.find((x) => x.id === id);
  const [picked, setPicked] = useState<string[] | null>(null);
  if (!ses) return <><Header title="Sesión" back={() => go({ n: 'history' })} /><div class="empty">No existe.</div></>;

  const ex = new Map(s.exercises.map((e) => [e.id, e]));
  const sugs = ses.suggestions ?? [];
  const sel = picked ?? sugs.filter((x) => x.action !== 'mantener' || x.to !== x.from).map((x) => x.itemId);
  const groups = allGroups(s);
  const timedEntry = (e: { exerciseId: string }) => measureOf(ex.get(e.exerciseId), groups) !== 'peso';
  const volume = ses.entries.filter((e) => !timedEntry(e)).reduce((a, e) => a + e.sets.filter((x) => x.done).reduce((b, x) => b + x.weight * x.reps, 0), 0);
  const mins = Math.max(1, Math.round(((ses.finishedAt ?? ses.startedAt) - ses.startedAt) / 60000));
  const routineExists = s.routines.some((r) => r.id === ses.routineId);
  const del = async () => {
    if (await ask('¿Eliminar esta sesión del historial?')) { update((d) => { d.sessions = d.sessions.filter((x) => x.id !== id); }); go({ n: 'history' }); }
  };

  return (
    <>
      <Header title={ses.dayName} back={() => go({ n: 'history' })} />
      <p class="muted">{new Date(ses.startedAt).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div class="card mt stats">
        <div><b>{mins}</b><span>min</span></div>
        <div><b>{Math.round(volume).toLocaleString('es-AR')}</b><span>kg totales</span></div>
        <div><b>{ses.post?.feeling ?? '–'}</b><span>sensaciones</span></div>
        <div><b>{ses.post?.rpe ?? '–'}</b><span>RPE</span></div>
      </div>

      {sugs.length > 0 && (
        <>
          <div class="section">Próxima sesión · auto-regulación</div>
          <div class="card">
            {sugs.map((g) => (
              <label class="sug" key={g.itemId}>
                {!ses.applied && routineExists && (
                  <input type="checkbox" checked={sel.includes(g.itemId)}
                    onChange={() => setPicked(sel.includes(g.itemId) ? sel.filter((x) => x !== g.itemId) : [...sel, g.itemId])} />
                )}
                <div class="grow">
                  <div class="row between">
                    <b>{ex.get(g.exerciseId)?.name}</b>
                    <span class={'delta ' + g.action}>{g.to !== g.from ? `${kg(g.from)} → ${kg(g.to)}` : ACTION[g.action]}</span>
                  </div>
                  <p class="muted">{g.reason}</p>
                </div>
              </label>
            ))}
            {ses.applied
              ? <p class="muted mt">✓ Ajustes aplicados a la rutina.</p>
              : routineExists && <button class="btn block primary mt" disabled={!sel.length} onClick={() => applySuggestions(id, sel)}>Aplicar {sel.length} ajuste{sel.length === 1 ? '' : 's'} a la rutina</button>}
          </div>
        </>
      )}

      <div class="section">Registro</div>
      <div class="card">
        {ses.entries.map((e) => (
          <div class="item" key={e.itemId}>
            <div class="row between">
              <b>{ex.get(e.exerciseId)?.name}</b>
              <span class="row">
                {ses.post?.hard.includes(e.exerciseId) && <span class="chip warn on">Costó</span>}
                {ses.post?.pain.includes(e.exerciseId) && <span class="chip bad on">Molestia</span>}
              </span>
            </div>
            <p class="muted">{e.sets.filter((x) => x.done).map((x) => (timedEntry(e) ? `${x.reps} ${e.unit ?? 'seg'}` : `${String(x.weight).replace('.', ',')}×${x.reps}`)).join('  ·  ') || 'Sin series registradas'}</p>
          </div>
        ))}
      </div>
      {ses.post?.notes && <div class="card"><b class="small">Notas</b><p class="muted">{ses.post.notes}</p></div>}
      <button class="btn block danger" onClick={del}>Eliminar sesión</button>
    </>
  );
}

export function History({ go }: { go: Go }) {
  const s = useStore();
  const list = [...s.sessions].reverse();
  return (
    <>
      <Header title="Historial" />
      {!list.length && <div class="empty">Cuando termines tu primer entrenamiento va a aparecer acá.</div>}
      {list.map((x) => (
        <button class="card list-btn" key={x.id} onClick={() => go({ n: 'session', id: x.id })}>
          <div class="grow">
            <h3>{x.dayName}</h3>
            <p class="muted">
              {new Date(x.startedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
              {x.post && ` · RPE ${x.post.rpe} · Sensaciones ${x.post.feeling}/10`}
            </p>
          </div>
          {x.suggestions && !x.applied && <span class="tag accent">Ajustes</span>}
          <span class="muted">›</span>
        </button>
      ))}

    </>
  );
}
