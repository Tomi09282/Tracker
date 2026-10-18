// src/lifeos/tasks.js — the task rules, PURE. A port of f_app `src/domain/tasks.ts` (lateness,
// points, day buckets, the materializer's plan), as functions of their inputs.
//
// ═══ THE DUE DAY IS A LOGICAL DAY, THE DUE TIME IS WALL CLOCK ══════════════════════════════════
//
// f_app stores one instant (`dueAt`) and derives the logical day from it. The Feladatok frame has a
// real shape f_app cannot hold — "ma" with no time — so a task here carries `due_on` (the logical
// day, as the user picked it) and an optional `due_time`. The instant, when one is needed (is a
// completion late?), is computed from the two in the user's own zone: a 02:30 due time with a 04:00
// day start belongs to the logical day but falls on the next CALENDAR date, exactly as f_app's
// "a 02:30 local due time belongs to the previous logical day" vector says.
import { addDaysToKey, dayKeyFor, instantFor } from './dates.js';
import { occurrencesBetween } from './recurrence.js';
import { taskPoints } from './rules.js';

/** How far ahead recurring templates are turned into instances (f_app MATERIALIZE_DAYS). */
export const MATERIALIZE_DAYS = 7;

/** The instant a timed task is due, or null for a date-only / undated task. */
export function taskDueInstant({ dueOn, dueTime }, timeZone, dayStartHour) {
  if (!dueOn || !dueTime) return null;
  const hour = Number(dueTime.slice(0, 2));
  const calendarDay = hour < dayStartHour ? addDaysToKey(dueOn, 1) : dueOn;
  return instantFor(calendarDay, dueTime, timeZone).getTime();
}

/**
 * Is a completion at `nowMs` late? (f_app: now > dueAt.) A date-only task is late when it is
 * completed on a logical day after its due day; an undated task is never late.
 */
export function isLate(task, nowMs, timeZone, dayStartHour) {
  if (!task.dueOn) return false;
  const due = taskDueInstant(task, timeZone, dayStartHour);
  if (due !== null) return nowMs > due;
  return dayKeyFor(nowMs, timeZone, dayStartHour) > task.dueOn;
}

/** Whole coins a completion pays: by priority (or the capped override), half when late. */
export function taskPayout(task, late, rules) {
  return taskPoints({ priority: task.priority, override: task.points ?? null, late }, rules);
}

/**
 * f_app tasksForDay: open tasks due on `date` (by time, then priority), overdue (due before), the
 * undated ones (by priority), and the ones completed on `date`. Templates never appear.
 */
export function bucketTasks(tasks, date) {
  const out = { due: [], overdue: [], anytime: [], completed: [] };
  for (const t of tasks) {
    if (t.recurrence) continue;
    if (t.completedOn) {
      if (t.completedOn === date) out.completed.push(t);
      continue;
    }
    if (!t.dueOn) out.anytime.push(t);
    else if (t.dueOn === date) out.due.push(t);
    else if (t.dueOn < date) out.overdue.push(t);
  }
  const byPriority = (a, b) => b.priority - a.priority || a.id - b.id;
  // A date-only task sorts after the timed ones of its day (it is due "by the end of the day").
  const timeKey = (t) => t.dueTime ?? '99:99';
  out.due.sort((a, b) => (timeKey(a) < timeKey(b) ? -1 : timeKey(a) > timeKey(b) ? 1 : byPriority(a, b)));
  out.overdue.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : byPriority(a, b)));
  out.anytime.sort(byPriority);
  return out;
}

/**
 * The days a template still needs an instance for: its occurrences in [today, today + 7] that
 * have never had one (a deleted occurrence stays deleted). f_app materializeRecurringTasks.
 */
export function daysToMaterialize({ rule, anchor, today, existingDays }) {
  const to = addDaysToKey(today, MATERIALIZE_DAYS);
  const have = new Set(existingDays);
  return occurrencesBetween(rule, anchor, today, to).filter((d) => !have.has(d));
}
