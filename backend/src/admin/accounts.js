// src/admin/accounts.js — the admin's view of accounts: the list, the inspect page, and the four
// account writes added by package B-admin-accounts (display name, reset lockout, sign out
// everywhere, force a password change).
//
// ═══ WHAT LIVES ELSEWHERE, ON PURPOSE ══════════════════════════════════════════════════════════
//
// The role, disable / enable and coin-adjustment routes keep the files and transactions they had
// (admin/routes.js, coins/routes.js): they are not reimplemented here. This router only adds.
//
// ═══ THE ROUTES CARRY NO AUTHORITY ═════════════════════════════════════════════════════════════
//
// Every guarantee is a property of a named worker transaction (db/tx/admin-accounts.js): the actor
// is re-read as an enabled admin under the write lock, a missing target is a 404, the same state
// again is a replay with one audit row. What is here is translation - a request into arguments, an
// outcome into a status code - plus the cheap rejections that come before the database:
// authentication, the JWT role gate, the rate limits, the zod schemas.
//
// ═══ ORDER ═════════════════════════════════════════════════════════════════════════════════════
//
// requireAuth -> requireRole('admin') -> per-IP limiter -> per-admin limiter -> assertAdmin (the
// role re-read from the DATABASE; 403 on a token that says admin and a database that does not) ->
// zod (params, body, query; 400) -> the named transaction (404 / 409 / applied).
// A role gate is 403, an object-level miss is 404, malformed input is 400 - and a non-admin gets
// the same 403 whatever id they ask about, so nothing here is an existence oracle.
import { Router } from 'express';
import { z } from 'zod';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireRole, invalidateSvCache, clearAuthCookies } from '../auth/middleware.js';
import { assertAdmin } from '../lib/assert-admin.js';
import { encodeCursor, decodeCursor, MAX_PAGE } from '../lib/cursor.js';
import { displayNameValue, CONTROLS, codePoints } from '../lib/display-name.js';
import { foldText, containsPattern } from '../lib/like.js';
import { adminReadIpLimiter, adminReadLimiter, adminWriteIpLimiter, adminWriteLimiter } from './limiters.js';
import { idParams } from './params.js';

const router = Router();

/* ── validation ──────────────────────────────────────────────────────────────────────────────── */

// The :id of every route here: a canonical decimal, 1..2^31-1 - admin/params.js (B-admin-polish moved
// it there so the older admin routes use the same rule).

const EmptyBody = z.object({}).strict();
const NameBody = z.object({ displayName: displayNameValue }).strict();

const SORT_KEYS = ['name', 'created', 'email', 'role', 'clients'];
/** A key's natural direction: names and addresses A-Z, newest and biggest first. */
const DEFAULT_DIR = { name: 'asc', email: 'asc', role: 'asc', created: 'desc', clients: 'desc' };

const listQuery = z
  .object({
    // Free text, matched as a substring of the e-mail and of the display name, accent- and case-
    // insensitively. It is NOT restricted to a character class (a Hungarian name has letters no
    // ASCII class admits): `%`, `_` and `\` are escaped in lib/like.js and the pattern is a bound
    // parameter, so nothing in it can act on the SQL. Bounded at 80 code points, control and bidi
    // characters refused; a blank search is no search.
    q: z
      .string()
      .trim()
      .refine((v) => !CONTROLS.test(v), 'control characters are not searchable')
      .refine((v) => codePoints(v) <= 80, 'too long')
      .optional(),
    role: z.enum(['user', 'coach', 'admin']).optional(),
    // 'enabled' is the old spelling of 'active', kept so an older client keeps working.
    state: z.enum(['all', 'active', 'enabled', 'disabled']).optional(),
    sort: z.enum(SORT_KEYS).optional(),
    dir: z.enum(['asc', 'desc']).optional(),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

/**
 * A cursor is `[sortKey, dir, value, id]`. It carries the sort KEY and DIRECTION it was minted for,
 * so a cursor cannot be replayed against a different ordering (where it would silently skip or
 * repeat rows), and the type of `value` must be the type that key sorts on. Anything else - not
 * base64url JSON, the wrong shape, another sort, a string where a count belongs - is a 400, not a
 * quiet restart from page one: a client that sends garbage has a bug it should hear about.
 */
const TEXT_SORTS = new Set(['name', 'email', 'role']);
function readCursor(raw, sort, dir) {
  const c = decodeCursor(raw);
  if (!Array.isArray(c) || c.length !== 4) return null;
  const [key, d, value, id] = c;
  if (key !== sort || d !== dir) return null;
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) return null;
  if (TEXT_SORTS.has(sort) ? typeof value !== 'string' || [...value].length > 80 : !Number.isSafeInteger(value) || value < 0) return null;
  return { value, id };
}

/* ── the list ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Find an account.
 *
 * ═══ THE PROJECTION IS THE SMALLEST THING THAT ANSWERS THE QUESTION ════════════════════════════
 *
 * An admin looking up a user needs to identify them, see their standing and open them. The columns
 * of the list are a whitelist in the transaction; `password_hash`, `session_version` and
 * `next_login_at` are absent - a support screen that leaks a hash is a credential store.
 *
 * ═══ PAGINATION: ONE KEYSET CURSOR PER SORT KEY ════════════════════════════════════════════════
 *
 * Five keys (name, created, email, role, clients), each with its own value type and the id as the
 * tiebreak, so a page boundary cannot skip or repeat a row when two accounts share a value. The page
 * is capped at MAX_PAGE rows whatever the client asks. `total` is the size of the whole FILTERED set
 * (the '19 fiók' line), read in the same snapshot as the page.
 */
router.get(
  '/admin/users',
  requireAuth,
  requireRole('admin'),
  adminReadIpLimiter,
  adminReadLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);

    const sort = parsed.data.sort ?? 'created';
    const dir = parsed.data.dir ?? DEFAULT_DIR[sort];
    const state = parsed.data.state === 'enabled' ? 'active' : (parsed.data.state ?? 'all');

    let after = null;
    if (parsed.data.cursor !== undefined) {
      after = readCursor(parsed.data.cursor, sort, dir);
      if (!after) return sendError(res, 400, ERR.VALIDATION);
    }

    // A search that folds to nothing (only spaces or combining marks) is no search.
    const q = parsed.data.q && foldText(parsed.data.q) !== '' ? parsed.data.q : null;

    const { rows, total } = await db.adminUsersList({
      pattern: q ? containsPattern(q) : null,
      role: parsed.data.role ?? null,
      state,
      sort,
      desc: dir === 'desc',
      after,
      limit: MAX_PAGE + 1,
    });

    const page = rows.slice(0, MAX_PAGE);
    const last = page[page.length - 1];
    res.json({
      users: page.map(({ sortValue, ...row }) => row),
      nextCursor: rows.length > MAX_PAGE && last ? encodeCursor([sort, dir, last.sortValue, last.id]) : null,
      sort: { key: sort, direction: dir },
      total,
    });
  }),
);

/* ── the inspect page ────────────────────────────────────────────────────────────────────────── */

/**
 * ONE request returns everything the account page shows. Opening a page costs one request against
 * the 300-per-15-minutes read budget, not one per section.
 *
 * Another account's e-mail is readable through this route (and the list) and nowhere else an admin
 * can reach; it is read-only here - no route in the product edits it.
 */
router.get(
  '/admin/users/:id',
  requireAuth,
  requireRole('admin'),
  adminReadIpLimiter,
  adminReadLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const p = idParams.safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);

    const detail = await db.adminAccountDetail({ targetId: p.data.id, actorId: req.user.id });
    if (!detail) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(detail);
  }),
);

/* ── the writes ──────────────────────────────────────────────────────────────────────────────── */

/**
 * The outcomes the four transactions can return that are not 'applied'. The same 409 envelope the
 * role / disable routes use (`reason` names the rule) is available for rules added later; today
 * these writes can only be refused as 'not an admin' or 'no such account'.
 */
function sendWriteRefusal(res, result) {
  if (result.outcome === 'missing') return sendError(res, 404, ERR.NOT_FOUND, 'not found');
  if (result.outcome === 'not_an_admin') return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
  throw new Error(`an admin account transaction returned an unmapped outcome: ${result.outcome}`);
}

/**
 * Set or clear somebody's display name. `{ displayName: string | null }`, validated by the SAME
 * validator as the user's own PATCH /auth/me. Editing your own name here is allowed. The e-mail has
 * no route: it is the login identity and there is no verification flow.
 */
router.patch(
  '/admin/users/:id/name',
  requireAuth,
  requireRole('admin'),
  adminWriteIpLimiter,
  adminWriteLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const p = idParams.safeParse(req.params);
    const body = NameBody.safeParse(req.body ?? {});
    if (!p.success || !body.success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.adminSetDisplayName({
      actorId: req.user.id,
      actorSessionVersion: req.user.sv,
      targetId: p.data.id,
      displayName: body.data.displayName,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });
    if (result.outcome !== 'applied') return sendWriteRefusal(res, result);

    // The name is deliberately NOT logged (the one field a person chose for themselves).
    req.log.info({ targetId: p.data.id, cleared: body.data.displayName === null }, 'account display name set by an admin');
    res.json({ account: result.account, replayed: result.replayed });
  }),
);

/** Clear the login lockout (failure counter and wait). Empty body. Nothing locked = replay. */
router.post(
  '/admin/users/:id/reset-lockout',
  requireAuth,
  requireRole('admin'),
  adminWriteIpLimiter,
  adminWriteLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const p = idParams.safeParse(req.params);
    if (!p.success || !EmptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.adminResetLockout({
      actorId: req.user.id,
      actorSessionVersion: req.user.sv,
      targetId: p.data.id,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });
    if (result.outcome !== 'applied') return sendWriteRefusal(res, result);

    req.log.info({ targetId: p.data.id, replayed: result.replayed }, 'account login lockout reset by an admin');
    res.json({ account: result.account, replayed: result.replayed });
  }),
);

/**
 * End every session of an account, now: refresh tokens revoked and the session version bumped, so
 * live access tokens die on their next request (the sv cache is dropped so that means the next one).
 * A replay only when nothing can still be signed in: no open refresh family AND no access token
 * minted since this action last ran (B-admin-polish - a logged-out device's copied access token used
 * to survive a "replayed" sign-out). Signing yourself out also clears your own cookies.
 */
router.post(
  '/admin/users/:id/signout-all',
  requireAuth,
  requireRole('admin'),
  adminWriteIpLimiter,
  adminWriteLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const p = idParams.safeParse(req.params);
    if (!p.success || !EmptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.adminSignOutAll({
      actorId: req.user.id,
      actorSessionVersion: req.user.sv,
      targetId: p.data.id,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });
    if (result.outcome !== 'applied') return sendWriteRefusal(res, result);

    const self = p.data.id === req.user.id;
    if (!result.replayed) {
      invalidateSvCache(p.data.id);
      if (self) clearAuthCookies(res);
    }
    req.log.warn({ targetId: p.data.id, sessions: result.sessions, replayed: result.replayed }, 'account sessions ended by an admin');
    res.json({ account: result.account, replayed: result.replayed, sessions: result.sessions, selfSignedOut: self && !result.replayed });
  }),
);

/**
 * Make the person set a new password at their next sign-in and end their sessions now. Empty body.
 * Already flagged AND nothing signed in = replay (a flagged account can still sign in to reach
 * change-credentials; forcing again ends that session). Doing it to yourself ends your own session
 * too (cookies cleared).
 */
router.post(
  '/admin/users/:id/force-password-change',
  requireAuth,
  requireRole('admin'),
  adminWriteIpLimiter,
  adminWriteLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const p = idParams.safeParse(req.params);
    if (!p.success || !EmptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.adminForcePasswordChange({
      actorId: req.user.id,
      actorSessionVersion: req.user.sv,
      targetId: p.data.id,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });
    if (result.outcome !== 'applied') return sendWriteRefusal(res, result);

    const self = p.data.id === req.user.id;
    if (!result.replayed) {
      invalidateSvCache(p.data.id);
      if (self) clearAuthCookies(res);
    }
    req.log.warn({ targetId: p.data.id, replayed: result.replayed }, 'account password change forced by an admin');
    res.json({ account: result.account, replayed: result.replayed, selfSignedOut: self && !result.replayed });
  }),
);

export default router;
