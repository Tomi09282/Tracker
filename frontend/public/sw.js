/*
 * Tracker service worker — the offline SHELL, and nothing else.
 *
 * ═══ THE ONE RULE THIS FILE EXISTS TO KEEP ═════════════════════════════════════════════════════
 *
 * NOTHING FROM /api/ IS EVER WRITTEN TO A CACHE.
 *
 * A service worker cache is per-ORIGIN, not per-session. It survives logout, it survives the cookie
 * expiring, and it is readable by whoever opens the browser next. Caching `/api/v1/me` would leave
 * one person's account behind for the next person on a shared phone; caching `/api/v1/media/:key`
 * would leave their photos. The product's own rule — every read is ownership-scoped — is enforced
 * by the server on every request, and a cache is precisely the thing that answers WITHOUT asking
 * the server.
 *
 * So the API is not "cached carefully". It is passed through untouched, and `handle()` returns
 * early for it before any cache is opened. The rest of this file only ever sees public bytes: the
 * HTML shell, the hashed JS/CSS bundles, the icons.
 *
 * ═══ WHAT OFFLINE ACTUALLY MEANS HERE ══════════════════════════════════════════════════════════
 *
 * The app STARTS. That is the whole promise. A cold launch with no signal renders the real UI, the
 * offline banner appears because /healthz cannot be reached, and anything the user does that needs
 * the server says so. It does not mean their data is available offline — that would require caching
 * exactly what the rule above forbids.
 */

// Bumping this string is what retires every previous cache. It is the only version knob.
const VERSION = 'tracker-shell-v1';

// The navigation fallback and the handful of files needed to paint before any bundle loads.
// Hashed assets are NOT listed: their names change every build, so they are cached on first use.
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // Individually, not `addAll`: addAll is atomic, so one 404 on an optional icon would throw
      // away the shell HTML with it and leave the worker installed with an empty cache.
      await Promise.all(
        SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})),
      );
      // Take over at once. The alternative is a worker that activates on the NEXT visit, which
      // means the first install never protects the session that performed it.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== VERSION) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/**
 * `true` for anything that must never be served from, or written to, a cache.
 *
 * Read it as a list of reasons rather than a list of paths:
 *   - /api/      — every response is scoped to a session that the cache does not know about;
 *   - /healthz   — the offline indicator asks it whether the network is real. A cached 200 would
 *                  answer "you are online" from disk, which is the exact lie the indicator was
 *                  written to avoid (see OfflineIndicator's header).
 */
const isNeverCached = (url) => url.pathname.startsWith('/api/') || url.pathname === '/healthz';

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET. A POST is an intention, and replaying one from a worker is how a set gets logged
  // twice — the offline OUTBOX handles writes, with the idempotency key the server needs.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNeverCached(url)) return;

  event.respondWith(handle(request, url));
});

async function handle(request, url) {
  const cache = await caches.open(VERSION);

  // A navigation: network first, so a deployed change is picked up the moment there is signal, and
  // the cached shell only stands in when the network genuinely fails.
  if (request.mode === 'navigate') {
    try {
      return await fetch(request);
    } catch {
      // Every route renders from the same HTML — falling back to '/' is what makes a deep link
      // work offline instead of showing the browser's error page.
      return (await cache.match('/')) ?? Response.error();
    }
  }

  // Hashed build output is immutable: if the bytes are here, they are the right bytes, and going
  // to the network for them is latency spent to learn nothing.
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Only store what is genuinely ours and genuinely complete. An opaque cross-origin response
    // has status 0 and unreadable contents; a 404 stored now is a 404 served forever.
    if (response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // No network and nothing cached. Let the failure be a failure — a fabricated empty response
    // would be indistinguishable from an empty answer the server actually gave.
    throw err;
  }
}
