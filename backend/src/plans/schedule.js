// src/plans/schedule.js — THE schedule rule. One implementation, for every caller.
//
// The schedule is a RULE, not a materialised calendar: an occurrence is
// `starts_on + k*cycle_days + day_index`. That is what makes "what is on in ninety days" arithmetic
// rather than a table scan, and it is why nothing anywhere writes future occurrence rows.
//
// This file exists because the rule was implemented THREE times — `/my-plans/today`,
// `/my-plans/week`, and the ICS generator — and, entirely predictably, the copies disagreed. Two
// real divergences were found when they were finally compared side by side:
//
//   1. The ICS copy never emitted a day MOVED ONTO a date in its window from a date before it. It
//      iterated forward from today and relocated days it happened to pass, so a session dragged
//      from yesterday to next Tuesday simply vanished from the subscriber's calendar.
//   2. The ICS copy started its horizon at the SERVER's date (`new Date()`), while every other
//      caller derives the day from the client's own timezone. For a subscriber far enough east or
//      west, the feed was a day out.
//
// Neither was visible by reading either copy alone; both were obvious the moment there was only
// one. This is the same lesson as the ownership predicates and the design tokens: two things that
// must agree will drift, and the only durable fix is that there is only one thing.
//
// Package B-core: the rule itself now lives in ./occurrences.js (pure, no imports) so the LifeOS
// day close can run it INSIDE a worker transaction; this file reads the rows and calls it.
import * as db from '../db/index.js';
import { expandOccurrences } from './occurrences.js';
import { calendarKeyFor } from '../lifeos/dates.js';

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * The user's own calendar day.
 *
 * Derived from their stored timezone, never from the request — a client that reports its own date
 * can report any date, and "which day is this workout on" decides which occurrence gets consumed.
 *
 * The zone is user_prefs.timezone (migration 031, written by PATCH /me/prefs). Until 031 it was
 * onboarding_profiles.timezone, which nothing ever wrote — so every date was a UTC date; 031
 * backfilled what existed. This is the CALENDAR date in the zone, not the LifeOS logical day:
 * a workout at 01:00 is logged on the date the clock shows.
 */
export async function localDateFor(userId) {
  return (await localDateInfo(userId)).date;
}

/** The same date, plus whether it came from a stored zone (`zoned`) or is the UTC fallback. */
export async function localDateInfo(userId) {
  const row = await db.get('SELECT timezone FROM user_prefs WHERE user_id = ?', [userId]);
  const zone = row?.timezone;
  if (!zone) return { date: iso(Date.now()), zoned: false };
  try {
    return { date: calendarKeyFor(new Date(), zone), zoned: true };
  } catch {
    // A stored zone the runtime does not recognise is data rot, not a request error. Fall back
    // rather than failing a workout the user is standing in the gym trying to start.
    return { date: iso(Date.now()), zoned: false };
  }
}

/**
 * Every scheduled occurrence for one user in the window `[fromDate, fromDate + days)`.
 *
 * The rule (ends_on on both paths, skip / move exceptions searched from both directions, rest days
 * that occur) is ./occurrences.js expandOccurrences — see it for what each part prevents.
 *
 * `days` is bounded by every caller — the ICS horizon is the largest at 120 — because the loop is
 * driven by a cycle length that ultimately came from a user.
 */
export async function occurrencesBetween(userId, fromDate, days) {
  const plans = await db.all(
    `SELECT id, name, cycle_days, starts_on, ends_on
       FROM workout_plans
      WHERE client_user_id = ? AND archived_at IS NULL AND status = 'active'
        AND starts_on IS NOT NULL
        AND (ends_on IS NULL OR ends_on >= ?)`,
    [userId, fromDate],
  );
  if (!plans.length) return [];

  const ids = plans.map((p) => p.id);
  const holes = ids.map(() => '?').join(',');
  const [planDays, exceptions, logs] = await Promise.all([
    db.all(
      `SELECT d.id, d.plan_id, d.day_index, d.slot, d.name, d.is_rest, d.est_minutes, d.start_time,
              (SELECT COUNT(*) FROM workout_plan_exercises px
                 JOIN workout_plan_blocks b ON b.id = px.block_id
                WHERE b.day_id = d.id) AS exercise_count
         FROM workout_plan_days d WHERE d.plan_id IN (${holes}) ORDER BY d.day_index, d.slot`,
      ids,
    ),
    db.all(
      `SELECT day_id, occurrence_date, action, moved_to_date
         FROM workout_plan_day_exceptions WHERE plan_id IN (${holes})`,
      ids,
    ),
    db.all(
      `SELECT plan_day_id, occurrence_date, id, status FROM workout_logs
        WHERE client_user_id = ? AND occurrence_date IS NOT NULL AND occurrence_date >= ?`,
      [userId, fromDate],
    ),
  ]);

  return expandOccurrences({ plans, planDays, exceptions, logs }, fromDate, days);
}
