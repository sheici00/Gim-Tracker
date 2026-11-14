import { useEffect, useState } from 'preact/hooks';

/**
 * Ajustes propios de este dispositivo. No se sincronizan: cada celular o PC
 * usa su propia clave de Claude y su propia sesión iniciada.
 */
export interface Device {
  apiKey: string;
  model: string;
  /** Dirección del servidor de sincronización. Vacío = la misma desde donde se abrió la app. */
  serverUrl: string;
  token: string;
  username: string;
  /** Última revisión del servidor que este dispositivo fusionó. */
  rev: number;
  lastSync: number;
}

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (recomendado)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (más rápido y económico)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (el más económico)' },
];

/** true dentro de la app instalada (APK): ahí no hay un servidor en el mismo origen. */
export const isNative = () => !!(window as any).Capacitor?.isNativePlatform?.();

const KEY = 'gym-tracker-device';
const defaults: Device = { apiKey: '', model: MODELS[0].id, serverUrl: '', token: '', username: '', rev: 0, lastSync: 0 };

let device: Device = (() => {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return defaults; }
})();
const subs = new Set<() => void>();

export const getDevice = () => device;
export function setDevice(patch: Partial<Device>) {
  device = { ...device, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(device)); } catch { /* sin espacio */ }
  subs.forEach((f) => f());
}
export function useDevice(): Device {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return device;
}
