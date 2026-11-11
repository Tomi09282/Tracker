// src/lifeos/focus.js — the focus rules, pure (f_app src/domain/focus.ts, migration 035).
//
// No database, no clock: every function takes the instant it judges ("now" is the worker's clock,
// passed in by src/db/tx/lifeos-focus.js; the verify scripts pass a fake one). Safe to import on
// the main thread (the routes read the limits) and inside a worker.
//
// ═══ THE ECONOMY OF A FOCUS BLOCK ══════════════════════════════════════════════════════════════
//
//   * Finishing pays for the minutes actually spent, capped at the planned length (f_app
//     elapsedMinutes), at focusPointsPerHour pro rata, ROUNDED (f_app Math.round: 50 min x 20 / h =
//     16.7 -> 17), plus focusCheckinPoint per answered check-in — focus-3's "50 perc x 20 érme/óra
//     = 17 · 3 jelzés x 2 = 6".
//   * Cancelling ("Feladás") pays nothing, and there is nothing to reverse.
//   * Check-ins are paced by the clock: at most floor(elapsed / interval) of them (focus-2's
//     "1 / 3" at 15 of 50 minutes with a 15-minute interval), and two closer than 5 minutes count
//     once (f_app MIN_CHECKIN_GAP_MINUTES) — a double tap cannot farm the bonus.
//   * FOCUS_MAX_MINUTES_PER_DAY: at most this many focus minutes are paid per logical day. A finish
//     beyond it still closes the session; it pays for the minutes left under the limit, and only
//     the check-ins those minutes cover. The 400-coin daily earn cap applies on top (postCoinEvent).
//
// Times are epoch SECONDS, as in the schema.

/** f_app MAX_FOCUS_HOURS = 12. The shortest block is 5 minutes. */
export const FOCUS_MIN_MINUTES = 5;
export const FOCUS_MAX_MINUTES = 720;
/** f_app MAX_CHECKIN_MINUTES; 0 = no check-ins. Never below the de-dup gap. */
export const FOCUS_MAX_CHECKIN_MINUTES = 180;
/** f_app MIN_CHECKIN_GAP_MINUTES: two check-ins closer than this count once. */
export const MIN_CHECKIN_GAP_MINUTES = 5;
/** Paid focus minutes per logical day (8 hours). */
export const FOCUS_MAX_MINUTES_PER_DAY = 480;
/** Sessions a user can START per logical day: bounds the table against a create / cancel loop. */
export const FOCUS_MAX_SESSIONS_PER_DAY = 48;
/** A session may be planned at most this far ahead (Ma's "Következő blokk · 14:00"). */
export const FOCUS_MAX_PLAN_AHEAD_SECONDS = 24 * 3600;
/** A start this much in the past is read as "now" (a slow request); older is refused. */
export const FOCUS_START_SLACK_SECONDS = 120;

export const FOCUS_LIMITS = Object.freeze({
  minMinutes: FOCUS_MIN_MINUTES,
  maxMinutes: FOCUS_MAX_MINUTES,
  maxCheckinMinutes: FOCUS_MAX_CHECKIN_MINUTES,
  minCheckinGapMinutes: MIN_CHECKIN_GAP_MINUTES,
  maxMinutesPerDay: FOCUS_MAX_MINUTES_PER_DAY,
  maxSessionsPerDay: FOCUS_MAX_SESSIONS_PER_DAY,
  maxPlanAheadSeconds: FOCUS_MAX_PLAN_AHEAD_SECONDS,
});

export const endsAt = (s) => s.startsAt + 60 * s.plannedMinutes;

/** planned | active | ended | done | cancelled (f_app focusStatus). */
export function focusStatus(s, nowSec) {
  if (s.status === 'cancelled') return 'cancelled';
  if (s.status === 'done') return 'done';
  if (nowSec < s.startsAt) return 'planned';
  if (nowSec < endsAt(s)) return 'active';
  return 'ended';
}

/** Whole minutes of the block spent at `nowSec`: 0 before the start, the full plan after the end. */
export function elapsedMinutes(s, nowSec) {
  const t = Math.min(Math.max(nowSec, s.startsAt), endsAt(s));
  return Math.floor((t - s.startsAt) / 60);
}

/**
 * The check-ins a block can hold in all ("1 / 3": the 3): the interval's multiples strictly BEFORE
 * the end (a check-in is answered while the block runs; 50 min every 15 -> 15, 30, 45 = 3, and
 * 50 min every 25 -> 25 only = 1, the 50th minute being the end).
 */
export function checkinsMax(s) {
  return s.checkinMinutes > 0 ? Math.floor((s.plannedMinutes - 1) / s.checkinMinutes) : 0;
}

/** The check-ins answerable by `nowSec`: floor(elapsed / interval). */
export function checkinsAllowed(s, nowSec) {
  return s.checkinMinutes > 0 ? Math.floor(elapsedMinutes(s, nowSec) / s.checkinMinutes) : 0;
}

/**
 * Can a check-in be counted at `nowSec`? 'ok' | 'not_active' | 'no_checkins' | 'not_due' | 'too_soon'.
 * not_due = the clock has not earned another one yet; too_soon = within 5 minutes of the last.
 */
export function checkinVerdict(s, nowSec) {
  if (focusStatus(s, nowSec) !== 'active') return 'not_active';
  if (s.checkinMinutes === 0) return 'no_checkins';
  if (s.checkinsDone >= checkinsAllowed(s, nowSec)) return 'not_due';
  if (s.lastCheckinAt !== null && nowSec - s.lastCheckinAt < MIN_CHECKIN_GAP_MINUTES * 60) return 'too_soon';
  return 'ok';
}

/** The moment the next check-in becomes answerable (null when none is left or the block has none). */
export function nextCheckinAt(s) {
  if (s.checkinMinutes === 0 || s.status !== 'open') return null;
  const n = s.checkinsDone + 1;
  if (n > checkinsMax(s)) return null;
  let at = s.startsAt + 60 * n * s.checkinMinutes;
  if (s.lastCheckinAt !== null) at = Math.max(at, s.lastCheckinAt + MIN_CHECKIN_GAP_MINUTES * 60);
  return at < endsAt(s) ? at : null;
}

/** Coins (whole points) for paid minutes and paid check-ins (f_app focusPoints). */
export function focusPoints({ minutes, checkins }, rules) {
  return Math.round((minutes * rules.focusPointsPerHour) / 60) + checkins * rules.focusCheckinPoint;
}

/**
 * What a finish at `nowSec` pays FOR, given the minutes already paid today:
 * { minutes, checkins, points }. Minutes are the elapsed ones trimmed to the day's room; the
 * check-ins counted are those the paid minutes cover (all of them when nothing was trimmed).
 */
export function focusPayout(s, nowSec, paidTodayMinutes, rules) {
  const elapsed = elapsedMinutes(s, nowSec);
  const room = Math.max(0, FOCUS_MAX_MINUTES_PER_DAY - paidTodayMinutes);
  const minutes = Math.min(elapsed, room);
  let checkins = s.checkinsDone;
  if (minutes < elapsed) checkins = s.checkinMinutes > 0 ? Math.min(checkins, Math.floor(minutes / s.checkinMinutes)) : 0;
  return { minutes, checkins, points: focusPoints({ minutes, checkins }, rules) };
}

/** What the whole plan would pay with every check-in answered (focus-1's "Várhatóan +23 érme"). */
export function focusExpectedPoints(s, rules) {
  return focusPoints({ minutes: s.plannedMinutes, checkins: checkinsMax(s) }, rules);
}
