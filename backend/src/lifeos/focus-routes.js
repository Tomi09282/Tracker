// src/lifeos/focus-routes.js — focus sessions at the HTTP layer (migration 035, plan Phase 6).
//
//   GET   /focus               the open session first, then the newest closed ones (at most 50)
//   GET   /focus/current       the open session (or null), today's paid focus minutes, the rules
//   GET   /focus/:id           one session (focus-3 re-opened)
//   POST  /focus               start (or plan) a block: "Fókusz indítása"
//   POST  /focus/:id/checkin   "Rajta vagyok" — paced by the clock, moves no coin
//   POST  /focus/:id/finish    "Befejezés" — pays for the minutes spent + the check-ins
//   POST  /focus/:id/cancel    "Feladás" — pays nothing
//
// ═══ THE ROUTES CARRY NO AUTHORITY ═════════════════════════════════════════════════════════════
//
// finishFocusTx computes the payout from the stored plan, the stored (clock-paced) check-in count
// and the worker clock — no amount, minute count or time of finish is accepted from a client. The
// one time a client may name is a PLANNED start (`startAt`), and the transaction refuses one in the
// past: a block can only pay for minutes that pass after it was made. Every session id from the URL
// is honoured only through `WHERE id = ? AND user_id = ?` (another account's session is a 404).
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { clientKey, idParam } from './habit-routes.js';
import { ensureSettled } from './settle.js';
import { FOCUS_LIMITS } from './focus.js';

const router = Router();

const testSkip = () => process.env.NODE_ENV === 'test';

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, skip: testSkip });
const writeIpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, skip: testSkip });
const writeAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `focus:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});
/** The coin-moving finish and the bonus-raising check-in share a tighter budget per account. */
const payAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `focus-pay:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});

/* ── validation ─────────────────────────────────────────────────────────────────────────────── */

const title = z.string().trim().min(1).max(120).regex(/^[^\u0000-\u001f\u007f]+$/);

export const focusStartBody = z
  .object({
    clientKey,
    title,
    // focus-1 offers 25 / 50 perc / 1 / 1,5 / 2 óra; the API takes any whole minute in f_app's range.
    minutes: z.number().int().min(FOCUS_LIMITS.minMinutes).max(FOCUS_LIMITS.maxMinutes),
    // focus-1 offers Nincs / 10 / 15 / 30 perc; 0 = no check-ins, else at least the 5-minute gap.
    checkinMinutes: z
      .number()
      .int()
      .min(0)
      .max(FOCUS_LIMITS.maxCheckinMinutes)
      .refine((m) => m === 0 || m >= FOCUS_LIMITS.minCheckinGapMinutes, { message: 'a check-in interval is 0 or at least 5 minutes' }),
    // A PLANNED start, epoch seconds. Absent = now. The transaction refuses the past and > 24 h ahead.
    startAt: z.number().int().positive().max(4_102_444_800).optional(),
  })
  .strict();

const emptyBody = z.object({}).strict();
const emptyQuery = z.object({}).strict();

/* ── outcome -> status ──────────────────────────────────────────────────────────────────────── */

function refuse(res, r) {
  const rid = res.locals.requestId;
  switch (r.outcome) {
    case 'missing':
      return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    case 'timezone_required':
      return res.status(409).json({ error: 'set your time zone first', code: 'TIMEZONE_REQUIRED', requestId: rid });
    case 'busy':
      return res.status(409).json({ error: 'another focus session is still open', code: 'FOCUS_OPEN', session: r.session, requestId: rid });
    case 'cap':
      return res.status(409).json({ error: 'you have reached the limit', code: 'LIMIT_REACHED', limit: r.limit, requestId: rid });
    case 'not_started':
      return res.status(409).json({ error: 'this focus session has not started yet', code: 'FOCUS_NOT_STARTED', requestId: rid });
    case 'not_active':
      return res.status(409).json({ error: 'this focus session is not running', code: 'FOCUS_NOT_ACTIVE', session: r.session, requestId: rid });
    case 'no_checkins':
      return res.status(409).json({ error: 'this focus session has no check-ins', code: 'FOCUS_NO_CHECKINS', requestId: rid });
    case 'closed':
      return res.status(409).json({ error: 'this focus session is already closed', code: 'FOCUS_CLOSED', requestId: rid });
    case 'locked':
      return res.status(409).json({ error: 'this day has settled and can no longer be edited', code: 'DAY_LOCKED', requestId: rid });
    case 'invalid':
      return sendError(res, 400, ERR.VALIDATION, 'invalid input');
    default:
      throw new Error(`a focus transaction returned an unmapped outcome: ${r.outcome}`);
  }
}

const settle = (req, res) => ensureSettled(req.user.id, { requestId: res.locals.requestId, log: req.log });

/* ── reads ──────────────────────────────────────────────────────────────────────────────────── */

router.get(
  '/focus',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.focusList({ userId: req.user.id });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

router.get(
  '/focus/current',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.focusCurrent({ userId: req.user.id });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

router.get(
  '/focus/:id',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.focusSession({ userId: req.user.id, sessionId: p.data.id });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

/* ── writes ─────────────────────────────────────────────────────────────────────────────────── */

router.post(
  '/focus',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = focusStartBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { clientKey: key, ...input } = parsed.data;
    const r = await db.startFocus({ userId: req.user.id, input, clientKey: key });
    if (r.outcome === 'created') return res.status(201).json({ session: r.session });
    if (r.outcome === 'replayed') return res.json({ session: r.session, replayed: true });
    return refuse(res, r);
  }),
);

router.post(
  '/focus/:id/checkin',
  requireAuth,
  writeIpLimiter,
  payAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.checkinFocus({ userId: req.user.id, sessionId: p.data.id });
    if (r.outcome === 'counted') return res.json({ session: r.session, counted: true });
    // Not an error for the screen: the tap is answered, it just did not count (yet).
    if (r.outcome === 'not_due' || r.outcome === 'too_soon') {
      return res.json({ session: r.session, counted: false, reason: r.outcome });
    }
    return refuse(res, r);
  }),
);

router.post(
  '/focus/:id/finish',
  requireAuth,
  writeIpLimiter,
  payAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);
    // Yesterday settles first, so today's cap room and the focus day are the settled truth.
    await settle(req, res);
    const r = await db.finishFocus({ userId: req.user.id, sessionId: p.data.id, requestId: res.locals.requestId });
    if (r.outcome === 'finished') {
      return res.json({ session: r.session, awardedMinor: r.event?.amountMinor ?? 0, capped: Boolean(r.session?.capped) });
    }
    if (r.outcome === 'already') {
      return res.json({ session: r.session, already: true, awardedMinor: r.session?.awardedMinor ?? 0, capped: Boolean(r.session?.capped) });
    }
    return refuse(res, r);
  }),
);

router.post(
  '/focus/:id/cancel',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.cancelFocus({ userId: req.user.id, sessionId: p.data.id });
    if (r.outcome === 'cancelled') return res.json({ session: r.session });
    if (r.outcome === 'already') return res.json({ session: r.session, already: true });
    return refuse(res, r);
  }),
);

export default router;
