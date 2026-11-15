import { useState } from 'preact/hooks';
import { IS_ARTIFACT, loadAi, useAiReady, type Attachment } from '../ai';
import { importRoutines, importSheets, type ImportResult } from '../domain/importer';
import { addRoutines, getState, useStore } from '../store';
import { Header, type Go } from '../ui';

const SAMPLE_TEXT = `Rutina: Mi rutina torso/pierna
Día 1 - Torso
Press de banca 4x6-8 @80 RPE 8 descanso 2min
Remo con barra 4x8-10 @70
Press militar 3x8-10 @45
Curl con barra 3x10-12 @30

Día 2 - Pierna
Sentadilla 3x5 @100/110/120
Peso muerto rumano 3x8-10 @90
Curl femoral 3x12-15 @40`;

const SAMPLE_JSON = `{
  "name": "Mi rutina",
  "days": [
    {
      "name": "Día 1 - Empuje",
      "exercises": [
        { "name": "Press de banca", "sets": 4, "reps": "6-8", "weight": 80, "increment": 2.5 },
        { "name": "Elevaciones laterales", "sets": 4, "reps": "12-15", "weight": 10 }
      ]
    }
  ]
}`;

const SAMPLE_CSV = `Día;Ejercicio;Series;Reps;Peso;Descanso;Notas
Lunes;Press de banca;4;6-8;80;120;pausa abajo
Lunes;Remo con barra;4;8-10;70;90;
Jueves;Sentadilla;5;5;100;180;`;

/** Achica la foto y la pasa a JPEG: las fotos del celular superan el máximo que acepta la API. */
async function prepareImage(file: File): Promise<{ blob: Blob; base64: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo leer la imagen.'))), 'image/jpeg', 0.85));
    return { blob, base64: await fileToBase64(blob) };
  } finally { URL.revokeObjectURL(url); }
}

const fileToBase64 = (file: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

export function ImportScreen({ go }: { go: Go }) {
  const s = useStore();
  const hasAi = !!useAiReady();
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ name: string; att: Attachment } | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const names = new Map([...s.exercises, ...(res?.newExercises ?? [])].map((e) => [e.id, e.name]));
  const reset = () => { setRes(null); setError(''); };

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    reset(); setFile(null);
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    try {
      if (ext === 'xlsx') {
        const { default: readExcel } = await import('read-excel-file/browser');
        const sheets = (await readExcel(f)).map((sh) => ({ name: sh.sheet, rows: sh.data as unknown[][] }));
        const asText = sheets.map((sh) => `## ${sh.name}\n` + sh.rows.map((r) => r.map((c) => c ?? '').join('\t')).join('\n')).join('\n\n');
        setText(asText);
        const out = importSheets(sheets, f.name.replace(/\.xlsx$/i, ''), getState().exercises);
        // Si la planilla no tiene una estructura reconocible, queda el texto para pasárselo a Claude.
        if (out.routines.length) setRes(out);
        else setError('No reconocí la estructura de la planilla.' + (hasAi ? ' Probá con "Interpretar con Claude".' : ''));
      } else if (f.type.startsWith('image/') || /^(heic|heif)$/.test(ext)) {
        setFile({ name: f.name, att: { kind: 'image', ...(await prepareImage(f)) } });
      } else if (f.type === 'application/pdf' || ext === 'pdf') {
        if (IS_ARTIFACT) throw new Error('En esta versión no se pueden leer PDF. Sacale una captura o pegá el texto.');
        if (f.size > 20 * 1024 * 1024) throw new Error('El PDF supera los 20 MB.');
        setFile({ name: f.name, att: { kind: 'pdf', base64: await fileToBase64(f) } });
      } else if (/^(json|txt|csv|tsv|md)$/.test(ext) || f.type.startsWith('text/')) {
        setText(await f.text());
      } else {
        throw new Error(`No puedo leer archivos .${ext}. Guardalo como .xlsx, .csv o PDF, o pegá el contenido como texto.`);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.'); }
  };

  const withClaude = async () => {
    reset(); setBusy(true);
    try {
      const json = await (await loadAi()).extractRoutine(file ? [file.att] : [{ kind: 'text', text }]);
      const out = importRoutines(json, getState().exercises);
      if (!out.routines.length) throw new Error('Claude no encontró una rutina en ese contenido.');
      setRes(out);
    } catch (err) {
      setError((await loadAi()).errorMessage(err));
    } finally { setBusy(false); }
  };

  const confirm = () => {
    if (!res) return;
    addRoutines(res.routines, res.newExercises);
    go({ n: 'routine', id: res.routines[0].id });
  };
  const needsClaude = !!file;

  return (
    <>
      <Header title="Importar rutina" back={() => go({ n: 'routines' })} />
      <p class="muted">
        Cargá tu rutina en el formato que la tengas y la app la pasa a un formato único y editable.
        Texto, JSON, CSV y Excel se leen en el dispositivo; fotos, capturas{IS_ARTIFACT ? '' : ', PDF'} y formatos libres los interpreta Claude.
      </p>

      <label class="btn block mt">Elegir archivo o foto
        <input type="file" accept={IS_ARTIFACT ? '.json,.txt,.csv,.tsv,.md,.xlsx,image/*' : '.json,.txt,.csv,.tsv,.md,.xlsx,.pdf,image/*'} hidden onChange={onFile} />
      </label>
      {file ? (
        <div class="card mt row between">
          <span class="grow small">📎 {file.name}</span>
          <button class="btn sm" onClick={() => { setFile(null); reset(); }}>Quitar</button>
        </div>
      ) : (
        <>
          <textarea class="mt" placeholder={'…o pegá la rutina acá\n\n' + SAMPLE_TEXT} value={text} onInput={(e) => { setText(e.currentTarget.value); reset(); }} />
          <div class="row wrap mt">
            <button class="btn sm" onClick={() => { setText(SAMPLE_TEXT); reset(); }}>Ej. texto</button>
            <button class="btn sm" onClick={() => { setText(SAMPLE_CSV); reset(); }}>Ej. tabla</button>
            <button class="btn sm" onClick={() => { setText(SAMPLE_JSON); reset(); }}>Ej. JSON</button>
          </div>
        </>
      )}

      <div class="row mt">
        {!needsClaude && (
          <button class="btn grow primary" disabled={!text.trim() || busy} onClick={() => { reset(); setRes(importRoutines(text, getState().exercises)); }}>Analizar</button>
        )}
        {hasAi && (
          <button class={'btn grow ' + (needsClaude ? 'primary' : '')} disabled={busy || (!file && !text.trim())} onClick={() => void withClaude()}>
            {busy ? 'Claude está leyendo…' : 'Interpretar con Claude'}
          </button>
        )}
      </div>
      {!hasAi && !IS_ARTIFACT && (
        <p class="hint">
          {needsClaude ? 'Las fotos y los PDF necesitan Claude. ' : 'Para fotos, PDF o formatos poco comunes, '}
          <button class="link" onClick={() => go({ n: 'settings' })}>conectá Claude en Ajustes</button>.
        </p>
      )}
      {error && <p class="err">{error}</p>}

      {res && (
        <>
          <div class="section">Vista previa · formato unificado</div>
          {res.routines.map((r) => (
            <div class="card" key={r.id}>
              <h3>{r.name}</h3>
              {r.notes && <p class="muted">{r.notes}</p>}
              {r.days.map((d) => (
                <div class="mt" key={d.id}>
                  <b class="small">{d.name}</b>
                  {d.items.map((i) => (
                    <div class="muted" key={i.id}>
                      {names.get(i.exerciseId)} · {i.sets}×{i.repMin}{i.repMax !== i.repMin ? `-${i.repMax}` : ''}{i.unit === 'seg' ? ' seg' : ''}
                      {i.setWeights ? ` · ${i.setWeights.join('/')} kg` : i.weight ? ` · ${i.weight} kg` : ''}
                      {i.targetRpe ? ` · RPE ${i.targetRpe}` : ''}{i.restSec ? ` · desc. ${i.restSec}s` : ''}{i.tempo ? ` · tempo ${i.tempo}` : ''}
                      {i.notes ? ` · ${i.notes}` : ''}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
          {res.warnings.length > 0 && (
            <div class="card finding media">
              <b class="small">Avisos</b>
              {res.warnings.map((w) => <p class="muted" key={w}>• {w}</p>)}
            </div>
          )}
          {res.routines.length > 0 && <button class="btn block primary" onClick={confirm}>Guardar rutina</button>}
        </>
      )}
    </>
  );
}
