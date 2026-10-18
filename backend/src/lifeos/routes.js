// src/lifeos/routes.js — the LifeOS core at the HTTP layer (migration 031, plan Phase 2).
//
//   GET   /me/prefs        the day boundary: timezone, day start, the LifeOS start day
//   PATCH /me/prefs        set them (the zone at most once per 24 h, audited)
//   GET   /lifeos/today    settle what is due, then the logical day, the wallet and today's workout
//   GET   /admin/rules     the point rules in force (admin)
//   PUT   /admin/rules     append a new rule set (admin, DB re-check, audit, expectedVersion)
//   /habits, /tasks        Phase 3 (migration 032): habit-routes.js and task-routes.js, mounted below
//   /challenges, /rewards  Phase 4 (migration 033): challenge-routes.js and reward-routes.js, mounted below
//
// ═══ THE ROUTES CARRY NO AUTHORITY ═════════════════════════════════════════════════════════════
//
// As in coins/routes.js: every guarantee is a property of migration 031 or of a named worker
// transaction (src/db/tx/lifeos.js). What is here is translation — a zod-validated request into
// arguments, an outcome into a status. Nothing a client sends reaches a coin amount: there is no
// endpoint in this file that pays, and the day close and the workout award compute every number
// from server-side rows. LifeOS data is private to its user (plan L10): every read is keyed on
// req.user.id and no route takes a user id.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { assertAdmin } from '../lib/assert-admin.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { isValidTimeZone, TIMEZONE_RE } from './dates.js';
import { pointRulesSchema, DEFAULT_RULES, RULE_RANGES } from './rules.js';
import { ensureSettled, invalidateSettled } from './settle.js';
import habitRoutes from './habit-routes.js';
import taskRoutes from './task-routes.js';
import challengeRoutes from './challenge-routes.js';
import rewardRoutes from './reward-routes.js';
import eventRoutes from './event-routes.js';
import { ensureReminders } from './reminders.js';

const router = Router();

const testSkip = () => process.env.NODE_ENV === 'test';

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: testSkip,
});

/** Per IP AND per account (the owner's rule): they stop different things. */
const prefsIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: testSkip,
});
const prefsAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `prefs:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});
const rulesIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: testSkip,
});
const rulesAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `rules:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});

/* ── validation ─────────────────────────────────────────────────────────────────────────────── */

/** Regex-bounded first, then the runtime's own verdict (a zone the ICU data does not know is refused). */
export const timezoneSchema = z.string().regex(TIMEZONE_RE).refine(isValidTimeZone);

export const prefsPatchBody = z
  .object({
    timezone: timezoneSchema.optional(),
    // The Nap és időzóna frame offers exactly these four.
    dayStartHour: z.union([z.literal(0), z.literal(2), z.literal(4), z.literal(6)]).optional(),
  })
  .strict()
  .refine((b) => b.timezone !== undefined || b.dayStartHour !== undefined, { message: 'nothing to change' });

export const rulesPutBody = z
  .object({
    expectedVersion: z.number().int().min(1).max(2_147_483_647),
    rules: pointRulesSchema,
    note: z.string().trim().min(1).max(280).optional(),
  })
  .strict();

const emptyQuery = z.object({}).strict();

/* ── the day boundary ───────────────────────────────────────────────────────────────────────── */

router.get(
  '/me/prefs',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    const prefs = await db.userPrefs({ userId: req.user.id });
    if (!prefs) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ prefs });
  }),
);

/**
 * The client sends the browser's IANA zone silently on open (plan "Day boundary"); the Nap és
 * időzóna page sends the day start. Re-sending the same zone is a no-op and never spends the
 * once-a-day allowance.
 */
router.patch(
  '/me/prefs',
  requireAuth,
  prefsIpLimiter,
  prefsAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = prefsPatchBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);

    const r = await db.setUserPrefs({
      userId: req.user.id,
      timezone: parsed.data.timezone,
      dayStartHour: parsed.data.dayStartHour,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });
    switch (r.outcome) {
      case 'applied':
        invalidateSettled(req.user.id);
        return res.json({ prefs: r.prefs });
      case 'too_soon':
        return res.status(409).json({
          error: 'the time zone can only change once a day',
          code: 'TIMEZONE_TOO_SOON',
          changeableAt: r.changeableAt,
          requestId: res.locals.requestId,
        });
      case 'missing':
        return sendError(res, 404, ERR.NOT_FOUND, 'not found');
      default:
        throw new Error(`setUserPrefsTx returned an unmapped outcome: ${r.outcome}`);
    }
  }),
);

/* ── today ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * The Ma screen's spine (Phase-2 fields). Settles what is due FIRST, so the wallet it answers
 * already includes yesterday's kcal / perfect-day coins.
 */
router.get(
  '/lifeos/today',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    await ensureSettled(req.user.id, { requestId: res.locals.requestId, log: req.log });
    // Reminders without push (034): due ones become notifications before Ma answers.
    await ensureReminders(req.user.id, { log: req.log });
    const today = await db.lifeosToday({ userId: req.user.id });
    if (!today) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(today);
  }),
);

/* ── the rules (admin) ──────────────────────────────────────────────────────────────────────── */

router.get(
  '/admin/rules',
  requireAuth,
  requireRole('admin'),
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    if (!(await assertAdmin(req, res))) return;
    const current = await db.pointRules({});
    res.json({ current, defaults: DEFAULT_RULES, ranges: RULE_RANGES });
  }),
);

/**
 * A new rule set. requireRole is the fast gate, assertAdmin the DB re-read, and setPointRulesTx
 * re-reads role AND session under its own write lock and repeats both inside the INSERT.
 * expectedVersion turns a concurrent edit into a 409 carrying the current version.
 */
router.put(
  '/admin/rules',
  requireAuth,
  requireRole('admin'),
  rulesIpLimiter,
  rulesAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = rulesPutBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    if (!(await assertAdmin(req, res))) return;

    const r = await db.setPointRules({
      actorId: req.user.id,
      actorSessionVersion: req.user.sv,
      rules: parsed.data.rules,
      note: parsed.data.note ?? null,
      expectedVersion: parsed.data.expectedVersion,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });
    switch (r.outcome) {
      case 'applied':
        return res.json({ current: r.view });
      case 'unchanged':
        return res.json({ current: await db.pointRules({}), unchanged: true });
      case 'stale':
        return res.status(409).json({
          error: 'the rules changed since you loaded them',
          code: 'RULES_STALE',
          currentVersion: r.currentVersion,
          requestId: res.locals.requestId,
        });
      case 'invalid':
        return sendError(res, 400, ERR.VALIDATION);
      case 'forbidden':
        return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
      default:
        throw new Error(`setPointRulesTx returned an unmapped outcome: ${r.outcome}`);
    }
  }),
);

/* ── Phase 3: habits and tasks (migration 032) ──────────────────────────────────────────────── */

router.use(habitRoutes);
router.use(taskRoutes);
router.use(challengeRoutes);
router.use(rewardRoutes);
router.use(eventRoutes);

export default router;
