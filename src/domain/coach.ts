import { getGoal } from './goals';
import { allGroups, groupOf, strengthOnly } from './groups';
import type { AppState, Exercise, Muscle, Routine, Session } from './types';
import { CATEGORY_LABEL, MUSCLE_LABEL, MUSCLES } from './types';
import { categorySets, e1rm, exMap, muscleFrequency, weeklySets } from './volume';

export type Severity = 'alta' | 'media' | 'info' | 'ok';
export interface Finding { severity: Severity; title: string; detail: string; action: string }

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Ejercicios recomendados para un músculo: compuestos primero, sin repetir los de la rutina. */
export function picksFor(muscle: Muscle, exercises: Exercise[], routine: Routine | undefined, compoundOnly = false): Exercise[] {
  const used = new Set(routine?.days.flatMap((d) => d.items.map((i) => i.exerciseId)));
  return exercises
    .filter((e) => e.muscle === muscle && !used.has(e.id) && (!compoundOnly || e.type === 'compuesto'))
    .sort((a, b) => Number(b.type === 'compuesto') - Number(a.type === 'compuesto'))
    .slice(0, 3);
}

/**
 * Coach virtual: motor de reglas local (no usa la nube). Cruza la estructura de
 * la rutina con la meta elegida y con el historial de sesiones.
 */
export function audit(state: AppState): Finding[] {
  const full = state.routines.find((r) => r.id === state.activeRoutineId);
  if (!full || !full.days.length)
    return [{ severity: 'info', title: 'Sin rutina activa', detail: 'Elegí o importá una rutina para poder auditarla.', action: 'Andá a Rutinas y marcá una como activa.' }];

  const goal = getGoal(state.goal);
  const ex = exMap(state.exercises);
  const groups = allGroups(state);
  // El balance y el volumen muscular se calculan solo con lo que se mide con peso.
  const routine = strengthOnly(full, ex, groups);
  const out: Finding[] = [];
  const cat = categorySets(routine, ex);
  const vol = weeklySets(routine, ex);
  const freq = muscleFrequency(routine, ex);
  const names = (m: Muscle) => picksFor(m, state.exercises, routine, goal.id === 'fuerza_compuestos').map((e) => e.name).join(', ');

  /* --- Balance estructural --- */
  const push = cat.empuje_h + cat.empuje_v;
  const pull = cat.traccion_h + cat.traccion_v;
  if (push > 0 && pull === 0)
    out.push({ severity: 'alta', title: 'No hay trabajo de tracción', detail: `${push} series semanales de empuje y ninguna de tracción.`, action: 'Sumá remos y dominadas/jalones hasta igualar las series de empuje.' });
  else if (pull > 0 && push / pull > 1.25)
    out.push({
      severity: push / pull > 1.5 ? 'alta' : 'media', title: 'Exceso de empuje vs. tracción',
      detail: `${push} series de empuje contra ${pull} de tracción (relación ${fmt(push / pull)}:1). Se recomienda 1:1 o algo más de tracción para la salud del hombro y la postura.`,
      action: `Agregá ~${Math.ceil(push - pull)} series de tracción (${names('espalda') || 'remos, jalones'}) o recortá empuje.`,
    });
  if (cat.empuje_h > 0 && cat.traccion_h < cat.empuje_h * 0.75)
    out.push({ severity: 'media', title: 'Poca tracción horizontal', detail: `${cat.traccion_h} series de remo/face pull frente a ${cat.empuje_h} de empuje horizontal.`, action: 'Sumá un remo o face pull: equilibran los press de pecho y cuidan la escápula.' });

  const lower = cat.rodilla + cat.cadera;
  if (lower === 0 && goal.id !== 'hipertrofia_superior')
    out.push({ severity: 'alta', title: 'No hay tren inferior', detail: 'La rutina no incluye ejercicios de piernas.', action: 'Incluí al menos una sentadilla/prensa y un peso muerto rumano/hip thrust.' });
  else if (cat.rodilla > 0 && cat.cadera < cat.rodilla * 0.6)
    out.push({
      severity: cat.cadera === 0 ? 'alta' : 'media', title: 'Falta cadena posterior',
      detail: `${cat.cadera} series dominantes de cadera frente a ${cat.rodilla} dominantes de rodilla. Isquios y glúteos quedan relegados respecto de cuádriceps.`,
      action: `Sumá ~${Math.ceil(cat.rodilla * 0.8 - cat.cadera)} series de ${names('isquios') || 'peso muerto rumano, curl femoral, hip thrust'}.`,
    });
  else if (cat.cadera > 0 && cat.rodilla < cat.cadera * 0.6)
    out.push({ severity: 'media', title: 'Poco trabajo de cuádriceps', detail: `${cat.rodilla} series dominantes de rodilla frente a ${cat.cadera} de cadera.`, action: 'Sumá sentadilla, prensa o búlgaras.' });

  /* --- Volumen por músculo según la meta --- */
  for (const m of MUSCLES) {
    const [min, max] = goal.targets[m];
    const pri = goal.priority.includes(m);
    if (vol[m] < min)
      out.push({
        severity: pri ? 'alta' : 'media', title: `Volumen bajo en ${MUSCLE_LABEL[m].toLowerCase()}`,
        detail: `${fmt(vol[m])} series semanales; para "${goal.name}" el rango es ${min}-${max}${pri ? ' (grupo prioritario)' : ''}.`,
        action: `Sumá ~${Math.ceil(min - vol[m])} series${names(m) ? `: ${names(m)}` : ''}.`,
      });
    else if (vol[m] > max)
      out.push({ severity: 'media', title: `Volumen alto en ${MUSCLE_LABEL[m].toLowerCase()}`, detail: `${fmt(vol[m])} series semanales, por encima del rango ${min}-${max}. Más volumen no siempre es más estímulo y resta recuperación.`, action: `Recortá ~${Math.ceil(vol[m] - max)} series y reasignalas a grupos con déficit.` });
    if (pri && freq[m] < 2 && routine.days.length >= 3 && vol[m] >= min)
      out.push({ severity: 'info', title: `${MUSCLE_LABEL[m]} una sola vez por semana`, detail: 'Con el mismo volumen, repartirlo en 2 sesiones suele rendir más que concentrarlo en una.', action: 'Mové parte de las series a otro día.' });
  }

  /* --- Calidad de la selección --- */
  const items = routine.days.flatMap((d) => d.items);
  const total = items.reduce((a, i) => a + i.sets, 0);
  const compound = items.reduce((a, i) => a + (ex.get(i.exerciseId)?.type === 'compuesto' ? i.sets : 0), 0);
  if (total > 0 && compound / total < goal.minCompoundRatio)
    out.push({ severity: 'media', title: 'Pocos ejercicios compuestos', detail: `${Math.round((compound / total) * 100)}% de las series son en compuestos; para esta meta conviene al menos ${Math.round(goal.minCompoundRatio * 100)}%.`, action: 'Reemplazá algún aislamiento por un multiarticular al inicio de la sesión.' });
  for (const d of routine.days) {
    const s = d.items.reduce((a, i) => a + i.sets, 0);
    if (s > 26) out.push({ severity: 'info', title: `"${d.name}" es una sesión muy larga`, detail: `${s} series en un día. Las últimas series suelen ser de baja calidad.`, action: 'Pasá 1-2 ejercicios a otro día.' });
  }

  /* --- Movilidad y aeróbico --- */
  const inGroup = (id: string) => full.days.flatMap((d) => d.items).filter((i) => groupOf(ex.get(i.exerciseId), groups).id === id);
  if (!inGroup('movilidad').length)
    out.push({ severity: 'info', title: 'Sin movilidad articular', detail: 'La rutina no incluye trabajo de movilidad.', action: 'Sumá 5-10 minutos de movilidad de cadera, columna torácica y hombros antes de entrenar.' });
  const aerobic = inGroup('aerobico');
  const minutes = aerobic.reduce((a, i) => a + i.sets * ((i.repMin + i.repMax) / 2) * (i.unit === 'seg' ? 1 / 60 : 1), 0);
  if (!aerobic.length)
    out.push({ severity: 'info', title: 'Sin trabajo aeróbico', detail: 'La rutina no incluye actividad aeróbica.', action: 'Para la salud cardiovascular se recomiendan 150 minutos semanales de intensidad moderada; podés sumarlos al final de la sesión o en días aparte.' });
  else if (minutes < 75)
    out.push({ severity: 'info', title: 'Poco volumen aeróbico', detail: `${Math.round(minutes)} minutos semanales planificados.`, action: 'La referencia general es de 150 minutos semanales de intensidad moderada, o 75 de intensidad alta.' });

  out.push(...auditHistory(state.sessions.filter((s) => s.routineId === routine.id), routine, ex));

  if (!out.some((f) => f.severity === 'alta' || f.severity === 'media'))
    out.unshift({ severity: 'ok', title: 'Rutina equilibrada', detail: `Empuje/tracción ${push}/${pull}, rodilla/cadera ${cat.rodilla}/${cat.cadera} y volumen dentro de los rangos de "${goal.name}".`, action: 'Seguí aplicando sobrecarga progresiva sesión a sesión.' });

  const rank = { alta: 0, media: 1, info: 2, ok: -1 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function auditHistory(sessions: Session[], routine: Routine, ex: Map<string, Exercise>): Finding[] {
  const out: Finding[] = [];
  const done = sessions.filter((s) => s.finishedAt && s.post).sort((a, b) => a.startedAt - b.startedAt);
  if (!done.length) return out;
  const name = (id: string) => ex.get(id)?.name ?? 'Ejercicio';

  // Fatiga acumulada
  const last3 = done.slice(-3);
  if (last3.length === 3) {
    const rpe = last3.reduce((a, s) => a + s.post!.rpe, 0) / 3;
    const feel = last3.reduce((a, s) => a + s.post!.feeling, 0) / 3;
    if (rpe >= 9 || feel <= 4.5)
      out.push({ severity: 'alta', title: 'Señales de fatiga acumulada', detail: `Últimas 3 sesiones: RPE promedio ${fmt(rpe)}, sensaciones ${fmt(feel)}/10.`, action: 'Hacé una semana de descarga: mismas cargas con la mitad de las series, o -10% de peso.' });
  }

  // Molestias y ejercicios que cuestan
  const recent = done.slice(-8);
  const count = (key: 'pain' | 'hard') => {
    const c = new Map<string, number>();
    recent.forEach((s) => s.post![key].forEach((id) => c.set(id, (c.get(id) ?? 0) + 1)));
    return c;
  };
  for (const [id, n] of count('pain'))
    if (n >= 2) out.push({ severity: 'alta', title: `Molestia recurrente: ${name(id)}`, detail: `Marcado con molestia ${n} veces en las últimas sesiones.`, action: 'Cambialo por una variante que no moleste (mancuernas, máquina, otro agarre o rango) y consultá si persiste.' });
  for (const [id, n] of count('hard'))
    if (n >= 3) out.push({ severity: 'info', title: `${name(id)} viene costando`, detail: `Marcado como difícil ${n} veces.`, action: 'Ubicalo primero en la sesión, alargá el descanso o bajá un 5% para consolidar.' });

  // Estancamiento: e1RM de la mejor serie sin mejorar en 3 sesiones
  const byItem = new Map<string, number[]>();
  for (const s of done)
    for (const e of s.entries) {
      const best = Math.max(0, ...e.sets.filter((x) => x.done && x.weight > 0).map((x) => e1rm(x.weight, x.reps)));
      if (best > 0) byItem.set(e.itemId, [...(byItem.get(e.itemId) ?? []), best]);
    }
  for (const d of routine.days)
    for (const it of d.items) {
      const h = byItem.get(it.id);
      if (h && h.length >= 3 && h[h.length - 1] <= h[h.length - 3] && ex.get(it.exerciseId)?.type === 'compuesto')
        out.push({ severity: 'media', title: `Estancamiento en ${name(it.exerciseId)}`, detail: 'La mejor serie (1RM estimado) no mejoró en las últimas 3 sesiones.', action: 'Probá una descarga del 10%, cambiar el rango de repeticiones o una variante durante 4 semanas.' });
    }

  // Adherencia
  const since = Date.now() - 28 * 864e5;
  const n = done.filter((s) => s.startedAt >= since).length;
  const planned = routine.days.length * 4;
  if (done[0].startedAt <= since && n < planned * 0.6)
    out.push({ severity: 'info', title: 'Adherencia baja', detail: `${n} sesiones en 4 semanas sobre ${planned} planificadas.`, action: 'Si no llegás con los días, pasá a una rutina de menos días: la constancia pesa más que el plan ideal.' });
  return out;
}

/** Rutina, balance e historial reciente como texto, para darle contexto a Claude. */
export function buildSummary(state: AppState): string {
  const routine = state.routines.find((r) => r.id === state.activeRoutineId);
  if (!routine) return 'El usuario todavía no tiene una rutina activa.';
  const ex = exMap(state.exercises);
  const goal = getGoal(state.goal);
  const groups = allGroups(state);
  const strength = strengthOnly(routine, ex, groups);
  const cat = categorySets(strength, ex);
  const vol = weeklySets(strength, ex);
  const lines = [`Meta: ${goal.name}.`, '', `RUTINA: ${routine.name}`];
  for (const d of routine.days) {
    lines.push(`\n${d.name}`);
    for (const i of d.items) {
      const e = ex.get(i.exerciseId);
      const g = groupOf(e, groups);
      lines.push((g.measure === 'peso'
        ? `- ${e?.name} (${e?.type}, ${e?.muscle}): ${i.sets}x${i.repMin}-${i.repMax}${i.unit === 'seg' ? ' seg' : ''} @ ${i.setWeights?.join('/') ?? i.weight} kg`
        : `- ${e?.name} [${g.name}]: ${i.sets}x${i.repMin}-${i.repMax} ${i.unit ?? g.measure}`) +
        (i.targetRpe ? `, RPE ${i.targetRpe}` : '') + (i.restSec ? `, descanso ${i.restSec}s` : '') + (i.notes ? `, nota: ${i.notes}` : ''));
    }
  }
  lines.push('\nSeries semanales por patrón:');
  for (const [k, v] of Object.entries(cat)) lines.push(`- ${CATEGORY_LABEL[k as keyof typeof cat]}: ${v}`);
  lines.push('\nSeries semanales por músculo (objetivo de la meta):');
  for (const m of MUSCLES) lines.push(`- ${MUSCLE_LABEL[m]}: ${fmt(vol[m])} (${goal.targets[m].join('-')})`);
  const done = state.sessions.filter((s) => s.post).slice(-8);
  if (done.length) {
    lines.push('\nÚltimas sesiones:');
    for (const s of done) {
      lines.push(`- ${new Date(s.startedAt).toLocaleDateString('es-AR')} ${s.dayName}: RPE ${s.post!.rpe}, sensaciones ${s.post!.feeling}/10` +
        (s.post!.hard.length ? `, costaron: ${s.post!.hard.map((i) => ex.get(i)?.name).join(', ')}` : '') +
        (s.post!.pain.length ? `, molestia: ${s.post!.pain.map((i) => ex.get(i)?.name).join(', ')}` : '') +
        (s.post!.notes ? `, notas: ${s.post!.notes}` : ''));
      for (const e of s.entries) {
        const sets = e.sets.filter((x) => x.done).map((x) => `${x.weight}x${x.reps}`).join(' ');
        if (sets) lines.push(`    ${ex.get(e.exerciseId)?.name}: ${sets}`);
      }
    }
  }
  return lines.join('\n');
}

/** Instrucciones del asistente: rol, estilo y los datos del usuario. */
export function buildSystemPrompt(state: AppState): string {
  const findings = audit(state).map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`).join('\n');
  return `Sos el coach de entrenamiento dentro de una app de seguimiento de rutinas de gimnasio. La persona entrena fuerza e hipertrofia y te consulta desde el celular, muchas veces en el gimnasio.

Tenés sus datos reales más abajo: usalos. Cuando recomiendes algo, apoyate en sus números (series semanales, pesos, RPE, lo que marcó como difícil o con molestia) y en lo que se sabe de entrenamiento basado en evidencia. Si un dato que necesitás no está, decilo o preguntalo en lugar de suponerlo.

Estilo: español rioplatense, directo y concreto. La pantalla es chica y muestra texto plano, así que escribí párrafos cortos y, si hace falta enumerar, guiones simples; sin Markdown, sin tablas, sin títulos. Empezá por la respuesta. Para cambios en la rutina, decí exactamente qué ejercicio, en qué día, cuántas series y repeticiones.

Ante dolor o molestias que se repiten, sugerí ajustar o reemplazar el ejercicio y consultar a un profesional de la salud; no diagnostiques.

<datos_del_usuario>
${buildSummary(state)}
</datos_del_usuario>

<hallazgos_del_analisis_automatico>
${findings}
</hallazgos_del_analisis_automatico>`;
}
