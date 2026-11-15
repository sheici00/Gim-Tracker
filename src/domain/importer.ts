import { defaultBlock, defaultIncrement } from './exercises';
import type { Category, Exercise, ExType, Muscle, Routine, RoutineDay, RoutineItem } from './types';
import { uid } from './types';

export interface ImportResult {
  routines: Routine[];
  newExercises: Exercise[];
  warnings: string[];
}

const STOP = new Set(['de', 'del', 'con', 'en', 'la', 'el', 'los', 'las', 'a', 'al', 'y']);
export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ');

// Heurística para clasificar ejercicios que no están en la biblioteca.
// Actividades que no son de fuerza: se asignan a su grupo y se miden por tiempo.
const GUESS_GROUP: [RegExp, 'movilidad' | 'aerobico'][] = [
  [/movilidad|estiramiento|elongacion|stretch|rotacion|circulos|foam|liberacion/, 'movilidad'],
  [/cinta|trote|correr|running|caminata|bici|spinning|eliptic|ergometro|soga|cuerda|cardio|aerobic|hiit|intervalos|natacion|escalador/, 'aerobico'],
];

const GUESS: [RegExp, Category, Muscle, ExType][] = [
  [/sentadilla|squat|prensa|zancada|estocada|bulgara/, 'rodilla', 'cuadriceps', 'compuesto'],
  [/cuadriceps|extension pierna/, 'rodilla', 'cuadriceps', 'aislamiento'],
  [/peso muerto|deadlift|rumano|hip thrust|buenos dias/, 'cadera', 'isquios', 'compuesto'],
  [/femoral|isquio|gluteo|patada/, 'cadera', 'isquios', 'aislamiento'],
  [/gemelo|soleo|pantorrilla/, 'accesorio', 'gemelos', 'aislamiento'],
  [/dominada|jalon|pull ?up|chin/, 'traccion_v', 'espalda', 'compuesto'],
  [/remo|row/, 'traccion_h', 'espalda', 'compuesto'],
  [/face ?pull|posterior|pajaro/, 'traccion_h', 'hombros', 'aislamiento'],
  [/militar|press hombro|overhead|arnold/, 'empuje_v', 'hombros', 'compuesto'],
  [/lateral|frontal|vuelo/, 'accesorio', 'hombros', 'aislamiento'],
  [/curl|biceps/, 'accesorio', 'biceps', 'aislamiento'],
  [/triceps|frances|pushdown/, 'accesorio', 'triceps', 'aislamiento'],
  [/apertura|cruce|fly|pec ?deck|mariposa/, 'accesorio', 'pecho', 'aislamiento'],
  [/press|banca|bench|fondo|flexion|pecho/, 'empuje_h', 'pecho', 'compuesto'],
  [/abdominal|crunch|plancha|core|oblicuo/, 'core', 'core', 'aislamiento'],
];

function guessExercise(name: string, groupHint?: string): Exercise {
  const n = norm(name);
  const g = norm(groupHint ?? '');
  const group = /movilidad|estiramiento/.test(g) ? 'movilidad' : /aerobic|cardio/.test(g) ? 'aerobico' : GUESS_GROUP.find(([re]) => re.test(n))?.[1];
  if (group) return { id: 'c_' + uid(), name: name.trim(), category: 'accesorio', muscle: 'core', secondary: [], type: 'aislamiento', group, custom: true };
  const hit = GUESS.find(([re]) => re.test(n));
  const [, category, muscle, type] = hit ?? [null, 'accesorio' as Category, 'core' as Muscle, 'aislamiento' as ExType];
  return { id: 'c_' + uid(), name: name.trim(), category, muscle, secondary: [], type, custom: true };
}

function matchExercise(name: string, library: Exercise[]): Exercise | undefined {
  const n = norm(name);
  if (!n) return undefined;
  const exact = library.find((e) => norm(e.name) === n || e.aliases?.some((a) => norm(a) === n));
  if (exact) return exact;
  // Coincidencia por solapamiento de palabras (Jaccard >= 0,6).
  const tokens = new Set(n.split(' '));
  let best: Exercise | undefined;
  let bestScore = 0;
  for (const e of library)
    for (const cand of [e.name, ...(e.aliases ?? [])]) {
      const ct = new Set(norm(cand).split(' '));
      const inter = [...tokens].filter((t) => ct.has(t)).length;
      const score = inter / (tokens.size + ct.size - inter);
      if (score > bestScore) { bestScore = score; best = e; }
    }
  return bestScore >= 0.6 ? best : undefined;
}

interface RawItem {
  name: string; sets: number; repMin: number; repMax: number;
  weight?: number; increment?: number; block?: string; unit?: 'reps' | 'seg' | 'min'; group?: string;
  setWeights?: number[]; restSec?: number; targetRpe?: number; tempo?: string; notes?: string;
}
interface RawDay { name: string; notes?: string; items: RawItem[] }
interface RawRoutine { name: string; notes?: string; days: RawDay[] }

const LB = 0.4536;
const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')));
const opt = (n: number) => (isNaN(n) ? undefined : n);
const str = (v: unknown) => (v == null || String(v).trim() === '' ? undefined : String(v).trim());
const half = (kg: number) => Math.round(kg * 2) / 2;

function parseReps(v: unknown): [number, number] | null {
  const m = String(v ?? '').match(/(\d+)(?:\s*(?:-|–|a)\s*(\d+))?/);
  if (!m) return null;
  const a = +m[1], b = m[2] ? +m[2] : a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** "90", "90s", "2 min", "1:30", "2'" -> segundos. */
export function parseRest(v: unknown): number | undefined {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : undefined;
  const s = String(v ?? '').trim().toLowerCase();
  let m = s.match(/^(\d+):(\d{2})/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/(\d+(?:[.,]\d+)?)\s*(min|m\b|')/);
  if (m && !s.includes("''")) return Math.round(num(m[1]) * 60);
  m = s.match(/(\d+)/);
  return m ? +m[1] : undefined;
}

/** "80", "80 kg", "175 lb", "60/70/80" -> peso único o un peso por serie, en kg. */
function parseWeights(v: unknown): { weight?: number; setWeights?: number[] } {
  if (typeof v === 'number') return { weight: v };
  if (Array.isArray(v)) { const a = v.map(num).filter((n) => !isNaN(n)); return a.length > 1 ? { setWeights: a, weight: Math.min(...a) } : { weight: a[0] }; }
  const s = String(v ?? '').toLowerCase();
  const k = /lb/.test(s) ? LB : 1;
  const list = [...s.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => (k === 1 ? num(m[0]) : half(num(m[0]) * k)));
  if (!list.length) return {};
  return list.length > 1 && /[\/,;|-]/.test(s) && new Set(list).size > 1 ? { setWeights: list, weight: Math.min(...list) } : { weight: list[0] };
}

/* ---------- JSON (formato unificado y variantes) ---------- */
function fromJson(data: any, warnings: string[]): RawRoutine[] {
  const list = Array.isArray(data) ? data : Array.isArray(data?.routines) ? data.routines : Array.isArray(data?.rutinas) ? data.rutinas : [data];
  const out: RawRoutine[] = [];
  for (const r of list) {
    const daysIn = r?.days ?? r?.dias ?? r?.días;
    if (!Array.isArray(daysIn)) { warnings.push('Se ignoró un elemento sin "days".'); continue; }
    const days: RawDay[] = daysIn.map((d: any, i: number) => ({
      name: String(d.name ?? d.nombre ?? d.day ?? d.dia ?? `Día ${i + 1}`),
      notes: str(d.notes ?? d.notas),
      items: (d.exercises ?? d.ejercicios ?? d.items ?? []).flatMap((x: any): RawItem[] => {
        const name = String(x.name ?? x.nombre ?? x.exercise ?? x.ejercicio ?? '').trim();
        const reps = x.repMin != null ? [num(x.repMin), num(x.repMax ?? x.repMin)] : parseReps(x.reps ?? x.repeticiones);
        const sets = num(x.sets ?? x.series);
        if (!name || !reps || !(sets > 0) || isNaN(reps[0])) { warnings.push(`Ejercicio inválido en "${d.name ?? i + 1}": ${JSON.stringify(x).slice(0, 60)}`); return []; }
        const w = parseWeights(x.setWeights ?? x.pesos ?? x.weight ?? x.peso ?? x.kg);
        if (x.setWeights == null && x.pesos == null) delete w.setWeights;
        const rpe = num(x.targetRpe ?? x.rpe), rir = num(x.rir);
        return [{
          name, sets, repMin: Math.min(reps[0], reps[1]), repMax: Math.max(reps[0], reps[1]),
          ...w, weight: opt(num(x.weight ?? x.peso ?? x.kg)) ?? w.weight,
          increment: opt(num(x.increment ?? x.incremento ?? x.salto)),
          block: str(x.block ?? x.bloque ?? x.superset ?? x.superserie),
          unit: /^min/i.test(String(x.unit ?? x.unidad ?? '')) ? 'min' : /^seg|^sec|^s$/i.test(String(x.unit ?? x.unidad ?? '')) ? 'seg' : undefined,
          group: str(x.group ?? x.grupo),
          restSec: parseRest(x.restSec ?? x.rest ?? x.descanso),
          targetRpe: opt(rpe) ?? (isNaN(rir) ? undefined : 10 - rir),
          tempo: str(x.tempo), notes: str(x.notes ?? x.notas ?? x.nota),
        }];
      }),
    }));
    out.push({ name: String(r.name ?? r.nombre ?? 'Rutina importada'), notes: str(r.notes ?? r.notas), days });
  }
  return out;
}

/* ---------- Texto libre ----------
   Rutina: Torso / Pierna
   Día 1 - Torso
   Press de banca 4x6-8 @80 RPE 8 descanso 2min
   - Sentadilla: 3 x 5 @100/110/120
   Plancha 3x30-60s
*/
const EX_LINE = /^\s*(?:[-*•]|\d+[.)])?\s*(.+?)[\s:–-]+(\d+)\s*[xX×]\s*(\d+)(?:\s*(?:-|–|a)\s*(\d+))?(.*)$/;

function parseExerciseLine(line: string): RawItem | null {
  const m = line.match(EX_LINE);
  if (!m) return null;
  const a = +m[3], b = m[4] ? +m[4] : a;
  let rest = m[5];
  const item: RawItem = { name: m[1].trim(), sets: +m[2], repMin: Math.min(a, b), repMax: Math.max(a, b) };
  if (/^\s*(min|minutos|')(?![a-z])/i.test(rest)) { item.unit = 'min'; rest = rest.replace(/^\s*(minutos|min|')/i, ''); }
  else if (/^\s*(s|seg|segundos|")(?![a-z])/i.test(rest)) { item.unit = 'seg'; rest = rest.replace(/^\s*(segundos|seg|s|")/i, ''); }
  const take = (re: RegExp) => { const x = rest.match(re); if (x) rest = rest.replace(x[0], ' '); return x; };
  const rpe = take(/rpe\s*:?\s*(\d+(?:[.,]\d+)?)/i);
  const rir = take(/rir\s*:?\s*(\d+)/i);
  if (rpe) item.targetRpe = num(rpe[1]); else if (rir) item.targetRpe = 10 - +rir[1];
  const tempo = take(/tempo\s*:?\s*(\d[\dxX]?(?:-[\dxX]){2,3})/i);
  if (tempo) item.tempo = tempo[1];
  const pause = take(/(?:desc(?:anso)?|rest|pausa)\.?\s*:?\s*(\d+(?::\d{2})?(?:[.,]\d+)?\s*(?:min|m\b|seg|s\b|''|'|")?)/i);
  if (pause) item.restSec = parseRest(pause[1]);
  const w = take(/@\s*((?:\d+(?:[.,]\d+)?\s*(?:kg|lbs?)?\s*[\/]?\s*)+)|((?:\d+(?:[.,]\d+)?\s*[\/]\s*)*\d+(?:[.,]\d+)?\s*(?:kg|lbs?))/i);
  if (w) Object.assign(item, parseWeights(w[1] ?? w[2]));
  const note = rest.replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,;.:–-]+|[\s,;:–-]+$/g, '');
  if (note.length > 2) item.notes = note;
  return item;
}

function fromText(text: string, warnings: string[]): RawRoutine[] {
  const out: RawRoutine[] = [];
  let routine: RawRoutine | null = null;
  let day: RawDay | null = null;
  const ensureRoutine = () => (routine ??= (out.push({ name: 'Rutina importada', days: [] }), out[out.length - 1]));

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const item = parseExerciseLine(line);
    if (item) {
      const r = ensureRoutine();
      if (!day) { day = { name: `Día ${r.days.length + 1}`, items: [] }; r.days.push(day); }
      day.items.push(item);
      continue;
    }
    const header = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/[:：]\s*$/, '').trim();
    const rn = header.match(/^rutina\s*[:\-–]?\s*(.+)$/i);
    if (rn) { routine = { name: rn[1].trim(), days: [] }; out.push(routine); day = null; continue; }
    if (!header) continue;
    day = { name: header, items: [] };
    ensureRoutine().days.push(day);
  }
  if (!out.some((r) => r.days.some((d) => d.items.length))) warnings.push('No se encontró ningún ejercicio con formato "Nombre 4x8-10".');
  return out;
}

/* ---------- Tablas: CSV, TSV, Excel, Markdown ---------- */
type Col = 'day' | 'name' | 'sets' | 'reps' | 'weight' | 'rest' | 'rpe' | 'rir' | 'tempo' | 'notes' | 'block' | 'group';
const HEADERS: [Col, RegExp][] = [
  ['day', /^(dia|day|jornada|sesion)s?$/],
  ['name', /^(ejercicio|exercise|nombre|movimiento|name)s?$/],
  ['sets', /^(series?|sets?)$/],
  ['reps', /^(reps?|repeticiones|rango|rango reps|repetitions)$/],
  ['weight', /^(peso|pesos|kg|carga|weight|load|peso kg)$/],
  ['rest', /^(descanso|rest|pausa|descanso seg|descanso s)$/],
  ['rpe', /^rpe( objetivo)?$/], ['rir', /^rir$/], ['tempo', /^tempo$/],
  ['notes', /^(notas?|observacion(es)?|notes?|comentarios?|indicaciones)$/],
  ['block', /^(bloque|superserie|block|superset)$/],
  ['group', /^(grupo|tipo|actividad|categoria|group|type)$/],
];
const headerKey = (cell: string) => norm(cell.replace(/[()]/g, ' '));

function findHeader(rows: string[][]): { index: number; cols: Partial<Record<Col, number>> } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cols: Partial<Record<Col, number>> = {};
    rows[i].forEach((cell, c) => {
      const k = headerKey(cell);
      const hit = HEADERS.find(([col, re]) => re.test(k) && cols[col] === undefined);
      if (hit) cols[hit[0]] = c;
    });
    if (cols.name !== undefined && (cols.sets !== undefined || cols.reps !== undefined)) return { index: i, cols };
  }
  return null;
}

/** Convierte filas con encabezado (Ejercicio / Series / Reps / Peso…) en días. */
function fromTable(rows: string[][], fallbackDay: string | undefined, warnings: string[]): RawDay[] | null {
  const head = findHeader(rows);
  if (!head) return null;
  const { cols } = head;
  const days: RawDay[] = [];
  let day = null as RawDay | null;
  const openDay = (name: string) => { day = { name, items: [] }; days.push(day); };
  const cell = (r: string[], c: Col) => (cols[c] === undefined ? '' : (r[cols[c]!] ?? '').trim());

  for (const r of rows.slice(head.index + 1)) {
    const filled = r.filter((x) => x.trim());
    if (!filled.length) continue;
    const dayName = cell(r, 'day');
    if (dayName && dayName !== day?.name) openDay(/^\d+$/.test(dayName) ? `Día ${dayName}` : dayName);
    const name = cell(r, 'name');
    if (!name) { if (filled.length === 1 && filled[0] !== dayName) openDay(filled[0].trim()); continue; }

    let sets = num(cell(r, 'sets'));
    let reps = parseReps(cell(r, 'reps'));
    const combo = `${cell(r, 'sets')} ${cell(r, 'reps')}`.match(/(\d+)\s*[xX×]\s*(\d+)(?:\s*(?:-|–|a)\s*(\d+))?/);
    if (combo) { sets = +combo[1]; reps = parseReps(combo[3] ? `${combo[2]}-${combo[3]}` : combo[2]); }
    if (!(sets > 0) || !reps) {
      if (filled.length === 1) openDay(name); else warnings.push(`Fila sin series o repeticiones: "${name}".`);
      continue;
    }
    if (!day) openDay(fallbackDay ?? `Día ${days.length + 1}`);
    const rpe = num(cell(r, 'rpe')), rir = num(cell(r, 'rir'));
    day!.items.push({
      name, sets, repMin: reps[0], repMax: reps[1], ...parseWeights(cell(r, 'weight')),
      unit: /\d\s*(min|minutos|')\s*$/i.test(cell(r, 'reps')) ? 'min' : /\d\s*(s|seg|")\s*$/i.test(cell(r, 'reps')) ? 'seg' : undefined,
      group: str(cell(r, 'group')),
      restSec: cell(r, 'rest') ? parseRest(cell(r, 'rest')) : undefined,
      targetRpe: opt(rpe) ?? (isNaN(rir) ? undefined : 10 - rir),
      tempo: str(cell(r, 'tempo')), notes: str(cell(r, 'notes')), block: str(cell(r, 'block')),
    });
  }
  return days;
}

/** Parte texto delimitado (coma, punto y coma, tabulación o barras de Markdown) en celdas. */
function splitDelimited(text: string): string[][] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sample = lines.slice(0, 8).join('\n');
  const delim = ['\t', ';', '|', ','].map((d) => [d, sample.split(d).length - 1] as const).sort((a, b) => b[1] - a[1])[0];
  if (delim[1] < lines.slice(0, 8).length) return null;
  const d = delim[0];
  const rows = lines
    .filter((l) => !/^[\s|:-]+$/.test(l)) // separador de tabla Markdown
    .map((l) => {
      const cells: string[] = [];
      let cur = '', quoted = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') { if (quoted && l[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
        else if (ch === d && !quoted) { cells.push(cur); cur = ''; }
        else cur += ch;
      }
      cells.push(cur);
      if (d === '|') { if (!cells[0].trim()) cells.shift(); if (cells.length && !cells[cells.length - 1].trim()) cells.pop(); }
      return cells.map((c) => c.trim());
    });
  return findHeader(rows) ? rows : null;
}

export interface Sheet { name: string; rows: unknown[][] }

function fromSheets(sheets: Sheet[], routineName: string, warnings: string[]): RawRoutine[] {
  const routine: RawRoutine = { name: routineName, days: [] };
  const extra: RawRoutine[] = [];
  for (const sh of sheets) {
    const rows = sh.rows.map((r) => r.map((c) => (c == null ? '' : String(c))));
    const days = fromTable(rows, sheets.length > 1 ? sh.name : undefined, warnings);
    if (days) routine.days.push(...days);
    else {
      // Hoja sin encabezados reconocibles: se lee como texto libre, una fila por línea.
      const parsed = fromText(rows.map((r) => r.filter(Boolean).join(' ')).join('\n'), []);
      for (const p of parsed) (p.name === 'Rutina importada' ? routine.days.push(...p.days) : extra.push(p));
    }
  }
  return [routine, ...extra];
}

/* ---------- Unificación ---------- */
function finalize(raw: RawRoutine[], library: Exercise[], warnings: string[]): ImportResult {
  const lib = [...library];
  const newExercises: Exercise[] = [];
  const routines: Routine[] = raw.map((r) => ({
    id: uid(),
    name: r.name,
    notes: r.notes,
    days: r.days.filter((d) => d.items.length).map((d): RoutineDay => ({
      id: uid(),
      name: d.name,
      notes: d.notes,
      items: d.items.map((it): RoutineItem => {
        let ex = matchExercise(it.name, lib);
        if (!ex) {
          ex = guessExercise(it.name, it.group);
          lib.push(ex); newExercises.push(ex);
          warnings.push(ex.group
            ? `"${it.name}" no estaba en la biblioteca: se creó en el grupo ${ex.group === 'movilidad' ? 'Movilidad articular' : 'Aeróbico'} (revisalo).`
            : `"${it.name}" no estaba en la biblioteca: se creó como ${ex.type} de ${ex.muscle} (revisalo).`);
        }
        const sets = Math.max(1, Math.round(it.sets));
        // Movilidad y aeróbico se miden por tiempo aunque el original no lo aclare.
        const timed = ex.group === 'movilidad' ? 'seg' : ex.group === 'aerobico' ? 'min' : undefined;
        const setWeights = it.setWeights && it.setWeights.length > 1
          ? Array.from({ length: sets }, (_, i) => it.setWeights![Math.min(i, it.setWeights!.length - 1)]) : undefined;
        return {
          id: uid(), exerciseId: ex.id, block: it.block ?? (ex.group === 'movilidad' ? 'Movilidad' : ex.group === 'aerobico' ? 'Aeróbico' : defaultBlock(ex)),
          sets, repMin: it.repMin, repMax: it.repMax,
          weight: setWeights ? Math.min(...setWeights) : it.weight ?? 0,
          increment: it.increment ?? (timed ? 0 : defaultIncrement(ex)),
          unit: it.unit ?? timed, setWeights, restSec: it.restSec, targetRpe: it.targetRpe, tempo: it.tempo, notes: it.notes,
        };
      }),
    })),
  })).filter((r) => r.days.length);
  // Sin claves undefined: el estado se guarda y se compara como JSON.
  return { routines: JSON.parse(JSON.stringify(routines)), newExercises, warnings };
}

/** Convierte JSON, tablas (CSV/TSV/Markdown) o texto libre al formato unificado de rutinas. */
export function importRoutines(input: string, library: Exercise[]): ImportResult {
  const warnings: string[] = [];
  const trimmed = input.trim();
  let raw: RawRoutine[];
  if (/^[\[{]/.test(trimmed)) {
    try { raw = fromJson(JSON.parse(trimmed), warnings); }
    catch (e) { return { routines: [], newExercises: [], warnings: ['JSON inválido: ' + (e as Error).message] }; }
  } else {
    const table = splitDelimited(trimmed);
    const days = table && fromTable(table, undefined, warnings);
    raw = days ? [{ name: 'Rutina importada', days }] : fromText(trimmed, warnings);
  }
  return finalize(raw, library, warnings);
}

/** Importa las hojas de una planilla Excel (cada hoja puede ser un día). */
export function importSheets(sheets: Sheet[], routineName: string, library: Exercise[]): ImportResult {
  const warnings: string[] = [];
  const res = finalize(fromSheets(sheets, routineName, warnings), library, warnings);
  if (!res.routines.length) warnings.push('No se reconocieron ejercicios en la planilla.');
  return res;
}

/** Exporta una rutina en el formato unificado (el mismo JSON que acepta el importador). */
export function exportRoutine(routine: Routine, exercises: Exercise[]) {
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  return {
    format: 'gym-tracker-routine', version: 1, name: routine.name, notes: routine.notes,
    days: routine.days.map((d) => ({
      name: d.name, notes: d.notes,
      exercises: d.items.map(({ id: _id, exerciseId, ...rest }) => ({ name: names.get(exerciseId) ?? 'Ejercicio', ...rest })),
    })),
  };
}
