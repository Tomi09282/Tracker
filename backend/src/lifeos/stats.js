// src/lifeos/stats.js — pure helpers of the LifeOS statistics (f_app src/domain/stats.ts ports:
// pointsHistory, weeklyPoints, habitHeatmap, kcalHistory, overview — the SQL half lives in
// src/db/tx/lifeos-stats.js). No database, no clock; safe on the main thread and in a worker.
import { addDaysToKey, weekdayIndex } from './dates.js';

/** The longest range GET /lifeos/days answers (inclusive days). */
export const DAYS_MAX_SPAN = 92;
/** GET /lifeos/stats windows: the day columns (the hero's 14) and the week rows (HETEK's 4). */
export const STATS_DAYS = Object.freeze({ min: 7, max: 28, default: 14 });
export const STATS_WEEKS = Object.freeze({ min: 1, max: 12, default: 4 });

/** Monday of the ISO week of a day key. */
export const mondayOf = (key) => addDaysToKey(key, -weekdayIndex(key));

/**
 * ISO-8601 week number and week-year of a day key ("42. hét" for 2026-10-12..18). The week
 * belongs to the year of its Thursday.
 */
export function isoWeek(key) {
  const thursday = addDaysToKey(mondayOf(key), 3);
  const year = Number(thursday.slice(0, 4));
  const jan1 = `${year}-01-01`;
  const firstThursday = addDaysToKey(mondayOf(addDaysToKey(jan1, 3)), 3);
  const days = Math.round((Date.parse(`${thursday}T00:00:00Z`) - Date.parse(`${firstThursday}T00:00:00Z`)) / 86400000);
  return { year, week: days / 7 + 1 };
}

/**
 * A settled habit day as the Haladás > Napok SegmentBar draws it (legend "teljesítve · részben ·
 * kihagyva"): done (done / clean) · partial (missed with a partial count) · frozen (a freeze held
 * the streak) · missed · relapse · skipped · open (a times-per-week weekday not done) · lapsed
 * (inside a catch-up gap) · none (no result: not scheduled, before the habit, or not settled).
 */
export function habitCellState(result) {
  if (!result) return 'none';
  switch (result.outcome) {
    case 'done':
    case 'clean':
      return 'done';
    case 'missed':
      return result.count > 0 ? 'partial' : 'missed';
    default:
      return result.outcome; // frozen | relapse | skipped | open | lapsed
  }
}

/** x10 integer kcal (the schema's unit) -> kcal with one decimal, null stays null. */
export const kcalOf = (x10) => (x10 === null || x10 === undefined ? null : Math.round(x10) / 10);
