# Inbound webhooks

Why this design: an inbound webhook is an **unauthenticated POST from the public internet that
claims to be your payment provider**. Anyone can replay a captured request, forge a body, or send
the same event fifty times. Three properties make it safe: (1) verify the provider's signature over
the **exact raw bytes** — which means reading the body BEFORE `express.json()` parses and mutates it
(the classic footgun); (2) bound freshness with a timestamp tolerance + a replay cache so a captured
request cannot be re-fired later; (3) **ack in milliseconds, process later** — persist the verified
event to an outbox and return `2xx` immediately, because providers treat a slow/failed response as a
retry trigger and will hammer you. Handlers are idempotent on the provider's event id (providers
retry, duplicate, and reorder), and no amount or state in the payload is trusted without
reconciling against your own record — see [transaction-endpoints.md](transaction-endpoints.md).

This ingests webhooks; it is the mirror of the outbound-HMAC-signing pattern (calls you make and
sign). Do not reuse an outbound signer to *verify* — you must verify with the PROVIDER's scheme.

## 1. Raw body capture — before `express.json()`, scoped to the webhook path

`express.json()` consumes the request stream and hands you a re-serialized object; re-stringifying
it will NOT reproduce the provider's byte-for-byte payload (key order, whitespace, unicode escapes
differ), so the HMAC will never match. Capture the raw `Buffer` on the webhook path only, and mount
it BEFORE the global `express.json({ limit: '100kb' })` from [server-skeleton.md](server-skeleton.md).

```js
// server.js — MOUNT ORDER MATTERS. Webhooks are cross-origin, cookieless, and signature-authed,
// so they sit BEFORE cookieParser/csrfProtection (no cookies, no CSRF header) and BEFORE the
// global JSON parser (which would destroy the raw bytes the signature is computed over).
import webhookRoutes from './src/webhooks/routes.js';

app.use(helmet(/* ...as in server-skeleton.md... */));

// express.raw fills req.body with the exact Buffer, ONLY for this path + content-type.
// Its own tight limit caps abuse; a webhook body over 1mb is not a real provider event.
app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '1mb' }), webhookRoutes);

app.use(express.json({ limit: '100kb' })); // everything else parses as JSON, as before
app.use(cookieParser());
app.use(csrfProtection);
app.use('/api/auth', authRoutes);
```

Rationale: the raw `Buffer` reaches the handler untouched; nothing downstream can reparse it out
from under the signature check.

## 2. Provider allowlist + per-provider secret

Each provider has its own signing scheme and secret. A central registry keeps the secret out of
the handler and makes "which providers do we accept?" an explicit, closed set — an unknown
`:provider` path segment is rejected before any crypto runs.

```js
// src/webhooks/providers.js — the closed set of webhook sources we accept.
import { env } from '../lib/env.js';
import { verifyStripe } from './verify-stripe.js';

// Each entry: the secret (from env, never inline) + the verifier for THAT provider's scheme.
// Adding a provider is a deliberate edit here — an attacker cannot introduce a new source.
export const PROVIDERS = Object.freeze({
  stripe: { secret: env.STRIPE_WEBHOOK_SECRET, verify: verifyStripe },
  // postmark: { secret: env.POSTMARK_WEBHOOK_SECRET, verify: verifyPostmark }, // email bounces
});

// hasOwnProperty guard: a raw `PROVIDERS[name]` lookup would resolve inherited keys like
// "constructor"/"toString", so an attacker-controlled :provider could reach a non-provider object.
export function getProvider(name) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, name) ? PROVIDERS[name] : null;
}
```

## 3. Signature verification — timing-safe, over the raw body, with a timestamp window

Stripe's scheme is representative: the `Stripe-Signature` header carries `t=<unix>,v1=<hex hmac>`,
and the signed payload is `` `${t}.${rawBody}` `` under HMAC-SHA256. Two non-negotiables:
**`crypto.timingSafeEqual`** for the compare (a `===` on the hex leaks the secret one byte at a time
via timing), and a **timestamp tolerance** so a captured-and-replayed request expires. Only the `v1`
scheme is HMAC-SHA256; any other `v*` key is a different (or experimental) scheme and is ignored.

```js
// src/webhooks/verify-stripe.js
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_S = 300; // reject signatures older/newer than 5 min — bounds the replay window

// Parse "t=...,v1=...,v1=..." — a rotating secret yields multiple v1 candidates; accept any match.
// Anything that is not a v1 scheme is deliberately dropped (only v1 is HMAC-SHA256).
function parseSigHeader(header) {
  const out = { t: null, v1: [] };
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i), v = part.slice(i + 1);
    if (k === 't') out.t = v;
    else if (k === 'v1') out.v1.push(v);
  }
  return out;
}

// Constant-time compare of two hex strings; false (never throws) on any length/format mismatch.
// The length pre-check only leaks the length of the ATTACKER's candidate vs our computed digest
// (a fixed 64 hex chars), never any byte of the secret — the compare itself is constant-time.
function timingSafeHexEqual(a, b) {
  const ba = Buffer.from(a, 'hex'), bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

// Returns { ok:true, eventId, type, signatureTs, payload } or { ok:false, reason } — never throws.
export function verifyStripe({ rawBody, headers, secret }) {
  const header = headers['stripe-signature'];
  if (!header) return { ok: false, reason: 'missing_signature' };

  const { t, v1 } = parseSigHeader(header);
  if (!t || v1.length === 0) return { ok: false, reason: 'malformed_signature' };

  const ts = Number(t);
  if (!Number.isInteger(ts)) return { ok: false, reason: 'malformed_signature' };
  // Timestamp window: |now - t| must be within tolerance. This is what makes a stolen request
  // stop working after 5 minutes; the replay cache (§4) covers duplicates INSIDE the window.
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > TOLERANCE_S) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }

  // Sign the EXACT raw bytes, prefixed with the timestamp — reparsing would change the bytes.
  // Chained .update() is cryptographically identical to hashing `${t}.${rawBody}` in one buffer.
  const expected = createHmac('sha256', secret)
    .update(`${t}.`).update(rawBody) // rawBody is a Buffer; feed it directly, do not toString first
    .digest('hex');
  if (!v1.some((candidate) => timingSafeHexEqual(candidate, expected))) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  // Only NOW is it safe to parse the JSON — the bytes are authenticated.
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { return { ok: false, reason: 'invalid_json' }; }
  if (!event?.id || !event?.type) return { ok: false, reason: 'missing_event_fields' };

  // Return the SIGNED timestamp (ts), not the receive time — the row is pruned relative to it,
  // and only signed-time pruning stays in step with the tolerance window enforced above.
  return { ok: true, eventId: event.id, type: event.type, signatureTs: ts, payload: event };
}
```

Rationale: verify-then-parse; the compare is constant-time; freshness is enforced before the body
is ever trusted.

## 4. Schema + idempotency/replay store (add to src/db/schema.sql)

One table doubles as the **transactional outbox** and the **replay/idempotency cache**. The
`UNIQUE(provider, event_id)` is the whole idempotency guarantee: a duplicate delivery collides on
insert and is silently acked. `status` drives the async processor. `signature_ts` lets a sweep prune
old rows so the replay cache does not grow unbounded.

```sql
CREATE TABLE IF NOT EXISTS webhook_events (
  id            INTEGER PRIMARY KEY,
  provider      TEXT    NOT NULL,
  event_id      TEXT    NOT NULL,            -- the PROVIDER's event id — the dedupe key
  event_type    TEXT    NOT NULL,
  signature_ts  INTEGER NOT NULL,           -- unix seconds from the signed header (for pruning)
  payload       TEXT    NOT NULL,           -- raw verified JSON, processed out-of-band
  status        TEXT    NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  attempts      INTEGER NOT NULL DEFAULT 0,
  claimed_at    INTEGER,                    -- set on claim — lets the sweep spot rows stranded in 'processing'
  last_error    TEXT,
  received_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  processed_at  INTEGER,
  UNIQUE (provider, event_id)               -- providers resend duplicates; the DB rejects them
);

-- Processor scan: fetch the oldest pending rows without a full-table scan.
CREATE INDEX IF NOT EXISTS idx_webhook_pending ON webhook_events (status, id);
```

## 5. Atomic enqueue — one named worker transaction (add to src/db/worker.js)

Enqueue is a single insert, but it needs branch-on-conflict semantics (duplicate → ack, not error),
so it gets its own named function per the [db-layer.md](db-layer.md) / [transaction-endpoints.md](transaction-endpoints.md)
rules rather than the generic `writeTx`. It returns a value (never throws) so the duplicate case
crosses the worker boundary cleanly.

```js
// src/db/worker.js — append alongside transfer(). Reuses the file's existing stmt()/getDb() helpers.

export function enqueueWebhook({ provider, eventId, eventType, signatureTs, payload }) {
  const tx = getDb().transaction(() => {
    // INSERT OR IGNORE turns the UNIQUE(provider,event_id) collision into a no-op instead of a
    // throw — this IS the idempotency check. changes===0 means we've already stored this event.
    // Provider event ids are stable across retries and never reused, so they are a sound key.
    const info = stmt(
      `INSERT OR IGNORE INTO webhook_events (provider, event_id, event_type, signature_ts, payload)
       VALUES (?, ?, ?, ?, ?)`
    ).run(provider, eventId, eventType, signatureTs, payload);
    return info.changes === 1
      ? { stored: true, id: Number(info.lastInsertRowid) }
      : { stored: false }; // duplicate delivery — already queued/processed
  });
  return { ok: true, ...tx.immediate() };
}
```

Expose it in `src/db/index.js` (same shape as the other named calls in [db-layer.md](db-layer.md)):

```js
export const enqueueWebhook = (args) => pool.run(args, { name: 'enqueueWebhook' });
```

## 6. The receiver route — verify, enqueue, fast-ack

The handler does the minimum: allowlist → verify → persist → `2xx`. It NEVER runs business logic
inline; slow work (or a thrown handler) turns into provider retries and, worse, duplicate side
effects. A **verified duplicate still returns `2xx`** — telling the provider to stop resending — and
an **invalid signature returns `400`, not `401`** (a `401` on some platforms triggers auth-style
retries; a `400` says "malformed, don't bother").

```js
// src/webhooks/routes.js — mounted at /api/webhooks with express.raw upstream (see §1).
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { logger } from '../lib/logger.js';
import { getProvider } from './providers.js';

const router = Router();

// Per-IP cap: real providers send from known ranges at modest rates; this blunts a flood of
// forged requests before they reach the (cheap but non-zero) HMAC computation. It is defence in
// depth only — the signature check is the real authenticator. Skipped in test.
// ipKeyGenerator normalises IPv6 to a /56 subnet so a rotating-suffix IPv6 host can't bypass it.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 240, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => ipKeyGenerator(req.ip),
});

router.post('/:provider', webhookLimiter, async (req, res) => {
  const provider = getProvider(req.params.provider);
  if (!provider) return res.status(404).json({ error: 'unknown webhook source' }); // allowlist

  // req.body is the raw Buffer from express.raw. A missing/empty body is a malformed request.
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'empty body' });
  }

  const result = provider.verify({ rawBody: req.body, headers: req.headers, secret: provider.secret });
  if (!result.ok) {
    // Log the rejection reason (never the body or secret) — forged/misconfigured traffic must be
    // visible. 400, not 401: signals "do not retry", and never implies a valid auth challenge.
    logger.warn({ provider: req.params.provider, reason: result.reason, ip: req.ip }, 'webhook rejected');
    return res.status(400).json({ error: 'invalid signature' });
  }

  try {
    const { stored } = await db.enqueueWebhook({
      provider: req.params.provider,
      eventId: result.eventId,
      eventType: result.type,
      signatureTs: result.signatureTs, // the SIGNED timestamp — drives replay-window pruning (§7)
      payload: req.body.toString('utf8'), // the verified raw JSON, stored for out-of-band handling
    });
    // 2xx for BOTH the fresh store and the duplicate — a duplicate is idempotent success, and
    // acking it stops the provider from resending. Processing happens later, off this request.
    if (!stored) logger.info({ provider: req.params.provider, eventId: result.eventId }, 'webhook duplicate acked');
    return res.status(200).json({ received: true });
  } catch (err) {
    // Persist failed → return 5xx so the provider RETRIES (the one case we WANT a retry: we have
    // a valid event but failed to durably record it). Do not swallow it into a 200.
    logger.error({ err, provider: req.params.provider }, 'webhook enqueue failed');
    return res.status(503).json({ error: 'temporarily unavailable' });
  }
});

export default router;
```

Rationale: fast, deterministic acks; the only `5xx` is the one that should provoke a retry.

## 7. Async processing — drain the outbox, idempotently, reconciling against your own records

A single-flight loop (a periodic tick, or a `setImmediate` kick after each enqueue) claims pending
rows and dispatches by `event_type`. **Claim-before-work** (`status='processing'` guarded on
`status='pending'`) prevents two workers double-processing under [cluster-scaling.md](cluster-scaling.md).
Crucially, handlers **never trust amounts/status from the payload** — they re-fetch from the
provider or reconcile against the local record, then apply the effect through the same
guarded/idempotent path as any money mutation ([transaction-endpoints.md](transaction-endpoints.md)).

```js
// src/webhooks/processor.js — drains webhook_events. Runs in ONE place (primary or a single worker).
import * as db from '../db/index.js';
import { logger } from '../lib/logger.js';

const HANDLERS = {
  'payment_intent.succeeded': async (event) => {
    // NEVER read event.data.object.amount and credit it. The payload is authenticated as "Stripe
    // sent this", NOT as "these numbers are final/current". Reconcile against OUR order record and,
    // for high-value flows, re-fetch the object from the provider API before applying any effect.
    const paymentId = event.data.object.id;
    const order = await db.get('SELECT id, amount_cents, status FROM orders WHERE payment_id = ?', [paymentId]);
    if (!order) { logger.warn({ paymentId }, 'webhook for unknown order'); return; }
    // Apply via a guarded, idempotent transaction: the WHERE status='pending' clause makes the
    // state transition fire exactly once even if this handler runs twice — it is the authoritative
    // money mutation, so route it through the named worker tx in transaction-endpoints.md for any
    // real balance change. `changes===1` on the first pass, `0` on every retry.
    await db.run(`UPDATE orders SET status='paid' WHERE id = ? AND status='pending'`, [order.id]);
    // ...fulfil, using order.amount_cents (OUR figure), never event's amount.
  },
  // 'email.bounced': async (event) => { /* mark address undeliverable, scoped to our record */ },
};

async function claimBatch(limit = 20) {
  const rows = await db.all(
    `SELECT id, event_type, payload FROM webhook_events WHERE status='pending' ORDER BY id LIMIT ?`, [limit]);
  const claimed = [];
  for (const row of rows) {
    // Atomic claim: only the worker whose UPDATE flips pending→processing owns the row.
    // claimed_at lets the sweep below detect rows stranded by a crash mid-processing.
    const c = await db.run(
      `UPDATE webhook_events SET status='processing', attempts=attempts+1, claimed_at=unixepoch() WHERE id=? AND status='pending'`, [row.id]);
    if (c.changes === 1) claimed.push(row);
  }
  return claimed;
}

export async function drainWebhooks() {
  for (const row of await claimBatch()) {
    try {
      // Own-property guard, same reason as the §2 provider lookup: event_type is provider data,
      // and a raw HANDLERS[...] lookup would resolve inherited keys like "constructor" to a
      // callable non-handler.
      const handler = Object.prototype.hasOwnProperty.call(HANDLERS, row.event_type)
        ? HANDLERS[row.event_type] : null;
      if (handler) await handler(JSON.parse(row.payload));
      // Unknown event types are a normal, expected no-op — mark done so we stop reconsidering them.
      await db.run(`UPDATE webhook_events SET status='done', processed_at=unixepoch() WHERE id=?`, [row.id]);
    } catch (err) {
      // Back to 'failed' (a sweep can retry with backoff); record the error, never the payload.
      await db.run(`UPDATE webhook_events SET status='failed', last_error=? WHERE id=?`,
        [String(err?.message ?? err).slice(0, 500), row.id]);
      logger.error({ err, webhookId: row.id, type: row.event_type }, 'webhook handler failed');
    }
  }
}
```

Schedule `drainWebhooks()` on a short interval (e.g. `setInterval(drainWebhooks, 2_000).unref()`) in
exactly one process — under clustering, only the primary or a designated worker, so the claim step is
the sole concurrency guard you rely on. A separate periodic sweep re-queues `status='failed'` rows
(bounded by `attempts`, so a poison event stops retrying), resets rows stuck in `processing` whose
`claimed_at` is more than a few minutes old back to `pending` (same `attempts` bound — a crash
between claim and done would otherwise strand a verified event forever; handler idempotency is what
makes the re-run safe), and prunes old `done` rows past the replay window (`signature_ts` < now −
tolerance) so the idempotency cache stays small. Pruning at the tolerance boundary is safe: a replay
of an already-pruned event re-arrives with its original signed `t`, which is now older than the
tolerance, so §3 rejects it before it ever reaches the dedupe insert — there is no window in which a
pruned event can be replayed as fresh.

## 8. Checklist

- Raw body captured with `express.raw` BEFORE `express.json` — signature computed over exact bytes.
- Route mounted BEFORE `cookieParser`/`csrfProtection` — webhooks are cookieless and not CSRF-scoped.
- Signature compared with `crypto.timingSafeEqual`; verify-THEN-parse; only `v1` accepted; support multiple `v1` for rotation.
- Timestamp tolerance rejects stale requests; `UNIQUE(provider,event_id)` rejects duplicates within it.
- Provider `:name` checked against a frozen allowlist via `hasOwnProperty`; unknown source → 404, no crypto run.
- Ack `2xx` fast (fresh AND duplicate); only a durable-store failure returns `5xx` to force a retry.
- Business effects run async, are idempotent, and reconcile against your OWN record / a re-fetch —
  amounts and state from the payload are never trusted directly (see [transaction-endpoints.md](transaction-endpoints.md)).
- Never log the payload, headers, or the signing secret ([observability.md](observability.md)).

## New env vars

Add to `.env.example` and the zod object in `src/lib/env.js` (see [env-and-secrets.md](env-and-secrets.md)).
Each is provider-issued; keep it in the secret manager, never inline, never logged:

```ini
# Webhook signing secret from the provider dashboard (e.g. Stripe "whsec_..."). One per source.
STRIPE_WEBHOOK_SECRET=CHANGE_ME
# POSTMARK_WEBHOOK_SECRET=CHANGE_ME
```

```js
// src/lib/env.js — inside EnvSchema (validated at boot; a missing secret fails fast, never leaks).
STRIPE_WEBHOOK_SECRET: z.string().min(1),
// POSTMARK_WEBHOOK_SECRET: z.string().min(1).optional(),
```
