// src/lib/ttl-cache.js — a tiny in-process read cache with single-flight.
//
// ═══ WHY IT EXISTS ═════════════════════════════════════════════════════════════════════════════
//
// The admin statistics are SCANS: they group a date range across every user. Each is index-backed
// (see docs/pipeline/pulse/pkg/B-admin-stats/api.md for the EXPLAIN QUERY PLAN), but "index-backed
// range scan over the whole platform" still grows with the platform, and the Moderation tab opens
// the panel on every visit while the Statistics page re-asks on every window switch. A per-admin
// rate limit bounds one principal; it does not bound the DATABASE, because the work is the same
// whoever asks. A short TTL does: N admins hammering the page cost one computation per key per TTL.
//
// ═══ WHAT IT IS NOT ════════════════════════════════════════════════════════════════════════════
//
//   * Not a place for anything a user can change and then expects to see at once. The values cached
//     through here are read-only analytics; the counters an admin ACTS on (the moderation queue
//     length, the open-report count) are deliberately read live next to them.
//   * Not shared between processes. Under cluster.js each worker process keeps its own copy, so the
//     bound is "one computation per key per TTL per process" — still a constant, never per request.
//   * Never invalidated. There is no write path to hook: the TTL is the whole consistency story.
//
// SINGLE-FLIGHT: while a computation for a key is running, every other caller for the same key waits
// for that one promise instead of starting its own. Without it, a cold cache under N concurrent
// admins runs the scan N times at once — the exact stampede the cache is there to prevent.

export function createTtlCache({ now = Date.now, maxEntries = 32 } = {}) {
  /** key -> { at, value } for a stored value; pending computations live in `inflight`. */
  const stored = new Map();
  const inflight = new Map();

  const sweep = (ttlMs) => {
    // Called only when the map is already big. Keys carry the day (see admin/statistics.js), so a
    // long-running process would otherwise collect a few dead entries per day forever.
    const t = now();
    for (const [k, v] of stored) if (t - v.at >= ttlMs) stored.delete(k);
    if (stored.size >= maxEntries) stored.clear();
  };

  /**
   * @returns {{ value: any, at: number, cached: boolean }}  `at` is when the value was computed
   *   (ms); `cached` is true only when the value came out of the store, not when this caller
   *   computed it or joined a computation that was already running for it.
   */
  async function get(key, ttlMs, compute) {
    const t = now();
    const hit = stored.get(key);
    if (hit && t - hit.at < ttlMs) return { value: hit.value, at: hit.at, cached: true };

    const running = inflight.get(key);
    if (running) {
      const done = await running;
      return { value: done.value, at: done.at, cached: false };
    }

    const job = (async () => {
      const value = await compute();
      const entry = { at: now(), value };
      if (stored.size >= maxEntries) sweep(ttlMs);
      stored.set(key, entry);
      return entry;
    })();
    inflight.set(key, job);
    try {
      const done = await job;
      return { value: done.value, at: done.at, cached: false };
    } finally {
      // A failed computation is NOT stored: the next caller retries instead of being served the
      // outage for a whole TTL.
      inflight.delete(key);
    }
  }

  return { get, size: () => stored.size };
}
