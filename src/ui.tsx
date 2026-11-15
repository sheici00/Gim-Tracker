import type { ComponentChildren } from 'preact';
import { isNative } from './device';
import { notify } from './dialog';

export type View =
  | { n: 'home' } | { n: 'routines' } | { n: 'routine'; id: string } | { n: 'import' }
  | { n: 'workout' } | { n: 'post' } | { n: 'session'; id: string }
  | { n: 'goal' } | { n: 'coach' } | { n: 'history' } | { n: 'settings' } | { n: 'groups' };
export type Go = (v: View) => void;

export const parseNum = (v: string) => {
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) ? 0 : Math.max(0, n);
};

export const kg = (n: number) => (n === 0 ? 'PC' : `${String(n).replace('.', ',')} kg`);

export function Header({ title, back, right }: { title: string; back?: () => void; right?: ComponentChildren }) {
  return (
    <header class="hdr">
      {back && <button class="icon" onClick={back} aria-label="Volver">‹</button>}
      <h1>{title}</h1>
      <div class="hdr-r">{right}</div>
    </header>
  );
}

/** Campo numérico con botones −/+ para usar con el pulgar. */
export function Stepper({ value, step, onChange, label }: { value: number; step: number; onChange: (n: number) => void; label: string }) {
  const set = (n: number) => onChange(Math.max(0, Math.round(n * 100) / 100));
  return (
    <div class="stepper">
      <button onClick={() => set(value - step)} aria-label={`Menos ${label}`}>−</button>
      <input inputMode="decimal" aria-label={label} value={String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => set(parseNum(e.currentTarget.value))} />
      <button onClick={() => set(value + step)} aria-label={`Más ${label}`}>+</button>
    </div>
  );
}

export function Num({ value, onChange, label, w = 56 }: { value: number; onChange: (n: number) => void; label: string; w?: number }) {
  return (
    <label class="num">
      <span>{label}</span>
      <input inputMode="decimal" style={{ width: w + 'px' }} value={String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(parseNum(e.currentTarget.value))} />
    </label>
  );
}

export function Scale({ value, onChange, min = 1, max = 10 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div class="scale">
      {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
        <button key={n} class={n === value ? 'on' : ''} onClick={() => onChange(n)}>{n}</button>
      ))}
    </div>
  );
}

/** Guarda un archivo de texto con el mecanismo que tenga cada plataforma. */
export async function saveTextFile(name: string, text: string) {
  const copy = async (why: string) => {
    try { await navigator.clipboard.writeText(text); await notify(why + ' Se copió al portapapeles: pegalo en una nota o un mail para guardarlo.'); }
    catch { await notify('No se pudo guardar ni copiar el archivo.'); }
  };
  if (import.meta.env.VITE_TARGET === 'artifact') {
    const downloads = await (window.claude?.use('downloads') ?? null);
    if (!downloads) return copy('Acá no se pueden descargar archivos.');
    try { await downloads.save({ filename: name, data: text }); }
    catch (e) { if ((e as { code?: string })?.code !== 'declined') await copy('No se pudo descargar.'); }
    return;
  }
  if (isNative()) return copy('La app instalada no descarga archivos.');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
