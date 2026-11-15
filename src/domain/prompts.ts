/** Instrucciones para convertir una rutina en cualquier formato al formato unificado. */
export const EXTRACT_SYSTEM = `Convertís rutinas de gimnasio de cualquier formato (fotos, capturas, PDF, planillas, texto libre, tablas) al formato unificado de la app.

Reglas:
- Transcribí exactamente lo que dice el material. No inventes ejercicios, series ni pesos; lo que no figure va en null.
- name: nombre del ejercicio en español, en su forma más habitual (ej. "Press de banca", "Peso muerto rumano", "Jalón al pecho"). Si el original está en inglés o abreviado, traducilo o expandilo.
- sets: cantidad de series. repMin y repMax: rango de repeticiones; si hay un solo número, ambos iguales. Para "al fallo" o AMRAP usá el rango que indique el texto o 8-12 y aclaralo en notes.
- unit: "seg" si el ejercicio se mide en segundos (planchas, isométricos, movilidad), "min" si se mide en minutos (cinta, bicicleta y otros aeróbicos), si no "reps". Para actividades por tiempo, sets es la cantidad de veces y repMin/repMax la duración.
- weight: peso en kg (convertí libras multiplicando por 0,4536 y redondeando a 0,5). null si no figura o es peso corporal.
- setWeights: solo si el peso cambia entre series (pirámides, series de aproximación); un valor por serie, en kg. Si no, null.
- restSec: descanso en segundos. targetRpe: RPE objetivo; si figura RIR, convertilo (RPE = 10 - RIR).
- block: etiqueta de bloque o superserie si la hay (ej. "Superserie A"). tempo: ej. "3-1-1-0".
- notes: cualquier otra indicación del material (técnica, variantes, drop sets, progresión). No pierdas información: lo que no entre en otro campo va acá.
- Cada día de entrenamiento es un elemento de days, con el nombre que tenga en el original. Si hay varias rutinas o fases, devolvé una por cada una.`;
