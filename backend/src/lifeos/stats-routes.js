// src/lifeos/stats-routes.js — the LifeOS statistics at the HTTP layer (plan Phase 6, Haladás > Napok).
//
//   GET /lifeos/days?from&to     the day rows of a range (at most 92 days; default: the last 14)
//   GET /lifeos/stats?days&weeks the Napok tab in one answer: this week, the day columns, the week
//                                rows, the habit bars, the kcal chart, the overview
//
// Reads only, keyed on req.user.id (LifeOS data is private, plan L10). Both settle what is due
// first, so yesterday's row is the settled truth once its settle time has passed. Ports of f_app
// src/domain/stats.ts (pointsHistory, weeklyPoints, habitHeatmap, kcalHistory, overview).
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { dayKey } from './habit-routes.js';
import { daysBetween } from './dates.js';
import { DAYS_MAX_SPAN, STATS_DAYS, STATS_WEEKS } from './stats.js';
import { ensureSettled } from './settle.js';

const router = Router();

const testSkip = () => process.env.NODE_ENV === 'test';
const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, skip: testSkip });

/** Query strings arrive as strings: a bounded integer is a digit-only string first. */
const queryInt = (min, max) => z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().int().min(min).max(max));

export const daysQuery = z
  .object({ from: dayKey.optional(), to: dayKey.optional() })
  .strict()
  .refine((q) => (q.from === undefined) === (q.to === undefined), { message: 'from and to go together' })
  .refine((q) => q.from === undefined || (q.from <= q.to && daysBetween(q.from, q.to) < DAYS_MAX_SPAN), {
    message: `at most ${DAYS_MAX_SPAN} days, from <= to`,
  });

export const statsQuery = z
  .object({
    days: queryInt(STATS_DAYS.min, STATS_DAYS.max).optional(),
    weeks: queryInt(STATS_WEEKS.min, STATS_WEEKS.max).optional(),
  })
  .strict();

const settle = (req, res) => ensureSettled(req.user.id, { requestId: res.locals.requestId, log: req.log });

router.get(
  '/lifeos/days',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const q = daysQuery.safeParse(req.query);
    if (!q.success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    // No range = the last 14 logical days; the worker resolves it from the user's today, so the
    // whole read stays ONE worker call.
    const r = await db.lifeosDays({ userId: req.user.id, from: q.data.from ?? null, to: q.data.to ?? null });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

router.get(
  '/lifeos/stats',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const q = statsQuery.safeParse(req.query);
    if (!q.success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.lifeosStats({
      userId: req.user.id,
      days: q.data.days ?? STATS_DAYS.default,
      weeks: q.data.weeks ?? STATS_WEEKS.default,
    });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

export default router;
