import type { Category, Exercise, ExType, Muscle } from './types';

type Row = [string, string, Category, Muscle, Muscle[], ExType, string[]?];
const C: ExType = 'compuesto';
const A: ExType = 'aislamiento';

const ROWS: Row[] = [
  // Empuje horizontal
  ['press_banca', 'Press de banca', 'empuje_h', 'pecho', ['triceps', 'hombros'], C, ['bench press', 'banca', 'press banca plano']],
  ['press_inclinado', 'Press inclinado con barra', 'empuje_h', 'pecho', ['hombros', 'triceps'], C, ['press inclinado', 'incline bench']],
  ['press_mancuernas', 'Press con mancuernas', 'empuje_h', 'pecho', ['triceps', 'hombros'], C, ['press plano mancuernas']],
  ['press_inclinado_mancuernas', 'Press inclinado con mancuernas', 'empuje_h', 'pecho', ['hombros', 'triceps'], C],
  ['fondos', 'Fondos en paralelas', 'empuje_h', 'pecho', ['triceps', 'hombros'], C, ['dips', 'fondos']],
  ['flexiones', 'Flexiones de brazos', 'empuje_h', 'pecho', ['triceps', 'core'], C, ['push ups', 'lagartijas']],
  ['press_cerrado', 'Press de banca agarre cerrado', 'empuje_h', 'triceps', ['pecho'], C, ['press cerrado']],
  ['aperturas', 'Aperturas con mancuernas', 'accesorio', 'pecho', [], A, ['aperturas', 'flyes']],
  ['cruce_poleas', 'Cruce de poleas', 'accesorio', 'pecho', [], A, ['cruces en polea', 'cable crossover']],
  // Empuje vertical
  ['press_militar', 'Press militar', 'empuje_v', 'hombros', ['triceps'], C, ['overhead press', 'ohp', 'press militar barra']],
  ['press_hombros_mancuernas', 'Press de hombros con mancuernas', 'empuje_v', 'hombros', ['triceps'], C, ['press hombro mancuernas', 'press arnold']],
  ['elevaciones_laterales', 'Elevaciones laterales', 'accesorio', 'hombros', [], A, ['vuelos laterales', 'lateral raises']],
  // Tracción vertical
  ['dominadas', 'Dominadas', 'traccion_v', 'espalda', ['biceps'], C, ['pull ups', 'chin ups', 'dominadas pronas']],
  ['jalon_pecho', 'Jalón al pecho', 'traccion_v', 'espalda', ['biceps'], C, ['jalon polea', 'lat pulldown', 'dorsalera']],
  ['pullover_polea', 'Pullover en polea', 'accesorio', 'espalda', [], A, ['pullover']],
  // Tracción horizontal
  ['remo_barra', 'Remo con barra', 'traccion_h', 'espalda', ['biceps', 'isquios'], C, ['barbell row', 'remo barra']],
  ['remo_mancuerna', 'Remo con mancuerna', 'traccion_h', 'espalda', ['biceps'], C, ['remo mancuerna un brazo', 'remo unilateral']],
  ['remo_polea', 'Remo en polea baja', 'traccion_h', 'espalda', ['biceps'], C, ['remo sentado', 'seated row', 'remo polea']],
  ['remo_t', 'Remo en T', 'traccion_h', 'espalda', ['biceps'], C, ['t bar row', 'remo t']],
  ['face_pull', 'Face pull', 'traccion_h', 'hombros', ['espalda'], A, ['facepull']],
  ['pajaros', 'Pájaros (deltoides posterior)', 'traccion_h', 'hombros', ['espalda'], A, ['pajaros', 'reverse fly', 'posterior en maquina']],
  ['encogimientos', 'Encogimientos de hombros', 'accesorio', 'espalda', [], A, ['shrugs', 'trapecio']],
  // Brazos
  ['curl_barra', 'Curl con barra', 'accesorio', 'biceps', [], A, ['curl biceps barra', 'barbell curl']],
  ['curl_mancuernas', 'Curl con mancuernas', 'accesorio', 'biceps', [], A, ['curl alternado', 'curl biceps']],
  ['curl_martillo', 'Curl martillo', 'accesorio', 'biceps', [], A, ['hammer curl']],
  ['curl_predicador', 'Curl predicador', 'accesorio', 'biceps', [], A, ['curl scott', 'banco scott']],
  ['triceps_polea', 'Extensión de tríceps en polea', 'accesorio', 'triceps', [], A, ['triceps polea', 'pushdown', 'triceps soga']],
  ['press_frances', 'Press francés', 'accesorio', 'triceps', [], A, ['rompecraneos', 'skull crusher']],
  ['triceps_cabeza', 'Extensión de tríceps sobre la cabeza', 'accesorio', 'triceps', [], A, ['triceps trasnuca', 'copa triceps']],
  // Dominantes de rodilla
  ['sentadilla', 'Sentadilla', 'rodilla', 'cuadriceps', ['gluteos', 'core'], C, ['squat', 'sentadilla barra', 'sentadilla trasera']],
  ['sentadilla_frontal', 'Sentadilla frontal', 'rodilla', 'cuadriceps', ['gluteos', 'core'], C, ['front squat']],
  ['prensa', 'Prensa de piernas', 'rodilla', 'cuadriceps', ['gluteos'], C, ['prensa', 'leg press', 'prensa 45']],
  ['hack', 'Sentadilla hack', 'rodilla', 'cuadriceps', ['gluteos'], C, ['hack squat']],
  ['bulgara', 'Sentadilla búlgara', 'rodilla', 'cuadriceps', ['gluteos'], C, ['bulgaras', 'split squat']],
  ['zancadas', 'Zancadas', 'rodilla', 'cuadriceps', ['gluteos'], C, ['estocadas', 'lunges']],
  ['extension_cuadriceps', 'Extensión de cuádriceps', 'rodilla', 'cuadriceps', [], A, ['sillon cuadriceps', 'leg extension', 'extensiones']],
  // Dominantes de cadera / cadena posterior
  ['peso_muerto', 'Peso muerto', 'cadera', 'isquios', ['gluteos', 'espalda'], C, ['deadlift', 'peso muerto convencional']],
  ['peso_muerto_rumano', 'Peso muerto rumano', 'cadera', 'isquios', ['gluteos'], C, ['rdl', 'rumano', 'peso muerto piernas rigidas']],
  ['hip_thrust', 'Hip thrust', 'cadera', 'gluteos', ['isquios'], C, ['empuje cadera', 'puente gluteo']],
  ['buenos_dias', 'Buenos días', 'cadera', 'isquios', ['gluteos', 'espalda'], C, ['good morning']],
  ['curl_femoral', 'Curl femoral', 'cadera', 'isquios', [], A, ['camilla isquios', 'leg curl', 'femoral sentado', 'femoral acostado']],
  ['hiperextensiones', 'Hiperextensiones', 'cadera', 'isquios', ['gluteos', 'espalda'], A, ['extension lumbar', 'banco romano']],
  // Gemelos y core
  ['gemelos_de_pie', 'Gemelos de pie', 'accesorio', 'gemelos', [], A, ['elevacion talones', 'gemelos', 'calf raise']],
  ['gemelos_sentado', 'Gemelos sentado', 'accesorio', 'gemelos', [], A, ['soleo']],
  ['plancha', 'Plancha', 'core', 'core', [], A, ['plank']],
  ['crunch_polea', 'Crunch en polea', 'core', 'core', [], A, ['abdominales', 'crunch']],
  ['elevacion_piernas', 'Elevación de piernas colgado', 'core', 'core', [], A, ['elevacion piernas', 'leg raise']],
  ['rueda_abdominal', 'Rueda abdominal', 'core', 'core', [], A, ['ab wheel']],
];

// Movilidad articular y aeróbico: se registran por tiempo y no cuentan para el volumen muscular.
const TIMED: [string, string, 'movilidad' | 'aerobico', string[]?][] = [
  ['mov_cadera_90_90', 'Movilidad de cadera 90/90', 'movilidad', ['90 90', 'cadera 90/90']],
  ['mov_cadera_circulos', 'Círculos de cadera', 'movilidad', ['rotaciones de cadera']],
  ['mov_gato_camello', 'Gato-camello', 'movilidad', ['cat cow', 'gato vaca']],
  ['mov_toracica', 'Rotaciones torácicas', 'movilidad', ['movilidad toracica', 'libro abierto']],
  ['mov_hombros', 'Círculos de hombros', 'movilidad', ['movilidad de hombros', 'dislocaciones con banda']],
  ['mov_tobillo', 'Movilidad de tobillo', 'movilidad', ['dorsiflexion de tobillo']],
  ['mov_sentadilla_profunda', 'Sentadilla profunda sostenida', 'movilidad', ['deep squat hold']],
  ['mov_zancada_rotacion', 'Zancada con rotación', 'movilidad', ['worlds greatest stretch', 'estocada con rotacion']],
  ['mov_isquios', 'Estiramiento de isquiotibiales', 'movilidad', ['elongacion isquios']],
  ['mov_flexores_cadera', 'Estiramiento de flexores de cadera', 'movilidad', ['estiramiento psoas']],
  ['aer_cinta', 'Cinta (trote o caminata)', 'aerobico', ['cinta', 'trote', 'correr', 'caminata', 'treadmill']],
  ['aer_bici', 'Bicicleta fija', 'aerobico', ['bici', 'bicicleta', 'spinning']],
  ['aer_eliptico', 'Elíptico', 'aerobico', ['eliptica']],
  ['aer_remo', 'Remo ergómetro', 'aerobico', ['remoergometro', 'rowing machine', 'maquina de remo']],
  ['aer_soga', 'Saltar la soga', 'aerobico', ['soga', 'cuerda', 'jump rope']],
  ['aer_escalador', 'Escalador', 'aerobico', ['escalera', 'stairmaster']],
  ['aer_hiit', 'Intervalos (HIIT)', 'aerobico', ['hiit', 'intervalos']],
];

export const SEED_EXERCISES: Exercise[] = [
  ...ROWS.map(([id, name, category, muscle, secondary, type, aliases]): Exercise => ({
    id, name, category, muscle, secondary, type, aliases,
  })),
  ...TIMED.map(([id, name, group, aliases]): Exercise => ({
    id, name, group, aliases, category: 'accesorio', muscle: 'core', secondary: [], type: 'aislamiento',
  })),
];

export const defaultIncrement = (e: Pick<Exercise, 'type'>) => (e.type === 'compuesto' ? 2.5 : 1);
export const defaultBlock = (e: Pick<Exercise, 'type'>) => (e.type === 'compuesto' ? 'Compuestos' : 'Accesorios');
