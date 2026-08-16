# Rate limiting & abuse

Why this design: the [auth-blueprint](auth-blueprint.md) limiters stop credential stuffing at *one
process's memory*; the [transaction-endpoints](transaction-endpoints.md) 5-pass stops one forged
request. Neither survives the two realities of a shipped app: it runs as a **cluster** (the default
`MemoryStore` counts per worker, so the real limit is `limit × workers` — see
[cluster-scaling](cluster-scaling.md)), and an **authenticated** attacker can abuse the business
logic and your wallet without ever failing a login. This file adds the layer that spans processes
and spans "logged-in but hostile": a shared Redis limit store, a proxy ban/WAF tier, velocity and
anti-fraud controls on value movement, and hard caps on attacker-triggerable spend. Everything
reuses the existing limiter instances, the pino events already emitted, and the audit log.

## Redis-backed distributed rate limiting

Rationale: one shared counter across every worker and box makes the configured `limit` the *actual*
limit instead of `limit × workers`, and lets a per-account lockout survive a worker restart.

Add the env var (extend the schema in [env-and-secrets](env-and-secrets.md); `.optional()` so
single-process dev still boots with the in-memory store). **Fail closed in production**: the spend
budgets and the brute-force lockout below *degrade to no-ops* without Redis, so a cluster running
without `REDIS_URL` would silently ship with no cluster-wide spend cap and no lockout — exactly the
controls this file exists to enforce. Require it whenever `NODE_ENV === 'production'`.

```js
// src/lib/env.js — add to EnvSchema, then a superRefine so prod cannot boot without it.
  REDIS_URL: z.string().url().startsWith('redis').optional(), // redis:// or rediss:// (TLS)
```

```js
// src/lib/env.js — after the object schema, before parsing (keeps the fail-fast boot contract):
  .superRefine((e, ctx) => {
    // A clustered/production deploy MUST have a shared store, or lockout + spend budgets no-op.
    if (e.NODE_ENV === 'production' && !e.REDIS_URL) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['REDIS_URL'],
        message: 'REDIS_URL is required in production (cluster-wide lockout + spend budgets)' });
    }
  })
```

One shared client, created once per process. `node-redis` v4+; a TLS `rediss://` URL in production.

```js
// src/lib/redis.js — a single shared connection reused by every limiter and the lockout script.
import { createClient } from 'redis';
import { env } from './env.js';
import { logger } from './logger.js';

// null when REDIS_URL is unset → callers fall back to the in-memory store (fine for 1 process;
// forbidden in production by the env superRefine above).
export const redis = env.REDIS_URL ? createClient({ url: env.REDIS_URL }) : null;

if (redis) {
  // A limiter store must never crash the app on a transient Redis blip — log and keep serving.
  // node-redis auto-reconnects; commands issued while down reject and the caller decides.
  redis.on('error', (err) => logger.error({ err }, 'redis client error'));
  // Don't let a Redis that's down AT BOOT throw out of this module and kill the process:
  // log it and let the client reconnect in the background (limiters degrade, they don't crash).
  redis.connect().catch((err) => logger.error({ err }, 'redis initial connect failed'));
}
```

Swap the store into the existing limiter instances — the `windowMs`/`limit` values and the
per-account `keyGenerator` from [auth-blueprint](auth-blueprint.md) do not change; only the store
moves off-process. One factory shares the client; a distinct `prefix` per limiter keeps budgets
separate (a shared namespace would let login retries drain the refresh budget — the exact starvation
[auth-blueprint](auth-blueprint.md) avoids with separate instances).

```js
// src/lib/rate-limit-store.js — returns a RedisStore or undefined (→ express-rate-limit MemoryStore).
import { RedisStore } from 'rate-limit-redis';
import { redis } from './redis.js';

export function sharedStore(prefix) {
  if (!redis) return undefined; // undefined = use the library default MemoryStore (dev/1-process)
  // sendCommand routes the store's raw commands through our single shared client (node-redis v4 API).
  return new RedisStore({ sendCommand: (...args) => redis.sendCommand(args), prefix });
}
```

Any custom `keyGenerator` that can fall back to the IP **must** wrap it in `ipKeyGenerator(req.ip)`,
not use `req.ip` raw. express-rate-limit v8.2+ hard-fails at boot (`ERR_ERL_KEY_GEN_IPV6`) if it sees
`req.ip` without `ipKeyGenerator`, and — the reason for the check — a raw-IP fallback lets a
dual-stack host's IPv4-mapped IPv6 clients collapse into one bucket and bypass the limit
(GHSA-46wh-pxpv-q5gq). Import it from the package (the original omitted this import — the limiters
below would have thrown at boot).

```js
// src/auth/routes.js — the limiter DEFINITIONS gain only a `store:`; keys/windows/limits unchanged.
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { sharedStore } from '../lib/rate-limit-store.js';

const loginLimiter    = rateLimit({ windowMs: 15*60*1000, limit: 10, standardHeaders: true, legacyHeaders: false, skip: skipInTest, store: sharedStore('rl:login:') });
const registerLimiter = rateLimit({ windowMs: 15*60*1000, limit: 5,  standardHeaders: true, legacyHeaders: false, skip: skipInTest, store: sharedStore('rl:register:') });
const refreshLimiter  = rateLimit({ windowMs: 15*60*1000, limit: 60, standardHeaders: true, legacyHeaders: false, skip: skipInTest, store: sharedStore('rl:refresh:') });
const emailLimiter    = rateLimit({
  windowMs: 15*60*1000, limit: 20, standardHeaders: true, legacyHeaders: false, skip: skipInTest,
  // per-account budget; IP fallback wrapped in ipKeyGenerator so IPv6 clients can't bucket-collapse.
  keyGenerator: (req) => typeof req.body?.email === 'string' ? `email:${req.body.email.toLowerCase()}` : ipKeyGenerator(req.ip),
  store: sharedStore('rl:email:'), // per-account budget, now counted once cluster-wide
});
```

```js
// src/transfers/routes.js — the money limiter from transaction-endpoints.md gets the same store.
// It lives in ITS OWN module (not auth/routes.js) and keeps its own inline test-skip.
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const transferLimiter = rateLimit({
  windowMs: 60*1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
  store: sharedStore('rl:transfer:'),
});
```

### Per-account brute-force lockout — atomic INCR+EXPIRE

The `limit × windowMs` limiter caps *rate*; a lockout caps *total failures* and hard-stops an
account after N bad passwords regardless of how slowly they arrive. `INCR` then `EXPIRE` in two
round-trips has a gap where a crash between them leaves a key that never expires (a permanent
lockout — a self-inflicted DoS). A Lua script runs both **atomically** server-side, setting the TTL
only on the first failure so the window is fixed from the first miss, not sliding on every miss.

```js
// src/auth/lockout.js — strict per-account failure counter, atomic and self-expiring.
import { redis } from '../lib/redis.js';

const MAX_FAILURES = 10;            // lock after 10 bad passwords for one account
const LOCK_WINDOW_SEC = 15 * 60;    // ...within (and for) 15 minutes

// Returns the new count; sets the TTL exactly once (on the first failure) so it can't be pushed
// out on every attempt. KEYS[1]=account key, ARGV[1]=window seconds. One atomic round-trip.
const INCR_WITH_TTL = `
  local n = redis.call('INCR', KEYS[1])
  if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  return n`;

const key = (email) => `lockout:${email.toLowerCase()}`;

export async function registerFailure(email) {
  if (!redis) return 0; // no Redis in dev → rely on the DB-side next_login_at backoff only
  // node-redis v4 eval options object: {keys, arguments}; ARGV must be strings.
  return redis.eval(INCR_WITH_TTL, { keys: [key(email)], arguments: [String(LOCK_WINDOW_SEC)] });
}

export async function isLockedOut(email) {
  if (!redis) return false;
  return Number(await redis.get(key(email))) >= MAX_FAILURES;
}

// Called on a SUCCESSFUL login so a legitimate user who mistyped a few times isn't left locked.
export async function clearFailures(email) {
  if (redis) await redis.del(key(email));
}
```

Wire it into the login handler *alongside* the existing per-account `next_login_at` backoff — Redis
is the fast cluster-wide gate, the DB column is the durable fallback when Redis is down. **Always run
argon2.verify on the user-not-found path** (against a dummy hash, as today) so the two 401s — no such
user vs. wrong password — can't be told apart by response *timing*; that constant-time work is what
keeps the message-level `invalid credentials` non-oracular. The locked-out 429 deliberately returns
*before* any hashing: its status code already reveals the lock (the documented enumeration residual
below), and skipping argon2 there is what keeps a lockout from still burning a hash of CPU per
attempt.

```js
// src/auth/routes.js — inside router.post('/login', ...), after LoginSchema.parse(req.body):
  if (await isLockedOut(body.email)) {
    logger.warn({ email: body.email, ip: req.ip }, 'login blocked: account locked out');
    return res.status(429).json({ error: 'too many attempts, try again later' });
  }
  // ...argon2.verify as today (run against a dummy hash when user is null to keep timing flat)...
  if (!user || !ok) {
    if (user) { /* existing next_login_at backoff update */ }
    await registerFailure(body.email); // count the miss cluster-wide, atomically
    return res.status(401).json({ error: 'invalid credentials' }); // same message either way
  }
  await clearFailures(body.email); // success resets the counter
```

Keep the generic `invalid credentials` message — the 429 already reveals the account exists (same
documented enumeration residual as the login backoff in [auth-blueprint](auth-blueprint.md)); do not
also leak it on the 401. Residual (documented): a third party who knows a victim's email can trip the
10-failure lock to deny them login for the window — this is inherent to any per-account lockout; the
DB `next_login_at` backoff and the fact that the *attacker* is also rate-limited bound the nuisance,
and support can clear the key.

## WAF / fail2ban at the reverse proxy

Rationale: the cheapest place to drop a scanner or a stuffing botnet is *before* Node spends a
request handler on it — ban the IP at the firewall from the security events the app already logs,
and let a generic WAF absorb injection/scanner noise.

**Prerequisite — the banned IP must be the real client, and it must be IN the log line.** fail2ban
bans whatever `<HOST>` its regex captures, so a jail can only ban on events that actually carry an
`ip` field. Two catches:

- **Correct `req.ip`.** pino logs `req.ip` only where the handler passes it. Express derives
  `req.ip` correctly from `X-Forwarded-For` only when `TRUST_PROXY` equals the real hop count — get
  it wrong and you ban your own proxy's address (locking everyone out) or a spoofed value (banning
  nobody). Set it per [env-and-secrets](env-and-secrets.md) and [deployment](deployment.md): `1`
  behind Caddy/nginx, and read the client from `CF-Connecting-IP` behind Cloudflare (which *appends*
  to `X-Forwarded-For`).
- **The event must include `ip`.** Of the app's high-signal lines, `transfer denied`
  ([transaction-endpoints](transaction-endpoints.md)) and `login blocked: account locked out`
  (above) log `ip`. `refresh token reuse detected` ([auth-blueprint](auth-blueprint.md)) logs only
  `{ userId, familyId }` and the [observability](observability.md) request line logs
  `method/url/status/latencyMs/userId` — **neither carries `ip` as written**. Refresh-reuse is one
  of the strongest attack signals there is, so **add `ip: req.ip` to that log call** and jail on it:

  ```js
  // src/auth/routes.js — reuse-detection branch, so the fail2ban jail below can ban on it:
  logger.warn({ userId, familyId, ip: req.ip }, 'refresh token reuse detected');
  ```

```ini
# /etc/fail2ban/filter.d/app-abuse.conf — one regex per high-signal event that LOGS ip.
# <HOST> is the ban target. pino writes the merged fields BEFORE "msg" in each JSON line
# ({"level":40,...,"ip":"1.2.3.4",...,"msg":"transfer denied"}), so "ip" must precede "msg"
# in the pattern — the reverse order would never match a real line.
[Definition]
failregex = ^.*"ip":"<HOST>".*"msg":"transfer denied".*$
            ^.*"ip":"<HOST>".*"msg":"login blocked: account locked out".*$
            ^.*"ip":"<HOST>".*"msg":"refresh token reuse detected".*$
            ^.*"ip":"<HOST>".*"msg":"spend budget exceeded".*$
datepattern = {NONE}
# {NONE} = don't try to parse a timestamp; stamp each match with the time the line is read —
# correct for a live-tailed log. Needed because pino's default "time" is epoch MILLISECONDS as a
# bare number, which fail2ban's date heuristics can misread as dates ~50k years out and break
# findtime. (If you must parse the stamp instead, set pino timestamp:
# pino.stdTimeFunctions.unixTime so "time" is epoch seconds, and match it explicitly.)
```

```ini
# /etc/fail2ban/jail.d/app.local — tail the app's own log; ban at the firewall, not in Node.
[app-abuse]
enabled  = true
backend  = polling
logpath  = /opt/app/logs/server.log   # the durable pino sync destination (server-skeleton.md)
maxretry = 12                          # tuned above legit retry bursts, below a stuffing run
findtime = 300                         # 12 hits in 5 min...
bantime  = 3600                        # ...→ 1 h firewall ban (nftables/iptables action)
# Escalate repeat offenders with fail2ban's recidive jail rather than a permanent ban here.
```

Because the ban is a firewall rule, a banned botnet IP never reaches Node again — it costs zero
request handlers, zero Redis ops, zero argon2 CPU, until `bantime` elapses.

**Generic WAF** — put OWASP Core Rule Set in front for injection/scanner traffic the app-level
defenses would otherwise have to reason about one request at a time:

- **Caddy**: [`coraza-caddy`](https://github.com/corazawaf/coraza-caddy) — Coraza (ModSecurity-compatible)
  as a Caddy directive, loaded with the OWASP CRS.
- **nginx**: `ModSecurity-nginx` + OWASP CRS, or Coraza via the nginx module.

Start CRS in **anomaly-scoring/DetectionOnly** mode, watch for false positives against the app's
real traffic for a week, then switch to blocking. Keep the WAF a *coarse* net — it is not a
substitute for `.strict()` zod validation ([input-validation](input-validation.md)) or the
per-endpoint gate ([security-checklist](security-checklist.md)); it catches the generic scanner
noise so the app-level controls face only shaped traffic.

## Abuse / anti-fraud / rate-of-value controls

Rationale: [auth-blueprint](auth-blueprint.md) covers *getting in*; nothing yet covers a
*legitimately authenticated* account draining value through the business logic. This is `anti-fraud.md`
in spirit — velocity limits, first-party-fraud signals, per-recipient caps, a hold queue — tied to
the audit log and to freeze/step-up. It layers **on top of** the
[transaction-endpoints](transaction-endpoints.md) worker tx; the invariants (integer minor units,
guard-in-UPDATE, ownership-inside-tx, `{ ok, code }` returns) are unchanged. Velocity state lives in
the DB inside the same tx as the money move — a Redis counter here would be a TOCTOU race against the
ledger. Add columns/rows the tx reads and writes in one shot:

```sql
-- add to src/db/schema.sql
ALTER TABLE accounts ADD COLUMN verification_level INTEGER NOT NULL DEFAULT 0; -- 0=new,1=email,2=kyc
-- Per-account rolling-window velocity, advanced inside the transfer tx (no separate store to race).
CREATE TABLE IF NOT EXISTS transfer_velocity (
  account_id  INTEGER PRIMARY KEY REFERENCES accounts(id),
  window_start INTEGER NOT NULL,        -- unixepoch of the current 24h bucket
  sent_cents  INTEGER NOT NULL DEFAULT 0 CHECK (sent_cents >= 0),
  sent_count  INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0)
);
-- Transfers can now be held for manual review instead of settling immediately.
ALTER TABLE transfers ADD COLUMN status TEXT NOT NULL DEFAULT 'settled'
  CHECK (status IN ('settled','pending_review','rejected'));
```

Limits are a pure function of account age/verification — cheap, testable, no I/O:

```js
// src/fraud/limits.js — configurable caps by trust level. Money is INTEGER minor units, always.
const TIER = {
  0: { maxPerTxCents:  50_00, dailyCents:  200_00, dailyCount:  5 }, // brand-new / unverified
  1: { maxPerTxCents: 500_00, dailyCents: 2000_00, dailyCount: 20 }, // email-verified
  2: { maxPerTxCents: 50000_00, dailyCents: 100000_00, dailyCount: 100 }, // KYC'd
};
export const limitsFor = (level) => TIER[level] ?? TIER[0]; // unknown level → most restrictive
export const STRUCTURING_FLOOR_CENTS = 45_00; // repeated sends just under the tier-0 per-tx cap
```

The checks run **inside** the transfer worker tx (extend the function in
[transaction-endpoints](transaction-endpoints.md), after ownership is confirmed and before the
debit). Everything below is one atomic transaction with the money move, so a concurrent second
transfer sees this one's committed velocity row — the window counters cannot be raced past the cap:

```js
// src/db/worker.js — inside the transfer() tx, after the `from`/`to` ownership checks:
  const { verification_level } = stmt('SELECT verification_level FROM accounts WHERE id = ?').get(fromAccount);
  const lim = limitsFor(verification_level);

  // 1. Per-transaction cap — a single-shot bound before any windowing math.
  if (amountCents > lim.maxPerTxCents) throw new TxError('LIMIT_PER_TX');

  // 2. Rolling 24h velocity — read, roll the window if stale, enforce, then write, all in-tx.
  const now = Math.floor(Date.now() / 1000);
  let v = stmt('SELECT window_start, sent_cents, sent_count FROM transfer_velocity WHERE account_id = ?').get(fromAccount)
        ?? { window_start: now, sent_cents: 0, sent_count: 0 };
  if (now - v.window_start >= 86_400) v = { window_start: now, sent_cents: 0, sent_count: 0 }; // new bucket
  if (v.sent_count + 1 > lim.dailyCount) throw new TxError('LIMIT_DAILY_COUNT');
  if (v.sent_cents + amountCents > lim.dailyCents) throw new TxError('LIMIT_DAILY_AMOUNT');

  // 3. First-party fraud signals → HOLD (don't hard-reject; a legit user shouldn't lose funds to a
  //    heuristic, but the money must not leave until reviewed). structuring = repeated sends just
  //    under the cap; new-account-then-drain = tier 0 moving most of its balance to a fresh recipient.
  const bal = stmt('SELECT balance_cents FROM accounts WHERE id = ?').get(fromAccount).balance_cents;
  const structuring = amountCents >= STRUCTURING_FLOOR_CENTS && amountCents <= lim.maxPerTxCents
    && v.sent_count >= 2; // several near-cap sends in the window
  const drain = verification_level === 0 && amountCents * 2 >= bal; // moving ≥half of a new account
  const hold = structuring || drain;

  // Advance velocity whether held or settled — a hold still consumed a slot/amount for the window.
  stmt(`INSERT INTO transfer_velocity (account_id, window_start, sent_cents, sent_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(account_id) DO UPDATE SET
          window_start = excluded.window_start,
          sent_cents = ?, sent_count = ?`)
    .run(fromAccount, v.window_start, amountCents, v.sent_cents + amountCents, v.sent_count + 1);

  if (hold) {
    // Debit into hold (money leaves the sender so it can't be double-spent) but DON'T credit the
    // recipient yet; the transfer row lands as pending_review. The guard-in-UPDATE still applies.
    const debit = stmt('UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ? AND balance_cents >= ?')
      .run(amountCents, fromAccount, amountCents);
    if (debit.changes === 0) throw new TxError('INSUFFICIENT');
    // UNIQUE(created_by, idempotency_key) makes a replayed hold collide and roll the whole tx back
    // (velocity advance included) — a retry can't double-count or double-debit.
    const t = stmt(`INSERT INTO transfers (idempotency_key, params_hash, from_account, to_account, amount_cents, created_by, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'pending_review')`)
      .run(idempotencyKey, paramsHash, fromAccount, toAccount, amountCents, userId);
    stmt(`INSERT INTO audit_log (user_id, action, detail) VALUES (?, 'transfer_held', ?)`)
      .run(userId, JSON.stringify({ transferId: Number(t.lastInsertRowid), reasons: { structuring, drain }, amountCents }));
    return { transferId: Number(t.lastInsertRowid), status: 'pending_review' };
  }
  // ...else fall through to the normal debit+credit+audit path from transaction-endpoints.md...
```

New result codes map to HTTP in the route's `TX_HTTP` table
([transaction-endpoints](transaction-endpoints.md)); the denied ones are logged **outside** the
rolled-back tx exactly like `transfer denied`:

```js
// src/transfers/routes.js — extend TX_HTTP:
  LIMIT_PER_TX:       [409, 'amount exceeds your per-transaction limit'],
  LIMIT_DAILY_AMOUNT: [409, 'daily transfer limit reached'],
  LIMIT_DAILY_COUNT:  [409, 'daily transfer count reached'],
// A pending_review result is a SUCCESS shape (the worker wraps it { ok: true, ... }), surfaced
// honestly so the UI can show "under review":
  if (result.ok && result.status === 'pending_review') {
    return res.status(202).json({ transferId: result.transferId, status: 'pending_review' });
  }
```

The **manual-review queue** is just `SELECT ... WHERE status='pending_review'`; approving credits the
recipient in a named worker tx (`releaseHold`), rejecting refunds the sender — both write an
`audit_log` row and re-check the recipient still exists. Each is idempotent: guard the state change
with `WHERE id = ? AND status = 'pending_review'` inside the tx (assert `changes === 1`) so a
double-click or a duplicated admin request can't credit or refund the held amount twice. A **freeze**
is the sharpest control: set a `frozen` flag and bump `session_version` + `invalidateSvCache()` so
every live access token dies within the cache TTL (≤30 s, per-process — see
[cluster-scaling](cluster-scaling.md)) — the money re-checks session inside the tx anyway
([transaction-endpoints](transaction-endpoints.md)), so a frozen principal cannot move funds even
mid-window. **Step-up** re-uses the "fresh re-auth for high-value ops" rule already in the checklist.

**Invariant — overdraft is impossible.** The `CHECK (balance_cents >= 0)` column constraint and the
`WHERE balance_cents >= ?` guard are two independent nets; assert it never breaches under
concurrency and never write a code path that bypasses the guard (see the RACE/EXTREMES passes):

```js
// tests/overdraft.invariant.test.js — hammer one account concurrently; balance must never go negative.
// Seed a KYC'd (tier 2) account so velocity caps don't fire first — this test isolates the
// overdraft invariant, not the daily-count limit (that gets its own test). The per-user
// transferLimiter is skipped in NODE_ENV=test, so all 50 requests reach the worker.
test('no concurrent transfer sequence can drive a balance below zero', async () => {
  // balance 100_00; fire 50 concurrent transfers of 5_00 (250_00 demanded ≫ 100_00 available).
  const results = await Promise.allSettled(Array.from({ length: 50 }, () => db.transfer(/* 5_00 */)));
  const ok = results.filter((r) => r.value?.ok).length;
  const { balance_cents } = await db.get('SELECT balance_cents FROM accounts WHERE id = ?', [id]);
  expect(balance_cents).toBeGreaterThanOrEqual(0); // the invariant — no overdraft, ever
  expect(ok).toBe(20); // exactly floor(100_00 / 5_00) settle; the rest hit INSUFFICIENT
});
```

## Cost controls & resource-abuse economics

Rationale: an unauthenticated or lightly-authenticated endpoint that triggers a **paid** third-party
call is a way for an attacker to spend *your* money — burn an email quota, run up geo-IP/SMS/OAuth
bills, or inflate object-storage egress — without ever breaching a security boundary. Cap it, alert
on it, and wire a kill switch to "we're being financially DoS'd." This is `cost-controls.md` in
spirit; it reuses the Redis budget primitive above and the audit log.

**Budget the attacker-triggerable, per-unit-billed operations.** HIBP is free, but transactional
**email sends**, **SMS** (if added), **OAuth** token calls, **geo-IP lookups**, and **object-storage
egress** for backups/Litestream all cost per unit and are reachable from unmetered endpoints. An
unthrottled `forgot-password` or `resend-verification` is a direct line to your email invoice. Put a
per-IP **and** per-account budget on each expensive op, using the same atomic INCR+EXPIRE as the
lockout so it holds cluster-wide. In production Redis is guaranteed present (env superRefine), so the
dev-only fail-open below can never disable the cap where it matters.

```js
// src/lib/spend-budget.js — a hard cap on expensive/paid operations per identity per window.
import { redis } from './redis.js';

const INCR_WITH_TTL = `
  local n = redis.call('INCR', KEYS[1])
  if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  return n`;

// Returns true if this call is WITHIN budget (and consumes one unit); false if the cap is hit.
export async function consumeBudget(op, identity, { max, windowSec }) {
  if (!redis) return true; // dev only (prod requires REDIS_URL) → don't block local work
  const n = await redis.eval(INCR_WITH_TTL, { keys: [`budget:${op}:${identity}`], arguments: [String(windowSec)] });
  return Number(n) <= max;
}
```

```js
// e.g. the forgot-password route — budget BOTH the IP and the target account, and always return the
// same generic 200 (never confirm the email exists; never reveal the budget was hit). If Redis is
// transiently down the eval rejects → next(err) → no mail is enqueued (fail SAFE, not fail-spend):
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = ForgotSchema.parse(req.body); // .strict(), email-bounded
    const daily = { max: 5, windowSec: 86_400 };
    const [ipOk, acctOk] = await Promise.all([
      consumeBudget('email', `ip:${req.ip}`, { max: 20, windowSec: 3600 }),
      consumeBudget('email', `acct:${email.toLowerCase()}`, daily),
    ]);
    if (ipOk && acctOk) {
      // ...enqueue the send only when within budget — this is the line that costs money...
    } else {
      logger.warn({ ip: req.ip, op: 'email' }, 'spend budget exceeded'); // fuels the fail2ban jail
    }
    res.status(200).json({ ok: true }); // identical response whether or not a mail was sent
  } catch (err) { next(err); }
});
```

**Storage-growth projection & lifecycle expiry.** Backups/Litestream stream to object storage that
bills per GB stored *and* per GB egress. The backup shipper in
[db-migrations-backups](db-migrations-backups.md) already keeps only the last `BACKUP_KEEP`
snapshots locally — mirror that off-box so cost is bounded, not monotonically growing:

- Set an **object-storage lifecycle rule** (e.g. S3/R2 lifecycle) to expire backup objects after the
  retention window — the shipper deleting local files does not delete remote copies.
- For **Litestream**, bound retention in the top-level `snapshot:` block of `litestream.yml`
  (`snapshot.interval` + `snapshot.retention`) so snapshots/WAL don't accumulate unbounded. Note
  Litestream durations use `h`/`m`/`s` only — express a multi-day window in hours (e.g.
  `retention: 72h`), not `3d`.
- Project the ceiling: `snapshot_size × BACKUP_KEEP + WAL_churn/day × retention_days`. If that number
  surprises you, the retention window is the knob — not "buy more storage."

**Telemetry retention caps.** GlitchTip (one example error-reporter target for the
[observability](observability.md) hook) and Loki/log storage bill by volume too, and an error storm
is itself attacker-triggerable. Set a **retention cap** (e.g. 30–90 days) and a per-project event
quota in GlitchTip; set a Loki `retention_period` and per-tenant ingestion limits. Unbounded
telemetry is a slow-motion cost DoS.

**Kill switch — wired to "shut off the paid feature."** The general feature-flag/kill-switch lives in
the flags item; here it has one specific job: when spend-budget alerts fire, flip the paid feature
**off** at the app so the bill stops climbing while you investigate — degrade, don't fall over.

```js
// src/lib/kill-switch.js — a Redis-backed boolean per paid feature; default ON, flip OFF in an incident.
import { redis } from './redis.js';

// Fail OPEN for core features, but for PAID ones fail CLOSED under financial-DoS: if we can't read
// the flag we still want the option to have pre-disabled the spend. Choose per feature deliberately.
export async function paidFeatureEnabled(name, { defaultOn = true } = {}) {
  if (!redis) return defaultOn;
  const v = await redis.get(`killswitch:${name}`);
  return v === null ? defaultOn : v === '1';
}
// Flip in an incident (ops script / admin route behind requireRole('admin')):
//   redis.set('killswitch:email', '0')  → resend-verification/forgot-password stop sending.
```

```js
// Guard the expensive op with the switch AND the budget — the switch is the manual big red button,
// the budget is the automatic per-identity cap:
  if (!(await paidFeatureEnabled('email'))) {
    return res.status(503).json({ error: 'temporarily unavailable' }); // paid feature parked, bill halted
  }
```

Alerting closes the loop: emit `spend budget exceeded` at `warn` (already above) and alert when its
rate spikes, so a human flips the kill switch before the invoice does the flipping for you. Tie the
same alert to the fail2ban jail — the IPs burning the budget are exactly the ones to ban.

## Recap — which layer stops what

- **Redis limit store + lockout** — makes the [auth-blueprint](auth-blueprint.md) limits *exact*
  across the cluster and hard-stops per-account brute force; atomic INCR+EXPIRE, no permanent-lock
  DoS; `REDIS_URL` required in production so the controls can't silently no-op.
- **fail2ban + WAF** — bans abusive IPs at the firewall from the pino events that log `ip` (needs
  correct `TRUST_PROXY`, and `ip` added to the refresh-reuse line), and absorbs generic
  scanner/injection traffic before Node sees it.
- **Anti-fraud velocity/holds** — stops an *authenticated* account draining value, enforced inside
  the [transaction-endpoints](transaction-endpoints.md) tx; overdraft-impossibility is an invariant test.
- **Cost controls** — cap attacker-triggerable spend (email/SMS/geo-IP/OAuth/egress), bound backup +
  telemetry storage growth, and give a per-feature kill switch for a financial DoS.
- These are the "Rate limiting — L2" and operational-resilience rows of
  [security-checklist](security-checklist.md) once the app runs clustered and takes money.