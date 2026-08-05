// src/plans/routes.js — workout plan authoring (F3).
//
// Every ownership predicate here is taken verbatim from the J4 schema design's ownership matrix
// (`docs/pipeline/phase-2/j4-synthesis-notes.json`), because the schema was built around them and
// a route that invents its own is a route the triggers cannot help.
//
// TWO RULES SHAPE THIS WHOLE FILE, and both come from findings the adversarial review made against
// every candidate design:
//
//   1. THE OWNERSHIP PREDICATE IS ONE `WHERE` CLAUSE. `plan_id` is denormalised onto every node of
//      the authoring tree precisely so a day, a block or an exercise can be scoped without an
//      application-side walk up the parents. `changes === 0` is the 404 — there is no preceding
//      SELECT to race against.
//
//   2. AN `INSERT` HAS NO `WHERE`. Every create is `INSERT ... SELECT ... WHERE EXISTS(<ownership>)`
//      rather than `INSERT ... VALUES`. The review found this exact hole in all three candidate
//      designs: they wrote the predicate for the update path and assumed it for the insert, and a
//      coach could inject a plan into a stranger's client.
//
// The author alone is NOT sufficient for a client-scoped plan. The link must still be active, so
// archiving a client takes effect on the very next request with the same unexpired token.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireCoach } from '../auth/middleware.js';
import { normalizeText } from '../lib/normalize.js';
import { resolveLang, languages } from '../lib/lang.js';

const router = Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/* ── the ownership predicates ────────────────────────────────────────────────────────────────
 *
 * Written once, as SQL fragments, because they appear in a dozen statements and a copy that drifts
 * is a hole. Each takes its parameters in a fixed order, documented on the fragment.
 */

/**
 * A plan this coach may write. Params: (planId, coachUserId, coachUserId).
 *
 * The EXISTS is the important half: `author_user_id` alone would let a coach keep editing a plan
 * belonging to a client they no longer coach.
 */
const COACH_PLAN = `
  id = ? AND author_user_id = ? AND archived_at IS NULL
  AND (coach_client_id IS NULL OR EXISTS (
        SELECT 1 FROM coach_clients cc
         WHERE cc.id = workout_plans.coach_client_id AND cc.coach_id = ? AND cc.status = 'active'))`;

/** The same predicate as a subquery, for scoping a child row. Params: (planId, coachId, coachId). */
const COACH_PLAN_SUBQUERY = `
  SELECT p.id FROM workout_plans p
   WHERE p.id = ? AND p.author_user_id = ? AND p.archived_at IS NULL
     AND (p.coach_client_id IS NULL OR EXISTS (
           SELECT 1 FROM coach_clients cc
            WHERE cc.id = p.coach_client_id AND cc.coach_id = ? AND cc.status = 'active'))`;

/**
 * What a client may see. Deliberately single-table and deliberately WITHOUT a link-status filter:
 * a client keeps their plan and their history after a coach archives them. They own their training;
 * the coach owned only the relationship.
 *
 * `status <> 'draft'` is what lets a coach build a week one exercise at a time without the client
 * watching it appear.
 */
const CLIENT_PLAN = `client_user_id = ? AND archived_at IS NULL AND status <> 'draft'`;

/* ── validation ──────────────────────────────────────────────────────────────────────────────── */

const GOALS = ['strength', 'muscle', 'fat-loss', 'endurance', 'mobility', 'health', 'sport'];
const EXPERIENCE = ['none', 'beginner', 'intermediate', 'advanced'];
const STATUS = ['draft', 'active', 'paused', 'ended'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const PlanCreate = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    goal: z.enum(GOALS).nullable().optional(),
    experience: z.enum(EXPERIENCE).nullable().optional(),
    cycle_days: z.number().int().min(1).max(56).default(7),
    starts_on: z.string().regex(ISO_DATE).nullable().optional(),
    ends_on: z.string().regex(ISO_DATE).nullable().optional(),
    // Present only when instantiating for a client. The LINK id, never the client's user id — the
    // link is what carries the proof that this coach may reach this person.
    coach_client_id: z.number().int().positive().nullable().optional(),
  })
  .strict();

// An explicit pick-list. Spreading a request body into an UPDATE is how `status`, `revision` or
// `author_user_id` become client-controlled, which is finding #2 in the constraints checklist.
const PlanPatch = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    goal: z.enum(GOALS).nullable().optional(),
    experience: z.enum(EXPERIENCE).nullable().optional(),
    cycle_days: z.number().int().min(1).max(56).optional(),
    starts_on: z.string().regex(ISO_DATE).nullable().optional(),
    ends_on: z.string().regex(ISO_DATE).nullable().optional(),
    status: z.enum(STATUS).optional(),
  })
  .strict();

const WRITABLE = [
  'name', 'description', 'goal', 'experience', 'cycle_days', 'starts_on', 'ends_on', 'status',
];

const DayCreate = z
  .object({
    day_index: z.number().int().min(0).max(55),
    slot: z.number().int().min(0).max(3).default(0),
    name: z.string().trim().min(1).max(80),
    notes: z.string().trim().max(2000).nullable().optional(),
    is_rest: z.boolean().default(false),
    est_minutes: z.number().int().min(5).max(300).nullable().optional(),
    // 'HH:MM' wall clock. NULL means the ICS feed emits an all-day event, which is the honest
    // rendering of an unscheduled session rather than an invented 09:00.
    start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  })
  .strict();

const DAY_WRITABLE = ['day_index', 'slot', 'name', 'notes', 'is_rest', 'est_minutes', 'start_time'];
const DayPatch = DayCreate.partial().strict();

const idParam = z.coerce.number().int().positive();

/* ── plans ───────────────────────────────────────────────────────────────────────────────────── */

router.get(
  '/plans',
  requireAuth,
  requireCoach,
  asyncRoute(async (req, res) => {
    // Scoped by construction: there is no author id in the query string to forge.
    const plans = await db.all(
      `SELECT p.id, p.scope, p.name, p.description, p.goal, p.experience, p.cycle_days,
              p.starts_on, p.ends_on, p.status, p.revision, p.coach_client_id, p.client_user_id,
              p.created_at, p.updated_at,
              u.email AS client_email,
              (SELECT COUNT(*) FROM workout_plan_days d WHERE d.plan_id = p.id) AS day_count
         FROM workout_plans p
         LEFT JOIN users u ON u.id = p.client_user_id
        WHERE p.author_user_id = ? AND p.archived_at IS NULL
        ORDER BY p.scope, p.updated_at DESC`,
      [req.user.id],
    );
    res.json({ plans });
  }),
);

router.post(
  '/plans',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const body = PlanCreate.parse(req.body);
    const coachId = req.user.id;

    // A client-scoped plan is created THROUGH the link, so the ownership check and the write are
    // one statement. `INSERT ... SELECT ... WHERE EXISTS` rather than a preceding SELECT: there is
    // no window in which the link could be archived between the check and the insert.
    const created = body.coach_client_id
      ? await db.run(
          `INSERT INTO workout_plans
             (scope, author_user_id, coach_client_id, client_user_id, name, normalized_name,
              description, goal, experience, cycle_days, starts_on, ends_on)
           SELECT 'client', ?, cc.id, cc.client_id, ?, ?, ?, ?, ?, ?, ?, ?
             FROM coach_clients cc
            WHERE cc.id = ? AND cc.coach_id = ? AND cc.status = 'active'`,
          [
            coachId, body.name, normalizeText(body.name), body.description ?? null,
            body.goal ?? null, body.experience ?? null, body.cycle_days,
            body.starts_on ?? null, body.ends_on ?? null,
            body.coach_client_id, coachId,
          ],
        )
      : await db.run(
          `INSERT INTO workout_plans
             (scope, author_user_id, name, normalized_name, description, goal, experience,
              cycle_days, starts_on, ends_on)
           VALUES ('template', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            coachId, body.name, normalizeText(body.name), body.description ?? null,
            body.goal ?? null, body.experience ?? null, body.cycle_days,
            body.starts_on ?? null, body.ends_on ?? null,
          ],
        );

    // Zero rows means the link was not this coach's, or not active. Indistinguishable from a link
    // that never existed, which is the point.
    if (created.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.status(201).json({ id: created.lastInsertRowid });
  }),
);

/**
 * The whole authoring tree in one request.
 *
 * Four queries rather than a join: the tree is small (a cycle is at most 56 days) and four flat
 * result sets assembled in JavaScript beat one join that repeats the plan row once per set target.
 */
router.get(
  '/plans/:id',
  requireAuth,
  requireCoach,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.id);
    const coachId = req.user.id;

    const plan = await db.get(
      `SELECT * FROM workout_plans WHERE ${COACH_PLAN}`,
      [planId, coachId, coachId],
    );
    if (!plan) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    // Children are scoped on the denormalised plan_id, which the parent-coherence triggers make
    // unforgeable — so this needs no second ownership check.
    const lang = await resolveLang(req);
    const { fallback } = await languages();

    const [days, blocks, exercises, targets] = await Promise.all([
      db.all('SELECT * FROM workout_plan_days WHERE plan_id = ? ORDER BY day_index, slot', [planId]),
      db.all('SELECT * FROM workout_plan_blocks WHERE plan_id = ? ORDER BY day_id, position', [planId]),
      // The prescribed exercise's name is RESOLVED, not read from the snapshot.
      //
      // The snapshot is the fallback for when the exercise is gone — that is its whole job. While
      // the link is live the name has to go through the same chain everything else does, or a
      // Hungarian coach picks "Guggolás" from the search and the plan renders "Squats" back at
      // them. Measured: that is exactly what it did.
      db.all(
        `SELECT px.*,
                COALESCE(t.name, tf.name, e.name, px.exercise_name_snapshot) AS name,
                CASE WHEN t.lang IS NOT NULL THEN 1 ELSE 0 END AS translated
           FROM workout_plan_exercises px
           LEFT JOIN exercises e ON e.id = px.exercise_id AND e.deleted_at IS NULL
           LEFT JOIN exercise_translations t  ON t.exercise_id  = e.id AND t.lang  = ?
           LEFT JOIN exercise_translations tf ON tf.exercise_id = e.id AND tf.lang = ?
          WHERE px.plan_id = ?
          ORDER BY px.block_id, px.position`,
        [lang, fallback, planId],
      ),
      db.all('SELECT * FROM workout_plan_set_targets WHERE plan_id = ? ORDER BY exercise_row_id, set_index', [planId]),
    ]);

    res.json({ plan, days, blocks, exercises, targets });
  }),
);

router.patch(
  '/plans/:id',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.id);
    const body = PlanPatch.parse(req.body);
    const fields = WRITABLE.filter((k) => body[k] !== undefined);
    if (!fields.length) return sendError(res, 400, ERR.VALIDATION, 'nothing to change');

    // `normalized_name` is derived, never accepted: it is what the search index sorts on, and a
    // client-supplied one would let a plan sort anywhere it liked.
    const sets = fields.map((f) => `${f} = ?`);
    const params = fields.map((f) => body[f]);
    if (body.name !== undefined) {
      sets.push('normalized_name = ?');
      params.push(normalizeText(body.name));
    }

    // The guard is inside the UPDATE. A preceding SELECT would be a race, and `changes === 0`
    // already distinguishes "not yours" from "changed" without a second query.
    const result = await db.run(
      `UPDATE workout_plans SET ${sets.join(', ')}, updated_at = unixepoch() WHERE ${COACH_PLAN}`,
      [...params, planId, req.user.id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

/**
 * Archive, not delete.
 *
 * A plan that has been trained against is history's parent. Hard-deleting it would either cascade
 * into the logs or strand them — the review raised both, on every candidate design. Archiving is
 * reversible, keeps the logs' snapshots meaningful, and is what "delete" means in this product.
 */
router.delete(
  '/plans/:id',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.id);
    const result = await db.run(
      `UPDATE workout_plans SET archived_at = unixepoch(), updated_at = unixepoch() WHERE ${COACH_PLAN}`,
      [planId, req.user.id, req.user.id],
    );
    // `archived_at IS NULL` is part of COACH_PLAN, so archiving twice reports zero changes rather
    // than succeeding silently a second time.
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

/* ── days ────────────────────────────────────────────────────────────────────────────────────── */

router.post(
  '/plans/:id/days',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.id);
    const body = DayCreate.parse(req.body);
    const coachId = req.user.id;

    const created = await db.run(
      `INSERT INTO workout_plan_days (plan_id, day_index, slot, name, notes, is_rest, est_minutes, start_time)
       SELECT p.id, ?, ?, ?, ?, ?, ?, ? FROM (${COACH_PLAN_SUBQUERY}) p`,
      [
        body.day_index, body.slot, body.name, body.notes ?? null,
        body.is_rest ? 1 : 0, body.est_minutes ?? null, body.start_time ?? null,
        planId, coachId, coachId,
      ],
    );
    if (created.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.status(201).json({ id: created.lastInsertRowid });
  }),
);

router.patch(
  '/plans/:planId/days/:dayId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.planId);
    const dayId = idParam.parse(req.params.dayId);
    const body = DayPatch.parse(req.body);
    const fields = DAY_WRITABLE.filter((k) => body[k] !== undefined);
    if (!fields.length) return sendError(res, 400, ERR.VALIDATION, 'nothing to change');

    const result = await db.run(
      `UPDATE workout_plan_days
          SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = unixepoch()
        WHERE id = ? AND plan_id = (${COACH_PLAN_SUBQUERY})`,
      [
        ...fields.map((f) => (f === 'is_rest' ? (body[f] ? 1 : 0) : body[f])),
        dayId, planId, req.user.id, req.user.id,
      ],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

router.delete(
  '/plans/:planId/days/:dayId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.planId);
    const dayId = idParam.parse(req.params.dayId);

    // A day IS hard-deleted, unlike a plan: its blocks and exercises cascade, and a log that was
    // trained from it kept its own snapshot of everything it needs. Deleting a day cannot reach a
    // log — that separation is the whole reason the log tables copy rather than reference.
    const result = await db.run(
      `DELETE FROM workout_plan_days WHERE id = ? AND plan_id = (${COACH_PLAN_SUBQUERY})`,
      [dayId, planId, req.user.id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

/* ── cloning ─────────────────────────────────────────────────────────────────────────────────── */

const CloneBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    /** Present to instantiate for a client; omitted to fork the template. */
    coach_client_id: z.number().int().positive().nullable().optional(),
    starts_on: z.string().regex(ISO_DATE).nullable().optional(),
  })
  .strict();

/**
 * Clone a plan — the feature that makes templates worth having.
 *
 * A DEEP COPY, never a live link. All three independent designs in the J4 review reached that on
 * their own: a coach running forty clients on one programme must be able to fix a rep range for one
 * of them without silently rewriting what the other thirty-nine do tomorrow.
 *
 * The clone lands as a DRAFT. Instantiating a template for a client is the start of tailoring it,
 * not the end — and a draft is invisible to the client, so the coach adjusts before anyone sees it.
 */
router.post(
  '/plans/:id/clone',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const sourceId = idParam.parse(req.params.id);
    const body = CloneBody.parse(req.body ?? {});

    const source = await db.get(`SELECT name FROM workout_plans WHERE ${COACH_PLAN}`, [
      sourceId, req.user.id, req.user.id,
    ]);
    if (!source) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const result = await db.clonePlan({
      sourcePlanId: sourceId,
      coachUserId: req.user.id,
      coachClientId: body.coach_client_id ?? null,
      name: body.name?.trim() || source.name,
      startsOn: body.starts_on ?? null,
    });

    // Both failure reasons are 404: "the source is not yours" and "the destination link is not
    // yours" must be indistinguishable from each other and from "neither exists".
    if (!result.ok) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.status(201).json({ id: result.planId, copied: result.copied });
  }),
);

/* ── copy day / copy week ────────────────────────────────────────────────────────────────────── */

const CopyBody = z
  .object({
    day_ids: z.array(z.number().int().positive()).min(1).max(56),
    /** How far forward to place the copies. 7 is "copy this week into next week". */
    offset: z.number().int().min(1).max(55),
  })
  .strict();

/**
 * Copy days forward within a plan.
 *
 * The thing this endpoint has to be honest about: on a 7-day plan, "copy week 1 into week 2" is not
 * an insert — day 7 does not exist in a 7-day cycle. It is a CYCLE CHANGE to 14 days, and that
 * re-dates every future occurrence of the plan. The transaction grows the cycle and reports it, so
 * the response can tell the coach what actually happened instead of leaving them to notice their
 * calendar moved.
 */
router.post(
  '/plans/:id/copy-days',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.id);
    const body = CopyBody.parse(req.body);

    const result = await db.copyDays({
      planId,
      coachUserId: req.user.id,
      dayIds: [...new Set(body.day_ids)],
      targetOffset: body.offset,
    });

    if (!result.ok) {
      // Ownership misses are 404 and indistinguishable. The other two are the coach's own inputs
      // being impossible, and they say WHY — a coach cannot act on "not allowed".
      if (result.reason === 'plan' || result.reason === 'days') {
        return sendError(res, 404, ERR.NOT_FOUND, 'not found');
      }
      if (result.reason === 'occupied') {
        return sendError(res, 409, ERR.CONFLICT, `day ${result.at + 1} is already in use`);
      }
      return sendError(res, 400, ERR.VALIDATION, 'the copy would push the cycle past 56 days');
    }

    res.status(201).json({
      copied: result.copied,
      cycleDays: result.cycleDays,
      // Non-null means the schedule of every future occurrence just moved. The UI must say so.
      cycleGrewTo: result.cycleGrewTo,
    });
  }),
);

/* ── blocks ──────────────────────────────────────────────────────────────────────────────────
 *
 * A block is the superset / circuit layer. It exists as a ROW rather than as a tag on the exercises
 * because a circuit repeats the BLOCK while a straight set repeats the EXERCISE — so `rounds`, the
 * rest between rounds and the time cap belong to the block, and a tag would have nowhere to put
 * them.
 */

const BLOCK_KINDS = ['single', 'superset', 'circuit', 'emom', 'amrap'];

const BlockCreate = z
  .object({
    day_id: z.number().int().positive(),
    kind: z.enum(BLOCK_KINDS).default('single'),
    position: z.number().int().min(0).max(500).default(0),
    rounds: z.number().int().min(1).max(50).nullable().optional(),
    rest_seconds: z.number().int().min(0).max(3600).nullable().optional(),
    cap_seconds: z.number().int().min(1).max(7200).nullable().optional(),
    label: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

const BLOCK_WRITABLE = ['kind', 'position', 'rounds', 'rest_seconds', 'cap_seconds', 'label'];
const BlockPatch = BlockCreate.omit({ day_id: true }).partial().strict();

router.post(
  '/plans/:id/blocks',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.id);
    const body = BlockCreate.parse(req.body);
    const coachId = req.user.id;

    // The day must belong to the SAME plan the caller owns. Both halves in one statement: the
    // ownership subquery scopes the plan, and the join on the day scopes the parent. A day id from
    // another plan simply selects nothing.
    const created = await db.run(
      `INSERT INTO workout_plan_blocks (plan_id, day_id, kind, position, rounds, rest_seconds, cap_seconds, label)
       SELECT d.plan_id, d.id, ?, ?, ?, ?, ?, ?
         FROM workout_plan_days d
        WHERE d.id = ? AND d.plan_id = (${COACH_PLAN_SUBQUERY})`,
      [
        body.kind, body.position, body.rounds ?? null, body.rest_seconds ?? null,
        body.cap_seconds ?? null, body.label ?? null,
        body.day_id, planId, coachId, coachId,
      ],
    );
    if (created.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.status(201).json({ id: created.lastInsertRowid });
  }),
);

router.patch(
  '/plans/:planId/blocks/:blockId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.planId);
    const blockId = idParam.parse(req.params.blockId);
    const body = BlockPatch.parse(req.body);
    const fields = BLOCK_WRITABLE.filter((k) => body[k] !== undefined);
    if (!fields.length) return sendError(res, 400, ERR.VALIDATION, 'nothing to change');

    const result = await db.run(
      `UPDATE workout_plan_blocks SET ${fields.map((f) => `${f} = ?`).join(', ')}
        WHERE id = ? AND plan_id = (${COACH_PLAN_SUBQUERY})`,
      [...fields.map((f) => body[f]), blockId, planId, req.user.id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

router.delete(
  '/plans/:planId/blocks/:blockId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.planId);
    const blockId = idParam.parse(req.params.blockId);
    const result = await db.run(
      `DELETE FROM workout_plan_blocks WHERE id = ? AND plan_id = (${COACH_PLAN_SUBQUERY})`,
      [blockId, planId, req.user.id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

/* ── prescribed exercises ────────────────────────────────────────────────────────────────────── */

const METRICS = ['reps', 'time', 'distance'];
const LOAD_MODES = ['external', 'bodyweight', 'weighted_bodyweight', 'assisted'];

const ExerciseCreate = z
  .object({
    block_id: z.number().int().positive(),
    exercise_id: z.number().int().positive().nullable().optional(),
    position: z.number().int().min(0).max(500).default(0),
    target_metric: z.enum(METRICS).default('reps'),
    load_mode: z.enum(LOAD_MODES).default('external'),
    target_sets: z.number().int().min(1).max(50).default(3),
    target_reps_min: z.number().int().min(1).max(1000).nullable().optional(),
    target_reps_max: z.number().int().min(1).max(1000).nullable().optional(),
    target_seconds: z.number().int().min(1).max(7200).nullable().optional(),
    target_distance_m: z.number().int().min(1).max(200000).nullable().optional(),
    // What the coach TYPED, with the unit they typed it in. The canonical kilograms are computed
    // here, never accepted — see `toKilograms`.
    target_weight: z.number().min(0).max(2205).nullable().optional(),
    target_weight_unit: z.enum(['kg', 'lb']).default('kg'),
    target_percent_1rm: z.number().min(1).max(200).nullable().optional(),
    target_rpe: z.number().min(1).max(10).nullable().optional(),
    rest_seconds: z.number().int().min(0).max(3600).nullable().optional(),
    tempo: z.string().trim().max(16).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

const EX_WRITABLE = [
  'position', 'target_metric', 'load_mode', 'target_sets', 'target_reps_min', 'target_reps_max',
  'target_seconds', 'target_distance_m', 'target_percent_1rm', 'target_rpe', 'rest_seconds',
  'tempo', 'notes',
];
const ExercisePatch = ExerciseCreate.omit({ block_id: true, exercise_id: true }).partial().strict();

/**
 * Canonical kilograms, computed on the server from what the coach typed.
 *
 * The schema keeps BOTH: `target_weight_kg` for every comparison, and the entry pair for showing
 * the coach the number they actually wrote, so "225 lb" never renders as "102.1 kg". A CHECK
 * verifies the two agree to within 0.02 kg — so if the client were allowed to send the canonical
 * value it could send a pair that disagrees, and the CHECK would reject the write with a message
 * nobody could act on. Computing it here means the pair is correct by construction.
 *
 * `onboarding_profiles.units` is a DISPLAY preference and deliberately not consulted: the unit
 * comes from the request that carried the number, because a coach can type lb for one client and
 * kg for the next in the same session.
 */
const LB_TO_KG = 0.45359237;
function toKilograms(value, unit) {
  if (value === null || value === undefined) return { kg: null, entryValue: null, entryUnit: null };
  const kg = unit === 'lb' ? value * LB_TO_KG : value;
  // Rounded to the gram. The CHECK allows 0.02 kg of slack; landing well inside it means a float
  // that round-trips through JSON cannot drift over the edge.
  return { kg: Math.round(kg * 1000) / 1000, entryValue: value, entryUnit: unit };
}

router.post(
  '/plans/:id/exercises',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.id);
    const body = ExerciseCreate.parse(req.body);
    const coachId = req.user.id;
    const weight = toKilograms(body.target_weight ?? null, body.target_weight_unit);

    // The name is SNAPSHOT at prescription time, from the exercise's canonical name. It is what a
    // client's log will carry forever, so it must not be client-supplied — and it must survive the
    // exercise being renamed or deleted later.
    //
    // `exercise_id` is scoped to what this coach may actually prescribe: a global row, an unowned
    // one, or one they own. A private exercise belonging to another coach selects nothing.
    const created = await db.run(
      `INSERT INTO workout_plan_exercises
         (plan_id, block_id, exercise_id, exercise_name_snapshot, position, target_metric, load_mode,
          target_sets, target_reps_min, target_reps_max, target_seconds, target_distance_m,
          target_weight_kg, target_weight_entry_unit, target_weight_entry_value,
          target_percent_1rm, target_rpe, rest_seconds, tempo, notes)
       SELECT b.plan_id, b.id, e.id, COALESCE(e.name, 'Exercise'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM workout_plan_blocks b
         LEFT JOIN exercises e
                ON e.id = ?
               AND e.deleted_at IS NULL
               AND (e.status = 'global' OR e.owner_id IS NULL OR e.owner_id = ?)
        WHERE b.id = ? AND b.plan_id = (${COACH_PLAN_SUBQUERY})`,
      [
        body.position, body.target_metric, body.load_mode, body.target_sets,
        body.target_reps_min ?? null, body.target_reps_max ?? null,
        body.target_seconds ?? null, body.target_distance_m ?? null,
        weight.kg, weight.entryUnit, weight.entryValue,
        body.target_percent_1rm ?? null, body.target_rpe ?? null,
        body.rest_seconds ?? null, body.tempo ?? null, body.notes ?? null,
        body.exercise_id ?? null, coachId,
        body.block_id, planId, coachId, coachId,
      ],
    );
    if (created.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.status(201).json({ id: created.lastInsertRowid });
  }),
);

router.patch(
  '/plans/:planId/exercises/:rowId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.planId);
    const rowId = idParam.parse(req.params.rowId);
    const body = ExercisePatch.parse(req.body);

    const sets = EX_WRITABLE.filter((k) => body[k] !== undefined).map((f) => `${f} = ?`);
    const params = EX_WRITABLE.filter((k) => body[k] !== undefined).map((f) => body[f]);

    // The weight triple moves together or not at all — three columns tied by a CHECK, so writing
    // one of them alone puts the row in violation of a constraint it was never asked about.
    if (body.target_weight !== undefined) {
      const weight = toKilograms(body.target_weight, body.target_weight_unit ?? 'kg');
      sets.push('target_weight_kg = ?', 'target_weight_entry_unit = ?', 'target_weight_entry_value = ?');
      params.push(weight.kg, weight.entryUnit, weight.entryValue);
    }
    if (!sets.length) return sendError(res, 400, ERR.VALIDATION, 'nothing to change');

    const result = await db.run(
      `UPDATE workout_plan_exercises SET ${sets.join(', ')}, updated_at = unixepoch()
        WHERE id = ? AND plan_id = (${COACH_PLAN_SUBQUERY})`,
      [...params, rowId, planId, req.user.id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

router.delete(
  '/plans/:planId/exercises/:rowId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.planId);
    const rowId = idParam.parse(req.params.rowId);
    const result = await db.run(
      `DELETE FROM workout_plan_exercises WHERE id = ? AND plan_id = (${COACH_PLAN_SUBQUERY})`,
      [rowId, planId, req.user.id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

/* ── reordering ──────────────────────────────────────────────────────────────────────────────── */

const Reorder = z
  .object({
    // The full ordered list, not a pair of indices. A drag is "here is the new order", and sending
    // it whole means a dropped request cannot leave two items claiming the same position — the
    // next successful drag states the truth again.
    ids: z.array(z.number().int().positive()).min(1).max(200),
  })
  .strict();

/**
 * Renumber a set of sibling rows.
 *
 * One transaction, one UPDATE per row, each carrying the ownership predicate. A row from another
 * plan simply matches nothing — so a forged id in the list is a no-op rather than a cross-tenant
 * write, and the response says how many actually moved.
 *
 * Positions are rewritten from 0 rather than shuffled, because a gap-based scheme eventually runs
 * out of gaps and needs a compaction pass nobody remembers to write. A cycle is at most 56 days
 * and a day at most a few dozen rows; renumbering is cheap and always correct.
 */
const reorderIn = (table) =>
  asyncRoute(async (req, res) => {
    const planId = idParam.parse(req.params.planId);
    const { ids } = Reorder.parse(req.body);
    const coachId = req.user.id;

    // Duplicates in the list would make the final position depend on statement order.
    if (new Set(ids).size !== ids.length) {
      return sendError(res, 400, ERR.VALIDATION, 'the order contains the same id twice');
    }

    const results = await db.writeTx(
      ids.map((id, index) => ({
        sql: `UPDATE ${table} SET position = ? WHERE id = ? AND plan_id = (${COACH_PLAN_SUBQUERY})`,
        params: [index, id, planId, coachId, coachId],
      })),
    );

    const moved = results.reduce((n, r) => n + r.changes, 0);
    // Partial success is reported, not hidden: if the client's list has drifted from the server's,
    // the difference is what tells the UI to refetch instead of showing a stale order.
    if (moved === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ moved, of: ids.length });
  });

router.put('/plans/:planId/blocks/order', requireAuth, requireCoach, writeLimiter, reorderIn('workout_plan_blocks'));
router.put('/plans/:planId/exercises/order', requireAuth, requireCoach, writeLimiter, reorderIn('workout_plan_exercises'));

/* ── the client's view ───────────────────────────────────────────────────────────────────────── */

/**
 * A client's own plans. No `requireCoach`, and no link-status filter — a client keeps their plan
 * after their coach archives them.
 */
router.get(
  '/my-plans',
  requireAuth,
  asyncRoute(async (req, res) => {
    const plans = await db.all(
      `SELECT id, name, description, goal, experience, cycle_days, starts_on, ends_on, status,
              revision, updated_at
         FROM workout_plans
        WHERE ${CLIENT_PLAN}
        ORDER BY status = 'active' DESC, updated_at DESC`,
      [req.user.id],
    );
    res.json({ plans });
  }),
);

export default router;
