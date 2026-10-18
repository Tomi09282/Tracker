// src/plans/occurrences.js — THE schedule rule, as a pure function over rows already read.
//
// Split out of src/plans/schedule.js (package B-core) so that ONE implementation serves two very
// different callers:
//
//   * schedule.js occurrencesBetween() — the routes (/my-plans/today, /my-plans/week, the ICS feed),
//     which read the rows through the pool on the main thread;
//   * the LifeOS day close (src/db/tx/lifeos.js), which runs INSIDE a worker transaction and must
//     read the same rows under the same write lock as the coins it pays. It cannot import
//     schedule.js — that module imports the pool facade, and a worker that imports the facade
//     starts a second Piscina pool inside itself.
//
// Two copies of the rule is exactly the defect schedule.js was created to remove (its header lists
// the divergences the three old copies had). So the rule moved here, unchanged, and both callers
// import it. Imports nothing.

const DAY_MS = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const utc = (date) => Date.parse(`${date}T00:00:00Z`);

/**
 * Every scheduled occurrence in the window `[fromDate, fromDate + days)`, from the rows of ONE
 * user's active plans:
 *   plans      [{ id, name, cycle_days, starts_on, ends_on }]
 *   planDays   [{ id, plan_id, day_index, slot, name, is_rest, est_minutes, start_time, exercise_count }]
 *   exceptions [{ plan_id?, day_id, occurrence_date, action, moved_to_date }]
 *   logs       [{ plan_day_id, occurrence_date, id, status }]
 *
 * Handles `ends_on` on both paths, `skip` and `move` exceptions (a move leaves its date AND lands on
 * the new one, searched from both directions), and rest days (they occur; hiding them looks like a
 * bug). See schedule.js for the history of each.
 */
export function expandOccurrences({ plans, planDays, exceptions, logs }, fromDate, days) {
  if (!plans.length) return [];

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

  // Days moved ONTO a date inside the window, FROM ANYWHERE — including from before it.
  for (const e of exceptions.filter((x) => x.action === 'move' && x.moved_to_date)) {
    if (e.moved_to_date < fromDate || utc(e.moved_to_date) >= start + days * DAY_MS) continue;
    const d = planDays.find((x) => x.id === e.day_id);
    if (!d) continue;
    const plan = plans.find((p) => p.id === d.plan_id);
    if (!plan) continue;
    // A move cannot outlive its block.
    if (plan.ends_on && e.moved_to_date > plan.ends_on) continue;
    emit(d, plan, e.moved_to_date, true);
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot);
}

/**
 * Was a WORKOUT (not a rest day) scheduled on `date`, and was one completed? The LifeOS day close
 * and "today's workout" read it. Done = any completed log on that local date, scheduled or not —
 * a client who trained on a different day's session still trained.
 */
export function workoutDueOn(occurrences, date) {
  return occurrences.some((o) => o.date === date && !o.is_rest);
}
