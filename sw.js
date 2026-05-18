const CACHE = 'garden-almanac-v1';
const SHELL = 'garden-almanac-v5.html';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.add(new Request(self.registration.scope + SHELL, { cache: 'reload' }))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate: return cached immediately, update in background.
self.addEventListener('fetch', e => {
  if (!e.request.url.includes(SHELL)) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const network = fetch(e.request).then(fresh => {
          cache.put(e.request, fresh.clone());
          return fresh;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
