export type Muscle =
  | 'pecho' | 'espalda' | 'hombros' | 'biceps' | 'triceps'
  | 'cuadriceps' | 'isquios' | 'gluteos' | 'gemelos' | 'core';

/** Patrón de movimiento: es la "categoría" del ejercicio y la base de la auditoría. */
export type Category =
  | 'empuje_h' | 'empuje_v' | 'traccion_h' | 'traccion_v'
  | 'rodilla' | 'cadera' | 'core' | 'accesorio';

export type ExType = 'compuesto' | 'aislamiento';

export interface Exercise {
  id: string;
  name: string;
  category: Category;
  muscle: Muscle;
  secondary: Muscle[];
  type: ExType;
  aliases?: string[];
  custom?: boolean;
}

export interface RoutineItem {
  id: string;
  exerciseId: string;
  block: string;
  sets: number;
  repMin: number;
  repMax: number;
  /** Peso objetivo actual en kg (0 = peso corporal). Lo mueve la auto-regulación. */
  weight: number;
  /** Salto de sobrecarga progresiva en kg. */
  increment: number;
  /** 'seg' para ejercicios por tiempo (planchas, isométricos). */
  unit?: 'reps' | 'seg';
  /** Peso por serie cuando no es el mismo en todas (pirámides, back-off sets). */
  setWeights?: number[];
  /** Descanso en segundos; si falta se usa el de la meta. */
  restSec?: number;
  /** RPE objetivo de las series, 1-10. */
  targetRpe?: number;
  /** Tempo, ej. "3-1-1-0". */
  tempo?: string;
  notes?: string;
}

export interface RoutineDay { id: string; name: string; notes?: string; items: RoutineItem[] }
export interface Routine { id: string; name: string; notes?: string; days: RoutineDay[]; updatedAt?: number }

export interface SetLog { weight: number; reps: number; done: boolean }

export interface SessionEntry {
  itemId: string;
  exerciseId: string;
  repMin: number;
  repMax: number;
  targetWeight: number;
  increment: number;
  unit?: 'reps' | 'seg';
  restSec?: number;
  targetRpe?: number;
  tempo?: string;
  notes?: string;
  sets: SetLog[];
}

export interface PostMetrics {
  /** Esfuerzo percibido de la sesión, 1-10. */
  rpe: number;
  /** Sensaciones generales, 1-10. */
  feeling: number;
  /** exerciseId de los ejercicios que costaron. */
  hard: string[];
  /** exerciseId de los ejercicios que generaron molestia. */
  pain: string[];
  notes: string;
}

export type SuggestionAction = 'subir' | 'microcarga' | 'mantener' | 'bajar';

export interface Suggestion {
  itemId: string;
  exerciseId: string;
  action: SuggestionAction;
  from: number;
  to: number;
  reason: string;
}

export interface Session {
  id: string;
  routineId: string;
  dayId: string;
  dayName: string;
  startedAt: number;
  finishedAt?: number;
  entries: SessionEntry[];
  post?: PostMetrics;
  suggestions?: Suggestion[];
  applied?: boolean;
  updatedAt?: number;
}

export type GoalId = 'hipertrofia_superior' | 'hipertrofia_general' | 'hipertrofia_inferior' | 'fuerza_compuestos';

export interface AppState {
  version: 1;
  exercises: Exercise[];
  routines: Routine[];
  sessions: Session[];
  activeRoutineId: string | null;
  goal: GoalId;
  /** Entrenamiento en curso (sobrevive a cerrar el navegador). No se sincroniza. */
  active: Session | null;
  /** Ids de rutinas y sesiones eliminadas -> momento del borrado (para sincronizar borrados). */
  deleted: Record<string, number>;
  /** Última vez que cambió la meta o la rutina activa. */
  prefsAt: number;
}

export const MUSCLES: Muscle[] = ['pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'cuadriceps', 'isquios', 'gluteos', 'gemelos', 'core'];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  pecho: 'Pecho', espalda: 'Espalda', hombros: 'Hombros', biceps: 'Bíceps', triceps: 'Tríceps',
  cuadriceps: 'Cuádriceps', isquios: 'Isquios', gluteos: 'Glúteos', gemelos: 'Gemelos', core: 'Core',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  empuje_h: 'Empuje horizontal', empuje_v: 'Empuje vertical',
  traccion_h: 'Tracción horizontal', traccion_v: 'Tracción vertical',
  rodilla: 'Dominante de rodilla', cadera: 'Dominante de cadera (cadena posterior)',
  core: 'Core', accesorio: 'Accesorio',
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
