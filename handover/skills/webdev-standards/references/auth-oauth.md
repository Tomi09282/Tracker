# OAuth / social login

Why this design: a social login is just a *second way to prove which user you are*, so it must end at
the exact place password login does — the `issueSession()` in [auth-blueprint.md](auth-blueprint.md),
issuing OUR own JWT + rotating refresh family. It never mints provider tokens into the app. We do
Authorization Code + PKCE by hand with `jose` + native `fetch` instead of `passport`: the flow is
~120 lines, every security decision stays visible, and there is no plugin surface to audit. Three
properties carry it: (1) a **signed, short-lived cookie** binds `state`+`nonce`+`code_verifier` to
the browser that started the flow (CSRF + code-injection defense — no server-side session map);
(2) the **ID token is verified against the provider JWKS** with pinned issuer/audience/alg/nonce
(never trusted because it "came from Google"); (3) **auto-linking requires a provider-asserted
VERIFIED email** — otherwise an attacker who controls an unverified address at a sloppy provider takes
over the matching local account.

Packages: `jose` (already used for our JWTs), `zod`. No new deps — metadata and tokens come from
`fetch`. Env to add (validate in [env-and-secrets.md](env-and-secrets.md), fail fast):
`OAUTH_STATE_SECRET` (32+ random bytes base64url — signs the flow cookie, distinct from `JWT_SECRET`),
`OAUTH_REDIRECT_BASE` (e.g. `https://app.example.com`), and per provider `OAUTH_<P>_CLIENT_ID` /
`OAUTH_<P>_CLIENT_SECRET`. The registered callback is `${base}/api/auth/oauth/:provider/callback` and
must match the provider config exactly.

## Schema (add to src/db/schema.sql)

```sql
-- One row per (provider, external account). A local user MAY have several identities (Google + GitHub)
-- plus a password — auth methods are additive, never mutually exclusive.
CREATE TABLE IF NOT EXISTS oauth_identities (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,               -- 'google' | 'github'
  provider_user_id TEXT NOT NULL,       -- the provider's STABLE subject ('sub'), never the email
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,                           -- email at link time, for audit; NOT an identity key
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (provider, provider_user_id)   -- one external account maps to exactly one local user
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_identities(user_id);
```

`users.password_hash` and `users.email` are both `NOT NULL` in [auth-blueprint.md](auth-blueprint.md);
an OAuth-only user has no password, and a case-4 user (below) has no *proven* email. Relax **both** to
nullable — `password_hash TEXT`, `email TEXT UNIQUE` — or the NULL-email insert in the worker tx below
throws `NOT NULL constraint failed`. Gate password `/login` on `password_hash IS NOT NULL`, returning
the same generic `invalid credentials` when it is null (a NULL email can't password-login anyway:
`WHERE email = ?` never matches NULL). `requireAuth` re-checks `sv` against the DB, so a new OAuth user
still needs a `session_version` — rely on the column's existing `NOT NULL DEFAULT 0` (or set it
explicitly, below). Keep the `UNIQUE` on email — the entire auto-link decision assumes `SELECT ...
WHERE email = ?` yields at most one row — and note SQLite treats every NULL as distinct under UNIQUE,
so password-less NULL-email rows never collide with each other.

## src/auth/oauth/providers.js — registry + PKCE/state helpers

```js
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../../lib/env.js';

// OIDC providers (Google) hand us an id_token we verify against their JWKS. Non-OIDC (GitHub) have
// NO id_token — we call userinfo with the access token and fetch email verification separately. Both
// converge on { providerUserId, email, emailVerified }. Endpoints are hard-coded (not discovered) so
// a tampered discovery response cannot redirect our token exchange.
export const PROVIDERS = {
  google: {
    kind: 'oidc', clientId: env.OAUTH_GOOGLE_CLIENT_ID, clientSecret: env.OAUTH_GOOGLE_CLIENT_SECRET,
    // Google mints `iss` as EITHER bare host or https URL — both are valid per Google's own docs.
    // Pinning only one form would REJECT legitimate tokens (a real login-availability bug), so we pass
    // the explicit allow-list to jwtVerify (jose accepts a string[]). This is an exhaustive set, NOT a
    // loosened check — anything outside these two exact strings is still rejected.
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    scope: 'openid email profile',
  },
  github: {
    kind: 'oauth2', clientId: env.OAUTH_GITHUB_CLIENT_ID, clientSecret: env.OAUTH_GITHUB_CLIENT_SECRET,
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user', emailsUrl: 'https://api.github.com/user/emails',
    scope: 'read:user user:email',
  },
};
export const isProvider = (p) => Object.hasOwn(PROVIDERS, p);
export const redirectUri = (p) => `${env.OAUTH_REDIRECT_BASE}/api/auth/oauth/${p}/callback`;

// PKCE (RFC 7636): the verifier stays in our flow cookie; only its SHA-256 challenge goes to the
// provider. Presenting the verifier at exchange proves we started the flow — a leaked code is useless.
// GitHub added S256 PKCE support in 2025, so both providers accept the verifier at exchange.
export const random = () => randomBytes(32).toString('base64url'); // used for state/nonce/verifier
export const challengeOf = (verifier) => createHash('sha256').update(verifier).digest('base64url');
// state/nonce are secrets we minted — compare them in constant time so a timing side-channel cannot
// leak our value to an attacker able to replay callbacks with chosen values.
export function safeEqual(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
```

## src/auth/oauth/flowcookie.js — signed flow state

```js
// The ONLY place state/nonce/code_verifier live between /start and /callback. We SIGN (not encrypt) a
// compact JWT with its own secret: the values aren't secret from the user's own browser, but they must
// be tamper-proof and bound to this browser. 10-min TTL bounds the replay window; HttpOnly + SameSite=Lax
// survives the top-level redirect back from the provider while blocking cross-site reads.
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../lib/env.js';

const secret = Buffer.from(env.OAUTH_STATE_SECRET, 'base64url');
const isProd = env.NODE_ENV === 'production';
const FLOW_TTL_SEC = 600;
// __Host- pins the cookie to this exact host, Path=/, no Domain — the strongest binding. It REQUIRES
// Secure, so we only use the prefix in prod; dev falls back to an unprefixed non-Secure name.
export const flowCookieName = (p) => (isProd ? `__Host-oauth_${p}` : `oauth_${p}`);

export const signFlow = (payload) => new SignJWT(payload)
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${FLOW_TTL_SEC}s`).sign(secret);
export const verifyFlow = async (token) =>
  (await jwtVerify(token, secret, { algorithms: ['HS256'] })).payload; // {state,nonce,codeVerifier,returnTo}

const opts = { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' };
export const setFlowCookie = (res, p, token) =>
  res.cookie(flowCookieName(p), token, { ...opts, maxAge: FLOW_TTL_SEC * 1000 });
export const clearFlowCookie = (res, p) => res.clearCookie(flowCookieName(p), opts);
```

## src/auth/oauth/verify.js — exchange code + verify profile

```js
// Turns a callback code into a TRUSTED profile. For OIDC we verify the id_token against the JWKS with
// pinned iss/aud/alg/nonce. For GitHub we call the API and read the primary VERIFIED email. Either way
// the caller gets the same vetted shape and never sees a raw provider token.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PROVIDERS, redirectUri, safeEqual } from './providers.js';

// One JWKS resolver per jwks_uri (jose fetches, caches, and rotates keys internally). Module-level:
// the keys are reused across logins, refetched only on cache miss / kid rotation.
const jwks = new Map();
function jwksFor(cfg) {
  let set = jwks.get(cfg.jwksUri);
  if (!set) { set = createRemoteJWKSet(new URL(cfg.jwksUri)); jwks.set(cfg.jwksUri, set); }
  return set;
}

async function exchangeCode(cfg, provider, code, codeVerifier) {
  const r = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri(provider),
      client_id: cfg.clientId, client_secret: cfg.clientSecret, // confidential client — secret server-side only
      code_verifier: codeVerifier,                              // PKCE proof (both providers accept it)
    }),
  });
  if (!r.ok) throw new Error(`token exchange failed: ${r.status}`);
  const tokens = await r.json();
  // GitHub violates the OAuth2 spec: on a bad/expired code or wrong client secret it returns HTTP 200
  // with an `error` field instead of a 4xx. Without this check we sail past `!r.ok` and then hand
  // `access_token: undefined` to the userinfo call — NEVER trust the status alone; check the body.
  if (tokens.error) throw new Error(`token exchange error: ${tokens.error}`);
  if (!tokens.access_token) throw new Error('token exchange returned no access_token');
  return tokens;
}

async function profileFromOidc(cfg, tokens, expectedNonce) {
  if (!tokens.id_token) throw new Error('missing id_token');
  const { payload } = await jwtVerify(tokens.id_token, jwksFor(cfg), {
    issuer: cfg.issuers,    // exhaustive allow-list — blocks a token minted by a different provider
    audience: cfg.clientId, // the token was issued FOR our client, not reused from elsewhere
    algorithms: ['RS256'],  // pin alg — blocks alg-confusion / 'none' (RFC 8725)
  });
  // Constant-time: the nonce is a secret we minted; an early-exit `!==` could leak it to an attacker
  // able to replay callbacks with chosen id_tokens. Also rejects a token with no/empty nonce claim.
  if (typeof payload.nonce !== 'string' || !safeEqual(payload.nonce, expectedNonce)) {
    throw new Error('nonce mismatch'); // binds token to THIS flow
  }
  return {
    providerUserId: String(payload.sub), // stable subject — the real identity key
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
    emailVerified: payload.email_verified === true,
  };
}

async function profileFromGithub(cfg, tokens) {
  const headers = { authorization: `Bearer ${tokens.access_token}`,
    accept: 'application/vnd.github+json', 'user-agent': 'app-oauth' };
  const [userRes, emailsRes] = await Promise.all(
    [fetch(cfg.userUrl, { headers }), fetch(cfg.emailsUrl, { headers })]);
  if (!userRes.ok || !emailsRes.ok) throw new Error('github userinfo failed');
  const user = await userRes.json();
  const emails = await emailsRes.json();
  // Trust ONLY a primary + verified address. GitHub lets users add unverified emails; treating one as
  // verified would be the exact takeover hole this file guards against. Strict === true on both flags.
  const primary = Array.isArray(emails)
    ? emails.find((e) => e && e.primary === true && e.verified === true) : null;
  return {
    providerUserId: String(user.id), // numeric id is stable; the login/username is NOT
    email: primary && typeof primary.email === 'string' ? primary.email.toLowerCase() : null,
    emailVerified: Boolean(primary),
  };
}

export async function fetchVerifiedProfile(provider, code, codeVerifier, expectedNonce) {
  const cfg = PROVIDERS[provider];
  const tokens = await exchangeCode(cfg, provider, code, codeVerifier);
  return cfg.kind === 'oidc'
    ? profileFromOidc(cfg, tokens, expectedNonce)
    : profileFromGithub(cfg, tokens);
}
```

## src/auth/oauth/routes.js — /start, /callback, resolution

```js
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as db from '../../db/index.js';
import { logger } from '../../lib/logger.js';
import { issueSession } from '../session.js'; // the SAME helper password login uses (auth-blueprint.md)
import { PROVIDERS, isProvider, redirectUri, random, challengeOf, safeEqual } from './providers.js';
import { signFlow, verifyFlow, setFlowCookie, clearFlowCookie, flowCookieName } from './flowcookie.js';
import { fetchVerifiedProfile } from './verify.js';

const router = Router();
const skipInTest = () => process.env.NODE_ENV === 'test';
const oauthLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true,
  legacyHeaders: false, skip: skipInTest });

// returnTo is an OPEN-REDIRECT sink. Allow only a same-site PATH: must start with a single '/', reject
// a leading '//' (protocol-relative), and — because the char class excludes '\' — reject any backslash
// (browsers normalize '\' to '/', so '/\evil.com' would escape to another host after redirect).
const StartQuery = z.object({
  returnTo: z.string().max(512).regex(/^\/(?!\/)[\w\-./?=&%#]*$/, 'must be a local path').default('/'),
}).strict();

// GET so it can be a plain <a href> top-level navigation. It only SETS a cookie and redirects — no
// server state changes — so being CSRF-exempt is safe; the signed state IS the CSRF defense.
router.get('/:provider/start', oauthLimiter, async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!isProvider(provider)) return res.status(404).json({ error: 'unknown provider' });
    const q = StartQuery.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: 'invalid input' });

    const cfg = PROVIDERS[provider];
    const state = random(), nonce = random(), codeVerifier = random();
    // Bind state+nonce+verifier to THIS browser via the signed flow cookie — no server-side store.
    setFlowCookie(res, provider, await signFlow({ state, nonce, codeVerifier, returnTo: q.data.returnTo }));

    const params = new URLSearchParams({
      client_id: cfg.clientId, redirect_uri: redirectUri(provider), response_type: 'code',
      scope: cfg.scope, state, code_challenge: challengeOf(codeVerifier), code_challenge_method: 'S256',
    });
    if (cfg.kind === 'oidc') params.set('nonce', nonce); // OIDC-only; GitHub ignores it
    res.redirect(`${cfg.authUrl}?${params}`);
  } catch (err) { next(err); }
});

// error/code/state are all attacker-influenceable — validate the shape before touching them.
// Deliberately NOT .strict() (exception to the house rule, which covers payloads WE author): the
// provider authors this query string and appends extras — Google adds scope/authuser/prompt (and hd),
// GitHub error redirects carry error_description/error_uri — and RFC 6749 §4.1.2 requires clients to
// ignore unrecognized response params. .strict() would 400 every real Google login. Default z.object()
// strips unknown keys, which is exactly "ignore".
const CallbackQuery = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(512).optional(),
  error: z.string().max(256).optional(),
});

router.get('/:provider/callback', oauthLimiter, async (req, res, next) => {
  const { provider } = req.params;
  try {
    if (!isProvider(provider)) return res.status(404).json({ error: 'unknown provider' });
    const q = CallbackQuery.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: 'invalid callback' });
    if (q.data.error) return res.status(400).json({ error: 'authorization denied' }); // user cancelled
    if (!q.data.code || !q.data.state) return res.status(400).json({ error: 'invalid callback' });

    const raw = req.cookies[flowCookieName(provider)]; // cookie-parser is already mounted (auth-blueprint.md)
    if (!raw) return res.status(400).json({ error: 'no flow in progress' });
    let flow;
    try { flow = await verifyFlow(raw); }                 // rejects a tampered/expired cookie
    catch { clearFlowCookie(res, provider); return res.status(400).json({ error: 'expired flow' }); }

    // CSRF: provider-returned state MUST equal the one we minted into this browser's cookie.
    if (!safeEqual(q.data.state, flow.state)) {
      clearFlowCookie(res, provider);
      logger.warn({ provider }, 'oauth state mismatch');
      return res.status(400).json({ error: 'state mismatch' });
    }
    clearFlowCookie(res, provider); // consume the flow cookie now; replay is further bounded by its short TTL

    // Exchange code (with PKCE verifier) → VERIFIED profile. nonce is checked inside for OIDC.
    const profile = await fetchVerifiedProfile(provider, q.data.code, flow.codeVerifier, flow.nonce);

    const resolved = await resolveUser(provider, profile);
    if (resolved.needsLink) return res.redirect(`/login?link=${provider}`); // explicit link step (below)

    // Converge on the identical session path as password login: our JWT + rotating refresh family.
    // Call issueSession with the SAME 5-arg signature /login and /magic/verify use
    // (auth-blueprint.md): res, user, new familyId, familyCreatedAt (unix seconds), user-agent.
    await issueSession(res, resolved.row, randomUUID(), Math.floor(Date.now() / 1000), req.get('User-Agent'));
    res.redirect(flow.returnTo || '/'); // top-level navigation; returnTo was path-validated at /start
  } catch (err) {
    clearFlowCookie(res, provider);
    logger.warn({ provider, err: err.message }, 'oauth callback failed'); // err.message only — never tokens/query
    res.status(400).json({ error: 'oauth failed' });
  }
});

// Map a verified profile to a local user, ordered by trust:
//   1. Known identity → log that user in (common repeat-login).
//   2. Verified email matches a local user → SAFE auto-link (provider proved control of that inbox).
//   3. Verified email, no local user → create a fresh password-less account + identity, atomically.
//   4. UNVERIFIED email → NEVER auto-link/auto-create by email; force the explicit link step.
// The point: an identity attaches to an existing account ONLY when the provider ASSERTED the email is
// verified — otherwise "same email" is an unproven claim and auto-linking it is takeover-by-collision.
async function resolveUser(provider, profile) {
  const existing = await db.get(
    `SELECT u.* FROM oauth_identities oi JOIN users u ON u.id = oi.user_id
     WHERE oi.provider = ? AND oi.provider_user_id = ?`,
    [provider, profile.providerUserId]);        // match on the STABLE (provider, sub), never email
  if (existing) return { row: existing };

  if (!profile.email || !profile.emailVerified) {
    const collision = profile.email
      ? await db.get('SELECT id FROM users WHERE email = ?', [profile.email]) : null;
    if (collision) return { needsLink: true };   // unproven collision → explicit link
    // No verified email AND no colliding local account → mint an anonymous-ish user + identity
    // (users.email stays NULL — see createOauthUser below).
    return { row: await createOauthUser(provider, profile) };
  }

  const local = await db.get('SELECT * FROM users WHERE email = ?', [profile.email]);
  if (local) {
    // INSERT OR IGNORE + UNIQUE(provider, provider_user_id): two racing first-links can't double-insert.
    await db.run(
      `INSERT OR IGNORE INTO oauth_identities (provider, provider_user_id, user_id, email)
       VALUES (?, ?, ?, ?)`, [provider, profile.providerUserId, local.id, profile.email]);
    return { row: local };
  }
  return { row: await createOauthUser(provider, profile) };
}

// One worker tx so we never leave a user without its identity (or vice-versa). password_hash is NULL —
// the account signs in only via the provider until the user sets a password. Named worker tx: db-layer.md.
async function createOauthUser(provider, profile) {
  // Named worker tx exposed on the facade like every other one (db-layer.md):
  //   export const createOauthUser = (a) => pool.run(a, { name: 'createOauthUser' });
  // users.email gets the address ONLY when the provider asserted it verified. An unverified address
  // must never enter users.email: it would squat the UNIQUE(email) slot (silently blocking the real
  // owner's later registration) and would arm the tx's re-select-by-email race fallback with an
  // unproven claim (account takeover). The raw address still reaches the identity row, for audit.
  const { userId } = await db.createOauthUser({
    provider, providerUserId: profile.providerUserId,
    email: profile.emailVerified ? profile.email : null,
    identityEmail: profile.email,
  });
  return db.get('SELECT * FROM users WHERE id = ?', [userId]);
}

export default router;
```

Named worker transaction (add to `src/db/worker.js`, per [db-layer.md](db-layer.md)):

```js
// Insert the user and its first identity atomically. session_version is set explicitly so a brand-new
// OAuth user has a defined sv even if the column lacks a default.
//
// `email` is the users.email value — the caller passes NULL unless the provider VERIFIED the address.
// `identityEmail` is the raw provider address for the oauth_identities audit column (may equal email,
// an unverified string, or null). Two email regimes, both handled — the original single INSERT OR
// IGNORE + SELECT fallback CRASHES on the NULL-email path:
//   * email IS NULL (no provider-verified email): SQLite treats every NULL as DISTINCT, so a
//     UNIQUE(email) index NEVER collides on NULL — the insert always creates a row. We must NOT fall
//     back to `SELECT ... WHERE email = ?`, because `email = NULL` matches ZERO rows (SQL NULL never
//     equals NULL) and would leave `user` undefined → `user.id` throws. Branch on `email == null` first.
//   * email is a string (always provider-VERIFIED — the route nulls out unverified ones): a concurrent
//     request may have created that user between resolveUser's check and this tx; INSERT OR IGNORE
//     no-ops, and we re-select by the (unique) email. Attaching to that row is safe for the same
//     reason case-2 auto-link is: the provider proved control of the inbox.
// Standard exported worker function (house style: module-level getDb()/stmt(), one internal
// transaction), NOT an injected-db object method. Expose in src/db/index.js:
//   export const createOauthUser = (a) => pool.run(a, { name: 'createOauthUser' });
export function createOauthUser({ provider, providerUserId, email, identityEmail }) {
  const tx = getDb().transaction(() => {
    let userId;
    if (email == null) {
      // No dedupe key — always a fresh row. (Repeat logins are caught earlier by the identity lookup.)
      const info = stmt(
        'INSERT INTO users (email, password_hash, role, session_version) VALUES (NULL, NULL, ?, 0)')
        .run('user');
      userId = Number(info.lastInsertRowid);
    } else {
      const info = stmt(
        'INSERT OR IGNORE INTO users (email, password_hash, role, session_version) VALUES (?, NULL, ?, 0)')
        .run(email, 'user');
      userId = info.changes === 1
        ? Number(info.lastInsertRowid)
        : stmt('SELECT id FROM users WHERE email = ?').get(email).id; // lost the race → reuse
    }
    stmt(`INSERT OR IGNORE INTO oauth_identities (provider, provider_user_id, user_id, email)
          VALUES (?, ?, ?, ?)`).run(provider, providerUserId, userId, identityEmail);
    return { userId };
  });
  return tx.immediate();
}
```

## Explicit link step (case 4) & wiring

When `resolveUser` returns `needsLink`, the user finished OAuth but the email is unproven or collides —
do NOT link. Send them to `/login?link=<provider>`; after they authenticate with existing credentials,
an **authenticated** `POST /api/auth/oauth/:provider/link` (guarded by `requireAuth` + `csrfProtection`)
re-runs the flow and, because `req.user.id` is now trusted, inserts the identity with `INSERT OR
IGNORE`. This proves control of *both* accounts before merging — closing the by-collision takeover path.

- Mount under the auth router so the refresh cookie's `Path=/api/auth` scope is unchanged:
  `authRouter.use('/oauth', oauthRouter)` → routes at `/api/auth/oauth/:provider/*`.
- `/start` + `/callback` are GET top-level navigations, exempt from `csrfProtection` (no JSON body,
  `/start` changes no state); the signed `state` is their CSRF defense. `/link` keeps full CSRF.
  Login-CSRF is blocked structurally: the callback requires the `__Host-` flow cookie whose signed
  `state` matches the query, and an attacker cannot plant that cookie in the victim's browser cross-site.
- Never store or log a provider `access_token` / `id_token` — extract the profile, then drop them. The
  callback catch logs `err.message` only, never `req.query` or the raw tokens.
- Frontend: render `<a href="/api/auth/oauth/google/start?returnTo=/app">`; after the callback redirect
  the browser already holds our cookies, so the `api()` wrapper in
  [frontend-conventions.md](frontend-conventions.md) works with zero token handling.
- 5-check pass (mirrors [transaction-endpoints.md](transaction-endpoints.md)): **WIRING** state/nonce/
  verifier all in the signed cookie and each checked (state + nonce in constant time); **FORGE** id_token
  verified against JWKS with pinned iss-allow-list/aud/alg + nonce, and GitHub token errors (HTTP-200
  `error` body) are surfaced not swallowed; **REPLAY** flow cookie cleared on use + short TTL bounds the
  window (the cookie is stateless, so the clear is best-effort — the TTL is the hard bound);
  **RACE** identity insert is `INSERT OR IGNORE` under `UNIQUE(provider, provider_user_id)`, user create
  is atomic in one worker tx with a NULL-safe, race-safe re-select; **IDOR/TAKEOVER** auto-link ONLY on a
  provider-asserted verified email — every other case routes to the explicit link step — and an
  unverified address never enters `users.email` (it can neither squat the UNIQUE slot nor feed the
  tx's re-select fallback).