// Service worker: precache the static app shell for offline use, but serve app
// code NETWORK-FIRST so a code change is never masked by a stale cache (a
// cache-first worker made edits "disappear" until a manual cache clear). The
// cache is the offline fallback, not the source of truth.
const CACHE = 'amp-shell-v7';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/app.css',
  './js/app.js',
  './js/router.js',
  './js/store.js',
  './js/api.js',
  './js/nav.js',
  './js/ui.js',
  './js/pages/login.js',
  './js/pages/shell.js',
  './js/pages/dashboard.js',
  './js/pages/placeholder.js',
  './js/pages/applications.js',
  './js/pages/application.js',
  './js/pages/agreement.js',
  './js/pages/invite.js',
  './js/pages/agent-dashboard.js',
  './js/pages/marketing.js',
  './js/pages/agent-profile.js',
  './js/pages/intake.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never intercept API calls; let them hit the network (and fail loudly offline).
  // The backend is a different origin in every environment (:8000 locally, a
  // separate onrender.com host in prod), so skip anything cross-origin.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  // Network-first: always try the live file, fall back to cache when offline.
  // Keeps the cache warm for offline, but never serves stale code while online.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request).then(
        (hit) => hit || caches.match('./index.html')
      ))
  );
});
