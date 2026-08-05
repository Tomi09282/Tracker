// src/exercises/routes.js — the exercise library (F1).
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { normalizeText, toFtsQuery } from '../lib/normalize.js';
import { encodeCursor, decodeCursor, clampLimit } from '../lib/cursor.js';
import { taxonomyList, labelJoin } from '../lib/taxonomy.js';
import { resolveLang, languages } from '../lib/lang.js';
import { VISIBLE, visibleParams } from './visibility.js';

const router = Router();

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' });

/**
 * The name the request's language actually resolves to, folded for sorting.
 *
 * Written once because it has to appear in THREE places that must agree: the projection, the
 * ORDER BY, and the keyset cursor predicate. They did not agree — the list returned the resolved
 * name but sorted and paginated on the canonical English one, so an alphabetical list in Hungarian
 * was alphabetised by names the reader could not see. "Fekvenyomás" sat under B, because the row
 * behind it is "Bench Press".
 *
 * It is repeated as an expression rather than referenced as an alias because SQLite cannot use a
 * SELECT alias in WHERE, and the cursor comparison lives in WHERE.
 */
const RESOLVED_NAME = 'COALESCE(t.normalized_name, tf.normalized_name, e.normalized_name)';

/** Sort keys are a closed set. A column name from a query string is never put into SQL. */
const SORTS = {
  name: `${RESOLVED_NAME} ASC, e.id ASC`,
  newest: 'e.created_at DESC, e.id DESC',
};

const ListQuery = z
  .object({
    q: z.string().trim().max(120).optional(),
    muscle: z.string().trim().max(40).optional(),
    equipment: z.string().trim().max(40).optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    type: z.enum(['strength', 'stretching', 'cardio', 'mobility', 'plyometrics']).optional(),
    mine: z.enum(['1']).optional(),
    sort: z.enum(['name', 'newest']).default('name'),
    limit: z.string().optional(),
    cursor: z.string().max(512).optional(),
    // Shape only. WHICH languages are acceptable is decided by `resolveLang` against the
    // enabled set, so an unknown-but-well-formed code falls back rather than 400s — a stale
    // bookmark should not be an error page.
    lang: z.string().regex(/^[a-z]{2}$/).optional(),
    // A coach_clients link id. Annotates the page with what this client can actually DO.
    for_client: z.coerce.number().int().positive().optional(),
  })
  .strict();

/**
 * Annotate a page of exercises against one client's onboarding answers.
 *
 * FLAGS, NEVER A SILENT FILTER. The schema's own comment says `severity='avoid'` "removes
 * exercises outright", and for an automated plan builder that is right — but this is a coach
 * choosing by hand, and hiding options from a professional is worse than showing them a
 * constraint. A coach who knows the client's knee is fine this week must not have to guess why an
 * exercise vanished. The client-side picker offers the filter; the server reports the facts.
 *
 * Two facts per exercise:
 *   - `missing_equipment` — kit the movement needs that the client did not tick. Not a
 *     prohibition: a coach may know the gym has it and the questionnaire is stale.
 *   - `conflicts` — body areas the client flagged, that this movement's muscles belong to.
 *     `relation` matters: a movement that LOADS the area is a different warning from one that
 *     merely STABILISES with it, and collapsing them would make every squat look like a knee risk.
 *
 * Run as ONE query over the page's ids rather than joined into the main statement: the list query
 * already carries FTS, a language fallback chain, a GROUP BY and a keyset cursor, and adding two
 * more one-to-many joins to that is how a cursor silently starts skipping rows.
 */
async function annotateForClient(rows, linkId, coachId) {
  if (!rows.length) return null;

  // Ownership first, and it is the ONLY thing that decides whether this data is readable. A link
  // id is guessable, so the predicate is what stops a stranger reading a client's injuries.
  const link = await db.get(
    `SELECT cc.client_id FROM coach_clients cc
      WHERE cc.id = ? AND cc.coach_id = ? AND cc.status = 'active'`,
    [linkId, coachId],
  );
  if (!link) return { forbidden: true };

  const ids = rows.map((r) => r.id);
  const holes = ids.map(() => '?').join(',');

  const [missing, conflicts] = await Promise.all([
    db.all(
      `SELECT x.exercise_id, q.slug, q.id AS equipment_id
         FROM exercise_equipment_map x
         JOIN equipment q ON q.id = x.equipment_id
        WHERE x.exercise_id IN (${holes})
          AND NOT EXISTS (SELECT 1 FROM onboarding_equipment oe
                           WHERE oe.user_id = ? AND oe.equipment_id = x.equipment_id)`,
      [...ids, link.client_id],
    ),
    db.all(
      `SELECT DISTINCT m.exercise_id, l.body_area, l.severity, bam.relation
         FROM exercise_muscle_map m
         JOIN body_area_muscle_map bam ON bam.muscle_group_id = m.muscle_group_id
         JOIN onboarding_limitations l ON l.body_area = bam.body_area AND l.user_id = ?
        WHERE m.exercise_id IN (${holes})
          -- 'past' is history the coach should know from the profile panel, not a warning on
          -- every exercise that happens to touch the area. Flagging it would train them to
          -- ignore the flag.
          AND l.severity IN ('avoid', 'caution')`,
      [link.client_id, ...ids],
    ),
  ]);

  const byId = new Map(ids.map((id) => [id, { missing_equipment: [], conflicts: [] }]));
  for (const r of missing) byId.get(r.exercise_id)?.missing_equipment.push(r.slug);
  for (const r of conflicts) {
    byId.get(r.exercise_id)?.conflicts.push({ body_area: r.body_area, severity: r.severity, relation: r.relation });
  }
  return { byId };
}

router.get(
  '/exercises',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const qs = ListQuery.parse(req.query);
    const limit = clampLimit(qs.limit);
    const userId = req.user.id;

    const where = [VISIBLE];
    const params = visibleParams(userId);

    if (qs.mine === '1') {
      where.push('e.owner_id = ?');
      params.push(userId);
    }
    if (qs.difficulty) {
      where.push('e.difficulty = ?');
      params.push(qs.difficulty);
    }
    if (qs.type) {
      where.push('e.exercise_type = ?');
      params.push(qs.type);
    }
    if (qs.muscle) {
      where.push(
        'EXISTS (SELECT 1 FROM exercise_muscle_map m JOIN muscle_groups g ON g.id = m.muscle_group_id WHERE m.exercise_id = e.id AND g.slug = ?)',
      );
      params.push(qs.muscle);
    }
    if (qs.equipment) {
      where.push(
        'EXISTS (SELECT 1 FROM exercise_equipment_map x JOIN equipment q ON q.id = x.equipment_id WHERE x.exercise_id = e.id AND q.slug = ?)',
      );
      params.push(qs.equipment);
    }

    // Language resolution happens once per request. `lang` and `fallback` are always codes from
    // the enabled set, never raw client input, so they are safe as bound parameters.
    const lang = await resolveLang(req);
    const { fallback } = await languages();

    // Full-text search runs against the TRANSLATIONS index, so a Hungarian query matches
    // Hungarian text. Both the requested language and the fallback are searched — a user typing
    // an English exercise name should still find it while browsing in Hungarian.
    //
    // The index knows nothing about ownership: the visibility predicate above still applies to
    // the BASE row, and must never be the only thing between a user and someone else's library.
    let searchJoin = '';
    const searchParams = [];
    const fts = qs.q ? toFtsQuery(qs.q) : null;
    if (fts) {
      searchJoin = `JOIN exercise_translations st ON st.exercise_id = e.id AND st.lang IN (?, ?)
                    JOIN exercise_translations_fts f ON f.rowid = st.rowid`;
      searchParams.push(lang, fallback);
      where.push('exercise_translations_fts MATCH ?');
      params.push(fts);
    }

    const langJoin = `LEFT JOIN exercise_translations t  ON t.exercise_id  = e.id AND t.lang  = ?
                      LEFT JOIN exercise_translations tf ON tf.exercise_id = e.id AND tf.lang = ?`;
    const langParams = [lang, fallback];

    // Keyset pagination. The cursor carries the sort key of the last row seen, so the page after
    // it is a plain comparison rather than an OFFSET that shifts when rows are inserted.
    const cursor = qs.cursor ? decodeCursor(qs.cursor) : null;
    if (cursor && cursor.length === 2) {
      if (qs.sort === 'name') {
        // Must be the SAME expression the ORDER BY uses. A cursor compared against a different
        // key than the one the rows are ordered by silently skips and repeats rows.
        where.push(`(${RESOLVED_NAME}, e.id) > (?, ?)`);
      } else {
        where.push('(e.created_at, e.id) < (?, ?)');
      }
      params.push(cursor[0], cursor[1]);
    }

    // Ranked by FTS relevance when searching, otherwise by the requested sort. `SORTS` is a
    // constant lookup — the query string can only select a key, never supply SQL.
    const orderBy = fts ? 'f.rank, e.id ASC' : SORTS[qs.sort];

    // COALESCE is the fallback chain: requested language → default language → the canonical
    // name on the base row. A row can therefore never render nameless, however incomplete its
    // translations are. `translated` tells the client which of those three it actually got, so
    // the UI can mark untranslated content honestly instead of pretending.
    const rows = await db.all(
      `SELECT e.id, e.difficulty, e.exercise_type, e.status, e.owner_id, e.source, e.created_at,
              COALESCE(t.name, tf.name, e.name)                             AS name,
              COALESCE(t.normalized_name, tf.normalized_name, e.normalized_name) AS normalized_name,
              CASE WHEN t.lang IS NOT NULL THEN 1 ELSE 0 END                AS translated,
              (SELECT storage_key FROM exercise_media WHERE exercise_id = e.id AND deleted_at IS NULL
                 ORDER BY position, id LIMIT 1) AS thumb_key
         FROM exercises e
         ${searchJoin}
         ${langJoin}
        WHERE ${where.join(' AND ')}
        GROUP BY e.id
        ORDER BY ${orderBy}
        LIMIT ?`,
      // Parameters bind in the order the `?` appear in the STATEMENT, not in the order the
      // clauses were assembled in JavaScript. The joins precede the WHERE, so their parameters
      // must too — assembling this list by concatenating named groups makes that ordering
      // explicit instead of something to re-derive every time a clause is added.
      [...searchParams, ...langParams, ...params, limit + 1],
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeCursor(qs.sort === 'name' ? [last.normalized_name, last.id] : [last.created_at, last.id])
        : null;

    if (qs.for_client) {
      const fit = await annotateForClient(page, qs.for_client, req.user.id);
      // Not this coach's link, or not active. 404 rather than 403: the caller must not be able to
      // tell "that link exists but is not yours" from "no such link".
      if (fit?.forbidden) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
      if (fit?.byId) {
        for (const row of page) {
          const f = fit.byId.get(row.id);
          row.missing_equipment = f?.missing_equipment ?? [];
          row.conflicts = f?.conflicts ?? [];
        }
      }
    }

    res.json({ exercises: page, nextCursor });
  }),
);

router.get(
  '/exercises/:id',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const userId = req.user.id;

    const lang = await resolveLang(req);
    const { fallback } = await languages();

    const exercise = await db.get(
      `SELECT e.id, e.status, e.owner_id, e.source, e.source_uid, e.difficulty, e.exercise_type,
              e.created_at, e.updated_at, e.submitted_at, e.rejection_reason,
              COALESCE(t.name, tf.name, e.name)                 AS name,
              COALESCE(t.description, tf.description, e.description)   AS description,
              COALESCE(t.instructions, tf.instructions, e.instructions) AS instructions,
              CASE WHEN t.lang IS NOT NULL THEN 1 ELSE 0 END    AS translated
         FROM exercises e
         LEFT JOIN exercise_translations t  ON t.exercise_id  = e.id AND t.lang  = ?
         LEFT JOIN exercise_translations tf ON tf.exercise_id = e.id AND tf.lang = ?
        WHERE e.id = ? AND ${VISIBLE}`,
      [lang, fallback, id, ...visibleParams(userId)],
    );
    // 404, not 403 — see the note on VISIBLE.
    if (!exercise) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    // Every language this exercise exists in, so the UI can offer a switch rather than silently
    // showing fallback text.
    const availableLangs = await db.all(
      'SELECT lang, origin FROM exercise_translations WHERE exercise_id = ? ORDER BY lang',
      [id],
    );

    const [muscles, equipmentRows, media] = await Promise.all([
      (() => {
        const l = labelJoin('muscle_group', 'g', fallback, lang);
        return db.all(
          `SELECT g.slug, g.body_side, m.role, ${l.select}
             FROM exercise_muscle_map m JOIN muscle_groups g ON g.id = m.muscle_group_id
             ${l.join}
            WHERE m.exercise_id = ?
            ORDER BY m.role, g.sort_order`,
          [...l.params, id],
        );
      })(),
      (() => {
        const l = labelJoin('equipment', 'q', fallback, lang);
        return db.all(
          `SELECT q.slug, ${l.select}
             FROM exercise_equipment_map x JOIN equipment q ON q.id = x.equipment_id
             ${l.join}
            WHERE x.exercise_id = ? ORDER BY q.sort_order`,
          [...l.params, id],
        );
      })(),
      db.all(
        `SELECT id, kind, storage_key, mime, width, height, position
           FROM exercise_media WHERE exercise_id = ? AND deleted_at IS NULL
          ORDER BY position, id`,
        [id],
      ),
    ]);

    // Substitutions: other visible exercises sharing this one's PRIMARY muscles. Ordered by how
    // many they share, so the closest swap comes first.
    const substitutions = await db.all(
      `SELECT e.id, COALESCE(t.name, e.name) AS name, e.difficulty, COUNT(*) AS shared
         FROM exercise_muscle_map m
         JOIN exercises e ON e.id = m.exercise_id
         LEFT JOIN exercise_translations t ON t.exercise_id = e.id AND t.lang = ?
        WHERE m.role = 'primary'
          AND m.muscle_group_id IN (SELECT muscle_group_id FROM exercise_muscle_map WHERE exercise_id = ? AND role = 'primary')
          AND e.id <> ?
          AND ${VISIBLE}
        GROUP BY e.id
        ORDER BY shared DESC, e.normalized_name
        LIMIT 8`,
      [lang, id, id, ...visibleParams(userId)],
    );

    res.json({
      exercise: { ...exercise, instructions: exercise.instructions ? JSON.parse(exercise.instructions) : [] },
      lang,
      availableLangs,
      muscles,
      equipment: equipmentRows,
      media,
      substitutions,
    });
  }),
);

const TranslationBody = z
  .object({
    lang: z.string().regex(/^[a-z]{2}$/),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(4000).nullable().optional(),
    instructions: z.array(z.string().trim().min(1).max(600)).max(30).optional(),
  })
  .strict();

const ExerciseBody = z
  .object({
    // The canonical name. Language-specific text goes in `translations` — a `name_hu` column
    // was the original design and it does not survive a third language, which is exactly why
    // migration 004 replaced it.
    name: z.string().trim().min(2).max(120),
    translations: z.array(TranslationBody).max(12).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    instructions: z.array(z.string().trim().min(1).max(600)).max(30).optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).nullable().optional(),
    exercise_type: z.enum(['strength', 'stretching', 'cardio', 'mobility', 'plyometrics']).nullable().optional(),
    muscles: z
      .array(z.object({ slug: z.string().max(40), role: z.enum(['primary', 'secondary']) }).strict())
      .max(12)
      .optional(),
    equipment: z.array(z.string().max(40)).max(12).optional(),
  })
  .strict();

/** Resolves slugs to ids, rejecting anything unknown rather than silently dropping it. */
async function resolveTaxonomy(muscles = [], equipmentSlugs = []) {
  const muscleRows = muscles.length
    ? await db.all(
        `SELECT id, slug FROM muscle_groups WHERE slug IN (${muscles.map(() => '?').join(',')})`,
        muscles.map((m) => m.slug),
      )
    : [];
  const equipRows = equipmentSlugs.length
    ? await db.all(
        `SELECT id, slug FROM equipment WHERE slug IN (${equipmentSlugs.map(() => '?').join(',')})`,
        equipmentSlugs,
      )
    : [];
  const muscleBySlug = new Map(muscleRows.map((r) => [r.slug, r.id]));
  const equipBySlug = new Map(equipRows.map((r) => [r.slug, r.id]));

  const unknown = [
    ...muscles.filter((m) => !muscleBySlug.has(m.slug)).map((m) => m.slug),
    ...equipmentSlugs.filter((s) => !equipBySlug.has(s)),
  ];
  return { muscleBySlug, equipBySlug, unknown };
}

router.post(
  '/exercises',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    if (req.user.role !== 'coach' && req.user.role !== 'admin') {
      return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
    }
    const body = ExerciseBody.parse(req.body);
    const { muscleBySlug, equipBySlug, unknown } = await resolveTaxonomy(body.muscles, body.equipment);
    if (unknown.length) return sendError(res, 400, ERR.VALIDATION, 'unknown taxonomy slug');

    // A custom exercise is ALWAYS created private and owned by its creator. Neither `status`
    // nor `owner_id` is accepted from the body — `.strict()` rejects them outright, and even if
    // it did not, they are not read here.
    const created = await db.run(
      `INSERT INTO exercises (name, normalized_name, description, instructions,
                              status, owner_id, source, difficulty, exercise_type)
       VALUES (?, ?, ?, ?, 'private', ?, 'custom', ?, ?)`,
      [
        body.name,
        normalizeText(body.name),
        body.description ?? null,
        body.instructions ? JSON.stringify(body.instructions) : null,
        req.user.id,
        body.difficulty ?? null,
        body.exercise_type ?? null,
      ],
    );

    const id = created.lastInsertRowid;

    // The creator's own language gets a real translation row, not just the base-row fallback.
    // Without this, a coach writing in Hungarian would see their own exercise reported as
    // untranslated, and a later Spanish translation would have nothing to sit beside.
    const lang = await resolveLang(req);
    // One row for the creator's own language, plus one per explicitly supplied translation. The
    // ON CONFLICT lets an explicit entry for the same language win over the implicit one, so a
    // coach can send `{ lang: 'hu', name: … }` and have it replace rather than collide.
    const translations = [
      { lang, name: body.name, description: body.description, instructions: body.instructions },
      ...(body.translations ?? []),
    ];
    const steps = [
      ...translations.map((tr) => ({
        sql: `INSERT INTO exercise_translations (exercise_id, lang, name, normalized_name, description, instructions, origin)
              VALUES (?, ?, ?, ?, ?, ?, 'human')
              ON CONFLICT(exercise_id, lang) DO UPDATE SET
                name = excluded.name, normalized_name = excluded.normalized_name,
                description = excluded.description, instructions = excluded.instructions`,
        params: [
          id,
          tr.lang,
          tr.name,
          normalizeText(tr.name),
          tr.description ?? null,
          tr.instructions ? JSON.stringify(tr.instructions) : null,
        ],
      })),
      ...(body.muscles ?? []).map((m) => ({
        sql: 'INSERT INTO exercise_muscle_map (exercise_id, muscle_group_id, role) VALUES (?, ?, ?)',
        params: [id, muscleBySlug.get(m.slug), m.role],
      })),
      ...(body.equipment ?? []).map((slug) => ({
        sql: 'INSERT INTO exercise_equipment_map (exercise_id, equipment_id) VALUES (?, ?)',
        params: [id, equipBySlug.get(slug)],
      })),
    ];
    if (steps.length) await db.writeTx(steps);

    res.status(201).json({ id });
  }),
);

router.patch(
  '/exercises/:id',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = ExerciseBody.partial().parse(req.body);

    // Ownership is re-validated on the WRITE, not inherited from whatever the read said. The
    // owner check is part of the UPDATE's WHERE clause, so a row that is not the caller's simply
    // does not match and reports 0 changes.
    const owned = await db.get(
      'SELECT id, status FROM exercises WHERE id = ? AND owner_id = ? AND deleted_at IS NULL',
      [id, req.user.id],
    );
    if (!owned) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    if (owned.status === 'global') {
      return sendError(res, 409, ERR.CONFLICT, 'a published exercise cannot be edited directly');
    }

    // Explicit pick-list. `req.body` is never spread into SQL or into an object that reaches it.
    const sets = [];
    const params = [];
    const put = (col, value) => {
      sets.push(`${col} = ?`);
      params.push(value);
    };
    if (body.name !== undefined) put('name', body.name);
    if (body.description !== undefined) put('description', body.description);
    if (body.instructions !== undefined) put('instructions', JSON.stringify(body.instructions));
    if (body.difficulty !== undefined) put('difficulty', body.difficulty);
    if (body.exercise_type !== undefined) put('exercise_type', body.exercise_type);
    if (body.name !== undefined) put('normalized_name', normalizeText(body.name));
    if (!sets.length) return sendError(res, 400, ERR.VALIDATION, 'nothing to update');

    await db.run(`UPDATE exercises SET ${sets.join(', ')} WHERE id = ? AND owner_id = ?`, [
      ...params,
      id,
      req.user.id,
    ]);
    res.json({ ok: true });
  }),
);

router.delete(
  '/exercises/:id',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const result = await db.run(
      'UPDATE exercises SET deleted_at = unixepoch() WHERE id = ? AND owner_id = ? AND deleted_at IS NULL',
      [id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

router.post(
  '/exercises/:id/submit',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    // The guard lives INSIDE the UPDATE rather than in a preceding SELECT: two rapid submissions
    // cannot both succeed, because only one can find the row still in `private`.
    const result = await db.run(
      `UPDATE exercises SET status = 'pending_review', submitted_at = unixepoch()
        WHERE id = ? AND owner_id = ? AND status = 'private' AND deleted_at IS NULL`,
      [id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

router.get(
  '/taxonomies',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    // Resolved server-side rather than shipping every language to the client: the browser has
    // no business receiving 22 labels to throw away 21 of them, and a translated list that the
    // client assembles is a translated list the client can get wrong.
    const lang = await resolveLang(req);
    const [muscles, equipmentRows] = await Promise.all([
      taxonomyList('muscle_group', lang),
      taxonomyList('equipment', lang),
    ]);
    res.json({ lang, muscles, equipment: equipmentRows });
  }),
);

// Public: the CC-BY-SA licence of the wger dataset requires visible attribution, and a licence
// page behind a login is not visible attribution.
router.get(
  '/sources',
  readLimiter,
  asyncRoute(async (req, res) => {
    const counts = await db.all(
      "SELECT source, COUNT(*) AS count FROM exercises WHERE status = 'global' AND deleted_at IS NULL GROUP BY source",
    );
    res.json({
      sources: [
        {
          id: 'wger',
          name: 'wger Workout Manager',
          url: 'https://wger.de',
          license: 'CC-BY-SA 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
          count: counts.find((c) => c.source === 'wger')?.count ?? 0,
        },
        {
          id: 'free-exercise-db',
          name: 'free-exercise-db',
          url: 'https://github.com/yuhonas/free-exercise-db',
          license: 'Public domain (Unlicense)',
          licenseUrl: 'https://unlicense.org/',
          count: counts.find((c) => c.source === 'free-exercise-db')?.count ?? 0,
        },
      ],
    });
  }),
);

/**
 * Which languages the product serves, and which one this request resolved to.
 *
 * Public: the language picker has to render before anyone signs in, and the set of supported
 * languages is not a secret. `resolved` lets a client confirm that its Accept-Language header
 * was understood, instead of guessing why it is seeing English.
 */
router.get(
  '/languages',
  readLimiter,
  asyncRoute(async (req, res) => {
    const { list, fallback } = await languages();
    res.json({ languages: list, fallback, resolved: await resolveLang(req) });
  }),
);

export default router;
