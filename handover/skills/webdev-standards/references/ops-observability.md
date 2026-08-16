# Ops observability

Why this design: [observability.md](observability.md) covers the *in-process* signals — request-id
correlation, structured pino lines, `/healthz`+`/readyz`. This file covers the *operational* layer
around a single VPS: where errors go when the box is on fire, who pages you when it stops answering,
where the audit trail lives after a container is wiped, how a slow request is attributed to a
specific query, and what stops a runaway request from OOM-killing the process. Everything self-hosts,
same philosophy as the encrypted SQLite — error data, logs, traces stay on hardware you control. One
SDK (`@sentry/node` → self-hosted GlitchTip) does both error capture and OTel tracing: one agent.

**ESM caveat up front (drives the whole design).** This stack is ES modules. Sentry's HTTP/Express
tracing is OpenTelemetry auto-instrumentation, and in ESM that only hooks a module if `Sentry.init`
runs **before that module is imported** — a plain top-of-`server.js` `import` cannot achieve this
(the `import` graph for express/http is resolved before your first statement runs). The supported
fix is `node --import ./instrument.mjs`, which runs the init in a loader hook before app code. So
`Sentry.init` lives in a standalone `instrument.mjs`, and we launch every entrypoint with
`NODE_OPTIONS="--import ./instrument.mjs"` (inherited by `cluster.fork()` workers and the
`run-server.js` child). Without this, error *capture* still works but Express/HTTP spans never appear.

## Structured error monitoring (self-hosted GlitchTip)

Rationale: `crash.log` tells you a worker died; GlitchTip groups the *same* exception across every
pid, keeps the stack + request context, and de-dupes so you fix a class of bug once.

GlitchTip is Sentry-API-compatible and ships as one Docker container plus its own Postgres. The
`Sentry.init` lives in a loader-loaded `instrument.mjs`; scrubbing + helpers live in
`src/lib/observability.js` so app code imports the wrapper, not the SDK directly.

```js
// instrument.mjs — repo root. Loaded via NODE_OPTIONS="--import ./instrument.mjs" so it runs
// BEFORE express/http are imported; that ordering is what enables ESM auto-instrumentation.
import * as Sentry from '@sentry/node';
import { env } from './src/lib/env.js';

// No DSN (dev/test) → Sentry.init still runs but no-ops (nothing shipped). We skip it entirely so
// the SDK never patches globals when the feature is off.
if (env.GLITCHTIP_DSN) {
  // scrub is defined in observability.js; import it here to keep one source of truth.
  const { scrub } = await import('./src/lib/observability.js');
  Sentry.init({
    dsn: env.GLITCHTIP_DSN,
    environment: env.NODE_ENV,
    release: env.COMMIT_SHA,          // group regressions by deploy; set from `git rev-parse HEAD`
    tracesSampleRate: env.OTEL_SAMPLE_RATE ?? 0.05, // low in prod; reused for OTel spans below
    sendDefaultPii: false,            // never auto-attach cookies/IP/user identifiers
    beforeSend: scrub,                // scrub exceptions
    beforeSendTransaction: scrub,     // scrub trace/span payloads too (SQL text, headers)
    initialScope: { tags: { pid: String(process.pid) } }, // distinguish clustered workers
  });
}
```

```js
// src/lib/observability.js — scrub + fail-open capture helpers. No Sentry.init here.
import * as Sentry from '@sentry/node';

// Secret-shaped strings we must never ship to the error store, matching the 'never log secrets'
// rule (see env-and-secrets.md). Redacts a 64-hex DB hexkey, base64url JWTs, and bearer tokens.
const SECRET_RE = /\b([A-Fa-f0-9]{64}|Bearer\s+[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g;
const SCRUB_HEADERS = ['cookie', 'authorization', 'x-csrf', 'x-request-id'];

// beforeSend/beforeSendTransaction: mutate then return the event (returning null would drop it).
// Node lowercases all incoming HTTP header names, and Sentry builds event.request.headers from
// req.headers, so the lowercase SCRUB_HEADERS keys match what actually arrives.
export function scrub(event) {
  const req = event.request;
  if (req?.headers) for (const h of SCRUB_HEADERS) delete req.headers[h];
  if (req?.cookies) delete req.cookies;
  if (req) delete req.data; // request body may carry passwords/tokens — never forward it
  // Last-ditch string sweep over the serialized event for anything token-shaped that slipped in.
  // Detach sdkProcessingMetadata first: the SDK parks the RAW Node request object there (circular
  // via its socket), so JSON.stringify would throw — and a throwing beforeSend makes Sentry drop
  // the whole event. It is internal bookkeeping that never ships on the wire, so it needs no
  // scrubbing; reattach it so trace headers (dynamic sampling context) keep working.
  const meta = event.sdkProcessingMetadata;
  delete event.sdkProcessingMetadata;
  const swept = JSON.parse(JSON.stringify(event).replace(SECRET_RE, '[redacted]'));
  if (meta) swept.sdkProcessingMetadata = meta;
  return swept;
}

// Thin, fail-open wrapper so a reporting outage can never take down request handling. This is the
// concrete body for the `captureError` seam in observability.md's central error handler; it no-ops
// when the DSN is absent because captureException on an uninitialized client is itself a no-op.
export function captureError(err, req) {
  try {
    Sentry.withScope((scope) => {
      if (req) scope.setContext('request', { requestId: req.id, userId: req.user?.id });
      Sentry.captureException(err);
    });
  } catch { /* swallow — monitoring must never crash the app */ }
}

export { Sentry };
```

Wiring. `Sentry.setupExpressErrorHandler(app)` must run **after** all routes but **before** the
central error handler (see [observability.md](observability.md)), so Sentry sees the exception first
and the handler still returns the generic client message. Guard it on the DSN so a dev run without
instrumentation doesn't log the "Express is not instrumented" warning:

```js
// server.js — no Sentry.init import here; instrument.mjs already ran via --import.
import { env } from './src/lib/env.js';
import { captureError, Sentry } from './src/lib/observability.js';
// ...express app, routes...
if (env.GLITCHTIP_DSN) Sentry.setupExpressErrorHandler(app); // BEFORE the central error handler
app.use((err, req, res, _next) => { /* existing central handler; call captureError(err, req) */ });

// Fatal handlers already in server.js — flush before exit so the last event is not lost.
// Sentry.flush(timeout) resolves to a boolean; we ignore it and always exit.
process.on('uncaughtException', async (err) => {
  logger.fatal({ err }, 'uncaughtException');
  captureError(err);
  await Sentry.flush(2000).catch(() => {});
  process.exit(1);
});
// same shape for 'unhandledRejection'
```

`run-server.js` inherits `NODE_OPTIONS` through `env: process.env` when it `spawn`s the child, so the
child is instrumented automatically — just export `NODE_OPTIONS="--import ./instrument.mjs"` in the
service environment (the systemd unit below does this). `cluster.js` workers inherit it the same way
via `cluster.fork()`. To also report a worker death the in-process handler never saw (hard abort,
kernel OOM kill), capture a synthesized error in the supervisor's `exit` handler right before its
`appendFileSync(crash.log)` — e.g. `captureException(new Error(`worker ${pid} died, code ${code}`));
await Sentry.flush(2000)` — the supervisor is instrumented too, since it inherits the same
`NODE_OPTIONS` (there is no `err` object at that site, only exit metadata).

## Health & readiness endpoints that probe the worker pool

Rationale: an endpoint that only proves *Express answers* is worthless for a load balancer — it must
prove the encrypted DB thread pool answers, and must go unready during boot-migrate and shutdown
drain so traffic stops **before** `server.close`.

`/healthz`+`/readyz` already exist in [observability.md](observability.md). Two ops additions: a
`shuttingDown` flag flipped in the shutdown handler, and a hard timeout on the DB probe so a hung
pool fails readiness fast instead of holding the socket open.

```js
// src/lib/health.js — extends the version in observability.md.
import { Router } from 'express';
import * as db from '../db/index.js';

export const health = Router();
export const state = { ready: false, shuttingDown: false }; // ready flips true after db.migrate

health.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok', pid: process.pid }));

health.get('/readyz', async (req, res) => {
  // Draining or still migrating → 503 so the LB/cluster primary drains us before server.close.
  if (state.shuttingDown || !state.ready) return res.status(503).json({ status: 'unready' });
  let timer;
  try {
    // Race the pooled probe against a 500ms timeout — a wedged pool must not hold the socket open.
    // Keep a handler on the probe itself: if the timeout wins and the probe rejects LATER, that
    // orphaned rejection would surface as an unhandledRejection — which the fatal handler
    // (server-skeleton.md) turns into a process exit. A readiness blip must not crash the worker.
    const probe = db.get('SELECT 1 AS ok');
    probe.catch(() => {});
    await Promise.race([
      probe,
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('db probe timeout')), 500); }),
    ]);
    res.status(200).json({ status: 'ready', pid: process.pid }); // tiny body, no version/secret leak
  } catch (err) {
    req.log?.error({ err }, 'readiness probe failed');
    res.status(503).json({ status: 'unready' });
  } finally {
    clearTimeout(timer); // don't leave a pending timer when the DB answers first
  }
});
```

Set `state.ready = true` right after `await db.migrate(...)` in server.js, and flip
`state.shuttingDown = true` as the **first** line of `shutdown()` (before `server.close`). Keep both
routes out of the auth chain and off every rate limiter (a probe must not spend a login budget).

## Uptime monitoring + alerting on the health endpoints

Rationale: a monitor running *on* the box dies with the box. Probe from off-host so a full outage
(kernel panic, disk full, network drop) is what actually pages you.

Self-host **Uptime Kuma** (one Docker container) on a *different* box, or use a hosted pinger:

- `GET /healthz` — expect `200` + keyword `"ok"`, interval 60s.
- `GET /readyz` — expect `200` + keyword `"ready"`; this goes red on a DB or drain problem while the
  process is still alive.
- **Debounce**: alert after **2 consecutive failures ~60s apart**, not the first blip, so a dropped
  packet or a rolling restart doesn't flap you awake.
- **TLS expiry**: cert check on the public domain warning at **>14 days remaining** — expired TLS is
  a silent outage the HTTP check may not distinguish.
- **Monitor the monitor**: a check on the GlitchTip UI URL, so blind error reporting pages you.
- Route every alert to **one** channel (Telegram/Discord/email) to avoid split-brain triage.

## Log shipping + retention for pino

Rationale: `logs/server.log` holds the security audit trail (denied transfers, refresh-token reuse
detection, auth events — see [observability.md](observability.md)). If the container is wiped that
evidence is gone. Ship it off-box to a queryable store, over TLS.

pino already writes JSON with `sync:true` (see [server-skeleton.md](server-skeleton.md)), so a
tailing shipper needs zero code change. **Vector** parses pino's JSON natively and forwards to Loki.
Each line is already a JSON object, so parse the raw event, not a `.message` sub-field:

```toml
# /etc/vector/vector.toml — tails the pino files and ships parsed JSON to Loki over TLS.
[sources.pino]
type = "file"
include = ["/srv/app/logs/server.log", "/srv/app/logs/crash.log"]

[transforms.parse]
type = "remap"
inputs = ["pino"]
# The file source puts the raw line in `.message`; parse it into the top-level event, then
# belt-and-suspenders drop any field a scrub could have missed so the shipper never RE-EXPOSES a
# secret that beforeSend/req.log stripped upstream. Use the fallible `parse_json` (no `!`) with a
# guard so a line that fails to parse is kept rather than dropped by an aborting `parse_json!` —
# crash.log holds single-line JSON.stringify dumps from run-server.js/cluster.js (not pino-shaped
# events), and a torn or truncated line mid-write may not be valid JSON at all.
source = '''
parsed, err = parse_json(.message)
if err == null {
  . = parsed
  del(.req.headers.cookie); del(.req.headers.authorization); del(.hexkey); del(.token)
}
'''

[sinks.loki]
type = "loki"
inputs = ["parse"]
endpoint = "https://loki.internal:3100"
labels.pid = "{{ pid }}"          # per-worker label so clustered lines stay separable
labels.level = "{{ level }}"
tls.verify_certificate = true     # off-box transport MUST be TLS
```

Rotation: under `cluster.js` every pid appends to the **same** `server.log`, so it grows unbounded.
Add `logrotate` (`daily`, `rotate 14`, `copytruncate`, `compress`) — `copytruncate` keeps pino's open
sync fd valid without a restart. At scale switch to per-pid files (`server.<pid>.log`) so rotation
and the shipper never race on one handle (this trade-off is also noted in
[cluster-scaling.md](cluster-scaling.md)).

## OpenTelemetry tracing (Express → Piscina → SQLite)

Rationale: auto-instrumentation traces the HTTP/Express layer, but `pool.run(...)` crosses into a
Piscina worker thread it cannot see through — so *all* DB time collapses into one opaque gap. A
manual span around each pool call restores it and attributes a slow request to a specific query.

The HTTP/Express spans come from the loader-loaded `instrument.mjs` above (that is *why* the
`--import` launch is mandatory — a late `import` gives you error capture but no request spans). The
DB span is added by wrapping the facade; this is the *only* change to the db layer — the worker
(`src/db/worker.js`) is untouched:

```js
// src/db/index.js — wrap each pool.run in a span. Import Sentry from the observability module.
import { Sentry } from '../lib/observability.js';

// db op names ('all'|'get'|'run'|'writeTx'|'migrate') double as span names. We attach the SQL TEXT
// but NEVER the params — params carry user data (emails, amounts). Truncate long SQL for sanity.
function traced(name, payload, sql) {
  return Sentry.startSpan(
    { name: `db.${name}`, op: 'db.sql', attributes: { 'db.system': 'sqlite', 'db.statement': sql?.slice(0, 500) } },
    () => pool.run(payload, { name }),
  );
}

export const all = (sql, params = []) => traced('all', { sql, params }, sql);
export const get = (sql, params = []) => traced('get', { sql, params }, sql);
export const run = (sql, params = []) => traced('run', { sql, params }, sql);
// writeTx/migrate wrap the same way; for writeTx pass a synthetic label instead of raw SQL.
```

`Sentry.startSpan` attaches the DB span to whatever span is active on the current async context —
the request span created by the HTTP auto-instrumentation — so nesting is automatic *when the
`--import` launch is in place*; with a plain import there is no parent span and these become orphan
root spans. When the DSN is absent, `startSpan` still runs the callback (it just isn't recorded), so
this wrapper is safe in dev/test. Add `requestId` as a span attribute in the handler
(`Sentry.getActiveSpan()?.setAttribute('requestId', req.id)`) to cross-reference a trace with
`server.log`. Keep `tracesSampleRate` low in prod (0.05 above). On GlitchTip the Sentry SDK ships
spans over the Sentry protocol — no separate OTLP collector to run; point OTLP elsewhere only if you
prefer Tempo/Jaeger.

## Resource limits + OOM/disk guards for the single VPS

Rationale: on one VPS the app, its WAL sidecars, logs, and backups share one disk and one RAM budget.
Hard ceilings turn a runaway into a clean restart instead of a kernel OOM-kill of a random process; a
disk-full alert prevents SQLite writes failing hard when the volume fills.

Run under systemd with a memory cap and signal handling so `SIGTERM` reaches the existing
graceful-shutdown drain (see [server-skeleton.md](server-skeleton.md) `shutdown()`). `NODE_OPTIONS`
carries both the heap cap and the Sentry loader — cluster workers and the run-server child inherit it:

```ini
# /etc/systemd/system/app.service — cluster.js is the supervisor; systemd caps + restarts it.
[Service]
# Node heap sized BELOW the cgroup limit so V8 GCs and OOMs cleanly before the kernel steps in, and
# --import loads Sentry before app code (ESM auto-instrumentation requirement, see top of file).
# MemoryMax 900M → per-worker --max-old-space-size ~256M (each cluster worker is a full server
# plus its own DB thread pool — size worker count against RAM, see cluster-scaling.md).
# The quotes are load-bearing: systemd splits an unquoted Environment= on spaces into SEPARATE
# assignments, so the --import flag would be silently dropped and no instrumentation would load.
Environment="NODE_OPTIONS=--max-old-space-size=256 --import ./instrument.mjs"
WorkingDirectory=/srv/app
ExecStart=/usr/bin/node cluster.js
MemoryMax=900M
Restart=on-failure
KillSignal=SIGTERM          # reaches the drain; server.js flips shuttingDown then server.close
TimeoutStopSec=20           # > the 10s hard-exit in shutdown() so a clean drain can finish
OOMPolicy=kill
```

Docker equivalent: `--memory=900m --restart=on-failure --stop-signal=SIGTERM --stop-timeout=20` with
the same `NODE_OPTIONS` (heap cap + `--import`) passed via `-e`.

Disk is the SQLite-specific hazard: the `-wal`/`-shm` sidecars, unrotated logs, and backups all
consume the same volume, and **SQLite writes fail hard (`SQLITE_FULL`) when the disk fills** — the
encrypted DB is not exempt. Guard it two ways:

- **Rotation** (above) caps log growth; a periodic `PRAGMA wal_checkpoint(TRUNCATE)` during a quiet
  window caps `-wal` growth (see [db-migrations-backups.md](db-migrations-backups.md) for backups).
- **Alert on free disk** from the same uptime monitor — a tiny authed status route the pinger can
  keyword-assert on, so you are paged at 85% used, long before writes start failing:

```js
// src/lib/diskcheck.js — minimal internal disk check (bind to localhost / require a bearer).
// statfs gives block counts.
import { statfs } from 'node:fs/promises';
import { env } from './env.js'; // validated env (env-and-secrets.md), not raw process.env
export async function diskOk(path = env.DB_PATH) {
  const s = await statfs(path);
  // bavail = blocks available to an unprivileged writer (excludes root-reserved) — the number that
  // actually governs whether OUR process can still write. bfree would overstate headroom.
  const freeRatio = s.bavail / s.blocks;
  return { ok: freeRatio > 0.15, freePct: Math.round(freeRatio * 100) }; // page below 15% free
}
```

## New env vars

Add to `src/lib/env.js` (all optional — absent = feature inert, so dev/test stay agent-free) and
`.env.example` (see [env-and-secrets.md](env-and-secrets.md)):

```js
GLITCHTIP_DSN: z.string().url().optional(),                       // absent → init skipped, SDK inert
COMMIT_SHA: z.string().min(7).optional(),                         // release tag for grouping
OTEL_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),     // trace sampling, low in prod
```