import { useState } from 'preact/hooks';
import { picksFor } from '../domain/coach';
import { getGoal, GOALS } from '../domain/goals';
import { MUSCLE_LABEL, MUSCLES } from '../domain/types';
import { allGroups, strengthOnly } from '../domain/groups';
import { exMap, weeklySets } from '../domain/volume';
import { ask } from '../dialog';
import { update, useStore } from '../store';
import { Header } from '../ui';
import { addExerciseToDay } from './RoutineEditor';

export function GoalScreen() {
  const s = useStore();
  const goal = getGoal(s.goal);
  const routine = s.routines.find((r) => r.id === s.activeRoutineId);
  const ex = exMap(s.exercises);
  const vol = routine ? weeklySets(strengthOnly(routine, ex, allGroups(s)), ex) : null;
  const [dayId, setDayId] = useState('');
  const day = routine?.days.find((d) => d.id === dayId) ?? routine?.days[0];
  const SCALE = 26;

  const applyReps = async () => {
    if (!routine || !(await ask(`¿Ajustar los rangos de repeticiones de "${routine.name}" a esta meta?`))) return;
    update((d) => {
      for (const dd of d.routines.find((r) => r.id === routine.id)!.days)
        for (const it of dd.items) {
          const [a, b] = ex.get(it.exerciseId)?.type === 'compuesto' ? goal.compoundReps : goal.isoReps;
          it.repMin = a; it.repMax = b;
        }
    });
  };
  const low = vol ? MUSCLES.filter((m) => vol[m] < goal.targets[m][0]) : [];

  return (
    <>
      <Header title="Meta" />
      {GOALS.map((g) => (
        <button key={g.id} class="card list-btn" style={g.id === s.goal ? { outline: '2px solid var(--accent)' } : undefined}
          aria-pressed={g.id === s.goal} onClick={() => update((d) => { d.goal = g.id; })}>
          <div class="grow">
            <h3>{g.name}</h3>
            <p class="muted">{g.desc}</p>
          </div>
          {g.id === s.goal && <span class="tag accent">Activa</span>}
        </button>
      ))}

      <div class="section">Parámetros de la meta</div>
      <div class="card">
        <div class="row between small"><span class="muted">Compuestos</span><b>{goal.compoundReps.join('-')} reps · {String(goal.rest[0] / 60).replace('.', ',')} min descanso</b></div>
        <div class="row between small mt"><span class="muted">Aislamiento</span><b>{goal.isoReps.join('-')} reps · {goal.rest[1]} s descanso</b></div>
        <div class="row between small mt"><span class="muted">Series en compuestos</span><b>≥ {Math.round(goal.minCompoundRatio * 100)}%</b></div>
        {routine && <button class="btn sm block mt" onClick={applyReps}>Aplicar estos rangos a mi rutina</button>}
      </div>

      {routine && vol ? (
        <>
          <div class="section">Volumen semanal vs. objetivo</div>
          <div class="card">
            <p class="muted">Series de fuerza por semana en "{routine.name}". La franja clara es el rango recomendado. Movilidad y aeróbico no cuentan acá.</p>
            {MUSCLES.map((m) => {
              const [min, max] = goal.targets[m];
              const v = vol[m];
              return (
                <div class="vol" key={m}>
                  <div class="row between small">
                    <span>{MUSCLE_LABEL[m]}{goal.priority.includes(m) && <span class="muted"> · prioridad</span>}</span>
                    <span class="muted"><b style={{ color: 'var(--text)' }}>{String(v).replace('.', ',')}</b> / {min}-{max}</span>
                  </div>
                  <div class="vol-track">
                    <div class="vol-range" style={{ left: `${(min / SCALE) * 100}%`, width: `${((max - min) / SCALE) * 100}%` }} />
                    <div class={'vol-fill ' + (v < min ? 'low' : v > max ? 'high' : '')} style={{ width: `${Math.min(100, (v / SCALE) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {low.length > 0 && (
            <>
              <div class="section">Ejercicios sugeridos</div>
              <label class="field">Agregar al día
                <select value={day?.id} onChange={(e) => setDayId(e.currentTarget.value)}>
                  {routine.days.map((d) => <option value={d.id}>{d.name}</option>)}
                </select>
              </label>
              {low.map((m) => (
                <div class="card mt" key={m}>
                  <b>{MUSCLE_LABEL[m]}</b>
                  <span class="muted"> · faltan ~{Math.ceil(goal.targets[m][0] - vol[m])} series</span>
                  {picksFor(m, s.exercises, routine, goal.id === 'fuerza_compuestos').map((e) => (
                    <div class="item row between" key={e.id}>
                      <span class="grow small">{e.name} <span class="muted">· {e.type}</span></span>
                      <button class="btn sm" disabled={!day} onClick={() => day && addExerciseToDay(routine.id, day.id, e)}>+ Agregar</button>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <div class="empty">Activá una rutina para ver tu volumen frente a la meta.</div>
      )}
    </>
  );
}
