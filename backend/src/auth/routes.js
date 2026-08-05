// src/auth/routes.js — register, login, refresh, logout, logout-all, me.
import { Router } from 'express';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { logger } from '../lib/logger.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import {
  signAccessToken,
  newRefreshToken,
  hashToken,
  REFRESH_TTL_SEC,
  FAMILY_ABSOLUTE_TTL_SEC,
} from './tokens.js';
import {
  REFRESH_COOKIE,
  setAuthCookies,
  clearAuthCookies,
  requireAuth,
  invalidateSvCache,
} from './middleware.js';

const router = Router();

// OWASP argon2id minimum. bcrypt is not an option in new code.
const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Pre-computed once at boot so a login for an unknown email performs the SAME amount of work
// as a real one. Without it, response timing alone enumerates valid accounts.
const DUMMY_HASH = await argon2.hash('dummy-password-for-timing', ARGON2_OPTS);

// Normalize BEFORE validating, so "  Foo@X.io " and "foo@x.io" are ONE identity — otherwise the
// unique index is bypassable and login lookups miss. This matches the lower(trim(email)) index
// in migration 001; the two must never drift apart.
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

// The password floor is the local policy from the security baseline: 12+ chars with upper,
// lower and a digit. Breached-password screening is layered on later.
const password = z
  .string()
  .min(12, 'at least 12 characters')
  .max(128)
  .regex(/[a-z]/, 'must contain a lowercase letter')
  .regex(/[A-Z]/, 'must contain an uppercase letter')
  .regex(/\d/, 'must contain a digit');

const RegisterSchema = z.object({ email, password }).strict();
// Login deliberately does NOT re-apply the policy: rejecting a short password before checking
// it would tell an attacker the policy and shortcut the timing-equalisation above.
const LoginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();

// Skipped only in the test env, where every request shares one IP and the limiter would turn
// into false failures. Rate limiting gets its own dedicated test instead.
const skipInTest = () => process.env.NODE_ENV === 'test';

// Separate instances per route on purpose: a shared budget would let login retries starve
// refresh and force live users out. Refresh is generous because its real protection is the
// unguessable single-use token, not the limiter.
const common = { windowMs: 15 * 60 * 1000, standardHeaders: true, legacyHeaders: false, skip: skipInTest };
const loginLimiter = rateLimit({ ...common, limit: 10 });
const registerLimiter = rateLimit({ ...common, limit: 5 });
const refreshLimiter = rateLimit({ ...common, limit: 60 });

// Per-ACCOUNT limiter layered on the per-IP ones: distributed credential stuffing spreads
// across IPs but still converges on a single account.
const emailLimiter = rateLimit({
  ...common,
  limit: 20,
  // Same normalization as the zod schema — otherwise a spelling variant the schema canonicalizes
  // to one account would rotate into a fresh limiter bucket.
  keyGenerator: (req) =>
    typeof req.body?.email === 'string'
      ? `email:${req.body.email.trim().toLowerCase()}`
      : ipKeyGenerator(req.ip),
});

async function issueSession(res, user, familyId, familyCreatedAt, userAgent) {
  const refreshToken = newRefreshToken();
  await db.run(
    `INSERT INTO refresh_tokens (token_hash, user_id, family_id, family_created_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, unixepoch() + ?, ?)`,
    [hashToken(refreshToken), user.id, familyId, familyCreatedAt, REFRESH_TTL_SEC, userAgent ?? null],
  );
  setAuthCookies(res, await signAccessToken(user), refreshToken);
}

router.post(
  '/register',
  registerLimiter,
  emailLimiter,
  asyncRoute(async (req, res) => {
    const body = RegisterSchema.parse(req.body);
    const passwordHash = await argon2.hash(body.password, ARGON2_OPTS);
    // INSERT OR IGNORE rather than a SELECT-then-INSERT: the unique index is the arbiter, so
    // two simultaneous registrations of the same address cannot both succeed.
    const result = await db.run('INSERT OR IGNORE INTO users (email, password_hash) VALUES (?, ?)', [
      body.email,
      passwordHash,
    ]);
    if (result.changes === 0) return sendError(res, 409, ERR.CONFLICT, 'email already registered');
    res.status(201).json({ ok: true });
  }),
);

router.post(
  '/login',
  loginLimiter,
  emailLimiter,
  asyncRoute(async (req, res) => {
    const body = LoginSchema.parse(req.body);
    const user = await db.get('SELECT * FROM users WHERE lower(trim(email)) = ?', [body.email]);

    if (user && user.next_login_at > Math.floor(Date.now() / 1000)) {
      return sendError(res, 429, ERR.RATE_LIMITED, 'too many attempts, try again later');
    }

    // Verify against the dummy hash when the user does not exist, so both paths burn the same
    // argon2 time. Note the order: this runs BEFORE the existence check, deliberately.
    const ok = await argon2.verify(user?.password_hash ?? DUMMY_HASH, body.password);

    if (!user || !ok || user.disabled_at) {
      if (user && !user.disabled_at) {
        const failed = user.failed_logins + 1;
        // Backoff starts only after 3 failures so a typo costs nothing, then doubles to a
        // 15-minute ceiling.
        const delaySec = failed >= 3 ? Math.min(15 * 60, 2 ** (failed - 3)) : 0;
        await db.run(
          'UPDATE users SET failed_logins = ?, next_login_at = unixepoch() + ? WHERE id = ?',
          [failed, delaySec, user.id],
        );
      }
      // One message for every failure mode — wrong password, unknown email, disabled account.
      return sendError(res, 401, ERR.UNAUTHORIZED, 'invalid credentials');
    }

    await db.run('UPDATE users SET failed_logins = 0, next_login_at = 0 WHERE id = ?', [user.id]);
    await issueSession(res, user, randomUUID(), Math.floor(Date.now() / 1000), req.get('User-Agent'));
    req.log.info({ userId: user.id }, 'login');
    res.json({ ok: true });
  }),
);

router.post(
  '/refresh',
  refreshLimiter,
  asyncRoute(async (req, res) => {
    const raw = req.cookies[REFRESH_COOKIE];
    if (!raw) return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');

    const tokenHash = hashToken(raw);
    const now = Math.floor(Date.now() / 1000);

    const row = await db.get('SELECT * FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);
    if (!row || row.revoked || row.expires_at <= now) {
      clearAuthCookies(res);
      return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');
    }

    // Absolute cap: rotation slides the 7-day expiry forward, but nothing extends a login past
    // 30 days. family_created_at is stored per row precisely so a purge cannot reset this.
    if (row.family_created_at + FAMILY_ABSOLUTE_TTL_SEC <= now) {
      await db.run('UPDATE refresh_tokens SET revoked = 1 WHERE family_id = ?', [row.family_id]);
      clearAuthCookies(res);
      return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');
    }

    // The conditional UPDATE is the arbiter of the race, not a preceding SELECT: exactly one
    // caller can consume a given token, no matter how many arrive at once.
    const consumed = await db.run(
      'UPDATE refresh_tokens SET consumed_at = unixepoch() WHERE token_hash = ? AND consumed_at IS NULL AND revoked = 0',
      [tokenHash],
    );

    if (consumed.changes === 0) {
      const again = await db.get(
        'SELECT consumed_at, revoked FROM refresh_tokens WHERE token_hash = ?',
        [tokenHash],
      );
      // Benign race — two of the user's own tabs refreshed together and the winner already
      // rotated the cookie jar. Revoking here would train everyone to ignore the real alarm.
      if (again && !again.revoked && again.consumed_at && now - again.consumed_at <= 10) {
        return sendError(res, 409, ERR.CONFLICT, 'refresh in progress');
      }
      // Stale reuse: assume theft. Kill the family AND bump sv, so the thief's access token
      // dies now rather than in up to fifteen more minutes.
      await db.writeTx([
        { sql: 'UPDATE refresh_tokens SET revoked = 1 WHERE family_id = ?', params: [row.family_id] },
        { sql: 'UPDATE users SET session_version = session_version + 1 WHERE id = ?', params: [row.user_id] },
      ]);
      invalidateSvCache(row.user_id);
      logger.warn({ userId: row.user_id, familyId: row.family_id }, 'refresh token reuse detected');
      clearAuthCookies(res);
      return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');
    }

    // Re-read the user so the new access token carries a FRESH role and sv. Copying claims off
    // the old token would let a demoted user keep their privileges by refreshing.
    const user = await db.get('SELECT * FROM users WHERE id = ?', [row.user_id]);
    if (!user || user.disabled_at) {
      clearAuthCookies(res);
      return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');
    }
    await issueSession(res, user, row.family_id, row.family_created_at, req.get('User-Agent'));
    res.json({ ok: true });
  }),
);

// The refresh cookie's Path covers this route, so the token arrives here and the family can be
// revoked server-side — clearing the cookie alone would leave a working token in the wild.
router.post(
  '/logout',
  // Generous on purpose. Logout is a write — it revokes a refresh token — so it does not get to
  // skip the rule, but the limit has to sit far above any honest use: a limiter that can stop
  // someone LOGGING OUT is a security negative, not a protection.
  refreshLimiter,
  asyncRoute(async (req, res) => {
    const raw = req.cookies[REFRESH_COOKIE];
    if (raw) {
      const row = await db.get('SELECT family_id FROM refresh_tokens WHERE token_hash = ?', [
        hashToken(raw),
      ]);
      if (row) {
        await db.run('UPDATE refresh_tokens SET revoked = 1 WHERE family_id = ?', [row.family_id]);
      }
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

router.post(
  '/logout-all',
  requireAuth,
  refreshLimiter,
  asyncRoute(async (req, res) => {
    await db.writeTx([
      { sql: 'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', params: [req.user.id] },
      { sql: 'UPDATE users SET session_version = session_version + 1 WHERE id = ?', params: [req.user.id] },
    ]);
    invalidateSvCache(req.user.id); // the sv bump kills every live access token immediately
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

const ChangeCredentialsSchema = z
  .object({ currentPassword: z.string().min(1).max(128), password })
  .strict();

/**
 * Set your own password — the exit from the pre-generated-account state (flow C).
 *
 * The current password is required even though the session already proves identity: a coach who
 * handed over a temporary password could otherwise walk up to an unlocked phone and take the
 * account back. Everything else is revoked afterwards, because until this moment somebody else
 * knew the credentials.
 */
router.post(
  '/change-credentials',
  requireAuth,
  loginLimiter,
  asyncRoute(async (req, res) => {
    const body = ChangeCredentialsSchema.parse(req.body);

    const user = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user) return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');

    const ok = await argon2.verify(user.password_hash, body.currentPassword);
    if (!ok) return sendError(res, 401, ERR.UNAUTHORIZED, 'invalid credentials');

    if (await argon2.verify(user.password_hash, body.password)) {
      return sendError(res, 400, ERR.VALIDATION, 'the new password must differ from the old one');
    }

    const hash = await argon2.hash(body.password, ARGON2_OPTS);

    // One transaction: set the password, clear the flag, bump sv and kill every refresh family.
    // A password change that leaves old sessions alive is not a password change.
    await db.writeTx([
      {
        sql: 'UPDATE users SET password_hash = ?, must_change_credentials = 0, session_version = session_version + 1 WHERE id = ?',
        params: [hash, req.user.id],
      },
      { sql: 'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', params: [req.user.id] },
      {
        sql: `INSERT INTO audit_log (actor_id, action, target_type, target_id, request_id, ip)
              VALUES (?, 'user.credentials.change', 'user', ?, ?, ?)`,
        params: [req.user.id, req.user.id, res.locals.requestId, req.ip ?? null],
      },
    ]);
    invalidateSvCache(req.user.id);
    clearAuthCookies(res);

    req.log.info({ userId: req.user.id }, 'credentials changed');
    res.json({ ok: true });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    // Explicit column list, never SELECT * — a future column must be opted into a response.
    const user = await db.get('SELECT id, email, role, created_at, must_change_credentials FROM users WHERE id = ?', [
      req.user.id,
    ]);
    if (!user) return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');
    res.json({ user });
  }),
);

export default router;
