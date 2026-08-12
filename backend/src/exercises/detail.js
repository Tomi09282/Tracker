// src/exercises/detail.js — what an exercise IS, assembled once.
//
// ═══ WHY THIS IS A FILE AND NOT A COPY-PASTE ═══════════════════════════════════════════════════
//
// Two routes now answer "show me this exercise": the library's `GET /exercises/:id` and the
// moderator's `GET /admin/moderation/:id`. They differ in exactly one thing — WHICH rows the caller
// may reach — and in nothing else.
//
// The tempting shape is to write the admin one fresh, because it is only four queries. That shape
// is how the moderation screen ends up showing a subset of what the library shows, which is the
// precise failure this feature exists to prevent: a moderator approving an exercise into the shared
// library on the strength of a name, a count, and whatever the admin query happened to select.
//
// So the head columns and the body assembly live here, and each route contributes only its own
// visibility predicate. A field added for the library appears on the moderation screen the same
// day, without anybody remembering to add it.
import * as db from '../db/index.js';
import { labelJoin } from '../lib/taxonomy.js';

/**
 * The head projection, minus the FROM clause.
 *
 * `e` is the exercises table; `t` is the translation in the requested language and `tf` the
 * fallback. Every caller aliases them the same way, which is the price of sharing the string.
 */
export const DETAIL_COLUMNS = `e.id, e.status, e.owner_id, e.source, e.source_uid, e.difficulty,
       e.exercise_type, e.created_at, e.updated_at, e.submitted_at, e.rejection_reason,
       COALESCE(t.name, tf.name, e.name)                         AS name,
       COALESCE(t.description, tf.description, e.description)    AS description,
       COALESCE(t.instructions, tf.instructions, e.instructions) AS instructions,
       CASE WHEN t.lang IS NOT NULL THEN 1 ELSE 0 END            AS translated`;

/** The joins `DETAIL_COLUMNS` depends on. Takes `[lang, fallback]`, in that order. */
export const DETAIL_JOINS = `FROM exercises e
   LEFT JOIN exercise_translations t  ON t.exercise_id  = e.id AND t.lang  = ?
   LEFT JOIN exercise_translations tf ON tf.exercise_id = e.id AND tf.lang = ?`;

/**
 * Everything hanging off an exercise: its languages, muscles, equipment and media.
 *
 * No visibility predicate — the caller has already established that this id is theirs to read, and
 * a second predicate here would be a second place to get it wrong. The id it receives must never
 * come straight from a URL.
 */
export async function exerciseBody(id, lang, fallback) {
  const [availableLangs, muscles, equipment, media] = await Promise.all([
    db.all('SELECT lang, origin FROM exercise_translations WHERE exercise_id = ? ORDER BY lang', [id]),
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

  return { availableLangs, muscles, equipment, media };
}

/**
 * `instructions` is stored as a JSON array in one TEXT column and every consumer wants an array.
 * Parsed here so a route cannot forget and hand the client a string that renders as `["Step one"...`.
 */
export const withInstructions = (exercise) => ({
  ...exercise,
  instructions: exercise.instructions ? JSON.parse(exercise.instructions) : [],
});
