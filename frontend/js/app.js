// PWA entrypoint: register the service worker, then start the router.
import { startRouter } from './router.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Non-fatal in dev; the app works without offline caching.
    });
  });
}

startRouter();
