# Critical / transactional endpoints — money, inventory, irreversible state

**Threat model: the attacker fully controls the HTTP request.** Burp Suite, curl, or any proxy
can forge every field, header, cookie, and body. The frontend is user experience,
NEVER a security boundary. The client sends *intent* (ids, quantities); the server computes
every *consequence* (prices, totals, balances, permissions) from server-side data.

## MANDATORY 5-PASS REVIEW

Before shipping ANY endpoint that moves money, inventory, or irreversible state, explicitly walk
these attacks against your own code and state the answer for each. If any answer is uncertain,
fix the code first.

0. **WIRING** (before the five) — is the route actually behind `requireAuth`, the app-level
   `csrfProtection`, and a per-user rate limiter? Is it only reachable over HTTPS in production?
   A perfect handler on a miswired route is still a hole.
1. **FORGE** — change every field and header with a proxy. Can any forged value change money or
   authority beyond the validated bounds? Are unknown fields rejected (`.strict()`)? Is any
   client-sent price/total/role/discount ever believed?
2. **REPLAY** — send the exact same request twice (double click, network retry, replay attack).
   Does exactly ONE effect happen (idempotency key)?
3. **RACE** — send it twice CONCURRENTLY. Can the guard be bypassed? (Read-then-write across
   calls is always a race; the guard must live INSIDE the UPDATE, inside one transaction.)
4. **IDOR** — substitute every id with another user's ids. Is ownership re-checked INSIDE the
   transaction (not just in earlier middleware)? Do error codes avoid confirming what exists?
5. **EXTREMES** — negative, zero, maximum, fractional, overflowing values; huge strings; and
   unit/currency confusion (fillér vs cent, mixed currencies). Are all numbers bounded integers?
   Are all strings length- and regex-bounded?

## Rules

- Money is stored as INTEGER minor units (cents / fillér). Floats are forbidden — 0.1 has no
  exact binary representation.
- zod schemas use `.strict()` (rejects unknown fields — blocks mass assignment), bounded ints
  (`z.number().int().positive().max(...)`), and regex-bounded strings
  (`z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)`).
- Server-side calculation, always: client sends `{ productId, quantity }`; the server reads the
  price from the DB and computes the total. A client-sent `total` field is a bug, full stop.
- Object-level authorization (anti-IDOR): every row read or written is scoped to the caller
  (`WHERE id = ? AND user_id = ?`) — and the check happens inside the transaction (anti-TOCTOU).
- One business operation = ONE named worker transaction function. The generic `writeTx` cannot
  branch on intermediate results; critical logic gets its own function in `src/db/worker.js` so
  guards, branching, and rollback stay inside a single atomic IMMEDIATE transaction.
- Guards live in the UPDATE itself: `UPDATE ... SET balance = balance - ? WHERE id = ? AND
  balance >= ?` then check `changes === 1`. Never SELECT-then-UPDATE across statements without
  the conditional.
- Idempotency: the client sends an `Idempotency-Key` header (random, 16-64 chars). Keys are
  scoped PER USER (`UNIQUE(created_by, idempotency_key)`) — a global namespace would let an
  attacker squat a victim's predictable keys. A replay with the same key returns the ORIGINAL
  result without re-executing; the same key with DIFFERENT parameters is rejected.
- Audit trail, two layers: the in-transaction audit row is the financial record of SUCCESSES;
  DENIED attempts (IDOR probing, insufficient funds, key misuse) must be logged OUTSIDE the
  transaction — the rollback erases any in-tx row, and attack probing must never be invisible.
- Session/authority re-checked from the DB INSIDE the transaction for money operations — the
  JWT and the 30 s sv cache are hints; a banned or logged-out-everywhere principal must not be
  able to move money even within a cache window (matters especially under clustering).
- Single-currency template. Multi-currency apps: add a `currency` column to accounts, record it
  on transfers, and assert `from.currency === to.currency` inside the tx — unit confusion is a
  classic value bug.
- Business failures are returned as `{ ok: false, code }` VALUES from the worker, not thrown —
  worker_threads serialization does not reliably preserve custom Error properties across the
  thread boundary. Throwing is reserved for rolling back and for genuine unexpected errors.
- Rate-limit critical endpoints; for very high-value operations require fresh re-authentication
  (password confirm) before executing.

## Schema (add to src/db/schema.sql)

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  params_hash TEXT NOT NULL,            -- sha256 of the parameters; detects key reuse with new params
  from_account INTEGER NOT NULL REFERENCES accounts(id),
  to_account INTEGER NOT NULL REFERENCES accounts(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (created_by, idempotency_key)  -- idempotency is scoped to the caller, never global
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,                 -- JSON snapshot of the operation
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

## Worker transaction (add to src/db/worker.js)

```js
import { createHash } from 'node:crypto';

// Business failures roll the transaction back via throw, but cross the thread boundary as
// plain return values — piscina/worker_threads do not preserve custom Error fields reliably.
class TxError extends Error {
  constructor(code) { super(code); this.txCode = code; }
}

export function transfer({ idempotencyKey, fromAccount, toAccount, amountCents, userId, sv, ip, userAgent }) {
  const paramsHash = createHash('sha256')
    .update(JSON.stringify({ fromAccount, toAccount, amountCents, userId }))
    .digest('hex');

  const tx = getDb().transaction(() => {
    // Money moves only for a LIVE session: re-check the DB inside the tx. The JWT and the 30 s
    // sv cache are hints — a banned / logged-out-everywhere / theft-revoked principal must be
    // stopped here even within a cache window (under clustering each process caches separately).
    const u = stmt('SELECT session_version FROM users WHERE id = ?').get(userId);
    if (!u || u.session_version !== sv) throw new TxError('STALE_SESSION');

    // Idempotent replay: same key + same params -> return the original result, execute nothing.
    // The lookup is scoped to the caller — another user's identical key never interacts.
    const existing = stmt(
      'SELECT id, params_hash FROM transfers WHERE idempotency_key = ? AND created_by = ?'
    ).get(idempotencyKey, userId);
    if (existing) {
      if (existing.params_hash !== paramsHash) throw new TxError('IDEMPOTENCY_MISMATCH');
      return { transferId: existing.id, replayed: true };
    }

    // Ownership INSIDE the transaction: anti-IDOR and anti-TOCTOU in one place.
    if (fromAccount === toAccount) throw new TxError('INVALID');
    const from = stmt('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(fromAccount, userId);
    if (!from) throw new TxError('FORBIDDEN');
    const to = stmt('SELECT id FROM accounts WHERE id = ?').get(toAccount);
    if (!to) throw new TxError('NOT_FOUND');

    // The guard lives in the UPDATE — there is no read-then-write race window, and the
    // CHECK (balance_cents >= 0) constraint is a second net under it.
    const debit = stmt(
      'UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ? AND balance_cents >= ?'
    ).run(amountCents, fromAccount, amountCents);
    if (debit.changes === 0) throw new TxError('INSUFFICIENT');

    const credit = stmt('UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?')
      .run(amountCents, toAccount);
    if (credit.changes !== 1) throw new TxError('NOT_FOUND'); // money must land — never vanish

    const t = stmt(
      `INSERT INTO transfers (idempotency_key, params_hash, from_account, to_account, amount_cents, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(idempotencyKey, paramsHash, fromAccount, toAccount, amountCents, userId);

    stmt(
      `INSERT INTO audit_log (user_id, action, detail, ip, user_agent) VALUES (?, 'transfer', ?, ?, ?)`
    ).run(userId, JSON.stringify({ fromAccount, toAccount, amountCents, idempotencyKey }), ip ?? null, userAgent ?? null);

    return { transferId: Number(t.lastInsertRowid), replayed: false };
  });

  try {
    return { ok: true, ...tx.immediate() };
  } catch (err) {
    if (err instanceof TxError) return { ok: false, code: err.txCode }; // rolled back, expected
    throw err;                                                          // real failure
  }
}
```

Expose it in `src/db/index.js`:

```js
export const transfer = (args) => pool.run(args, { name: 'transfer' });
```

## Route (self-contained module — mount under the app-level csrfProtection)

```js
// src/transfers/routes.js — mount with app.use('/api', transferRoutes) AFTER csrfProtection.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../auth/middleware.js';

const router = Router();

// Per-USER limiter — the route sits behind requireAuth, so key on the account, not the IP.
const transferLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', // never skip in dev/prod; rate limiting gets its own test
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
});

const TransferSchema = z.object({
  fromAccount: z.number().int().positive(),
  toAccount: z.number().int().positive(),
  amountCents: z.number().int().positive().max(100_000_000), // hard business upper bound
}).strict(); // unknown fields are an attack, not a convenience

const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,64}$/;

// Maps worker result codes to HTTP without leaking internals.
const TX_HTTP = {
  STALE_SESSION: [401, 'unauthorized'],
  FORBIDDEN: [403, 'forbidden'],
  NOT_FOUND: [400, 'invalid transfer'],
  INVALID: [400, 'invalid transfer'],
  INSUFFICIENT: [409, 'insufficient funds'],
  IDEMPOTENCY_MISMATCH: [422, 'idempotency key reused with different parameters'],
};

router.post('/transfer', requireAuth, transferLimiter, async (req, res, next) => {
  try {
    const idem = req.get('Idempotency-Key') ?? '';
    if (!IDEMPOTENCY_RE.test(idem)) {
      return res.status(400).json({ error: 'missing or invalid Idempotency-Key' });
    }
    const body = TransferSchema.parse(req.body);
    // The client named accounts and an amount — every consequence is computed server-side.
    const result = await db.transfer({
      idempotencyKey: idem,
      fromAccount: body.fromAccount,
      toAccount: body.toAccount,
      amountCents: body.amountCents,
      userId: req.user.id,
      sv: req.user.sv, // DB-side session re-check happens inside the worker tx
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    if (!result.ok) {
      // Security audit for DENIED attempts lives OUTSIDE the rolled-back money tx —
      // otherwise IDOR/enumeration/key-misuse probing would leave zero trace anywhere.
      logger.warn({
        userId: req.user.id, code: result.code,
        fromAccount: body.fromAccount, toAccount: body.toAccount, amountCents: body.amountCents,
        ip: req.ip,
      }, 'transfer denied');
      const [status, message] = TX_HTTP[result.code] ?? [500, 'internal server error'];
      return res.status(status).json({ error: message });
    }
    res.status(result.replayed ? 200 : 201).json({ transferId: result.transferId });
  } catch (err) { next(err); }
});

export default router;
```

Known residual (documented, not hidden): with sequential integer account ids, the 400-vs-409
distinction lets an attacker with a zero-balance account confirm which destination ids exist.
In production, prefer non-guessable recipient identifiers (random account numbers / handles)
instead of raw integer ids; collapsing the two error responses would also close it but hurts
legitimate users' UX. Pick one deliberately.

## Server-side price calculation (the same principle for shops/orders)

```js
// The client sends intent only:
const OrderSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(1000),
}).strict();

// The server owns the numbers:
const product = await db.get('SELECT price_cents FROM products WHERE id = ?', [body.productId]);
if (!product) return res.status(400).json({ error: 'invalid order' });
const totalCents = product.price_cents * body.quantity; // NEVER read a total from the client
```

## Reads are critical too

Ownership-scope every read of sensitive rows — a leaked balance is also a breach:

```js
const row = await db.get(
  'SELECT id, balance_cents FROM accounts WHERE id = ? AND user_id = ?', [id, req.user.id]);
if (!row) return res.status(404).json({ error: 'not found' }); // 404, not 403: don't confirm existence
```
