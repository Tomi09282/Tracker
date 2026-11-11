// src/lifeos/occurrences.js — calendar events expanded into occurrences, and the reminder plan.
// A port of f_app `src/domain/events.ts` (eventsOn) and the reminder half of
// `src/domain/notifications.ts` (planNotifications), as PURE functions of rows already read.
//
// ═══ PURE, AND IMPORTED BY THE WORKER ══════════════════════════════════════════════════════════
//
// No database, no pool. The calendar read, the today read and materializeRemindersTx run INSIDE a
// worker (src/db/tx/lifeos-events.js) and call these functions on rows they read under their own
// transaction; verify-034 calls the same functions on hand-made rows. One implementation, so the
// calendar, the "KÖVETKEZŐ" line on Ma and the reminders cannot disagree about when an event is.
//
// ═══ THE MODEL ═════════════════════════════════════════════════════════════════════════════════
//
// An event is stored as its FIRST occurrence's instants (start_at / end_at, epoch seconds) plus the
// wall clock it was written in (start_local 'YYYY-MM-DDTHH:MM' and tz, the zone it was created in).
// Occurrences are computed at read time, never stored:
//
//   * a TIMED recurring event keeps its LOCAL start time on every occurrence day (f_app: "same local
//     start time on every occurrence day") and its ELAPSED duration. Across 2026-10-25 a weekly
//     18:00 Budapest event moves from 16:00Z to 17:00Z and still lasts an hour. A start time that
//     does not exist on a spring-forward day (02:30 on 2026-03-29) resolves as dates.js instantFor
//     decides (the offset before the gap: 03:30 CEST); one that happens twice (02:30 on 2026-10-25)
//     resolves to the earlier instant.
//   * an ALL-DAY event is a run of local DATES (start date .. start date + span − 1). Its instants
//     are local midnights, so a day that is 23 or 25 hours long is still one day, and the event is
//     on its dates whatever zone the viewer is in (a birthday is on 24 October everywhere).
//   * a timed occurrence is ON every viewer calendar day its [start, end) touches; a zero-length one
//     is on its start day. (f_app also lists an all-day event on the day its exclusive end falls on —
//     its own test pins "ends 00:00 on the 14th" onto the 14th. That is a display defect of an
//     exclusive end, not a rule; here an end is exclusive everywhere.)
//
// Events follow the CALENDAR day (midnight), not the LifeOS logical day (f_app: "events follow the
// wall clock, not the 04:00 logical day") — the same calendar day the workout schedule uses.
import { addDaysToKey, calendarKeyFor, daysBetween, instantFor, localTime } from './dates.js';
import { occursOn as baseOccursOn } from './recurrence.js';

const MINUTE_MS = 60_000;

/** The longest an event (or one occurrence of it) may last: 14 days (plan B, migration 034). */
export const MAX_EVENT_DAYS = 14;
/** A reminder that fired longer ago than this is not delivered any more (plan: window <= 6 h). */
export const REMINDER_WINDOW_MS = 6 * 3600 * 1000;
/** Tasks with a due time remind this long before it (f_app TASK_REMINDER_MINUTES). */
export const TASK_REMINDER_MINUTES = 60;
/** A zero-length event counts as running this long for "has it ended?" (its offset-0 reminder). */
export const POINT_EVENT_GRACE_MS = 30 * MINUTE_MS;

function daysInMonth(year, month1) {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/**
 * Does the rule (anchored at the event's first local date) produce an occurrence on `date`?
 * daily / weekly / monthly are recurrence.js's (the task engine's) own rule; `yearly` is the
 * calendar's addition (calendar-2 draws "Minden évben, október 24-én"): the anchor's month and day,
 * a 29 February clamped to the 28th in a common year, as monthly clamps a 31st.
 */
export function occursOn(rule, anchor, date) {
  if (date < anchor) return false;
  if (rule.type !== 'yearly') return baseOccursOn(rule, anchor, date);
  const [, am, ad] = anchor.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  return m === am && d === Math.min(ad, daysInMonth(y, m));
}

/** The occurrence days of a rule in [from, to], respecting the anchor and the until date. */
export function occurrenceDays(event, from, to) {
  const anchor = event.startLocal.slice(0, 10);
  if (!event.recurrence) return anchor >= from && anchor <= to ? [anchor] : [];
  const start = from < anchor ? anchor : from;
  const end = event.untilDate && event.untilDate < to ? event.untilDate : to;
  const out = [];
  for (let d = start; d <= end; d = addDaysToKey(d, 1)) if (occursOn(event.recurrence, anchor, d)) out.push(d);
  return out;
}

/** How many local days an all-day event spans (1 = a single day). */
export function allDaySpan(event) {
  const first = event.startLocal.slice(0, 10);
  return Math.max(1, daysBetween(first, calendarKeyFor(event.endAt * 1000, event.tz)));
}

/**
 * One occurrence starting on local date `day` (event zone): its instants (ms) and its local dates.
 */
export function instanceOn(event, day) {
  if (event.allDay) {
    const span = allDaySpan(event);
    return {
      day,
      startMs: instantFor(day, '00:00', event.tz).getTime(),
      endMs: instantFor(addDaysToKey(day, span), '00:00', event.tz).getTime(),
      firstDate: day,
      lastDate: addDaysToKey(day, span - 1),
    };
  }
  const time = event.startLocal.slice(11, 16);
  const startMs = event.recurrence ? instantFor(day, time, event.tz).getTime() : event.startAt * 1000;
  const endMs = startMs + (event.endAt - event.startAt) * 1000;
  return { day, startMs, endMs, firstDate: null, lastDate: null };
}

/**
 * Every occurrence of `event` that can touch the local window [from, to] (keys in the VIEWER's
 * zone). The scan starts MAX_EVENT_DAYS + 2 days early: an occurrence that began two weeks ago can
 * still be running, and a zone difference moves a day by at most one.
 */
export function instancesTouching(event, from, to) {
  const days = occurrenceDays(event, addDaysToKey(from, -(MAX_EVENT_DAYS + 2)), addDaysToKey(to, 1));
  return days.map((d) => instanceOn(event, d));
}

/** The viewer calendar days an occurrence is on, inclusive, ascending (bounded by MAX_EVENT_DAYS). */
export function viewerDays(event, inst, viewerTz) {
  if (event.allDay) return { first: inst.firstDate, last: inst.lastDate };
  const first = calendarKeyFor(inst.startMs, viewerTz);
  const last = inst.endMs > inst.startMs ? calendarKeyFor(inst.endMs - 1, viewerTz) : first;
  return { first, last };
}

/** The shape every screen reads: one occurrence as drawn on one calendar day. */
export function occurrenceView(event, inst, date, viewerTz, span) {
  const startTime = event.allDay ? null : localTime(inst.startMs, viewerTz);
  const endTime = event.allDay || inst.endMs === inst.startMs ? null : localTime(inst.endMs, viewerTz);
  return {
    eventId: event.id,
    date,
    occurrenceDate: inst.day,
    title: event.title,
    location: event.location,
    allDay: event.allDay,
    startAt: Math.floor(inst.startMs / 1000),
    endAt: Math.floor(inst.endMs / 1000),
    startTime,
    endTime,
    durationMinutes: event.allDay ? null : Math.round((inst.endMs - inst.startMs) / MINUTE_MS),
    startsBefore: span.first < date,
    endsAfter: span.last > date,
    recurrence: event.recurrence,
    untilDate: event.untilDate,
  };
}

/** f_app's order: all-day first, then by start, then by id (stable across reads). */
export function compareOccurrences(a, b) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.startAt - b.startAt || a.eventId - b.eventId;
}

/**
 * The calendar: for every viewer day in [from, from + days − 1], the occurrences on it.
 * Returns a Map date -> occurrence views (sorted).
 */
export function expandCalendar(events, from, days, viewerTz) {
  const to = addDaysToKey(from, days - 1);
  const byDay = new Map();
  for (let i = 0; i < days; i += 1) byDay.set(addDaysToKey(from, i), []);
  for (const ev of events) {
    for (const inst of instancesTouching(ev, from, to)) {
      const span = viewerDays(ev, inst, viewerTz);
      const first = span.first < from ? from : span.first;
      const last = span.last > to ? to : span.last;
      for (let d = first; d <= last; d = addDaysToKey(d, 1)) byDay.get(d)?.push(occurrenceView(ev, inst, d, viewerTz, span));
    }
  }
  for (const list of byDay.values()) list.sort(compareOccurrences);
  return byDay;
}

/**
 * The next occurrence that STARTS after `nowMs`, within `horizonDays` calendar days (Ma's
 * "KÖVETKEZŐ" line). An event already running is not "next". Null when there is none.
 */
export function nextOccurrence(events, nowMs, viewerTz, horizonDays = 7) {
  const from = calendarKeyFor(nowMs, viewerTz);
  const to = addDaysToKey(from, horizonDays);
  let best = null;
  for (const ev of events) {
    for (const inst of instancesTouching(ev, from, to)) {
      if (inst.startMs <= nowMs) continue;
      const span = viewerDays(ev, inst, viewerTz);
      if (span.first > to) continue;
      const view = occurrenceView(ev, inst, span.first, viewerTz, span);
      if (!best || view.startAt < best.startAt || (view.startAt === best.startAt && compareOccurrences(view, best) < 0)) best = view;
    }
  }
  return best;
}

/** The first occurrence of an event that has not ended at `nowMs` (the detail page's "next"). */
export function upcomingInstance(event, nowMs, viewerTz) {
  const live = (i) => i.endMs > nowMs || (i.endMs === i.startMs && i.startMs >= nowMs);
  const anchor = event.startLocal.slice(0, 10);
  if (!event.recurrence) {
    const inst = instanceOn(event, anchor);
    return live(inst) ? inst : null;
  }
  const from = calendarKeyFor(nowMs, viewerTz);
  // Search a year ahead in 60-day pages: a yearly rule needs up to 366 days, everything else less.
  for (let page = 0; page < 7; page += 1) {
    const a = addDaysToKey(from, page * 60);
    if (event.untilDate && a > event.untilDate) return null;
    const hit = instancesTouching(event, a, addDaysToKey(a, 59)).find(live);
    if (hit) return hit;
  }
  return null;
}

/**
 * Occurrences left from local `fromDate` through the until date ("még 9 alkalom"). Null for a
 * one-off event or an open-ended rule (nothing to count down to). Bounded: until <= anchor + 10 y.
 */
export function remainingOccurrences(event, fromDate) {
  if (!event.recurrence || !event.untilDate) return null;
  return occurrenceDays(event, fromDate, event.untilDate).length;
}

/* ══ the reminder plan (materializeRemindersTx calls these under its write lock) ═════════════ */

/**
 * Which reminder offsets of an event's occurrences are DUE at `nowMs`: fired within the last
 * REMINDER_WINDOW_MS (fire = start − offset) and the occurrence has not ended (a zero-length event
 * counts as running POINT_EVENT_GRACE_MS). Of the offsets due for ONE occurrence only the latest
 * (the smallest offset) is delivered; the others are recorded as superseded, so opening the app
 * five minutes before a meeting shows "15 perc" once, not "1 nap", "1 óra" and "15 perc" at once.
 */
export function dueEventReminders(event, offsets, nowMs, viewerTz) {
  if (!offsets.length) return [];
  const maxOffsetMs = Math.max(...offsets) * MINUTE_MS;
  const from = calendarKeyFor(nowMs - REMINDER_WINDOW_MS, viewerTz);
  const to = calendarKeyFor(nowMs + maxOffsetMs, viewerTz);
  const out = [];
  for (const inst of instancesTouching(event, from, to)) {
    const effectiveEnd = inst.endMs > inst.startMs ? inst.endMs : inst.startMs + POINT_EVENT_GRACE_MS;
    if (effectiveEnd <= nowMs) continue;
    const due = offsets
      .map((offset) => ({ offset, fireMs: inst.startMs - offset * MINUTE_MS }))
      .filter((r) => r.fireMs <= nowMs && r.fireMs > nowMs - REMINDER_WINDOW_MS)
      .sort((a, b) => a.offset - b.offset);
    due.forEach((r, i) => out.push({ inst, offset: r.offset, fireMs: r.fireMs, deliver: i === 0 }));
  }
  return out;
}

/** The instant of a wall-clock time on a LOGICAL day: before the day start it is the next date. */
export function logicalInstant(dayKey, time, timeZone, dayStartHour) {
  const hour = Number(time.slice(0, 2));
  const calendarDay = hour < dayStartHour ? addDaysToKey(dayKey, 1) : dayKey;
  return instantFor(calendarDay, time, timeZone).getTime();
}

/** Is a fire instant inside the delivery window at `nowMs`? */
export function inWindow(fireMs, nowMs) {
  return fireMs <= nowMs && fireMs > nowMs - REMINDER_WINDOW_MS;
}

/** Event body line: "10:00–10:45 · Klinika" — numbers and the user's own words, no copy. */
export function eventReminderBody(event, inst, viewerTz) {
  const parts = [];
  if (!event.allDay) {
    const s = localTime(inst.startMs, viewerTz);
    parts.push(inst.endMs > inst.startMs ? `${s}–${localTime(inst.endMs, viewerTz)}` : s);
  }
  if (event.location) parts.push(event.location);
  const body = parts.join(' · ');
  return body ? body.slice(0, 300) : null;
}

