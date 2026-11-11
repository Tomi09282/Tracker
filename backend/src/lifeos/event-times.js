// src/lifeos/event-times.js — the calendar's pure core: the limits, the stored repeat rule, and the
// one conversion between what a person types (a date, a start and an end time, in their own zone)
// and what is stored (instants plus the wall clock they were written in). Migration 034.
//
// ═══ WORKER SIDE, AND NO ZOD ═══════════════════════════════════════════════════════════════════
//
// The worker transactions (src/db/tx/lifeos-events.js, src/db/lifeos-calendar.js) import THIS file;
// the request schemas live in ./events.js, which the routes import (and which re-exports this file).
// The split is measured, not taste: loading events.js's zod schemas into every pool worker made the
// pool's teardown segfault on Windows (exit 139 in pool.destroy(), 4-8 of 10 runs of a one-query
// script against a migrated database, 0 of 10 without them; package B-calendar bisected it to the
// schema objects, not to any one construct). parseEventRecurrence below is therefore hand-written,
// and verify-034 proves it accepts and refuses exactly what eventRecurrenceSchema does.
//
// No client ever sends an instant: the client says "21 October, 16:00-16:45" and the server decides
// what instant that is in the user's zone — so a forged offset, a wrong clock or a DST guess on the
// client cannot misplace an event, and both DST days resolve by dates.js instantFor's one rule.
import { addDaysToKey, calendarKeyFor, daysBetween, instantFor, localTime } from './dates.js';
import { MAX_EVENT_DAYS } from './occurrences.js';

export const EVENT_LIMITS = Object.freeze({
  /** Events one account may keep (a CHECK cannot count rows; the transaction refuses the 501st). */
  events: 500,
  /** Reminders per event: the form offers four (Kezdéskor / 15 perc / 1 óra / 1 nap). */
  reminders: 4,
  /** The furthest reminder offset: one week before the start, in minutes. */
  maxOffsetMinutes: 10_080,
  /** How far from today an event may start, and how far after its start a rule may run: ~10 years. */
  horizonDays: 3_660,
});

/** The time fields that only mean something together; a PATCH that names one re-resolves all. */
export const TIME_FIELDS = Object.freeze(['allDay', 'date', 'startTime', 'endTime', 'endDate']);

/** Canonical key order, so equal rules are equal strings (as recurrence.js serializeRecurrence). */
export function serializeEventRecurrence(rule) {
  if (!rule) return null;
  switch (rule.type) {
    case 'daily':
      return JSON.stringify(rule.interval === undefined ? { type: 'daily' } : { type: 'daily', interval: rule.interval });
    case 'weekly':
      return JSON.stringify({ type: 'weekly', weekdayMask: rule.weekdayMask });
    case 'monthly':
      return JSON.stringify({ type: 'monthly', day: rule.day });
    case 'yearly':
      return JSON.stringify({ type: 'yearly' });
    default:
      return null;
  }
}

const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const onlyKeys = (o, allowed) => Object.keys(o).every((k) => allowed.includes(k));

/**
 * A stored rule the engine cannot read is null (the event then occurs once, on its first day).
 * Accepts exactly what events.js eventRecurrenceSchema accepts (verify-034 compares the two).
 */
export function parseEventRecurrence(json) {
  if (!json) return null;
  let r;
  try {
    r = JSON.parse(json);
  } catch {
    return null;
  }
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  switch (r.type) {
    case 'daily':
      if (!onlyKeys(r, ['type', 'interval'])) return null;
      if (r.interval === undefined) return { type: 'daily' };
      return intIn(r.interval, 1, 30) ? { type: 'daily', interval: r.interval } : null;
    case 'weekly':
      return onlyKeys(r, ['type', 'weekdayMask']) && intIn(r.weekdayMask, 1, 127) ? { type: 'weekly', weekdayMask: r.weekdayMask } : null;
    case 'monthly':
      return onlyKeys(r, ['type', 'day']) && intIn(r.day, 1, 31) ? { type: 'monthly', day: r.day } : null;
    case 'yearly':
      return onlyKeys(r, ['type']) ? { type: 'yearly' } : null;
    default:
      return null;
  }
}

/**
 * Typed fields -> stored instants, in `timeZone`. Returns null when the combination is impossible
 * (an end before the start on a named end date, an all-day run that ends before it starts, or
 * anything longer than MAX_EVENT_DAYS).
 *
 *   all-day  date .. endDate (inclusive, default date): local midnight to the midnight after the
 *            last day. A 23- or 25-hour DST day is still one day.
 *   timed    date + startTime; the end is endDate + endTime, or — with no endDate — endTime on the
 *            same date, and an end time BEFORE the start means after midnight (22:00-01:00 is a
 *            three-hour evening, not an error). No endTime = a zero-length event (f_app endAt null).
 */
export function resolveEventTimes({ allDay, date, startTime, endTime, endDate }, timeZone) {
  if (allDay) {
    const last = endDate ?? date;
    if (last < date || daysBetween(date, last) + 1 > MAX_EVENT_DAYS) return null;
    const startMs = instantFor(date, '00:00', timeZone).getTime();
    const endMs = instantFor(addDaysToKey(last, 1), '00:00', timeZone).getTime();
    return { startAt: Math.floor(startMs / 1000), endAt: Math.floor(endMs / 1000), startLocal: `${date}T00:00` };
  }
  if (!startTime) return null;
  const startMs = instantFor(date, startTime, timeZone).getTime();
  let endMs = startMs;
  if (endTime) {
    if (endDate) {
      endMs = instantFor(endDate, endTime, timeZone).getTime();
      if (endMs < startMs) return null;
    } else {
      endMs = instantFor(date, endTime, timeZone).getTime();
      if (endMs < startMs) endMs = instantFor(addDaysToKey(date, 1), endTime, timeZone).getTime();
    }
  } else if (endDate && endDate !== date) {
    return null; // an end date with no end time says nothing about when it ends
  }
  if (endMs - startMs > MAX_EVENT_DAYS * 86_400_000) return null;
  return { startAt: Math.floor(startMs / 1000), endAt: Math.floor(endMs / 1000), startLocal: `${date}T${startTime}` };
}

/** Stored row -> the typed fields again, in the event's own zone (PATCH merges over these). */
export function localFields(row) {
  const date = row.startLocal.slice(0, 10);
  if (row.allDay) {
    return {
      allDay: true,
      date,
      startTime: null,
      endTime: null,
      endDate: addDaysToKey(calendarKeyFor(row.endAt * 1000, row.tz), -1),
    };
  }
  const zeroLength = row.endAt === row.startAt;
  return {
    allDay: false,
    date,
    startTime: row.startLocal.slice(11, 16),
    endTime: zeroLength ? null : localTime(row.endAt * 1000, row.tz),
    endDate: zeroLength ? date : calendarKeyFor(row.endAt * 1000, row.tz),
  };
}

/**
 * A PATCH's time fields merged over the stored event, then resolved like a create. A move that
 * names no end keeps the event's LENGTH (an hour-long meeting moved from 10:00 to 11:00 still ends
 * an hour later; an all-day run keeps its number of days). Returns null when the result is
 * impossible, exactly as resolveEventTimes does.
 */
export function mergeEventTimes(row, patch, timeZone) {
  const cur = localFields(row);
  const allDay = patch.allDay ?? cur.allDay;
  const date = patch.date ?? cur.date;
  const namesEnd = patch.endTime !== undefined || patch.endDate !== undefined;

  if (allDay) {
    if (patch.startTime !== undefined || (patch.endTime ?? null) !== null) return null;
    let endDate = patch.endDate ?? null;
    if (endDate === null) endDate = cur.allDay && patch.endDate === undefined ? addDaysToKey(date, daysBetween(cur.date, cur.endDate)) : date;
    return resolveEventTimes({ allDay: true, date, endDate }, timeZone);
  }

  const startTime = patch.startTime ?? cur.startTime;
  if (!startTime) return null; // all-day -> timed needs a start time
  if (namesEnd || cur.allDay) {
    return resolveEventTimes(
      {
        allDay: false,
        date,
        startTime,
        endTime: patch.endTime !== undefined ? patch.endTime : cur.allDay ? null : cur.endTime,
        endDate: patch.endDate !== undefined ? patch.endDate : patch.endTime !== undefined || cur.allDay ? null : cur.endDate,
      },
      timeZone,
    );
  }
  const resolved = resolveEventTimes({ allDay: false, date, startTime, endTime: null, endDate: null }, timeZone);
  if (!resolved) return null;
  return { ...resolved, endAt: resolved.startAt + (row.endAt - row.startAt) };
}
