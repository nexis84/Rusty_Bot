/* Rusty Ship Tree service worker.
 *
 * The shell is cached so the tree opens offline. Data is network-first with a
 * cache fallback: a new SDE build must never be hidden behind the service
 * worker after the edge cache has revalidated.
 */
const CACHE = 'shiptree-v1';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './esi.js',
  './welcome.js',
  './sso-callback.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './img/factions/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // CCP images, Fuzzwork, ESI

  // Navigations and code/style: network-first so a deploy cannot be masked by
  // an older cached app.js or style.css. Offline falls back to the cache.
  const isShell = req.mode === 'navigate'
    || /\.(?:js|css|html|webmanifest)$/.test(url.pathname)
    || url.pathname.endsWith('/manifest.json');
  if (isShell) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // Data: network-first so a refreshed SDE lands immediately; fall back offline.
  // Cache by path, not by the version query, so old builds do not accumulate.
  if (url.pathname.includes('/data/')) {
    const key = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(key, copy));
          return res;
        })
        .catch(() => caches.match(key))
    );
    return;
  }

  // Images/icons: cache-first, then network and cache.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(req, copy));
      return res;
    }))
  );
});
