import { importRoutines } from '../domain/importer';
import { TEMPLATES } from '../domain/templates';
import { getGoal } from '../domain/goals';
import { allGroups, daySummary } from '../domain/groups';
import { IS_ARTIFACT } from '../ai';
import { useDevice } from '../device';
import { addRoutines, getState, startSession, useStore } from '../store';
import { useSyncStatus } from '../sync';
import { Header, type Go } from '../ui';

export function loadTemplate(i: number) {
  const { routines, newExercises } = importRoutines(JSON.stringify(TEMPLATES[i]), getState().exercises);
  addRoutines(routines, newExercises);
  return routines[0]?.id;
}

export function Home({ go }: { go: Go }) {
  const s = useStore();
  const dev = useDevice();
  const sync = useSyncStatus();
  const routine = s.routines.find((r) => r.id === s.activeRoutineId);
  const last = [...s.sessions].reverse().find((x) => x.routineId === routine?.id);
  const lastIdx = routine?.days.findIndex((d) => d.id === last?.dayId) ?? -1;
  const nextId = routine?.days[(lastIdx + 1) % (routine.days.length || 1)]?.id;
  const groups = allGroups(s);
  const exById = new Map(s.exercises.map((e) => [e.id, e]));
  const start = (dayId: string) => { startSession(routine!.id, dayId); go({ n: 'workout' }); };

  return (
    <>
      <Header title="Hoy" right={
        <button class="btn sm" onClick={() => go({ n: 'settings' })} aria-label="Ajustes y cuenta">
          {(IS_ARTIFACT || dev.token) && <span class={'dot ' + sync.state} />}{IS_ARTIFACT ? 'Ajustes' : dev.token ? dev.username : 'Cuenta'} ⚙
        </button>} />
      {s.active && (
        <div class="card">
          <div class="row between">
            <div class="grow">
              <span class="tag accent">En curso</span>
              <h3 class="mt">{s.active.dayName}</h3>
            </div>
            <button class="btn primary" onClick={() => go({ n: 'workout' })}>Continuar</button>
          </div>
        </div>
      )}

      {!routine ? (
        <>
          <div class="card">
            <h3>Empezá con una rutina base</h3>
            <p class="muted mt">Plantillas de hipertrofia centradas en ejercicios compuestos. Después las podés editar.</p>
          </div>
          {TEMPLATES.map((t, i) => (
            <div class="card" key={t.name}>
              <div class="row between">
                <div class="grow">
                  <h3>{t.name}</h3>
                  <p class="muted">{t.desc}</p>
                </div>
                <button class="btn sm primary" onClick={() => loadTemplate(i)}>Usar</button>
              </div>
            </div>
          ))}
          <button class="btn block" onClick={() => go({ n: 'import' })}>Importar mi rutina (JSON o texto)</button>
        </>
      ) : (
        <>
          <p class="muted">{routine.name} · Meta: {getGoal(s.goal).name}</p>
          <div class="section">Elegí el día</div>
          {routine.days.map((d) => (
            <div class="card" key={d.id}>
              <div class="row between">
                <div class="grow">
                  {d.id === nextId && !s.active && <span class="tag accent">Te toca</span>}
                  <h3 class={d.id === nextId && !s.active ? 'mt' : ''}>{d.name}</h3>
                  <p class="muted">{daySummary(d.items, exById, groups)}</p>
                </div>
                <button class={'btn ' + (d.id === nextId ? 'primary' : '')} disabled={!!s.active || !d.items.length} onClick={() => start(d.id)}>
                  Entrenar
                </button>
              </div>
            </div>
          ))}
          {last?.post && (
            <>
              <div class="section">Última sesión</div>
              <button class="card list-btn" onClick={() => go({ n: 'session', id: last.id })}>
                <div class="grow">
                  <h3>{last.dayName}</h3>
                  <p class="muted">{new Date(last.startedAt).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })} · RPE {last.post.rpe} · Sensaciones {last.post.feeling}/10</p>
                </div>
                <span class="muted">›</span>
              </button>
            </>
          )}
        </>
      )}
    </>
  );
}
