import { useState } from 'preact/hooks';
import { defaultBlock, defaultIncrement } from '../domain/exercises';
import { exportRoutine } from '../domain/importer';
import { getGoal } from '../domain/goals';
import { allGroups, groupOf, measureOf } from '../domain/groups';
import type { Category, Exercise, ExType, Muscle, Routine, RoutineItem } from '../domain/types';
import { CATEGORY_LABEL, MUSCLE_LABEL, MUSCLES, uid } from '../domain/types';
import { ask } from '../dialog';
import { getState, update, useStore } from '../store';
import { Header, Num, parseNum, saveTextFile, type Go } from '../ui';

/** Agrega un ejercicio a un día usando los rangos de repeticiones de la meta activa. */
export function addExerciseToDay(routineId: string, dayId: string, e: Exercise) {
  const g = getGoal(getState().goal);
  const group = groupOf(e, allGroups(getState()));
  const [repMin, repMax] = e.type === 'compuesto' ? g.compoundReps : g.isoReps;
  // Lo que se mide por tiempo arranca con una duración típica y sin peso.
  const item = group.measure === 'peso'
    ? { block: defaultBlock(e), sets: 3, repMin, repMax, weight: 0, increment: defaultIncrement(e) }
    : group.measure === 'min'
      ? { block: group.name, sets: 1, repMin: 20, repMax: 30, weight: 0, increment: 0, unit: 'min' as const }
      : { block: group.name, sets: 2, repMin: 30, repMax: 60, weight: 0, increment: 0, unit: 'seg' as const };
  update((s) => {
    s.routines.find((r) => r.id === routineId)?.days.find((d) => d.id === dayId)?.items.push({ id: uid(), exerciseId: e.id, ...item });
  });
}

export function RoutineEditor({ id, go }: { id: string; go: Go }) {
  const s = useStore();
  const routine = s.routines.find((r) => r.id === id);
  const [picker, setPicker] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (!routine) return <><Header title="Rutina" back={() => go({ n: 'routines' })} /><div class="empty">No existe.</div></>;

  const ex = new Map(s.exercises.map((e) => [e.id, e]));
  const groups = allGroups(s);
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
                const group = groupOf(e, groups);
                const timed = group.measure !== 'peso';
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
                        <div class="muted">{!e ? '' : timed ? group.name : `${MUSCLE_LABEL[e.muscle]} · ${e.type} · ${it.block}`}</div>
                      </div>
                      {ii > 0 && <button class="icon" aria-label="Subir" onClick={() => edit((r) => { const a = r.days[di].items; [a[ii - 1], a[ii]] = [a[ii], a[ii - 1]]; })}>↑</button>}
                      <button class="icon" aria-label="Quitar ejercicio" onClick={() => edit((r) => { r.days[di].items.splice(ii, 1); })}>×</button>
                    </div>
                    <div class="row wrap mt">
                      <Num label="Series" value={it.sets} onChange={set('sets')} w={48} />
                      <Num label={(it.unit === 'min' ? 'Min' : it.unit === 'seg' ? 'Seg' : 'Reps') + ' mín'} value={it.repMin} onChange={set('repMin')} w={52} />
                      <Num label={(it.unit === 'min' ? 'Min' : it.unit === 'seg' ? 'Seg' : 'Reps') + ' máx'} value={it.repMax} onChange={set('repMax')} w={52} />
                      {!timed && <Num label="Peso kg" value={it.weight} onChange={set('weight')} w={62} />}
                      {!timed && <Num label="Salto kg" value={it.increment} onChange={set('increment')} w={52} />}
                    </div>
                    <button class="link small mt" aria-expanded={open === it.id} onClick={() => setOpen(open === it.id ? null : it.id)}>
                      {open === it.id ? 'Ocultar detalles' : extras ? `Detalles: ${extras}` : timed ? '+ Descanso y notas' : '+ Descanso, RPE, pesos por serie, notas'}
                    </button>
                    {open === it.id && (
                      <div class="more">
                        <label class="field" hidden={timed}>Pesos por serie en kg (ej. 60/70/80; vacío = mismo peso)
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
                            <select value={it.unit ?? 'reps'} onChange={(e) => patch({ unit: e.currentTarget.value === 'reps' ? undefined : (e.currentTarget.value as 'seg' | 'min') })}>
                              <option value="reps">Reps</option><option value="seg">Segundos</option><option value="min">Minutos</option>
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
  const groups = allGroups(s);
  const [groupId, setGroupId] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', group: 'fuerza', muscle: 'pecho' as Muscle, category: 'empuje_h' as Category, type: 'compuesto' as ExType });
  const draftTimed = (groups.find((g) => g.id === draft.group)?.measure ?? 'peso') !== 'peso';
  const nq = q.toLowerCase();
  const list = s.exercises
    .filter((e) => (!groupId || groupOf(e, groups).id === groupId) && e.name.toLowerCase().includes(nq))
    .sort((a, b) => a.name.localeCompare(b.name));

  const create = () => {
    const e: Exercise = draftTimed
      ? { id: 'c_' + uid(), name: draft.name.trim(), group: draft.group, category: 'accesorio', muscle: 'core', type: 'aislamiento', secondary: [], custom: true }
      : { id: 'c_' + uid(), ...draft, name: draft.name.trim(), secondary: [], custom: true };
    update((d) => { d.exercises.push(e); });
    onPick(e);
  };

  return (
    <div class="sheet"><div>
      <Header title={creating ? 'Nuevo ejercicio' : 'Agregar ejercicio'} back={creating ? () => setCreating(false) : onClose} />
      {creating ? (
        <>
          <label class="field">Nombre<input value={draft.name} onInput={(e) => setDraft({ ...draft, name: e.currentTarget.value })} /></label>
          <label class="field mt">Grupo de actividad
            <select value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.currentTarget.value })}>
              {groups.map((g) => <option value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label class="field mt" hidden={draftTimed}>Grupo muscular
            <select value={draft.muscle} onChange={(e) => setDraft({ ...draft, muscle: e.currentTarget.value as Muscle })}>
              {MUSCLES.map((m) => <option value={m}>{MUSCLE_LABEL[m]}</option>)}
            </select>
          </label>
          <label class="field mt" hidden={draftTimed}>Categoría (patrón de movimiento)
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.currentTarget.value as Category })}>
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => <option value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </label>
          <label class="field mt" hidden={draftTimed}>Tipo
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
            <button class={'chip ' + (!groupId ? 'on' : '')} onClick={() => setGroupId('')}>Todos</button>
            {groups.map((g) => <button key={g.id} class={'chip ' + (groupId === g.id ? 'on' : '')} onClick={() => setGroupId(g.id)}>{g.name}</button>)}
          </div>
          <div class="card mt">
            {list.map((e) => (
              <button class="item list-btn" key={e.id} onClick={() => onPick(e)}>
                <div class="grow"><b>{e.name}</b><div class="muted">{measureOf(e, groups) === 'peso' ? `${MUSCLE_LABEL[e.muscle]} · ${CATEGORY_LABEL[e.category]}` : groupOf(e, groups).name}</div></div>
                {measureOf(e, groups) === 'peso' && <span class="tag">{e.type === 'compuesto' ? 'Comp.' : 'Aisl.'}</span>}
              </button>
            ))}
            {!list.length && <p class="muted">Sin resultados.</p>}
          </div>
          <button class="btn block" onClick={() => { setDraft({ ...draft, name: q, group: groupId || 'fuerza' }); setCreating(true); }}>+ Crear ejercicio propio</button>
        </>
      )}
    </div></div>
  );
}
