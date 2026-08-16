# Cluster scaling — multi-process HTTP load balancing

Two independent layers of parallelism exist in this stack:

1. **DB worker pool (piscina)** — always on. Keeps SQLite off the event loop. This alone fixes
   the "server freezes under many users" problem.
2. **HTTP process cluster (node:cluster)** — optional. Runs N full copies of `server.js` sharing
   one port; Node/the OS distributes incoming connections across them. Turn this on when a
   single event loop becomes the bottleneck.

**When to enable clustering:** sustained CPU above ~70% on the server process, request latency
growing under load while the DB is idle, or heavy argon2 traffic (login storms). Until then, a
single process + the DB pool is simpler and usually enough. No sticky sessions are needed —
auth is stateless (JWT cookies), any worker can serve any request.

## cluster.js

```js
// cluster.js — run with: node cluster.js
// Multi-process HTTP scaling + crash supervision in one file. In clustered mode this REPLACES
// run-server.js (the primary is the supervisor); keep run-server.js for single-process deploys.
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import { appendFileSync, mkdirSync } from 'node:fs';

if (cluster.isPrimary) {
  // Leave headroom: every web worker also runs its own DB thread pool (see sizing below).
  const WEB_WORKERS = Math.max(2, Math.min(4, availableParallelism() - 2));
  mkdirSync('./logs', { recursive: true });
  const startedAt = new Map();
  let backoff = 0;
  let shuttingDown = false;

  const fork = () => {
    if (shuttingDown) return; // a backoff timer must not spawn a fresh worker after the kill sweep
    const w = cluster.fork();
    startedAt.set(w.id, Date.now());
  };
  for (let i = 0; i < WEB_WORKERS; i++) fork();

  // Graceful shutdown: forward the signal so workers drain (server.js handles SIGINT/SIGTERM),
  // never refork during shutdown, and exit once every worker is gone. Without this, kill /
  // docker stop / Ctrl+C would orphan the workers or refork them forever.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      shuttingDown = true;
      for (const id in cluster.workers) cluster.workers[id].process.kill(sig);
      setTimeout(() => process.exit(1), 15_000).unref(); // hard exit if draining hangs
    });
  }

  cluster.on('exit', (worker, code, signal) => {
    const uptimeMs = Date.now() - (startedAt.get(worker.id) ?? Date.now());
    startedAt.delete(worker.id);

    if (shuttingDown) {
      if (Object.keys(cluster.workers).length === 0) process.exit(0);
      return;
    }
    if (code === 0) return; // clean, deliberate worker exit — do not refork

    appendFileSync('./logs/crash.log', JSON.stringify({
      time: new Date().toISOString(),
      pid: worker.process.pid,
      exitCode: code,
      signal,
      uptimeMs,
    }) + '\n');

    if (uptimeMs > 60_000) backoff = 0; // worker ran fine for a while → reset the backoff
    const delayMs = Math.min(30_000, 1000 * 2 ** backoff);
    backoff += 1;
    console.error(`web worker ${worker.process.pid} died (code ${code}) — refork in ${delayMs} ms`);
    setTimeout(fork, delayMs);
  });
} else {
  await import('./server.js'); // each worker is a full server sharing the same port
}
```

`server.js` needs no changes — `app.listen` inside a cluster worker automatically shares the
primary's port.

## Sizing the DB pool under clustering

Total threads multiply: `web workers × DB pool threads`. The db-layer template reads
`DB_POOL_THREADS` for exactly this reason — set it in `.env` when clustering:

```ini
# clustered mode on an 8-core box: cluster.js forks 4 web workers; 4 × 2 DB threads
# + 4 event loops keeps the total near the core count
DB_POOL_THREADS=2
```

Single-process mode leaves it unset (pool defaults to cores − 1).

## What becomes per-process (know the trade-offs)

- **express-rate-limit MemoryStore**: each worker counts separately, so the effective per-IP
  limit is roughly `limit × workers`. Either divide the configured limits by the worker count,
  or move to a shared store (`rate-limit-redis`) when limits must be exact.
- **sv (session-version) cache**: per process, 30 s TTL. On theft detection/`logout-all`, only
  the handling process invalidates instantly; other workers converge within ≤30 s. Acceptable
  for most apps; move the cache to Redis if you need cluster-wide instant revocation.
- **argon2 DUMMY_HASH, prepared statements, piscina pools**: duplicated per worker — fine.
- **pino logs**: all workers append pid-tagged lines to the same `server.log`. Fine on one box;
  at serious scale, use per-pid files or a log shipper.
- **SQLite**: WAL mode fully supports multiple processes on one machine. Writes remain globally
  single-writer — `busy_timeout` in every connection is what keeps that graceful.

## Alternative: PM2

`pm2 start server.js -i max` gives the same multi-process model plus monitoring/log rotation.
Prefer PM2 (or systemd + cluster.js) in production; cluster.js keeps local/dev/VPS setups
dependency-free.
