// src/db/lifeos-calendar.js — calendar events and scheduled workouts inside the worker: the reads
// the calendar, the event detail and Ma's "KÖVETKEZŐ" line share (migration 034).
//
// WORKER SIDE ONLY, NOT A tx/ FILE — for the reason given in lifeos-ledger.js: these are fragments
// that run inside a caller's transaction or read (src/db/tx/lifeos-events.js, and lifeosTodayQuery
// in src/db/tx/lifeos.js). Nothing here opens a transaction and nothing here is a task Piscina can
// be asked to run by name. Every statement is prepared, bound and ownership-scoped (`user_id = ?`).
// Nothing here writes.
import { stmt } from './conn.js';
import { addDaysToKey, calendarKeyFor, instantFor, localTime } from '../lifeos/dates.js';
import { parseEventRecurrence } from '../lifeos/event-times.js';
import { MAX_EVENT_DAYS, nextOccurrence } from '../lifeos/occurrences.js';
import { expandOccurrences } from '../plans/occurrences.js';

/** A user's events, at most 600 per read (LIMIT 600 below; the item cap is 500, the margin is deliberate), and at
 * most 2400 reminder offsets (four per event). Literals in the SQL: the statement text never varies. */

const EVENT_COLS = `e.id, e.title, e.notes, e.location, e.all_day AS allDay, e.start_at AS startAt,
  e.end_at AS endAt, e.start_local AS startLocal, e.tz, e.recurrence_json AS recurrenceJson,
  e.until_date AS untilDate, e.created_at AS createdAt, e.updated_at AS updatedAt`;

/** A stored row as the pure engine reads it (src/lifeos/occurrences.js). */
export function eventFromRow(r) {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    location: r.location,
    allDay: r.allDay === 1,
    startAt: r.startAt,
    endAt: r.endAt,
    startLocal: r.startLocal,
    tz: r.tz,
    recurrence: parseEventRecurrence(r.recurrenceJson),
    recurrenceJson: r.recurrenceJson,
    untilDate: r.untilDate,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** One event, owned (another account's event is indistinguishable from a missing one). */
export function eventById(userId, eventId) {
  const r = stmt(`SELECT ${EVENT_COLS} FROM events e WHERE e.id = ? AND e.user_id = ?`).get(eventId, userId);
  return r ? eventFromRow(r) : null;
}

export function countEvents(userId) {
  return stmt('SELECT COUNT(*) AS n FROM events WHERE user_id = ?').get(userId).n;
}

/** The reminder offsets of one event, ascending. */
export function eventOffsets(userId, eventId) {
  return stmt(
    'SELECT offset_minutes AS o FROM event_reminders WHERE event_id = ? AND user_id = ? ORDER BY offset_minutes',
  )
    .all(eventId, userId)
    .map((r) => r.o);
}

/**
 * Every event of a user that can touch the local window [from, to] (viewer keys in `viewerTz`):
 * a one-off whose [start, end) meets the widened window, or a rule that started before the window
 * ends and whose until date is not over before it begins. The window is widened by a day each side
 * (zones) and by MAX_EVENT_DAYS before (a long occurrence that began earlier is still running);
 * the pure engine then decides exactly.
 */
export function eventsTouching(userId, from, to, viewerTz) {
  const lo = Math.floor(instantFor(addDaysToKey(from, -1), '00:00', viewerTz).getTime() / 1000);
  const hi = Math.floor(instantFor(addDaysToKey(to, 2), '00:00', viewerTz).getTime() / 1000);
  const untilFloor = addDaysToKey(from, -(MAX_EVENT_DAYS + 2));
  return stmt(
    `SELECT ${EVENT_COLS} FROM events e
      WHERE e.user_id = ? AND e.start_at < ?
        AND ((e.recurrence_json IS NULL AND (e.end_at > ? OR (e.end_at = e.start_at AND e.start_at >= ?)))
             OR (e.recurrence_json IS NOT NULL AND (e.until_date IS NULL OR e.until_date >= ?)))
      ORDER BY e.start_at, e.id
      LIMIT 600`,
  )
    .all(userId, hi, lo, lo, untilFloor)
    .map(eventFromRow);
}

/** Reminder offsets of many events at once: Map eventId -> [offset, ...] ascending. */
export function offsetsByEvent(userId) {
  const out = new Map();
  for (const r of stmt(
    `SELECT event_id AS eventId, offset_minutes AS o FROM event_reminders
      WHERE user_id = ? ORDER BY event_id, offset_minutes LIMIT 2400`,
  ).all(userId)) {
    if (!out.has(r.eventId)) out.set(r.eventId, []);
    out.get(r.eventId).push(r.o);
  }
  return out;
}

/**
 * The next event that starts after `nowMs`, within 7 calendar days, for Ma's "KÖVETKEZŐ" line —
 * or null. Before a zone is set there are no events (creating one needs the zone).
 */
export function nextEventFor(userId, prefs, nowMs) {
  if (!prefs?.timezone) return null;
  const tz = prefs.timezone;
  const today = calendarKeyFor(nowMs, tz);
  const events = eventsTouching(userId, today, addDaysToKey(today, 7), tz);
  const next = nextOccurrence(events, nowMs, tz, 7);
  if (!next) return null;
  const offsets = eventOffsets(userId, next.eventId);
  return {
    eventId: next.eventId,
    date: next.date,
    title: next.title,
    location: next.location,
    allDay: next.allDay,
    startAt: next.startAt,
    endAt: next.endAt,
    startTime: next.startTime,
    endTime: next.endTime,
    recurring: next.recurrence !== null,
    // B-lifeos-polish (frame ma-1 "Trattoria Toscana · emlékeztető 18:30", S-calendar review DEV-k):
    // the event's reminder offsets (ascending, minutes before the start) and the FIRST one to fire —
    // the largest offset — as an instant and as the wall-clock time in the user's zone.
    reminders: offsets,
    firstReminder: offsets.length ? reminderAt(next.startAt, Math.max(...offsets), tz) : null,
  };
}

function reminderAt(startAt, minutesBefore, tz) {
  const at = startAt - minutesBefore * 60;
  return { minutesBefore, at, time: localTime(at * 1000, tz) };
}

/* ══ scheduled workouts (moved from src/db/tx/lifeos.js so the calendar reads THE same rule) ══ */

/** Every scheduled occurrence in a window, read under the caller's lock and expanded by THE rule. */
export function loadOccurrences(userId, fromDate, days) {
  const planFilter = `client_user_id = ? AND archived_at IS NULL AND status = 'active'
                      AND starts_on IS NOT NULL AND (ends_on IS NULL OR ends_on >= ?)`;
  const plans = stmt(
    `SELECT id, name, cycle_days, starts_on, ends_on FROM workout_plans WHERE ${planFilter}`,
  ).all(userId, fromDate);
  if (!plans.length) return [];
  const planDays = stmt(
    `SELECT d.id, d.plan_id, d.day_index, d.slot, d.name, d.is_rest, d.est_minutes, d.start_time,
            (SELECT COUNT(*) FROM workout_plan_exercises px
               JOIN workout_plan_blocks b ON b.id = px.block_id
              WHERE b.day_id = d.id) AS exercise_count
       FROM workout_plan_days d
      WHERE d.plan_id IN (SELECT id FROM workout_plans WHERE ${planFilter})
      ORDER BY d.day_index, d.slot`,
  ).all(userId, fromDate);
  const exceptions = stmt(
    `SELECT day_id, occurrence_date, action, moved_to_date FROM workout_plan_day_exceptions
      WHERE plan_id IN (SELECT id FROM workout_plans WHERE ${planFilter})`,
  ).all(userId, fromDate);
  const logs = stmt(
    `SELECT plan_day_id, occurrence_date, id, status FROM workout_logs
      WHERE client_user_id = ? AND occurrence_date IS NOT NULL AND occurrence_date >= ?`,
  ).all(userId, fromDate);
  return expandOccurrences({ plans, planDays, exceptions, logs }, fromDate, days);
}

/**
 * Was a workout DONE on the date (the perfect day's "scheduled workout", Ma's tick)? A completed log
 * whose working sets (not warm-ups, not voided) were done to at least `halfPct` (the rule set's
 * workoutHalfPct — the share that starts paying) and at least one of them. Security review LifeOS,
 * attack 07: "any completed log" let an empty freestyle session, started and finished in one second,
 * stand in for the scheduled workout.
 */
export function workoutDoneOn(userId, localDate, halfPct = 50) {
  return stmt(
    `SELECT 1 FROM workout_logs w
      WHERE w.client_user_id = ? AND w.local_date = ? AND w.status = 'completed'
        AND EXISTS (
          SELECT 1 FROM workout_log_sets s
           WHERE s.log_id = w.id AND s.client_user_id = w.client_user_id
             AND s.voided_at IS NULL AND s.set_kind <> 'warmup'
           GROUP BY s.log_id
          HAVING SUM(CASE WHEN s.completed_at IS NOT NULL THEN 1 ELSE 0 END) >= 1
             AND SUM(CASE WHEN s.completed_at IS NOT NULL THEN 1 ELSE 0 END) * 100 >= ? * COUNT(*))
      LIMIT 1`,
  ).get(userId, localDate, halfPct)
    ? 1
    : 0;
}

/** One workout occurrence as Ma and the calendar draw it (the today read's existing shape). */
export function workoutView(o) {
  return {
    planId: o.plan_id,
    planName: o.plan_name,
    dayId: o.day_id,
    dayName: o.day_name,
    isRest: Boolean(o.is_rest),
    estMinutes: o.est_minutes,
    startTime: o.start_time,
    exerciseCount: o.exercise_count,
    logId: o.log_id,
    logStatus: o.log_status,
  };
}
