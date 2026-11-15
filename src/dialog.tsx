import { useEffect, useState } from 'preact/hooks';

// Confirmaciones y avisos dentro de la página: confirm() y alert() del
// navegador no funcionan cuando la app corre como artefacto de Claude.
type Dialog = { message: string; confirm: boolean; resolve: (ok: boolean) => void };
let current: Dialog | null = null;
let rerender: () => void = () => {};

const open = (message: string, confirm: boolean) =>
  new Promise<boolean>((resolve) => {
    current?.resolve(false);
    current = { message, confirm, resolve };
    rerender();
  });

/** Pregunta de sí o no. */
export const ask = (message: string) => open(message, true);
/** Aviso con un solo botón. */
export const notify = (message: string) => open(message, false).then(() => {});

export function DialogHost() {
  const [, tick] = useState(0);
  useEffect(() => { rerender = () => tick((n) => n + 1); return () => { rerender = () => {}; }; }, []);
  const d = current;
  if (!d) return null;
  const close = (ok: boolean) => { current = null; d.resolve(ok); rerender(); };
  return (
    <div class="overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && close(false)}>
      <div class="dialog">
        <p>{d.message}</p>
        <div class="row mt">
          {d.confirm && <button class="btn grow" onClick={() => close(false)}>Cancelar</button>}
          <button class="btn grow primary" autofocus onClick={() => close(true)}>{d.confirm ? 'Confirmar' : 'Entendido'}</button>
        </div>
      </div>
    </div>
  );
}
