// src/logs/routes.js — the guided workout: starting a session and checking a set (F3 execution).
//
// The set-check is the hottest write in the product and the one place idempotency actually
// matters, so the work happens in NAMED worker transactions (`startWorkoutTx`, `recordSetTx`)
// rather than in this file. What lives here is the HTTP shape: validation, ownership of the thing
// being started, and translating three database outcomes into three honest status codes.
//
// Ownership is single-table throughout — `WHERE id = ? AND client_user_id = ?`. The set-check path
// never climbs a level to find an owner, because the denormalised `client_user_id` is kept honest
// against the parent by triggers and a join on the busiest write in the app is a cost paid on
// every rep of every set.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { evaluateInBackground } from '../coins/achievements.js';
import { requireAuth, requireCoach } from '../auth/middleware.js';
// The schedule rule and the calendar-day derivation both live in ONE place now. `local_date`
// decides which day a record belongs to, so it is never taken from the request: a phone with a
// wrong clock, or a forged proxy request, could otherwise place a lift on any date it liked and
// mint a record on a day whose best is already beaten.
import { localDateFor, occurrencesBetween } from '../plans/schedule.js';

const router = Router();

/**
 * A set-check happens once per rep-set, so the ceiling is generous — a long session with a
 * flaky connection legitimately produces hundreds. It is still far below what a script needs to
 * be useful, and the write is idempotent anyway: replaying it cannot inflate anything.
 */
const setLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 900,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const startLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const idParam = z.coerce.number().int().positive();

/* ── starting a session ──────────────────────────────────────────────────────────────────────── */

const StartBody = z
  .object({
    // Omitted for a freestyle session. A workout done off-plan is first-class here, not an
    // afterthought — it is the same object with two NULLs.
    plan_day_id: z.number().int().positive().nullable().optional(),
    title: z.string().trim().min(1).max(120).nullable().optional(),
    bodyweight_kg: z.number().min(25).max(400).nullable().optional(),
  })
  .strict();

router.post(
  '/workouts/start',
  requireAuth,
  startLimiter,
  asyncRoute(async (req, res) => {
    const body = StartBody.parse(req.body);
    const userId = req.user.id;
    const localDate = await localDateFor(userId);

    let plan = {
      coachClientId: null, planId: null, planDayId: null, planRevision: null,
      planName: null, dayName: null, occurrenceDate: null,
      // 'freestyle', not 'adhoc'. `workout_logs` carries CHECK (source IN ('plan','freestyle',
      // 'repeat')), so the old word aborted EVERY off-plan start with a 400 — a first-class
      // feature per the comment below that had never once worked. Nothing caught it because all
      // three smoke starts passed a plan_day_id; there is now one that does not.
      title: body.title ?? null, source: 'freestyle', tzName: null,
      bodyweightKg: body.bodyweight_kg ?? null,
    };
    let exercises = [];

    if (body.plan_day_id) {
      // The day must belong to a plan this client can actually see. Same predicate as `/my-plans`:
      // single-table on the plan, no link-status filter, drafts excluded.
      const day = await db.get(
        `SELECT d.id, d.name AS day_name, p.id AS plan_id, p.revision, p.name AS plan_name,
                p.coach_client_id
           FROM workout_plan_days d
           JOIN workout_plans p ON p.id = d.plan_id
          WHERE d.id = ? AND p.client_user_id = ? AND p.archived_at IS NULL AND p.status <> 'draft'`,
        [body.plan_day_id, userId],
      );
      // 404 for "not yours", "archived", "still a draft" and "never existed" alike.
      if (!day) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

      plan = {
        ...plan,
        coachClientId: day.coach_client_id,
        planId: day.plan_id,
        planDayId: day.id,
        planRevision: day.revision,
        planName: day.plan_name,
        dayName: day.day_name,
        occurrenceDate: localDate,
        title: body.title ?? day.day_name,
        source: 'plan',
      };

      // The prescription, read once and COPIED into the session. The coach editing this plan
      // tomorrow must not rewrite what the client was told to do today.
      const prescribed = await db.all(
        // `b.rest_seconds` MUST be aliased. `px.rest_seconds` is already selected and
        // better-sqlite3 keys the row object by column name, so an unaliased duplicate silently
        // shadows it — the member's own transition rest would become the block's between-round
        // rest with no error anywhere.
        `SELECT px.id, px.exercise_id, px.exercise_name_snapshot, px.position, px.target_metric,
                px.load_mode, px.target_sets, px.target_reps_min, px.target_seconds,
                px.target_distance_m, px.target_weight_kg, px.target_rpe, px.rest_seconds,
                b.kind AS block_kind, b.position AS block_position, b.id AS block_id,
                b.rounds, b.rest_seconds AS block_rest_seconds, b.cap_seconds
           FROM workout_plan_exercises px
           JOIN workout_plan_blocks b ON b.id = px.block_id
          WHERE b.day_id = ?
          ORDER BY b.position, px.position, px.id`,
        [day.id],
      );

      // The last member of each block, needed below to tell a TRANSITION rest (between movements
      // inside a round) from a ROUND rest (after the last movement). `prescribed` is already
      // ordered by `b.position, px.position, px.id`, so this is the last row seen per block.
      const lastOfBlock = new Map();
      for (const px of prescribed) lastOfBlock.set(px.block_id, px.id);

      exercises = prescribed.map((px) => {
        // A CIRCUIT REPEATS THE BLOCK; `target_sets` repeats the EXERCISE (010:314). For a
        // round-based block the round count is therefore the ONLY repetition factor — multiplying
        // the two would produce a flat set_index with no recoverable round number, and would
        // reintroduce a multiplicative row count against the schema's 50-row ceiling. Since
        // `rounds` is CHECKed at 1..50, one factor keeps that ceiling unreachable by construction.
        const roundBased = px.block_kind === 'circuit' || px.block_kind === 'emom';
        const rowCount = roundBased ? (px.rounds ?? 1) : px.target_sets;
        const isLastMember = lastOfBlock.get(px.block_id) === px.id;

        return {
          exerciseId: px.exercise_id,
          nameSnapshot: px.exercise_name_snapshot,
          planExerciseId: px.id,
          origin: 'plan',
          blockKind: px.block_kind,
          blockOrdinal: px.block_position,
          position: px.position,
          targetMetric: px.target_metric,
          loadMode: px.load_mode,
          // One row per prescribed set — or per ROUND for a circuit or EMOM. The grid the player
          // renders is the grid the server holds, which is what lets the player work with no
          // network at all, and it is what makes an interval round idempotent for free: checking
          // a round is an UPDATE on a row that already exists, guarded by its own write_uid.
          sets: Array.from({ length: rowCount }, (_, i) => ({
            planSetTargetId: null,
            setIndex: i + 1,
            setKind: 'straight',
            targetReps: px.target_reps_min,
            // AMRAP is the only place the block's time cap can survive materialisation — a round
            // of an AMRAP is bounded by the cap, and `target_seconds` is literally "the prescribed
            // duration of this set".
            targetSeconds: px.block_kind === 'amrap' ? (px.target_seconds ?? px.cap_seconds) : px.target_seconds,
            targetDistanceM: px.target_distance_m,
            targetWeightKg: px.target_weight_kg,
            targetRpe: px.target_rpe,
            // For an EMOM the block's `rest_seconds` IS the minute window, not a rest. If it is
            // null the block is simply not runnable and the stage says so — guessing 60 would be
            // inventing a prescription the coach did not write.
            targetRestSeconds:
              px.block_kind === 'emom'
                ? px.block_rest_seconds
                : isLastMember
                  ? (px.block_rest_seconds ?? px.rest_seconds)
                  : (px.rest_seconds ?? px.block_rest_seconds),
          })),
        };
      });

      // `workout_log_sets.set_index` carries CHECK (set_index BETWEEN 1 AND 50). Under the
      // expansion above this is unreachable, so this is an assertion that a future change to it
      // cannot silently break. It refuses BEFORE the log row is inserted, which a CHECK abort
      // inside the transaction would not — that would leave the start failed with an orphan log.
      for (const ex of exercises) {
        if (ex.sets.length > 50) {
          return sendError(res, 400, ERR.VALIDATION, 'a block expands to more than 50 sets');
        }
      }
    }

    const result = await db.startWorkout({ clientUserId: userId, localDate, plan, exercises });
    // A client that lost its connection mid-workout gets the SAME session back rather than an
    // error. Resuming is the common case on a phone, not an exceptional one.
    res.status(result.resumed ? 200 : 201).json(result);
  }),
);

/* ── the live session ────────────────────────────────────────────────────────────────────────── */

/**
 * The live session — and the records it has already earned.
 *
 * The records used to reach the player ONLY as the return value of the check that minted them, so
 * the gold badge lived in a component's own state and died with it: switch exercise, reload, or
 * come back from offline and the trophy was gone while the `workout_pr_events` row sat untouched in
 * the database. The server is the one that knows a record was set; this is where it says so, and
 * carrying it WITH the set means a refetch can neither erase the fact nor replay the celebration.
 */
router.get(
  '/workouts/current',
  requireAuth,
  asyncRoute(async (req, res) => {
    const log = await db.get(
      `SELECT * FROM workout_logs WHERE client_user_id = ? AND status = 'in_progress'`,
      [req.user.id],
    );
    if (!log) return res.json({ log: null, exercises: [], sets: [] });

    const [exercises, sets, prEvents] = await Promise.all([
      db.all('SELECT * FROM workout_log_exercises WHERE log_id = ? ORDER BY position, id', [log.id]),
      db.all('SELECT * FROM workout_log_sets WHERE log_id = ? ORDER BY log_exercise_id, set_index', [log.id]),
      // Ownership from the SESSION's own user, not from `req.user` a second time: the log was
      // already proven theirs above, so the event and the log it belongs to are scoped by one and
      // the same owner rather than by two claims that could drift apart.
      //
      // Scoped by membership in this log's SETS rather than by `workout_pr_events.log_id`, which
      // carries no index — and this route refetches after every single set check, so that
      // predicate would walk the client's entire record book once per rep. The subquery is a seek
      // on `workout_log_sets_log_idx` and each id it yields a seek on
      // `workout_pr_events_source_idx`: bounded by the session, not by how long the client has
      // been training. A 'session_volume' record has no source set and is not a per-set trophy
      // anyway — the membership test drops it for free.
      //
      // `invalidated_at IS NULL` is the same term the record book uses: a withdrawn record is
      // history, not a badge, so voiding a set takes its trophy with it on the next refetch.
      db.all(
        `SELECT source_set_id, kind, rep_bucket, value, previous_value
           FROM workout_pr_events
          WHERE client_user_id = ? AND invalidated_at IS NULL
            AND source_set_id IN (SELECT id FROM workout_log_sets WHERE log_id = ?)
          ORDER BY id`,
        [log.client_user_id, log.id],
      ),
    ]);

    const earned = new Map();
    for (const ev of prEvents) {
      // The SAME shape `recordSetTx` hands back to `/sets/:id/check`, camelCase and all. Two shapes
      // for one thing would force the player to tell a record it just earned from one it is merely
      // being reminded of, which is exactly the distinction it must NOT make.
      const record = {
        kind: ev.kind,
        repBucket: ev.rep_bucket,
        value: ev.value,
        previous: ev.previous_value,
      };
      const list = earned.get(ev.source_set_id);
      if (list) list.push(record);
      else earned.set(ev.source_set_id, [record]);
    }

    res.json({
      log,
      exercises,
      // Attached only where there is something to attach. An empty array on all fifty rows of a
      // long session is payload that says exactly what its absence already said.
      sets: sets.map((s) => (earned.has(s.id) ? { ...s, records: earned.get(s.id) } : s)),
    });
  }),
);

/**
 * The PREVIOUS column: what this client did last time on each of these movements.
 *
 * A separate endpoint rather than a per-set lookup, because the player needs all of it at once and
 * one query over `workout_log_sets_progress_idx` beats one per set on the busiest screen.
 */
router.get(
  '/workouts/current/previous',
  requireAuth,
  asyncRoute(async (req, res) => {
    const previous = await db.all(
      `SELECT s.exercise_id, s.set_index, s.weight_kg, s.reps, s.seconds, s.local_date
         FROM workout_log_sets s
        WHERE s.client_user_id = ?
          AND s.completed_at IS NOT NULL AND s.voided_at IS NULL AND s.set_kind <> 'warmup'
          AND s.exercise_id IN (
                SELECT exercise_id FROM workout_log_exercises
                 WHERE log_id = (SELECT id FROM workout_logs
                                  WHERE client_user_id = ? AND status = 'in_progress')
                   AND exercise_id IS NOT NULL)
          AND s.log_id <> COALESCE((SELECT id FROM workout_logs
                                     WHERE client_user_id = ? AND status = 'in_progress'), -1)
        ORDER BY s.exercise_id, s.local_date DESC, s.id DESC`,
      [req.user.id, req.user.id, req.user.id],
    );
    res.json({ previous });
  }),
);

/* ── checking a set ──────────────────────────────────────────────────────────────────────────── */

const SetBody = z
  .object({
    /**
     * The idempotency key, minted by the CLIENT per logical check and reused on every retry.
     *
     * It has to participate in the guard or it is decoration — which is finding #3 in the
     * constraints checklist. Bounded to match the column's CHECK so a bad key is a 400 here rather
     * than a constraint abort three layers down.
     */
    write_uid: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    // What the client TYPED. Canonical kilograms are computed here, never accepted — the same
    // rule as the plan's prescribed weight, and for the same reason: a CHECK ties the pair
    // together, so an inconsistent pair sent by a client would abort with an unactionable message.
    weight: z.number().min(0).max(2500).nullable().optional(),
    weight_unit: z.enum(['kg', 'lb']).default('kg'),
    reps: z.number().int().min(0).max(1000).nullable().optional(),
    seconds: z.number().int().min(0).max(7200).nullable().optional(),
    distance_m: z.number().int().min(0).max(200000).nullable().optional(),
    rpe: z
      .number()
      .refine((v) => Number.isInteger(v * 2) && v >= 1 && v <= 10, 'RPE moves in half points from 1 to 10')
      .nullable()
      .optional(),
    rest_taken_seconds: z.number().int().min(0).max(3600).nullable().optional(),
  })
  .strict();

const LB_TO_KG = 0.45359237;

router.post(
  '/sets/:id/check',
  requireAuth,
  setLimiter,
  asyncRoute(async (req, res) => {
    const setId = idParam.parse(req.params.id);
    const body = SetBody.parse(req.body);

    const entryValue = body.weight ?? null;
    const weightKg =
      entryValue === null
        ? null
        : Math.round((body.weight_unit === 'lb' ? entryValue * LB_TO_KG : entryValue) * 1000) / 1000;

    const result = await db.recordSet({
      setId,
      clientUserId: req.user.id,
      writeUid: body.write_uid,
      values: {
        weightKg,
        entryUnit: entryValue === null ? null : body.weight_unit,
        entryValue,
        reps: body.reps ?? null,
        seconds: body.seconds ?? null,
        distanceM: body.distance_m ?? null,
        rpe: body.rpe ?? null,
        restTakenSeconds: body.rest_taken_seconds ?? null,
      },
    });

    // Not yours, or never existed. Indistinguishable, deliberately.
    if (result.outcome === 'missing') return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    if (result.outcome === 'conflict') {
      // A DIFFERENT payload against a set that is already complete. Answering 200 here is the
      // mistake every candidate design made: the client would believe its correction landed while
      // the stored value stayed as it was. The stored row is returned so the UI can offer
      // void-and-relog with both numbers on screen.
      return res.status(409).json({
        error: 'this set is already recorded with different values',
        code: ERR.CONFLICT,
        stored: result.existing,
      });
    }

    // `applied: true` with `replayed: true` means the same request arrived twice. It is a success,
    // not a failure — a double-tapped button is the client's most ordinary mistake — but the flag
    // lets the player avoid flashing the same PR badge a second time.
    res.json({ applied: true, replayed: result.replayed, records: result.records });
  }),
);

const VoidBody = z
  .object({
    // Bounded to the column's own limit. Free text from a client is one of the few things that
    // reaches storage verbatim, so the bound is here as well as in the schema.
    reason: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

/**
 * Undo a recorded set.
 *
 * The counterpart to the 409 above: `/check` tells a client its correction did not land and offers
 * void-and-relog, and this is the void. It is also what E21's undo pill calls when a lifter taps
 * the wrong row mid-set — the failure the player's whole no-scroll layout exists to make unlikely.
 *
 * Rate-limited with the set limiter rather than a stricter one: an undo is part of the same
 * check/correct rhythm as the check itself, and a lifter correcting a mistake should not be the one
 * who hits a wall.
 */
router.post(
  '/sets/:id/void',
  requireAuth,
  setLimiter,
  asyncRoute(async (req, res) => {
    const setId = idParam.parse(req.params.id);
    const body = VoidBody.parse(req.body ?? {});

    const result = await db.voidSet({
      setId,
      clientUserId: req.user.id,
      reason: body.reason ?? 'undone by the client',
    });

    // Not yours, or never existed. Indistinguishable, deliberately.
    if (result.outcome === 'missing') return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    // A set that was never checked has nothing to undo. This is a 409 rather than a 404 because the
    // set genuinely is theirs and genuinely does exist — saying "not found" here would send a
    // client hunting for a bug in the wrong place.
    if (result.outcome === 'not_completed') {
      return sendError(res, 409, ERR.CONFLICT, 'this set was never recorded');
    }

    // `replayed` is a success. A void carries no values to disagree about, so the second tap is
    // asking for the state that already exists — but the flag lets the player skip re-animating an
    // undo the lifter already saw.
    res.json({
      voided: true,
      replayed: result.outcome === 'replayed',
      records_withdrawn: result.recordsWithdrawn ?? 0,
    });
  }),
);

/* ── ending a session ────────────────────────────────────────────────────────────────────────── */

const FinishBody = z
  .object({
    // What the PLAYER measured, not what the wall clock says. A session left open on a locked
    // phone has a real duration and a wall-clock span, and the schema stores both because both are
    // facts — see the column comment on `duration_seconds`.
    duration_seconds: z.number().int().min(0).max(86400).nullable().optional(),
    perceived_effort: z.number().int().min(1).max(10).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

/**
 * Finish or abandon the live session.
 *
 * WITHOUT THIS THERE WAS NO WAY OUT. `workout_logs.status` admits 'completed' and 'abandoned',
 * `workout_logs_one_live_unique` allows exactly one 'in_progress' row per client, and no route
 * ever left the first state — so every session stayed open forever and `/workouts/start` could
 * only ever RESUME. A second workout was unreachable, and no session ever reached the history in a
 * finished state. The schema had anticipated all of this; only the two transitions were missing.
 *
 * One guarded UPDATE, no named transaction: there is no branching and no dependent write. The
 * guard is `status = 'in_progress'`, which makes finishing twice report zero changes rather than
 * re-dating a closed session — and `trg_log_frozen` would abort that anyway, so the guard turns a
 * 500 from a raised trigger into an honest 404.
 */
const endSession = (status) =>
  asyncRoute(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const body = status === 'completed' ? FinishBody.parse(req.body ?? {}) : {};

    const result = await db.run(
      `UPDATE workout_logs
          SET status = ?,
              -- The CHECK requires a completion stamp on a completed row, and forbids one earlier
              -- than the start. MAX() covers a clock that moved backwards between the two.
              completed_at = MAX(unixepoch(), started_at),
              duration_seconds = COALESCE(?, duration_seconds),
              perceived_effort = COALESCE(?, perceived_effort),
              notes = COALESCE(?, notes),
              last_activity_at = unixepoch()
        WHERE id = ? AND client_user_id = ? AND status = 'in_progress'`,
      [
        status,
        body.duration_seconds ?? null,
        body.perceived_effort ?? null,
        body.notes ?? null,
        id,
        req.user.id,
      ],
    );

    // Not yours, never existed, or already closed. One answer for all three: a client that lost the
    // response and retried gets the same thing as one probing a stranger's id.
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    // AFTER the session is safely closed, and never blocking it. A badge that did not land is
    // recoverable on the next session because every check the evaluator makes is a state question
    // ("have they done ten?") rather than an event ("this was the tenth") — a missed run
    // self-heals. A workout that failed to save because of a badge would not.
    //
    // Only on a COMPLETED session. Abandoning one is not an achievement.
    if (status === 'completed') {
      evaluateInBackground(req, { userId: req.user.id, sourceType: 'workout_log', sourceId: id });
    }

    res.json({ status });
  });

router.post('/workouts/:id/finish', requireAuth, setLimiter, endSession('completed'));

/**
 * Abandon: the session happened, but not as a session. The rows survive — `abandoned` is filtered
 * out of the history queries rather than deleted, because "I started and gave up" is information
 * a coach may want and a client may want back.
 */
router.post('/workouts/:id/abandon', requireAuth, setLimiter, endSession('abandoned'));

/* ── what is on today ────────────────────────────────────────────────────────────────────────── */

/**
 * The Home screen's "today" card.
 *
 * The schedule is a RULE, not a materialised calendar: an occurrence is
 * `starts_on + k*cycle_days + day_index`, so "what is on today" is arithmetic rather than a table
 * scan. Written as SQL rather than assembled in JavaScript because the whole point of the rule is
 * that it costs one indexed query however far in the future you ask.
 *
 * Three things it deliberately handles, each of which would otherwise show a client the wrong day:
 *   - `ends_on`: a finished block stops producing occurrences.
 *   - exceptions: a `skip` removes the day; a `move` relocates it, so the day also has to be
 *     matched by anything moved ONTO today.
 *   - rest days: they occur, and saying "rest day" is information. Hiding them looks like a bug.
 */
router.get(
  '/my-plans/today',
  requireAuth,
  asyncRoute(async (req, res) => {
    // A ONE-DAY WINDOW of the shared generator, not a second copy of the rule.
    //
    // It was a copy, and the copy drifted within a day of being written: the scheduled half
    // filtered the plan's `ends_on` and the moved half did not, so a day moved out of a finished
    // block still showed up. Expressing today as a window of the same function makes that
    // impossible rather than merely fixed.
    const today = await localDateFor(req.user.id);
    const days = await occurrencesBetween(req.user.id, today, 1);
    res.json({ date: today, days });
  }),
);

const WeekQuery = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: z.coerce.number().int().min(1).max(28).default(7),
  })
  .strict();

router.get(
  '/my-plans/week',
  requireAuth,
  asyncRoute(async (req, res) => {
    const qs = WeekQuery.parse(req.query);
    // `from` is a VIEW parameter — which week the user is looking at — not a claim about today.
    // Anything that decides a record's date still comes from the server's own calendar.
    const from = qs.from ?? (await localDateFor(req.user.id));
    const occurrences = await occurrencesBetween(req.user.id, from, qs.days);
    res.json({ from, days: qs.days, occurrences });
  }),
);

/* ── history ─────────────────────────────────────────────────────────────────────────────────── */

const HistoryQuery = z
  .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
  .strict();

/** The client's own training history — finished sessions, newest first. */
router.get(
  '/workouts',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { limit } = HistoryQuery.parse(req.query);
    const logs = await db.all(
      // `total_work_seconds` is not optional detail for a conditioning session — it is the ONLY
      // number that describes it. A Tabata has zero volume and zero reps by nature, so withholding
      // the seconds renders it in the history list as an empty session the client did not do.
      `SELECT id, title, plan_name_snapshot, day_name_snapshot, local_date, started_at,
              completed_at, status, total_sets, total_working_sets, total_reps, total_volume_kg,
              total_work_seconds, duration_seconds
         FROM workout_logs
        WHERE client_user_id = ? AND status <> 'abandoned'
        ORDER BY local_date DESC, id DESC
        LIMIT ?`,
      [req.user.id, limit],
    );
    res.json({ logs });
  }),
);

/**
 * A coach reading a client's history.
 *
 * Keyed on the LINK id, and the EXISTS is what makes archiving take effect on the very next
 * request — the same shape the onboarding read uses. A coach never writes a client's log; there is
 * deliberately no route for it.
 */
router.get(
  '/clients/:id/workouts',
  requireAuth,
  requireCoach,
  asyncRoute(async (req, res) => {
    const linkId = idParam.parse(req.params.id);
    const { limit } = HistoryQuery.parse(req.query);
    const logs = await db.all(
      // Same column list as the client's own history above, `total_work_seconds` included. A coach
      // looking at a conditioning session must not see less than the client does.
      `SELECT l.id, l.title, l.plan_name_snapshot, l.day_name_snapshot, l.local_date, l.started_at,
              l.completed_at, l.status, l.total_sets, l.total_working_sets, l.total_reps,
              l.total_volume_kg, l.total_work_seconds, l.duration_seconds
         FROM workout_logs l
        WHERE l.coach_client_id = ? AND l.status <> 'abandoned'
          AND EXISTS (SELECT 1 FROM coach_clients cc
                       WHERE cc.id = ? AND cc.coach_id = ? AND cc.status = 'active')
        ORDER BY l.local_date DESC, l.id DESC
        LIMIT ?`,
      [linkId, linkId, req.user.id, limit],
    );
    res.json({ logs });
  }),
);

/* ── records ─────────────────────────────────────────────────────────────────────────────────── */

const RECORD_COLUMNS = `id, exercise_id, exercise_name_snapshot, kind, rep_bucket, value,
                        previous_value, value_unit, higher_is_better, local_date, achieved_at`;

/** A client's own record book. Invalidated events are history, not achievements — excluded. */
router.get(
  '/records',
  requireAuth,
  asyncRoute(async (req, res) => {
    const records = await db.all(
      `SELECT ${RECORD_COLUMNS} FROM workout_pr_events
        WHERE client_user_id = ? AND invalidated_at IS NULL
        ORDER BY achieved_at DESC, id DESC LIMIT 200`,
      [req.user.id],
    );
    res.json({ records });
  }),
);

const ProgressQuery = z
  .object({
    exercise_id: z.coerce.number().int().positive(),
    // A year is the longest window worth plotting on a phone and the bound that keeps this a
    // range scan. Unbounded, a client with years of history would serialise thousands of points
    // nobody can read.
    days: z.coerce.number().int().min(7).max(365).default(180),
    // Whose series. Absent = my own; a link id = this coach's client, ownership-checked.
    client: z.coerce.number().int().positive().optional(),
  })
  .strict();

/**
 * One exercise's progress, as a series of daily bests.
 *
 * ONE ROW PER DAY, not per set. A chart needs a trend, and forty sets in one session are one data
 * point about that session, not forty. Aggregating in SQL also means the response is bounded by
 * the window rather than by how much the client trained inside it.
 *
 * Four measures, because this product does not assume everyone lifts: the estimated 1RM and top
 * load for strength work, the longest hold for isometrics, the furthest distance for conditioning.
 * A client whose whole programme is planks and running gets a real chart rather than an empty one.
 *
 * Reads entirely from `workout_log_sets_progress_idx`, which is PARTIAL — voided sets and warm-ups
 * are not in the B-tree at all, so this query cannot include them even by forgetting a term.
 */
router.get(
  '/progress',
  requireAuth,
  asyncRoute(async (req, res) => {
    const qs = ProgressQuery.parse(req.query);

    // The link is what carries the proof, exactly as in `/clients/:id/records`. A subquery that
    // matches nothing yields NULL, `client_user_id = NULL` matches no rows, and an archived link
    // therefore returns an EMPTY SERIES rather than an error — indistinguishable from "this client
    // has not done this movement", which is the point.
    const owner = qs.client
      ? `(SELECT cc.client_id FROM coach_clients cc
           WHERE cc.id = ? AND cc.coach_id = ? AND cc.status = 'active')`
      : '?';
    const ownerParams = qs.client ? [qs.client, req.user.id] : [req.user.id];

    const points = await db.all(
      `SELECT s.local_date AS date,
              MAX(s.e1rm_canonical_kg) AS e1rm_kg,
              MAX(s.effective_load_kg) AS top_load_kg,
              MAX(s.seconds)           AS best_seconds,
              MAX(s.distance_m)        AS best_distance_m,
              SUM(s.volume_kg)         AS volume_kg,
              COUNT(*)                 AS sets
         FROM workout_log_sets s
        WHERE s.client_user_id = ${owner}
          AND s.exercise_id = ?
          AND s.completed_at IS NOT NULL
          AND s.voided_at IS NULL
          AND s.set_kind <> 'warmup'
          AND s.local_date >= date('now', ?)
        GROUP BY s.local_date
        ORDER BY s.local_date ASC`,
      [...ownerParams, qs.exercise_id, `-${qs.days} days`],
    );

    res.json({ exercise_id: qs.exercise_id, days: qs.days, points });
  }),
);

/**
 * A coach reading a client's records.
 *
 * Keyed on the LINK id from the URL, never the client's user id — the link is what carries the
 * proof. A subquery that matches nothing yields NULL, `client_user_id = NULL` matches no rows, and
 * an archived link therefore returns an EMPTY LIST rather than an error. The miss is
 * indistinguishable from "this client has no records", which is the point.
 */
router.get(
  '/clients/:id/records',
  requireAuth,
  asyncRoute(async (req, res) => {
    const linkId = idParam.parse(req.params.id);
    const records = await db.all(
      `SELECT ${RECORD_COLUMNS} FROM workout_pr_events
        WHERE client_user_id = (SELECT client_id FROM coach_clients
                                 WHERE id = ? AND coach_id = ? AND status = 'active')
          AND invalidated_at IS NULL
        ORDER BY achieved_at DESC, id DESC LIMIT 200`,
      [linkId, req.user.id],
    );
    res.json({ records });
  }),
);

export default router;
