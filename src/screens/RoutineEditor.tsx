import { useState } from 'preact/hooks';
import { defaultBlock, defaultIncrement } from '../domain/exercises';
import { exportRoutine } from '../domain/importer';
import { getGoal } from '../domain/goals';
import type { Category, Exercise, ExType, Muscle, Routine, RoutineItem } from '../domain/types';
import { CATEGORY_LABEL, MUSCLE_LABEL, MUSCLES, uid } from '../domain/types';
import { ask } from '../dialog';
import { getState, update, useStore } from '../store';
import { Header, Num, parseNum, saveTextFile, type Go } from '../ui';

/** Agrega un ejercicio a un día usando los rangos de repeticiones de la meta activa. */
export function addExerciseToDay(routineId: string, dayId: string, e: Exercise) {
  const g = getGoal(getState().goal);
  const [repMin, repMax] = e.type === 'compuesto' ? g.compoundReps : g.isoReps;
  update((s) => {
    s.routines.find((r) => r.id === routineId)?.days.find((d) => d.id === dayId)?.items.push({
      id: uid(), exerciseId: e.id, block: defaultBlock(e), sets: 3, repMin, repMax, weight: 0, increment: defaultIncrement(e),
    });
  });
}

export function RoutineEditor({ id, go }: { id: string; go: Go }) {
  const s = useStore();
  const routine = s.routines.find((r) => r.id === id);
  const [picker, setPicker] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (!routine) return <><Header title="Rutina" back={() => go({ n: 'routines' })} /><div class="empty">No existe.</div></>;

  const ex = new Map(s.exercises.map((e) => [e.id, e]));
  const edit = (fn: (r: Routine) => void) => update((d) => { const r = d.routines.find((x) => x.id === id); if (r) fn(r); });
  const remove = async () => {
    if (!(await ask(`¿Eliminar "${routine.name}"? El historial de sesiones se conserva.`))) return;
    update((d) => {
      d.routines = d.routines.filter((r) => r.id !== id);
      if (d.activeRoutineId === id) d.activeRoutineId = d.routines[0]?.id ?? null;
    });
    go({ n: 'routines' });
  };
  const download = () => void saveTextFile(
    routine.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() + '.json',
    JSON.stringify(exportRoutine(routine, s.exercises), null, 2));

  return (
    <>
      <Header title="Editar rutina" back={() => go({ n: 'routines' })} />
      <label class="field">Nombre
        <input value={routine.name} onChange={(e) => edit((r) => { r.name = e.currentTarget.value || 'Rutina'; })} />
      </label>

      {routine.days.map((day, di) => (
        <div key={day.id}>
          <div class="section">Día {di + 1}</div>
          <div class="card">
            <div class="row">
              <input class="grow" aria-label="Nombre del día" value={day.name} onChange={(e) => edit((r) => { r.days[di].name = e.currentTarget.value || `Día ${di + 1}`; })} />
              <button class="btn sm danger" onClick={async () => (await ask(`¿Eliminar "${day.name}"?`)) && edit((r) => { r.days.splice(di, 1); })}>Quitar</button>
            </div>
            <div class="mt">
              {day.items.map((it, ii) => {
                const e = ex.get(it.exerciseId);
                const set = (k: 'sets' | 'repMin' | 'repMax' | 'weight' | 'increment') => (n: number) =>
                  edit((r) => {
                    const t = r.days[di].items[ii];
                    t[k] = k === 'sets' ? Math.max(1, Math.round(n)) : n;
                    if (t.repMax < t.repMin) t.repMax = t.repMin;
                    // Mantiene un peso por serie si el ejercicio usa pesos distintos.
                    if (t.setWeights) {
                      if (k === 'weight') delete t.setWeights;
                      else t.setWeights = Array.from({ length: t.sets }, (_, i) => t.setWeights![Math.min(i, t.setWeights!.length - 1)]);
                    }
                  });
                const patch = (p: Partial<RoutineItem>) => edit((r) => {
                  const t = r.days[di].items[ii];
                  for (const [key, v] of Object.entries(p)) {
                    if (v === undefined || v === '' || v === 0) delete (t as any)[key]; else (t as any)[key] = v;
                  }
                });
                const extras = [it.setWeights && `pesos ${it.setWeights.join('/')}`, it.restSec && `desc. ${it.restSec}s`, it.targetRpe && `RPE ${it.targetRpe}`, it.tempo && `tempo ${it.tempo}`, it.notes].filter(Boolean).join(' · ');
                return (
                  <div class="item" key={it.id}>
                    <div class="row between">
                      <div class="grow">
                        <b>{e?.name ?? 'Ejercicio eliminado'}</b>
                        <div class="muted">{e ? `${MUSCLE_LABEL[e.muscle]} · ${e.type}` : ''} · {it.block}</div>
                      </div>
                      {ii > 0 && <button class="icon" aria-label="Subir" onClick={() => edit((r) => { const a = r.days[di].items; [a[ii - 1], a[ii]] = [a[ii], a[ii - 1]]; })}>↑</button>}
                      <button class="icon" aria-label="Quitar ejercicio" onClick={() => edit((r) => { r.days[di].items.splice(ii, 1); })}>×</button>
                    </div>
                    <div class="row wrap mt">
                      <Num label="Series" value={it.sets} onChange={set('sets')} w={48} />
                      <Num label={it.unit === 'seg' ? 'Seg mín' : 'Reps mín'} value={it.repMin} onChange={set('repMin')} w={52} />
                      <Num label={it.unit === 'seg' ? 'Seg máx' : 'Reps máx'} value={it.repMax} onChange={set('repMax')} w={52} />
                      <Num label="Peso kg" value={it.weight} onChange={set('weight')} w={62} />
                      <Num label="Salto kg" value={it.increment} onChange={set('increment')} w={52} />
                    </div>
                    <button class="link small mt" aria-expanded={open === it.id} onClick={() => setOpen(open === it.id ? null : it.id)}>
                      {open === it.id ? 'Ocultar detalles' : extras ? `Detalles: ${extras}` : '+ Descanso, RPE, pesos por serie, notas'}
                    </button>
                    {open === it.id && (
                      <div class="more">
                        <label class="field">Pesos por serie en kg (ej. 60/70/80; vacío = mismo peso)
                          <input inputMode="decimal" value={it.setWeights?.join('/') ?? ''} placeholder={Array(it.sets).fill(it.weight).join('/')}
                            onChange={(e) => {
                              const list = e.currentTarget.value.split(/[\/;\s]+/).filter(Boolean).map(parseNum);
                              edit((r) => {
                                const t = r.days[di].items[ii];
                                if (list.length < 2) { delete t.setWeights; return; }
                                t.sets = list.length; t.setWeights = list; t.weight = Math.min(...list);
                              });
                            }} />
                        </label>
                        <div class="row wrap mt">
                          <Num label="Descanso s" value={it.restSec ?? 0} onChange={(n) => patch({ restSec: Math.round(n) })} w={72} />
                          <Num label="RPE obj." value={it.targetRpe ?? 0} onChange={(n) => patch({ targetRpe: Math.min(10, n) })} w={60} />
                          <label class="num"><span>Tempo</span>
                            <input style={{ width: '84px' }} value={it.tempo ?? ''} placeholder="3-1-1-0" onChange={(e) => patch({ tempo: e.currentTarget.value.trim() })} />
                          </label>
                          <label class="num"><span>Se mide en</span>
                            <select value={it.unit ?? 'reps'} onChange={(e) => patch({ unit: e.currentTarget.value === 'seg' ? 'seg' : undefined })}>
                              <option value="reps">Reps</option><option value="seg">Segundos</option>
                            </select>
                          </label>
                        </div>
                        <label class="field mt">Bloque o superserie
                          <input value={it.block} onChange={(e) => edit((r) => { r.days[di].items[ii].block = e.currentTarget.value.trim() || 'Principal'; })} />
                        </label>
                        <label class="field mt">Notas
                          <input value={it.notes ?? ''} placeholder="Técnica, variante, drop set…" onChange={(e) => patch({ notes: e.currentTarget.value.trim() })} />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
              {!day.items.length && <p class="muted">Sin ejercicios todavía.</p>}
            </div>
            <button class="btn sm block mt" onClick={() => setPicker(day.id)}>+ Agregar ejercicio</button>
          </div>
        </div>
      ))}

      <button class="btn block mt" onClick={() => edit((r) => { r.days.push({ id: uid(), name: `Día ${r.days.length + 1}`, items: [] }); })}>+ Agregar día</button>
      <button class="btn block mt" onClick={download}>Exportar en formato unificado (JSON)</button>
      <button class="btn block danger mt" onClick={remove}>Eliminar rutina</button>

      {picker && <ExercisePicker onClose={() => setPicker(null)} onPick={(e) => { addExerciseToDay(id, picker, e); setPicker(null); }} />}
    </>
  );
}

function ExercisePicker({ onPick, onClose }: { onPick: (e: Exercise) => void; onClose: () => void }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | ''>('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', muscle: 'pecho' as Muscle, category: 'empuje_h' as Category, type: 'compuesto' as ExType });
  const nq = q.toLowerCase();
  const list = s.exercises
    .filter((e) => (!muscle || e.muscle === muscle) && e.name.toLowerCase().includes(nq))
    .sort((a, b) => a.name.localeCompare(b.name));

  const create = () => {
    const e: Exercise = { id: 'c_' + uid(), ...draft, name: draft.name.trim(), secondary: [], custom: true };
    update((d) => { d.exercises.push(e); });
    onPick(e);
  };

  return (
    <div class="sheet"><div>
      <Header title={creating ? 'Nuevo ejercicio' : 'Agregar ejercicio'} back={creating ? () => setCreating(false) : onClose} />
      {creating ? (
        <>
          <label class="field">Nombre<input value={draft.name} onInput={(e) => setDraft({ ...draft, name: e.currentTarget.value })} /></label>
          <label class="field mt">Grupo muscular
            <select value={draft.muscle} onChange={(e) => setDraft({ ...draft, muscle: e.currentTarget.value as Muscle })}>
              {MUSCLES.map((m) => <option value={m}>{MUSCLE_LABEL[m]}</option>)}
            </select>
          </label>
          <label class="field mt">Categoría (patrón de movimiento)
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.currentTarget.value as Category })}>
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => <option value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </label>
          <label class="field mt">Tipo
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.currentTarget.value as ExType })}>
              <option value="compuesto">Compuesto</option>
              <option value="aislamiento">Aislamiento</option>
            </select>
          </label>
          <button class="btn block primary mt" disabled={!draft.name.trim()} onClick={create}>Crear y agregar</button>
        </>
      ) : (
        <>
          <input style={{ width: '100%' }} placeholder="Buscar…" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
          <div class="row wrap mt">
            <button class={'chip ' + (!muscle ? 'on' : '')} onClick={() => setMuscle('')}>Todos</button>
            {MUSCLES.map((m) => <button key={m} class={'chip ' + (muscle === m ? 'on' : '')} onClick={() => setMuscle(m)}>{MUSCLE_LABEL[m]}</button>)}
          </div>
          <div class="card mt">
            {list.map((e) => (
              <button class="item list-btn" key={e.id} onClick={() => onPick(e)}>
                <div class="grow"><b>{e.name}</b><div class="muted">{MUSCLE_LABEL[e.muscle]} · {CATEGORY_LABEL[e.category]}</div></div>
                <span class="tag">{e.type === 'compuesto' ? 'Comp.' : 'Aisl.'}</span>
              </button>
            ))}
            {!list.length && <p class="muted">Sin resultados.</p>}
          </div>
          <button class="btn block" onClick={() => { setDraft({ ...draft, name: q }); setCreating(true); }}>+ Crear ejercicio propio</button>
        </>
      )}
    </div></div>
  );
}
