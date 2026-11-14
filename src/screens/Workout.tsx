import { useEffect, useState } from 'preact/hooks';
import { getGoal } from '../domain/goals';
import type { SessionEntry } from '../domain/types';
import { update, useStore } from '../store';
import { Header, Stepper, type Go } from '../ui';

export function Workout({ go }: { go: Go }) {
  const s = useStore();
  const a = s.active;
  const [restEnd, setRestEnd] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  // Vibra al terminar el descanso (si el celular lo soporta).
  const left = Math.max(0, Math.ceil((restEnd - now) / 1000));
  useEffect(() => { if (restEnd && left === 0) { navigator.vibrate?.(300); setRestEnd(0); } }, [left, restEnd]);

  if (!a) return <><Header title="Entrenamiento" back={() => go({ n: 'home' })} /><div class="empty">No hay un entrenamiento en curso.</div></>;

  const ex = new Map(s.exercises.map((e) => [e.id, e]));
  const goal = getGoal(s.goal);
  const edit = (ei: number, fn: (e: SessionEntry) => void) => update((d) => { if (d.active) fn(d.active.entries[ei]); });
  const doneSets = a.entries.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
  const totalSets = a.entries.reduce((n, e) => n + e.sets.length, 0);
  const mins = Math.floor((now - a.startedAt) / 60000);

  const toggle = (ei: number, si: number) => {
    const willBeDone = !a.entries[ei].sets[si].done;
    edit(ei, (e) => { e.sets[si].done = willBeDone; });
    if (willBeDone) {
      const type = ex.get(a.entries[ei].exerciseId)?.type;
      setRestEnd(Date.now() + (a.entries[ei].restSec ?? goal.rest[type === 'compuesto' ? 0 : 1]) * 1000);
    }
  };
  const cancel = () => {
    if (confirm('¿Descartar este entrenamiento? Se pierde lo registrado.')) { update((d) => { d.active = null; }); go({ n: 'home' }); }
  };

  return (
    <>
      <Header title={a.dayName} back={() => go({ n: 'home' })} right={<button class="btn sm danger" onClick={cancel}>Descartar</button>} />
      <p class="muted">{mins} min · {doneSets}/{totalSets} series</p>

      {a.entries.map((e, ei) => {
        const x = ex.get(e.exerciseId);
        return (
          <div class="card mt" key={e.itemId}>
            <div class="row between">
              <h3 class="grow">{x?.name ?? 'Ejercicio'}</h3>
              <span class="tag">{e.repMin === e.repMax ? e.repMin : `${e.repMin}-${e.repMax}`} {e.unit === 'seg' ? 'seg' : 'reps'}</span>
            </div>
            {(e.targetRpe || e.tempo || e.restSec || e.notes) && (
              <p class="muted">
                {[e.targetRpe && `RPE ${e.targetRpe}`, e.tempo && `tempo ${e.tempo}`, e.restSec && `descanso ${e.restSec}s`, e.notes].filter(Boolean).join(' · ')}
              </p>
            )}
            <div class="set head"><span>#</span><span>Kg</span><span>{e.unit === 'seg' ? 'Seg' : 'Reps'}</span><span>OK</span></div>
            {e.sets.map((st, si) => (
              <div class={'set ' + (st.done ? 'done' : '')} key={si}>
                <span class="idx">{si + 1}</span>
                <Stepper label="peso" value={st.weight} step={e.increment >= 2.5 ? 2.5 : 1}
                  onChange={(n) => edit(ei, (d) => {
                    // Cambiar el peso de una serie lo propaga a las siguientes sin completar.
                    d.sets.forEach((t, i) => { if (i === si || (i > si && !t.done)) t.weight = n; });
                  })} />
                <Stepper label="repeticiones" value={st.reps} step={e.unit === 'seg' ? 5 : 1} onChange={(n) => edit(ei, (d) => { d.sets[si].reps = Math.round(n); })} />
                <button class={'check ' + (st.done ? 'on' : '')} aria-label={`Serie ${si + 1} completada`} aria-pressed={st.done} onClick={() => toggle(ei, si)}>✓</button>
              </div>
            ))}
            <div class="row mt">
              <button class="btn sm" onClick={() => edit(ei, (d) => { const l = d.sets[d.sets.length - 1]; d.sets.push({ weight: l?.weight ?? d.targetWeight, reps: l?.reps ?? d.repMin, done: false }); })}>+ Serie</button>
              {e.sets.length > 1 && <button class="btn sm" onClick={() => edit(ei, (d) => { d.sets.pop(); })}>− Serie</button>}
            </div>
          </div>
        );
      })}

      <div class="bar"><div>
        {restEnd > 0 && (
          <button class="rest" onClick={() => setRestEnd(0)}>
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            <small>descanso · tocar para saltar</small>
          </button>
        )}
        <button class="btn primary grow" disabled={!doneSets} onClick={() => go({ n: 'post' })}>Terminar</button>
      </div></div>
    </>
  );
}
