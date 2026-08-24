// src/nutrition/routes.js — nutrition plans, food search and food logging (F4).
//
// THE PREDICATES ARE THE ONES FROM src/plans/routes.js, RENAMED FOR THIS TABLE AND NOTHING ELSE.
// The entitlement question is identical — a coach may write a plan they authored while the link is
// still active, a client may read their own — and 015 was built column-for-column after 010 so
// that the answer could be reused rather than re-derived. A second answer to a question already
// answered is this project's one recurring defect.
//
// Two rules carried verbatim from the plans file, both from findings the J4 adversarial review
// made against every candidate design:
//
//   1. THE OWNERSHIP PREDICATE IS ONE `WHERE` CLAUSE. `plan_id` is denormalised onto meals and
//      items exactly so a child can be scoped without walking up its parents in JavaScript.
//      `changes === 0` IS the 404 — there is no preceding SELECT to race against.
//
//   2. AN `INSERT` HAS NO `WHERE`. Every create is `INSERT ... SELECT ... WHERE EXISTS(<ownership>)`
//      rather than `INSERT ... VALUES`. The review found this hole in all three candidates: they
//      wrote the predicate for the update path and assumed it for the insert.
//
// ═══ AND ONE RULE THAT IS NEW HERE ═════════════════════════════════════════════════════════════
//
// **THE CLIENT NEVER SENDS A MACRO.** Not the kcal, not the protein, not the total. A write sends
// a `food_id` and a quantity in grams; the server reads that food's numbers out of its own table
// and copies them into the row's snapshot columns, inside the same statement. Totals are then
// `SUM()` at read time and are never stored at all.
//
// This is owner rule T4.1.10 and it is not a preference. A client that may send macros can send a
// 20 000 kcal breakfast, or a 5 kcal one, and every adherence number a coach reads afterwards is
// whatever the client's proxy decided it should be. The `INSERT ... SELECT ... FROM foods` shape
// below is what makes that unforgeable: there is no code path where a number arrives from outside
// and lands in a snapshot column.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireCoach } from '../auth/middleware.js';
import { normalizeText, toFtsQuery } from '../lib/normalize.js';
import { resolveLang, languages } from '../lib/lang.js';
import { evaluateInBackground } from '../coins/achievements.js';

const router = Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

// Food creation is separately and more tightly limited than plan editing. A hand-typed food is the
// one row in this feature an ordinary user can create without limit, and `foods` is joined by
// search — a million junk rows is a denial of service against everyone's search, not just theirs.
const foodWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/* ── the ownership predicates ────────────────────────────────────────────────────────────────
 *
 * Written once as SQL fragments because they appear in a dozen statements, and a copy that drifts
 * is a hole. Parameter order is documented on each.
 */

/**
 * A plan this coach may write. Params: (planId, coachUserId, coachUserId).
 *
 * The EXISTS is the load-bearing half: `author_user_id` alone would let a coach keep editing the
 * diet of a client they no longer coach, with the same unexpired token.
 */
const COACH_PLAN = `
  id = ? AND author_user_id = ? AND archived_at IS NULL
  AND (coach_client_id IS NULL OR EXISTS (
        SELECT 1 FROM coach_clients cc
         WHERE cc.id = nutrition_plans.coach_client_id AND cc.coach_id = ? AND cc.status = 'active'))`;

/** The same predicate as a subquery, for scoping a child row. Params: (planId, coachId, coachId). */
const COACH_PLAN_SUBQUERY = `
  SELECT p.id FROM nutrition_plans p
   WHERE p.id = ? AND p.author_user_id = ? AND p.archived_at IS NULL
     AND (p.coach_client_id IS NULL OR EXISTS (
           SELECT 1 FROM coach_clients cc
            WHERE cc.id = p.coach_client_id AND cc.coach_id = ? AND cc.status = 'active'))`;

/**
 * What a client may see. Single-table and deliberately WITHOUT a link-status filter: a client keeps
 * their plan after a coach archives them. They own their diet; the coach owned the relationship.
 *
 * `status <> 'draft'` is what lets a coach build a week one meal at a time without the client
 * watching it appear.
 */
const CLIENT_PLAN = `client_user_id = ? AND archived_at IS NULL AND status <> 'draft'`;

/**
 * A food this user may reference. Params: (userId, userId).
 *
 * A FUNCTION AND NOT A CONSTANT, because it has to be spelled against three different table
 * aliases. The first draft was a constant plus `.replaceAll('owner_user_id', 'f.owner_user_id')`
 * at two call sites — string surgery on a security predicate, which is a copy that has not drifted
 * *yet*. `t` is a literal from this file and never anything a request supplies.
 *
 * THREE CLAUSES, AND THE THIRD WAS FOUND BY THE SMOKE RATHER THAN BY DESIGN:
 *
 *   1. `owner_user_id IS NULL` — the shipped database, everyone's.
 *   2. `owner_user_id = ?`     — a row you typed yourself, yours alone.
 *   3. **a food PRESCRIBED to you.** The first version had only the first two, and the smoke
 *      caught what that means in practice: a coach adds "Csirkemell", prescribes 150 g of it, the
 *      client can READ the prescription (the snapshot carries it) and then gets a 404 trying to
 *      log the very food they were told to eat.
 *
 * ═══ AND THIS IS src/exercises/visibility.js, WHICH ALREADY EXISTED ════════════════════════════
 *
 * Its header describes the identical bug, found by the J4 review: *"a coach could prescribe a
 * movement their client could not look up"*. Substitute "food" for "movement" and it is this
 * paragraph. I wrote the second implementation of a solved problem — the Phase 3 lesson about
 * `cues.ts` and `lib/haptics.ts`, repeated inside two phases.
 *
 * And as then, the existing one was BETTER: it carries two conditions my draft lacked.
 *
 *   - `status <> 'draft'` — without it a client can reference a food through a plan they cannot
 *     see, because CLIENT_PLAN hides drafts. Two predicates about one relationship, disagreeing.
 *   - **the link must still be ACTIVE.** Archiving a plan is not the only way a coaching
 *     relationship ends, and archiving the CLIENT does not set `archived_at` on their plans. So
 *     `archived_at IS NULL` alone leaves a departed coach's private food readable forever.
 *
 * The tables differ, so this cannot literally import `VISIBLE` — but the shape is now clause-for-
 * clause the same, and if one changes the other must. The third clause stays deliberately narrow:
 * foods actually used IN a plan assigned to the caller, never "anything my coach owns". Widening
 * it would be the easier fix, which is usually the tell.
 */
const visibleFood = (t = 'foods') => `(
  ${t}.owner_user_id IS NULL
  OR ${t}.owner_user_id = ?
  OR EXISTS (
       SELECT 1
         FROM meal_items mi
         JOIN nutrition_plans np ON np.id = mi.plan_id
         LEFT JOIN coach_clients cc ON cc.id = np.coach_client_id
        WHERE mi.food_id = ${t}.id
          AND np.client_user_id = ?
          AND np.archived_at IS NULL
          AND np.status <> 'draft'
          AND (np.coach_client_id IS NULL OR cc.status = 'active')))`;

/**
 * The name to snapshot, in the WRITER'S language.
 *
 * Found in the browser rather than by reading the code: a Hungarian user logged "Zabpehely" and
 * their own food diary read "Oats, rolled, dry" back at them, because the snapshot was taken from
 * `foods.name` — the canonical English fallback, which exists so a row is always nameable and is
 * not what anybody should be shown.
 *
 * The snapshot's job is to preserve WHAT THIS SAID WHEN IT WAS RECORDED. That is a statement about
 * the person who recorded it, so the language is theirs: their reading language first, the system
 * fallback second, the canonical name last. Same decision as `coach_name_snapshot` and
 * `exercise_name_snapshot` — a snapshot records what the actor saw.
 *
 * It does NOT retranslate later. A coach who prescribed "Csirkemell" and then switches the app to
 * English still sees "Csirkemell" on that prescription, which is correct: they are looking at a
 * record of something they wrote, not at a live food.
 *
 * Params: (lang, fallback), bound immediately before the food id.
 */
const SNAPSHOT_NAME = `COALESCE(
  (SELECT ft.name FROM food_translations ft WHERE ft.food_id = f.id AND ft.lang = ?),
  (SELECT ft.name FROM food_translations ft WHERE ft.food_id = f.id AND ft.lang = ?),
  f.name)`;

/* ── validation ──────────────────────────────────────────────────────────────────────────────── */

const GOALS = ['strength', 'muscle', 'fat-loss', 'endurance', 'mobility', 'health', 'sport'];

const idParam = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) }).strict();

const twoIds = z
  .object({
    id: z.coerce.number().int().positive().max(2_147_483_647),
    childId: z.coerce.number().int().positive().max(2_147_483_647),
  })
  .strict();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Grams arrive as a decimal string or a number and are converted to tenths ONCE, here, with
// Math.round rather than a cast: 12.35 must not become 123 because the float was 12.349999.
const gramsX10 = z.coerce
  .number()
  .finite()
  .min(0.1)
  .max(500_000)
  .transform((g) => Math.round(g * 10));

const planBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).nullish(),
    goal: z.enum(GOALS).nullish(),
    cycle_days: z.number().int().min(1).max(28).optional(),
    starts_on: isoDate.nullish(),
    coach_client_id: z.number().int().positive().max(2_147_483_647).nullish(),
  })
  .strict();

const planPatch = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(2000).nullish(),
    goal: z.enum(GOALS).nullish(),
    cycle_days: z.number().int().min(1).max(28).optional(),
    starts_on: isoDate.nullish(),
    status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  })
  .strict();

const dayBody = z
  .object({
    day_index: z.number().int().min(0).max(27),
    name: z.string().trim().min(1).max(80).nullish(),
    notes: z.string().max(1000).nullish(),
    // Targets in human units; converted to the stored integer scale below, never sent pre-scaled.
    kcal_target: z.coerce.number().finite().min(0).max(15_000).nullish(),
    protein_g_target: z.coerce.number().finite().min(0).max(1000).nullish(),
    carb_g_target: z.coerce.number().finite().min(0).max(2000).nullish(),
    fat_g_target: z.coerce.number().finite().min(0).max(1000).nullish(),
  })
  .strict();

const mealBody = z
  .object({
    day_id: z.number().int().positive().max(2_147_483_647),
    name: z.string().trim().min(1).max(80),
    position: z.number().int().min(0).max(11).optional(),
    time_hint: z
      .string()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
      .nullish(),
    notes: z.string().max(500).nullish(),
  })
  .strict();

const itemBody = z
  .object({
    meal_id: z.number().int().positive().max(2_147_483_647),
    food_id: z.number().int().positive().max(2_147_483_647),
    grams: gramsX10,
    position: z.number().int().min(0).max(59).optional(),
    note: z.string().max(200).nullish(),
  })
  .strict();

const foodBody = z
  .object({
    name: z.string().trim().min(1).max(160),
    brand: z.string().trim().max(80).nullish(),
    kcal_per_100g: z.coerce.number().finite().min(0).max(900),
    protein_g_per_100g: z.coerce.number().finite().min(0).max(100),
    carb_g_per_100g: z.coerce.number().finite().min(0).max(100),
    fat_g_per_100g: z.coerce.number().finite().min(0).max(100),
    fiber_g_per_100g: z.coerce.number().finite().min(0).max(100).nullish(),
    serving_g: z.coerce.number().finite().min(0.1).max(10_000).nullish(),
    serving_label: z.string().trim().max(40).nullish(),
  })
  .strict();

const logBody = z
  .object({
    food_id: z.number().int().positive().max(2_147_483_647),
    grams: gramsX10,
    local_date: isoDate,
    tz_name: z.string().max(64).optional(),
    meal_label: z.string().trim().min(1).max(80).nullish(),
    plan_day_id: z.number().int().positive().max(2_147_483_647).nullish(),
  })
  .strict();

const searchQuery = z
  .object({
    q: z.string().trim().min(1).max(80).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
    // Shape only. WHICH languages are acceptable is decided by `resolveLang` against the enabled
    // set in the database, never by this regex — the same split exercises/routes.js uses.
    lang: z
      .string()
      .regex(/^[a-z]{2}$/)
      .optional(),
  })
  .strict();

const rangeQuery = z
  .object({ from: isoDate, to: isoDate })
  .strict()
  .refine((v) => v.from <= v.to, { message: 'from must not be after to' });

/* ── shared shapes ───────────────────────────────────────────────────────────────────────────── */

/**
 * The macro columns of one row, in human units, computed from the SNAPSHOT and the grams.
 *
 * Written once and interpolated into the four places that need it — but note what is interpolated:
 * a constant defined in this file, never anything derived from a request. This is a template, not
 * dynamic SQL, and every value that varies is still a bound `?`.
 */
const portionMacros = (t) => `
  ${t}.grams_x10 / 10.0                                        AS grams,
  ${t}.kcal_per_100g_x10_snapshot   * ${t}.grams_x10 / 10000.0 AS kcal,
  ${t}.protein_mg_per_100g_snapshot * ${t}.grams_x10 / 1000000.0 AS protein_g,
  ${t}.carb_mg_per_100g_snapshot    * ${t}.grams_x10 / 1000000.0 AS carb_g,
  ${t}.fat_mg_per_100g_snapshot     * ${t}.grams_x10 / 1000000.0 AS fat_g,
  ${t}.fiber_mg_per_100g_snapshot   * ${t}.grams_x10 / 1000000.0 AS fiber_g`;

/* ═══ FOODS ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * Food search. FTS5 when there is a query, plain prefix order when there is not.
 *
 * `verified DESC` first: a curated row outranks a guess someone typed, which is the entire reason
 * the flag exists. The cursor is the id, not an offset — an offset over a table users insert into
 * skips rows as it pages.
 */
router.get(
  '/foods',
  requireAuth,
  asyncRoute(async (req, res) => {
    const parsed = searchQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { q, limit = 25, cursor } = parsed.data;

    // Language resolution happens once per request. Both are codes from the enabled set, never raw
    // client input, so they are safe as bound parameters.
    const lang = await resolveLang(req);
    const { fallback } = await languages();

    // `toFtsQuery` rather than a hand-rolled `"${q}"*`. FTS5 has its own query syntax — quotes,
    // NEAR, column filters — and passing raw input into MATCH is the FTS equivalent of
    // string-concatenating SQL. The first draft here escaped one quote character inline, which is
    // the FOURTH time in this feature I wrote a second implementation of something lib/ already
    // had. It also tokenises, so "csirke mell" matches, which the inline version did not.
    const fts = q ? toFtsQuery(q) : null;

    // Search runs against the TRANSLATIONS index so a Hungarian query matches Hungarian text, with
    // the requested language AND the fallback searched — someone browsing in Hungarian who types
    // an English food name should still find it. Copied from exercises/routes.js, which is where
    // this problem was solved.
    //
    // The index knows nothing about ownership. `visibleFood` still applies to the BASE row and
    // must never be the only thing between a user and someone else's private list.
    const rows = fts
      ? await db.all(
          `SELECT DISTINCT f.id, COALESCE(t.name, tf.name, f.name) AS name,
                  f.brand, f.source, f.verified,
                  f.kcal_per_100g_x10 / 10.0     AS kcal_per_100g,
                  f.protein_mg_per_100g / 1000.0 AS protein_g_per_100g,
                  f.carb_mg_per_100g / 1000.0    AS carb_g_per_100g,
                  f.fat_mg_per_100g / 1000.0     AS fat_g_per_100g,
                  f.fiber_mg_per_100g / 1000.0   AS fiber_g_per_100g,
                  f.serving_g_x10 / 10.0         AS serving_g, f.serving_label
             FROM foods f
             LEFT JOIN food_translations t  ON t.food_id  = f.id AND t.lang  = ?
             LEFT JOIN food_translations tf ON tf.food_id = f.id AND tf.lang = ?
            WHERE ${visibleFood('f')}
              AND (
                -- a translated match, in the reader's language or the fallback...
                EXISTS (SELECT 1 FROM food_translations st
                          JOIN food_translations_fts ftx ON ftx.rowid = st.id
                         WHERE st.food_id = f.id AND st.lang IN (?, ?)
                           AND food_translations_fts MATCH ?)
                -- ...or a match on the canonical row, which is what finds a hand-typed food.
                -- A personal food has no translations, so without this arm a user could not find
                -- what they themselves typed in — the exact gap the translation join introduces.
                OR EXISTS (SELECT 1 FROM foods_fts
                            WHERE foods_fts.rowid = f.id AND foods_fts MATCH ?)
              )
            ORDER BY f.verified DESC, name, f.id
            LIMIT ?`,
          [lang, fallback, req.user.id, req.user.id, lang, fallback, fts, fts, limit],
        )
      : await db.all(
          `SELECT f.id, COALESCE(t.name, tf.name, f.name) AS name,
                  f.brand, f.source, f.verified,
                  f.kcal_per_100g_x10 / 10.0     AS kcal_per_100g,
                  f.protein_mg_per_100g / 1000.0 AS protein_g_per_100g,
                  f.carb_mg_per_100g / 1000.0    AS carb_g_per_100g,
                  f.fat_mg_per_100g / 1000.0     AS fat_g_per_100g,
                  f.fiber_mg_per_100g / 1000.0   AS fiber_g_per_100g,
                  f.serving_g_x10 / 10.0         AS serving_g, f.serving_label
             FROM foods f
             LEFT JOIN food_translations t  ON t.food_id  = f.id AND t.lang  = ?
             LEFT JOIN food_translations tf ON tf.food_id = f.id AND tf.lang = ?
            WHERE ${visibleFood('f')} AND f.id > ?
            ORDER BY f.verified DESC, f.id
            LIMIT ?`,
          [lang, fallback, req.user.id, req.user.id, cursor ?? 0, limit],
        );

    res.json({ foods: rows, next_cursor: rows.length === limit ? rows.at(-1).id : null });
  }),
);

/**
 * Create a personal food.
 *
 * `source` and `owner_user_id` are set by the server and are not in the schema the body is parsed
 * against — a `.strict()` object rejects them outright rather than ignoring them, so a request
 * trying to mint a `verified` USDA row gets a 400 and not a silent downgrade.
 */
router.post(
  '/foods',
  requireAuth,
  foodWriteLimiter,
  asyncRoute(async (req, res) => {
    const parsed = foodBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;

    const r = await db.run(
      `INSERT INTO foods (source, owner_user_id, name, normalized_name, brand,
                          kcal_per_100g_x10, protein_mg_per_100g, carb_mg_per_100g,
                          fat_mg_per_100g, fiber_mg_per_100g, serving_g_x10, serving_label,
                          verified)
            VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        req.user.id,
        b.name,
        normalizeText(b.name),
        b.brand ?? null,
        Math.round(b.kcal_per_100g * 10),
        Math.round(b.protein_g_per_100g * 1000),
        Math.round(b.carb_g_per_100g * 1000),
        Math.round(b.fat_g_per_100g * 1000),
        b.fiber_g_per_100g == null ? null : Math.round(b.fiber_g_per_100g * 1000),
        b.serving_g == null ? null : Math.round(b.serving_g * 10),
        b.serving_label ?? null,
      ],
    );
    res.status(201).json({ id: r.lastInsertRowid });
  }),
);

/** Delete a personal food. Scoped by owner, so a global row is a 404 rather than a 403. */
router.delete(
  '/foods/:id',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.run(`DELETE FROM foods WHERE id = ? AND owner_user_id = ?`, [
      p.data.id,
      req.user.id,
    ]);
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

/* ═══ PLANS ═══════════════════════════════════════════════════════════════════════════════════ */

router.get(
  '/nutrition-plans',
  requireAuth,
  requireCoach,
  asyncRoute(async (req, res) => {
    const plans = await db.all(
      `SELECT p.id, p.scope, p.name, p.description, p.goal, p.cycle_days, p.starts_on,
              p.status, p.revision, p.coach_client_id, p.client_user_id, u.email AS client_email,
              u.display_name AS client_display_name
         FROM nutrition_plans p
         LEFT JOIN users u ON u.id = p.client_user_id
        WHERE p.author_user_id = ? AND p.archived_at IS NULL
          AND (p.coach_client_id IS NULL OR EXISTS (
                SELECT 1 FROM coach_clients cc
                 WHERE cc.id = p.coach_client_id AND cc.coach_id = ? AND cc.status = 'active'))
        ORDER BY p.scope, p.name`,
      [req.user.id, req.user.id],
    );
    res.json({ plans });
  }),
);

/**
 * Create a plan. A template if `coach_client_id` is absent, a client instance if it is present.
 *
 * The INSERT has no WHERE, so the link is proved inside the SELECT: `WHERE EXISTS(<active link
 * owned by this coach>)`. A forged link id inserts zero rows and the route reports 404, with no
 * preceding lookup for a concurrent archive to slip past.
 */
router.post(
  '/nutrition-plans',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const parsed = planBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;

    if (b.coach_client_id == null) {
      const r = await db.run(
        `INSERT INTO nutrition_plans (scope, author_user_id, name, normalized_name, description,
                                      goal, cycle_days, starts_on)
              VALUES ('template', ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          b.name,
          normalizeText(b.name),
          b.description ?? null,
          b.goal ?? null,
          b.cycle_days ?? 7,
          b.starts_on ?? null,
        ],
      );
      return res.status(201).json({ id: r.lastInsertRowid });
    }

    const r = await db.run(
      `INSERT INTO nutrition_plans (scope, author_user_id, coach_client_id, client_user_id,
                                    name, normalized_name, description, goal, cycle_days, starts_on)
       SELECT 'client', ?, cc.id, cc.client_id, ?, ?, ?, ?, ?, ?
         FROM coach_clients cc
        WHERE cc.id = ? AND cc.coach_id = ? AND cc.status = 'active'`,
      [
        req.user.id,
        b.name,
        normalizeText(b.name),
        b.description ?? null,
        b.goal ?? null,
        b.cycle_days ?? 7,
        b.starts_on ?? null,
        b.coach_client_id,
        req.user.id,
      ],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(201).json({ id: r.lastInsertRowid });
  }),
);

/**
 * One plan with its whole tree, for the editor.
 *
 * Four queries rather than one join, because a join across days × meals × items multiplies every
 * day row by its item count and the assembly then has to undo that. Four indexed reads inside one
 * request is cheaper and the result needs no de-duplication.
 */
router.get(
  '/nutrition-plans/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);

    // A coach reads their own authored plan; a client reads the one assigned to them. Two
    // predicates, one route, and the row a stranger asks for is simply not in either.
    const [plan] = await db.all(
      `SELECT id, scope, name, description, goal, cycle_days, starts_on, status, revision,
              coach_client_id, client_user_id, author_user_id
         FROM nutrition_plans
        WHERE (${COACH_PLAN}) OR (id = ? AND ${CLIENT_PLAN})`,
      [p.data.id, req.user.id, req.user.id, p.data.id, req.user.id],
    );
    if (!plan) return sendError(res, 404, ERR.NOT_FOUND);

    const days = await db.all(
      `SELECT id, day_index, name, notes,
              kcal_target_x10 / 10.0     AS kcal_target,
              protein_mg_target / 1000.0 AS protein_g_target,
              carb_mg_target / 1000.0    AS carb_g_target,
              fat_mg_target / 1000.0     AS fat_g_target
         FROM nutrition_plan_days WHERE plan_id = ? ORDER BY day_index`,
      [plan.id],
    );
    const meals = await db.all(
      `SELECT id, day_id, position, name, time_hint, notes
         FROM meals WHERE plan_id = ? ORDER BY day_id, position, id`,
      [plan.id],
    );
    const items = await db.all(
      `SELECT i.id, i.meal_id, i.position, i.food_id, i.note,
              i.food_name_snapshot AS name,
              ${portionMacros('i')}
         FROM meal_items i WHERE i.plan_id = ? ORDER BY i.meal_id, i.position, i.id`,
      [plan.id],
    );

    res.json({ plan, days, meals, items });
  }),
);

router.patch(
  '/nutrition-plans/:id',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = planPatch.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;
    if (Object.keys(b).length === 0) return sendError(res, 400, ERR.VALIDATION);

    // COALESCE(?, col) per field: one statement, no column list assembled from request keys, and
    // therefore nothing a request can add to the SET clause.
    const r = await db.run(
      `UPDATE nutrition_plans
          SET name            = COALESCE(?, name),
              normalized_name = COALESCE(?, normalized_name),
              description     = CASE WHEN ? THEN ? ELSE description END,
              goal            = CASE WHEN ? THEN ? ELSE goal END,
              cycle_days      = COALESCE(?, cycle_days),
              starts_on       = CASE WHEN ? THEN ? ELSE starts_on END,
              status          = COALESCE(?, status),
              revision        = revision + 1
        WHERE ${COACH_PLAN}`,
      [
        b.name ?? null,
        b.name ? normalizeText(b.name) : null,
        'description' in b ? 1 : 0,
        b.description ?? null,
        'goal' in b ? 1 : 0,
        b.goal ?? null,
        b.cycle_days ?? null,
        'starts_on' in b ? 1 : 0,
        b.starts_on ?? null,
        b.status ?? null,
        p.data.id,
        req.user.id,
        req.user.id,
      ],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

/** Archive rather than delete: a client's plan history is not the coach's to erase. */
router.delete(
  '/nutrition-plans/:id',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.run(
      `UPDATE nutrition_plans SET archived_at = unixepoch() WHERE ${COACH_PLAN}`,
      [p.data.id, req.user.id, req.user.id],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

/* ═══ DAYS ════════════════════════════════════════════════════════════════════════════════════ */

router.post(
  '/nutrition-plans/:id/days',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = dayBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;

    const r = await db.run(
      `INSERT INTO nutrition_plan_days (plan_id, day_index, name, notes, kcal_target_x10,
                                        protein_mg_target, carb_mg_target, fat_mg_target)
       SELECT id, ?, ?, ?, ?, ?, ?, ? FROM (${COACH_PLAN_SUBQUERY})`,
      [
        b.day_index,
        b.name ?? null,
        b.notes ?? null,
        b.kcal_target == null ? null : Math.round(b.kcal_target * 10),
        b.protein_g_target == null ? null : Math.round(b.protein_g_target * 1000),
        b.carb_g_target == null ? null : Math.round(b.carb_g_target * 1000),
        b.fat_g_target == null ? null : Math.round(b.fat_g_target * 1000),
        p.data.id,
        req.user.id,
        req.user.id,
      ],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(201).json({ id: r.lastInsertRowid });
  }),
);

router.patch(
  '/nutrition-plans/:id/days/:childId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = twoIds.safeParse(req.params);
    const parsed = dayBody.partial().strict().safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;
    if (Object.keys(b).length === 0) return sendError(res, 400, ERR.VALIDATION);

    const r = await db.run(
      `UPDATE nutrition_plan_days
          SET day_index         = COALESCE(?, day_index),
              name              = CASE WHEN ? THEN ? ELSE name END,
              notes             = CASE WHEN ? THEN ? ELSE notes END,
              kcal_target_x10   = CASE WHEN ? THEN ? ELSE kcal_target_x10 END,
              protein_mg_target = CASE WHEN ? THEN ? ELSE protein_mg_target END,
              carb_mg_target    = CASE WHEN ? THEN ? ELSE carb_mg_target END,
              fat_mg_target     = CASE WHEN ? THEN ? ELSE fat_mg_target END
        WHERE id = ? AND plan_id IN (${COACH_PLAN_SUBQUERY})`,
      [
        b.day_index ?? null,
        'name' in b ? 1 : 0,
        b.name ?? null,
        'notes' in b ? 1 : 0,
        b.notes ?? null,
        'kcal_target' in b ? 1 : 0,
        b.kcal_target == null ? null : Math.round(b.kcal_target * 10),
        'protein_g_target' in b ? 1 : 0,
        b.protein_g_target == null ? null : Math.round(b.protein_g_target * 1000),
        'carb_g_target' in b ? 1 : 0,
        b.carb_g_target == null ? null : Math.round(b.carb_g_target * 1000),
        'fat_g_target' in b ? 1 : 0,
        b.fat_g_target == null ? null : Math.round(b.fat_g_target * 1000),
        p.data.childId,
        p.data.id,
        req.user.id,
        req.user.id,
      ],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

router.delete(
  '/nutrition-plans/:id/days/:childId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = twoIds.safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.run(
      `DELETE FROM nutrition_plan_days WHERE id = ? AND plan_id IN (${COACH_PLAN_SUBQUERY})`,
      [p.data.childId, p.data.id, req.user.id, req.user.id],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

/* ═══ MEALS ═══════════════════════════════════════════════════════════════════════════════════ */

router.post(
  '/nutrition-plans/:id/meals',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = mealBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;

    // The day is scoped to the plan INSIDE the SELECT, not checked before it. `d.plan_id = p.id`
    // is what stops a coach attaching a meal to a day belonging to someone else's plan while
    // naming their own plan in the URL.
    const r = await db.run(
      `INSERT INTO meals (plan_id, day_id, position, name, time_hint, notes)
       SELECT p.id, d.id,
              COALESCE(?, (SELECT COUNT(*) FROM meals WHERE day_id = d.id)),
              ?, ?, ?
         FROM (${COACH_PLAN_SUBQUERY}) p
         JOIN nutrition_plan_days d ON d.id = ? AND d.plan_id = p.id`,
      [
        b.position ?? null,
        b.name,
        b.time_hint ?? null,
        b.notes ?? null,
        p.data.id,
        req.user.id,
        req.user.id,
        b.day_id,
      ],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(201).json({ id: r.lastInsertRowid });
  }),
);

router.patch(
  '/nutrition-plans/:id/meals/:childId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = twoIds.safeParse(req.params);
    const parsed = mealBody.partial().strict().omit({ day_id: true }).safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;
    if (Object.keys(b).length === 0) return sendError(res, 400, ERR.VALIDATION);

    const r = await db.run(
      `UPDATE meals
          SET name      = COALESCE(?, name),
              position  = COALESCE(?, position),
              time_hint = CASE WHEN ? THEN ? ELSE time_hint END,
              notes     = CASE WHEN ? THEN ? ELSE notes END
        WHERE id = ? AND plan_id IN (${COACH_PLAN_SUBQUERY})`,
      [
        b.name ?? null,
        b.position ?? null,
        'time_hint' in b ? 1 : 0,
        b.time_hint ?? null,
        'notes' in b ? 1 : 0,
        b.notes ?? null,
        p.data.childId,
        p.data.id,
        req.user.id,
        req.user.id,
      ],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

router.delete(
  '/nutrition-plans/:id/meals/:childId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = twoIds.safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.run(
      `DELETE FROM meals WHERE id = ? AND plan_id IN (${COACH_PLAN_SUBQUERY})`,
      [p.data.childId, p.data.id, req.user.id, req.user.id],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

/* ═══ MEAL ITEMS ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Prescribe a food into a meal.
 *
 * THE STATEMENT IS THE SECURITY BOUNDARY, and it is worth reading closely. Three joins, each doing
 * one job, and the macros come from `f.*` — the server's own row — rather than from anything the
 * request sent:
 *
 *   `FROM (COACH_PLAN_SUBQUERY) p`  the coach may write this plan, and the link is still active
 *   `JOIN meals m ON ... m.plan_id = p.id`   the meal belongs to THAT plan
 *   `JOIN foods f ON ... visibleFood('f')`   global, the coach's own, or already prescribed
 *
 * Any one of the three failing produces zero rows and one 404. There is no branch where a
 * client-supplied kcal figure reaches a snapshot column, because no such value is bound anywhere
 * in this statement — grams is the only number that crosses the boundary.
 */
router.post(
  '/nutrition-plans/:id/items',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = itemBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;

    const lang = await resolveLang(req);
    const { fallback } = await languages();

    const r = await db.run(
      `INSERT INTO meal_items (plan_id, meal_id, food_id, position, grams_x10, note,
                               food_name_snapshot, kcal_per_100g_x10_snapshot,
                               protein_mg_per_100g_snapshot, carb_mg_per_100g_snapshot,
                               fat_mg_per_100g_snapshot, fiber_mg_per_100g_snapshot)
       SELECT p.id, m.id, f.id,
              COALESCE(?, (SELECT COUNT(*) FROM meal_items WHERE meal_id = m.id)),
              ?, ?,
              ${SNAPSHOT_NAME}, f.kcal_per_100g_x10, f.protein_mg_per_100g,
              f.carb_mg_per_100g, f.fat_mg_per_100g, f.fiber_mg_per_100g
         FROM (${COACH_PLAN_SUBQUERY}) p
         JOIN meals m ON m.id = ? AND m.plan_id = p.id
         JOIN foods f ON f.id = ? AND ${visibleFood('f')}`,
      [
        b.position ?? null,
        b.grams,
        b.note ?? null,
        lang,
        fallback,
        p.data.id,
        req.user.id,
        req.user.id,
        b.meal_id,
        b.food_id,
        req.user.id,
        req.user.id,
      ],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(201).json({ id: r.lastInsertRowid });
  }),
);

/**
 * Change a portion.
 *
 * Grams only. The snapshot is deliberately NOT refreshed: it recorded what the coach saw when they
 * prescribed it, and re-reading `foods` here would let a food edit rewrite the prescription
 * through the back door the INSERT closed. Swapping the food is a delete and a create.
 */
router.patch(
  '/nutrition-plans/:id/items/:childId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = twoIds.safeParse(req.params);
    const parsed = z
      .object({
        grams: gramsX10.optional(),
        position: z.number().int().min(0).max(59).optional(),
        note: z.string().max(200).nullish(),
      })
      .strict()
      .safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;
    if (Object.keys(b).length === 0) return sendError(res, 400, ERR.VALIDATION);

    const r = await db.run(
      `UPDATE meal_items
          SET grams_x10 = COALESCE(?, grams_x10),
              position  = COALESCE(?, position),
              note      = CASE WHEN ? THEN ? ELSE note END
        WHERE id = ? AND plan_id IN (${COACH_PLAN_SUBQUERY})`,
      [
        b.grams ?? null,
        b.position ?? null,
        'note' in b ? 1 : 0,
        b.note ?? null,
        p.data.childId,
        p.data.id,
        req.user.id,
        req.user.id,
      ],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

router.delete(
  '/nutrition-plans/:id/items/:childId',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = twoIds.safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.run(
      `DELETE FROM meal_items WHERE id = ? AND plan_id IN (${COACH_PLAN_SUBQUERY})`,
      [p.data.childId, p.data.id, req.user.id, req.user.id],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

/* ═══ THE CLIENT'S OWN FOOD LOG ═══════════════════════════════════════════════════════════════ */

/**
 * Log what was eaten.
 *
 * Same shape as prescribing, same reason: the macros come from `foods`, inside the statement. The
 * only difference is who owns the row — `client_user_id` is `req.user.id` and is not in the body
 * schema at all, so there is no id to forge and no ownership check to get wrong.
 *
 * `plan_day_id` IS client-supplied and therefore scoped: the subquery admits it only if that day
 * belongs to a plan assigned to this same user. Without that a client could tag their breakfast
 * against a stranger's plan day, and the adherence read would compare two unrelated people.
 */
router.post(
  '/nutrition-log',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const parsed = logBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;

    const lang = await resolveLang(req);
    const { fallback } = await languages();

    const r = await db.run(
      `INSERT INTO nutrition_log_items (client_user_id, local_date, tz_name, meal_label,
                                        plan_day_id, food_id, grams_x10, food_name_snapshot,
                                        kcal_per_100g_x10_snapshot, protein_mg_per_100g_snapshot,
                                        carb_mg_per_100g_snapshot, fat_mg_per_100g_snapshot,
                                        fiber_mg_per_100g_snapshot)
       SELECT ?, ?, ?, ?,
              (SELECT d.id FROM nutrition_plan_days d
                 JOIN nutrition_plans np ON np.id = d.plan_id
                WHERE d.id = ? AND np.client_user_id = ?),
              f.id, ?, ${SNAPSHOT_NAME}, f.kcal_per_100g_x10, f.protein_mg_per_100g,
              f.carb_mg_per_100g, f.fat_mg_per_100g, f.fiber_mg_per_100g
         FROM foods f
        WHERE f.id = ? AND ${visibleFood('f')}`,
      [
        req.user.id,
        b.local_date,
        b.tz_name ?? null,
        b.meal_label ?? null,
        b.plan_day_id ?? null,
        req.user.id,
        b.grams,
        lang,
        fallback,
        b.food_id,
        req.user.id,
        req.user.id,
      ],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);

    // Same shape as the workout finish: after the write, never blocking it, and idempotent because
    // "have they logged seven consecutive days?" is a question about the log rather than about
    // this request.
    evaluateInBackground(req, {
      userId: req.user.id,
      sourceType: 'nutrition_log_item',
      sourceId: Number(r.lastInsertRowid),
    });

    res.status(201).json({ id: r.lastInsertRowid });
  }),
);

router.delete(
  '/nutrition-log/:id',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.run(
      `DELETE FROM nutrition_log_items WHERE id = ? AND client_user_id = ?`,
      [p.data.id, req.user.id],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

/**
 * One day: what was eaten, and what was prescribed for that date.
 *
 * ADHERENCE IS A COMPARISON MADE AT READ TIME, never a stored figure and never a percentage the
 * server invents. This returns two objects — `totals` and `targets` — and the UI puts them next to
 * each other. The same reasoning as the coach roster's session count: a ratio needs a denominator
 * everyone agrees on, and "did they hit their protein" is a question a coach answers, not a number.
 *
 * The target comes from the SCHEDULE RULE (src/plans/schedule.js), which is why `day_index` is
 * computed here from starts_on and cycle_days rather than read off the log rows: a log row's
 * `plan_day_id` records what the client tagged, and an untagged day still has a target.
 */
router.get(
  '/nutrition-log/:date',
  requireAuth,
  asyncRoute(async (req, res) => {
    const p = z.object({ date: isoDate }).strict().safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);
    const date = p.data.date;

    const items = await db.all(
      `SELECT i.id, i.meal_label, i.food_id, i.plan_day_id,
              i.food_name_snapshot AS name,
              ${portionMacros('i')}
         FROM nutrition_log_items i
        WHERE i.client_user_id = ? AND i.local_date = ?
        ORDER BY i.id`,
      [req.user.id, date],
    );

    // Totals are SUM() over the rows just read — computed here rather than in a second query so
    // there is exactly one set of numbers and no chance of the list and the total disagreeing.
    const totals = items.reduce(
      (t, r) => ({
        kcal: t.kcal + r.kcal,
        protein_g: t.protein_g + r.protein_g,
        carb_g: t.carb_g + r.carb_g,
        fat_g: t.fat_g + r.fat_g,
        fiber_g: t.fiber_g + (r.fiber_g ?? 0),
      }),
      { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0, fiber_g: 0 },
    );

    // The active plan's target for this calendar date. `julianday` differences give whole days
    // regardless of DST, which is the same arithmetic src/plans/schedule.js performs — this query
    // is its SQL shadow and the two are asserted equal in the probe.
    const [targets] = await db.all(
      `SELECT d.id AS plan_day_id, d.name AS day_name,
              d.kcal_target_x10 / 10.0     AS kcal_target,
              d.protein_mg_target / 1000.0 AS protein_g_target,
              d.carb_mg_target / 1000.0    AS carb_g_target,
              d.fat_mg_target / 1000.0     AS fat_g_target
         FROM nutrition_plans p
         JOIN nutrition_plan_days d
           ON d.plan_id = p.id
          AND d.day_index = CAST((julianday(?) - julianday(p.starts_on)) AS INTEGER) % p.cycle_days
        WHERE p.client_user_id = ? AND p.status = 'active' AND p.archived_at IS NULL
          AND p.starts_on IS NOT NULL AND p.starts_on <= ?
        ORDER BY p.id DESC LIMIT 1`,
      [date, req.user.id, date],
    );

    res.json({ date, items, totals, targets: targets ?? null });
  }),
);

/**
 * A range, for the trend chart. Totals per day, and nothing else — the item list for 30 days is
 * megabytes and a chart does not read it.
 */
router.get(
  '/nutrition-log',
  requireAuth,
  asyncRoute(async (req, res) => {
    const parsed = rangeQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { from, to } = parsed.data;

    // A 366-day ceiling on the window, because the cost of this query is the row count and the
    // request that asks for the year 1000 to 3000 must be refused rather than served slowly.
    const days = await db.all(
      `SELECT local_date AS date, COUNT(*) AS entries,
              SUM(kcal_per_100g_x10_snapshot   * grams_x10) / 10000.0   AS kcal,
              SUM(protein_mg_per_100g_snapshot * grams_x10) / 1000000.0 AS protein_g,
              SUM(carb_mg_per_100g_snapshot    * grams_x10) / 1000000.0 AS carb_g,
              SUM(fat_mg_per_100g_snapshot     * grams_x10) / 1000000.0 AS fat_g
         FROM nutrition_log_items
        WHERE client_user_id = ? AND local_date >= ? AND local_date <= ?
          AND julianday(?) - julianday(?) <= 366
        GROUP BY local_date
        ORDER BY local_date`,
      [req.user.id, from, to, to, from],
    );
    res.json({ from, to, days });
  }),
);

export default router;
