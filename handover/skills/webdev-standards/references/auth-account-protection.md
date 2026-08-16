# Account protection

Why this design: [auth-blueprint.md](auth-blueprint.md) proves *who* a request is; this file is the
account-owner's control *over* that — see and kill sessions, learn about a break-in, refuse breached
passwords, leave (deactivate/delete) — plus the abuse dampers that keep those flows from being
weaponized. Two invariants run through all of it: **an sv bump kills every live access token, so
always pair it with `invalidateSvCache(userId)`**; and **emails/notifications are fired async and
best-effort — never block or fail an auth flow on a third party** (`queueMicrotask` + `.catch()`).

No new packages: HIBP and CAPTCHA use the global `fetch`; email goes through the existing
`sendMail()` wrapper from `src/lib/mailer.js` ([auth-email-flows.md](auth-email-flows.md)). Secure
links reuse the opaque single-use token primitive from that file, not a new scheme.

Threat-model note on token storage: every account-security token here (refresh, reset, secure-link)
is a **32-byte cryptographically-random opaque secret** whose only stored form is `sha256(token)`.
Because the pre-image is a full 256-bit random value, an unsalted SHA-256 is correct — there is no
dictionary/rainbow risk, and lookups are exact-match on the stored digest, so no user-supplied secret
is ever compared against a stored secret in application code (the DB does the equality on a hash of an
unguessable value). `crypto.timingSafeEqual` is therefore reserved for the places that *do* compare a
supplied MAC/secret in-process — see [auth-email-flows.md](auth-email-flows.md); it is intentionally
absent here.

## Schema (new migration — see db-migrations-backups.md)

```sql
-- Enrich refresh families for the device UI (captured at issue time in issueSession).
ALTER TABLE refresh_tokens ADD COLUMN login_ip TEXT;
ALTER TABLE refresh_tokens ADD COLUMN login_geo TEXT;      -- coarse "City, CC" or just "CC"
ALTER TABLE refresh_tokens ADD COLUMN last_seen_at INTEGER; -- bumped on each rotation

-- Successful-login history for first-seen detection. Stores a coarse fingerprint HASH only, never
-- the raw UA/IP — so this table is not itself a tracking database.
CREATE TABLE IF NOT EXISTS login_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,             -- sha256(coarse UA + /24 or /48 IP subnet)
  geo TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, fingerprint);

-- Secure-account links: same single-use primitive as password_resets (auth-email-flows.md) —
-- hash of a 32-byte secret, atomic-consume, short expiry. The raw token lives only in the email.
CREATE TABLE IF NOT EXISTS security_actions (
  token_hash TEXT PRIMARY KEY,           -- sha256(token); raw token only ever in the email link
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,                   -- set on use; a consumed link must never work again
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Account lifecycle: status gates login; deletion_requested_at drives the grace-window purge.
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'; -- 'active' | 'disabled'
ALTER TABLE users ADD COLUMN deletion_requested_at INTEGER;         -- NULL unless scheduled

-- Every 2FA/recovery table must CASCADE so a hard delete leaves nothing behind (refresh_tokens
-- already does): totp_secrets, webauthn_credentials, recovery_codes, login_events, security_actions
-- all use  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
```

## Shared helpers — src/auth/account.js

Coarse, stable fingerprint so a version bump or DHCP lease change is *not* "a new device".

```js
import { createHash } from 'node:crypto';

export const coarseSubnet = (ip = '') => {
  // Node on a dual-stack listener reports IPv4 clients as IPv4-mapped IPv6 ("::ffff:1.2.3.4");
  // without unwrapping, every such client would collapse into one "::ffff" bucket.
  const norm = ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip;
  return norm.includes(':')
    ? norm.split(':', 3).join(':') /* IPv6 ~/48 */
    : norm.split('.', 3).join('.'); // IPv4 /24
};

export function uaFamily(ua = '') {
  // Match in PRIORITY order with includes(), not one regex alternation — regex.exec returns the
  // first match by position, and an Edge UA contains "Chrome" before "Edg" (likewise Android UAs
  // contain "Linux" before "Android"), which would misclassify them.
  const pick = (names) => names.find((n) => ua.includes(n));
  const b = pick(['Firefox', 'Edg', 'Chrome', 'Safari']) ?? 'browser';
  const os = pick(['Windows', 'Android', 'iPhone', 'Mac OS X', 'Linux']) ?? 'unknown';
  return `${b} on ${os}`;
}
export const loginFingerprint = (ua, ip) =>
  createHash('sha256').update(`${uaFamily(ua)}|${coarseSubnet(ip)}`).digest('hex');
```

`issueSession` (auth-blueprint.md) gains `loginIp`/`loginGeo` and writes them + `last_seen_at`;
`/refresh` sets `last_seen_at = unixepoch()` on the rotated row. Reuse that helper — do not
re-implement token issuance here.

Trust note: `req.ip` and the `User-Agent` are client-influenced. They are used here **only** as a
coarse fingerprint and for display — never as an authorization input — so spoofing them at worst
suppresses a "new device" alert for that attacker, which the owner's own secure-link still remedies.
For `req.ip` to be meaningful behind a proxy, `TRUST_PROXY` must be set (see env-and-secrets.md);
otherwise it is the proxy's address and every session collapses to one subnet — acceptable
degradation, not a vulnerability.

`geo` is optional and requires a geo-IP lookup middleware to populate `req.geo` (e.g. a MaxMind
lookup, or the `CF-IPCountry` header behind Cloudflare); without one every `req.geo ?? null`
degrades cleanly to `null` and the flows still work.

## Secure-account link — opaque, single-use (reuses the email-flow primitive)

The "Not you? Secure your account" link is the **same** primitive as a password reset
([auth-email-flows.md](auth-email-flows.md)): a 32-byte opaque secret whose **hash** is stored,
**consumed atomically** by a conditional UPDATE, **single-use** with a short expiry. Do NOT use a
signed JWT here — a signed token is replayable until it expires, which a break-in-recovery link must
not be.

```js
// src/auth/account.js
import { newRefreshToken, hashToken } from './tokens.js';
import { env } from '../lib/env.js';
import * as db from '../db/index.js';

const SECURE_LINK_TTL_SEC = 30 * 60; // 30 min — treat like a reset link

// Mint a single-use secure-account link; store only the hash, return the raw URL for the email.
export async function mintSecureLink(userId) {
  const token = newRefreshToken();               // 32-byte base64url — same primitive as refresh/reset
  await db.run(
    `INSERT INTO security_actions (token_hash, user_id, expires_at)
     VALUES (?, ?, unixepoch() + ?)`,
    [hashToken(token), userId, SECURE_LINK_TTL_SEC]
  );
  return `${env.APP_ORIGIN}/secure-account?token=${token}`; // raw token ONLY here, never logged
}
```

## Session / device management UI

Rationale: the user cannot revoke what they cannot see — this turns the family model into a control.

```js
// GET /api/auth/sessions — one row per active family, current flagged (no token hashes leaked).
router.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const raw = req.cookies[REFRESH_COOKIE];
    // Scope the current-family lookup to the caller so a stale/foreign cookie can never resolve to
    // another user's family (defense-in-depth even though the row is only used for an isCurrent flag).
    const currentFamily = raw
      ? (await db.get(
          'SELECT family_id FROM refresh_tokens WHERE token_hash = ? AND user_id = ?',
          [hashToken(raw), req.user.id]))?.family_id
      : null;
    const rows = await db.all(
      `SELECT family_id, MIN(family_created_at) AS login_at, MAX(last_seen_at) AS last_seen,
              MAX(user_agent) AS user_agent, MAX(login_geo) AS login_geo
         FROM refresh_tokens
        WHERE user_id = ? AND revoked = 0 AND expires_at > unixepoch()
        GROUP BY family_id ORDER BY last_seen DESC`,
      [req.user.id]
    );
    res.json({ sessions: rows.map((r) => ({
      familyId: r.family_id, device: uaFamily(r.user_agent ?? ''),
      location: r.login_geo ?? 'unknown', loginAt: r.login_at, lastSeen: r.last_seen,
      isCurrent: r.family_id === currentFamily,
    })) });
  } catch (err) { next(err); }
});
```

React page at `/settings/security`, lazy-loaded, fetching via `api()` and typed
([frontend-conventions.md](frontend-conventions.md)):

```ts
export interface Session { familyId: string; device: string; location: string;
  loginAt: number; lastSeen: number; isCurrent: boolean; }
// const { sessions } = await api<{ sessions: Session[] }>('/auth/sessions');
// non-current row "Log out" => api(`/auth/sessions/${familyId}`, { method: 'DELETE' })
```

## Log out this / other devices (per-family + all-but-current)

Rationale: revoking one stolen family must NOT log the user out everywhere (no sv bump); "everywhere
except here" must, and must survive its own bump by re-issuing the current session in the same tx.

```js
import { randomUUID } from 'node:crypto'; // used by /logout-others to mint the re-issued family_id

// Revoke ONE family. Ownership-scoped (anti-IDOR), NO sv bump — the current session survives.
router.delete('/sessions/:familyId', requireAuth, async (req, res, next) => {
  try {
    // families are minted with randomUUID() (v4) -> z.uuid() (RFC 9562 variant/version bits) accepts it.
    const { familyId } = z.object({ familyId: z.uuid() }).strict().parse(req.params);
    const r = await db.run(
      'UPDATE refresh_tokens SET revoked = 1 WHERE family_id = ? AND user_id = ?', [familyId, req.user.id]);
    if (r.changes === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Log out everywhere EXCEPT this device: revoke all families, bump sv, re-issue THIS session — one
// writeTx so the caller is never briefly locked out. The fresh access token carries the bumped sv.
router.post('/logout-others', requireAuth, async (req, res, next) => {
  try {
    const raw = req.cookies[REFRESH_COOKIE];
    const current = raw && await db.get(
      'SELECT family_id FROM refresh_tokens WHERE token_hash = ? AND user_id = ?', [hashToken(raw), req.user.id]);
    if (!current) return res.status(401).json({ error: 'unauthorized' });
    const user = await db.get('SELECT id, role, session_version FROM users WHERE id = ?', [req.user.id]);
    const newRefresh = newRefreshToken();
    await db.writeTx([
      { sql: 'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', params: [user.id] },
      { sql: 'UPDATE users SET session_version = session_version + 1 WHERE id = ?', params: [user.id] },
      { sql: `INSERT INTO refresh_tokens (token_hash, user_id, family_id, family_created_at, expires_at, user_agent, login_ip, login_geo, last_seen_at)
              VALUES (?, ?, ?, ?, unixepoch() + ?, ?, ?, ?, unixepoch())`,
        params: [hashToken(newRefresh), user.id, randomUUID(), Math.floor(Date.now() / 1000),
                 REFRESH_TTL_SEC, req.get('User-Agent') ?? null, req.ip, req.geo ?? null] },
    ]);
    invalidateSvCache(user.id); // MANDATORY after an sv bump
    setAuthCookies(res, await signAccessToken({ ...user, session_version: user.session_version + 1 }), newRefresh);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

## Suspicious-login email alerts (new device / IP / geo)

Rationale: first-seen device+location is the highest-signal, lowest-noise break-in indicator — alert
on it, but off the hot path so a slow mailer never delays the login.

```js
// Call after a SUCCESSFUL login, in /login right after issueSession (user has .id and .email).
async function recordLoginAndMaybeAlert(user, req) {
  const fp = loginFingerprint(req.get('User-Agent'), req.ip);
  const seen = await db.get(
    'SELECT 1 FROM login_events WHERE user_id = ? AND fingerprint = ? LIMIT 1', [user.id, fp]);
  await db.run('INSERT INTO login_events (user_id, fingerprint, geo) VALUES (?, ?, ?)',
    [user.id, fp, req.geo ?? null]);
  if (seen) return;
  const secureUrl = await mintSecureLink(user.id); // opaque single-use link, minted (awaited) before the send
  queueMicrotask(() => sendMail({
    to: user.email, subject: 'New sign-in to your account',
    text: `New sign-in detected.\nDevice: ${uaFamily(req.get('User-Agent'))}\n` +
          `Approx. location: ${req.geo ?? 'unknown'}\nTime: ${new Date().toISOString()}\n\n` +
          `Not you? Secure your account: ${secureUrl}`,
  }).catch((err) => logger.warn({ userId: user.id, err: err.message }, 'login alert email failed')));
}
```

## Breached-password check (HIBP k-anonymity)

Rationale: rejecting known-breached passwords at set-time stops the credential-stuffing rate limits
can't — and k-anonymity means the plaintext and full hash never leave the server.

```js
// src/auth/hibp.js — send only the first 5 SHA-1 hex chars; match the 35-char suffix locally.
// SHA-1 is used ONLY as HIBP's k-anonymity bucketing hash of a candidate password, never to store
// or verify a credential (passwords are stored with argon2id) — so this is not "SHA-1 for security".
import { createHash } from 'node:crypto';

export async function isPasswordBreached(password) {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5), suffix = sha1.slice(5); // suffix + plaintext never sent
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1500);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' }, signal: ac.signal, // padding masks the real result size
    }).finally(() => clearTimeout(t));
    if (!res.ok) return false;                 // fail-OPEN: a broken third party must not block signup
    // Each line is SUFFIX:COUNT; padding rows come back with COUNT 0, so require a positive count —
    // otherwise a randomised padding suffix collision could false-positive-reject a safe password.
    return (await res.text()).split('\n').some((l) => {
      const [suf, count] = l.split(':');
      return suf.trim().toUpperCase() === suffix && Number(count) > 0;
    });
  } catch { return false; }                    // timeout/network => fail open
}
```

Wire as an async guard in register / reset / change-password, AFTER the sync zod policy check (so a
too-short password is rejected without an API round-trip):

```js
const body = RegisterSchema.parse(req.body); // length/char-class policy (schemas.js `password`)
if (await isPasswordBreached(body.password)) {
  return res.status(400).json({ error: 'this password appeared in a data breach — choose another' });
}
```

Residual (SAFE_WITH_NOTES): `isPasswordBreached` **fails open** — a HIBP outage lets a breached
password through at set-time. This is deliberate (availability of signup/reset > this one advisory
check) and safe *because it is only a secondary gate*: the primary defenses (argon2id storage,
per-account rate limiting, and lockout) still stand. If your threat model needs fail-closed, flip the
two `return false` sites to `throw` and surface a "try again" — do not fail closed silently.

## Account deletion & deactivation (soft + hard, GDPR-aware)

Rationale: two intents, two mechanisms — *deactivate* is instantly reversible and keeps data;
*delete* is irreversible, so it demands step-up auth and a grace window before the CASCADE fires.

```js
// Deactivate: block login, log out everywhere, KEEP the data. Reversible by support.
router.post('/deactivate', requireAuth, async (req, res, next) => {
  try {
    await db.writeTx([
      { sql: `UPDATE users SET status = 'disabled' WHERE id = ?`, params: [req.user.id] },
      { sql: 'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', params: [req.user.id] },
      { sql: 'UPDATE users SET session_version = session_version + 1 WHERE id = ?', params: [req.user.id] },
    ]);
    invalidateSvCache(req.user.id);
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
// /login must reject disabled accounts with a DISTINCT message, placed AFTER argon2.verify so it
// stays constant-time vs a wrong password (the branch must not short-circuit before the hash work):
//   if (user.status === 'disabled') return res.status(403).json({ error: 'account is deactivated' });

// Request hard delete: STEP-UP re-auth (confirm password now), then schedule; the daily job purges.
const DeleteSchema = z.object({ password: z.string().min(1).max(128) }).strict();
router.post('/delete-account', requireAuth, async (req, res, next) => {
  try {
    const { password } = DeleteSchema.parse(req.body);
    const user = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    // argon2.verify is itself constant-time over the stored hash; guard the null user first so we
    // never call verify() with undefined (which would throw and leak timing via the error path).
    if (!user || !(await argon2.verify(user.password_hash, password))) {
      return res.status(401).json({ error: 'password confirmation failed' }); // step-up gate
    }
    await db.writeTx([
      { sql: `UPDATE users SET deletion_requested_at = unixepoch(), status = 'disabled' WHERE id = ?`,
        params: [req.user.id] },
      { sql: 'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', params: [req.user.id] },
      { sql: 'UPDATE users SET session_version = session_version + 1 WHERE id = ?', params: [req.user.id] },
    ]);
    invalidateSvCache(req.user.id);
    clearAuthCookies(res);
    logger.info({ userId: req.user.id, action: 'deletion_requested' }, 'account deletion scheduled'); // id only, no PII
    res.json({ ok: true, purgeAfterDays: 7 });
  } catch (err) { next(err); }
});
```

Extend the daily maintenance purge (the one that already prunes refresh tokens — see the
Maintenance section of [auth-blueprint.md](auth-blueprint.md)). CASCADE does the cross-table
cleanup — the worker sets `foreign_keys = ON` (grace window is 7 days, matching the
`purgeAfterDays` returned above):

```js
const GRACE_SEC = 7 * 24 * 60 * 60;
const doomed = await db.all(
  `SELECT id FROM users WHERE deletion_requested_at IS NOT NULL
     AND deletion_requested_at <= unixepoch() - ?`, [GRACE_SEC]);
for (const { id } of doomed) {
  await db.run('DELETE FROM users WHERE id = ?', [id]); // CASCADE removes tokens/totp/webauthn/recovery/login_events
  logger.info({ userId: id, action: 'account_hard_deleted' }, 'account purged after grace window');
}
// This file's tables also grow one row per event — sweep them in the same job (matching the
// consumed/expired token purge in auth-email-flows.md). Deleting old login_events just means a
// device unseen for 6 months re-alerts, which is the behavior you want anyway.
await db.run(`DELETE FROM security_actions WHERE consumed_at IS NOT NULL OR expires_at <= unixepoch()`);
await db.run(`DELETE FROM login_events WHERE created_at <= unixepoch() - ?`, [180 * 24 * 60 * 60]);
```

## CAPTCHA / proof-of-work on abuse signals (adaptive)

Rationale: an always-on CAPTCHA punishes every honest user and adds consent/vendor baggage — gate it
only when the risk counters we already keep (`failed_logins` / `next_login_at`) say abuse is likely.

```js
// src/auth/challenge.js — verify server-side. Prefer a self-hosted proof-of-work (Altcha-style) or
// a privacy-first provider. PoW: recompute the hash, check difficulty + unexpired + single-use.
// Hosted provider: POST to siteverify and fail CLOSED (an unverifiable challenge = not solved).
export async function verifyChallenge(token) {
  if (!token) return false;
  return await verifyPow(token); // boolean; MUST be single-use — a solved token consumed once,
                                 // else one solve replays across every gated attempt.
}

// Decide risk from state we ALREADY track — before spending argon2 cycles.
async function challengeRequired(email) {
  if (!email) return false;
  const u = await db.get('SELECT failed_logins, next_login_at FROM users WHERE email = ?', [email]);
  return !!u && (u.next_login_at > Math.floor(Date.now() / 1000) || u.failed_logins >= 3);
}

// In /login, /register, /forgot-password, BEFORE the expensive hash work:
if (await challengeRequired(body.email)) {
  if (!(await verifyChallenge(req.get('X-Challenge-Token')))) {
    return res.status(428).json({ error: 'challenge required', code: 'captcha_required' });
  }
}
```

Note: `verifyChallenge` MUST enforce single-use of the solved token (store a consumed nonce/jti and
reject replays), exactly like the secure-link consume below — otherwise an attacker solves one
challenge and replays it across a whole credential-stuffing run, defeating the gate. `challengeRequired`
keys on `email`, which is fine because the challenge only *adds* friction; it is never an auth
decision, so a missing/unknown email harmlessly returns `false`.

The React form reacts to `code: 'captcha_required'` by rendering the widget and retrying with the
solved token in `X-Challenge-Token`.

## Brute-force lockout + new-device notifications

Rationale: the owner is the only party who can tell a real break-in from their own typo — tell them,
with a one-click kill switch, but rate-limit the telling so it can't be turned into a mail-bomb.

```js
// src/auth/notify.js — best-effort, self-rate-limited security notifications.
import { mintSecureLink } from './account.js';

const lastNotified = new Map(); // `${userId}:${kind}` -> epoch. Per-process under clustering is acceptable.
const NOTIFY_COOLDOWN_SEC = 15 * 60;

export async function notifySecurity(user, kind, text) {
  const key = `${user.id}:${kind}`, now = Math.floor(Date.now() / 1000);
  if ((lastNotified.get(key) ?? 0) + NOTIFY_COOLDOWN_SEC > now) return; // anti-spam kill switch
  lastNotified.set(key, now);
  const secureUrl = await mintSecureLink(user.id); // single-use link, minted (awaited) before the async send
  queueMicrotask(() => sendMail({
    to: user.email, subject: 'Security alert on your account',
    text: `${text}\n\nThis wasn't you? Secure your account: ${secureUrl}`,
  }).catch((err) => logger.warn({ userId: user.id, kind, err: err.message }, 'security notify failed')));
}
// At the moment lockout engages in /login (fire once, when the threshold is first crossed):
//   if (delaySec > 0 && failed === 3) await notifySecurity(user, 'lockout',
//     `We temporarily blocked sign-ins after ${failed} failed attempts.`);
```

Cooldown residual (SAFE_WITH_NOTES): `lastNotified` is an in-process `Map`, so under cluster
([cluster-scaling.md](cluster-scaling.md)) the effective cooldown is per-worker — a determined
attacker rotating across N workers can trigger up to N mails per window. This is bounded (N is small,
each mail still carries a *fresh single-use* link that a scanner burning it only self-limits) and the
`sv`/lockout defenses do not depend on it, so it is acceptable; move the counter to the DB
(`security_actions`-style row keyed on `user_id,kind`) if a shared cooldown is required.

`/secure-account` **atomically consumes** the link's `token_hash` from `security_actions` (same
conditional-UPDATE arbiter as `/reset-password`), then runs the logout-all body from
[auth-blueprint.md](auth-blueprint.md) (revoke all families + bump sv + `invalidateSvCache`) and
routes into a password reset. Consume as a POST — never a raw GET that mutates on load, or a prefetch
or email-scanner would fire it and burn the single-use token:

```js
const SecureSchema = z.object({ token: z.string().min(1).max(256) }).strict();
router.post('/secure-account', async (req, res, next) => {
  try {
    const { token } = SecureSchema.parse(req.body);
    const tokenHash = hashToken(token);
    // Atomic single-use consume — the WHERE clause is the lock; a replay changes zero rows. RETURNING
    // hands back user_id from the SAME row we just flipped, so there is no second SELECT that could
    // race a concurrent hard-delete CASCADE (which would 500 on a null row) or read a different row.
    const rows = await db.all(
      `UPDATE security_actions SET consumed_at = unixepoch()
       WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > unixepoch()
       RETURNING user_id`,
      [tokenHash]
    );
    if (rows.length === 0) return res.status(400).json({ error: 'invalid or expired link' });
    const userId = rows[0].user_id;
    await db.writeTx([
      { sql: 'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', params: [userId] },
      { sql: 'UPDATE users SET session_version = session_version + 1 WHERE id = ?', params: [userId] },
    ]);
    invalidateSvCache(userId);
    clearAuthCookies(res);
    // Then mint a password_resets token and route the user into the reset flow (auth-email-flows.md).
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

## Wiring

- Every mutating route mounts behind `requireAuth` + the app-level `csrfProtection` + a per-account
  rate limiter (limiters carry `skip: () => process.env.NODE_ENV === 'test'`). `/secure-account` is
  the exception — it is consumed **before** login, so it takes a token in the body instead of
  `requireAuth`, still behind `csrfProtection` and its own limiter. (CSRF still applies: the consume
  is a state-changing POST, so it requires the `Sec-Fetch-Site` + `X-CSRF:1` + JSON-content-type
  triad from the app's `csrfProtection`; the single-use token is the *authorization*, CSRF is the
  *provenance* check — both are required.)
- `/secure-account`, `/deactivate`, `/delete-account`, `/logout-others` all end a session — clear
  cookies, and wherever sv is bumped call `invalidateSvCache(userId)` in the same turn.
- Emails/notifications are ALWAYS `queueMicrotask` + `.catch()` — a mailer outage must never turn a
  successful login into a 500 or a hung request. Mint the single-use secure link *before* entering
  the microtask so the DB write is awaited, not fire-and-forget.
- New env var: none — `APP_ORIGIN` (link base) is already defined by
  [auth-email-flows.md](auth-email-flows.md).