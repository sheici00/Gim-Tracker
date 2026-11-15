// Arma la página para publicar como artefacto de Claude a partir de dist-artifact/.
// El artefacto recibe el contenido del <body> (sin <html> ni <head>), con el CSS
// en línea; los scripts se publican como archivos al lado de la página.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-artifact';
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const entry = html.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+)"/)?.[1];
const cssFile = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+)"/)?.[1];
if (!entry || !cssFile) throw new Error('No se encontró el script o el CSS en dist-artifact/index.html');

const page = `<title>Gym Tracker</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${readFileSync(join(dir, cssFile), 'utf8')}</style>
<div id="app"></div>
<script type="module" src="${entry}"></script>
`;
writeFileSync(join(dir, 'page.html'), page);

const files = Object.fromEntries(
  readdirSync(join(dir, 'assets')).filter((f) => f.endsWith('.js')).map((f) => [`assets/${f}`, `${dir}/assets/${f}`]));
writeFileSync(join(dir, 'files.json'), JSON.stringify(files, null, 2));
console.log(`page.html listo (${page.length} bytes) + ${Object.keys(files).length} scripts`);
