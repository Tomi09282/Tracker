// src/lifeos/reward-routes.js — the reward shop at the HTTP layer (migration 033, plan Phase 4).
//
//   GET    /rewards                              the shop: ELKÖLTHETŐ, JUTALOMBOLT (by cost), archived
//   POST   /rewards                              create (clientKey)
//   GET    /rewards/redemptions                  every redemption, newest first (<= 100)
//   POST   /rewards/redemptions/:id/fulfilled    the "Teljesítve" tick (bookkeeping, no coins)
//   GET    /rewards/:id                          one reward and its redemptions
//   PATCH  /rewards/:id                          edit
//   POST   /rewards/:id/archive                  "Archiválás" (the redemptions stay)
//   POST   /rewards/:id/restore                  restore
//   POST   /rewards/:id/redeem                   "Beváltás": the one LifeOS spend (clientKey)
//
// ═══ THE ROUTES CARRY NO AUTHORITY ═════════════════════════════════════════════════════════════
//
// redeemRewardTx reads the cost from the stored reward and the balance from the wallet, under the
// IMMEDIATE lock; the body of a redeem is the idempotency key and nothing else. Every id from the URL
// is honoured only through `WHERE id = ? AND user_id = ?` (another account's reward is a 404). A
// refused redeem names its reason (ALREADY_REDEEMED / COOLDOWN / INSUFFICIENT) — about the caller's
// own reward, so it discloses nothing.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { clientKey, idParam } from './habit-routes.js';
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
  keyGenerator: (req) => (req.user ? `rewards:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});
/** The spend gets its own, tighter budget per account. */
const redeemAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `reward-redeem:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});

/* ── validation ─────────────────────────────────────────────────────────────────────────────── */

const line = (max) => z.string().trim().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]+$/);
/** A description may span lines; other control characters are refused. */
const text = (max) => z.string().trim().min(1).max(max).regex(/^[^\u0000-\u0009\u000b-\u001f\u007f]+$/);

const fields = {
  name: line(80),
  description: text(280).nullable(),
  // Whole coins, 1 .. rewardCostMax (the reward.redeem reason's ceiling).
  cost: z.number().int().min(1).max(LIFEOS_LIMITS.rewardCostMax),
  repeatable: z.boolean(),
  // "Pihenő két beváltás között": 0 = no limit (the form's hint), at most a year.
  cooldownDays: z.number().int().min(0).max(365).nullable(),
};

const oneTimeHasNoCooldown = (b) => b.repeatable !== false || !b.cooldownDays;

export const rewardCreateBody = z
  .object({
    clientKey,
    name: fields.name,
    description: fields.description.optional(),
    cost: fields.cost,
    repeatable: fields.repeatable.optional(),
    cooldownDays: fields.cooldownDays.optional(),
  })
  .strict()
  .refine(oneTimeHasNoCooldown, { message: 'a one-time reward has no cooldown' });

export const rewardPatchBody = z
  .object({
    name: fields.name.optional(),
    description: fields.description.optional(),
    cost: fields.cost.optional(),
    repeatable: fields.repeatable.optional(),
    cooldownDays: fields.cooldownDays.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to change' })
  .refine(oneTimeHasNoCooldown, { message: 'a one-time reward has no cooldown' });

export const redeemBody = z.object({ clientKey }).strict();
export const fulfilledBody = z.object({ fulfilled: z.boolean() }).strict();

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
    case 'refused': {
      const a = r.availability;
      const body = { error: 'this reward cannot be redeemed now', code: a.reason, requestId: rid };
      if (a.reason === 'COOLDOWN') Object.assign(body, { availableOn: a.availableOn, daysLeft: a.daysLeft });
      if (a.reason === 'INSUFFICIENT') body.missingMinor = a.missingMinor;
      return res.status(409).json(body);
    }
    case 'conflict':
      return sendError(res, 409, ERR.CONFLICT, 'this change is not possible');
    default:
      throw new Error(`a reward transaction returned an unmapped outcome: ${r.outcome}`);
  }
}

const settle = (req, res) => ensureSettled(req.user.id, { requestId: res.locals.requestId, log: req.log });

/* ── the shop ───────────────────────────────────────────────────────────────────────────────── */

router.get(
  '/rewards',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.rewards({ userId: req.user.id });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

router.post(
  '/rewards',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = rewardCreateBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { clientKey: key, ...input } = parsed.data;
    const r = await db.createReward({ userId: req.user.id, input, clientKey: key });
    if (r.outcome === 'created') return res.status(201).json({ reward: r.reward });
    if (r.outcome === 'replayed') return res.json({ reward: r.reward, replayed: true });
    return refuse(res, r);
  }),
);

/* ── redemptions (declared before /rewards/:id so "redemptions" is never read as an id) ─────── */

router.get(
  '/rewards/redemptions',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    res.json(await db.redemptions({ userId: req.user.id }));
  }),
);

router.post(
  '/rewards/redemptions/:id/fulfilled',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = fulfilledBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.setRedemptionFulfilled({ userId: req.user.id, redemptionId: p.data.id, fulfilled: parsed.data.fulfilled });
    if (r.outcome === 'applied') return res.json({ redemption: r.redemption });
    return refuse(res, r);
  }),
);

/* ── one reward ─────────────────────────────────────────────────────────────────────────────── */

router.get(
  '/rewards/:id',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.reward({ userId: req.user.id, rewardId: p.data.id });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

router.patch(
  '/rewards/:id',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = rewardPatchBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.updateReward({ userId: req.user.id, rewardId: p.data.id, patch: parsed.data });
    if (r.outcome === 'applied') return res.json({ reward: r.reward });
    return refuse(res, r);
  }),
);

/** "Archiválás" / restore: one handler, two literal paths (check-routes reads literals only). */
const archiveHandler = (archived) =>
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.setRewardArchived({ userId: req.user.id, rewardId: p.data.id, archived });
    if (r.outcome === 'applied') return res.json({ reward: r.reward });
    return refuse(res, r);
  });

router.post('/rewards/:id/archive', requireAuth, writeIpLimiter, writeAccountLimiter, archiveHandler(true));
router.post('/rewards/:id/restore', requireAuth, writeIpLimiter, writeAccountLimiter, archiveHandler(false));

router.post(
  '/rewards/:id/redeem',
  requireAuth,
  writeIpLimiter,
  redeemAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = redeemBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.redeemReward({
      userId: req.user.id,
      rewardId: p.data.id,
      clientKey: parsed.data.clientKey,
      requestId: res.locals.requestId,
    });
    if (r.outcome === 'redeemed') {
      req.log?.info?.({ userId: req.user.id, rewardId: p.data.id, redemptionId: r.redemption.id }, 'reward redeemed');
      return res.status(201).json({ redemption: r.redemption, balanceMinor: r.balanceMinor, spendableMinor: r.spendableMinor });
    }
    if (r.outcome === 'replayed') {
      return res.json({ redemption: r.redemption, balanceMinor: r.balanceMinor, spendableMinor: r.spendableMinor, replayed: true });
    }
    return refuse(res, r);
  }),
);

export default router;
