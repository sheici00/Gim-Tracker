import type { GoalId, Muscle } from './types';

export interface Goal {
  id: GoalId;
  name: string;
  desc: string;
  compoundReps: [number, number];
  isoReps: [number, number];
  /** Descanso sugerido en segundos: [compuestos, aislamiento]. */
  rest: [number, number];
  /** Series semanales objetivo por grupo muscular: [mínimo, máximo]. */
  targets: Record<Muscle, [number, number]>;
  priority: Muscle[];
  /** Proporción mínima de series en ejercicios compuestos. */
  minCompoundRatio: number;
}

// Referencias de volumen: ~10-20 series semanales por grupo para hipertrofia
// (Schoenfeld et al. 2017; Baz-Valle et al. 2022), menos volumen y más
// intensidad para fuerza. Son rangos de partida, no reglas rígidas.
const t = (big: [number, number], arms: [number, number], legs: [number, number]): Record<Muscle, [number, number]> => ({
  pecho: big, espalda: big, hombros: big, biceps: arms, triceps: arms,
  cuadriceps: legs, isquios: legs, gluteos: [Math.round(legs[0] * 0.6), legs[1]],
  gemelos: [Math.round(legs[0] * 0.5), Math.round(legs[1] * 0.8)], core: [4, 12],
});

export const GOALS: Goal[] = [
  {
    id: 'hipertrofia_superior', name: 'Hipertrofia tren superior',
    desc: 'Prioriza pecho, espalda, hombros y brazos. El tren inferior queda en volumen de mantenimiento.',
    compoundReps: [6, 10], isoReps: [10, 15], rest: [150, 75],
    targets: t([12, 22], [10, 18], [6, 12]),
    priority: ['pecho', 'espalda', 'hombros', 'biceps', 'triceps'], minCompoundRatio: 0.45,
  },
  {
    id: 'hipertrofia_general', name: 'Hipertrofia general',
    desc: 'Volumen equilibrado en todo el cuerpo, con base en compuestos y accesorios.',
    compoundReps: [6, 10], isoReps: [10, 15], rest: [150, 75],
    targets: t([10, 20], [8, 16], [10, 20]),
    priority: [], minCompoundRatio: 0.5,
  },
  {
    id: 'hipertrofia_inferior', name: 'Hipertrofia tren inferior',
    desc: 'Prioriza cuádriceps, isquios y glúteos. El tren superior queda en mantenimiento.',
    compoundReps: [6, 10], isoReps: [10, 15], rest: [180, 75],
    targets: { ...t([6, 12], [4, 10], [12, 22]) },
    priority: ['cuadriceps', 'isquios', 'gluteos'], minCompoundRatio: 0.5,
  },
  {
    id: 'fuerza_compuestos', name: 'Fuerza en compuestos',
    desc: 'Cargas altas y pocas repeticiones en sentadilla, banca, peso muerto, press y remo/dominadas.',
    compoundReps: [3, 6], isoReps: [8, 12], rest: [210, 90],
    targets: t([6, 14], [4, 10], [6, 14]),
    priority: [], minCompoundRatio: 0.7,
  },
];

export const getGoal = (id: GoalId) => GOALS.find((g) => g.id === id) ?? GOALS[1];
