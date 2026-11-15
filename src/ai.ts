import { useEffect, useState } from 'preact/hooks';
import { useDevice } from './device';

/** true cuando la app corre publicada como artefacto de Claude. */
export const IS_ARTIFACT = import.meta.env.VITE_TARGET === 'artifact';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type Attachment =
  | { kind: 'image'; blob: Blob; base64: string }
  | { kind: 'pdf'; base64: string }
  | { kind: 'text'; text: string };

/**
 * Acceso a Claude. Hay dos implementaciones con la misma interfaz:
 *  - web y APK: la API de Anthropic con la clave del usuario (claude.ts);
 *  - artefacto: la cuenta de Claude de quien tiene abierta la página (ai-artifact.ts).
 */
export interface AiProvider {
  chat(system: string, messages: ChatMessage[], onText: (delta: string) => void, signal?: AbortSignal): Promise<string>;
  /** Devuelve la rutina como JSON en el formato unificado. */
  extractRoutine(parts: Attachment[], signal?: AbortSignal): Promise<string>;
  errorMessage(e: unknown): string;
  readsPdf: boolean;
}

// La condición se escribe entera para que el build descarte la variante que no se usa.
export const loadAi = (): Promise<AiProvider> =>
  import.meta.env.VITE_TARGET === 'artifact'
    ? import('./ai-artifact').then((m) => m.provider)
    : import('./claude').then((m) => m.provider);

/** ¿Hay Claude disponible en este dispositivo? `null` mientras se averigua. */
export function useAiReady(): boolean | null {
  const dev = useDevice();
  const [artifactReady, setArtifactReady] = useState<boolean | null>(null);
  useEffect(() => {
    if (import.meta.env.VITE_TARGET === 'artifact') void import('./ai-artifact').then((m) => m.ready).then(setArtifactReady);
  }, []);
  return IS_ARTIFACT ? artifactReady : !!dev.apiKey;
}
