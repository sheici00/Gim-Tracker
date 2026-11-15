// Claude dentro de un artefacto: cada pedido usa la cuenta de Claude de quien
// tiene la página abierta. No hay claves ni servidor propio.
import type { AiProvider, Attachment, ChatMessage } from './ai';
import { EXTRACT_SYSTEM } from './domain/prompts';

const samplePromise = window.claude?.use('sample') ?? Promise.resolve(null);
export const ready: Promise<boolean> = samplePromise.then((s) => !!s, () => false);

type SampleError = { code?: string; message?: string; text?: string };

function errorMessage(e: unknown): string {
  const code = (e as SampleError)?.code;
  switch (code) {
    case 'not_granted': case 'sampling_disabled': case 'not_declared': case 'capability_disabled': case 'capability_removed':
      return 'Claude no está habilitado para esta página en tu cuenta.';
    case 'rate_limited': return 'Llegaste al límite de uso de tu cuenta de Claude. Probá de nuevo en un rato.';
    case 'session_expired': return 'Tu sesión de Claude venció. Volvé a iniciar sesión.';
    case 'images_unavailable': return 'Desde acá no se pueden enviar imágenes a Claude. Pegá la rutina como texto.';
    case 'image_rejected': return 'Claude no pudo leer esa imagen. Probá con otra foto o captura.';
    case 'refused': return 'Claude no pudo responder a ese pedido.';
    case 'prompt_too_large': return 'El contenido es demasiado largo. Probá con menos texto.';
    case 'invalid_json': return 'Claude no devolvió una rutina válida. Probá de nuevo o cargala por partes.';
    case 'upstream_error': return 'Claude tuvo un problema momentáneo. Probá de nuevo.';
  }
  return e instanceof Error ? e.message : 'No se pudo consultar a Claude.';
}

async function getSample() {
  const sample = await samplePromise;
  if (!sample) throw new Error('Claude no está disponible en esta vista. Abrí la página con tu sesión de Claude iniciada.');
  return sample;
}

async function chat(system: string, messages: ChatMessage[], onText: (delta: string) => void, signal?: AbortSignal): Promise<string> {
  const sample = await getSample();
  // Cada llamada es independiente y no hay prompt de sistema: las instrucciones
  // y los datos del usuario van al principio del primer turno.
  const turns = messages.map((m, i) => (i === 0 ? { role: m.role, content: `${system}\n\n<consulta>\n${m.content}\n</consulta>` } : m));
  const { text } = await sample(turns, { onText: ({ delta }) => onText(delta), signal, cache: false });
  return text;
}

const SHAPE = `Respondé solo con un objeto JSON con esta forma (los campos sin dato van en null):
{"routines":[{"name":"...","notes":null,"days":[{"name":"...","notes":null,"exercises":[{"name":"...","block":null,"sets":4,"repMin":6,"repMax":8,"unit":"reps","weight":80,"setWeights":null,"restSec":120,"targetRpe":8,"tempo":null,"notes":null}]}]}]}`;

async function extractRoutine(parts: Attachment[], signal?: AbortSignal): Promise<string> {
  const sample = await getSample();
  if (parts.some((p) => p.kind === 'pdf')) throw new Error('En esta versión no se pueden leer PDF. Sacale una captura o pegá el texto.');
  const images = parts.flatMap((p) => (p.kind === 'image' ? [p.blob] : []));
  const text = parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join('\n\n');
  const prompt = `${EXTRACT_SYSTEM}\n\n${SHAPE}\n\n` +
    (images.length ? 'La rutina está en la imagen adjunta.' : `<rutina>\n${text}\n</rutina>`);
  const data = await sample.json(prompt, { signal, ...(images.length ? { images } : {}) });
  return JSON.stringify(data);
}

export const provider: AiProvider = { chat, extractRoutine, errorMessage, readsPdf: false };
