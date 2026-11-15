import { render } from 'preact';
import { App } from './App';
import { isNative } from './device';
import { startSync } from './sync';
import './styles.css';

render(<App />, document.getElementById('app')!);

// La condición se escribe entera para que el build descarte la variante que no se usa.
if (import.meta.env.VITE_TARGET === 'artifact') {
  document.documentElement.classList.add('artifact');
  void import('./sync-artifact').then((m) => m.startArtifactSync());
} else {
  startSync();
}

// El service worker (modo offline / instalable) solo se registra en la web;
// la APK ya trae los archivos adentro.
if (import.meta.env.PROD && import.meta.env.VITE_TARGET !== 'artifact' && !isNative() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
// Pide al navegador que no borre los datos locales por falta de espacio.
navigator.storage?.persist?.().catch(() => {});
