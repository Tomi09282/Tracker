// src/nutrition/daySql.js — the day's nutrition, as SQL text shared by the route and the worker.
//
// GET /nutrition-log/:date answers "what was prescribed for this date"; the LifeOS day close asks
// the same question inside a worker transaction to decide the kcal outcome that pays or costs
// coins. Two copies of the target query would be two answers to one question — the defect
// src/plans/schedule.js was written to end — so the text lives here and both prepare it.
//
// Plain strings, no imports: safe to load on the main thread AND inside a worker. Every value that
// varies is a bound `?`.

/**
 * The active nutrition plan's target for a calendar date.
 * Params: [date, userId, date]. At most one row.
 *
 * `julianday` differences give whole days regardless of DST — the same arithmetic as the schedule
 * rule in src/plans/occurrences.js.
 */
export const DAY_TARGETS_SQL = `
  SELECT d.id AS plan_day_id, d.name AS day_name,
         d.kcal_target_x10                AS kcal_target_x10,
         d.kcal_target_x10 / 10.0         AS kcal_target,
         d.protein_mg_target / 1000.0     AS protein_g_target,
         d.carb_mg_target / 1000.0        AS carb_g_target,
         d.fat_mg_target / 1000.0         AS fat_g_target
    FROM nutrition_plans p
    JOIN nutrition_plan_days d
      ON d.plan_id = p.id
     AND d.day_index = CAST((julianday(?) - julianday(p.starts_on)) AS INTEGER) % p.cycle_days
   WHERE p.client_user_id = ? AND p.status = 'active' AND p.archived_at IS NULL
     AND p.starts_on IS NOT NULL AND p.starts_on <= ?
   ORDER BY p.id DESC LIMIT 1`;

/**
 * What was eaten on a date, in kcal x 10, integer (snapshot kcal/100 g x10 times grams x10 / 1000).
 * Params: [userId, date]. Always one row.
 */
export const DAY_KCAL_EATEN_SQL = `
  SELECT COUNT(*) AS entries,
         COALESCE(SUM(kcal_per_100g_x10_snapshot * grams_x10), 0) / 1000 AS kcal_eaten_x10
    FROM nutrition_log_items
   WHERE client_user_id = ? AND local_date = ?`;
