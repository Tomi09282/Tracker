// src/auth/middleware.js — cookie policy, session gate, role gate, CSRF.
import * as db from '../db/index.js';
import { env } from '../lib/env.js';
import { ERR, sendError } from '../lib/http.js';
import { verifyAccessToken, ACCESS_TTL_SEC, REFRESH_TTL_SEC } from './tokens.js';

const isProd = env.NODE_ENV === 'production';

// Cookie prefixes require the Secure attribute, which requires HTTPS — so development over
// plain HTTP falls back to unprefixed names. The flags themselves never relax.
export const ACCESS_COOKIE = isProd ? '__Host-access' : 'access';
export const REFRESH_COOKIE = isProd ? '__Secure-refresh' : 'refresh';

// The refresh cookie is Path-scoped: it travels ONLY to the auth endpoints, so the long-lived
// credential is never attached to ordinary API calls where a bug could echo it back.
export const AUTH_PATH = '/api/v1/auth';

// maxAge is derived from the token TTLs rather than re-typed, so a cookie can never outlive
// the token inside it.
export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TTL_SEC * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: AUTH_PATH,
    maxAge: REFRESH_TTL_SEC * 1000,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: AUTH_PATH,
  });
}

// The sv (session version) claim is what makes "log out everywhere" and "ban this user" take
// effect immediately instead of after the access token expires. Checking it per request would
// mean a DB read per request, so it is cached for 30 s — the window in which a revocation is
// not yet visible.
const svCache = new Map();

async function getSessionVersion(userId) {
  const hit = svCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.sv;
  const row = await db.get('SELECT session_version, disabled_at FROM users WHERE id = ?', [userId]);
  // -1 can never equal a real sv, so a deleted or disabled user fails the comparison below.
  const sv = row && !row.disabled_at ? row.session_version : -1;
  svCache.set(userId, { sv, expiresAt: Date.now() + 30_000 });
  return sv;
}

export function invalidateSvCache(userId) {
  svCache.delete(userId);
  changeCache.delete(userId);
}

/** The only routes a pre-generated account may reach before it belongs to its owner. */
const CREDENTIAL_CHANGE_ALLOWED = new Set([
  '/api/v1/auth/me',
  '/api/v1/auth/change-credentials',
  '/api/v1/auth/logout',
]);

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[ACCESS_COOKIE];
    if (!token) return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');
    const payload = await verifyAccessToken(token);
    if ((await getSessionVersion(Number(payload.sub))) !== payload.sv) {
      return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');
    }
    // sv rides on req.user so a critical handler can re-verify it inside its own transaction.
    req.user = { id: Number(payload.sub), role: payload.role, sv: payload.sv };

    // Flow C gate. A coach-created account still has a password the COACH knows, so it is not
    // yet the client's account. Until they set their own credentials it can do nothing except
    // read who it is, change them, or log out — enforced here rather than in the UI, because a
    // UI gate is a suggestion.
    const flagged = await needsCredentialChange(req.user.id);
    if (flagged && !CREDENTIAL_CHANGE_ALLOWED.has(req.baseUrl + req.path)) {
      return sendError(res, 403, ERR.FORBIDDEN, 'credentials must be changed first');
    }

    next();
  } catch {
    // Any verification failure is the same 401 — never tell a caller which check failed.
    sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');
  }
}

// Cached alongside the session version, and invalidated by the same call, so changing the
// credentials clears both in one step.
const changeCache = new Map();

async function needsCredentialChange(userId) {
  const hit = changeCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const row = await db.get('SELECT must_change_credentials FROM users WHERE id = ?', [userId]);
  const value = row?.must_change_credentials === 1;
  changeCache.set(userId, { value, expiresAt: Date.now() + 30_000 });
  return value;
}

/**
 * Role gate for routine checks. The JWT is a fast-path hint; operations that move money,
 * grant privilege or destroy data must ALSO re-read the role from the DB inside their handler.
 */
export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.role) ? next() : sendError(res, 403, ERR.FORBIDDEN, 'forbidden');

/**
 * CSRF, three independent layers. SameSite alone is not sufficient (OWASP):
 *   1. Sec-Fetch-Site must be same-origin or none when the browser sends it;
 *   2. a custom header the browser cannot attach cross-origin without a CORS preflight;
 *   3. JSON-only bodies, which blocks HTML form posts entirely.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const site = req.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
  }
  if (req.get('X-CSRF') !== '1') return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');

  const contentType = (req.get('Content-Type') ?? '').split(';')[0].trim();
  // Detect a body without trusting Content-Length: it is absent on chunked transfers, and
  // gating on it would let a chunked request skip the JSON check entirely.
  const hasBody =
    contentType !== '' ||
    'transfer-encoding' in req.headers ||
    Number(req.get('Content-Length') ?? 0) > 0;
  if (hasBody && contentType !== 'application/json') {
    return sendError(res, 415, ERR.UNSUPPORTED_MEDIA_TYPE, 'unsupported media type');
  }
  next();
}

/**
 * The coach gate.
 *
 * ROLE rejection is 403, deliberately, and it is the one place in this codebase that is not 404.
 * The 404-never-403 rule exists so a response cannot confirm that a particular OBJECT exists;
 * "you are not a coach" says nothing about any object, and it is a fact the caller already knows
 * about themselves. Turning it into a 404 would only make a genuine misconfiguration harder to
 * diagnose.
 *
 * It lives here rather than in one router because two routers need it, and the moment a guard is
 * copy-pasted the two copies start drifting — which is exactly how `/clients/:id` came to answer
 * 403 while `/clients/:id/onboarding` answered 404 for the very same caller.
 */
export const requireCoach = (req, res, next) =>
  req.user.role === 'coach' || req.user.role === 'admin'
    ? next()
    : sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
