# Auth blueprint — jose access JWT + rotating refresh tokens

Design (OWASP-aligned):
- **Access token**: JWT, 15-minute TTL, signed HS256 with a 256-bit secret, `kid` header +
  keyring for zero-downtime rotation. Carries `sub`, `role`, `sv` (session version), `jti`.
- **Refresh token**: NOT a JWT — an opaque 32-byte random value. Stored in the DB as a SHA-256
  hash with a `family_id`. Every refresh rotates the token; replaying an already-consumed token
  (reuse detection) revokes the whole family — this is what actually catches stolen tokens.
- **Cookies**: access `__Host-access` (SameSite=Lax, Path=/), refresh `__Secure-refresh`
  (SameSite=Strict, Path=/api/auth — the token only ever travels to the auth endpoints).
  In development (plain HTTP) the unprefixed names are used because prefixes require `Secure`.
  Deployment note: `__Secure-` cannot stop a compromised sibling subdomain from setting a cookie
  over yours (cookie tossing) — host the app on a domain without untrusted subdomains, or accept
  that residual (`__Host-` would prevent it but forbids the Path scoping used here).
- **Roles**: read from the JWT for routine checks; the `sv` claim is compared against the DB
  (30 s cache) so a role change / ban / password change invalidates tokens instantly. Critical
  operations must re-check the role in the DB inside the handler.
- **CSRF**: SameSite alone is not enough (OWASP) — every state-changing request must pass the
  `csrfProtection` middleware below. The frontend fetch wrapper sends `X-CSRF: 1`.

Packages: `jose`, `argon2`, `express-rate-limit`, `cookie-parser`, `zod`.

## Schema (add to src/db/schema.sql)

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  session_version INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  next_login_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash TEXT PRIMARY KEY,          -- sha256(token); the raw token is never stored
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id TEXT NOT NULL,              -- one family per login session
  family_created_at INTEGER NOT NULL,   -- login time; carried on every row so purges can't erase it
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,                  -- set when rotated; a consumed token must never work again
  revoked INTEGER NOT NULL DEFAULT 0,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
```

## src/auth/tokens.js

```js
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { env } from '../lib/env.js';

const ISSUER = 'app';
const AUDIENCE = 'app';
export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60;        // sliding, renewed on each rotation
export const FAMILY_ABSOLUTE_TTL_SEC = 30 * 24 * 60 * 60; // hard cap: re-login after 30 days

// Keyring enables zero-downtime secret rotation: set JWT_SECRET_PREV/JWT_KID_PREV while
// rotating, remove them after 15 minutes (max access-token lifetime).
const keyring = new Map([[env.JWT_KID, Buffer.from(env.JWT_SECRET, 'base64url')]]);
if (env.JWT_SECRET_PREV && env.JWT_KID_PREV) {
  keyring.set(env.JWT_KID_PREV, Buffer.from(env.JWT_SECRET_PREV, 'base64url'));
}

export async function signAccessToken(user) {
  return new SignJWT({ role: user.role, sv: user.session_version })
    .setProtectedHeader({ alg: 'HS256', kid: env.JWT_KID })
    .setSubject(String(user.id))
    .setJti(randomUUID())
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(keyring.get(env.JWT_KID));
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(
    token,
    (header) => {
      const key = keyring.get(header.kid);
      if (!key) throw new Error('unknown kid');
      return key;
    },
    // Pinning the algorithm list blocks alg-confusion / "none" attacks (RFC 8725).
    { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE }
  );
  return payload;
}

export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
```

## src/auth/middleware.js

```js
import * as db from '../db/index.js';
import { verifyAccessToken, ACCESS_TTL_SEC, REFRESH_TTL_SEC } from './tokens.js';
import { env } from '../lib/env.js';

const isProd = env.NODE_ENV === 'production';
// Cookie prefixes require Secure, which requires HTTPS — fall back to plain names in dev.
export const ACCESS_COOKIE = isProd ? '__Host-access' : 'access';
export const REFRESH_COOKIE = isProd ? '__Secure-refresh' : 'refresh';
export const AUTH_PATH = '/api/auth'; // refresh cookie only travels to the auth endpoints

// maxAge is derived from the token TTLs (not re-typed) so cookie and token lifetimes can't drift.
export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: ACCESS_TTL_SEC * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true, secure: isProd, sameSite: 'strict', path: AUTH_PATH,
    maxAge: REFRESH_TTL_SEC * 1000,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: isProd, sameSite: 'strict', path: AUTH_PATH });
}

// sv (session version) cache: one cheap indexed read per user per 30 s instead of per request.
const svCache = new Map();
async function getSessionVersion(userId) {
  const hit = svCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.sv;
  const row = await db.get('SELECT session_version FROM users WHERE id = ?', [userId]);
  const sv = row ? row.session_version : -1;
  svCache.set(userId, { sv, expiresAt: Date.now() + 30_000 });
  return sv;
}
export function invalidateSvCache(userId) { svCache.delete(userId); }

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[ACCESS_COOKIE];
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const payload = await verifyAccessToken(token);
    // sv mismatch = role changed / banned / "logout everywhere" → token is dead immediately.
    if ((await getSessionVersion(Number(payload.sub))) !== payload.sv) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    // sv travels on req.user so critical endpoints can re-verify it in the DB inside their tx.
    req.user = { id: Number(payload.sub), role: payload.role, sv: payload.sv };
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'forbidden' });

// CSRF defense-in-depth: Fetch-Metadata check + custom-header requirement + JSON-only bodies.
// Browsers cannot attach custom headers cross-origin without a CORS preflight.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const site = req.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (req.get('X-CSRF') !== '1') return res.status(403).json({ error: 'forbidden' });
  const contentType = (req.get('Content-Type') ?? '').split(';')[0].trim();
  // Enforce JSON whenever a Content-Type is present — do NOT gate on Content-Length, which is
  // absent on Transfer-Encoding: chunked bodies (that would skip the check for chunked requests).
  const hasBody = contentType !== '' || 'transfer-encoding' in req.headers ||
    Number(req.get('Content-Length') ?? 0) > 0;
  if (hasBody && contentType !== 'application/json') {
    return res.status(415).json({ error: 'unsupported media type' });
  }
  next();
}
```

## src/auth/routes.js

```js
import { Router } from 'express';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { logger } from '../lib/logger.js';
import {
  signAccessToken, newRefreshToken, hashToken,
  REFRESH_TTL_SEC, FAMILY_ABSOLUTE_TTL_SEC,
} from './tokens.js';
import {
  REFRESH_COOKIE, setAuthCookies, clearAuthCookies, requireAuth, invalidateSvCache,
} from './middleware.js';

const router = Router();

// OWASP minimum parameters; raise memoryCost if the server can afford it.
const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
// Pre-computed once so unknown-email logins do the same amount of work as real ones
// (prevents user enumeration by response timing).
const DUMMY_HASH = await argon2.hash('dummy-password-for-timing', ARGON2_OPTS);

// Trim + lowercase BEFORE validating so "  Foo@X.io" and "foo@x.io" are ONE identity — otherwise
// UNIQUE(email) is bypassable and login lookups miss. (Same normalization as the shared `email`
// schema in input-validation.md; this inline copy just keeps the file standalone.)
const email = z.string().trim().toLowerCase().email().max(254);
const RegisterSchema = z.object({ email, password: z.string().min(10).max(128) }).strict();
const LoginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();

// Skip in the test env so a test suite (all requests from one IP) isn't throttled into false
// failures; rate limiting gets its OWN dedicated test. Never skip in dev/prod.
const skipInTest = () => process.env.NODE_ENV === 'test';

// Separate limiter instances per route — a shared budget would let login retries starve
// refresh (force-logging users out) and vice versa. Refresh gets a generous limit because its
// real protection is the unguessable single-use token, not the limiter.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, skip: skipInTest });
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, skip: skipInTest });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, skip: skipInTest });
// Per-ACCOUNT limiter layered on the per-IP ones: blunts distributed credential stuffing and
// makes register/login enumeration expensive even from many IPs.
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, skip: skipInTest,
  // Key uses the SAME normalization as the zod schemas — otherwise a spelling variant that the
  // schema canonicalizes to one account would rotate into a fresh limiter bucket.
  keyGenerator: (req) => typeof req.body?.email === 'string'
    ? `email:${req.body.email.trim().toLowerCase()}` : ipKeyGenerator(req.ip),
});

async function issueSession(res, user, familyId, familyCreatedAt, userAgent) {
  const refreshToken = newRefreshToken();
  await db.run(
    `INSERT INTO refresh_tokens (token_hash, user_id, family_id, family_created_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, unixepoch() + ?, ?)`,
    [hashToken(refreshToken), user.id, familyId, familyCreatedAt, REFRESH_TTL_SEC, userAgent ?? null]
  );
  setAuthCookies(res, await signAccessToken(user), refreshToken);
}

router.post('/register', registerLimiter, emailLimiter, async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const passwordHash = await argon2.hash(body.password, ARGON2_OPTS);
    const result = await db.run(
      'INSERT OR IGNORE INTO users (email, password_hash) VALUES (?, ?)',
      [body.email, passwordHash]
    );
    if (result.changes === 0) return res.status(409).json({ error: 'email already registered' });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/login', loginLimiter, emailLimiter, async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);
    const user = await db.get('SELECT * FROM users WHERE email = ?', [body.email]);
    // Per-account exponential backoff (in addition to the per-IP limiter).
    if (user && user.next_login_at > Math.floor(Date.now() / 1000)) {
      return res.status(429).json({ error: 'too many attempts, try again later' });
    }
    const ok = await argon2.verify(user?.password_hash ?? DUMMY_HASH, body.password);
    if (!user || !ok) {
      if (user) {
        const failed = user.failed_logins + 1;
        const delaySec = failed >= 3 ? Math.min(15 * 60, 2 ** (failed - 3)) : 0;
        await db.run('UPDATE users SET failed_logins = ?, next_login_at = unixepoch() + ? WHERE id = ?',
          [failed, delaySec, user.id]);
      }
      return res.status(401).json({ error: 'invalid credentials' }); // same message for both cases
    }
    await db.run('UPDATE users SET failed_logins = 0, next_login_at = 0 WHERE id = ?', [user.id]);
    await issueSession(res, user, randomUUID(), Math.floor(Date.now() / 1000), req.get('User-Agent'));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/refresh', refreshLimiter, async (req, res, next) => {
  try {
    const raw = req.cookies[REFRESH_COOKIE];
    if (!raw) return res.status(401).json({ error: 'unauthorized' });
    const tokenHash = hashToken(raw);
    const now = Math.floor(Date.now() / 1000);

    const row = await db.get('SELECT * FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);
    if (!row || row.revoked || row.expires_at <= now) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Absolute session cap: after 30 days the user must log in again no matter what.
    // family_created_at is carried on every row, so the maintenance purge cannot erase
    // the family's age (deriving it via MIN(created_at) would break once old rows are purged).
    if (row.family_created_at + FAMILY_ABSOLUTE_TTL_SEC <= now) {
      await db.run('UPDATE refresh_tokens SET revoked = 1 WHERE family_id = ?', [row.family_id]);
      clearAuthCookies(res);
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Atomic consume — the conditional UPDATE is the arbiter, so two racing requests
    // can never both rotate the same token.
    const consumed = await db.run(
      'UPDATE refresh_tokens SET consumed_at = unixepoch() WHERE token_hash = ? AND consumed_at IS NULL AND revoked = 0',
      [tokenHash]);
    if (consumed.changes === 0) {
      // Someone else consumed this token first: either two of the user's own requests raced
      // (e.g. two tabs refreshing at once), or a stolen token is being replayed.
      const again = await db.get(
        'SELECT consumed_at, revoked FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);
      if (again && !again.revoked && again.consumed_at && now - again.consumed_at <= 10) {
        // Benign race: the winning request already rotated the cookies in the browser's jar.
        // Do NOT revoke — false theft alarms would train us to ignore the real signal.
        return res.status(409).json({ error: 'refresh in progress' });
      }
      // Stale reuse → assume theft. Kill the family AND bump sv so the thief's access token
      // dies immediately too — not after up to 15 more minutes.
      await db.writeTx([
        { sql: 'UPDATE refresh_tokens SET revoked = 1 WHERE family_id = ?', params: [row.family_id] },
        { sql: 'UPDATE users SET session_version = session_version + 1 WHERE id = ?', params: [row.user_id] },
      ]);
      invalidateSvCache(row.user_id);
      logger.warn({ userId: row.user_id, familyId: row.family_id }, 'refresh token reuse detected');
      clearAuthCookies(res);
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Re-read the user so the new access token carries FRESH role + sv (never copy old claims).
    const user = await db.get('SELECT * FROM users WHERE id = ?', [row.user_id]);
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'unauthorized' });
    }
    await issueSession(res, user, row.family_id, row.family_created_at, req.get('User-Agent'));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// The refresh cookie's Path (/api/auth) covers this route, so it arrives here too.
router.post('/logout', async (req, res, next) => {
  try {
    const raw = req.cookies[REFRESH_COOKIE];
    if (raw) {
      const row = await db.get('SELECT family_id FROM refresh_tokens WHERE token_hash = ?', [hashToken(raw)]);
      if (row) await db.run('UPDATE refresh_tokens SET revoked = 1 WHERE family_id = ?', [row.family_id]);
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await db.writeTx([
      { sql: 'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', params: [req.user.id] },
      { sql: 'UPDATE users SET session_version = session_version + 1 WHERE id = ?', params: [req.user.id] },
    ]);
    invalidateSvCache(req.user.id); // sv bump kills every live access token within one cache TTL
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
```

## Maintenance

- Purge expired rows periodically (e.g. daily interval or at startup):
  `DELETE FROM refresh_tokens WHERE expires_at <= unixepoch() OR (revoked = 1 AND created_at <= unixepoch() - 2592000)`.
  The absolute cap stays intact because `family_created_at` travels on every row.
- On password change: bump `session_version` and revoke all refresh families (same as logout-all).
- On EVERY role change or ban: bump `session_version` in the same writeTx as the role update,
  then `invalidateSvCache(userId)` — otherwise the old access token keeps its old role for up to
  15 minutes and the "instant revocation" promise of the sv claim is void.
- Critical operations (role management, deletion, payments): call `requireRole(...)` AND re-read
  the role from the DB inside the handler — the JWT is a fast-path hint, the DB is the truth.
- Known residual (documented, not hidden): /register's 409 and the login-lockout 429 reveal that
  an account exists. Full enumeration resistance needs uniform responses plus email-based flows;
  for most apps the rate limits + backoff are the accepted trade-off.
