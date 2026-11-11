// src/lifeos/events.js — calendar events at the HTTP boundary: the request shapes (zod, `.strict()`).
// Migration 034, plan Phase 5.
//
// ═══ ROUTE SIDE ONLY ═══════════════════════════════════════════════════════════════════════════
//
// The routes (src/lifeos/event-routes.js) import the schemas below. The worker never imports this
// file: its pure core (the limits, the stored rule, the wall clock -> instants conversion) is
// ./event-times.js, re-exported here so one import serves a test or a route — see that file's
// header for why the zod schemas must stay out of the pool workers.
import { z } from 'zod';
import { isDayKey } from './dates.js';
import { EVENT_LIMITS } from './event-times.js';

export * from './event-times.js';

/* ── the shared zod pieces (same shapes as habit-routes.js, repeated so this file imports no route) */

export const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isDayKey);
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const clientKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const line = (max) => z.string().trim().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]+$/);
/** Notes may span lines; other control characters are refused. */
const notes = z.string().trim().min(1).max(1000).regex(/^[^\u0000-\u0009\u000b-\u001f\u007f]+$/);

/**
 * The repeat rule. daily / weekly / monthly are the task engine's (src/lifeos/recurrence.js, the
 * kit's RecurrencePicker); `yearly` is the calendar's own (calendar-2: "Minden évben, október
 * 24-én") and repeats the first date's month and day. `.strict()`: an unknown key is a 400.
 */
export const eventRecurrenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily'), interval: z.number().int().min(1).max(30).optional() }).strict(),
  z.object({ type: z.literal('weekly'), weekdayMask: z.number().int().min(1).max(127) }).strict(),
  z.object({ type: z.literal('monthly'), day: z.number().int().min(1).max(31) }).strict(),
  z.object({ type: z.literal('yearly') }).strict(),
]);

/** Offsets in minutes before the start; 0 = at the start. At most four, no repeats. */
export const remindersSchema = z
  .array(z.number().int().min(0).max(EVENT_LIMITS.maxOffsetMinutes))
  .max(EVENT_LIMITS.reminders)
  .refine((a) => new Set(a).size === a.length, { message: 'a reminder offset is listed twice' });

const eventFields = {
  title: line(120),
  notes: notes.nullable(),
  location: line(160).nullable(),
  allDay: z.boolean(),
  date: dayKey,
  startTime: hhmm,
  endTime: hhmm.nullable(),
  endDate: dayKey.nullable(),
  recurrence: eventRecurrenceSchema.nullable(),
  untilDate: dayKey.nullable(),
  reminders: remindersSchema,
};

const shapeOk = (b) => (b.allDay ? b.startTime === undefined && (b.endTime ?? null) === null : true);

export const eventCreateBody = z
  .object({
    clientKey,
    title: eventFields.title,
    notes: eventFields.notes.optional(),
    location: eventFields.location.optional(),
    allDay: eventFields.allDay.optional(),
    date: eventFields.date,
    startTime: eventFields.startTime.optional(),
    endTime: eventFields.endTime.optional(),
    endDate: eventFields.endDate.optional(),
    recurrence: eventFields.recurrence.optional(),
    untilDate: eventFields.untilDate.optional(),
    reminders: eventFields.reminders.optional(),
  })
  .strict()
  .refine(shapeOk, { message: 'an all-day event takes no times' })
  .refine((b) => b.allDay || b.startTime !== undefined, { message: 'a timed event needs a start time' })
  .refine((b) => !b.untilDate || b.recurrence, { message: 'an until date needs a repeat rule' })
  .refine((b) => !b.untilDate || b.untilDate >= b.date, { message: 'the until date is before the first day' });

export const eventPatchBody = z
  .object({
    title: eventFields.title.optional(),
    notes: eventFields.notes.optional(),
    location: eventFields.location.optional(),
    allDay: eventFields.allDay.optional(),
    date: eventFields.date.optional(),
    startTime: eventFields.startTime.optional(),
    endTime: eventFields.endTime.optional(),
    endDate: eventFields.endDate.optional(),
    recurrence: eventFields.recurrence.optional(),
    untilDate: eventFields.untilDate.optional(),
    reminders: eventFields.reminders.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to change' });

/** GET /calendar?from=YYYY-MM-DD&days=1..42 (both optional: today, 7). */
export const calendarQuery = z
  .object({
    from: dayKey.optional(),
    days: z.coerce.number().int().min(1).max(42).optional(),
  })
  .strict();

/** GET /events/:id?on=YYYY-MM-DD — the occurrence on that calendar day, when there is one. */
export const eventDetailQuery = z.object({ on: dayKey.optional() }).strict();
