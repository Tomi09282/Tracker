// src/lifeos/recurrence.js — RRULE-light. A port of f_app `src/domain/recurrence.ts`.
//
// The three patterns a personal organiser needs, stored as JSON in tasks.recurrence:
//
//   { type: 'daily',   interval?: 1..30 }      every N days from the anchor (default 1)
//   { type: 'weekly',  weekdayMask: 1..127 }   bit0 = Monday … bit6 = Sunday
//   { type: 'monthly', day: 1..31 }            clamped to the month's length
//
// The anchor is the template's due day; nothing occurs before it. PURE: imported by the worker
// (the materializer) and by the routes (the zod schema), so the two cannot disagree.
import { z } from 'zod';
import { addDaysToKey, daysBetween, dayRange, isBitSet, weekdayIndex } from './dates.js';

/** The request shape. `.strict()`: an unknown key in a rule is a 400, never ignored. */
export const recurrenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily'), interval: z.number().int().min(1).max(30).optional() }).strict(),
  z.object({ type: z.literal('weekly'), weekdayMask: z.number().int().min(1).max(127) }).strict(),
  z.object({ type: z.literal('monthly'), day: z.number().int().min(1).max(31) }).strict(),
]);

/** f_app parseRecurrence: a stored rule the engine cannot read is null (the template materializes nothing). */
export function parseRecurrence(json) {
  if (!json) return null;
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const r = recurrenceSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Canonical key order, so equal rules are equal strings. */
export function serializeRecurrence(rule) {
  if (!rule) return null;
  if (rule.type === 'daily') return JSON.stringify(rule.interval === undefined ? { type: 'daily' } : { type: 'daily', interval: rule.interval });
  if (rule.type === 'weekly') return JSON.stringify({ type: 'weekly', weekdayMask: rule.weekdayMask });
  return JSON.stringify({ type: 'monthly', day: rule.day });
}

function daysInMonth(year, month1) {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Does the rule (anchored at `anchor`) produce an occurrence on `date`? */
export function occursOn(rule, anchor, date) {
  if (date < anchor) return false;
  switch (rule.type) {
    case 'daily':
      return daysBetween(anchor, date) % (rule.interval ?? 1) === 0;
    case 'weekly':
      return isBitSet(rule.weekdayMask, weekdayIndex(date));
    case 'monthly': {
      const [y, m, d] = date.split('-').map(Number);
      return d === Math.min(rule.day, daysInMonth(y, m));
    }
    default:
      return false;
  }
}

/** Every occurrence day in [from, to], inclusive, respecting the anchor. */
export function occurrencesBetween(rule, anchor, from, to) {
  const start = from < anchor ? anchor : from;
  if (start > to) return [];
  return dayRange(start, to).filter((d) => occursOn(rule, anchor, d));
}

/** The first occurrence strictly after `after` (searches ~13 months ahead). */
export function nextOccurrence(rule, anchor, after) {
  let d = addDaysToKey(after, 1);
  for (let i = 0; i < 400; i += 1) {
    if (occursOn(rule, anchor, d)) return d;
    d = addDaysToKey(d, 1);
  }
  return null;
}
