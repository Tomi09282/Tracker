# Observability

Why this design: a crash log and "important events" file (see server-skeleton.md) tell you *that*
something broke, not *which request* broke or *how the box is doing right now*. Observability adds
three cheap, vendor-neutral layers on top of the existing pino logger: a **request id** that ties
every log line of one request together (and follows it across the reverse proxy and the process
cluster), **structured request logs** with latency/status/user, and **health + metrics endpoints**
a load balancer or Prometheus can scrape. Everything here is stdlib + pino + optional `prom-client`;
no SaaS agent is mandated, only a clearly marked hook where one would attach.

## Request id + per-request child logger

One middleware, mounted first, so every downstream handler and error gets a correlated `req.log`.

```js
// src/lib/request-context.js
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

// Accept an inbound id from the proxy/upstream so a trace spans services; only trust a sane-looking
// one (opaque, bounded) — never reflect arbitrary client input into logs/headers unfiltered.
const VALID_ID = /^[A-Za-z0-9_-]{8,128}$/;

export function requestContext(req, res, next) {
  const inbound = req.get('X-Request-Id');
  const requestId = inbound && VALID_ID.test(inbound) ? inbound : randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId); // let the client/proxy correlate too
  // pid ties the line to a specific cluster worker (see cluster-scaling.md); the child binds
  // requestId to every subsequent req.log.* call for free.
  req.log = logger.child({ requestId, pid: process.pid });
  next();
}
```

## Structured request logging

Log once per request at completion — never the body, headers, cookies, or query secrets. `userId`
appears only after auth has populated `req.user` (see auth-blueprint.md `requireAuth`).

```js
// src/lib/request-logger.js
// Emits one structured line per finished request. Mount AFTER requestContext, BEFORE routes.
export function requestLogger(req, res, next) {
  const startNs = process.hrtime.bigint();

  // 'finish' = response fully flushed; 'close' catches client aborts that never finish.
  // Guard both listeners so a request that fires 'finish' then 'close' is only logged once.
  const done = () => {
    res.removeListener('finish', done);
    res.removeListener('close', done);
    const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    // 5xx is our fault → error; 4xx is the client's → warn; else info.
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    req.log[level](
      {
        method: req.method,
        url: req.originalUrl.split('?')[0], // drop the query string — it can carry tokens/PII
        status: res.statusCode,
        latencyMs: Math.round(latencyMs * 10) / 10,
        userId: req.user?.id, // undefined on unauthenticated routes — fine
      },
      'request',
    );
  };

  res.on('finish', done);
  res.on('close', done);
  next();
}
```

Wiring in `server.js` (see server-skeleton.md) — these two go first so even a 404 or a body-parser
rejection is logged with an id, and the central error handler switches to `req.log`:

```js
import { requestContext } from './src/lib/request-context.js';
import { requestLogger } from './src/lib/request-logger.js';
import { health } from './src/lib/health.js';
import { metrics, metricsMiddleware } from './src/lib/metrics.js';

app.use(requestContext);   // 1st: every later line is correlated
app.use(requestLogger);    // one line per request on finish
app.use(metricsMiddleware);// optional counters (below)

app.use('/', health);      // /healthz + /readyz — unauthenticated, before auth routes
// app.get('/metrics', metrics); // only if something scrapes it — protect it (internal net / bearer)

// ...feature routers...

// Central error handler: prefer the correlated child so the failing request is greppable by id.
// Keep the skeleton's client-fault branches (they must NOT log as 500s / server errors).
app.use((err, req, res, _next) => {
  if (err?.name === 'ZodError') return res.status(400).json({ error: 'invalid input' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'malformed JSON' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'payload too large' });
  (req.log ?? logger).error({ err, requestId: req.id }, 'unhandled route error');
  // captureError(err, req);  // <-- error-tracking hook point, see below
  res.status(500).json({ error: 'internal server error' });
});
```

## Health endpoints

Two endpoints with different contracts. `/healthz` answers "is this process alive?" and must stay
trivial — a load balancer hits it constantly and a DB probe here would take the box out of rotation
during a transient DB blip. `/readyz` answers "can it serve traffic?" and *does* probe the DB
through the pool, so it goes unready (not dead) when SQLite is unreachable.

```js
// src/lib/health.js
import { Router } from 'express';
import * as db from '../db/index.js';

export const health = Router();

// Liveness: no I/O. If the event loop can answer this, the process is up. Never touch the DB here.
health.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok', pid: process.pid }));

// Readiness: prove the DB is reachable through the worker pool. SELECT 1 also confirms the
// encryption key decrypts (a wrong key throws SQLITE_NOTADB on first query — see db-layer.md).
health.get('/readyz', async (req, res) => {
  try {
    await db.get('SELECT 1 AS ok');
    res.status(200).json({ status: 'ready', pid: process.pid });
  } catch (err) {
    req.log?.error({ err }, 'readiness probe failed'); // one worker unready ≠ crash
    res.status(503).json({ status: 'unready' });
  }
});
```

Keep both out of the auth chain and out of the per-IP rate limiter — a probe hammering the endpoint
must not exhaust a login budget. In clustered mode any worker can answer either probe (see
cluster-scaling.md); `pid` in the body tells you *which* one did.

## Runtime metrics (optional prom-client hook)

A tiny always-on core (event-loop lag, RSS, request counters) with an optional `/metrics` scrape
endpoint. If `prom-client` isn't installed the stub still tracks counters in memory for logging.

```js
// src/lib/metrics.js
import { monitorEventLoopDelay } from 'node:perf_hooks';

// Event-loop lag is the single most useful "is this process healthy" signal: it rises the moment
// a sync call (e.g. a stray DB query on the loop) or CPU work starves request handling.
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

const counters = { requests: 0, byStatusClass: { '2xx': 0, '4xx': 0, '5xx': 0 } };

export function metricsMiddleware(_req, res, next) {
  res.once('finish', () => {
    counters.requests += 1;
    const cls = `${Math.floor(res.statusCode / 100)}xx`;
    if (cls in counters.byStatusClass) counters.byStatusClass[cls] += 1;
  });
  next();
}

// Snapshot for ad-hoc logging or a JSON status route.
export function snapshot() {
  const mem = process.memoryUsage();
  return {
    pid: process.pid,
    uptimeS: Math.round(process.uptime()),
    rssMb: Math.round(mem.rss / 1024 / 1024),
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    loopLagP99Ms: Math.round(loopDelay.percentile(99) / 1e6),
    ...counters,
  };
}

// Lazily load prom-client ONCE and register the default gauges exactly once. Calling
// collectDefaultMetrics() twice throws "metric ... already registered", so cache the load
// PROMISE, not the resolved client — with a plain result cache, two concurrent first scrapes
// both pass the undefined-check, the second registration throws, and the catch would wrongly
// mark prom-client "not installed" forever.
let promClientPromise; // undefined = not tried; resolves to the client, or null if not installed
function getPromClient() {
  promClientPromise ??= import('prom-client')
    .then(({ default: client }) => {
      client.collectDefaultMetrics(); // process/GC/loop gauges — registered a single time
      return client;
    })
    .catch(() => null); // prom-client absent → fall back to the JSON snapshot
  return promClientPromise;
}

// Optional Prometheus endpoint. The app runs fine WITHOUT prom-client; mount `metrics` in
// server.js only if you scrape it, and protect it (internal network / bearer).
export async function metrics(_req, res) {
  const client = await getPromClient();
  if (!client) {
    return res.status(200).type('application/json').send(JSON.stringify(snapshot(), null, 2));
  }
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics()); // register.metrics() is async — await it
}
```

`prom-client` runs one registry *per process*; under clustering each worker exposes its own counts —
scrape by pid or use `client.AggregatorRegistry` in the cluster primary if you need a single rollup.

## Error-tracking hook point (no vendor lock-in)

The design leaves exactly one seam so a Sentry-like reporter can attach without touching business
code — the central error handler's marked line. Keep the adapter thin and fail-open.

```js
// src/lib/error-reporter.js — swap the body for Sentry/GlitchTip/etc.; the call site never changes.
export function captureError(err, req) {
  // Send err + { requestId: req.id, userId: req.user?.id, url } to your reporter here.
  // NEVER forward req.body/headers/cookies — same secret discipline as the logs.
  // Must never throw: a reporting failure cannot take down request handling.
}
```

Until a reporter is wired, `req.log.error` in the handler is the source of truth — the `requestId`
makes any 500 fully reconstructable from `server.log`.

## Log levels & correlation recap

- `req.log.info` — `request` completion lines (2xx/3xx), auth events.
- `req.log.warn` — 4xx (client faults), rate-limit hits, sv mismatches.
- `req.log.error` — 5xx and probe failures, with the `err` object.
- `logger.fatal` — process about to die (see server-skeleton.md handlers).
- **Correlate** by `requestId` (one request, possibly across services) and `pid` (which cluster
  worker). Both are on every `req.log` line automatically; add `requestId` explicitly on the few
  lines that use the root `logger` instead of `req.log`.
- **Never log**: bodies, query strings, tokens, cookies, the DB key. `originalUrl` is truncated at
  `?` for this reason.

## Graceful-shutdown log lines

Extend the `shutdown()` in server-skeleton.md so drain timing is visible and a stuck drain is
obvious in the log:

```js
function shutdown(signal) {
  logger.info({ signal, pid: process.pid }, 'shutdown: signal received, draining');
  server.close(async () => {
    await db.closePool();
    logger.info({ pid: process.pid }, 'shutdown: drained cleanly'); // paired with the hard-exit warn
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn({ pid: process.pid }, 'shutdown: drain timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}
```

In clustered mode the primary logs the fleet-level signal and each worker logs its own drain (see
cluster-scaling.md); matching `pid`s across the lines let you confirm every worker exited cleanly.
