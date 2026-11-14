import { useState } from 'preact/hooks';
import { finishSession, useStore } from '../store';
import { Header, Scale, type Go } from '../ui';

const FEEL = ['', 'Pésimo', 'Muy mal', 'Mal', 'Flojo', 'Regular', 'Bien', 'Bien', 'Muy bien', 'Excelente', 'Imparable'];
const RPE = ['', 'Muy suave', 'Muy suave', 'Suave', 'Suave', 'Moderado', 'Moderado', 'Exigente (3 reps en reserva)', 'Duro (2 en reserva)', 'Muy duro (1 en reserva)', 'Máximo, al fallo'];

export function PostWorkout({ go }: { go: Go }) {
  const s = useStore();
  const [feeling, setFeeling] = useState(7);
  const [rpe, setRpe] = useState(8);
  const [hard, setHard] = useState<string[]>([]);
  const [pain, setPain] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const a = s.active;
  if (!a) return <><Header title="Cierre" back={() => go({ n: 'home' })} /><div class="empty">No hay un entrenamiento en curso.</div></>;

  const ex = new Map(s.exercises.map((e) => [e.id, e]));
  const ids = [...new Set(a.entries.filter((e) => e.sets.some((x) => x.done)).map((e) => e.exerciseId))];
  const flip = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const save = () => {
    const id = finishSession({ rpe, feeling, hard, pain, notes: notes.trim() });
    go(id ? { n: 'session', id } : { n: 'home' });
  };

  return (
    <>
      <Header title="¿Cómo estuvo?" back={() => go({ n: 'workout' })} />
      <div class="card">
        <div class="row between"><h3>Sensaciones</h3><span class="muted">{FEEL[feeling]}</span></div>
        <div class="mt"><Scale value={feeling} onChange={setFeeling} /></div>
      </div>
      <div class="card">
        <div class="row between"><h3>Esfuerzo (RPE)</h3><span class="muted">{RPE[rpe]}</span></div>
        <div class="mt"><Scale value={rpe} onChange={setRpe} /></div>
      </div>
      <div class="card">
        <h3>¿Algún ejercicio costó o molestó?</h3>
        <p class="muted">Se usa para ajustar el peso de la próxima sesión.</p>
        {ids.map((id) => (
          <div class="item row between" key={id}>
            <span class="grow small">{ex.get(id)?.name}</span>
            <button class={'chip warn ' + (hard.includes(id) ? 'on' : '')} aria-pressed={hard.includes(id)} onClick={() => flip(hard, setHard, id)}>Costó</button>
            <button class={'chip bad ' + (pain.includes(id) ? 'on' : '')} aria-pressed={pain.includes(id)} onClick={() => flip(pain, setPain, id)}>Molestia</button>
          </div>
        ))}
      </div>
      <label class="field">Notas (opcional)
        <input value={notes} placeholder="Dormí poco, cambié el agarre…" onInput={(e) => setNotes(e.currentTarget.value)} />
      </label>
      <div class="bar"><div><button class="btn primary grow" onClick={save}>Guardar y ver ajustes</button></div></div>
    </>
  );
}
