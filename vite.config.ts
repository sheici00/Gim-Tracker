import { defineConfig } from 'vite';

// base relativa: el build funciona desde cualquier carpeta o hosting estático.
// host: true expone el servidor en la red local para abrirlo desde el celular.
export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  // En desarrollo, /api se reenvía al servidor de sincronización (npm run server).
  server: { host: true, port: 5173, proxy: { '/api': 'http://localhost:8787' } },
});
