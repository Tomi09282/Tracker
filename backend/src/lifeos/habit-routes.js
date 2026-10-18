// src/lifeos/habit-routes.js — habits at the HTTP layer (migration 032, plan Phase 3).
//
//   GET   /habits               every habit: streak, multiplier, freezes, today's log and preview
//   GET   /habits/:id           one habit + its last 12 weeks of settled days and their coins
//   POST  /habits               create (clientKey makes a replay harmless; 20 live habits at most)
//   PATCH /habits/:id           edit the settings (name, schedule, count, unit, coins <= 50, reminder)
//   POST  /habits/:id/archive   archive          POST /habits/:id/restore   restore
//   POST  /habits/:id/log       a good habit's count for a day   { date?, count }
//   POST  /habits/:id/skip      skip a good habit for a day      { date? }
//   POST  /habits/:id/relapse   a bad habit's relapses for a day { date?, count }
//
// ═══ THE ROUTES CARRY NO AUTHORITY ═════════════════════════════════════════════════════════════
//
// As in src/lifeos/routes.js: every guarantee is a property of migration 032 or of a named worker
// transaction (src/db/tx/lifeos-habits.js). No route here moves a coin — a habit pays when its day
// settles, from server-side rows. A client can only say what it did on a day that is still open,
// with absolute counts (a replay lands on the same state). Every read and write is keyed on
// req.user.id; a habit id from the URL is honoured only through `WHERE id = ? AND user_id = ?`.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { isDayKey } from './dates.js';
import { ensureSettled } from './settle.js';

const router = Router();

const testSkip = () => process.env.NODE_ENV === 'test';

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, skip: testSkip });
/** Per IP AND per account (the owner's rule). A counted habit is tapped often, so the room is wide. */
const writeIpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, skip: testSkip });
const writeAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `habits:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});

/* ── validation ─────────────────────────────────────────────────────────────────────────────── */

export const idParam = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) }).strict();
/** The client's half of an idempotency key (the coins routes' shape: no ':' — the server's namespace). */
export const clientKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
export const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isDayKey);
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** A visible single line: trimmed, bounded, no control characters. */
const line = (max) => z.string().trim().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]+$/);

const habitFields = {
  name: line(80),
  scheduleType: z.enum(['daily', 'weekdays', 'times_per_week']),
  weekdayMask: z.number().int().min(1).max(127),
  timesPerWeek: z.number().int().min(1).max(7),
  targetCount: z.number().int().min(1).max(100),
  unit: line(20).nullable(),
  // "legfeljebb 50" — the per-item cap (plan L1); the schema enforces it again.
  pointsSuccess: z.number().int().min(0).max(50),
  pointsPenalty: z.number().int().min(0).max(50),
  reminderTime: hhmm.nullable(),
};

/** The schedule fields must agree with the schedule type, and a bad habit is a plain daily one. */
function scheduleConsistent(b, kind) {
  const type = b.scheduleType;
  if (kind === 'bad' && (type !== undefined && type !== 'daily')) return false;
  if (kind === 'bad' && (b.weekdayMask !== undefined || b.timesPerWeek !== undefined || (b.targetCount ?? 1) !== 1 || b.unit)) return false;
  if (type === 'weekdays' && b.weekdayMask === undefined) return false;
  if (type === 'times_per_week' && b.timesPerWeek === undefined) return false;
  if (b.weekdayMask !== undefined && type !== 'weekdays') return false;
  if (b.timesPerWeek !== undefined && type !== 'times_per_week') return false;
  return true;
}

export const habitCreateBody = z
  .object({
    clientKey,
    kind: z.enum(['good', 'bad']),
    name: habitFields.name,
    scheduleType: habitFields.scheduleType.optional(),
    weekdayMask: habitFields.weekdayMask.optional(),
    timesPerWeek: habitFields.timesPerWeek.optional(),
    targetCount: habitFields.targetCount.optional(),
    unit: habitFields.unit.optional(),
    pointsSuccess: habitFields.pointsSuccess.optional(),
    pointsPenalty: habitFields.pointsPenalty.optional(),
    reminderTime: habitFields.reminderTime.optional(),
  })
  .strict()
  .refine((b) => scheduleConsistent(b, b.kind), { message: 'inconsistent schedule' });

export const habitPatchBody = z
  .object({
    name: habitFields.name.optional(),
    scheduleType: habitFields.scheduleType.optional(),
    weekdayMask: habitFields.weekdayMask.optional(),
    timesPerWeek: habitFields.timesPerWeek.optional(),
    targetCount: habitFields.targetCount.optional(),
    unit: habitFields.unit.optional(),
    pointsSuccess: habitFields.pointsSuccess.optional(),
    pointsPenalty: habitFields.pointsPenalty.optional(),
    reminderTime: habitFields.reminderTime.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to change' })
  // A schedule field without its type is ambiguous against the stored one: send the type too.
  .refine((b) => (b.weekdayMask === undefined && b.timesPerWeek === undefined) || b.scheduleType !== undefined, {
    message: 'send the schedule type with its fields',
  })
  .refine((b) => b.scheduleType === undefined || scheduleConsistent(b, 'good'), { message: 'inconsistent schedule' });

export const habitCountBody = z.object({ date: dayKey.optional(), count: z.number().int().min(0).max(100) }).strict();
export const habitSkipBody = z.object({ date: dayKey.optional() }).strict();
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
    case 'cap':
      return res.status(409).json({ error: 'you have reached the limit', code: 'LIMIT_REACHED', limit: r.limit, requestId: rid });
    case 'locked':
      return res.status(409).json({ error: 'this day has settled and can no longer be edited', code: 'DAY_LOCKED', requestId: rid });
    case 'future':
    case 'invalid':
      return sendError(res, 400, ERR.VALIDATION, 'invalid input');
    case 'not_scheduled':
      return res.status(409).json({ error: 'this habit is not scheduled on that day', code: 'NOT_SCHEDULED', requestId: rid });
    case 'wrong_kind':
      return res.status(409).json({ error: 'not available for this kind of habit', code: 'WRONG_KIND', requestId: rid });
    case 'archived':
      return res.status(409).json({ error: 'this habit is archived', code: 'ARCHIVED', requestId: rid });
    default:
      throw new Error(`a habit transaction returned an unmapped outcome: ${r.outcome}`);
  }
}

/** Settle what is due first, so a write on yesterday meets the window the clock says. Never throws. */
const settle = (req, res) => ensureSettled(req.user.id, { requestId: res.locals.requestId, log: req.log });

/* ── reads ──────────────────────────────────────────────────────────────────────────────────── */

router.get(
  '/habits',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.habits({ userId: req.user.id });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

router.get(
  '/habits/:id',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.habit({ userId: req.user.id, habitId: p.data.id });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

/* ── create / edit / archive ────────────────────────────────────────────────────────────────── */

router.post(
  '/habits',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = habitCreateBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { clientKey: key, ...input } = parsed.data;
    const r = await db.createHabit({ userId: req.user.id, input, clientKey: key });
    if (r.outcome === 'created') return res.status(201).json({ habit: r.habit });
    if (r.outcome === 'replayed') return res.json({ habit: r.habit, replayed: true });
    return refuse(res, r);
  }),
);

router.patch(
  '/habits/:id',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = habitPatchBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.updateHabit({ userId: req.user.id, habitId: p.data.id, patch: parsed.data });
    if (r.outcome === 'applied') return res.json({ habit: r.habit });
    return refuse(res, r);
  }),
);

const archiveHandler = (archived) =>
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.archiveHabit({ userId: req.user.id, habitId: p.data.id, archived });
    if (r.outcome === 'applied' || r.outcome === 'unchanged') return res.json({ habit: r.habit });
    return refuse(res, r);
  });

router.post('/habits/:id/archive', requireAuth, writeIpLimiter, writeAccountLimiter, archiveHandler(true));
router.post('/habits/:id/restore', requireAuth, writeIpLimiter, writeAccountLimiter, archiveHandler(false));

/* ── the day's log ──────────────────────────────────────────────────────────────────────────── */

router.post(
  '/habits/:id/log',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = habitCountBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.setHabitCount({ userId: req.user.id, habitId: p.data.id, localDate: parsed.data.date ?? null, count: parsed.data.count });
    if (r.outcome === 'applied') return res.json({ log: r.log, habit: r.habit });
    return refuse(res, r);
  }),
);

router.post(
  '/habits/:id/skip',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = habitSkipBody.safeParse(req.body ?? {});
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.skipHabit({ userId: req.user.id, habitId: p.data.id, localDate: parsed.data.date ?? null });
    if (r.outcome === 'applied') return res.json({ log: r.log, habit: r.habit });
    return refuse(res, r);
  }),
);

router.post(
  '/habits/:id/relapse',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = habitCountBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.recordRelapse({ userId: req.user.id, habitId: p.data.id, localDate: parsed.data.date ?? null, count: parsed.data.count });
    if (r.outcome === 'applied') return res.json({ log: r.log, habit: r.habit });
    return refuse(res, r);
  }),
);

export default router;
