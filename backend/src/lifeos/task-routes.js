// src/lifeos/task-routes.js — tasks at the HTTP layer (migration 032, plan Phase 3).
//
//   GET    /tasks                the Feladatok tabs: due today, overdue, anytime, upcoming, done, templates
//   GET    /tasks/:id            one task
//   POST   /tasks                create — a one-off, a recurring template, or a capture (Rögzítés)
//   PATCH  /tasks/:id            edit
//   DELETE /tasks/:id            soft delete (coin history stays)
//   POST   /tasks/:id/complete   complete now: pays the task's coins (half when late), daily cap
//   POST   /tasks/:id/reopen     undo while the completion's day is open: the award is reversed
//
// ═══ THE ROUTES CARRY NO AUTHORITY ═════════════════════════════════════════════════════════════
//
// completeTaskTx computes the payout from the stored task and the worker clock — no amount, no
// "late" flag and no date is accepted from a client. Every task id from the URL is honoured only
// through `WHERE id = ? AND user_id = ?` (another account's task is a 404, indistinguishable from a
// missing one). Creates carry a clientKey so a retried request makes one task, not two.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { clientKey, dayKey, hhmm, idParam } from './habit-routes.js';
import { recurrenceSchema } from './recurrence.js';
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
  keyGenerator: (req) => (req.user ? `tasks:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});
/** The coin-moving pair gets its own, tighter budget per account. */
const completeAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `task-complete:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});

/* ── validation ─────────────────────────────────────────────────────────────────────────────── */

const line = (max) => z.string().trim().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]+$/);
/** Notes may span lines; other control characters are refused. */
const notes = z.string().trim().min(1).max(1000).regex(/^[^\u0000-\u0009\u000b-\u001f\u007f]+$/);

const taskFields = {
  title: line(120),
  notes: notes.nullable(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  // f_app's per-task override, capped like a habit's coins (plan L1).
  points: z.number().int().min(0).max(50).nullable(),
  dueOn: dayKey.nullable(),
  dueTime: hhmm.nullable(),
  recurrence: recurrenceSchema.nullable(),
};

export const taskCreateBody = z
  .object({
    clientKey,
    title: taskFields.title,
    notes: taskFields.notes.optional(),
    priority: taskFields.priority.optional(),
    points: taskFields.points.optional(),
    dueOn: taskFields.dueOn.optional(),
    dueTime: taskFields.dueTime.optional(),
    recurrence: taskFields.recurrence.optional(),
  })
  .strict()
  .refine((b) => !b.dueTime || b.dueOn, { message: 'a due time needs a due day' })
  .refine((b) => !b.recurrence || b.dueOn, { message: 'a recurring task needs a first day' });

export const taskPatchBody = z
  .object({
    title: taskFields.title.optional(),
    notes: taskFields.notes.optional(),
    priority: taskFields.priority.optional(),
    points: taskFields.points.optional(),
    dueOn: taskFields.dueOn.optional(),
    dueTime: taskFields.dueTime.optional(),
    recurrence: taskFields.recurrence.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to change' });

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
    case 'template':
      return res.status(409).json({ error: 'a recurring task is completed through its occurrences', code: 'TEMPLATE', requestId: rid });
    case 'conflict':
      return sendError(res, 409, ERR.CONFLICT, 'this change is not possible for this task');
    case 'invalid':
      return sendError(res, 400, ERR.VALIDATION, 'invalid input');
    default:
      throw new Error(`a task transaction returned an unmapped outcome: ${r.outcome}`);
  }
}

const settle = (req, res) => ensureSettled(req.user.id, { requestId: res.locals.requestId, log: req.log });

/* ── reads ──────────────────────────────────────────────────────────────────────────────────── */

router.get(
  '/tasks',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.tasks({ userId: req.user.id });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json(r);
  }),
);

router.get(
  '/tasks/:id',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    const task = await db.task({ userId: req.user.id, taskId: p.data.id });
    if (!task) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ task });
  }),
);

/* ── writes ─────────────────────────────────────────────────────────────────────────────────── */

router.post(
  '/tasks',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = taskCreateBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { clientKey: key, ...input } = parsed.data;
    const r = await db.createTask({ userId: req.user.id, input, clientKey: key });
    if (r.outcome === 'created') return res.status(201).json({ task: r.task });
    if (r.outcome === 'replayed') return res.json({ task: r.task, replayed: true });
    return refuse(res, r);
  }),
);

router.patch(
  '/tasks/:id',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = taskPatchBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.updateTask({ userId: req.user.id, taskId: p.data.id, patch: parsed.data });
    if (r.outcome === 'applied') return res.json({ task: r.task });
    return refuse(res, r);
  }),
);

router.delete(
  '/tasks/:id',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.deleteTask({ userId: req.user.id, taskId: p.data.id });
    if (r.outcome === 'applied') return res.status(204).end();
    return refuse(res, r);
  }),
);

router.post(
  '/tasks/:id/complete',
  requireAuth,
  writeIpLimiter,
  completeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.completeTask({ userId: req.user.id, taskId: p.data.id, requestId: res.locals.requestId });
    if (r.outcome === 'completed') {
      return res.json({ task: r.task, late: r.late, awardedMinor: r.event?.amountMinor ?? 0, capped: Boolean(r.event?.capped) });
    }
    if (r.outcome === 'already') return res.json({ task: r.task, already: true, awardedMinor: 0 });
    return refuse(res, r);
  }),
);

router.post(
  '/tasks/:id/reopen',
  requireAuth,
  writeIpLimiter,
  completeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success || !emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);
    await settle(req, res);
    const r = await db.reopenTask({ userId: req.user.id, taskId: p.data.id, requestId: res.locals.requestId });
    if (r.outcome === 'reopened') return res.json({ task: r.task, reversedMinor: r.reversal?.amountMinor ?? 0 });
    if (r.outcome === 'already') return res.json({ task: r.task, already: true, reversedMinor: 0 });
    return refuse(res, r);
  }),
);

export default router;
