# Multi-factor auth

Second factors bolted onto the [auth-blueprint](auth-blueprint.md) flow. Design principle: **a
second factor gates `issueSession()`**. After the argon2 password verify succeeds, if the account
has a second factor enabled we do NOT mint the session — we return a short-lived signed
`mfa_pending` JWT (dedicated audience, ~5 min) and require a second call that proves the factor
before `issueSession()` runs. The pending token is a ticket for step two, not a session: no role,
access to nothing but the verify endpoints.

The DB is encrypted at rest (better-sqlite3-multiple-ciphers), so TOTP secrets and challenges can
sit in a table without extra app-layer crypto; recovery codes are still stored as argon2 **hashes**
because a leaked backup could replay them. WebAuthn public keys are, by definition, public.

Packages: `otplib`, `@simplewebauthn/server`, plus existing `jose`, `argon2`, `zod`. Reuses from
auth-blueprint: `issueSession()`, `hashToken()`, `ARGON2_OPTS`, the `signAccessToken` keyring,
`requireAuth`, `invalidateSvCache`, and `env` from [env-and-secrets](env-and-secrets.md).
**Prerequisite:** two symbols this file imports are currently module-private in auth-blueprint's
`src/auth/routes.js` — `export` them (or lift them into shared modules): `ARGON2_OPTS`, and
`issueSession()` (extract into `src/auth/session.js`, imported as `./session.js` below). Both are
non-security refactors; do them once before wiring MFA.

## Schema (add to src/db/schema.sql)

```sql
CREATE TABLE IF NOT EXISTS user_totp (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,                 -- base32 TOTP secret (DB is encrypted at rest)
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  last_step INTEGER NOT NULL DEFAULT 0  -- highest 30s time-step accepted; blocks in-window replay
);

CREATE TABLE IF NOT EXISTS user_recovery_codes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,              -- argon2id(code); plaintext shown once, never stored
  consumed_at INTEGER                   -- single use: a consumed code must never work again
);
CREATE INDEX IF NOT EXISTS idx_recovery_user ON user_recovery_codes(user_id);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  credential_id TEXT PRIMARY KEY,       -- base64url credential id
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key BLOB NOT NULL,             -- COSE public key bytes (public by definition)
  sign_count INTEGER NOT NULL,          -- monotonic; a regression means a cloned authenticator
  transports TEXT,                      -- JSON array, for UX hints
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(user_id);

-- Server-issued challenges: never trust a client-sent challenge — store what we issued, consume
-- once, expire fast.
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY,                  -- random handle returned to the client
  user_id INTEGER,                      -- null for usernameless login-options
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL,                -- 'register' | 'login'
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
```

## MFA ticket + step-up tokens (src/auth/mfa-tokens.js)

Short-lived signed JWTs that are NOT sessions. Dedicated audiences keep them unusable as access
tokens (`verifyAccessToken` pins audience `app`) and vice versa.

```js
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../lib/env.js';

const ISSUER = 'app';
// Same kid keyring as access tokens (see auth-blueprint.md) so a JWT-secret rotation does not
// silently invalidate in-flight tickets: sign with the current key, verify against either.
const keyring = new Map([[env.JWT_KID, Buffer.from(env.JWT_SECRET, 'base64url')]]);
if (env.JWT_SECRET_PREV && env.JWT_KID_PREV) {
  keyring.set(env.JWT_KID_PREV, Buffer.from(env.JWT_SECRET_PREV, 'base64url'));
}
export const MFA_PENDING_AUD = 'mfa-pending';
export const STEP_UP_AUD = 'step-up';

const sign = (sub, aud, extra = {}) =>
  new SignJWT(extra)
    .setProtectedHeader({ alg: 'HS256', kid: env.JWT_KID })
    .setSubject(String(sub)).setIssuedAt().setIssuer(ISSUER).setAudience(aud)
    .setExpirationTime('5m').sign(keyring.get(env.JWT_KID));
const verify = (token, aud) =>
  jwtVerify(
    token,
    (header) => { const k = keyring.get(header.kid); if (!k) throw new Error('unknown kid'); return k; },
    { algorithms: ['HS256'], issuer: ISSUER, audience: aud }); // pin alg → blocks alg-confusion

export const signMfaPending = (userId) => sign(userId, MFA_PENDING_AUD);
export const verifyMfaPending = (t) => verify(t, MFA_PENDING_AUD);
export const signStepUp = (userId, amr) => sign(userId, STEP_UP_AUD, { amr }); // amr = which factor
export const verifyStepUp = (t) => verify(t, STEP_UP_AUD);

// Cookie names follow the auth-blueprint convention: __Secure- prefix in prod (these scope Path,
// so __Host- is out), plain names in dev where Secure/HTTPS is unavailable.
const prod = env.NODE_ENV === 'production';
export const MFA_PENDING_COOKIE = prod ? '__Secure-mfa_pending' : 'mfa_pending';
export const STEP_UP_COOKIE = prod ? '__Secure-step_up' : 'step_up';
// Set AND clear the pending cookie with these exact attributes. A __Secure- cookie can only be
// deleted by a Set-Cookie that itself satisfies the prefix rules (Secure present) — clearCookie
// with just { path } would be silently dropped by the browser in prod and the ticket would live on.
export const MFA_PENDING_COOKIE_OPTS = { httpOnly: true, secure: prod, sameSite: 'strict', path: '/api/auth' };
```

The `mfa_pending` and `step_up` tokens ride in their own HttpOnly, `SameSite=Strict` cookies with a
short `maxAge` (shown inline below).

---

## TOTP 2FA (authenticator-app second factor) [must]

Rationale: an authenticator code proves possession of the enrolled device, so a leaked password
alone no longer logs anyone in.

`authenticator.checkDelta()` returns the time-step offset of a valid code (`0` current, `±1`
adjacent, `null` invalid). otplib compares the candidate against the generated token with a
**constant-time** equality internally (`@otplib/core` `constantTimeEqual`), so the digit compare
leaks no timing. We convert the delta to an **absolute** step index and persist the highest one
accepted, so the same 6-digit code cannot be replayed within its 30 s window (`check()` alone can't
do this).

```js
// src/auth/totp.js
import { authenticator } from 'otplib';
authenticator.options = { window: 1, step: 30 }; // window:1 = one step of skew each way; keep small

export const newTotpSecret = () => authenticator.generateSecret();      // base32
// keyuri(accountName, issuer, secret) — issuer 'MyApp' is embedded in the otpauth:// URI.
export const totpKeyuri = (email, secret) => authenticator.keyuri(email, 'MyApp', secret);

// Absolute 30s step index of a valid code, or null. Persisting the max makes each code single-use.
export function verifyTotpStep(token, secret) {
  const delta = authenticator.checkDelta(token, secret); // null | -1 | 0 | 1 (window:1)
  return delta === null ? null : Math.floor(Date.now() / 1000 / 30) + delta;
}
```

Enrollment + login worker functions. Activation requires one live code (a mistyped secret can never
lock a user out), and inserts the recovery codes in the SAME tx so enabling 2FA and having fallbacks
are atomic:

```js
// src/db/worker.js
export function activateTotp({ userId, secret, step, recoveryHashes }) {
  getDb().transaction(() => {
    stmt(`INSERT INTO user_totp (user_id, secret, totp_enabled, last_step) VALUES (?, ?, 1, ?)
          ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, totp_enabled = 1, last_step = excluded.last_step`)
      .run(userId, secret, step);
    stmt('DELETE FROM user_recovery_codes WHERE user_id = ?').run(userId); // fresh set on (re)enrol
    for (const h of recoveryHashes)
      stmt('INSERT INTO user_recovery_codes (user_id, code_hash) VALUES (?, ?)').run(userId, h);
  }).immediate();
  return { ok: true };
}

// Consume a login code: the conditional UPDATE is the arbiter — two concurrent verifies with the
// same code cannot both win, and a replayed step (<= last_step) is rejected.
export function consumeTotpStep({ userId, step }) {
  const info = stmt('UPDATE user_totp SET last_step = ? WHERE user_id = ? AND totp_enabled = 1 AND last_step < ?')
    .run(step, userId, step);
  return { accepted: info.changes === 1 };
}
```

Expose in `src/db/index.js`: `export const activateTotp = (a) => pool.run(a, { name: 'activateTotp' });`
and the same for `consumeTotpStep` and (below) `consumeRecoveryRow`.

Login becomes two-step. In `POST /api/auth/login`, after the argon2 verify succeeds, branch on
`totp_enabled` *instead of* calling `issueSession`:

```js
// src/auth/routes.js — inside /login, replacing the unconditional issueSession on success.
// import { signMfaPending, verifyMfaPending, MFA_PENDING_COOKIE, MFA_PENDING_COOKIE_OPTS } from './mfa-tokens.js';
// import { verifyTotpStep } from './totp.js';
const totp = await db.get('SELECT totp_enabled FROM user_totp WHERE user_id = ?', [user.id]);
if (totp?.totp_enabled) {
  res.cookie(MFA_PENDING_COOKIE, await signMfaPending(user.id), {
    ...MFA_PENDING_COOKIE_OPTS, maxAge: 5 * 60 * 1000,
  });
  return res.json({ mfaRequired: true }); // client shows the code / recovery prompt
}
await issueSession(res, user, randomUUID(), Math.floor(Date.now() / 1000), req.get('User-Agent'));
res.json({ ok: true });
```

```js
// src/auth/routes.js — step two. mfaLimiter is a per-IP + per-account rateLimit like loginLimiter.
const TotpVerifySchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

router.post('/mfa/verify', mfaLimiter, async (req, res, next) => {
  try {
    const ticket = req.cookies[MFA_PENDING_COOKIE];
    if (!ticket) return res.status(401).json({ error: 'mfa session expired' });
    // An expired/forged ticket THROWS — catch it locally so the client gets a 401 (back to login),
    // not the central error handler's 500.
    let payload;
    try { ({ payload } = await verifyMfaPending(ticket)); }
    catch { return res.status(401).json({ error: 'mfa session expired' }); }
    const userId = Number(payload.sub);
    const { code } = TotpVerifySchema.parse(req.body);

    const row = await db.get('SELECT secret FROM user_totp WHERE user_id = ? AND totp_enabled = 1', [userId]);
    const step = row ? verifyTotpStep(code, row.secret) : null;
    // consumeTotpStep is the arbiter: it rejects a replayed step atomically in the DB.
    if (step === null || !(await db.consumeTotpStep({ userId, step })).accepted) {
      return res.status(401).json({ error: 'invalid code' });
    }
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(401).json({ error: 'invalid code' });
    res.clearCookie(MFA_PENDING_COOKIE, MFA_PENDING_COOKIE_OPTS);
    await issueSession(res, user, randomUUID(), Math.floor(Date.now() / 1000), req.get('User-Agent'));
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

### Enrollment is step-up-gated

Enrolling a second factor is an account-takeover primitive: an attacker on a borrowed *unlocked*
session who can silently enroll their own authenticator (and grab the recovery codes) owns the
account and locks the victim out. So enrollment is gated the same way disable is — `requireAuth`
**then** `requireStepUp` (defined below). `/mfa/setup` stores a not-yet-enabled secret server-side so
the client can't choose its own; `/mfa/activate` reads it, calls `verifyTotpStep`, generates recovery
codes, and `db.activateTotp(...)`, returning the plaintext codes once.

```js
router.post('/mfa/setup', requireAuth, requireStepUp(), async (req, res, next) => {
  try {
    const secret = newTotpSecret();
    // Guarded upsert: a setup call must never silently downgrade an ACTIVE factor — flipping
    // totp_enabled to 0 here would leave 2FA off if the re-enrol is abandoned. Re-enrolling goes
    // through /mfa/disable first (which demands the factor itself).
    const info = await db.run(
      `INSERT INTO user_totp (user_id, secret, totp_enabled) VALUES (?, ?, 0)
       ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret
       WHERE user_totp.totp_enabled = 0`, [req.user.id, secret]);
    if (info.changes === 0) return res.status(409).json({ error: '2fa already enabled' });
    const user = await db.get('SELECT email FROM users WHERE id = ?', [req.user.id]);
    res.json({ otpauthUri: totpKeyuri(user.email, secret) }); // client renders the QR
  } catch (err) { next(err); }
});

// Activation: one live code proves the secret was scanned correctly, then recovery codes + enable
// land atomically. Also step-up-gated so it shares /mfa/setup's fresh-factor guarantee.
const TotpActivateSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
router.post('/mfa/activate', requireAuth, requireStepUp(), async (req, res, next) => {
  try {
    const { code } = TotpActivateSchema.parse(req.body);
    const row = await db.get('SELECT secret FROM user_totp WHERE user_id = ? AND totp_enabled = 0', [req.user.id]);
    if (!row) return res.status(400).json({ error: 'no pending setup' });
    const step = verifyTotpStep(code, row.secret);
    if (step === null) return res.status(401).json({ error: 'invalid code' });
    const { plain, hashes } = await generateRecoveryCodes();
    await db.activateTotp({ userId: req.user.id, secret: row.secret, step, recoveryHashes: hashes });
    // Enabling a new factor bumps sv so other live sessions must re-validate (cross-cutting note below).
    await db.run('UPDATE users SET session_version = session_version + 1 WHERE id = ?', [req.user.id]);
    invalidateSvCache(req.user.id);
    res.json({ recoveryCodes: plain }); // shown ONCE
  } catch (err) { next(err); }
});
```

---

## TOTP recovery / backup codes [must]

Rationale: a lost phone must not mean a lost account, but backup codes are password-equivalent
bearer secrets — store only argon2 hashes, show plaintext exactly once, burn each on use.

```js
// src/auth/recovery.js
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { ARGON2_OPTS } from './routes.js'; // reuse the SAME params as passwords (export it there)

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 30 symbols, no 0/O/1/I/l ambiguity
// Reject-sampling: 256 % 30 != 0, so a raw byte % 30 biases the low symbols. Discard bytes at or
// above the largest multiple of 30 (240) so every symbol is equiprobable. 10 symbols over a 30-char
// alphabet ≈ 49 bits — single-use and rate-limited, so brute force is infeasible.
const MAX = 256 - (256 % ALPHABET.length); // 240
const oneSymbol = () => {
  for (;;) {
    const b = randomBytes(1)[0];
    if (b < MAX) return ALPHABET[b % ALPHABET.length];
  }
};
const oneCode = () => {
  let s = '';
  for (let i = 0; i < 10; i++) s += oneSymbol();
  return `${s.slice(0, 5)}-${s.slice(5)}`;
};

export async function generateRecoveryCodes(n = 10) {
  const plain = Array.from({ length: n }, oneCode);
  const hashes = await Promise.all(plain.map((c) => argon2.hash(c, ARGON2_OPTS)));
  return { plain, hashes }; // caller shows `plain` ONCE, stores `hashes`
}
```

```js
// src/db/worker.js — mark a specific row consumed iff still unconsumed (the race guard).
export function consumeRecoveryRow({ id }) {
  const info = stmt('UPDATE user_recovery_codes SET consumed_at = unixepoch() WHERE id = ? AND consumed_at IS NULL')
    .run(id);
  return { consumed: info.changes === 1 };
}
```

```js
// src/auth/routes.js — recovery login: same mfa_pending ticket, alternative proof. We argon2-verify
// against every un-consumed hash (no reversible index), then consume the match atomically. The regex
// is intentionally a superset of ALPHABET — a wrong-charset code just fails the hash compare.
const RecoverSchema = z.object({ code: z.string().regex(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/) }).strict();

router.post('/mfa/recover', mfaLimiter, async (req, res, next) => {
  try {
    const ticket = req.cookies[MFA_PENDING_COOKIE];
    if (!ticket) return res.status(401).json({ error: 'mfa session expired' });
    let payload;
    try { ({ payload } = await verifyMfaPending(ticket)); } // throws on expiry → 401, not 500
    catch { return res.status(401).json({ error: 'mfa session expired' }); }
    const userId = Number(payload.sub);
    const { code } = RecoverSchema.parse(req.body);

    const rows = await db.all(
      'SELECT id, code_hash FROM user_recovery_codes WHERE user_id = ? AND consumed_at IS NULL', [userId]);
    let matched = null;
    // Check ALL candidates (no early exit) to avoid a timing signal about which/how-many remain.
    for (const r of rows) if (await argon2.verify(r.code_hash, code)) matched = r.id;
    if (matched === null || !(await db.consumeRecoveryRow({ id: matched })).consumed) {
      return res.status(401).json({ error: 'invalid recovery code' });
    }
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(401).json({ error: 'invalid recovery code' });
    res.clearCookie(MFA_PENDING_COOKIE, MFA_PENDING_COOKIE_OPTS);
    await issueSession(res, user, randomUUID(), Math.floor(Date.now() / 1000), req.get('User-Agent'));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Remaining-count for the settings UI (never returns the codes themselves).
router.get('/mfa/recovery/status', requireAuth, async (req, res, next) => {
  try {
    const row = await db.get(
      'SELECT COUNT(*) AS remaining FROM user_recovery_codes WHERE user_id = ? AND consumed_at IS NULL',
      [req.user.id]);
    res.json({ remaining: row.remaining });
  } catch (err) { next(err); }
});

// Regenerate — revokes the old set in one writeTx. Sensitive → requireStepUp (below).
router.post('/mfa/recovery/regenerate', requireAuth, requireStepUp(), async (req, res, next) => {
  try {
    const { plain, hashes } = await generateRecoveryCodes();
    await db.writeTx([
      { sql: 'DELETE FROM user_recovery_codes WHERE user_id = ?', params: [req.user.id] },
      ...hashes.map((h) => ({ sql: 'INSERT INTO user_recovery_codes (user_id, code_hash) VALUES (?, ?)', params: [req.user.id, h] })),
    ]);
    res.json({ recoveryCodes: plain }); // shown ONCE
  } catch (err) { next(err); }
});
```

---

## WebAuthn / passkeys (phishing-resistant login + strong 2FA) [should]

Rationale: passkeys bind the credential to the site origin, so a phished user physically cannot hand
a working assertion to an attacker's domain. Usable as passwordless login OR as the second factor.
`rpID`/`origin` come from env so localhost and prod differ without code changes. The signature
counter is verified and persisted every login — a counter that goes backwards means a clone.
@simplewebauthn **throws** on a counter regression when either the stored or reported counter is > 0
(it does not return `verified: false`), so login/verify catches that specific error — that is where
the session-version bump happens; letting it fall through to the central handler would bury the
clone signal in a generic 500.

```js
// src/auth/webauthn.js
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { randomUUID } from 'node:crypto';
import * as db from '../db/index.js';
import { env } from '../lib/env.js';

export const rpID = env.WEBAUTHN_RP_ID;     // 'example.com' (or 'localhost' in dev)
export const rpName = env.WEBAUTHN_RP_NAME;
export const origin = env.WEBAUTHN_ORIGIN;  // 'https://example.com'
const CHALLENGE_TTL_SEC = 300;

// Persist the challenge WE generated; verify reads it back. Never accept a client-sent challenge.
export async function storeChallenge(userId, challenge, purpose) {
  const id = randomUUID();
  await db.run(
    `INSERT INTO webauthn_challenges (id, user_id, challenge, purpose, expires_at)
     VALUES (?, ?, ?, ?, unixepoch() + ?)`, [id, userId ?? null, challenge, purpose, CHALLENGE_TTL_SEC]);
  return id;
}
// Single-use: consume atomically, return the row only if still valid. The conditional UPDATE is the
// arbiter — two concurrent verifies of one challenge cannot both win.
export async function takeChallenge(id, purpose) {
  const consumed = await db.run(
    `UPDATE webauthn_challenges SET consumed_at = unixepoch()
     WHERE id = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > unixepoch()`, [id, purpose]);
  if (consumed.changes !== 1) return null;
  return db.get('SELECT * FROM webauthn_challenges WHERE id = ?', [id]);
}
export {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
};
```

Four endpoints. Registration is behind `requireAuth` + `requireStepUp` (adding a passkey is
sensitive); login is public and runs `issueSession()` on success.

```js
// src/auth/webauthn-routes.js — mount under /api/auth/webauthn.
import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import * as db from '../db/index.js';
import { requireAuth, invalidateSvCache } from './middleware.js';
import { requireStepUp } from './stepup.js';
import { issueSession } from './session.js'; // the issueSession helper extracted from routes.js
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
  storeChallenge, takeChallenge, rpID, rpName, origin,
} from './webauthn.js';

const router = Router();
// response is opaque authenticator JSON; @simplewebauthn validates its shape. z.record needs BOTH
// a key and a value schema in zod v4.
const VerifySchema = z.object({ challengeId: z.uuid(), response: z.record(z.string(), z.any()) }).strict();

// 1) register/options
router.post('/register/options', requireAuth, requireStepUp(), async (req, res, next) => {
  try {
    const existing = await db.all(
      'SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ?', [req.user.id]);
    const options = await generateRegistrationOptions({
      rpName, rpID,
      userName: String(req.user.id),
      userID: new TextEncoder().encode(String(req.user.id)), // v13 expects Uint8Array
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: c.credential_id, transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    const challengeId = await storeChallenge(req.user.id, options.challenge, 'register');
    res.json({ challengeId, options });
  } catch (err) { next(err); }
});

// 2) register/verify — validate the attestation against OUR stored challenge, persist the cred.
router.post('/register/verify', requireAuth, requireStepUp(), async (req, res, next) => {
  try {
    const { challengeId, response } = VerifySchema.parse(req.body);
    const chal = await takeChallenge(challengeId, 'register');
    if (!chal || chal.user_id !== req.user.id) return res.status(400).json({ error: 'invalid challenge' });

    // The library THROWS on a bad attestation (origin/RP mismatch, malformed clientDataJSON, …)
    // rather than returning verified:false — that's a client fault, so map it to 400 here instead
    // of letting the central handler turn it into a 500.
    let verified, registrationInfo;
    try {
      ({ verified, registrationInfo } = await verifyRegistrationResponse({
        response, expectedChallenge: chal.challenge, expectedOrigin: origin, expectedRPID: rpID,
        requireUserVerification: false,
      }));
    } catch { return res.status(400).json({ error: 'verification failed' }); }
    if (!verified || !registrationInfo) return res.status(400).json({ error: 'verification failed' });

    // v13 shape: registrationInfo.credential = { id: Base64URLString, publicKey: Uint8Array, counter, transports }.
    const { id, publicKey, counter, transports } = registrationInfo.credential;
    // INSERT (not upsert): a fresh credential_id per authenticator. If the same authenticator is
    // re-registered the PK conflict surfaces as an error, not a silent counter reset.
    await db.run(
      `INSERT INTO webauthn_credentials (credential_id, user_id, public_key, sign_count, transports)
       VALUES (?, ?, ?, ?, ?)`,
      // publicKey is a Uint8Array → wrap as Buffer for the BLOB column.
      [id, req.user.id, Buffer.from(publicKey), counter, transports ? JSON.stringify(transports) : null]);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// 3) login/options — usernameless: no allowCredentials lets the browser offer any resident key.
router.post('/login/options', async (req, res, next) => {
  try {
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
    const challengeId = await storeChallenge(null, options.challenge, 'login');
    res.json({ challengeId, options });
  } catch (err) { next(err); }
});

// 4) login/verify — verify the assertion, PERSIST the counter, then issue the session.
router.post('/login/verify', async (req, res, next) => {
  try {
    const { challengeId, response } = VerifySchema.parse(req.body);
    const chal = await takeChallenge(challengeId, 'login');
    if (!chal) return res.status(400).json({ error: 'invalid challenge' });

    // response.id is the base64url credential id; it is only a lookup key here — verify below
    // cryptographically binds it to the stored public key. (Type-check it: response is an opaque
    // record, and binding undefined into the query would throw a 500.)
    if (typeof response.id !== 'string') return res.status(400).json({ error: 'unknown credential' });
    const cred = await db.get('SELECT * FROM webauthn_credentials WHERE credential_id = ?', [response.id]);
    if (!cred) return res.status(400).json({ error: 'unknown credential' });

    let verified, authenticationInfo;
    try {
      ({ verified, authenticationInfo } = await verifyAuthenticationResponse({
        response, expectedChallenge: chal.challenge, expectedOrigin: origin, expectedRPID: rpID,
        credential: {
          id: cred.credential_id,
          publicKey: new Uint8Array(cred.public_key), // BLOB → bytes (v13 expects Uint8Array)
          counter: cred.sign_count,
          transports: cred.transports ? JSON.parse(cred.transports) : undefined,
        },
        requireUserVerification: false,
      }));
    } catch (e) {
      // Counter regression: a non-zero counter that did not advance means a cloned key. The library
      // THROWS here ("counter value … was lower than expected"; message-match is the only handle it
      // exposes) — catch it so we also bump session_version and any live sessions for that user
      // re-validate, instead of losing the clone signal to the generic 500 handler.
      // (counter == 0 both sides = authenticator that doesn't implement a counter; no throw.)
      if (/counter value/i.test(String(e?.message))) {
        await db.run('UPDATE users SET session_version = session_version + 1 WHERE id = ?', [cred.user_id]);
        invalidateSvCache(cred.user_id);
        return res.status(401).json({ error: 'credential rejected' });
      }
      return res.status(400).json({ error: 'verification failed' });
    }
    if (!verified) return res.status(401).json({ error: 'verification failed' });

    await db.run('UPDATE webauthn_credentials SET sign_count = ? WHERE credential_id = ?',
      [authenticationInfo.newCounter, cred.credential_id]);

    const user = await db.get('SELECT * FROM users WHERE id = ?', [cred.user_id]);
    await issueSession(res, user, randomUUID(), Math.floor(Date.now() / 1000), req.get('User-Agent'));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
```

`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN` are declared once in the central env schema
— [config-and-topology](config-and-topology.md) owns it (see integration-notes). Passkey-as-2nd-factor
is the same code, but you gate `issueSession` behind an `mfa_pending` ticket like TOTP instead of
issuing on the first factor.

---

## Step-up re-authentication for sensitive actions [should]

Rationale: a still-valid session should not be enough to change email, disable 2FA, delete the
account, rotate recovery codes, or add a passkey — an attacker on a borrowed unlocked session would
own everything. Require a *fresh* factor (within ~5 min) for those actions via a short-lived
`step_up` token (records `amr` = which factor proved it) and a `requireStepUp` middleware beside
`requireAuth`. On failure it returns 401 + a `step_up_required` code the `api()` wrapper catches to
pop the re-auth modal.

`requireStepUp` accepts an optional `factors` allow-list. **Disabling a second factor must require
that factor** (or a passkey) — otherwise a password-only attacker who guessed/stole the password
could step-up with `pwd` and turn 2FA off, defeating the whole feature. So `/mfa/disable` demands
`amr ∈ {totp, webauthn}`, while less-critical actions accept any fresh factor.

```js
// src/auth/stepup.js — mount the router under /api/auth (the frontend posts /api/auth/step-up).
import argon2 from 'argon2';
import { z } from 'zod';
import { Router } from 'express';
import * as db from '../db/index.js';
import { ARGON2_OPTS } from './routes.js';
import { requireAuth } from './middleware.js';
import { verifyTotpStep } from './totp.js';
import { signStepUp, verifyStepUp, STEP_UP_COOKIE } from './mfa-tokens.js';

const isProd = process.env.NODE_ENV === 'production';
const setStepUpCookie = (res, token) => res.cookie(STEP_UP_COOKIE, token, {
  httpOnly: true, secure: isProd, sameSite: 'strict', path: '/api', maxAge: 5 * 60 * 1000,
});

// Sibling to requireAuth; run AFTER it on sensitive routes. Proves a FRESH factor, not just a live
// session. `factors` optionally restricts WHICH factor is acceptable (e.g. disabling 2FA must be
// proven by the 2nd factor, not the password). 'step_up_required' is the contract the frontend keys.
export function requireStepUp(factors = null) {
  return async (req, res, next) => {
    try {
      const token = req.cookies[STEP_UP_COOKIE];
      if (!token) return res.status(401).json({ error: 'step-up required', code: 'step_up_required' });
      const { payload } = await verifyStepUp(token); // wrong audience / expired → throws → catch
      if (Number(payload.sub) !== req.user.id ||
          (factors && !factors.includes(payload.amr))) {
        return res.status(401).json({ error: 'step-up required', code: 'step_up_required' });
      }
      req.stepUp = { amr: payload.amr, at: payload.iat };
      next();
    } catch {
      res.status(401).json({ error: 'step-up required', code: 'step_up_required' });
    }
  };
}

// Re-prompt: prove a factor, receive the step-up cookie. Rate-limit as tightly as /login.
const router = Router();
const StepUpSchema = z.object({
  password: z.string().min(1).max(128).optional(),
  totp: z.string().regex(/^\d{6}$/).optional(),
}).strict().refine((b) => !!b.password !== !!b.totp, 'provide exactly one factor');

router.post('/step-up', requireAuth, /* stepUpLimiter, */ async (req, res, next) => {
  try {
    const body = StepUpSchema.parse(req.body);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    let amr = null;
    if (body.password) {
      if (await argon2.verify(user.password_hash, body.password)) amr = 'pwd';
    } else if (body.totp) {
      const row = await db.get('SELECT secret FROM user_totp WHERE user_id = ? AND totp_enabled = 1', [req.user.id]);
      const step = row ? verifyTotpStep(body.totp, row.secret) : null;
      // Same replay guard as login so a step-up code can't be replayed either.
      if (step !== null && (await db.consumeTotpStep({ userId: req.user.id, step })).accepted) amr = 'totp';
    }
    if (!amr) return res.status(401).json({ error: 'invalid credentials' });
    setStepUpCookie(res, await signStepUp(req.user.id, amr));
    res.json({ ok: true, amr });
  } catch (err) { next(err); }
});

export default router;
```

Apply it — `requireStepUp` is a FACTORY: call it (with an optional factor allow-list) so it returns
the middleware. Order is `requireAuth` then `requireStepUp(...)`:

```js
router.post('/account/email',  requireAuth, requireStepUp(),                       changeEmail);
router.post('/account/delete', requireAuth, requireStepUp(),                       deleteAccount);
// Turning OFF the second factor must be proven BY the second factor, not just the password.
router.post('/mfa/disable',    requireAuth, requireStepUp(['totp', 'webauthn']),   disableTotp);
```

The `/mfa/setup`, `/mfa/activate`, `/mfa/recovery/regenerate`, and `/webauthn/register/*` routes
shown earlier use `requireStepUp()` (any fresh factor) — bootstrapping a first 2nd-factor can't
demand a 2nd factor the user doesn't have yet.

To actually mint `amr: 'webauthn'`, `/step-up` needs a passkey branch: reuse `/webauthn/login/options`
for the challenge, then a verify variant that checks the assertion against the *authenticated user's
own* credential and calls `setStepUpCookie(res, await signStepUp(req.user.id, 'webauthn'))` instead
of `issueSession`. Without it the `['totp', 'webauthn']` allow-list is only satisfiable by TOTP.

Frontend: extend the single [api()](frontend-conventions.md) wrapper's 401 branch so a
`step_up_required` body opens the re-auth modal, then retries once — the same one-retry shape it
uses for token refresh. The current `ApiError` only carries `status` + `message`, so first give it a
`code`: parse the JSON body in `request()` and store `body.code` on the error.

```ts
if (err instanceof ApiError && err.status === 401 && err.code === 'step_up_required') {
  await promptStepUp();             // modal: collect password / TOTP, POST /api/auth/step-up
  return request<T>(path, options); // retry once with the fresh step_up cookie now in the jar
}
```

## Cross-cutting notes

- Enrolling, disabling, or re-generating any second factor is step-up-gated **and** bumps
  `session_version` so other live sessions re-validate. Enrollment and disable are account-takeover
  primitives — treat them as sensitive as a password change.
- Never log a TOTP secret, a recovery-code plaintext, or a challenge — treat them like the password
  (see [observability](observability.md) redaction rules).
- Rate-limit `/mfa/verify`, `/mfa/recover`, `/step-up`, and `/webauthn/login/verify` as tightly as
  `/login` (per-IP + per-account); reuse the `skip: () => process.env.NODE_ENV === 'test'`
  convention from auth-blueprint.
- The `mfa_pending` / `step_up` completion endpoints post JSON and so are covered by the global
  `csrfProtection` middleware (Sec-Fetch-Site + `X-CSRF:1` + JSON content-type) — keep it mounted on
  the `/api/auth` router; SameSite=Strict on the cookies is the second layer.
- Purge expired challenges on the refresh-token maintenance interval:
  `DELETE FROM webauthn_challenges WHERE expires_at <= unixepoch()`.
