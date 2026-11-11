// src/lifeos/challenge-routes.js — the daily challenge draw at the HTTP layer (migration 033, plan
// Phase 4).
//
//   GET    /challenges                  the pool (AKTÍV n / 50) and the archived ones
//   POST   /challenges                  create (clientKey)
//   GET    /challenges/today            the day's draw: empty_pool | due | drawn | picked
//   POST   /challenges/today/draw       draw today's options (idempotent per day)
//   POST   /challenges/today/reroll     the one reroll of the day (rerollKey)
//   POST   /challenges/today/pick       "Ezt vállalom": one option becomes today's task (clientKey)
//   GET    /challenges/:id              one challenge
//   PATCH  /challenges/:id              edit
//   POST   /challenges/:id/archive      "Archiválás"
//   POST   /challenges/:id/restore      "Visszaállítás"
//   DELETE /challenges/:id              soft delete (the tasks it became keep their history)
//
// ═══ THE ROUTES CARRY NO AUTHORITY ═════════════════════════════════════════════════════════════
//
// The draw is made in the worker with crypto.randomInt from the caller's own pool; the pick's coins
// and due day come from the stored challenge and the worker clock. A body names at most a challenge
// id (honoured only if it is one of TODAY'S options of THIS caller's draw) and an idempotency key.
// No challenge moves a coin here: the picked task pays when it is completed (POST /tasks/:id/complete).
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { clientKey, idParam } from './habit-routes.js';
import { CHALLENGE_CATEGORIES, WEIGHT_MAX, WEIGHT_MIN } from './challenges.js';
import { LIFEOS_LIMITS } from './rules.js';
import { ensureSettled } from './settle.js';

const router = Router();

const testSkip = () => process.env.NODE_ENV === 'test';

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, skip: testSkip });
const writeIpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, skip: testSkip });
const writeAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `challenges:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});
/** The draw / reroll / pick trio: a few per day are real, so the budget is tight. */
const drawAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `challenge-draw:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});

/* ── validation ─────────────────────────────────────────────────────────────────────────────── */

const line = (max) => z.string().trim().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]+$/);

const fields = {
  name: line(80),
  category: z.enum(CHALLENGE_CATEGORIES).nullable(),
  // Whole coins the picked task pays; the task override's cap (plan L1).
  points: z.number().int().min(0).max(LIFEOS_LIMITS.challengePointsMax),
  weight: z.number().int().min(WEIGHT_MIN).max(WEIGHT_MAX),
};

export const challengeCreateBody = z
  .object({
    clientKey,
    name: fields.name,
    category: fields.category.optional(),
    points: fields.points.optional(),
    weight: fields.weight.optional(),
  })
  .strict();

export const challengePatchBody = z
  .object({
    name: fields.name.optional(),
    category: fields.category.optional(),
    points: fields.points.optional(),
    weight: fields.weight.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to change' });

export const rerollBody = z.object({ rerollKey: clientKey }).strict();
export const pickBody = z.object({ challengeId: z.number().int().positive().max(2_147_483_647), clientKey }).strict();

const emptyBody = z.object({}).strict();
const emptyQuery = z.object({}).strict();

/* ── outcome -> status ──────────────────────────────────────────────────────────────────────── */

function refuse(res, r) {
  const rid = res.locals.requestId;
  const code409 = (code, error) => res.status(409).json({ error, code, requestId: rid });
  switch (r.outcome) {
    case 'missing':
      return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    case 'timezone_required':
      return code409('TIMEZONE_REQUIRED', 'set your time zone first');
    case 'cap':
      return res.status(409).json({ error: 'you have reached the limit', code: 'LIMIT_REACHED', limit: r.limit, requestId: rid });
    case 'no_draw':
      return code409('NO_DRAW', 'there is no draw today yet');
    case 'empty_pool':
      return code409('EMPTY_POOL', 'there is nothing to draw from');
    case 'reroll_used':
      return code409('REROLL_USED', 'today\'s reroll has been used');
    case 'picked':
    case 'already_picked':
      return code409('ALREADY_PICKED', 'today\'s challenge has been picked');
    case 'not_offered':
      return code409('NOT_OFFERED', 'this challenge is not one of today\'s options');
    case 'conflict':
      return sendError(res, 409, ERR.CONFLICT, 'this change is not possible');
    default:
      throw new Error(`a challenge transaction returned an unmapped outcome: ${r.outcome}`);
  }
}

const settle = (req, res) => ensureSettled(req.user.id, { requestId: res.locals.requestId, log: req.log });

/* ── the pool ───────────────────────────────────────────────────────────────────────────────── */

router.get(
  '/challenges',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.challenges({ userId: req.user.id });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

router.post(
  '/challenges',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = challengeCreateBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { clientKey: key, ...input } = parsed.data;
    const r = await db.createChallenge({ userId: req.user.id, input, clientKey: key });
    if (r.outcome === 'created') return res.status(201).json({ challenge: r.challenge });
    if (r.outcome === 'replayed') return res.json({ challenge: r.challenge, replayed: true });
    return refuse(res, r);
  }),
);

/* ── the day's draw (declared before /challenges/:id so "today" is never read as an id) ──────── */

router.get(
  '/challenges/today',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.challengeToday({ userId: req.user.id });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

router.post(
  '/challenges/today/draw',
  requireAuth,
  writeIpLimiter,
  drawAccountLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.drawChallenge({ userId: req.user.id });
    if (r.outcome === 'drawn') return res.status(201).json({ draw: r.draw });
    if (r.outcome === 'already') return res.json({ draw: r.draw, already: true });
    return refuse(res, r);
  }),
);

router.post(
  '/challenges/today/reroll',
  requireAuth,
  writeIpLimiter,
  drawAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = rerollBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.rerollChallenge({ userId: req.user.id, rerollKey: parsed.data.rerollKey });
    if (r.outcome === 'rerolled') return res.json({ draw: r.draw });
    if (r.outcome === 'replayed') return res.json({ draw: r.draw, replayed: true });
    return refuse(res, r);
  }),
);

router.post(
  '/challenges/today/pick',
  requireAuth,
  writeIpLimiter,
  drawAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = pickBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.pickChallenge({ userId: req.user.id, challengeId: parsed.data.challengeId, clientKey: parsed.data.clientKey });
    if (r.outcome === 'picked') return res.status(201).json({ task: r.task, draw: r.draw });
    if (r.outcome === 'replayed') return res.json({ task: r.task, draw: r.draw, replayed: true });
    return refuse(res, r);
  }),
);

/* ── one challenge ──────────────────────────────────────────────────────────────────────────── */

router.get(
  '/challenges/:id',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    const challenge = await db.challenge({ userId: req.user.id, challengeId: p.data.id });
    if (!challenge) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ challenge });
  }),
);

router.patch(
  '/challenges/:id',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = challengePatchBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.updateChallenge({ userId: req.user.id, challengeId: p.data.id, patch: parsed.data });
    if (r.outcome === 'applied') return res.json({ challenge: r.challenge });
    return refuse(res, r);
  }),
);

/** "Archiválás" / "Visszaállítás": one handler, two literal paths (check-routes reads literals only). */
const archiveHandler = (archived) =>
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.setChallengeArchived({ userId: req.user.id, challengeId: p.data.id, archived });
    if (r.outcome === 'applied') return res.json({ challenge: r.challenge });
    return refuse(res, r);
  });

router.post('/challenges/:id/archive', requireAuth, writeIpLimiter, writeAccountLimiter, archiveHandler(true));
router.post('/challenges/:id/restore', requireAuth, writeIpLimiter, writeAccountLimiter, archiveHandler(false));

router.delete(
  '/challenges/:id',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.deleteChallenge({ userId: req.user.id, challengeId: p.data.id });
    if (r.outcome === 'applied') return res.status(204).end();
    return refuse(res, r);
  }),
);

export default router;
