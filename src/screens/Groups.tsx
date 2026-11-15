import { useState } from 'preact/hooks';
import { ask } from '../dialog';
import { allGroups, BUILTIN_GROUPS, groupOf, MEASURE_LABEL } from '../domain/groups';
import type { Measure } from '../domain/types';
import { uid } from '../domain/types';
import { update, useStore } from '../store';
import { Header, type Go } from '../ui';

export function Groups({ go }: { go: Go }) {
  const s = useStore();
  const groups = allGroups(s);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [measure, setMeasure] = useState<Measure>('peso');
  const [q, setQ] = useState('');

  const create = () => {
    const id = 'g_' + uid();
    update((d) => { d.groups.push({ id, name: name.trim(), measure }); });
    setName(''); setOpen(id);
  };
  const remove = async (id: string, label: string) => {
    const target = groups.find((g) => g.id === id)!;
    // Los ejercicios vuelven al grupo de base que se mide igual.
    const fallback = BUILTIN_GROUPS.find((g) => g.measure === target.measure)!;
    if (!(await ask(`¿Eliminar el grupo "${label}"? Sus ejercicios pasan a "${fallback.name}".`))) return;
    update((d) => {
      d.groups = d.groups.filter((g) => g.id !== id);
      for (const e of d.exercises) if (e.group === id) e.group = fallback.id;
    });
    setOpen(null);
  };
  const move = (exerciseId: string, groupId: string) =>
    update((d) => { const e = d.exercises.find((x) => x.id === exerciseId); if (e) e.group = groupId; });

  const nq = q.trim().toLowerCase();

  return (
    <>
      <Header title="Grupos de actividades" back={() => go({ n: 'routines' })} />
      <p class="muted">
        Cada ejercicio pertenece a un grupo. El grupo define cómo se registra (con peso o por tiempo) y solo los grupos
        con peso cuentan para el volumen muscular y la sobrecarga progresiva.
      </p>

      {groups.map((g) => {
        const members = s.exercises.filter((e) => groupOf(e, groups).id === g.id).sort((a, b) => a.name.localeCompare(b.name));
        const isOpen = open === g.id;
        return (
          <div class="card mt" key={g.id}>
            <button class="list-btn" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : g.id); setQ(''); }}>
              <div class="grow">
                <h3>{g.name}</h3>
                <p class="muted">{MEASURE_LABEL[g.measure]} · {members.length} ejercicio{members.length === 1 ? '' : 's'}</p>
              </div>
              <span class="muted">{isOpen ? '▾' : '›'}</span>
            </button>

            {isOpen && (
              <div class="mt">
                {!g.builtin && (
                  <div class="row">
                    <input class="grow" aria-label="Nombre del grupo" value={g.name}
                      onChange={(e) => update((d) => { const x = d.groups.find((y) => y.id === g.id); if (x) x.name = e.currentTarget.value.trim() || x.name; })} />
                    <button class="btn sm danger" onClick={() => void remove(g.id, g.name)}>Eliminar</button>
                  </div>
                )}
                <div class="mt">
                  {members.map((e) => (
                    <div class="item row between" key={e.id}>
                      <span class="grow small">{e.name}</span>
                      <select aria-label={`Mover ${e.name} a otro grupo`} value={g.id} onChange={(ev) => move(e.id, ev.currentTarget.value)}>
                        {groups.map((o) => <option value={o.id}>{o.name}</option>)}
                      </select>
                    </div>
                  ))}
                  {!members.length && <p class="muted">Todavía no tiene ejercicios.</p>}
                </div>

                <label class="field mt">Traer un ejercicio a este grupo
                  <input placeholder="Buscar por nombre…" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
                </label>
                {nq.length >= 2 && s.exercises
                  .filter((e) => groupOf(e, groups).id !== g.id && e.name.toLowerCase().includes(nq)).slice(0, 6)
                  .map((e) => (
                    <div class="item row between" key={e.id}>
                      <span class="grow small">{e.name} <span class="muted">· {groupOf(e, groups).name}</span></span>
                      <button class="btn sm" onClick={() => move(e.id, g.id)}>Mover acá</button>
                    </div>
                  ))}
                <p class="hint">Los ejercicios nuevos se crean desde el editor de una rutina, con "Agregar ejercicio".</p>
              </div>
            )}
          </div>
        );
      })}

      <div class="section">Nuevo grupo</div>
      <div class="card">
        <label class="field">Nombre
          <input value={name} placeholder="Ej. Rehabilitación de hombro, Pliometría, Yoga…" onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label class="field mt">Cómo se registra
          <select value={measure} onChange={(e) => setMeasure(e.currentTarget.value as Measure)}>
            {(Object.keys(MEASURE_LABEL) as Measure[]).map((m) => <option value={m}>{MEASURE_LABEL[m]}</option>)}
          </select>
        </label>
        <button class="btn block primary mt" disabled={!name.trim()} onClick={create}>Crear grupo</button>
      </div>
    </>
  );
}
