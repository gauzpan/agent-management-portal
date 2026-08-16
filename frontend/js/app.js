// PWA entrypoint: register the service worker, then start the router.
import { startRouter } from './router.js';
import { api } from './api.js';

// Wake the backend the instant the app loads. Render's free tier spins the
// service down after ~15 min idle, so the first request after that pays a full
// cold-boot (container + Postgres connect + migrations). Firing this now — while
// the user reads the login screen and types — overlaps that spin-up with their
// input, so the actual /auth/login call lands on an already-warm server.
// Fire-and-forget: a failure or slow cold-start here must never block the UI.
api.health().catch(() => {});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Non-fatal in dev; the app works without offline caching.
    });
  });
}

startRouter();
