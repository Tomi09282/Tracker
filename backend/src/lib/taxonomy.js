// src/lib/taxonomy.js — one place that resolves taxonomy labels into a requested language.
//
// Three call sites needed this (the taxonomy list, the exercise detail's muscle rows, its
// equipment rows) and each had its own `lang === 'hu' ? name_hu : name_en`. That is how a UI ends
// up half-translated: two of three sites get updated and the third keeps serving English.
//
// The fallback chain is the same one exercise names use, and it is deliberate:
//   requested language → the instance default → the canonical name on the row.
// `translated` is returned alongside so the UI can mark a fallback label rather than pretending
// the text is in the reader's language.
import * as db from '../db/index.js';
import { languages } from './lang.js';

const TABLES = {
  muscle_group: { table: 'muscle_groups', extra: ', t.body_side' },
  equipment: { table: 'equipment', extra: '' },
};

/**
 * Labels for a whole taxonomy, ordered by the taxonomy's own sort order.
 *
 * `kind` is looked up in a hardcoded map rather than interpolated, so the table name in the SQL
 * below can only ever be one of two literals this file wrote. Everything that varies per request
 * — the language — is a bound parameter.
 */
export async function taxonomyList(kind, lang) {
  const spec = TABLES[kind];
  if (!spec) throw new Error(`unknown taxonomy: ${kind}`);
  const { fallback } = await languages();

  return db.all(
    `SELECT t.id, t.slug${spec.extra},
            COALESCE(want.name, def.name, t.name) AS name,
            want.name IS NOT NULL                 AS translated
       FROM ${spec.table} t
       LEFT JOIN taxonomy_translations want
              ON want.kind = ? AND want.ref_id = t.id AND want.lang = ?
       LEFT JOIN taxonomy_translations def
              ON def.kind  = ? AND def.ref_id  = t.id AND def.lang  = ?
      ORDER BY t.sort_order, t.id`,
    [kind, lang, kind, fallback],
  );
}

/**
 * The same resolution, but joined onto rows that already came from a query — the muscles and
 * equipment attached to one exercise.
 *
 * Returns a SQL fragment rather than doing the work, because the caller's query already has the
 * join it needs and running a second query per exercise would be an N+1 on the busiest screen in
 * the app.
 */
export function labelJoin(kind, alias, fallbackLang, lang) {
  return {
    select: `COALESCE(want_${alias}.name, def_${alias}.name, ${alias}.name) AS name,
             want_${alias}.name IS NOT NULL AS translated`,
    join: `LEFT JOIN taxonomy_translations want_${alias}
                  ON want_${alias}.kind = ? AND want_${alias}.ref_id = ${alias}.id AND want_${alias}.lang = ?
           LEFT JOIN taxonomy_translations def_${alias}
                  ON def_${alias}.kind  = ? AND def_${alias}.ref_id  = ${alias}.id AND def_${alias}.lang  = ?`,
    params: [kind, lang, kind, fallbackLang],
  };
}
