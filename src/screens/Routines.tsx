import { TEMPLATES } from '../domain/templates';
import { uid } from '../domain/types';
import { update, useStore } from '../store';
import { Header, type Go } from '../ui';
import { loadTemplate } from './Home';

export function Routines({ go }: { go: Go }) {
  const s = useStore();
  const create = () => {
    const id = uid();
    update((d) => {
      d.routines.push({ id, name: 'Nueva rutina', days: [{ id: uid(), name: 'Día 1', items: [] }] });
      d.activeRoutineId ??= id;
    });
    go({ n: 'routine', id });
  };
  return (
    <>
      <Header title="Rutinas" />
      {!s.routines.length && <div class="empty">Todavía no tenés rutinas.</div>}
      {s.routines.map((r) => (
        <div class="card" key={r.id}>
          <button class="list-btn" onClick={() => go({ n: 'routine', id: r.id })}>
            <div class="grow">
              {r.id === s.activeRoutineId && <span class="tag accent">Activa</span>}
              <h3 class={r.id === s.activeRoutineId ? 'mt' : ''}>{r.name}</h3>
              <p class="muted">{r.days.length} días · {r.days.reduce((a, d) => a + d.items.length, 0)} ejercicios</p>
            </div>
            <span class="muted">Editar ›</span>
          </button>
          {r.id !== s.activeRoutineId && (
            <button class="btn sm mt" onClick={() => update((d) => { d.activeRoutineId = r.id; })}>Usar esta rutina</button>
          )}
        </div>
      ))}
      <div class="row">
        <button class="btn grow primary" onClick={() => go({ n: 'import' })}>Importar</button>
        <button class="btn grow" onClick={create}>Crear vacía</button>
      </div>
      <button class="btn block mt" onClick={() => go({ n: 'groups' })}>Grupos de actividades</button>
      <div class="section">Plantillas base</div>
      {TEMPLATES.map((t, i) => (
        <div class="card" key={t.name}>
          <div class="row between">
            <div class="grow"><h3>{t.name}</h3><p class="muted">{t.desc}</p></div>
            <button class="btn sm" onClick={() => loadTemplate(i)}>Agregar</button>
          </div>
        </div>
      ))}
    </>
  );
}
