// Rutinas base (hipertrofia con foco en compuestos) en el mismo formato JSON
// que acepta el importador. Los pesos arrancan en 0: se cargan en la 1ª sesión.
const d = (name: string, ...rows: [string, number, string][]) => ({
  name, exercises: rows.map(([n, sets, reps]) => ({ name: n, sets, reps })),
});

export const TEMPLATES = [
  {
    name: 'Torso / Pierna · 4 días',
    desc: 'Cada grupo 2 veces por semana. La base más equilibrada para hipertrofia.',
    days: [
      d('Torso A (fuerza)', ['Press de banca', 4, '5-8'], ['Remo con barra', 4, '6-8'], ['Press militar', 3, '6-10'], ['Jalón al pecho', 3, '8-12'], ['Cruce de poleas', 2, '12-15'], ['Curl con barra', 3, '8-12'], ['Extensión de tríceps en polea', 3, '10-15']),
      d('Pierna A (rodilla)', ['Sentadilla', 4, '5-8'], ['Peso muerto rumano', 3, '8-10'], ['Prensa de piernas', 3, '10-12'], ['Curl femoral', 3, '10-15'], ['Gemelos de pie', 4, '10-15'], ['Plancha', 3, '30-60']),
      d('Torso B (volumen)', ['Press inclinado con mancuernas', 4, '8-12'], ['Dominadas', 4, '6-10'], ['Remo en polea baja', 3, '10-12'], ['Elevaciones laterales', 4, '12-15'], ['Face pull', 3, '12-15'], ['Curl martillo', 3, '10-12'], ['Press francés', 3, '10-12']),
      d('Pierna B (cadera)', ['Peso muerto', 3, '4-6'], ['Sentadilla búlgara', 3, '8-12'], ['Hip thrust', 3, '8-12'], ['Extensión de cuádriceps', 3, '12-15'], ['Gemelos sentado', 4, '12-15'], ['Crunch en polea', 3, '10-15']),
    ],
  },
  {
    name: 'Push / Pull / Legs · 3 días',
    desc: 'Empuje, tracción y piernas. Simple y efectiva con 3 días disponibles.',
    days: [
      d('Empuje', ['Press de banca', 4, '6-8'], ['Press militar', 3, '6-10'], ['Press inclinado con mancuernas', 3, '8-12'], ['Elevaciones laterales', 4, '12-15'], ['Extensión de tríceps en polea', 3, '10-15']),
      d('Tracción', ['Dominadas', 4, '6-10'], ['Remo con barra', 4, '6-10'], ['Remo en polea baja', 3, '10-12'], ['Face pull', 3, '12-15'], ['Curl con barra', 3, '8-12'], ['Curl martillo', 2, '10-12']),
      d('Piernas', ['Sentadilla', 4, '6-8'], ['Peso muerto rumano', 4, '8-10'], ['Prensa de piernas', 3, '10-12'], ['Curl femoral', 3, '10-15'], ['Gemelos de pie', 4, '10-15'], ['Elevación de piernas colgado', 3, '8-15']),
    ],
  },
  {
    name: 'Full body compuestos · 3 días',
    desc: 'Pocas horas, mucha frecuencia. Ideal para fuerza en los básicos.',
    days: [
      d('Full body A', ['Sentadilla', 4, '4-6'], ['Press de banca', 4, '4-6'], ['Remo con barra', 4, '6-8'], ['Curl femoral', 3, '10-12'], ['Plancha', 3, '30-60']),
      d('Full body B', ['Peso muerto', 3, '3-5'], ['Press militar', 4, '5-8'], ['Dominadas', 4, '5-8'], ['Sentadilla búlgara', 3, '8-10'], ['Face pull', 3, '12-15']),
      d('Full body C', ['Sentadilla frontal', 3, '5-8'], ['Press inclinado con barra', 4, '6-8'], ['Remo en polea baja', 4, '8-10'], ['Hip thrust', 3, '8-10'], ['Curl con barra', 3, '8-12']),
    ],
  },
];
