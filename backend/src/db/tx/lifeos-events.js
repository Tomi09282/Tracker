// src/db/tx/lifeos-events.js — the calendar's transactions and reads (migration 034).
//
// Runs INSIDE a Piscina worker (re-exported by worker.js; every `export function` is a task the
// facade may name). The rules of src/db/tx/lifeos.js hold here too: one logical read or write = one
// worker call (an IMMEDIATE transaction for a write); ADR-0005 (every refusal before the first
// write); ownership in the SQL (`WHERE id = ? AND user_id = ?`, another account's event is a 404);
// "now" and the zone are the worker's own (the clock, user_prefs) — never a value from a request.
//
// No coin moves here: the calendar pays nothing. materializeRemindersTx is the one write a READ
// triggers (GET /lifeos/today, the bell's unread poll): it turns due reminders into
// self-notifications exactly once, deduplicated by reminder_deliveries' unique key.
import { getDb, stmt, rethrow } from '../conn.js';
import { isSettledDay, readStartedPrefs, readRules } from '../lifeos-ledger.js';
import { logRow, taskRow, taskView } from '../lifeos-items.js';
import {
  countEvents,
  eventById,
  eventOffsets,
  eventsTouching,
  loadOccurrences,
  offsetsByEvent,
  workoutView,
} from '../lifeos-calendar.js';
import { addDaysToKey, calendarKeyFor, dayKeyFor, daysBetween } from '../../lifeos/dates.js';
import {
  EVENT_LIMITS,
  TIME_FIELDS,
  localFields,
  mergeEventTimes,
  resolveEventTimes,
  serializeEventRecurrence,
} from '../../lifeos/event-times.js';
import { isScheduledOn } from '../../lifeos/habits.js';
import {
  TASK_REMINDER_MINUTES,
  dueEventReminders,
  eventReminderBody,
  expandCalendar,
  inWindow,
  logicalInstant,
  occurrenceView,
  remainingOccurrences,
  upcomingInstance,
  viewerDays,
} from '../../lifeos/occurrences.js';
import { taskDueInstant } from '../../lifeos/tasks.js';

/** At most this many notifications per materialize call; the rest arrive on the next one. */
const MAX_DELIVERIES_PER_RUN = 20;
/** Delivery rows older than this are pruned: the dedupe only matters inside the 6 h window. */
const DELIVERY_RETENTION_S = 14 * 86400;

function started(prefs) {
  return Boolean(prefs?.timezone && prefs.startedOn);
}

/** The event as the detail page and every write answer draw it. */
function eventView(userId, ev, nowMs, viewerTz, on = null) {
  const local = localFields(ev);
  const today = calendarKeyFor(nowMs, viewerTz);
  const next = upcomingInstance(ev, nowMs, viewerTz);
  let occurrence = null;
  if (on) occurrence = expandCalendar([ev], on, 1, viewerTz).get(on)?.[0] ?? null;
  return {
    id: ev.id,
    title: ev.title,
    notes: ev.notes,
    location: ev.location,
    allDay: ev.allDay,
    date: local.date,
    startTime: local.startTime,
    endDate: local.endDate,
    endTime: local.endTime,
    durationMinutes: ev.allDay ? null : Math.round((ev.endAt - ev.startAt) / 60),
    timezone: ev.tz,
    recurrence: ev.recurrence,
    untilDate: ev.untilDate,
    reminders: eventOffsets(userId, ev.id),
    startAt: ev.startAt,
    endAt: ev.endAt,
    next: next ? occurrenceView(ev, next, viewerDays(ev, next, viewerTz).first, viewerTz, viewerDays(ev, next, viewerTz)) : null,
    remaining: remainingOccurrences(ev, today),
    occurrence,
    createdAt: ev.createdAt,
    updatedAt: ev.updatedAt,
  };
}

/** The bounds a client may not leave: a start within ~10 years of today, a rule within ~10 years of its start. */
function outOfRange({ date, untilDate }, today) {
  if (Math.abs(daysBetween(today, date)) > EVENT_LIMITS.horizonDays) return true;
  if (untilDate && daysBetween(date, untilDate) > EVENT_LIMITS.horizonDays) return true;
  return false;
}

/* ══ reads ═══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * GET /calendar: for every calendar day of [from, from + days − 1] the event occurrences, the
 * scheduled workouts and the tasks (due that day, completed that day, overdue on today), plus the
 * undated tasks once. One read, one snapshot. `from` defaults to the calendar today.
 */
export function calendarQuery({ userId, from = null, days = 7 }) {
  try {
    const prefs = readStartedPrefs(userId);
    if (!prefs) return null;
    const now = Date.now();
    const tz = prefs.timezone ?? 'UTC';
    const today = calendarKeyFor(now, tz);
    const start = from ?? today;
    if (Math.abs(daysBetween(today, start)) > EVENT_LIMITS.horizonDays) return { outcome: 'invalid' };
    const end = addDaysToKey(start, days - 1);
    const { rules } = readRules();
    const isStarted = started(prefs);

    const events = isStarted ? eventsTouching(userId, start, end, tz) : [];
    const byDay = expandCalendar(events, start, days, tz);
    const workouts = loadOccurrences(userId, start, days);

    // Tasks are LOGICAL days (their due_on), drawn on the calendar day of the same date.
    const logicalToday = isStarted ? dayKeyFor(now, tz, prefs.dayStartHour) : null;
    const taskIds = isStarted
      ? stmt(
          `SELECT id FROM tasks
            WHERE user_id = ? AND deleted_at IS NULL AND recurrence IS NULL
              AND ((completed_at IS NULL AND due_on >= ? AND due_on <= ?)
                OR (completed_on >= ? AND completed_on <= ?)
                OR (completed_at IS NULL AND due_on IS NULL)
                OR (completed_at IS NULL AND due_on < ?))
            ORDER BY due_on, due_time, id
            LIMIT 1000`,
        ).all(userId, start, end, start, end, logicalToday)
      : [];
    const tasks = taskIds.map((r) => taskRow(userId, r.id)).filter(Boolean);
    const view = (t) => taskView(t, prefs, rules, now);
    const byPriority = (a, b) => b.priority - a.priority || a.id - b.id;
    const timeKey = (t) => t.dueTime ?? '99:99';
    const byTime = (a, b) => (timeKey(a) < timeKey(b) ? -1 : timeKey(a) > timeKey(b) ? 1 : byPriority(a, b));

    const dayList = [];
    for (let i = 0; i < days; i += 1) {
      const date = addDaysToKey(start, i);
      const due = tasks.filter((t) => !t.completedAt && t.dueOn === date).sort(byTime).map(view);
      const completed = tasks.filter((t) => t.completedOn === date).map(view);
      const overdue = date === logicalToday
        ? tasks.filter((t) => !t.completedAt && t.dueOn && t.dueOn < date).sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : byPriority(a, b))).map(view)
        : [];
      const dayWorkouts = workouts.filter((o) => o.date === date).map(workoutView);
      const dayEvents = byDay.get(date) ?? [];
      dayList.push({
        date,
        events: dayEvents,
        workouts: dayWorkouts,
        tasks: { due, completed, overdue },
        // The DayRail dot: "something is on that day" (README open question 2) — an event, a
        // workout that is not a rest day, or a task due / done that day.
        busy: dayEvents.length > 0 || dayWorkouts.some((w) => !w.isRest) || due.length > 0 || completed.length > 0,
      });
    }

    return {
      outcome: 'ok',
      calendar: {
        started: isStarted,
        timezone: prefs.timezone,
        today,
        logicalToday,
        from: start,
        to: end,
        days: dayList,
        anytime: tasks.filter((t) => !t.completedAt && !t.dueOn).sort(byPriority).map(view),
        workoutPointsFull: rules.workoutComplete,
      },
    };
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /events/:id (optionally the occurrence on a calendar day). */
export function eventQuery({ userId, eventId, on = null }) {
  try {
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return null;
    const ev = eventById(userId, eventId);
    return ev ? eventView(userId, ev, Date.now(), prefs.timezone, on) : null;
  } catch (err) {
    return rethrow(err);
  }
}

/* ══ createEventTx ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * A new event (Naptár "+ Esemény", and the capture's Esemény half). Refuses before writing: no
 * zone yet (409 TIMEZONE_REQUIRED), an impossible or out-of-range time (400), the 501st event
 * (409 LIMIT_REACHED). The instants are resolved HERE, in the zone read in this transaction.
 * A replay of the same clientKey answers the event it already made, whatever the body.
 */
export function createEventTx({ userId, input, clientKey }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readStartedPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const tz = prefs.timezone;
    const now = Date.now();

    current = 'SELECT the replay';
    const prior = stmt('SELECT id FROM events WHERE user_id = ? AND client_key = ?').get(userId, clientKey);
    if (prior) return { outcome: 'replayed', event: eventView(userId, eventById(userId, prior.id), now, tz) };

    if (outOfRange(input, calendarKeyFor(now, tz))) return { outcome: 'invalid' };
    const times = resolveEventTimes(
      { allDay: input.allDay ?? false, date: input.date, startTime: input.startTime, endTime: input.endTime ?? null, endDate: input.endDate ?? null },
      tz,
    );
    if (!times) return { outcome: 'invalid' };
    current = 'SELECT the cap';
    if (countEvents(userId) >= EVENT_LIMITS.events) return { outcome: 'cap', limit: EVENT_LIMITS.events };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT events';
    const ins = stmt(
      `INSERT INTO events (user_id, title, notes, location, all_day, start_at, end_at, start_local, tz,
                           recurrence_json, until_date, client_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      input.title,
      input.notes ?? null,
      input.location ?? null,
      input.allDay ? 1 : 0,
      times.startAt,
      times.endAt,
      times.startLocal,
      tz,
      serializeEventRecurrence(input.recurrence ?? null),
      input.recurrence ? input.untilDate ?? null : null,
      clientKey,
    );
    const id = Number(ins.lastInsertRowid);
    current = 'INSERT event_reminders';
    insertReminders(userId, id, input.reminders ?? []);
    return { outcome: 'created', event: eventView(userId, eventById(userId, id), now, tz) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/** The whole reminder set, sorted (the schema already refused repeats and a fifth). */
function insertReminders(userId, eventId, offsets) {
  const ins = stmt('INSERT INTO event_reminders (event_id, user_id, offset_minutes) VALUES (?, ?, ?)');
  for (const o of [...offsets].sort((a, b) => a - b)) ins.run(eventId, userId, o);
}

/* ══ updateEventTx ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * Edit an event (f_app updateEvent): any field; the time fields are merged over the stored ones and
 * resolved again in the user's CURRENT zone (an edit re-anchors the event where the user is now);
 * a move that names no end keeps the length. `reminders`, when sent, replaces the set. Dropping the
 * repeat rule drops its until date. Every occurrence moves with the event (single-occurrence edits
 * are deferred, plan risk 6).
 */
export function updateEventTx({ userId, eventId, patch }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return { outcome: 'timezone_required' };
    current = 'SELECT the event (owned)';
    const ev = eventById(userId, eventId);
    if (!ev) return { outcome: 'missing' };
    const tz = prefs.timezone;
    const now = Date.now();

    const touchesTime = TIME_FIELDS.some((k) => patch[k] !== undefined);
    const times = touchesTime ? mergeEventTimes(ev, patch, tz) : { startAt: ev.startAt, endAt: ev.endAt, startLocal: ev.startLocal };
    if (!times) return { outcome: 'invalid' };
    const zone = touchesTime ? tz : ev.tz;
    const recurrenceJson = patch.recurrence !== undefined ? serializeEventRecurrence(patch.recurrence) : ev.recurrenceJson;
    let untilDate = patch.untilDate !== undefined ? patch.untilDate : ev.untilDate;
    if (!recurrenceJson) {
      if (patch.untilDate) return { outcome: 'invalid' }; // an until date needs a rule
      untilDate = null;
    }
    const date = times.startLocal.slice(0, 10);
    if (untilDate && untilDate < date) return { outcome: 'invalid' };
    if (touchesTime && outOfRange({ date, untilDate }, calendarKeyFor(now, tz))) return { outcome: 'invalid' };
    if (!touchesTime && untilDate && daysBetween(date, untilDate) > EVENT_LIMITS.horizonDays) return { outcome: 'invalid' };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE events';
    const upd = stmt(
      `UPDATE events
          SET title = ?, notes = ?, location = ?, all_day = ?, start_at = ?, end_at = ?, start_local = ?,
              tz = ?, recurrence_json = ?, until_date = ?, updated_at = unixepoch()
        WHERE id = ? AND user_id = ?`,
    ).run(
      patch.title ?? ev.title,
      patch.notes !== undefined ? patch.notes : ev.notes,
      patch.location !== undefined ? patch.location : ev.location,
      (patch.allDay ?? ev.allDay) ? 1 : 0,
      times.startAt,
      times.endAt,
      times.startLocal,
      zone,
      recurrenceJson,
      untilDate,
      eventId,
      userId,
    );
    if (upd.changes === 0) return { outcome: 'missing' };
    if (patch.reminders !== undefined) {
      current = 'replace event_reminders';
      stmt('DELETE FROM event_reminders WHERE event_id = ? AND user_id = ?').run(eventId, userId);
      insertReminders(userId, eventId, patch.reminders);
    }
    return { outcome: 'applied', event: eventView(userId, eventById(userId, eventId), now, tz) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ deleteEventTx ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * Delete an event and every occurrence of it ("Esemény törlése"). A hard delete: an event carries
 * no coins and no history anyone else reads; its reminders and delivery records go with it (FK
 * cascade), the notifications already delivered stay in the inbox. A second delete is a 404.
 */
export function deleteEventTx({ userId, eventId }) {
  const conn = getDb();
  let current = null;
  const tx = conn.transaction(() => {
    current = 'DELETE events (owned)';
    const del = stmt('DELETE FROM events WHERE id = ? AND user_id = ?').run(eventId, userId);
    if (del.changes === 0) return { outcome: 'missing' };
    return { outcome: 'applied' };
  });
  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ materializeRemindersTx ══════════════════════════════════════════════════════════════════════ */

/** The dedupe probe: has this (subject, occurrence, offset) been delivered (or superseded)? */
function delivered(userId, kind, subjectId, occurrenceAt, offset) {
  return Boolean(
    stmt(
      `SELECT 1 FROM reminder_deliveries
        WHERE user_id = ? AND kind = ? AND coalesce(event_id, habit_id, task_id) = ?
          AND occurrence_at = ? AND offset_minutes = ?`,
    ).get(userId, kind, subjectId, occurrenceAt, offset),
  );
}

/**
 * Turn every DUE reminder into a self-notification, once (plan "Reminders without push"):
 *
 *   * event offsets — fire = occurrence start − offset, fired within the last 6 h, the occurrence
 *     not over; of several offsets due for one occurrence only the latest is delivered, the others
 *     are recorded as superseded (src/lifeos/occurrences.js dueEventReminders);
 *   * habit reminder times — a live GOOD habit scheduled on the logical day (today, or yesterday
 *     while it has not settled), not done or skipped, its reminder time fired within the last 6 h;
 *   * tasks due within 60 minutes — an open, timed task whose due instant is still ahead and is at
 *     most an hour away (fire = due − 60 min, within the window).
 *
 * The dedupe is the probe above under this transaction's write lock, with the unique index as the
 * backstop (a duplicate would throw and roll the whole call back, so nothing is sent twice). The
 * notification text is the user's own words and clock figures only — the title is the item's name,
 * the body its time (and place) — so the server writes no copy in any language.
 */
export function materializeRemindersTx({ userId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return { outcome: 'skipped', delivered: 0 };
    const tz = prefs.timezone;
    const now = Date.now();
    const nowS = Math.floor(now / 1000);

    // ── plan: read everything, decide everything, before the first write ─────────────────────────
    current = 'SELECT the due reminders';
    const plan = [];
    const offsets = offsetsByEvent(userId);
    if (offsets.size) {
      const from = calendarKeyFor(now - 7 * 3600 * 1000, tz);
      const to = calendarKeyFor(now + (EVENT_LIMITS.maxOffsetMinutes + 60) * 60_000, tz);
      for (const ev of eventsTouching(userId, from, to, tz)) {
        const list = offsets.get(ev.id);
        if (!list) continue;
        for (const r of dueEventReminders(ev, list, now, tz)) {
          const occurrenceAt = Math.floor(r.inst.startMs / 1000);
          if (delivered(userId, 'event', ev.id, occurrenceAt, r.offset)) continue;
          plan.push({
            kind: 'event',
            subjectId: ev.id,
            occurrenceAt,
            offset: r.offset,
            notify: r.deliver
              ? { type: 'lifeos.event', title: ev.title, body: eventReminderBody(ev, r.inst, tz), link: `/calendar/events/${ev.id}` }
              : null,
          });
        }
      }
    }

    const today = dayKeyFor(now, tz, prefs.dayStartHour);
    const habits = stmt(
      `SELECT id, name, schedule_type AS scheduleType, weekday_mask AS weekdayMask, reminder_time AS reminderTime,
              started_on AS startedOn
         FROM habits
        WHERE user_id = ? AND archived_at IS NULL AND kind = 'good' AND reminder_time IS NOT NULL
        ORDER BY sort_order, id`,
    ).all(userId);
    for (const day of [addDaysToKey(today, -1), today]) {
      if (day < prefs.startedOn || isSettledDay(userId, day)) continue;
      for (const h of habits) {
        if (h.startedOn > day || !isScheduledOn(h, day)) continue;
        const fire = logicalInstant(day, h.reminderTime, tz, prefs.dayStartHour);
        if (!inWindow(fire, now)) continue;
        const log = logRow(userId, h.id, day);
        if (log && (log.status === 'done' || log.status === 'skipped')) continue;
        const occurrenceAt = Math.floor(fire / 1000);
        if (delivered(userId, 'habit', h.id, occurrenceAt, 0)) continue;
        plan.push({
          kind: 'habit',
          subjectId: h.id,
          occurrenceAt,
          offset: 0,
          notify: { type: 'lifeos.habit', title: h.name, body: h.reminderTime, link: `/habits/${h.id}` },
        });
      }
    }

    const tasks = stmt(
      `SELECT id, title, due_on AS dueOn, due_time AS dueTime FROM tasks
        WHERE user_id = ? AND deleted_at IS NULL AND completed_at IS NULL AND recurrence IS NULL
          AND due_time IS NOT NULL AND due_on >= ? AND due_on <= ?
        ORDER BY due_on, due_time, id
        LIMIT 300`,
    ).all(userId, addDaysToKey(today, -1), addDaysToKey(today, 1));
    for (const t of tasks) {
      const due = taskDueInstant(t, tz, prefs.dayStartHour);
      if (due === null || due <= now) continue;
      const fire = due - TASK_REMINDER_MINUTES * 60_000;
      if (!inWindow(fire, now)) continue;
      const occurrenceAt = Math.floor(due / 1000);
      if (delivered(userId, 'task', t.id, occurrenceAt, TASK_REMINDER_MINUTES)) continue;
      plan.push({
        kind: 'task',
        subjectId: t.id,
        occurrenceAt,
        offset: TASK_REMINDER_MINUTES,
        notify: { type: 'lifeos.task', title: t.title, body: t.dueTime, link: '/tasks' },
      });
    }

    // Oldest first; at most MAX_DELIVERIES_PER_RUN notifications, the rest wait for the next call.
    plan.sort((a, b) => a.occurrenceAt - a.offset * 60 - (b.occurrenceAt - b.offset * 60) || a.subjectId - b.subjectId);
    const batch = [];
    let notifications = 0;
    for (const p of plan) {
      if (p.notify && notifications >= MAX_DELIVERIES_PER_RUN) continue;
      if (p.notify) notifications += 1;
      batch.push(p);
    }

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'DELETE expired reminder_deliveries';
    stmt('DELETE FROM reminder_deliveries WHERE user_id = ? AND fire_at < ?').run(userId, nowS - DELIVERY_RETENTION_S);
    const notify = stmt(
      `INSERT INTO notifications (user_id, coach_client_id, type, title, body, link_path)
       VALUES (?, NULL, ?, ?, ?, ?)`,
    );
    const record = stmt(
      `INSERT INTO reminder_deliveries
         (user_id, kind, event_id, habit_id, task_id, occurrence_at, offset_minutes, fire_at, notification_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of batch) {
      current = `INSERT the ${p.kind} reminder`;
      const nid = p.notify
        ? Number(notify.run(userId, p.notify.type, p.notify.title.slice(0, 120), p.notify.body, p.notify.link).lastInsertRowid)
        : null;
      record.run(
        userId,
        p.kind,
        p.kind === 'event' ? p.subjectId : null,
        p.kind === 'habit' ? p.subjectId : null,
        p.kind === 'task' ? p.subjectId : null,
        p.occurrenceAt,
        p.offset,
        p.occurrenceAt - p.offset * 60,
        nid,
      );
    }
    return { outcome: 'ok', delivered: notifications, superseded: batch.length - notifications };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}
