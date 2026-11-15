import { useState } from 'preact/hooks';
import { DialogHost } from './dialog';
import { Coach } from './screens/Coach';
import { GoalScreen } from './screens/Goal';
import { Groups } from './screens/Groups';
import { History, SessionDetail } from './screens/History';
import { Home } from './screens/Home';
import { ImportScreen } from './screens/Import';
import { PostWorkout } from './screens/PostWorkout';
import { RoutineEditor } from './screens/RoutineEditor';
import { Routines } from './screens/Routines';
import { Settings } from './screens/Settings';
import { Workout } from './screens/Workout';
import type { View } from './ui';

const TABS: { v: View; label: string; icon: string }[] = [
  { v: { n: 'home' }, label: 'Hoy', icon: '●' },
  { v: { n: 'routines' }, label: 'Rutinas', icon: '☰' },
  { v: { n: 'goal' }, label: 'Meta', icon: '◎' },
  { v: { n: 'coach' }, label: 'Coach', icon: '✦' },
  { v: { n: 'history' }, label: 'Historial', icon: '◷' },
];

export function App() {
  const [view, setView] = useState<View>({ n: 'home' });
  const go = (v: View) => { setView(v); window.scrollTo(0, 0); };
  const fullscreen = view.n === 'workout' || view.n === 'post';

  return (
    <div class="shell">
      <main class={fullscreen ? 'full' : ''}>
        {view.n === 'home' && <Home go={go} />}
        {view.n === 'routines' && <Routines go={go} />}
        {view.n === 'routine' && <RoutineEditor id={view.id} go={go} />}
        {view.n === 'import' && <ImportScreen go={go} />}
        {view.n === 'workout' && <Workout go={go} />}
        {view.n === 'post' && <PostWorkout go={go} />}
        {view.n === 'session' && <SessionDetail id={view.id} go={go} />}
        {view.n === 'goal' && <GoalScreen />}
        {view.n === 'coach' && <Coach go={go} />}
        {view.n === 'settings' && <Settings go={go} />}
        {view.n === 'groups' && <Groups go={go} />}
        {view.n === 'history' && <History go={go} />}
      </main>
      <DialogHost />
      {!fullscreen && (
        <nav class="tabs">
          {TABS.map((t) => (
            <button key={t.label} class={t.v.n === view.n ? 'on' : ''} onClick={() => go(t.v)}>
              <i>{t.icon}</i>{t.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
