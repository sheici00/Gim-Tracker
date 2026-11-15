// Tipos mínimos de las capacidades de artefacto que usa la app (contrato 0.2).
interface SampleOptions {
  onText?: (e: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  images?: Blob | Blob[];
  modelTier?: 'default' | 'complex' | 'quick';
  cache?: boolean;
}
interface SampleFn {
  (input: string | { role: 'user' | 'assistant'; content: string }[], options?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: string | { role: 'user' | 'assistant'; content: string }[], options?: SampleOptions): Promise<T>;
  limits(): Promise<{ maxPromptBytes: number; images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] } }>;
}
interface DbDocSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined; metadata: { fromCache: boolean; hasPendingWrites: boolean } }
interface DbDocRef { set(data: Record<string, unknown>): Promise<void>; delete(): Promise<void> }
interface DbCollection {
  doc(id: string): DbDocRef;
  onSnapshot(next: (snap: { docs: DbDocSnap[]; metadata: { fromCache: boolean } }) => void, error?: (e: { code: string; message: string }) => void): () => void;
}
interface ArtifactCapabilities {
  sample: SampleFn;
  db: { collection(path: string): DbCollection };
  user: { id(): Promise<string | null> };
  downloads: { save(req: { filename: string; data: string | Blob }): Promise<unknown> };
}
interface Window {
  claude?: { use<K extends keyof ArtifactCapabilities>(name: K): Promise<ArtifactCapabilities[K] | null> };
}
