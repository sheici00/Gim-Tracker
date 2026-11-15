import { describe, expect, it } from 'vitest';
import { audit } from '../src/domain/coach';
import { SEED_EXERCISES } from '../src/domain/exercises';
import { importRoutines } from '../src/domain/importer';
import { suggestFor } from '../src/domain/progression';
import { TEMPLATES } from '../src/domain/templates';
import type { AppState, PostMetrics, SessionEntry } from '../src/domain/types';

const post = (p: Partial<PostMetrics> = {}): PostMetrics => ({ rpe: 8, feeling: 7, hard: [], pain: [], notes: '', ...p });
const entry = (reps: number[], weight = 80): SessionEntry => ({
  itemId: 'i', exerciseId: 'press_banca', repMin: 6, repMax: 8, targetWeight: weight, increment: 2.5,
  sets: reps.map((r) => ({ weight, reps: r, done: true })),
});

describe('auto-regulación', () => {
  it('sube el salto completo si todas las series llegan al tope', () => {
    expect(suggestFor(entry([8, 8, 8]), post())).toMatchObject({ action: 'subir', to: 82.5 });
  });
  it('microcarga si se cumplió pero costó', () => {
    expect(suggestFor(entry([8, 8, 8]), post({ hard: ['press_banca'] }))).toMatchObject({ action: 'microcarga', to: 81.25 });
  });
  it('mantiene dentro del rango', () => {
    expect(suggestFor(entry([8, 7, 6]), post())).toMatchObject({ action: 'mantener', to: 80 });
  });
  it('no sube con fatiga extrema', () => {
    expect(suggestFor(entry([8, 8, 8]), post({ rpe: 10 })).action).toBe('mantener');
  });
  it('baja con molestia', () => {
    expect(suggestFor(entry([8, 8, 8]), post({ pain: ['press_banca'] }))).toMatchObject({ action: 'bajar', to: 72 });
  });
  it('descarga tras dos sesiones bajo el mínimo', () => {
    expect(suggestFor(entry([6, 5, 4]), post()).action).toBe('mantener');
    expect(suggestFor(entry([6, 5, 4]), post(), entry([5, 5, 4]))).toMatchObject({ action: 'bajar', to: 72 });
  });
});

describe('importador', () => {
  it('parsea texto libre y reconoce ejercicios de la biblioteca', () => {
    const r = importRoutines(
      'Rutina: Prueba\nDía 1 - Torso\nPress banca 4x6-8 @80\n- Remo con barra: 4 x 8 a 10 (62,5kg)\n\nDía 2\n1. Sentadilla 5x5\nCurl araña 3x12',
      SEED_EXERCISES,
    );
    const [rt] = r.routines;
    expect(rt.name).toBe('Prueba');
    expect(rt.days.map((d) => d.name)).toEqual(['Día 1 - Torso', 'Día 2']);
    expect(rt.days[0].items[0]).toMatchObject({ exerciseId: 'press_banca', sets: 4, repMin: 6, repMax: 8, weight: 80 });
    expect(rt.days[0].items[1]).toMatchObject({ exerciseId: 'remo_barra', repMin: 8, repMax: 10, weight: 62.5 });
    expect(rt.days[1].items[0]).toMatchObject({ exerciseId: 'sentadilla', sets: 5, repMin: 5, repMax: 5 });
    expect(r.newExercises).toHaveLength(1);
    expect(r.newExercises[0]).toMatchObject({ muscle: 'biceps', type: 'aislamiento' });
  });
  it('las plantillas usan solo ejercicios de la biblioteca', () => {
    for (const t of TEMPLATES) {
      const r = importRoutines(JSON.stringify(t), SEED_EXERCISES);
      expect(r.newExercises).toEqual([]);
      expect(r.routines[0].days).toHaveLength(t.days.length);
    }
  });
  it('informa JSON inválido', () => {
    expect(importRoutines('{ "name": ', SEED_EXERCISES).warnings[0]).toMatch(/JSON inválido/);
  });
});

describe('coach', () => {
  const stateWith = (text: string): AppState => {
    const { routines } = importRoutines(text, SEED_EXERCISES);
    return { version: 1, exercises: SEED_EXERCISES, routines, sessions: [], activeRoutineId: routines[0].id, goal: 'hipertrofia_general', active: null, deleted: {}, prefsAt: 0, groups: [] };
  };
  it('detecta exceso de empuje y falta de cadena posterior', () => {
    const titles = audit(stateWith('Día 1\nPress de banca 5x8\nPress militar 4x8\nFondos 4x8\nRemo con barra 3x8\nSentadilla 5x8\nPrensa 4x10')).map((f) => f.title);
    expect(titles).toContain('Exceso de empuje vs. tracción');
    expect(titles).toContain('Falta cadena posterior');
  });
  it('no marca desbalances estructurales en la plantilla torso/pierna', () => {
    const titles = audit(stateWith(JSON.stringify(TEMPLATES[0]))).map((f) => f.title);
    expect(titles).not.toContain('Exceso de empuje vs. tracción');
    expect(titles).not.toContain('Falta cadena posterior');
  });
});

import { exportRoutine, importSheets, parseRest } from '../src/domain/importer';
import { mergeDocs, sameDoc, type SyncDoc } from '../src/domain/merge';

describe('formatos de importación', () => {
  it('texto con datos extra: pesos por serie, RPE, descanso, tiempo y notas', () => {
    const [rt] = importRoutines('Día 1\nSentadilla 3x5 @100/110/120 RPE 8 descanso 3min\nPlancha 3x30-60s\nCurl con barra 3x10-12 30kg tempo 3-1-1-0 (agarre ancho)', SEED_EXERCISES).routines;
    const [sq, pl, curl] = rt.days[0].items;
    expect(sq).toMatchObject({ setWeights: [100, 110, 120], weight: 100, targetRpe: 8, restSec: 180 });
    expect(pl).toMatchObject({ exerciseId: 'plancha', unit: 'seg', repMin: 30, repMax: 60 });
    expect(curl).toMatchObject({ weight: 30, tempo: '3-1-1-0', notes: 'agarre ancho' });
  });
  it('CSV con encabezados en español y punto y coma', () => {
    const csv = 'Día;Ejercicio;Series;Reps;Peso (kg);Descanso;RIR;Notas\nLunes;Press de banca;4;6-8;80;120;2;pausa abajo\nLunes;Remo con barra;4;8-10;62,5;90;;\nJueves;Sentadilla;5;5;100;180;;';
    const [rt] = importRoutines(csv, SEED_EXERCISES).routines;
    expect(rt.days.map((d) => d.name)).toEqual(['Lunes', 'Jueves']);
    expect(rt.days[0].items[0]).toMatchObject({ exerciseId: 'press_banca', sets: 4, repMin: 6, repMax: 8, weight: 80, restSec: 120, targetRpe: 8, notes: 'pausa abajo' });
    expect(rt.days[0].items[1].weight).toBe(62.5);
  });
  it('tabla Markdown con "4x8-10" en una sola columna y libras', () => {
    const md = '| Exercise | Sets | Weight |\n|---|---|---|\n| Bench press | 4x8-10 | 175 lb |\n| Squat | 3x5 | 225 lbs |';
    const items = importRoutines(md, SEED_EXERCISES).routines[0].days[0].items;
    expect(items[0]).toMatchObject({ exerciseId: 'press_banca', sets: 4, repMin: 8, repMax: 10, weight: 79.5 });
    expect(items[1]).toMatchObject({ exerciseId: 'sentadilla', weight: 102 });
  });
  it('Excel: una hoja por día', () => {
    const r = importSheets([
      { name: 'Torso', rows: [['Rutina de Juan'], ['Ejercicio', 'Series', 'Repeticiones', 'Kg'], ['Press militar', 3, '8-10', 40]] },
      { name: 'Pierna', rows: [['Ejercicio', 'Series', 'Repeticiones', 'Kg'], ['Prensa', 4, 12, 180], [null, null, null, null]] },
    ], 'planilla', SEED_EXERCISES);
    expect(r.routines[0].name).toBe('planilla');
    expect(r.routines[0].days.map((d) => d.name)).toEqual(['Torso', 'Pierna']);
    expect(r.routines[0].days[1].items[0]).toMatchObject({ exerciseId: 'prensa', sets: 4, repMin: 12, weight: 180 });
  });
  it('exportar e importar el formato unificado conserva todo', () => {
    const [a] = importRoutines('Día 1\nSentadilla 3x5 @100/110/120 RPE 8 descanso 3min (profunda)', SEED_EXERCISES).routines;
    const [b] = importRoutines(JSON.stringify(exportRoutine(a, SEED_EXERCISES)), SEED_EXERCISES).routines;
    const strip = (r: typeof a) => r.days.map((d) => d.items.map(({ id: _i, ...x }) => x));
    expect(strip(b)).toEqual(strip(a));
  });
  it('descansos', () => {
    expect([parseRest('90s'), parseRest('2 min'), parseRest('1:30'), parseRest("2'"), parseRest(75)]).toEqual([90, 120, 90, 120, 75]);
  });
});

describe('sincronización', () => {
  const doc = (p: Partial<SyncDoc>): SyncDoc => ({ version: 1, exercises: [], groups: [], routines: [], sessions: [], activeRoutineId: null, goal: 'hipertrofia_general', deleted: {}, prefsAt: 0, ...p });
  const r = (id: string, name: string, updatedAt: number) => ({ id, name, days: [], updatedAt });
  const ses = (id: string, startedAt: number) => ({ id, routineId: 'r1', dayId: 'd', dayName: 'D', startedAt, entries: [], updatedAt: startedAt });

  it('une sesiones de dos dispositivos y gana la edición más reciente', () => {
    const phone = doc({ routines: [r('r1', 'vieja', 1)], sessions: [ses('s1', 10)], goal: 'fuerza_compuestos', prefsAt: 5 });
    const pc = doc({ routines: [r('r1', 'editada en PC', 2), r('r2', 'nueva', 3)], sessions: [ses('s2', 20)], prefsAt: 1 });
    const m = mergeDocs(phone, pc);
    expect(m.routines.map((x) => x.name)).toEqual(['editada en PC', 'nueva']);
    expect(m.sessions.map((x) => x.id)).toEqual(['s1', 's2']);
    expect(m.goal).toBe('fuerza_compuestos');
    expect(sameDoc(m, mergeDocs(pc, phone))).toBe(true);
    expect(sameDoc(m, mergeDocs(m, phone))).toBe(true);
  });
  it('propaga los borrados', () => {
    const m = mergeDocs(doc({ routines: [r('r1', 'a', 1)], activeRoutineId: 'r1' }), doc({ deleted: { r1: 9 } }));
    expect(m.routines).toEqual([]);
    expect(m.activeRoutineId).toBeNull();
  });
});

import { BUILTIN_GROUPS, daySummary, strengthOnly } from '../src/domain/groups';
import { exMap, weeklySets } from '../src/domain/volume';

describe('grupos de actividades', () => {
  const text = 'Día 1\nMovilidad de cadera 90/90 2x30-60s\nPress de banca 4x6-8 @80\nCinta 1x20-30 min\nYoga restaurativo 1x15 min\nEstiramiento de pectoral 2x30s';
  const res = importRoutines(text, SEED_EXERCISES);
  const lib = [...SEED_EXERCISES, ...res.newExercises];
  const ex = exMap(lib);
  const items = res.routines[0].days[0].items;

  it('reconoce movilidad y aeróbico al importar y los mide por tiempo', () => {
    expect(items.map((i) => [ex.get(i.exerciseId)!.group ?? 'fuerza', i.unit ?? 'reps'])).toEqual([
      ['movilidad', 'seg'], ['fuerza', 'reps'], ['aerobico', 'min'], ['fuerza', 'min'], ['movilidad', 'seg'],
    ]);
    expect(items[2]).toMatchObject({ exerciseId: 'aer_cinta', sets: 1, repMin: 20, repMax: 30, weight: 0, increment: 0 });
  });
  it('el volumen muscular solo cuenta los ejercicios con peso', () => {
    const strength = strengthOnly(res.routines[0], ex, BUILTIN_GROUPS);
    expect(strength.days[0].items).toHaveLength(2);
    expect(weeklySets(strength, ex).pecho).toBe(4);
    expect(daySummary(items, ex, BUILTIN_GROUPS)).toBe('2 gimnasio (fuerza) · 2 movilidad articular · 1 aeróbico');
  });
  it('el coach avisa si falta movilidad o aeróbico, y no si están', () => {
    const state = (t: string): AppState => {
      const r = importRoutines(t, SEED_EXERCISES);
      return { version: 1, exercises: [...SEED_EXERCISES, ...r.newExercises], groups: [], routines: r.routines, sessions: [], activeRoutineId: r.routines[0].id, goal: 'hipertrofia_general', active: null, deleted: {}, prefsAt: 0 };
    };
    const without = audit(state('Día 1\nPress de banca 4x8')).map((f) => f.title);
    expect(without).toEqual(expect.arrayContaining(['Sin movilidad articular', 'Sin trabajo aeróbico']));
    const withBoth = audit(state('Día 1\nPress de banca 4x8\nGato-camello 2x30s\nBicicleta fija 3x30 min')).map((f) => f.title);
    expect(withBoth.some((t) => /movilidad|aeróbico/i.test(t))).toBe(false);
  });
  it('los grupos propios y los ejercicios movidos se sincronizan', () => {
    const base = { version: 1 as const, routines: [], sessions: [], activeRoutineId: null, goal: 'hipertrofia_general' as const, deleted: {}, prefsAt: 0 };
    const phone = { ...base, groups: [{ id: 'g1', name: 'Rehabilitación', measure: 'seg' as const, updatedAt: 5 }], exercises: [{ ...SEED_EXERCISES[0], group: 'g1', updatedAt: 6 }] };
    const pc = { ...base, groups: [], exercises: [SEED_EXERCISES[0]] };
    const m = mergeDocs(pc, phone);
    expect(m.groups.map((g) => g.name)).toEqual(['Rehabilitación']);
    expect(m.exercises[0].group).toBe('g1');
    expect(mergeDocs(m, { ...pc, deleted: { g1: 9 } }).groups).toEqual([]);
  });
});
