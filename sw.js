// Bump CACHE_VERSION whenever you ship a release — old caches are purged on activate.
const CACHE_VERSION = 'v39-2026-05-24';
const CACHE = 'garden-almanac-' + CACHE_VERSION;
const SHELL = 'garden-almanac-v5.html';
const MANIFEST = 'manifest.json';

// Google Fonts — precache so the app keeps its typography offline.
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Space+Mono:wght@400;700&display=swap';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(new Request(self.registration.scope + SHELL, { cache: 'reload' }));
    try { await cache.add(new Request(self.registration.scope + MANIFEST, { cache: 'reload' })); } catch (_) {}
    try {
      const cssRes = await fetch(FONT_CSS, { cache: 'reload' });
      await cache.put(FONT_CSS, cssRes.clone());
      const cssText = await cssRes.text();
      const fontUrls = [...cssText.matchAll(/url\((https:\/\/[^)]+\.woff2?)\)/g)].map(m => m[1]);
      await Promise.all(fontUrls.map(u => fetch(u, { mode: 'cors' }).then(r => cache.put(u, r)).catch(() => {})));
    } catch (_) {}
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Allow the page to ask the SW to activate immediately on update.
self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

// Stale-while-revalidate for shell, manifest, and Google Fonts assets.
self.addEventListener('fetch', e => {
  const url = e.request.url;
  const isShell = url.includes(SHELL);
  const isManifest = url.endsWith('/' + MANIFEST);
  const isFontCss = url.startsWith('https://fonts.googleapis.com/');
  const isFontFile = url.startsWith('https://fonts.gstatic.com/');
  if (!isShell && !isManifest && !isFontCss && !isFontFile) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const network = fetch(e.request).then(fresh => {
          if (fresh && fresh.status === 200) cache.put(e.request, fresh.clone());
          return fresh;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
