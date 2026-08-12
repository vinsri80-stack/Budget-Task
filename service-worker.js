/* Offline shell cache. Bump CACHE_NAME after changing any asset. */
const CACHE_NAME = 'budget-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/models.js',
  './js/cycle.js',
  './js/calc.js',
  './js/storage.js',
  './js/export.js',
  './js/ui/dom.js',
  './js/ui/dashboard.js',
  './js/ui/inflow.js',
  './js/ui/expenses.js',
  './js/ui/outflow.js',
  './js/ui/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  // Never cache sync traffic — always go live for data.
  if (url.includes('googleapis.com') || url.includes('gstatic.com')) return;
  if (event.request.method !== 'GET') return;

  // Network-first for app code so updates land; cache is the offline fallback.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
