// Service worker: deja la app disponible sin conexión.
// Al instalarse lee index.html y precachea los assets que referencia.
const CACHE = 'gym-tracker-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch('./index.html', { cache: 'no-store' });
      const html = await res.clone().text();
      await cache.put('./index.html', res);
      const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((u) => !/^(https?:|data:)/.test(u));
      await Promise.all(urls.map((u) => cache.add(u).catch(() => {})));
      await cache.add('./icon-512.png').catch(() => {});
      self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // La API de sincronización nunca se cachea.
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') {
        // Red primero para recibir actualizaciones; caché si no hay conexión.
        try {
          const fresh = await fetch(req);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch {
          return (await cache.match('./index.html')) || Response.error();
        }
      }
      const hit = await cache.match(req);
      if (hit) return hit;
      const fresh = await fetch(req);
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    })(),
  );
});
