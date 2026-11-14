// Integración con Claude. Las llamadas salen directo desde este dispositivo a la
// API de Anthropic con la clave del usuario: la clave nunca pasa por el servidor de la app.
import Anthropic from '@anthropic-ai/sdk';
import { getDevice } from './device';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function client() {
  const { apiKey } = getDevice();
  if (!apiKey) throw new Error('Falta la clave de Claude. Cargala en Ajustes.');
  // dangerouslyAllowBrowser: cada usuario usa su propia clave, guardada solo en su dispositivo.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/** Si el modelo rechaza un pedido por sus filtros de seguridad, la API lo reintenta en un modelo alternativo. */
const fallbackParams = (model: string) =>
  model === 'claude-haiku-5-5' ? {} : { betas: [FALLBACK_BETA], fallbacks: 'default' as const };

export function errorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'La clave de Claude no es válida. Revisala en Ajustes.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Tu clave no tiene permiso para usar este modelo.';
  if (e instanceof Anthropic.RateLimitError) return 'Llegaste al límite de uso de tu cuenta de Claude. Probá de nuevo en un rato.';
  if (e instanceof Anthropic.BadRequestError) return 'Claude rechazó el pedido: ' + e.message;
  if (e instanceof Anthropic.APIConnectionError) return 'No hay conexión con Claude. Revisá tu internet.';
  if (e instanceof Anthropic.APIError) return `Error de Claude (${e.status ?? 's/d'}). Probá de nuevo.`;
  return e instanceof Error ? e.message : 'Error desconocido.';
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type Attachment =
  | { kind: 'image'; mediaType: string; base64: string }
  | { kind: 'pdf'; base64: string }
  | { kind: 'text'; text: string };

/** Conversación con respuesta en streaming. Devuelve el texto completo. */
export async function chat(system: string, messages: ChatMessage[], onText: (delta: string) => void, signal?: AbortSignal): Promise<string> {
  const { model } = getDevice();
  const stream = client().beta.messages.stream(
    { model, max_tokens: 16000, system, messages, ...fallbackParams(model) },
    { signal },
  );
  stream.on('text', onText);
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude no pudo responder a ese pedido.');
  return msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
}

/** Comprueba la clave con un pedido mínimo. */
export async function testKey(): Promise<void> {
  const { model } = getDevice();
  await client().messages.create({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Respondé solo: ok' }] });
}

// Los campos opcionales se piden como "valor o null" porque las salidas
// estructuradas exigen que todas las propiedades figuren en "required".
const nullable = (type: string) => ({ anyOf: [{ type }, { type: 'null' }] });
const ROUTINE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['routines'],
  properties: {
    routines: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'notes', 'days'],
        properties: {
          name: { type: 'string' }, notes: nullable('string'),
          days: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['name', 'notes', 'exercises'],
              properties: {
                name: { type: 'string' }, notes: nullable('string'),
                exercises: {
                  type: 'array',
                  items: {
                    type: 'object', additionalProperties: false,
                    required: ['name', 'block', 'sets', 'repMin', 'repMax', 'unit', 'weight', 'setWeights', 'restSec', 'targetRpe', 'tempo', 'notes'],
                    properties: {
                      name: { type: 'string' }, block: nullable('string'),
                      sets: { type: 'integer' }, repMin: { type: 'integer' }, repMax: { type: 'integer' },
                      unit: { type: 'string', enum: ['reps', 'seg'] },
                      weight: nullable('number'),
                      setWeights: { anyOf: [{ type: 'array', items: { type: 'number' } }, { type: 'null' }] },
                      restSec: nullable('integer'), targetRpe: nullable('number'),
                      tempo: nullable('string'), notes: nullable('string'),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const EXTRACT_SYSTEM = `Convertís rutinas de gimnasio de cualquier formato (fotos, capturas, PDF, planillas, texto libre, tablas) al formato unificado de la app.

Reglas:
- Transcribí exactamente lo que dice el material. No inventes ejercicios, series ni pesos; lo que no figure va en null.
- name: nombre del ejercicio en español, en su forma más habitual (ej. "Press de banca", "Peso muerto rumano", "Jalón al pecho"). Si el original está en inglés o abreviado, traducilo o expandilo.
- sets: cantidad de series. repMin y repMax: rango de repeticiones; si hay un solo número, ambos iguales. Para "al fallo" o AMRAP usá el rango que indique el texto o 8-12 y aclaralo en notes.
- unit: "seg" si el ejercicio se mide en tiempo (planchas, isométricos), si no "reps".
- weight: peso en kg (convertí libras multiplicando por 0,4536 y redondeando a 0,5). null si no figura o es peso corporal.
- setWeights: solo si el peso cambia entre series (pirámides, series de aproximación); un valor por serie, en kg. Si no, null.
- restSec: descanso en segundos. targetRpe: RPE objetivo; si figura RIR, convertilo (RPE = 10 - RIR).
- block: etiqueta de bloque o superserie si la hay (ej. "Superserie A"). tempo: ej. "3-1-1-0".
- notes: cualquier otra indicación del material (técnica, variantes, drop sets, progresión). No pierdas información: lo que no entre en otro campo va acá.
- Cada día de entrenamiento es un elemento de days, con el nombre que tenga en el original. Si hay varias rutinas o fases, devolvé una por cada una.`;

/** Lee una rutina en cualquier formato y la devuelve como JSON en el formato unificado. */
export async function extractRoutine(parts: Attachment[], signal?: AbortSignal): Promise<string> {
  const { model } = getDevice();
  const content = parts.map((p) =>
    p.kind === 'image' ? { type: 'image' as const, source: { type: 'base64' as const, media_type: p.mediaType as 'image/jpeg', data: p.base64 } }
      : p.kind === 'pdf' ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: p.base64 } }
        : { type: 'text' as const, text: p.text });
  const stream = client().beta.messages.stream(
    {
      model, max_tokens: 32000, system: EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: [...content, { type: 'text', text: 'Convertí esta rutina al formato unificado.' }] }],
      output_config: { format: { type: 'json_schema', schema: ROUTINE_SCHEMA } },
      ...fallbackParams(model),
    },
    { signal },
  );
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude no pudo procesar ese archivo.');
  if (msg.stop_reason === 'max_tokens') throw new Error('La rutina es demasiado larga para procesarla de una vez. Probá cargarla por partes.');
  return msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
}
