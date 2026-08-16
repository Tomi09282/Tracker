# Money, time & idempotency correctness

Why this design: three whole classes of bug survive a perfect auth+transaction layer because they
are *arithmetic*, not access. Money in floats silently loses cents; "N days" done as
`+N*86400` drifts a day across DST and hard-deletes early; and an idempotency key that is only a
`UNIQUE` constraint (see [transaction-endpoints](transaction-endpoints.md)) rejects retries with a
500 instead of *replaying the original response*. This file makes each rule enforceable: one money
module no float can bypass, one clock discipline (store UTC integers, compute boundaries
explicitly), and the storage contract that turns an idempotency key into a real replay cache.

---

## 1. Money — integer minor units, one arithmetic module, explicit currency

**Rule: a monetary value is a `bigint` of minor units plus an ISO-4217 currency code — never a
Number, never a float, and `*100` is a bug.** Money crosses `Number.MAX_SAFE_INTEGER`
(2^53 ≈ 9.007e15) sooner than people expect — not on a single balance but on *intermediate
products*: `amount * rate_ppm` for an FX conversion leaves the safe range once the amount passes
~9×10⁹ minor units (≈9 billion HUF, an ordinary corporate balance), and whole-ledger sums climb
toward the same ceiling. So the in-memory type is `bigint`. The minor-unit *exponent* is
per-currency (HUF=0, USD/EUR=2, most Arabic dinars=3) — a hardcoded `* 100` corrupts every zero-
and three-decimal currency.

All add / subtract / multiply / percentage / split go through **one module**. No handler ever
writes `a + b` on money. SQLite stores the integer in a plain `INTEGER` column (fits i64,
comfortably above the JS safe range) alongside a `currency` column.

**Read-back caveat — this is where the design leaks if you skip it.** `better-sqlite3` returns
`INTEGER` columns as a JS **`number` by default**, so a plain `SELECT amount ...` hands back a
lossy float and silently defeats the bigint discipline. You MUST read money columns in safe-integer
mode so they come back as `bigint`. Writing is fine (a `bigint` param binds correctly and
round-trips as a structured-cloneable arg through the worker facade — see [db-layer](db-layer.md)),
but reads need the opt-in. Do it on the money statements inside the worker:

```js
// src/db/worker.js — money reads MUST be safe-integer so INTEGER comes back as bigint, not number.
// Per-statement opt-in (does not disturb the id/count columns handled as number elsewhere).
const moneyStmt = (sql) => stmt(sql).safeIntegers(); // .safeIntegers() mutates and returns the same stmt
// moneyStmt('SELECT balance FROM accounts WHERE id = ?').get(id).balance  ->  bigint
```

```js
// src/lib/money.js — the ONLY place monetary arithmetic happens. Values are integer minor units
// as bigint; a float never touches a monetary value. Rounding mode is always explicit.

// ISO 4217 minor-unit exponents. A hardcoded *100 is wrong for HUF (0) and dinars (3).
const MINOR_UNITS = { HUF: 0, USD: 2, EUR: 2, GBP: 2, JPY: 0, BHD: 3, KWD: 3 };

export function minorUnits(currency) {
  const e = MINOR_UNITS[currency];
  if (e === undefined) throw new Error(`unknown currency ${currency}`); // fail closed, never assume 2
  return e;
}

// A Money is { amount: bigint (minor units), currency: 'HUF' }. Constructed only here.
export function money(amount, currency) {
  minorUnits(currency); // validates the code
  if (typeof amount !== 'bigint') throw new Error('money amount must be bigint minor units');
  return { amount, currency };
}

function sameCurrency(a, b) {
  if (a.currency !== b.currency) throw new Error(`currency mismatch ${a.currency} vs ${b.currency}`);
}

export const add = (a, b) => (sameCurrency(a, b), money(a.amount + b.amount, a.currency));
export const sub = (a, b) => (sameCurrency(a, b), money(a.amount - b.amount, a.currency));

// Rounding is a POLICY, so the caller states it — no hidden default. 'half-up' for consumer
// pricing, 'bankers' (round-half-to-even) for statistical/accounting sums that must not bias up.
function divRound(numer, denom, mode) {
  if (mode !== 'half-up' && mode !== 'bankers') {
    throw new Error(`unknown rounding mode ${mode}`); // fail closed — a typo'd mode must not silently round half-up
  }
  const q = numer / denom, r = numer % denom; // bigint division truncates toward zero
  if (r === 0n) return q;
  const twice = 2n * (r < 0n ? -r : r);
  const roundAway = mode === 'bankers'
    ? (twice > denom || (twice === denom && (q % 2n !== 0n))) // ties → nearest even
    : (twice >= denom);                                       // half-up: ties → away from zero
  if (!roundAway) return q;
  return q + ((numer < 0n) === (denom < 0n) ? 1n : -1n);
}

// Multiply money by an INTEGER scalar (quantity) — exact, no rounding. BigInt(n) throws on a
// non-integer, which is the guard we want: a fractional quantity is a caller bug, not a rounding.
export const mulInt = (m, n) => money(m.amount * BigInt(n), m.currency);

// Percentage / rate applied as a rational bps to stay integer-exact. 8.75% VAT = rateBps 875.
// mode is REQUIRED ('half-up' | 'bankers') — see the policy note on divRound.
export function percentage(m, rateBps, mode) {
  return money(divRound(m.amount * BigInt(rateBps), 10_000n, mode), m.currency);
}

// Split with a DOCUMENTED remainder rule: distribute the leftover minor units one-by-one to the
// FIRST recipients (deterministic), so 100 HUF / 3 → [34, 33, 33] and the parts sum EXACTLY to
// the whole. Never divide and drop the remainder — money must not vanish or appear.
//
// CRITICAL for negative amounts (refunds, reversals, debits): bigint `%` returns a remainder with
// the SIGN OF THE DIVIDEND, so amount % n is in (-n, 0] when amount < 0. A naive `i < remainder`
// is then never true and the leftover unit is silently dropped — e.g. split(-100, 3) would give
// [-33,-33,-33] summing to -99, leaking one minor unit. Distribute |remainder| units in the
// amount's own direction so the parts sum EXACTLY to the whole for negatives too.
export function split(m, parts) {
  if (parts < 1) throw new Error('parts must be >= 1');
  const n = BigInt(parts);
  const base = m.amount / n;                    // truncates toward zero, same for +/-
  const rem = m.amount - base * n;              // signed remainder, |rem| < n, sign of m.amount
  const step = rem >= 0n ? 1n : -1n;            // push units in the amount's direction
  const units = rem < 0n ? -rem : rem;          // how many minor units to distribute
  const out = [];
  for (let i = 0n; i < n; i++) out.push(money(base + (i < units ? step : 0n), m.currency));
  return out; // sum(out) === m.amount, always — including negative amounts
}
```

Note the boundary with [transaction-endpoints](transaction-endpoints.md): that file's template
carries money as a plain `number` (`amountCents`, `z.number().int()`), which is safe up to the 2^53
range and fine for a single-currency app. Adopt `money.js` + safe-integer reads when you add
multi-currency or expect balances near the safe-integer ceiling; the two are compatible (the on-disk
column is `INTEGER` either way).

**Multi-currency & FX: store the rate at time of transaction, never reconvert history.** A converted
amount is a *fact recorded at a moment*; recomputing an old row against today's rate rewrites
history and breaks reconciliation. Persist the source amount, the target amount, and the exact
rate used, so any past figure is reproducible.

```sql
-- Every account/ledger row carries its currency; a bare amount column is ambiguous.
ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'HUF';

-- FX conversions freeze the rate. rate_ppm = target minor units per 1e6 source minor units
-- (integer, so no float is stored). Reproduce any historical figure from these three columns.
CREATE TABLE IF NOT EXISTS fx_conversions (
  id             INTEGER PRIMARY KEY,
  from_currency  TEXT NOT NULL,
  to_currency    TEXT NOT NULL,
  from_amount    INTEGER NOT NULL,   -- source minor units
  to_amount      INTEGER NOT NULL,   -- target minor units, computed with money.js at write time
  rate_ppm       INTEGER NOT NULL,   -- the exact rate applied, kept forever
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Enforce single-currency inside the money-moving worker tx exactly as
[transaction-endpoints](transaction-endpoints.md) does: assert `from.currency === to.currency`
before the debit, and reject cross-currency transfers unless they carry a frozen `fx_conversions`
row. Validate the currency code with a `.strict()` enum in [input-validation](input-validation.md)
(`z.enum(['HUF','USD','EUR'])`), never a free string.

---

## 2. Time — store UTC integers, compute boundaries explicitly, monotonic for durations

**Rule: every stored timestamp is a UTC `unixepoch()` integer** (matches the existing
`DEFAULT (unixepoch())` columns across the schema). Local time is a *rendering* concern, resolved
once at the edge. Three traps this closes:

**(a) Wall clock for stamps, monotonic clock for durations.** `Date.now()` can jump backwards (NTP
step, leap-second smear) and yields negative or absurd durations; `performance.now()` is monotonic.

```js
// Duration / timeout measurement — monotonic, immune to wall-clock steps.
import { performance } from 'node:perf_hooks';
const t0 = performance.now();
// ... work ...
const elapsedMs = performance.now() - t0; // never negative, unaffected by NTP or DST

// A timestamp you STORE is wall clock, and always UTC seconds — matches unixepoch() columns.
const nowSec = Math.floor(Date.now() / 1000);
```

**(b) "N days" and "daily windows" are DST-unsafe as arithmetic.** `now + N*86400` drifts by an
hour across a spring/autumn transition, so a 30-day grace period or a hard-delete job can fire a
day early or late. Compute calendar offsets in the *display* timezone, then convert back to UTC.

```js
// src/lib/time.js — calendar math in a named IANA zone, stored/compared as UTC seconds.
// Pin a display timezone PER USER; default Europe/Budapest. Convert only at these boundaries.
export const DEFAULT_TZ = 'Europe/Budapest';

// Add N calendar days honoring DST (a "day" is not always 86400 s). Returns UTC epoch seconds.
export function addDaysTz(epochSec, days, tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(epochSec * 1000));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  // Shift the calendar day, keep wall-clock time; UTC constructor then normalizes month/day rollover.
  const shifted = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + days, +p.hour, +p.minute, +p.second));
  // Re-anchor to the zone's real UTC offset for THAT calendar day (post-DST), then to epoch seconds.
  return Math.floor(zonedToUtc(shifted, tz) / 1000);
}

// Resolve what UTC instant a given wall-clock time in `tz` corresponds to (offset varies by DST).
// Reads the wall-clock fields back out of the zone and out of UTC; their delta is the zone offset.
function zonedToUtc(dateAsIfUtc, tz) {
  const asUtc = dateAsIfUtc.getTime();
  const local = new Date(dateAsIfUtc.toLocaleString('en-US', { timeZone: tz })).getTime();
  const wallUtc = new Date(dateAsIfUtc.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return asUtc + wallUtc - local; // offset = wallUtc - local; apply it to the wall instant
}

// Render for a user — the ONLY place local time appears. Storage/compute stayed UTC throughout.
export function renderInTz(epochSec, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('hu-HU', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(epochSec * 1000));
}
```

Use `addDaysTz` for grace periods and the daily-maintenance window; a naive `+ N*86400` is the bug.
Expiry/purge SQL stays pure UTC integer comparison — DB-side `unixepoch()` is UTC by definition:
`DELETE FROM ... WHERE expires_at <= unixepoch()`.

**(c) Token & MAC windows are UTC-vs-UTC with skew tolerance.** JWT `exp` (see
[auth-blueprint](auth-blueprint.md)) is UTC seconds compared against `unixepoch()` — never mix a
local time in. For the ±5-minute HMAC/MFA freshness window, the tolerance itself absorbs modest
clock skew and any leap-second smear; keep it symmetric and generous enough, and compare the signed
payload with a constant-time check (`crypto.timingSafeEqual`) — the timestamp bound below is a
plain range test, not a secret comparison.

```js
// Freshness window for a signed webhook / MFA code: UTC seconds both sides, symmetric tolerance.
const SKEW_SEC = 300; // ±5 min covers NTP skew + leap-second smear; do not shrink below ~60 s
export function isFresh(sentAtSec, nowSec = Math.floor(Date.now() / 1000)) {
  return Math.abs(nowSec - sentAtSec) <= SKEW_SEC; // stale AND future-dated both rejected
}
```

Freshness is necessary but NOT sufficient against replay: a captured message is fresh for the whole
window. A webhook/MFA verifier MUST also (1) verify the signature over the *raw bytes* with
`crypto.timingSafeEqual` and (2) single-use the message id — persist the delivery/nonce id and
reject a second sighting (the same atomic-consume pattern as §3). TOTP codes are single-use per
step for the same reason: record the last consumed step per user and reject re-use within it.

---

## 3. Idempotency keys — storage, in-flight arbitration, fingerprint, replay, TTL

The 5-pass REPLAY rule in [transaction-endpoints](transaction-endpoints.md) requires that a retried
request produce *exactly one* effect. That file scopes keys per user
(`UNIQUE(created_by, idempotency_key)`) and rejects a key reused with different params — but a bare
`UNIQUE` constraint throws on the *second* request instead of returning the *first* request's
result. A double-clicked or network-retried transfer then surfaces a 500 to a user whose money
already moved. The fix is a real replay cache: **store the response, and on retry replay it.** This
generic table supersedes the ad-hoc `idempotency_key`/`params_hash` columns on `transfers`: use one
mechanism, not both.

```sql
-- src/db/schema.sql — the response cache that makes retries safe. One row per (user, key).
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash    TEXT NOT NULL,          -- sha256 of method+path+canonical body; same key+diff body = mismatch
  status          TEXT NOT NULL DEFAULT 'in_flight'  -- 'in_flight' → 'done'
                    CHECK (status IN ('in_flight', 'done')),
  response_status INTEGER,                -- HTTP status to replay (NULL while in flight)
  response_body   TEXT,                   -- JSON body to replay verbatim (NEVER put secrets/tokens here)
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at    INTEGER,
  PRIMARY KEY (user_id, idempotency_key)  -- scope is per-caller; a global key namespace is squattable
);
```

`response_body` is stored plaintext in an (already-encrypted-at-rest) DB and replayed verbatim, so
the `execute()` result body it caches MUST NOT contain secrets — no fresh refresh tokens, no PANs,
no reset links. Return a reference/id in the response and let the client re-fetch protected material
through the normal authorized path.

**Lifecycle, all inside one worker transaction** so claim, execute, and store are atomic and
race-free (the same IMMEDIATE-transaction discipline as `transfer()`):

1. **Claim or find.** `INSERT ... ON CONFLICT DO NOTHING` the key as `in_flight`. If the insert
   won (changes === 1) this request owns the operation and proceeds. If it lost, a row already
   exists → branch on it.
2. **Fingerprint check.** Existing row's `request_hash !== thisHash` → **422** ("key reused with
   different parameters"). This is the stored form of the mismatch check
   [transaction-endpoints](transaction-endpoints.md) already references but never persisted.
3. **In-flight arbitration.** Existing row still `in_flight` → **409** "in progress"; the client
   retries after backoff. One winner executes; the other never double-executes. (Because claim,
   execute, and store share one IMMEDIATE transaction, a *live* concurrent request blocks on the
   write lock and then sees `done` — in practice this branch catches rows left `in_flight` by a
   crash or partial write until the 15-minute sweep below reclaims them.)
4. **Replay.** Existing row `done` → return the **stored `response_status` + `response_body`
   verbatim**. No re-execution, no error.

```js
// src/db/worker.js — wraps a business operation so retries replay instead of re-executing.
// getDb() and stmt() are the module-level helpers from db-layer.md; add this alongside transfer().
// `execute` runs the REAL work (e.g. the transfer statements) and returns { status, body }.
// Called only from other named worker txs — a function cannot cross the Piscina boundary (see Wiring).

export function withIdempotency({ userId, key, requestHash, execute }) {
  const tx = getDb().transaction(() => {
    // Atomic claim. ON CONFLICT DO NOTHING means exactly one concurrent inserter wins the slot;
    // .changes is 1 for the winner and 0 for a conflict (the row is not counted as changed).
    const claim = stmt(
      `INSERT INTO idempotency_keys (user_id, idempotency_key, request_hash)
       VALUES (?, ?, ?) ON CONFLICT (user_id, idempotency_key) DO NOTHING`
    ).run(userId, key, requestHash);

    if (claim.changes === 0) {
      const row = stmt(
        'SELECT request_hash, status, response_status, response_body FROM idempotency_keys WHERE user_id = ? AND idempotency_key = ?'
      ).get(userId, key);
      // Same key, different request body → caller error, do not touch state.
      if (row.request_hash !== requestHash) return { replay: true, status: 422, body: { error: 'idempotency key reused with different parameters' } };
      // A stuck/concurrent claim holds the slot; tell the client to retry shortly.
      if (row.status === 'in_flight') return { replay: true, status: 409, body: { error: 'request in progress' } };
      // Completed → replay the stored response verbatim. No re-execution.
      return { replay: true, status: row.response_status, body: JSON.parse(row.response_body) };
    }

    // We own the slot: run the real work in the SAME transaction, then persist its response.
    const { status, body } = execute(); // e.g. the transfer(); throws roll BOTH back together
    stmt(
      `UPDATE idempotency_keys SET status = 'done', response_status = ?, response_body = ?, completed_at = unixepoch()
       WHERE user_id = ? AND idempotency_key = ?`
    ).run(status, JSON.stringify(body), userId, key);
    return { replay: false, status, body };
  });
  // IMMEDIATE takes the write lock up front — no lock-upgrade SQLITE_BUSY under concurrent retries.
  return tx.immediate();
}
```

```js
// src/lib/fingerprint.js — method + path + a CANONICAL body so key order can't cause false 422s.
import { createHash } from 'node:crypto';

// Recursively sort object keys at EVERY depth. NOTE: JSON.stringify(body, keyArray) does NOT sort —
// its 2nd arg is a property allowlist applied at all depths, which silently drops nested fields and
// collides distinct bodies. Serialize by hand instead.
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v); // primitives incl. null
}

export function requestFingerprint({ method, path, body }) {
  return createHash('sha256').update(`${method} ${path}\n${canonical(body)}`).digest('hex');
}
```

The `request_hash !== requestHash` check above is a plain string compare, not `timingSafeEqual` —
and correctly so: the fingerprint is not a secret and the row is already scoped to the authenticated
`user_id`, so an attacker cannot probe another user's slot and there is no MAC to forge here. Reserve
`crypto.timingSafeEqual` for the webhook/MFA signatures of §2(c).

**TTL & purge — reuse the daily maintenance job.** The table grows one row per critical request, so
it must be bounded. Purge with the same UTC-integer discipline the refresh-token purge uses (see
[auth-blueprint](auth-blueprint.md) Maintenance), and stamp it into the daily job window computed by
`addDaysTz` so it does not drift across DST. A 24-72h TTL comfortably outlives any realistic client
retry window while keeping the table small.

```sql
-- Add to the daily maintenance sweep. Keep completed keys long enough to cover client retries.
-- AND binds tighter than OR, so this is (done > 3 days) OR (stuck in_flight > 15 min).
DELETE FROM idempotency_keys
 WHERE (completed_at IS NOT NULL AND completed_at <= unixepoch() - 259200)        -- done > 3 days
    OR (status = 'in_flight' AND created_at <= unixepoch() - 900);                -- stuck in-flight > 15 min (crashed mid-op)
```

The `in_flight` cleanup line matters: if a worker crashes between claim and completion, the row
would otherwise wedge the key at a permanent 409. A short in-flight TTL lets a later retry re-claim
it. Because claim + execute + store share one atomic transaction, a crash *before commit* rolls the
claim back entirely (nothing persists) and a crash cannot leave a `done` row without its response —
the stuck-`in_flight` case only arises from a manual/partial write path, and this line sweeps it.

**Wiring.** `execute` is a function, and a function cannot cross the Piscina structured-clone
boundary — so compose inside the worker, not in the route: in `src/db/worker.js`, export a named tx
(e.g. `transferIdempotent(args)`) that calls `withIdempotency` with `execute` set to the local
business logic, and expose it on the facade as `db.transferIdempotent(args)` like every other named
tx. The route builds the fingerprint from the validated body and passes it in as `requestHash`; the
`Idempotency-Key` header validation regex (`/^[A-Za-z0-9_-]{16,64}$/`) and per-user scope are
unchanged from [transaction-endpoints](transaction-endpoints.md). Log a 422/409 outcome via the
request child logger (see [observability](observability.md)) — a spike of 422s is either a client
bug or a key being probed.