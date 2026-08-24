const CACHE_NAME = 'rpca79-v2';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for navigations (always want the freshest app shell / queue data
// possible) with a cached-shell + friendly offline fallback if the network is down.
// Cache-first for the small set of static assets.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match('./index.html').then(cached => cached || caches.match('./'))
      )
    );
    return;
  }
  if (urlsToCache.some(u => req.url.endsWith(u.replace('./', '')))) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req))
    );
  }
});
