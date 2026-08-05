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
import * as db from '../db/index.js';

const DAY_MS = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const utc = (date) => Date.parse(`${date}T00:00:00Z`);

/**
 * The user's own calendar day.
 *
 * Derived from their stored timezone, never from the request — a client that reports its own date
 * can report any date, and "which day is this workout on" decides which occurrence gets consumed.
 */
export async function localDateFor(userId) {
  const row = await db.get('SELECT timezone FROM onboarding_profiles WHERE user_id = ?', [userId]);
  const zone = row?.timezone;
  if (!zone) return iso(Date.now());
  try {
    // `en-CA` renders as YYYY-MM-DD, which is what the schema's `date(local_date)` CHECK wants.
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
  } catch {
    // A stored zone the runtime does not recognise is data rot, not a request error. Fall back
    // rather than failing a workout the user is standing in the gym trying to start.
    return iso(Date.now());
  }
}

/**
 * Every scheduled occurrence for one user in the window `[fromDate, fromDate + days)`.
 *
 * Three things it handles that a naive `starts_on + k*cycle` loop does not, each of which would
 * otherwise show someone the wrong day:
 *   - `ends_on`: a finished block stops producing occurrences — on BOTH paths below, which is
 *     precisely where the first version of this drifted.
 *   - exceptions: a `skip` removes the day; a `move` takes it off its original date AND puts it on
 *     the new one, so the window has to be searched from both directions.
 *   - rest days: they occur, and saying "rest day" is information. Hiding them looks like a bug.
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

  const skipped = new Set(exceptions.filter((e) => e.action === 'skip').map((e) => `${e.day_id}:${e.occurrence_date}`));
  const movedFrom = new Map(
    exceptions.filter((e) => e.action === 'move').map((e) => [`${e.day_id}:${e.occurrence_date}`, e.moved_to_date]),
  );
  const logByOccurrence = new Map(logs.map((l) => [`${l.plan_day_id}:${l.occurrence_date}`, l]));

  const out = [];
  const start = utc(fromDate);

  const emit = (d, plan, date, moved) => {
    const log = logByOccurrence.get(`${d.id}:${date}`);
    out.push({
      date,
      day_id: d.id,
      day_name: d.name,
      slot: d.slot,
      is_rest: d.is_rest,
      est_minutes: d.est_minutes,
      start_time: d.start_time,
      exercise_count: d.exercise_count,
      plan_id: plan.id,
      plan_name: plan.name,
      ...(moved ? { moved: true } : {}),
      log_id: log?.id ?? null,
      log_status: log?.status ?? null,
    });
  };

  for (let offset = 0; offset < days; offset += 1) {
    const date = iso(start + offset * DAY_MS);
    for (const plan of plans) {
      if (date < plan.starts_on) continue;
      if (plan.ends_on && date > plan.ends_on) continue;
      const elapsed = Math.floor((utc(date) - utc(plan.starts_on)) / DAY_MS);
      const index = ((elapsed % plan.cycle_days) + plan.cycle_days) % plan.cycle_days;

      for (const d of planDays.filter((x) => x.plan_id === plan.id && x.day_index === index)) {
        const key = `${d.id}:${date}`;
        if (skipped.has(key)) continue;
        // A moved day leaves its original date and appears on the new one — which may fall outside
        // this window, and that is correct: it is simply not in this week any more.
        if ((movedFrom.get(key) ?? date) !== date) continue;
        emit(d, plan, date, false);
      }
    }
  }

  // Days moved ONTO a date inside the window, FROM ANYWHERE — including from before it. This pass
  // is the one the ICS copy lacked, and without it a session dragged backwards out of the window
  // and forwards into it disappeared instead of moving.
  for (const e of exceptions.filter((x) => x.action === 'move' && x.moved_to_date)) {
    if (e.moved_to_date < fromDate || utc(e.moved_to_date) >= start + days * DAY_MS) continue;
    const d = planDays.find((x) => x.id === e.day_id);
    if (!d) continue;
    const plan = plans.find((p) => p.id === d.plan_id);
    if (!plan) continue;
    // A move cannot outlive its block. Without this the moved half ignored `ends_on` while the
    // scheduled half honoured it — the exact bug that started the consolidation.
    if (plan.ends_on && e.moved_to_date > plan.ends_on) continue;
    emit(d, plan, e.moved_to_date, true);
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot);
}
