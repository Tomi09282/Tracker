# Auth email flows

Why this design: every email flow here is the **same primitive** as the refresh token in
[auth-blueprint.md](auth-blueprint.md) — a 32-byte opaque secret whose **hash** is stored, that is
**consumed atomically** by a conditional UPDATE (the UPDATE is the arbiter, so two racing requests
can never both succeed), and that is **single-use with a short expiry**. Reuse `newRefreshToken()`
and `hashToken()` verbatim; do not invent a second token scheme. The raw token travels only in the
emailed link; the DB holds `sha256(token)` so a database leak yields nothing usable. Enumeration
resistance is a first-class requirement: forgot-password and magic-start **always return 200**.

Packages: same as auth (`jose`, `argon2`, `express-rate-limit`, `zod`) plus your mailer. Email
sending is abstracted as `sendMail({ to, subject, text })` — wire it to your provider; it must
never log the raw token or link. All snippets below live in `src/auth/routes.js` and share its
imports: `import * as db from '../db/index.js';`, `import { z } from 'zod';`,
`import argon2 from 'argon2';`, `import rateLimit, { ipKeyGenerator } from 'express-rate-limit';`,
`import { randomUUID } from 'node:crypto';`, plus the helpers named at each use site.

## Schema (add to src/db/schema.sql)

`schema.sql` is re-exec'd on every boot via `db.migrate()` ([db-layer.md](db-layer.md)), and SQLite
has no `ADD COLUMN IF NOT EXISTS` — a bare `ALTER TABLE` would throw "duplicate column" on the
second start. So add `email_verified` to the `users` **CREATE TABLE** in
[auth-blueprint.md](auth-blueprint.md) (default 0 = unverified), not as a repeatable ALTER. On an
already-populated production DB, apply it via the `PRAGMA user_version` numbered-migration path from
[db-migrations-backups.md](db-migrations-backups.md) instead.

```sql
-- users gains: email_verified INTEGER NOT NULL DEFAULT 0  (add to its CREATE TABLE, see above)

-- Every table below is the same shape: hash of a single-use secret + owner + expiry + consume marker.
-- token_hash is the PK so the atomic consume is an indexed single-row UPDATE.
CREATE TABLE IF NOT EXISTS email_verifications (
  token_hash TEXT PRIMARY KEY,          -- sha256(token); raw token only ever in the email
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,                  -- set on use; a consumed token must never work again
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_emailverif_user ON email_verifications(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_resets(user_id);

CREATE TABLE IF NOT EXISTS magic_links (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ua_hash TEXT,                         -- sha256(User-Agent); same browser must consume (see note)
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_magiclinks_user ON magic_links(user_id);

CREATE TABLE IF NOT EXISTS invites (
  token_hash TEXT PRIMARY KEY,
  inviter_id INTEGER NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,                  -- normalized; the invite proves control of THIS address
  role TEXT NOT NULL DEFAULT 'user',
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
```

Reused helpers from [auth-blueprint.md](auth-blueprint.md): `newRefreshToken()` (32-byte base64url),
`hashToken()` (sha256 hex), `issueSession()`, `invalidateSvCache()`, `ARGON2_OPTS`, and the shared
`email` piece from [input-validation.md](input-validation.md). TTLs live next to the token helpers:

```js
// src/auth/tokens.js — email-flow lifetimes (short: these links land in inboxes).
export const VERIFY_TTL_SEC = 24 * 60 * 60; // 24 h — first email can sit unread a while
export const RESET_TTL_SEC = 15 * 60;       // 15 min — reset must be fresh
export const MAGIC_TTL_SEC = 10 * 60;       // 10 min — one login attempt
export const INVITE_TTL_SEC = 7 * 24 * 60 * 60;
```

## Rate limiting — two layers on every route, per the auth house pattern

[auth-blueprint.md](auth-blueprint.md) never protects a public auth route with a per-account limiter
**alone**: `login`/`register` carry a per-IP limiter (`loginLimiter`) *and* a per-account one
(`emailLimiter`). Email flows need the same discipline, and for the send routes the per-IP layer is
not optional — a purely email-keyed limiter hands every distinct address its own fresh budget, so
one attacker from one source can walk a victim list and trigger an unbounded number of outbound
mails (email-bombing, provider-cost amplification, enumeration at scale). The per-IP ceiling caps
total activity per source no matter how many addresses it cycles. The authenticated `/invites`
route keys on the admin's user id instead — the per-user pattern in
[rate-limiting-and-abuse.md](rate-limiting-and-abuse.md).

The **consume** routes (`verify`, `reset`, `magic/verify`, `accept-invite`) carry no email in the
body — the token is the identifier — so they get a per-IP limiter. The token is 256-bit, so brute
force is hopeless, but the ceiling still matters: the per-endpoint gate in
[security-checklist.md](security-checklist.md) requires every route to be limited, and
`/accept-invite` runs an argon2 hash per request, so an unbounded consume route there is a straight
CPU-exhaustion DoS.

```js
const skipInTest = () => process.env.NODE_ENV === 'test';

// ipKeyGenerator subnet-masks IPv6 so a client can't rotate addresses out of its bucket;
// express-rate-limit v8.2+ hard-fails at startup on a raw req.ip keyGenerator
// (see rate-limiting-and-abuse.md).
const perIp = (prefix, limit) => rateLimit({
  windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, skip: skipInTest,
  keyGenerator: (req) => `${prefix}:${ipKeyGenerator(req.ip)}`,
});
// Per-account bucket, layered UNDER the per-IP one. Key on the CANONICAL email so casing/whitespace
// can't split one account into several buckets.
const perEmail = (prefix, limit) => rateLimit({
  windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, skip: skipInTest,
  keyGenerator: (req) => `${prefix}:${canonicalizeEmail(req.body?.email ?? '')}`,
});

// Send routes: per-IP ceiling + per-account bucket (order: broad limiter first).
const resendIpLimiter     = perIp('resend-ip', 20);  const resendLimiter     = perEmail('resend', 3);
const forgotIpLimiter     = perIp('forgot-ip', 20);  const forgotLimiter     = perEmail('forgot', 5);
const magicStartIpLimiter = perIp('magic-ip', 20);   const magicStartLimiter = perEmail('magic', 5);
// Consume routes: per-IP only (no email in the body — the token IS the identifier).
const verifyLimiter      = perIp('verify', 30);
const resetLimiter       = perIp('reset', 30);
const magicVerifyLimiter = perIp('magic-verify', 30);
const acceptLimiter      = perIp('accept', 10);      // tighter: this route runs argon2 per request
// Authenticated send route: /invites keys on the admin's user id (it mounts AFTER requireAuth, so
// req.user is set) — every hit costs an outbound email, so it still needs a ceiling.
const inviteCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, skip: skipInTest,
  keyGenerator: (req) => `invite:user:${req.user.id}`,
});
```

## Email normalization — the shared identifier rule (do this FIRST)

Email is the login identifier across every flow, so normalization must happen **before** hashing,
blind-indexing, uniqueness checks, and ban/suppression lookups — otherwise `User@x.com` and
`user@x.com` become two accounts and one can bypass a suppression the other is under. **Do not
invent a second rule here**: register in [auth-blueprint.md](auth-blueprint.md) stores the address
through the shared `email` piece (`z.string().trim().toLowerCase()...` in
[input-validation.md](input-validation.md)), which is **trim + lowercase only**. Every lookup below
must normalize the SAME way, or it will miss the stored row.

```js
// src/lib/email.js — ONE canonical form, IDENTICAL to the schemas.js `email` piece's normalization.

// Canonical form = the exact transform the shared `email` schema applies before it hits the DB:
// trim + lowercase. Nothing more — so a lookup here always matches what register wrote.
export function canonicalizeEmail(raw) {
  return String(raw).trim().toLowerCase();
}

// OPTIONAL, provider-specific aliasing (plus-tag / Gmail-dot folding) is a SEPARATE policy: folding
// a.b+tag@gmail.com -> ab@gmail.com collapses aliases into one identity (good for ban evasion, bad
// if users rely on plus-tags). If you adopt it you MUST also fold at REGISTER time (fork the shared
// `email` piece), or stored rows and lookups diverge. Left off by default precisely so the two
// stay in lockstep.
```

If you adopt the **encrypted** email column, the blind index — a deterministic keyed HMAC of the
canonical email stored in a `UNIQUE` `email_bi` column — is what keeps the ciphertext searchable
and unique: you cannot `UNIQUE`-constrain the AEAD ciphertext itself (a fresh random nonce changes
the bytes every write), and HMAC (not bare sha256) means an attacker who dumps the DB cannot
confirm a guessed address without the key. Do **not** define a helper for it here: use the one
`blindIndex()` in `src/lib/pii.js` ([security-privacy-pii.md](security-privacy-pii.md)) — it
already applies the same trim+lowercase normalization and keys off `BLIND_INDEX_KEY`, the single
blind-index key the central schema in [config-and-topology.md](config-and-topology.md) defines.
One helper, one env var.

Uniqueness & soft-delete interaction (the constraint the PII item leaves unstated):

- With a **plaintext** `email` column, enforce case-insensitivity by storing the canonical form and
  a plain `UNIQUE(email)` — canonicalization already did the case-folding, so no `COLLATE NOCASE`
  guesswork and no way for two casings to slip through.
- With an **encrypted** email column you **cannot** `UNIQUE` the ciphertext; put
  `UNIQUE(email_bi)` on the blind index and treat that as the identity constraint. All lookups
  (`login`, `forgot`, `magic/start`, invite) query by `email_bi = ?`, never by ciphertext.
- Soft delete (`deleted_at`) + reusable emails: a plain `UNIQUE` blocks re-registering a deleted
  user's address. Use a **partial unique index** so only LIVE rows collide, letting the address be
  re-registered after deletion while active accounts stay unique — the same
  `ux_users_email_live` index [data-search-and-patterns.md](data-search-and-patterns.md) defines:
  `CREATE UNIQUE INDEX ux_users_email_live ON users(email) WHERE deleted_at IS NULL;`
  (swap `email` for `email_bi` with the encrypted column). Ban/suppression lists, by contrast, key
  on the canonical email (or blind index) **without** the `deleted_at` filter so a ban survives
  account deletion.

The snippets below query `WHERE email = ?` for readability, assuming a plaintext canonical column;
if you adopt the encrypted column, swap each to `WHERE email_bi = ?` with
`blindIndex(emailCanon)`. If you carry a soft-delete flag, add `AND deleted_at IS NULL` to
every user lookup below, so a deleted account can be neither reset into nor magic-linked into.

## Email verification (tokenized, single-use, hashed)

On `/register`, mint a token, store only its hash, email the raw link. A separate endpoint consumes
it with the same atomic conditional UPDATE as the refresh arbiter.

```js
import { newRefreshToken, hashToken, VERIFY_TTL_SEC } from './tokens.js';
import { sendMail } from '../lib/mailer.js';
import { canonicalizeEmail } from '../lib/email.js';
import { email as emailPiece } from '../lib/schemas.js';
import { env } from '../lib/env.js';

// Call after the register INSERT that returns a user id.
async function sendVerificationEmail(userId, toEmail) {
  const token = newRefreshToken();               // 32-byte base64url — same primitive as refresh
  await db.run(
    `INSERT INTO email_verifications (token_hash, user_id, expires_at)
     VALUES (?, ?, unixepoch() + ?)`,
    [hashToken(token), userId, VERIFY_TTL_SEC]
  );
  const link = `${env.APP_ORIGIN}/verify?token=${token}`; // raw token ONLY here, never logged
  await sendMail({ to: toEmail, subject: 'Verify your email', text: `Confirm: ${link}` });
}

const VerifySchema = z.object({ token: z.string().min(1).max(256) }).strict();

router.post('/verify-email', verifyLimiter, async (req, res, next) => {
  try {
    const { token } = VerifySchema.parse(req.body);
    const tokenHash = hashToken(token);
    // Read the owner BEFORE consuming: the maintenance purge deletes consumed rows, so a SELECT
    // after the UPDATE can race it and find nothing (a 500 on a legitimate click). The conditional
    // UPDATE below is still the only arbiter — this read decides nothing.
    const row = await db.get(
      'SELECT user_id FROM email_verifications WHERE token_hash = ?', [tokenHash]);
    if (!row) return res.status(400).json({ error: 'invalid or expired token' });
    // Atomic consume — identical arbiter to refresh: the WHERE clause is the lock, so a double
    // click / replay changes exactly zero or one row. Expiry is checked in the same statement.
    const consumed = await db.run(
      `UPDATE email_verifications SET consumed_at = unixepoch()
       WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > unixepoch()`,
      [tokenHash]
    );
    if (consumed.changes === 0) return res.status(400).json({ error: 'invalid or expired token' });
    await db.run('UPDATE users SET email_verified = 1 WHERE id = ?', [row.user_id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const EmailOnlySchema = z.object({ email: emailPiece }).strict(); // shared piece: trim+lowercase+format

// Rate-limited resend — per-IP ceiling + per-account bucket. Never reveals whether the email exists
// or is already verified.
router.post('/resend-verification', resendIpLimiter, resendLimiter, async (req, res, next) => {
  try {
    const emailCanon = EmailOnlySchema.parse(req.body).email; // already normalized by the piece
    const user = await db.get(
      'SELECT id, email, email_verified FROM users WHERE email = ?', [emailCanon]);
    if (user && !user.email_verified) await sendVerificationEmail(user.id, user.email);
    res.json({ ok: true }); // uniform 200 regardless — no enumeration signal
  } catch (err) { next(err); }
});
```

Gate sensitive routes on the flag (or gate login itself, if your product requires it):

```js
export const requireVerified = async (req, res, next) => {
  const row = await db.get('SELECT email_verified FROM users WHERE id = ?', [req.user.id]);
  if (!row?.email_verified) return res.status(403).json({ error: 'email not verified' });
  next();
};
```

## Password reset (single-use, family-revoking, sv bump)

Forgot-password **always** returns 200. Reset verifies the token, re-hashes the password, then in
**one** `db.writeTx` updates the hash, bumps `session_version`, revokes every refresh family, and
deletes the user's other outstanding reset tokens and magic links — so completing a reset locks
every (possibly attacker-held) old credential out everywhere, not just the sessions.

```js
import { RESET_TTL_SEC } from './tokens.js';
import { email as emailPiece, password as passwordPiece } from '../lib/schemas.js';

const ForgotSchema = z.object({ email: emailPiece }).strict();

router.post('/forgot-password', forgotIpLimiter, forgotLimiter, async (req, res, next) => {
  try {
    const emailCanon = ForgotSchema.parse(req.body).email;
    const user = await db.get('SELECT id, email FROM users WHERE email = ?', [emailCanon]);
    if (user) {
      const token = newRefreshToken();
      await db.run(
        `INSERT INTO password_resets (token_hash, user_id, expires_at)
         VALUES (?, ?, unixepoch() + ?)`,
        [hashToken(token), user.id, RESET_TTL_SEC]
      );
      const link = `${env.APP_ORIGIN}/reset?token=${token}`;
      await sendMail({ to: user.email, subject: 'Reset your password', text: `Reset: ${link}` });
    }
    // ALWAYS 200 whether or not the user exists — the status code carries no signal. Note a real
    // send does extra work (INSERT + provider call) the empty branch skips, so timing is not
    // perfectly uniform; enqueue the mail on a background queue (return before it is sent) to shrink
    // that gap. The two rate limits above are the primary enumeration defense.
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const ResetSchema = z.object({
  token: z.string().min(1).max(256),
  password: passwordPiece, // reuse the register policy (min length + class mix)
}).strict();

router.post('/reset-password', resetLimiter, async (req, res, next) => {
  try {
    const body = ResetSchema.parse(req.body);
    const tokenHash = hashToken(body.token);
    // Read the owner BEFORE consuming (purge race — see /verify-email); the UPDATE stays the arbiter.
    const row = await db.get(
      'SELECT user_id FROM password_resets WHERE token_hash = ?', [tokenHash]);
    if (!row) return res.status(400).json({ error: 'invalid or expired token' });
    // Atomic single-use consume FIRST — reject before doing the expensive argon2 hash on a
    // dead/replayed token (cheap-reject-before-costly-work also blunts a hash-CPU DoS).
    const consumed = await db.run(
      `UPDATE password_resets SET consumed_at = unixepoch()
       WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > unixepoch()`,
      [tokenHash]
    );
    if (consumed.changes === 0) return res.status(400).json({ error: 'invalid or expired token' });
    const passwordHash = await argon2.hash(body.password, ARGON2_OPTS);
    // One transaction: set the new hash, bump sv (kills live access tokens within a cache TTL),
    // revoke ALL refresh families (kills every live session, incl. a thief's), and delete the
    // user's other outstanding email-flow tokens — an unconsumed reset token or magic link is a
    // live credential that would otherwise survive the reset for its remaining TTL.
    await db.writeTx([
      { sql: 'UPDATE users SET password_hash = ? WHERE id = ?', params: [passwordHash, row.user_id] },
      { sql: 'UPDATE users SET session_version = session_version + 1 WHERE id = ?', params: [row.user_id] },
      { sql: 'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', params: [row.user_id] },
      { sql: 'DELETE FROM password_resets WHERE user_id = ?', params: [row.user_id] },
      { sql: 'DELETE FROM magic_links WHERE user_id = ?', params: [row.user_id] },
    ]);
    invalidateSvCache(row.user_id); // otherwise old access tokens keep their old sv for up to 30 s
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

## Magic-link (passwordless email) login

Start always returns 200; verify consumes atomically and calls `issueSession()`. Bind the token
loosely to the requesting browser so an intercepted link is harder to redeem elsewhere.

```js
import { MAGIC_TTL_SEC } from './tokens.js';
const uaHash = (ua) => hashToken(ua ?? '');

router.post('/magic/start', magicStartIpLimiter, magicStartLimiter, async (req, res, next) => {
  try {
    const emailCanon = EmailOnlySchema.parse(req.body).email;
    const user = await db.get('SELECT id, email FROM users WHERE email = ?', [emailCanon]);
    if (user) {
      const token = newRefreshToken();
      await db.run(
        `INSERT INTO magic_links (token_hash, user_id, ua_hash, expires_at)
         VALUES (?, ?, ?, unixepoch() + ?)`,
        [hashToken(token), user.id, uaHash(req.get('User-Agent')), MAGIC_TTL_SEC]
      );
      const link = `${env.APP_ORIGIN}/magic?token=${token}`;
      await sendMail({ to: user.email, subject: 'Your login link', text: `Sign in: ${link}` });
    }
    res.json({ ok: true }); // uniform 200 — no enumeration
  } catch (err) { next(err); }
});

const MagicVerifySchema = z.object({ token: z.string().min(1).max(256) }).strict();

router.post('/magic/verify', magicVerifyLimiter, async (req, res, next) => {
  try {
    const { token } = MagicVerifySchema.parse(req.body);
    const tokenHash = hashToken(token);
    // Read the owner BEFORE consuming (purge race — see /verify-email); the UPDATE stays the arbiter.
    const row = await db.get('SELECT user_id FROM magic_links WHERE token_hash = ?', [tokenHash]);
    if (!row) return res.status(400).json({ error: 'invalid or expired link' });
    // Atomic consume; the UA hash is part of the WHERE so a link opened in a different browser
    // fails to redeem — a LOOSE binding that blunts link interception without breaking the common
    // "click on the same device" path. (Don't bind IP: mobile networks change it mid-flow.) The
    // ua_hash test is a SQLite equality on a NON-secret hash, not a JS compare of a secret — no
    // timing oracle, and the 256-bit token is the secret doing the real work.
    const consumed = await db.run(
      `UPDATE magic_links SET consumed_at = unixepoch()
       WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > unixepoch()
         AND (ua_hash IS NULL OR ua_hash = ?)`,
      [tokenHash, uaHash(req.get('User-Agent'))]
    );
    if (consumed.changes === 0) return res.status(400).json({ error: 'invalid or expired link' });
    // Re-read fresh; if you carry a soft-delete/ban flag, filter it here (AND deleted_at IS NULL) so
    // a link minted before a ban/deletion cannot mint a live session after it.
    const user = await db.get('SELECT * FROM users WHERE id = ?', [row.user_id]);
    if (!user) return res.status(400).json({ error: 'invalid or expired link' });
    // A successful magic login also proves email control — mark verified if it wasn't.
    if (!user.email_verified) await db.run('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
    // issueSession signature (auth-blueprint): (res, user, familyId, familyCreatedAt, userAgent).
    await issueSession(res, user, randomUUID(), Math.floor(Date.now() / 1000), req.get('User-Agent'));
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

## Invite / onboarding (tokenized, role-scoped)

Admin-only creation with a **DB role re-check** (the blueprint's critical-op rule: the JWT role is a
hint, the DB is the truth). Registration via the invite pre-fills and **locks** the email, applies
the invited role, and sets `email_verified = 1` immediately — the invite email already proved
control of that address.

```js
import { requireAuth, requireRole } from './middleware.js';
import { INVITE_TTL_SEC } from './tokens.js';
import { email as emailPiece, password as passwordPiece } from '../lib/schemas.js';

const InviteSchema = z.object({
  email: emailPiece,
  role: z.enum(['user', 'admin']).default('user'),
}).strict();

// requireRole is the fast gate; the DB re-check below is the real authority check for a
// privilege-granting operation (a stale JWT must not be able to mint admin invites).
// inviteCreateLimiter sits AFTER requireAuth so req.user is populated for its keyGenerator.
router.post('/invites', requireAuth, requireRole('admin'), inviteCreateLimiter, async (req, res, next) => {
  try {
    const admin = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (admin?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    const body = InviteSchema.parse(req.body);
    const emailCanon = body.email; // shared piece already normalized it
    const token = newRefreshToken();
    await db.run(
      `INSERT INTO invites (token_hash, inviter_id, email, role, expires_at)
       VALUES (?, ?, ?, ?, unixepoch() + ?)`,
      [hashToken(token), req.user.id, emailCanon, body.role, INVITE_TTL_SEC]
    );
    const link = `${env.APP_ORIGIN}/accept-invite?token=${token}`;
    await sendMail({ to: emailCanon, subject: "You're invited", text: `Join: ${link}` });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

const AcceptInviteSchema = z.object({
  token: z.string().min(1).max(256),
  password: passwordPiece,
}).strict();

// acceptLimiter (per-IP) is load-bearing, not cosmetic: this route is UNAUTHENTICATED and runs an
// argon2id hash on every request BEFORE the token is validated (the hash must exist to INSERT the
// user inside the atomic tx, so it cannot be deferred like reset's). Without a ceiling, an attacker
// replaying bogus tokens turns each request into a full argon2 hash — a CPU-exhaustion DoS. The
// limiter is that ceiling; the worker still consumes the token before it inserts, so a losing or
// replayed request leaves no account behind.
router.post('/accept-invite', acceptLimiter, async (req, res, next) => {
  try {
    const body = AcceptInviteSchema.parse(req.body);
    const passwordHash = await argon2.hash(body.password, ARGON2_OPTS); // hash outside the tx
    // Consume + create atomically in ONE worker transaction that branches on the consume's row
    // count. This CANNOT be a db.writeTx: writeTx runs every step and commits before you can inspect
    // a result, so a no-op consume (replay) or a taken email would leave the INSERT to run or throw
    // AFTER the fact — exactly the mid-transaction branching that named worker txs exist for
    // (transaction-endpoints.md). See acceptInvite() below.
    const result = await db.acceptInvite({ tokenHash: hashToken(body.token), passwordHash });
    if (result.outcome === 'expired') return res.status(400).json({ error: 'invalid or expired invite' });
    if (result.outcome === 'used')    return res.status(409).json({ error: 'invite already used' });
    if (result.outcome === 'taken')   return res.status(409).json({ error: 'email already registered' });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});
```

Named worker transaction (add to `src/db/worker.js`, export from `src/db/index.js` like the
`transfer()` example in [transaction-endpoints.md](transaction-endpoints.md)) — the conditional
consume is the guard, so two concurrent accepts (or a replay) can never both create an account:

```js
// src/db/worker.js
export function acceptInvite({ tokenHash, passwordHash }) {
  const tx = getDb().transaction(() => {
    // Look the row up WITHOUT the consume filters so a replay ('used') is distinguishable from a
    // bad/expired token; the conditional UPDATE below is still the only arbiter.
    const invite = stmt(
      `SELECT email, role, consumed_at, (expires_at > unixepoch()) AS live
       FROM invites WHERE token_hash = ?`
    ).get(tokenHash);
    if (!invite || !invite.live) return { outcome: 'expired' };
    if (invite.consumed_at) return { outcome: 'used' };
    // The consume IS the arbiter: WHERE re-checks unconsumed+unexpired inside the tx.
    const consumed = stmt(
      `UPDATE invites SET consumed_at = unixepoch()
       WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > unixepoch()`
    ).run(tokenHash);
    if (consumed.changes === 0) return { outcome: 'used' }; // lost a race -> no account
    // email is LOCKED to the invite value (client never supplies it); email_verified = 1.
    // Let a UNIQUE violation THROW: better-sqlite3 rolls a transaction back only when an exception
    // escapes the transaction function — catching it in here and returning would COMMIT the consume
    // above and burn the invite on a mere email conflict.
    stmt(`INSERT INTO users (email, password_hash, role, email_verified)
          VALUES (?, ?, ?, 1)`).run(invite.email, passwordHash, invite.role);
    return { outcome: 'created' };
  });
  try {
    return tx.immediate();
  } catch (e) {
    // Rolled back: the invite is NOT consumed, so it stays redeemable once the conflict is resolved.
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return { outcome: 'taken' };
    throw e;
  }
}
```

## Maintenance

- Purge consumed/expired token rows periodically (same job as the refresh purge):
  `DELETE FROM email_verifications WHERE expires_at <= unixepoch() OR consumed_at IS NOT NULL;`
  repeat for `password_resets`, `magic_links`, `invites`.
- Never log a raw token or link; log only `{ userId, flow }` on send and `{ userId, flow, outcome }`
  on consume. A token in a log line is a plaintext credential.
- Env vars this file uses: `APP_ORIGIN` (link base); the encrypted-email option additionally uses
  `BLIND_INDEX_KEY` via the shared `blindIndex()` helper
  ([security-privacy-pii.md](security-privacy-pii.md)). Both are owned by the central zod schema in
  [config-and-topology.md](config-and-topology.md); reference them via `env.*`, don't re-declare
  them here. Rotating `BLIND_INDEX_KEY` requires re-indexing every email row, so treat it like the
  DB key.
- Every route here is behind a rate limiter — send routes carry a per-IP ceiling **plus** a
  per-account bucket (the auth house pattern); the authenticated `/invites` carries a per-admin
  (per-user) limiter; consume routes carry a per-IP limiter, which is load-bearing on
  `/accept-invite` because of its unauthenticated argon2. The per-endpoint gate in
  [security-checklist.md](security-checklist.md) requires this on every route.
- Enumeration parity: `/forgot-password`, `/magic/start`, `/resend-verification` all return an
  unconditional 200. The status code leaks nothing; timing still can (the "user exists" branch does
  an extra INSERT + provider call). Enqueue the send so the response returns before the mail goes
  out, and keep the lookup a single indexed query, to shrink the residual timing signal — the
  per-IP + per-account rate limits remain the primary defense.
