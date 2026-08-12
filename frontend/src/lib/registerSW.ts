/**
 * Service worker registration — deliberately narrow about WHEN.
 *
 * ═══ NOT IN THE CAPACITOR WEBVIEW ══════════════════════════════════════════════════════════════
 *
 * The native builds ship their bundle inside the app package and Capacitor serves it from its own
 * scheme. A service worker there caches THAT bundle by URL — and those URLs do not change when the
 * user installs a new version from the store, so the worker would keep serving the old app on top
 * of the new native shell. The app would update and appear not to. Nothing offline is gained
 * either: the assets are already on the device, which is the whole point of a native build.
 *
 * ═══ NOT IN DEV ════════════════════════════════════════════════════════════════════════════════
 *
 * Vite serves unhashed module URLs in dev, so a worker caching `/src/App.tsx` serves yesterday's
 * component after an edit and the HMR update arrives on top of it. Hours get spent on a bug that
 * is a stale cache. Production builds have hashed names and no such problem.
 *
 * ═══ AND IT CLEANS UP AFTER ITSELF ═════════════════════════════════════════════════════════════
 *
 * When the conditions do NOT hold, this does not simply skip: it unregisters anything already
 * installed and drops the caches. A worker registered by an earlier build — or by the web app on a
 * device that later installed the native one, same origin — would otherwise keep serving from disk
 * with nothing left to update it. A worker with no code left to manage it is unreachable except by
 * clearing site data, which is not something a user will do.
 */

/** True inside a Capacitor native shell. `Capacitor.isNativePlatform()` without importing it. */
function isNativeShell(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : false;
}

async function unregisterEverything() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if ('caches' in window) {
    for (const key of await caches.keys()) {
      if (key.startsWith('tracker-')) await caches.delete(key);
    }
  }
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  if (!import.meta.env.PROD || isNativeShell()) {
    void unregisterEverything();
    return;
  }

  // After `load`, so registration never competes with the first paint for bandwidth.
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // A failed registration is not a failed app. The product works without it — it just does
      // not start offline — so this must never surface as an error to the user.
    });
  });
}
