# Integrity & signing

Why this design: authorization decides *who may act*; integrity decides *whether a record or
message can be trusted after the fact*. A leaked DB key or a compromised host lets an attacker
UPDATE any row — so the audit log must be tamper-**evident** (you can't stop a root attacker
editing bytes, but you can make the edit detectable), inbound machine-to-machine calls must prove
they hold a shared secret (cookies/JWT are for humans in browsers), and non-browser clients need
credentials that are single-purpose, scoped, and revocable without touching a password. One rule
underlies all three: **store only hashes of secrets, compare with `crypto.timingSafeEqual`, and
never trust a value the client could forge.**

## Tamper-evident append-only audit log via hash chaining [must]

Rationale: chaining each row's hash into the next makes altering or deleting any past row break
every link after it — so tampering is detectable even by someone who owns the database file.

Upgrade the `audit_log` from transaction-endpoints.md with two columns. `entry_hash` binds the
row's own fields *and* the previous row's hash. Triggers enforce append-only *inside the engine*,
so a stray query (or a future buggy handler) can't rewrite history without first dropping the
trigger — itself a visible change.

On a fresh DB, add these columns to the `CREATE TABLE audit_log` in `schema.sql`. On a DB that
already holds data, `ALTER TABLE ADD COLUMN` cannot live in the always-re-run `schema.sql` (it
throws "duplicate column name" on the second boot) — put it in a numbered `user_version`
migration file instead (db-migrations-backups.md). The triggers are safe to keep in `schema.sql`
because of `IF NOT EXISTS`. Rows that predate the migration are left with NULL hashes, and
`verify-audit.js` below will (correctly) flag the first one — if you need history covered,
backfill inside the same migration: drop the two UPDATE triggers, seal each row's
`prev_hash`/`entry_hash` in `id` order with `auditEntryHash`, then re-run the `CREATE TRIGGER`
statements.

```sql
-- schema.sql: on a fresh DB, add these two columns to CREATE TABLE audit_log (...).
-- On an existing DB, run the two ADD COLUMNs from a numbered migration (db-migrations-backups.md):
--   ALTER TABLE audit_log ADD COLUMN prev_hash  TEXT;  -- entry_hash of previous row ('' for row 1)
--   ALTER TABLE audit_log ADD COLUMN entry_hash TEXT;  -- sha256 over this row's fields + prev_hash

-- Append-only, but permit the ONE-TIME NULL->hash seal below (rows are inserted, then sealed).
CREATE TRIGGER IF NOT EXISTS audit_log_seal_once
BEFORE UPDATE ON audit_log
WHEN OLD.entry_hash IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

-- The seal UPDATE may only set entry_hash (NULL->hash). Block any UPDATE that also mutates a
-- chained field, otherwise a handler could flip the seal and rewrite detail in one statement
-- while entry_hash was still NULL. Every chained column must be unchanged by the sealing UPDATE.
CREATE TRIGGER IF NOT EXISTS audit_log_seal_fields_immutable
BEFORE UPDATE ON audit_log
WHEN OLD.entry_hash IS NULL AND (
     NEW.id         IS NOT OLD.id
  OR NEW.user_id    IS NOT OLD.user_id
  OR NEW.action     IS NOT OLD.action
  OR NEW.detail     IS NOT OLD.detail
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.prev_hash  IS NOT OLD.prev_hash)
BEGIN SELECT RAISE(ABORT, 'audit_log fields are immutable'); END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
```

The hash must be computed identically at insert and at verify, so it lives in one helper. Fields
are length-prefixed, not concatenated, so `("ab","c")` and `("a","bc")` can't collide.

```js
// src/lib/audit-hash.js — the ONE definition of an audit entry's hash. Reused by worker + verifier.
import { createHash } from 'node:crypto';

const frame = (v) => { const s = v == null ? '' : String(v); return `${s.length}:${s}`; };

// prevHash is '' for the genesis row; every later row folds in its predecessor's entry_hash.
// ip/user_agent are intentionally NOT chained — treat them as annotations, keep authoritative
// facts in `detail` (which IS chained). Widen this signature if you need them tamper-evident too.
export function auditEntryHash({ id, userId, action, detail, createdAt, prevHash }) {
  return createHash('sha256')
    .update(frame(id) + frame(userId) + frame(action) + frame(detail) + frame(createdAt) + frame(prevHash))
    .digest('hex');
}
```

Write the link **inside `transfer()`'s worker transaction** (transaction-endpoints.md) so the audit
row commits or rolls back atomically with the money row. `id`/`created_at` are engine-assigned, so
insert first, then seal the hash — both in the same atomic txn, so no half-linked row is ever
visible. Replace the plain `INSERT INTO audit_log ...` line in `transfer()` with a call to this
helper. Appends never race: `transfer()` runs under `tx.immediate()`, so SQLite serializes the
writers and no two audits read the same `prev_hash`.

```js
// In src/db/worker.js — called from inside transfer()'s tx (stmt() is the worker's local helper).
import { auditEntryHash } from '../lib/audit-hash.js';

function appendAudit({ userId, action, detail, ip, userAgent }) {
  const prev = stmt('SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
  // A prior row left unsealed (entry_hash NULL) means a broken/aborted append — refuse to chain
  // onto an unknown predecessor rather than silently starting a second genesis.
  if (prev && prev.entry_hash == null) throw new Error('audit_log has an unsealed head row');
  const prevHash = prev ? prev.entry_hash : '';

  const info = stmt(
    `INSERT INTO audit_log (user_id, action, detail, ip, user_agent, prev_hash)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, action, detail, ip ?? null, userAgent ?? null, prevHash);

  const row = stmt('SELECT id, created_at FROM audit_log WHERE id = ?').get(Number(info.lastInsertRowid));
  const entryHash = auditEntryHash({ id: row.id, userId, action, detail, createdAt: row.created_at, prevHash });
  // The seal is the only UPDATE the triggers allow (entry_hash was NULL); every later UPDATE aborts.
  stmt('UPDATE audit_log SET entry_hash = ? WHERE id = ? AND entry_hash IS NULL').run(entryHash, row.id);
}
```

Walk the chain offline to find the first broken link — run it as a maintenance job and after any
restore. Standalone scripts load env before the db layer (db-layer.md).

```js
// scripts/verify-audit.js — node scripts/verify-audit.js  (exit 1 if the chain is broken)
import 'dotenv/config';
import * as db from '../src/db/index.js';
import { auditEntryHash } from '../src/lib/audit-hash.js';

const rows = await db.all(
  'SELECT id, user_id, action, detail, created_at, prev_hash, entry_hash FROM audit_log ORDER BY id ASC');

let expectedPrev = '';
for (const r of rows) {
  // An unsealed row (entry_hash NULL) is itself a defect — never let it pass as "matches".
  if (r.entry_hash == null) {
    console.error(`BROKEN at id=${r.id}: entry_hash is NULL (row never sealed)`);
    process.exit(1);
  }
  if (r.prev_hash !== expectedPrev) {
    console.error(`BROKEN at id=${r.id}: prev_hash mismatch (a prior row was deleted or reordered)`);
    process.exit(1);
  }
  const recomputed = auditEntryHash({
    id: r.id, userId: r.user_id, action: r.action, detail: r.detail, createdAt: r.created_at, prevHash: r.prev_hash });
  if (recomputed !== r.entry_hash) {
    console.error(`BROKEN at id=${r.id}: entry_hash mismatch (this row's contents were altered)`);
    process.exit(1);
  }
  expectedPrev = r.entry_hash;
}
console.log(`audit chain OK: ${rows.length} rows, head=${expectedPrev.slice(0, 12) || '(empty)'}`);
await db.closePool();
```

Optional anchoring: emit the head hash to `server.log` daily, and — this is what makes it work —
ship that log off-box (a hash sitting only in the same DB an attacker already owns proves nothing).
Given off-host log shipping, an attacker who rewrites the DB *and* re-links every hash still can't
touch the head hash already recorded in yesterday's shipped log — the mismatch convicts them.

```js
// In a daily maintenance job — under clustering, run it on ONE process only (e.g. cluster.isPrimary,
// cluster-scaling.md) so the anchor isn't emitted N times. Standalone, run it from verify-audit.js.
const head = await db.get('SELECT id, entry_hash FROM audit_log ORDER BY id DESC LIMIT 1');
logger.info({ auditHead: head?.entry_hash ?? null, auditRows: head?.id ?? 0 }, 'audit anchor');
```

## HMAC request signing for service-to-service / webhook calls [should]

Rationale: a cron worker or a provider webhook has no cookie — it proves identity by signing the
request with a shared secret, verified in constant time so the check leaks no timing signal.

Add one signing key per counterparty to `EnvSchema` (env-and-secrets.md) — a leak is then contained
and revocable independently. Validate them as base64url like `JWT_SECRET`.

```js
// Add to EnvSchema in src/lib/env.js (base64url32 helper is already defined there):
PAYMENTS_SIGNING_KEY: base64url32('PAYMENTS_SIGNING_KEY').optional(),
CRON_SIGNING_KEY:     base64url32('CRON_SIGNING_KEY').optional(),
```

Canonicalize method + **full request target (path AND query)** + timestamp + client nonce +
`sha256(body)` into one unambiguous string, then HMAC it. Binding all of these means an attacker
can't swap the body, **swap query parameters, replay to another route**, or replay after the window
without invalidating the signature.

> **The query string is security-relevant and MUST be signed.** Express's `req.path` **drops the
> query string**; signing only `req.path` lets an attacker replay a captured signature against the
> same route with *different* query params (`?action=debit`, `?amount=999`) and still pass. Always
> canonicalize over `req.originalUrl` (path + query, exactly as received) on the verify side, and
> over the identical full target on the signer side.

```js
// src/lib/hmac.js — sign outbound, verify inbound. Symmetric canonicalization is the whole game.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// `target` is the full request target including query string (e.g. "/webhooks/pay?x=1"),
// NOT req.path — the query is part of what's authenticated. `nonce` is a per-request unique
// token the sender generates; the verifier both checks the signature AND single-uses the nonce.
export function canonicalString(method, target, timestamp, nonce, rawBody) {
  const bodyHash = createHash('sha256').update(rawBody ?? '').digest('hex');
  return `${method.toUpperCase()}\n${target}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

export function signRequest(secretB64url, method, target, timestamp, nonce, rawBody) {
  const key = Buffer.from(secretB64url, 'base64url');
  return createHmac('sha256', key)
    .update(canonicalString(method, target, timestamp, nonce, rawBody)).digest('hex');
}

// Buffer.from(x,'hex') never throws — it silently truncates invalid/odd input to a shorter buffer.
// That's why we gate on length FIRST: a wrong-length (or garbage) sig is rejected there, and only
// equal-length buffers reach timingSafeEqual — so a wrong-length sig leaks no timing signal either.
export function verifySignature(secretB64url, method, target, timestamp, nonce, rawBody, presented) {
  const expected = Buffer.from(signRequest(secretB64url, method, target, timestamp, nonce, rawBody), 'hex');
  const given = Buffer.from(presented ?? '', 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
```

Verify **before the handler**, on the *raw* body (the exact bytes the sender signed — re-serializing
`req.body` would change them). Capture the raw body with an express `verify` hook.

```js
// src/lib/raw-body.js — mount as express.json({ verify: captureRawBody }) so req.rawBody is the signed bytes.
// body-parser calls verify(req, res, buf, encoding); it only aborts parsing if the hook THROWS,
// so a plain assignment here is safe. Stash the string once; the signer hashes it as utf8 too.
export const captureRawBody = (req, _res, buf) => { req.rawBody = buf.toString('utf8'); };
```

```js
// src/lib/require-signature.js — HMAC gate for internal/webhook routes. Separate from requireAuth.
import { verifySignature } from './hmac.js';
import { env } from './env.js';
import { logger } from './logger.js';

const WINDOW_SEC = 5 * 60;       // reject stamps outside ±5 min (clock-skew tolerance + replay bound)
const seenNonces = new Map();    // client nonce -> expiry; short-TTL single-use cache within the window

// Retain a nonce until the LAST moment its timestamp is still accepted (ts + WINDOW_SEC). Keying
// the expiry off `now` instead would let a future-dated (still in-window) timestamp outlive its
// cache entry — evicted nonce, still-valid signature — and be replayed.
function rememberNonce(nonce, ts, now) {
  for (const [k, exp] of seenNonces) if (exp <= now) seenNonces.delete(k); // lazy sweep, bounded growth
  if (seenNonces.has(nonce)) return false;                                 // already used → replay
  seenNonces.set(nonce, ts + WINDOW_SEC);
  return true;
}

export const requireSignature = (envKeyName) => (req, res, next) => {
  const secret = env[envKeyName];
  if (!secret) return res.status(500).json({ error: 'signing not configured' }); // fail closed
  const sig = req.get('X-Signature');
  const nonce = req.get('X-Nonce');
  const ts = Number(req.get('X-Timestamp'));
  const now = Math.floor(Date.now() / 1000);

  // Require a well-formed nonce (bounds cache-key size; a client-chosen unique token, not the sig).
  if (!sig || !nonce || nonce.length < 16 || nonce.length > 200 ||
      !Number.isInteger(ts) || Math.abs(now - ts) > WINDOW_SEC) {
    logger.warn({ path: req.path }, 'signature rejected: missing/expired');
    return res.status(401).json({ error: 'unauthorized' });
  }
  // Sign/verify the FULL target (path + query), never req.path — the query is authenticated too.
  const target = req.originalUrl;
  // Verify BEFORE touching the nonce cache — an unverified request must never occupy it.
  if (!verifySignature(secret, req.method, target, ts, nonce, req.rawBody ?? '', sig)) {
    logger.warn({ path: req.path }, 'signature rejected: mismatch');
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!rememberNonce(nonce, ts, now)) {
    logger.warn({ path: req.path }, 'signature rejected: replay');
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
};
```

The nonce cache is per-process, in-memory — under clustering (cluster-scaling.md) a replay could
land on a different worker within the window. The signature+timestamp binding still bounds replay
to `WINDOW_SEC`; **for true cross-process single-use, back the cache with the DB** — insert the
nonce into a `UNIQUE` column and treat a constraint violation as a replay:

```sql
CREATE TABLE IF NOT EXISTS seen_nonces (
  nonce TEXT PRIMARY KEY,               -- client-supplied X-Nonce; UNIQUE enforces single-use
  expires_at INTEGER NOT NULL           -- ts + WINDOW_SEC; sweep expired rows periodically
);
```

```js
// Cross-process single-use: the INSERT succeeds exactly once per nonce; a duplicate throws (replay).
// Do this AFTER signature verification, inside the same txn as the effect where atomicity matters.
try {
  await db.run('INSERT INTO seen_nonces (nonce, expires_at) VALUES (?, ?)', [nonce, ts + WINDOW_SEC]);
} catch { return res.status(401).json({ error: 'unauthorized' }); } // UNIQUE violation ⇒ replay
```

```js
// Inbound usage — RAW body captured, per-service key named. No cookie/JWT involved.
// app.use(express.json({ verify: captureRawBody }));
router.post('/webhooks/payments', requireSignature('PAYMENTS_SIGNING_KEY'), async (req, res, next) => { /* ... */ });

// Outbound (our cron worker → an internal service): sign the EXACT target + bytes you transmit.
import { randomBytes } from 'node:crypto';
const ts = Math.floor(Date.now() / 1000);
const nonce = randomBytes(16).toString('base64url');   // fresh per request; makes each sig single-use
const target = '/internal/reconcile?window=day';       // MUST equal req.originalUrl at the receiver
const rawBody = JSON.stringify(payload);
const signature = signRequest(env.CRON_SIGNING_KEY, 'POST', target, ts, nonce, rawBody);
await fetch(new URL(target, base), { method: 'POST', body: rawBody,
  headers: { 'Content-Type': 'application/json',
    'X-Timestamp': String(ts), 'X-Nonce': nonce, 'X-Signature': signature } });
```

> For real payment providers (Stripe et al.) use *their* signature scheme and library — the
> canonical string and header names differ. The pattern above is for **your own** service calls
> where you control both ends.

## Scoped API keys for programmatic access [nice]

Rationale: a CLI or CI job needs a credential narrower than a login — one that grants only the
routes it needs, expires, and is revocable on its own without disturbing the user's password or
browser sessions.

Table sits alongside `refresh_tokens` (auth-blueprint.md). Store only `sha256(key)`; the raw key is
shown **once** and never recoverable. `prefix` is the non-secret first segment, safe to display so
users can tell keys apart.

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                      -- human label, e.g. "CI deploy bot"
  prefix TEXT NOT NULL,                    -- non-secret display id, e.g. "ak_9f3a2b"
  key_hash TEXT NOT NULL UNIQUE,           -- sha256(full key); the raw key is NEVER stored
  scopes TEXT NOT NULL DEFAULT '[]',       -- JSON array of granted scopes
  expires_at INTEGER,                      -- NULL = no expiry; prefer setting one
  revoked INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
```

Issue as `prefix.secret`. Reuse `hashToken` (auth-blueprint.md, sha256) — an API key is a
high-entropy random string, so a fast hash is correct (argon2 is for low-entropy passwords). Grant
only the scopes requested, never a superset.

```js
// src/apikeys/issue.js
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import * as db from '../db/index.js';
import { hashToken } from '../auth/tokens.js'; // sha256 hex — reused, not reinvented

const KNOWN_SCOPES = ['transfers:read', 'transfers:write', 'reports:read']; // allow-list of grantable scopes
const IssueSchema = z.object({
  name: z.string().min(1).max(64),
  scopes: z.array(z.enum(KNOWN_SCOPES)).min(1),     // enum rejects any unknown scope
  expiresInDays: z.number().int().positive().max(365).optional(),
}).strict();

export async function issueApiKey(userId, input) {
  const { name, scopes, expiresInDays } = IssueSchema.parse(input);
  const prefix = `ak_${randomBytes(4).toString('hex')}`; // non-secret, for display
  const fullKey = `${prefix}.${randomBytes(32).toString('base64url')}`; // 256-bit secret, shown ONCE
  // Compute expiry in JS and bind the result — never interpolate values into SQL, even trusted ints.
  const expiresAt = expiresInDays ? Math.floor(Date.now() / 1000) + expiresInDays * 86400 : null;

  await db.run(
    `INSERT INTO api_keys (user_id, name, prefix, key_hash, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, name, prefix, hashToken(fullKey), JSON.stringify(scopes), expiresAt]
  );
  return { apiKey: fullKey, prefix }; // returned ONCE; unrecoverable afterwards
}
```

`requireApiKey` is the non-cookie parallel to `requireAuth`: look up by hash, check
expiry/revocation, assert the route's scope is granted. Presented in `Authorization: Bearer <key>`.

```js
// src/apikeys/middleware.js
import * as db from '../db/index.js';
import { hashToken } from '../auth/tokens.js';

export const requireApiKey = (requiredScope) => async (req, res, next) => {
  try {
    const header = req.get('Authorization') ?? '';
    const key = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!key) return res.status(401).json({ error: 'unauthorized' });

    // Lookup by hash on the UNIQUE index — we never compare raw keys, and equality is done by the
    // engine over a fixed-length sha256 hex, so no variable-time secret comparison happens in JS.
    const row = await db.get(
      'SELECT id, user_id, scopes, expires_at, revoked FROM api_keys WHERE key_hash = ?', [hashToken(key)]);
    const now = Math.floor(Date.now() / 1000);
    if (!row || row.revoked || (row.expires_at && row.expires_at <= now)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const scopes = JSON.parse(row.scopes);
    if (!scopes.includes(requiredScope)) return res.status(403).json({ error: 'insufficient scope' });

    // Best-effort touch; a failed timestamp write must not fail the request.
    db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', [now, row.id]).catch(() => {});

    // NOTE: sv is null — an API key has no session_version. requireAuth-only money routes
    // (transaction-endpoints.md) reject sv===null in-tx by design; expose those to keys only
    // through a key-aware path. Ownership checks (WHERE user_id = ?) work unchanged.
    req.apiKey = { id: row.id, userId: row.user_id, scopes };
    req.user = { id: row.user_id, role: 'apikey', sv: null };
    next();
  } catch { res.status(401).json({ error: 'unauthorized' }); }
};
```

Rate-limit per key so one noisy key can't exhaust another's budget, and audit key use so
programmatic actions are reconstructable via the chain above.

```js
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
const apiKeyLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  // Fall back to ipKeyGenerator(req.ip), never raw req.ip — it normalizes IPv6 so a client
  // can't sidestep the limit by rotating within its /56 (express-rate-limit v7.5+).
  keyGenerator: (req) => (req.apiKey ? `apikey:${req.apiKey.id}` : ipKeyGenerator(req.ip)),
});
// requireApiKey must run BEFORE the limiter so req.apiKey exists when keyGenerator reads it.
router.get('/api/reports', requireApiKey('reports:read'), apiKeyLimiter, async (req, res, next) => { /* ... */ });
```

Revocation is one flag flip — instant, and independent of the user's password or sessions:

```js
await db.run('UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?', [keyId, req.user.id]); // anti-IDOR
```