# Admin / back-office

Why this design: an admin surface is the highest-value target in the app — one compromised admin
session can read every user, flip kill switches, or delete data. So the back-office is **not** a
privileged corner of the normal API; it is a separate area with its own defense in depth:
`requireRole('admin')` + a **DB re-read of the role** (the JWT is a hint) + **mandatory step-up
re-auth on every mutation**, read-only by default, and **every action written to the hash-chained
audit log** (security-integrity.md) with the acting admin's id. An admin acting on a user's data is
still ownership-scoped and logged — never ambient god-mode. Cross-refs: [auth-blueprint](auth-blueprint.md)
(`requireRole`, `sv`, `invalidateSvCache`), [auth-mfa](auth-mfa.md) (`requireStepUp`),
[security-integrity](security-integrity.md) (`appendAudit`, chain), [transaction-endpoints](transaction-endpoints.md)
(5-pass, worker tx), [rate-limiting-and-abuse](rate-limiting-and-abuse.md).

## The admin gate — role + DB re-check + step-up [must]

Rationale: the JWT `role` claim can be up to 15 min stale (a just-demoted admin keeps the claim);
the DB is the truth, so re-read it — and require a fresh factor for every *mutation*, so a stolen
live session alone can't act.

```js
// src/admin/gate.js — compose on EVERY admin route. Order matters: authn → role hint → DB truth.
import * as db from '../db/index.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { requireStepUp } from '../auth/stepup.js'; // auth-mfa.md — proves a FRESH factor
import { logger } from '../lib/logger.js';

// Re-read the role from the DB. The requireRole() before it is a cheap fast-fail on the JWT hint;
// this is the authority. A demoted/banned admin is stopped here even inside the 30 s sv cache.
export async function requireAdminDb(req, res, next) {
  try {
    const row = await db.get('SELECT role, session_version FROM users WHERE id = ?', [req.user.id]);
    if (!row || row.role !== 'admin' || row.session_version !== req.user.sv) {
      logger.warn({ userId: req.user.id, path: req.path }, 'admin gate: DB role/sv mismatch');
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  } catch (err) { next(err); }
}

// READ-ONLY admin routes: authenticated admin, no step-up (viewing is not mutating).
export const adminRead = [requireAuth, requireRole('admin'), requireAdminDb];
// MUTATING admin routes: everything above PLUS a fresh factor. Read-only by default, explicit
// elevation to write — a live session is never enough to change state. requireStepUp is a
// FACTORY (auth-mfa.md): call it — passing it uncalled hands Express the factory instead of the
// middleware and every request through it hangs.
export const adminWrite = [...adminRead, requireStepUp()];
```

## Separate admin session scope [should]

Rationale: the `step_up` cookie (auth-mfa.md) is scoped `Path=/api`, so it already reaches
`/api/admin` — the admin gate above is the real boundary, not the cookie path. Two cheap, honest
hardening steps: mount admin behind its own Router so its middleware chain and logging are coherent,
and — if you want a step-up proof for a *public* sensitive action to NOT authorize an admin mutation
— give admin its own cookie name/path. That is a small refactor, not a config flag: `setStepUpCookie`
in `src/auth/stepup.js` is currently unexported and hardcodes `path: '/api'`, so you would export it,
add a `path` argument, and mint a distinct `__Secure-admin_step_up` cookie from the admin step-up
route. Don't assume it already parameterizes the path.

```js
// Mount admin behind its own Router so its chain (csrfProtection + adminRead/adminWrite) is coherent.
//   app.use('/api/admin', csrfProtection, adminRouter);  // server-skeleton.md
// Optional extra isolation: a dedicated admin step-up cookie (own name + Path=/api/admin) so a
// factor proven for a public action can't authorize an admin mutation. Requires the small
// export/path-arg refactor of setStepUpCookie noted above; requireStepUp must then read that name.
```

## Every admin action → the hash-chained audit log [must]

Rationale: the audit log is the only durable record of *who did what to whom*. Because
`appendAudit` (security-integrity.md) chains each row into the next, an admin who later edits the DB
to hide an abuse breaks the chain — `scripts/verify-audit.js` convicts them. Admin writes go through
a **named worker tx** so the mutation and its audit row commit or roll back together. `appendAudit`
is a worker-internal helper (it uses `stmt`/`getDb`), so it is only callable from inside a worker tx.

```js
// src/db/worker.js — one named tx per admin mutation. appendAudit() is defined in security-integrity.md.
// This is the ONLY way admin state changes: mutation + audit are atomic, ownership is re-checked here.
export function adminSetUserRole({ adminId, sv, targetUserId, newRole, ip, userAgent }) {
  const tx = getDb().transaction(() => {
    // Re-verify the ACTING admin is still live+admin inside the tx (anti-TOCTOU, matters under clustering).
    const admin = stmt('SELECT role, session_version FROM users WHERE id = ?').get(adminId);
    if (!admin || admin.role !== 'admin' || admin.session_version !== sv) throw new TxError('FORBIDDEN');
    if (targetUserId === adminId) throw new TxError('SELF');       // no self-privilege-edits
    const target = stmt('SELECT id, role FROM users WHERE id = ?').get(targetUserId);
    if (!target) throw new TxError('NOT_FOUND');

    // Bump sv so the target's live tokens re-derive their role immediately (auth-blueprint.md);
    // a promotion/demotion that takes 15 min to apply is a security bug.
    stmt('UPDATE users SET role = ?, session_version = session_version + 1 WHERE id = ?')
      .run(newRole, targetUserId);

    // The admin's id is the actor; the target and before/after are the subject. Not god-mode: logged.
    appendAudit({
      userId: adminId,
      action: 'admin.user.role_change',
      detail: JSON.stringify({ targetUserId, from: target.role, to: newRole }),
      ip, userAgent,
    });
    return { ok: true };
  });
  try { return tx.immediate(); }
  catch (err) { if (err instanceof TxError) return { ok: false, code: err.txCode }; throw err; }
}
```

```js
// src/db/index.js — expose it on the async facade (db-layer.md).
export const adminSetUserRole = (a) => pool.run(a, { name: 'adminSetUserRole' });
```

```js
// src/admin/routes.js — the route is thin: validate, call the tx, invalidate the target's sv cache.
import { Router } from 'express';
import { z } from 'zod';
import * as db from '../db/index.js';
import { logger } from '../lib/logger.js';
import { invalidateSvCache } from '../auth/middleware.js';
import { adminWrite } from './gate.js';

const router = Router();
const RoleSchema = z.object({
  targetUserId: z.number().int().positive(),
  newRole: z.enum(['user', 'admin']),   // enum, never a free string → no privilege typo injection
}).strict();

router.post('/users/role', adminWrite, async (req, res, next) => {
  try {
    const body = RoleSchema.parse(req.body);
    const r = await db.adminSetUserRole({
      adminId: req.user.id, sv: req.user.sv,
      targetUserId: body.targetUserId, newRole: body.newRole,
      ip: req.ip, userAgent: req.get('User-Agent'),
    });
    if (!r.ok) {
      // Denied admin attempts are logged OUTSIDE the rolled-back tx (transaction-endpoints.md rule).
      logger.warn({ adminId: req.user.id, ...body, code: r.code }, 'admin action denied');
      const map = { FORBIDDEN: [403, 'forbidden'], SELF: [400, 'cannot edit own role'], NOT_FOUND: [404, 'not found'] };
      const [status, msg] = map[r.code] ?? [500, 'internal server error'];
      return res.status(status).json({ error: msg });
    }
    invalidateSvCache(body.targetUserId); // this process' cache; other workers expire within 30 s
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
```

## Force logout-all for a target user [must]

Rationale: incident response needs a kill switch to eject a specific user's sessions. Same
primitive as the user's own logout-all (auth-blueprint.md) but performed *by* an admin *on* a
target — so it is step-up-gated and audited with both ids.

```js
// src/db/worker.js
export function adminForceLogout({ adminId, sv, targetUserId, ip, userAgent }) {
  const tx = getDb().transaction(() => {
    const admin = stmt('SELECT role, session_version FROM users WHERE id = ?').get(adminId);
    if (!admin || admin.role !== 'admin' || admin.session_version !== sv) throw new TxError('FORBIDDEN');
    if (!stmt('SELECT 1 FROM users WHERE id = ?').get(targetUserId)) throw new TxError('NOT_FOUND');
    stmt('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(targetUserId);
    stmt('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(targetUserId);
    appendAudit({ userId: adminId, action: 'admin.user.force_logout',
      detail: JSON.stringify({ targetUserId }), ip, userAgent });
    return { ok: true };
  });
  try { return tx.immediate(); }
  catch (err) { if (err instanceof TxError) return { ok: false, code: err.txCode }; throw err; }
}
// Route: `router.post('/users/:id/logout', adminWrite, ...)` → call, then invalidateSvCache(targetId).
```

## Read admin views — ownership-logged, never bulk-dumped [must]

Rationale: viewing a user's private data is itself a sensitive act. Reads are `adminRead` (no
step-up), but *targeted* reads of PII are still recorded, and lists are paginated/bounded so a
single call can't exfiltrate the whole table. Because `appendAudit` only runs inside a worker tx,
audit-only writes (a view with no accompanying mutation) go through a dedicated named worker tx —
`adminAuditView` — exposed on the facade, NOT a bare `appendAudit` call from the route.

```js
// src/db/worker.js — audit-only write: one row through appendAudit, no other mutation.
export function adminAuditView({ adminId, action, detail, ip, userAgent }) {
  getDb().transaction(() => {
    appendAudit({ userId: adminId, action, detail, ip, userAgent });
  }).immediate();
  return { ok: true };
}
// src/db/index.js:  export const adminAuditView = (a) => pool.run(a, { name: 'adminAuditView' });
```

```js
router.get('/users', adminRead, async (req, res, next) => {
  try {
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50), // bounded: no full-table dump
      cursor: z.coerce.number().int().nonnegative().default(0),
    }).strict().parse(req.query);
    const rows = await db.all(
      'SELECT id, email, role, created_at FROM users WHERE id > ? ORDER BY id LIMIT ?', [q.cursor, q.limit]);
    res.json({ users: rows, nextCursor: rows.length ? rows[rows.length - 1].id : null });
  } catch (err) { next(err); }
});

// Viewing ONE user's sensitive profile is auditable — log the access itself (append-only worker tx).
router.get('/users/:id', adminRead, async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const user = await db.get('SELECT id, email, role, created_at FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'not found' });
    await db.adminAuditView({ adminId: req.user.id, action: 'admin.user.view',
      detail: JSON.stringify({ targetUserId: id }), ip: req.ip, userAgent: req.get('User-Agent') });
    res.json({ user });
  } catch (err) { next(err); }
});
```

## Safe destructive actions — typed confirmation + soft-delete + guard-in-UPDATE [must]

Rationale: irreversible admin actions are where a fat-finger or a coerced admin does the most
damage. Three layers: require a **typed confirmation token** echoing the exact target (not a
boolean), **soft-delete** (reversible) rather than hard `DELETE`, and put the guard **inside the
UPDATE** so a stale view can't delete the wrong/already-gone row.

```js
const DeleteSchema = z.object({
  targetUserId: z.number().int().positive(),
  confirm: z.string(),   // must equal `delete-user-<id>` — proves the admin saw THIS id, not any id
}).strict();

router.post('/users/delete', adminWrite, async (req, res, next) => {
  try {
    const body = DeleteSchema.parse(req.body);
    if (body.confirm !== `delete-user-${body.targetUserId}`) {
      return res.status(400).json({ error: 'confirmation does not match target' });
    }
    const r = await db.adminSoftDeleteUser({
      adminId: req.user.id, sv: req.user.sv, targetUserId: body.targetUserId,
      ip: req.ip, userAgent: req.get('User-Agent'),
    });
    if (!r.ok) {
      const map = { FORBIDDEN: [403, 'forbidden'], SELF: [400, 'cannot delete self'],
                    ALREADY: [409, 'already deleted'], NOT_FOUND: [404, 'not found'] };
      const [status, msg] = map[r.code] ?? [500, 'internal server error'];
      return res.status(status).json({ error: msg });
    }
    invalidateSvCache(body.targetUserId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

```js
// src/db/worker.js — soft-delete: reversible, guarded, sessions killed, audited. No hard DELETE here.
export function adminSoftDeleteUser({ adminId, sv, targetUserId, ip, userAgent }) {
  const tx = getDb().transaction(() => {
    const admin = stmt('SELECT role, session_version FROM users WHERE id = ?').get(adminId);
    if (!admin || admin.role !== 'admin' || admin.session_version !== sv) throw new TxError('FORBIDDEN');
    if (targetUserId === adminId) throw new TxError('SELF');
    if (!stmt('SELECT 1 FROM users WHERE id = ?').get(targetUserId)) throw new TxError('NOT_FOUND');

    // Guard lives IN the UPDATE: only an active row transitions, so a double-submit or a stale
    // admin view can't "delete" twice — changes===0 means it was already gone (anti-TOCTOU).
    const del = stmt(
      'UPDATE users SET deleted_at = unixepoch() WHERE id = ? AND deleted_at IS NULL'
    ).run(targetUserId);
    if (del.changes === 0) throw new TxError('ALREADY');

    stmt('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(targetUserId); // eject sessions
    stmt('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(targetUserId);
    appendAudit({ userId: adminId, action: 'admin.user.soft_delete',
      detail: JSON.stringify({ targetUserId }), ip, userAgent });
    return { ok: true };
  });
  try { return tx.immediate(); }
  catch (err) { if (err instanceof TxError) return { ok: false, code: err.txCode }; throw err; }
}
// requires: ALTER TABLE users ADD COLUMN deleted_at INTEGER;  and every user-facing query filters
// `WHERE deleted_at IS NULL`. Hard erasure (GDPR) is a separate, later, also-audited job.
```

## Impersonation / "view as user" — time-boxed and loud [should]

Rationale: support sometimes needs to see what a user sees, but impersonation is a god-mode feature
that must never be silent or open-ended. Mint a **short, hard-capped, distinct impersonation token**
that carries BOTH ids, is read-only unless separately elevated, and logs start *and* stop. It is a
separate credential — never a copy of the target's real session. It reuses the access-token keyring
(auth-blueprint.md) so a JWT-secret rotation doesn't silently invalidate live impersonations, and
its own audience keeps it unusable as an access token (`verifyAccessToken` pins audience `app`).

```js
// src/admin/impersonation.js
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../lib/env.js';
import * as db from '../db/index.js';

const IMP_AUD = 'impersonation';
const IMP_TTL_SEC = 10 * 60;                 // hard time-box: expires on its own, no refresh path
// House cookie rule (auth-mfa.md): __Secure- prefix gated on production, plain name in dev.
const IMP_COOKIE = env.NODE_ENV === 'production' ? '__Secure-imp' : 'imp';
// Same kid keyring as access tokens (auth-blueprint.md): sign with the current key, verify against either.
const keyring = new Map([[env.JWT_KID, Buffer.from(env.JWT_SECRET, 'base64url')]]);
if (env.JWT_SECRET_PREV && env.JWT_KID_PREV) {
  keyring.set(env.JWT_KID_PREV, Buffer.from(env.JWT_SECRET_PREV, 'base64url'));
}
const verifyKey = (header) => { const k = keyring.get(header.kid); if (!k) throw new Error('unknown kid'); return k; };

// Behind adminWrite → step-up required to START impersonating. Token names actor AND subject.
export async function startImpersonation(req, res, next) {
  try {
    const targetUserId = z.coerce.number().int().positive().parse(req.params.id);
    const target = await db.get('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL', [targetUserId]);
    if (!target) return res.status(404).json({ error: 'not found' });
    if (target.role === 'admin') return res.status(403).json({ error: 'cannot impersonate an admin' });

    const token = await new SignJWT({ act: req.user.id, readOnly: true }) // act = the real admin behind the mask
      .setProtectedHeader({ alg: 'HS256', kid: env.JWT_KID })
      .setSubject(String(targetUserId)).setJti(randomUUID())
      .setIssuedAt().setAudience(IMP_AUD).setExpirationTime(`${IMP_TTL_SEC}s`).sign(keyring.get(env.JWT_KID));

    await db.adminAuditView({ adminId: req.user.id, action: 'admin.impersonate.start',
      detail: JSON.stringify({ targetUserId, ttlSec: IMP_TTL_SEC }), ip: req.ip, userAgent: req.get('User-Agent') });

    // Its own short-lived, Strict cookie, Path=/api (it must reach normal user routes) — separate
    // from the real access cookie.
    res.cookie(IMP_COOKIE, token, { httpOnly: true, secure: env.NODE_ENV === 'production',
      sameSite: 'strict', path: '/api', maxAge: IMP_TTL_SEC * 1000 });
    res.json({ ok: true, expiresInSec: IMP_TTL_SEC });
  } catch (err) { next(err); }
}

// requireAuth variant that accepts an impersonation token: acts AS the subject but records the
// real admin in req.impersonator, and refuses any write unless the token dropped readOnly. Run it
// AFTER requireAuth (the admin's own session) so an expired/forged imp token can't stand alone.
export async function resolveImpersonation(req, res, next) {
  const token = req.cookies[IMP_COOKIE];
  if (!token) return next();
  try {
    const { payload } = await jwtVerify(token, verifyKey, { algorithms: ['HS256'], audience: IMP_AUD });
    // Bind the mask to its wearer: the cookie only acts for the SAME authenticated admin who minted
    // it. Otherwise whoever logs in next on that browser within the TTL — e.g. after the admin
    // logs out at a shared machine — would inherit the impersonation.
    if (!req.user || Number(payload.act) !== req.user.id) {
      res.clearCookie(IMP_COOKIE, { path: '/api' });
      return res.status(401).json({ error: 'impersonation not valid for this session' });
    }
    // Re-read the target's live sv so downstream checks see the impersonated user's real session state.
    const subId = Number(payload.sub);
    const target = await db.get('SELECT session_version FROM users WHERE id = ? AND deleted_at IS NULL', [subId]);
    if (!target) { res.clearCookie(IMP_COOKIE, { path: '/api' }); return res.status(401).json({ error: 'impersonation target gone' }); }
    req.user = { id: subId, role: 'user', sv: target.session_version };
    req.impersonator = Number(payload.act);   // for req child logger + audit on any action taken
    req.impersonationReadOnly = payload.readOnly === true;
    next();
  } catch { res.clearCookie(IMP_COOKIE, { path: '/api' }); return res.status(401).json({ error: 'impersonation expired' }); }
}
// Wire a mutation guard after it: if (req.impersonationReadOnly && !SAFE_METHODS.has(req.method))
//   return res.status(403).json({ error: 'impersonation is read-only' });
// End: `router.post('/admin/impersonate/stop', ...)` clears the cookie and db.adminAuditView
// 'admin.impersonate.stop'. Expiry alone also ends it — the time-box is the backstop.
```

## Checklist for any new admin endpoint

- Behind `adminRead` (view) or `adminWrite` (mutate)? Mutations MUST be `adminWrite` (step-up).
- Role re-read from the DB inside the worker tx, not trusted from the JWT claim?
- Every mutation goes through a named worker tx with `appendAudit` in the same tx (actor = admin id,
  subject = target id + before/after)? Denied attempts logged outside the tx? Audit-only views go
  through a named worker tx too (`appendAudit` is worker-internal, never called from a route)?
- Destructive? Typed confirmation echoing the exact target + soft-delete + guard-in-UPDATE?
- Acting on a user's data → ownership/existence re-checked in the tx, `invalidateSvCache(target)` after?
- Run the transaction-endpoints.md 5-pass (FORGE/REPLAY/RACE/IDOR/EXTREMES) against it.
