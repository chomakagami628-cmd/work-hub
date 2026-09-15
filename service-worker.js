const CACHE = 'work-hub-pwa-v1.0.4-price-only';
const ASSETS = [
  './', './index.html', './popup.css', './popup.js', './console-data.js', './game-data.js', './manifest.webmanifest'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => {
    const copy = res.clone();
    if (new URL(req.url).origin === self.location.origin) caches.open(CACHE).then(c => c.put(req, copy));
    return res;
  })));
});
