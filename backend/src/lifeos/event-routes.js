// src/lifeos/event-routes.js — the calendar at the HTTP layer (migration 034, plan Phase 5).
//
//   GET    /calendar?from&days   the Naptár week: event occurrences, scheduled workouts, tasks, per day
//   GET    /events/:id?on        one event (+ its next occurrence, the occurrences left, the one on `on`)
//   POST   /events               create — Naptár "+ Esemény" and the capture's Esemény half
//   PATCH  /events/:id           edit (every occurrence moves with it)
//   DELETE /events/:id           delete, with every occurrence and reminder
//
// ═══ THE ROUTES CARRY NO AUTHORITY ═════════════════════════════════════════════════════════════
//
// The transactions (src/db/tx/lifeos-events.js) resolve every instant from the typed wall clock in
// the zone they read from user_prefs; no client instant, offset or "today" is accepted. Every event
// id from the URL is honoured only through `WHERE id = ? AND user_id = ?` (another account's event is
// a 404, indistinguishable from a missing one). Creates carry a clientKey so a retried request makes
// one event, not two. The calendar moves no coins.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { calendarQuery, eventCreateBody, eventDetailQuery, eventPatchBody } from './events.js';
import { invalidateReminders } from './reminders.js';
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
  keyGenerator: (req) => (req.user ? `events:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});

export const eventIdParam = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) }).strict();
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
    case 'invalid':
      return sendError(res, 400, ERR.VALIDATION, 'invalid input');
    default:
      throw new Error(`an event transaction returned an unmapped outcome: ${r.outcome}`);
  }
}

/* ── reads ──────────────────────────────────────────────────────────────────────────────────── */

router.get(
  '/calendar',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const q = calendarQuery.safeParse(req.query);
    if (!q.success) return sendError(res, 400, ERR.VALIDATION);
    // The calendar shows tasks with their overdue state: settle what is due first, like /tasks.
    await ensureSettled(req.user.id, { requestId: res.locals.requestId, log: req.log });
    const r = await db.calendar({ userId: req.user.id, from: q.data.from ?? null, days: q.data.days ?? 7 });
    if (!r) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    if (r.outcome !== 'ok') return refuse(res, r);
    res.json(r.calendar);
  }),
);

router.get(
  '/events/:id',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const p = eventIdParam.safeParse(req.params);
    const q = eventDetailQuery.safeParse(req.query);
    if (!p.success || !q.success) return sendError(res, 400, ERR.VALIDATION);
    const event = await db.event({ userId: req.user.id, eventId: p.data.id, on: q.data.on ?? null });
    if (!event) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ event });
  }),
);

/* ── writes ─────────────────────────────────────────────────────────────────────────────────── */

router.post(
  '/events',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = eventCreateBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { clientKey: key, ...input } = parsed.data;
    const r = await db.createEvent({ userId: req.user.id, input, clientKey: key });
    if (r.outcome === 'created') {
      invalidateReminders(req.user.id);
      return res.status(201).json({ event: r.event });
    }
    if (r.outcome === 'replayed') return res.json({ event: r.event, replayed: true });
    return refuse(res, r);
  }),
);

router.patch(
  '/events/:id',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = eventIdParam.safeParse(req.params);
    const parsed = eventPatchBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.updateEvent({ userId: req.user.id, eventId: p.data.id, patch: parsed.data });
    if (r.outcome === 'applied') {
      invalidateReminders(req.user.id);
      return res.json({ event: r.event });
    }
    return refuse(res, r);
  }),
);

router.delete(
  '/events/:id',
  requireAuth,
  writeIpLimiter,
  writeAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = eventIdParam.safeParse(req.params);
    if (!p.success || !emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.deleteEvent({ userId: req.user.id, eventId: p.data.id });
    if (r.outcome === 'applied') return res.status(204).end();
    return refuse(res, r);
  }),
);

export default router;
