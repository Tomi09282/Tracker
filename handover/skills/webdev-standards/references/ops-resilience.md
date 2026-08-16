# Ops resilience

Why this design: the app is fast and correct in isolation — but production breaks it from the *outside*. A payment provider hangs, a login storm saturates the DB pool, a dependency dies. Node's `fetch` has **no default timeout**, so one hung upstream ties up a request handler forever; unbounded inbound requests queue behind a saturated [Piscina](db-layer.md) pool until the box tips over; a dead non-critical dependency turns a recommendation widget into a 500 on the whole page. This file adds the layer that keeps the app *up and honest under partial failure*: bounded outbound calls with circuit breakers, inbound backpressure sized to the pool, graceful degradation for what can degrade (never for money), and the ops muscle — load tests, chaos game-days, runbooks, postmortems — to prove it all fires. Encrypted backups + restore drills live in [db-migrations-backups.md](db-migrations-backups.md); this file adds only the *scheduled* restore drill that verifies them.

Non-negotiable split: **must-work** = auth + money/transactional endpoints ([transaction-endpoints.md](transaction-endpoints.md)); **degradable** = recommendations, enrichment, third-party lookups. Degradable failures return a safe fallback; must-work failures **hard-fail-safe** (refuse the operation) — never proceed on stale data.

## Timeouts + circuit breakers on every outbound call

Rationale: one `src/lib/http.js` wrapper is the *only* way the app makes outbound calls, so no route can forget the timeout, and a dead dependency fails fast (breaker open) instead of exhausting sockets. `AbortSignal.timeout()` bounds every call; retries with jittered backoff apply **only to idempotent/GET** calls; [opossum](https://nodeshift.dev/opossum/) gives one breaker per upstream. Money calls are never retried without the caller's idempotency key ([transaction-endpoints.md](transaction-endpoints.md)) — a blind retry double-charges.

```js
// src/lib/http.js — the ONLY outbound HTTP path. Per-upstream breaker + timeout + safe retry.
import CircuitBreaker from 'opossum';
import { logger } from './logger.js';

// One breaker per upstream name (payments, email, oauth...). Shared across calls so the failure
// count is aggregated per dependency — a dead upstream trips ONCE, not per-call. opossum binds the
// action at CONSTRUCTION, so the shared breaker wraps a pass-through and each call supplies its own
// work via fire(action) — wrapping the first call's closure would replay that first request forever.
const breakers = new Map();
function breakerFor(name) {
  let b = breakers.get(name);
  if (!b) {
    b = new CircuitBreaker((run) => run(), {
      timeout: false,               // we own the timeout via AbortSignal below — don't double-arm it
      errorThresholdPercentage: 50, // ≥50% failures in the window → open
      resetTimeout: 10_000,         // after open, probe again in 10s (half-open)
      rollingCountTimeout: 30_000,  // stats window; must divide evenly by rollingCountBuckets (default 10)
    });
    // Breaker state transitions are operational events — feed pino + GlitchTip (error-reporter.js).
    b.on('open', () => logger.error({ upstream: name }, 'circuit breaker OPEN — failing fast'));
    b.on('halfOpen', () => logger.warn({ upstream: name }, 'circuit breaker half-open — probing'));
    b.on('close', () => logger.info({ upstream: name }, 'circuit breaker closed — recovered'));
    breakers.set(name, b);
  }
  return b;
}

const jitter = (ms) => ms / 2 + Math.random() * (ms / 2); // 50–100% of ms — de-synchronise retries

// upstream: stable name for the breaker (NOT the URL). retries: ONLY set for idempotent/GET calls.
export async function httpCall(upstream, url, { timeoutMs = 5000, retries = 0, ...init } = {}) {
  const action = async () => {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Node fetch has NO default timeout: without this signal a hung upstream pins the request
        // handler until the socket dies. AbortSignal.timeout fires a real abort at timeoutMs.
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        if (res.status >= 500 && attempt < retries) { lastErr = new Error(`upstream ${res.status}`); }
        else return res; // 2xx/4xx are final — a 4xx is our bug, retrying won't fix it
      } catch (err) { lastErr = err; } // includes the AbortError on timeout
      if (attempt < retries) await new Promise((r) => setTimeout(r, jitter(200 * 2 ** attempt)));
    }
    throw lastErr;
  };
  return breakerFor(upstream).fire(action);
}
```

The breaker trips on what the action *throws*: connection-refused, DNS failure, and the `AbortError` on timeout — i.e. a genuinely dead/hung upstream. A dependency that stays *reachable but returns 500s* resolves the fetch, so the final attempt returns that `Response` as a success and the breaker will NOT open on it. Call sites must therefore check `res.ok` themselves — every response-consuming example below (recommendations, fraud) does — or, if you want 5xx to trip the breaker too, throw on `res.status >= 500` inside the wrapper / pass an opossum `errorFilter`.

Usage — GET is retryable; a money POST is **not**, and carries the idempotency key so even a network-level uncertainty is safe to re-drive by the CALLER, not by a blind retry:

```js
// idempotent read: safe to retry
const r = await httpCall('geoip', `https://geo.example/${ip}`, { timeoutMs: 2000, retries: 2 });
// non-idempotent money call: retries:0, and the provider dedupes on OUR idempotency key.
const pay = await httpCall('payments', 'https://pay.example/charge', {
  method: 'POST', retries: 0, timeoutMs: 8000,
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
  body: JSON.stringify({ amountCents }),
});
```

## Backpressure & concurrency limits (protect the DB worker pool)

Rationale: without an inbound cap, requests queue **behind** a saturated [Piscina](db-layer.md) pool without limit — latency climbs, memory grows, the box tips over instead of shedding load. A bounded in-flight counter keyed on event-loop lag rejects the overflow with `503` + `Retry-After` (a fast, honest "come back") rather than holding it forever. Queue depth is sized against `DB_POOL_THREADS`: a request that has waited on the pool past a deadline is *abandoned* via an `AbortSignal`, not held.

```js
// src/lib/backpressure.js — shed load before the event loop / DB pool drowns.
import toobusy from 'toobusy-js';

// Event-loop lag is the truest saturation signal (see observability.md metrics): when the loop
// can't keep up, adding work makes it worse. 70ms lag → start rejecting. maxLag tunes sensitivity.
toobusy.maxLag(70);
toobusy.interval(250);

export function backpressure(_req, res, next) {
  if (toobusy()) {
    res.set('Retry-After', '2'); // honest, machine-readable "try again in 2s" — clients back off
    return res.status(503).json({ error: 'server busy, retry shortly' });
  }
  next();
}
```

```js
// server.js — mount EARLY, before the pool-touching routers, so overflow is shed cheaply.
import { backpressure } from './src/lib/backpressure.js';
app.use(backpressure); // after requestContext (observability.md) so the 503 is still correlated
```

Add explicit **per-route** concurrency caps on the endpoints whose unit cost is high — argon2 login (deliberately CPU-heavy) and heavy report queries — so one expensive family can't monopolise the pool. A small semaphore rejects overflow with the same `503`, and lets the handler pass an `AbortSignal` into the DB call so a request that waited too long is dropped, not run late:

```js
// src/lib/concurrency-gate.js — bound concurrent entries to one expensive handler. Queue depth
// should relate to DB_POOL_THREADS (env-and-secrets.md): a queue far deeper than the pool just
// converts "fast 503" into "slow timeout". Rule of thumb: max ≈ pool threads, queue ≈ 2× that.
export function concurrencyGate({ max, queue = max, waitMs = 3000 }) {
  let active = 0;
  const waiters = [];
  // Free one slot and hand it to the next live waiter (its wake() does the active++).
  const release = () => { active--; waiters.shift()?.(); };

  // Admit a request: take a slot and register a ONE-SHOT release. Express fires BOTH 'finish' and
  // 'close' for a normal completed response, so a naive release-on-both double-decrements `active`,
  // drifts it negative, and silently DISABLES the cap. Guard so release runs at most once per req.
  const admit = (res, next) => {
    active++;
    let released = false;
    const releaseOnce = () => { if (released) return; released = true; release(); };
    res.once('finish', releaseOnce); res.once('close', releaseOnce);
    next();
  };

  return function gate(_req, res, next) {
    if (active >= max && waiters.length >= queue) {
      res.set('Retry-After', '2');
      return res.status(503).json({ error: 'busy, retry shortly' }); // shed, don't queue forever
    }
    if (active >= max) {
      // Bounded wait: a request that can't get a slot within waitMs is abandoned with a 503 rather
      // than held. Pass AbortSignal.timeout(waitMs) into the db call too so the pool work is dropped.
      let settled = false;
      const wake = () => {
        if (settled) return; settled = true; // a timed-out waiter must never be admitted
        clearTimeout(t);
        admit(res, next);
      };
      const t = setTimeout(() => {
        if (settled) return; settled = true;
        // Remove self from the queue: a stale (already-settled) waiter left in the array would be
        // shifted by a later release(), wasting that slot and starving a genuinely-waiting request.
        const i = waiters.indexOf(wake);
        if (i !== -1) waiters.splice(i, 1);
        res.set('Retry-After', '2');
        res.status(503).json({ error: 'busy' });
      }, waitMs);
      waiters.push(wake);
      return; // response is sent either by wake()→handler or by the timeout above
    }
    admit(res, next);
  };
}
```

```js
// src/auth/routes.js — cap concurrent argon2 verifications so a login storm (cluster-scaling.md)
// can't starve every other route of the pool/CPU.
import { concurrencyGate } from '../lib/concurrency-gate.js';
router.post('/login', concurrencyGate({ max: 4, queue: 8 }), loginLimiter, /* handler */);
```

Keep the existing `express.json({ limit: '100kb' })` body cap ([server-skeleton.md](server-skeleton.md)) — it is the cheapest backpressure of all.

## Graceful degradation for non-critical features

Rationale: a degradable feature must never turn a dependency's outage into a `500` on the whole page. Wrap the degradable call so a breaker-open/timeout returns a **safe fallback** (cached value, empty list, hidden feature) and surface a per-feature `degraded` flag the frontend can render as a soft notice. Money/inventory paths do the **opposite**: they refuse the operation rather than proceed on stale data.

```js
// src/lib/degradable.js — run a non-critical call; on ANY failure return the fallback + degraded flag.
import { logger } from './logger.js';

// value on success; fallback (+ degraded:true) on breaker-open/timeout/any throw. NEVER re-throws —
// that is the whole point: a degradable feature failing is a soft state, not a request failure.
export async function degradable(feature, fn, fallback) {
  try {
    return { value: await fn(), degraded: false };
  } catch (err) {
    logger.warn({ feature, err: err?.message }, 'feature degraded — serving fallback');
    return { value: fallback, degraded: true };
  }
}
```

```js
// A recommendations route degrades to an empty list; the response carries the flag so the client
// can show "recommendations temporarily unavailable" instead of an error page.
router.get('/recommendations', requireAuth, async (req, res) => {
  const { value, degraded } = await degradable(
    'recs',
    () => httpCall('recs', 'https://recs.example/for-you', { timeoutMs: 1500, retries: 1 })
      // a 5xx RESOLVES the fetch (see http.js) — throw on !ok so it degrades instead of leaking an
      // upstream error body into `value` with degraded:false.
      .then((r) => { if (!r.ok) throw new Error(`recs ${r.status}`); return r.json(); }),
    [], // safe fallback: no recommendations is fine; an error page is not
  );
  res.json({ items: value, degraded }); // the frontend renders a soft notice off this flag (below)
});
```

The must-work counter-example — a money path treats a missing dependency as a **hard stop**, never a fallback:

```js
// If a mandatory upstream (e.g. fraud check) is unreachable OR erroring, REFUSE the transfer.
// Correctness on a money path is not degradable — proceeding on stale/absent data is the bug
// degradation exists to avoid.
try {
  const fraud = await httpCall('fraud', fraudUrl, { timeoutMs: 3000, retries: 0 });
  // A fraud service returning 5xx RESOLVES the fetch — without this check the transfer would
  // proceed on a failed fraud check. Any non-2xx is a refusal.
  if (!fraud.ok) throw new Error(`fraud check ${fraud.status}`);
} catch {
  return res.status(503).json({ error: 'temporarily unable to process — no funds were moved' });
}
```

On the frontend, a `200` carrying `{ degraded: true }` is a success, never an error: the `api()` wrapper ([frontend-conventions.md](frontend-conventions.md)) resolves it normally, and the feature component reads `degraded` off the payload to render a soft inline notice. Don't wire `degraded` into `api()`'s error path — it is data, not a failure.

## Scheduled restore drill — proving the encrypted backups

The encrypted backup itself (`VACUUM INTO` — **never** `db.backup()`, which writes plaintext) and its off-box shipping/retention live in [db-migrations-backups.md](db-migrations-backups.md). What's added here is the most-skipped half: a **scheduled, automated restore drill**. An untested backup is a hope. The drill copies the latest snapshot to a scratch path, opens it with the *derived hexkey* (via the project's own [dbkey.js](env-and-secrets.md), not a reinvented derivation), runs `integrity_check` + a row-count sanity query, and alerts on any failure.

```js
// scripts/restore-drill.js — node scripts/restore-drill.js  (env FIRST, per db-layer.md caveat)
import 'dotenv/config';
import { readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../src/lib/dbkey.js';
import { logger } from '../src/lib/logger.js';

const BACKUP_DIR = process.env.BACKUP_DIR ?? './backups';
const scratch = resolve('./data/restore-drill.db');

// Newest snapshot. A VACUUM INTO copy is self-contained — no -wal/-shm to carry along.
const latest = readdirSync(BACKUP_DIR)
  .filter((f) => /^app-.*\.db$/.test(f))
  .map((f) => ({ f, t: statSync(join(BACKUP_DIR, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
if (!latest) { logger.error('restore drill FAILED — no backup found'); process.exit(1); }

copyFileSync(join(BACKUP_DIR, latest.f), scratch);
let db;
try {
  db = new Database(scratch, { readonly: true });
  // Same key the live DB uses — a backup you can't decrypt (lost DB_MASTER_KEY/DB_KEY_SALT, or
  // changed scrypt params — the params are PART of the key, see env-and-secrets.md) is worthless.
  db.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  const integrity = db.pragma('integrity_check', { simple: true });
  // The SELECT is the sanity probe: it THROWS on a wrong key (SQLITE_NOTADB) or missing schema.
  const users = db.prepare('SELECT count(*) AS n FROM users').get().n;
  if (integrity !== 'ok') throw new Error(`integrity=${integrity}`);
  logger.info({ backup: latest.f, users }, 'restore drill PASSED');
} catch (err) {
  // SQLITE_NOTADB here = the key in THIS environment does not open the backup. That is a key-recovery
  // incident: the backups are undecryptable. Page on it — it is invisible until you actually need it.
  logger.error({ backup: latest.f, err: err?.message }, 'restore drill FAILED — page on-call');
  process.exitCode = 1; // NOT process.exit() — that skips the finally cleanup below
} finally {
  try { db?.close(); } catch { /* never opened, or already closed */ }
  rmSync(scratch, { force: true }); // close BEFORE unlink (Windows can't delete an open file);
                                    // don't leave stray copies of production data lying around
}
```

Schedule it on the same systemd-timer/cron mechanism as the backup ([db-migrations-backups.md](db-migrations-backups.md)), a few hours after it, so a failing drill pages before the next backup overwrites confidence. **Key-recovery story:** escrow `DB_MASTER_KEY`/`DB_KEY_SALT` separately from the backups ([env-and-secrets.md](env-and-secrets.md)) — losing them loses every snapshot permanently, and the drill is what tells you *today* whether the key you hold still opens yesterday's file.

## Load testing the auth + transactional paths

Rationale: commit the load scripts so "how much can this take?" is a repeatable number, not a guess. `autocannon` for quick local pipeline-depth checks; `k6` for scenario/ramp tests in CI/pre-deploy. Target the two endpoints whose cost is unique to this stack: **argon2id login** (deliberately CPU-heavy — the "login storms" [cluster-scaling.md](cluster-scaling.md) warns about) and a **transactional endpoint under real concurrency**, which doubles as live validation of the 5-pass RACE check ([transaction-endpoints.md](transaction-endpoints.md)) — assert error rate ≈ 0 and **no double-spend**.

```js
// load/login.autocannon.js — node load/login.autocannon.js  (quick local saturation probe)
import autocannon from 'autocannon';
autocannon({
  url: 'http://localhost:3000/api/auth/login',
  method: 'POST', connections: 20, duration: 30,
  headers: { 'content-type': 'application/json', 'x-csrf': '1' },
  body: JSON.stringify({ email: 'load@test.local', password: 'correct-horse-battery' }),
}, (_e, r) => {
  // Record the baseline: latency percentiles and the DB_POOL_THREADS at which the pool saturates.
  // When p99 climbs while the DB is idle, the single event loop is the bottleneck → enable cluster.js.
  // autocannon's histogram exposes p50/p90/p97_5/p99 (there is no p95 field).
  console.log('login p50/p97.5/p99 (ms):', r.latency.p50, r.latency.p97_5, r.latency.p99);
});
```

```js
// load/transfer.k6.js — k6 run load/transfer.k6.js  (concurrency = the live RACE assertion)
import http from 'k6/http';
import { check } from 'k6';
// 50 VUs hammer ONE account's transfers concurrently. The in-UPDATE guard + idempotency key must
// serialize them: at most floor(balance/amount) succeed, the rest get 409 INSUFFICIENT, never a
// double-spend. This is the 5-pass RACE check run against the real server under real parallelism.
export const options = { scenarios: { race: { executor: 'per-vu-iterations', vus: 50, iterations: 4 } } };
export default function () {
  const res = http.post('http://localhost:3000/api/transfer',
    JSON.stringify({ fromAccount: 1, toAccount: 2, amountCents: 500 }),
    { headers: { 'Content-Type': 'application/json', 'X-CSRF': '1', 'Idempotency-Key': `k6-${__VU}-${__ITER}` } });
  check(res, { 'settled or insufficient, never 500': (r) => r.status === 201 || r.status === 409 });
}
```

Post-run, assert the invariant from the DB, not just HTTP codes: `SELECT balance_cents FROM accounts` must be `>= 0` and the settled count must equal `floor(balance / amount)` — the same overdraft invariant tested in [rate-limiting-and-abuse.md](rate-limiting-and-abuse.md). Record baselines in the repo so a regression is a diff.

## Chaos / fault injection in staging

Rationale: reliability machinery that never fires is decoration. A **staging-only**, env-gated fault layer proves the breakers trip, the fallbacks serve, the supervisor reforks, and backpressure sheds — as a scripted game-day, **never in production**. Hard-gate it behind `NODE_ENV !== 'production'` so it cannot possibly load in prod.

```js
// src/lib/chaos.js — HARD-GATED. Imported nowhere in the prod path; the guard is belt-and-braces.
import { logger } from './logger.js';

const CHAOS = process.env.NODE_ENV !== 'production' && process.env.CHAOS === '1';

// (a) Inject latency/errors into httpCall so breakers open and degradable() fallbacks are exercised.
export async function chaosMaybe(upstream) {
  if (!CHAOS) return;
  const pct = Number(process.env.CHAOS_FAIL_PCT ?? 0);
  if (Math.random() * 100 < pct) { logger.warn({ upstream }, 'chaos: injected upstream failure'); throw new Error('chaos'); }
  const delay = Number(process.env.CHAOS_LATENCY_MS ?? 0);
  if (delay) await new Promise((r) => setTimeout(r, delay)); // push past the breaker/AbortSignal timeout
}
```

The game-day script, run by hand against staging, exercises each failure mode and asserts the expected recovery:

- **(a) upstream latency/errors** → `CHAOS=1 CHAOS_FAIL_PCT=60` (call `chaosMaybe` at the top of `httpCall`'s action, so the injected *throw* is what trips the breaker): confirm the breaker opens (pino `circuit breaker OPEN`) and `degradable()` serves fallbacks with `degraded:true`.
- **(b) SIGKILL a random web worker** → `kill -9` one pid: confirm the [cluster.js](cluster-scaling.md) primary reforks with backoff and the surviving workers keep serving. The killed worker's in-flight connections reset — that is expected for `kill -9`; there are no sticky sessions to lose.
- **(c) inject `SQLITE_BUSY`/delay in a worker** → hold a write lock / sleep in `src/db/worker.js`: confirm `busy_timeout=5000` ([db-layer.md](db-layer.md)) makes writers wait rather than throw, and that backpressure sheds once the pool queue fills.
- **(d) kill/pause a dependency container** → `docker pause` the provider: confirm timeouts fire (not hangs) and the breaker fails fast.

Every scenario has a *pass condition* checked from `server.log` — a chaos run with no assertion is just breakage.

## Zero-downtime rolling deploys

Rationale: auth is stateless JWT cookies (no sticky sessions — [auth-blueprint.md](auth-blueprint.md)) and the DB is a single local encrypted file, so the right tool is a **rolling restart**, not full blue-green: reload web workers one at a time so at least one always serves. The deploy *sequence* is what makes it safe; the proxy/systemd mechanics are in [deployment.md](deployment.md) §7.

1. **Migrate forward-compatible schema FIRST** — additive columns/tables via the `user_version` pattern ([db-migrations-backups.md](db-migrations-backups.md)). SQLite is single-writer: while old code still runs alongside new, a **breaking** migration corrupts one of them. Additive-only is the rule; a genuinely breaking change needs a maintenance window (see the blue-green constraint below).
2. **Drain via `/readyz`** — flip the worker to unready (its `/readyz` returns 503; [observability.md](observability.md)) so the proxy stops sending it new traffic, let in-flight requests finish (the `SIGTERM` → `server.close()` → `db.closePool()` path, [server-skeleton.md](server-skeleton.md)), then exit and start the new worker. Repeat per worker: `pm2 reload` does this, or with raw [cluster.js](cluster-scaling.md) fork-new-then-`disconnect()`-old.
3. **Tag the release** — attach the release SHA to every deploy and send it to GlitchTip (the error-reporter target, [observability.md](observability.md)) as the `release`, so a spike in errors is instantly attributable to a specific rollout.

```js
// src/lib/health.js — add a manual drain flag so a deploy can pull a worker OUT of rotation before
// exit: /readyz reports 503 while draining, the proxy stops routing, in-flight requests finish.
let draining = false;
export function beginDrain() { draining = true; } // called on SIGTERM before server.close()
// inside the /readyz handler, before the DB probe:
//   if (draining) return res.status(503).json({ status: 'draining' });
```

**Blue-green constraint (document it):** a true blue-green needs *two* live copies, but this stack's DB is one local file and SQLite is single-writer — two versions cannot safely write the same file at once. Blue-green here requires either shared storage (defeats the single-file simplicity) or a maintenance window for breaking changes. For pure code changes and additive migrations, the rolling worker reload above **is** effectively zero-downtime; reserve the maintenance window for the rare breaking migration.

## Runbooks + postmortems

Two committed ops docs, keyed to *this* stack's real failure modes and existing tooling. Keep them terse and current — a stale runbook is worse than none.

`references/runbooks.md` — the on-call flow (alert → triage → escalate) plus copy-paste procedures for the failures this stack actually has:

- **Read `crash.log`** — structured JSON dumps written by [run-server.js](server-skeleton.md)/[cluster.js](cluster-scaling.md); correlate by `pid`, and by `requestId` across `server.log` ([observability.md](observability.md)).
- **Distinguish the SQLite errors:** `SQLITE_NOTADB` = wrong DB key (rekey/restore mismatch — [env-and-secrets.md](env-and-secrets.md)); `SQLITE_BUSY` = write contention (check `busy_timeout`, long transactions — [db-layer.md](db-layer.md)); `SQLITE_CANTOPEN` = missing dir/path/permissions.
- **Rekey** (WAL→DELETE gotcha) and **JWT-secret rotation** (PREV-pair keyring, remove after 15 min) — the exact procedures are in [env-and-secrets.md](env-and-secrets.md); the runbook just links and states *when* to run them.
- **Force logout-all** — bump `session_version` + `invalidateSvCache()` so every live access token dies within the cache TTL ([auth-blueprint.md](auth-blueprint.md)).
- **Kill switch** — flip a paid/degradable feature off (`src/lib/kill-switch.js`, [rate-limiting-and-abuse.md](rate-limiting-and-abuse.md)) to stop a bill or shed load.
- **Manual backup + restore** — `node scripts/backup.js`; the restore steps in [db-migrations-backups.md](db-migrations-backups.md).
- **Drain & restart under cluster.js** — the rolling reload above.
- **Where the signals live:** `server.log` (important + security events), `crash.log` (crash dumps), GlitchTip (errors by release), `/metrics` (loop lag, RSS — [observability.md](observability.md)).

`references/postmortem-template.md` — **blameless**, triggered for any auth/money-endpoint incident, data-loss/corruption event, or crash-loop. Sections: **timeline (UTC)**, **user/data impact**, **detection source** (which alert fired — or why none did), **root cause**, **contributing factors**, **resolution**, **action items with owners**. Each action item should become a concrete artifact — a new test, alert, feature flag, or runbook entry — not a vague "be more careful." Blameless framing throughout: the question is *what in the system let this happen*, never *who*. Link finished postmortems back from `runbooks.md` so the next on-call inherits the lesson.

## New env vars

Add to `.env.example` and the zod object in [env-and-secrets.md](env-and-secrets.md). Chaos is dev/staging-only and defaults off; `RELEASE_SHA` is stamped by CI at deploy time.

```ini
# Staging chaos game-days ONLY — ignored when NODE_ENV=production. Default off.
# CHAOS=1
# CHAOS_FAIL_PCT=0
# CHAOS_LATENCY_MS=0
# Release identifier stamped by CI; sent to GlitchTip as the `release` for error attribution.
# RELEASE_SHA=
```

```js
// src/lib/env.js — inside EnvSchema (all optional; the app boots fine without any of them).
CHAOS: z.enum(['0', '1']).optional(),
CHAOS_FAIL_PCT: z.coerce.number().int().min(0).max(100).optional(),
CHAOS_LATENCY_MS: z.coerce.number().int().min(0).optional(),
RELEASE_SHA: z.string().min(1).optional(),
```