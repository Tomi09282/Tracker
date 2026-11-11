// src/db/lifeos-items.js — habits and tasks inside the worker: the reads the screens need, the two
// halves of the day close that settle them, and the recurring-task materializer (migration 032).
//
// WORKER SIDE ONLY, NOT A tx/ FILE — for the reason given in lifeos-ledger.js: these are fragments
// that run inside a caller's transaction (closeLifeDayTx, markLapsedDaysTx, the habit and task
// transactions, the today read). Nothing here opens a transaction, and nothing here is a task
// Piscina can be asked to run by name. Every statement is prepared, bound, and ownership-scoped
// (`user_id = ?` on every row it reads or writes).
import { stmt } from './conn.js';
import { postCoinEvent } from './lifeos-ledger.js';
import { addDaysToKey } from '../lifeos/dates.js';
import { FRESH_STATE, goodHabitPreview, isScheduledOn, settleHabitDay, weekStart } from '../lifeos/habits.js';
import { parseRecurrence } from '../lifeos/recurrence.js';
import { applyMultiplierBp, multiplierBpFor, pointsToMinor, relapseTotal, LIFEOS_LIMITS } from '../lifeos/rules.js';
import { bucketTasks, daysToMaterialize, isLate, taskPayout } from '../lifeos/tasks.js';

/* ══ habits: rows ══════════════════════════════════════════════════════════════════════════════ */

const HABIT_COLS = `h.id, h.name, h.kind, h.schedule_type AS scheduleType, h.weekday_mask AS weekdayMask,
  h.times_per_week AS timesPerWeek, h.target_count AS targetCount, h.unit,
  h.points_success AS pointsSuccess, h.points_penalty AS pointsPenalty, h.reminder_time AS reminderTime,
  h.sort_order AS sortOrder, h.started_on AS startedOn, h.archived_at AS archivedAt, h.created_at AS createdAt`;

export function habitRow(userId, habitId) {
  return stmt(`SELECT ${HABIT_COLS} FROM habits h WHERE h.id = ? AND h.user_id = ?`).get(habitId, userId);
}

/** Live habits that exist on `date`, in display order (f_app activeHabitsOn). */
/**
 * The habits a day settles. With `bounds` ({ dayStart, nextDayStart }, epoch seconds of the logical
 * day's start and of the next one) it also takes an ARCHIVED habit that was still live when the day
 * ended (archived after the next day began — the close had not run yet), and one archived DURING the
 * day that has a log on it (a relapse, a partial count, a skip). Security review LifeOS, attack 12:
 * archive after a relapse or a miss, let the day close without the habit, restore — the streak
 * "jumped over" the bad day with no penalty. Archiving during a day with nothing logged still
 * leaves that day out (the same as Kihagyás, which already excuses a day). Without `bounds` only
 * live habits (the lapse of a gap).
 */
function liveHabitsOn(userId, date, bounds = null) {
  const never = Number.MAX_SAFE_INTEGER;
  return stmt(
    `SELECT ${HABIT_COLS} FROM habits h
      WHERE h.user_id = ? AND h.started_on <= ?
        AND (h.archived_at IS NULL OR h.archived_at >= ?
             OR (h.archived_at >= ? AND EXISTS (SELECT 1 FROM habit_logs l
                   WHERE l.habit_id = h.id AND l.user_id = h.user_id AND l.local_date = ?)))
      ORDER BY h.sort_order, h.id`,
  ).all(userId, date, bounds?.nextDayStart ?? never, bounds?.dayStart ?? never, date);
}

export function countLiveHabits(userId) {
  return stmt('SELECT COUNT(*) AS n FROM habits WHERE user_id = ? AND archived_at IS NULL').get(userId).n;
}

export function countAllHabits(userId) {
  return stmt('SELECT COUNT(*) AS n FROM habits WHERE user_id = ?').get(userId).n;
}

export function logRow(userId, habitId, date) {
  return stmt(
    `SELECT count, status, done_at AS doneAt FROM habit_logs WHERE habit_id = ? AND user_id = ? AND local_date = ?`,
  ).get(habitId, userId, date);
}

/** The streak state a day starts from: the newest settled result before it (or a fresh habit). */
export function stateBefore(userId, habitId, date) {
  const r = stmt(
    `SELECT streak_after AS current, best_after AS best, freezes_after AS freezes,
            week_streak_after AS weekStreak
       FROM habit_day_results WHERE habit_id = ? AND user_id = ? AND local_date < ?
      ORDER BY local_date DESC LIMIT 1`,
  ).get(habitId, userId, date);
  return r ? { ...r, weekStreak: r.weekStreak ?? 0 } : { ...FRESH_STATE };
}

/** Done days of a habit in the Mon..`date` stretch of `date`'s week (the times-per-week quota). */
function weekDoneThrough(userId, habitId, date) {
  return stmt(
    `SELECT COUNT(*) AS n FROM habit_logs
      WHERE habit_id = ? AND user_id = ? AND status = 'done' AND local_date >= ? AND local_date <= ?`,
  ).get(habitId, userId, weekStart(date), date).n;
}

/**
 * One habit as the Ma / Szokások screens draw it on `today`: the log, the streak as settled so
 * far, the multiplier, the freezes, and what today would pay if it settled as it stands.
 */
export function habitView(userId, h, today, rules) {
  const log = logRow(userId, h.id, today) ?? null;
  const state = stateBefore(userId, h.id, today);
  const multiplierBp = multiplierBpFor(state.current, rules);
  const count = log?.count ?? 0;
  let previewMinor = 0;
  let fullMinor = 0;
  if (h.kind === 'good') {
    previewMinor = pointsToMinor(goodHabitPreview({ count, target: h.targetCount, base: h.pointsSuccess, streak: state.current }, rules));
    fullMinor = pointsToMinor(applyMultiplierBp(h.pointsSuccess, multiplierBp));
  } else {
    previewMinor = count > 0 ? -pointsToMinor(relapseTotal(count, h.pointsPenalty, rules)) : 0;
    fullMinor = pointsToMinor(applyMultiplierBp(h.pointsSuccess, multiplierBp));
  }
  return {
    id: h.id,
    name: h.name,
    kind: h.kind,
    scheduleType: h.scheduleType,
    weekdayMask: h.weekdayMask,
    timesPerWeek: h.timesPerWeek,
    targetCount: h.targetCount,
    unit: h.unit,
    pointsSuccess: h.pointsSuccess,
    pointsPenalty: h.pointsPenalty,
    reminderTime: h.reminderTime,
    sortOrder: h.sortOrder,
    startedOn: h.startedOn,
    archived: h.archivedAt !== null,
    scheduledToday: h.archivedAt === null && h.startedOn <= today && isScheduledOn(h, today),
    log: log ? { date: today, count: log.count, status: log.status, doneAt: log.doneAt } : null,
    streak: {
      current: state.current,
      best: state.best,
      freezes: state.freezes,
      multiplierBp,
      weekStreak: h.scheduleType === 'times_per_week' ? state.weekStreak : null,
    },
    weekDone: h.scheduleType === 'times_per_week' ? weekDoneThrough(userId, h.id, today) : null,
    previewMinor,
    fullMinor,
  };
}

/** Every live habit (scheduled today or not), then the archived ones. */
export function habitViews(userId, today, rules) {
  const rows = stmt(
    `SELECT ${HABIT_COLS} FROM habits h WHERE h.user_id = ?
      ORDER BY (h.archived_at IS NOT NULL), h.sort_order, h.id`,
  ).all(userId);
  return rows.map((h) => habitView(userId, h, today, rules));
}

/** The habit detail: the view plus the last 12 weeks of settled days and their coins. */
export function habitDetail(userId, habitId, today, rules) {
  const h = habitRow(userId, habitId);
  if (!h) return null;
  const from = addDaysToKey(weekStart(today), -77); // 12 Mon..Sun weeks ending with this one
  const days = stmt(
    `SELECT r.id, r.local_date AS date, r.outcome, r.count, r.target_count AS targetCount,
            r.multiplier_bp AS multiplierBp, r.streak_after AS streakAfter,
            r.milestone_days AS milestoneDays, r.freeze_earned AS freezeEarned, r.quota_met AS quotaMet,
            (SELECT l.done_at FROM habit_logs l
              WHERE l.habit_id = r.habit_id AND l.user_id = r.user_id AND l.local_date = r.local_date) AS doneAt,
            (SELECT COALESCE(SUM(e.amount_minor), 0) FROM coin_events e
              WHERE e.user_id = r.user_id AND e.source_type = 'habit_day' AND e.source_id = r.id) AS coinsMinor
       FROM habit_day_results r
      WHERE r.habit_id = ? AND r.user_id = ? AND r.local_date >= ?
      ORDER BY r.local_date DESC`,
  ).all(habitId, userId, from);
  const counted = days.filter((d) => ['done', 'missed', 'clean', 'relapse'].includes(d.outcome));
  return {
    habit: habitView(userId, h, today, rules),
    from,
    days,
    totals: {
      coinsMinor: days.reduce((a, d) => a + d.coinsMinor, 0),
      done: counted.filter((d) => d.outcome === 'done' || d.outcome === 'clean').length,
      scheduled: counted.length,
    },
  };
}

/* ══ habits: the day close ════════════════════════════════════════════════════════════════════ */

/**
 * STREAK MILESTONES ARE RARE PER ACCOUNT, NOT PER HABIT (security review LifeOS, attack 01).
 * The owner put milestones outside the daily cap because "they are rare and cannot be farmed"
 * (2026-10-18). Per habit they were neither: twenty bad habits — clean by default, so zero effort —
 * crossed 100 days together and paid 20 x 500 coins on one day, and staggered habits would pay one
 * every day. So a tier pays at most ONCE PER ACCOUNT per window as long as the tier itself: the
 * 7-day milestone at most once in any 7 logical days, the 30-day once in 30, the 100-day once in
 * 100 — whichever habit crosses it first. The result row still records the milestone it reached
 * (milestone_days); only the coin is withheld. A reversed payout does not count.
 */
function milestonePaidWithin(userId, milestoneDays, date) {
  if (!milestoneDays) return false;
  return Boolean(
    stmt(
      `SELECT 1 FROM coin_events e
         JOIN habit_day_results r ON r.id = e.source_id AND r.user_id = e.user_id
        WHERE e.user_id = ? AND e.reason_key = 'streak.milestone' AND e.source_type = 'habit_day'
          AND r.milestone_days = ? AND e.local_date > ? AND e.local_date <= ?
          AND e.reverses_event_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM coin_events x WHERE x.reverses_event_id = e.id)
        LIMIT 1`,
    ).get(userId, milestoneDays, addDaysToKey(date, -milestoneDays), date),
  );
}

/**
 * Settle every live habit scheduled on `date`: one immutable result row each (its id is the source
 * of that day's coin events), then the coins. Returns f_app's perfect-day counts and the events.
 * Runs inside closeLifeDayTx, BEFORE the day's summary row (trg_habit_result_settled).
 */
export function settleHabitsOn({ userId, date, rules, rulesVersion, requestId, bounds = null }) {
  let scheduled = 0;
  let done = 0;
  let goodScheduled = 0;
  const events = [];
  for (const h of liveHabitsOn(userId, date, bounds)) {
    if (!isScheduledOn(h, date)) continue;
    const log = logRow(userId, h.id, date) ?? null;
    const state = stateBefore(userId, h.id, date);
    const weekDone = h.scheduleType === 'times_per_week' ? weekDoneThrough(userId, h.id, date) : 0;
    const r = settleHabitDay({ habit: h, log, state, date, weekDone }, rules);

    const ins = stmt(
      `INSERT INTO habit_day_results
         (habit_id, user_id, local_date, outcome, count, target_count, multiplier_bp, streak_after,
          best_after, freezes_after, week_streak_after, quota_met, milestone_days, freeze_earned, rules_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      h.id, userId, date, r.outcome, Math.min(r.count, 100), h.targetCount, r.multiplierBp, r.state.current,
      r.state.best, r.state.freezes, r.weekStreakAfter, r.quotaMet, r.milestoneDays, r.freezeEarned, rulesVersion,
    );
    const resultId = Number(ins.lastInsertRowid);
    for (const c of r.coins) {
      if (c.reason === 'streak.milestone' && milestonePaidWithin(userId, r.milestoneDays, date)) continue;
      const ev = postCoinEvent({
        userId,
        reasonKey: c.reason,
        amountMinor: pointsToMinor(c.points),
        localDate: date,
        sourceType: 'habit_day',
        sourceId: resultId,
        rules,
        rulesVersion,
        requestId,
        note: c.reason === 'streak.milestone' ? `${r.milestoneDays}` : null,
      });
      if (ev) events.push(ev);
    }
    if (r.counted === 'excluded') continue;
    scheduled += 1;
    if (h.kind === 'good') goodScheduled += 1;
    if (r.counted === 'done') done += 1;
  }
  return { scheduled, done, goodScheduled, events };
}

/**
 * A lapsed gap (plan L6) resets every live habit's streak: one 'lapsed' row per habit on the LAST
 * lapsed day — streak 0, best and freezes kept, no coins. Runs inside markLapsedDaysTx before that
 * day's summary row.
 */
export function lapseHabits({ userId, lastLapsed, rulesVersion }) {
  let n = 0;
  for (const h of liveHabitsOn(userId, lastLapsed)) {
    const state = stateBefore(userId, h.id, lastLapsed);
    stmt(
      `INSERT INTO habit_day_results
         (habit_id, user_id, local_date, outcome, count, target_count, multiplier_bp, streak_after,
          best_after, freezes_after, week_streak_after, rules_version)
       VALUES (?, ?, ?, 'lapsed', 0, ?, 10000, 0, ?, ?, ?, ?)`,
    ).run(
      h.id, userId, lastLapsed, h.targetCount, state.best, state.freezes,
      h.scheduleType === 'times_per_week' ? 0 : null, rulesVersion,
    );
    n += 1;
  }
  return n;
}

/* ══ tasks: rows ═══════════════════════════════════════════════════════════════════════════════ */

const TASK_COLS = `t.id, t.title, t.notes, t.priority, t.points, t.due_on AS dueOn, t.due_time AS dueTime,
  t.recurrence, t.parent_task_id AS parentTaskId, t.occurrence_on AS occurrenceOn,
  t.completed_at AS completedAt, t.completed_on AS completedOn, t.overdue_on AS overdueOn,
  t.deleted_at AS deletedAt, t.created_at AS createdAt, t.challenge_id AS challengeId,
  (SELECT p.recurrence FROM tasks p WHERE p.id = t.parent_task_id AND p.user_id = t.user_id) AS parentRecurrence,
  (SELECT e.amount_minor FROM coin_events e
    WHERE e.user_id = t.user_id AND e.reason_key = 'task.done' AND e.source_type = 'task' AND e.source_id = t.id
      AND e.reverses_event_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM coin_events x WHERE x.reverses_event_id = e.id)
    ORDER BY e.seq DESC LIMIT 1) AS paidMinor,
  (SELECT e.amount_minor FROM coin_events e
    WHERE e.user_id = t.user_id AND e.reason_key = 'task.overdue' AND e.source_type = 'task' AND e.source_id = t.id
      AND e.reverses_event_id IS NULL LIMIT 1) AS overduePenaltyMinor`;

export function taskRow(userId, taskId) {
  return stmt(`SELECT ${TASK_COLS} FROM tasks t WHERE t.id = ? AND t.user_id = ? AND t.deleted_at IS NULL`).get(taskId, userId);
}

export function countOpenTasks(userId) {
  return stmt(
    'SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND completed_at IS NULL',
  ).get(userId).n;
}

/** A task as the screens draw it: its value now ("+20"), whether completing it now is late. */
export function taskView(t, prefs, rules, nowMs) {
  const late = prefs?.timezone && !t.completedAt ? isLate(t, nowMs, prefs.timezone, prefs.dayStartHour) : false;
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    priority: t.priority,
    points: t.points,
    dueOn: t.dueOn,
    dueTime: t.dueTime,
    recurrence: parseRecurrence(t.recurrence ?? t.parentRecurrence),
    isTemplate: t.recurrence !== null,
    parentTaskId: t.parentTaskId,
    completedAt: t.completedAt,
    completedOn: t.completedOn,
    overdueOn: t.overdueOn,
    valueMinor: pointsToMinor(taskPayout(t, false, rules)),
    lateNow: Boolean(late),
    payoutNowMinor: t.completedAt ? null : pointsToMinor(taskPayout(t, Boolean(late), rules)),
    paidMinor: t.paidMinor ?? null,
    overduePenaltyMinor: t.overduePenaltyMinor ?? null,
    // Phase 4 (033): the challenge this task was picked from (MAI DOBÁS), or null.
    challengeId: t.challengeId ?? null,
  };
}

/**
 * The task lists of `today` (f_app tasksForDay) plus what the Feladatok tabs need: upcoming (open,
 * due in the next 7 days), done (completed in the last 7 days, at most 100), templates. Bounded:
 * open tasks are capped at 300 (LIFEOS_LIMITS.openTasks).
 */
export function taskLists(userId, today, prefs, rules, nowMs) {
  const open = stmt(
    `SELECT ${TASK_COLS} FROM tasks t
      WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.completed_at IS NULL
      ORDER BY t.due_on, t.due_time, t.id LIMIT 1000`,
  ).all(userId);
  const doneRecent = stmt(
    `SELECT ${TASK_COLS} FROM tasks t
      WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.completed_on >= ?
      ORDER BY t.completed_at DESC, t.id DESC LIMIT 100`,
  ).all(userId, addDaysToKey(today, -6));
  const b = bucketTasks([...open, ...doneRecent.filter((t) => t.completedOn === today)], today);
  const view = (t) => taskView(t, prefs, rules, nowMs);
  const horizon = addDaysToKey(today, 7);
  return {
    today,
    due: b.due.map(view),
    overdue: b.overdue.map(view),
    anytime: b.anytime.map(view),
    completedToday: b.completed.map(view),
    upcoming: open.filter((t) => !t.recurrence && t.dueOn && t.dueOn > today && t.dueOn <= horizon).map(view),
    done: doneRecent.map(view),
    templates: open.filter((t) => t.recurrence).map(view),
    openCount: open.filter((t) => !t.recurrence).length,
  };
}

/* ══ tasks: the day close ═════════════════════════════════════════════════════════════════════ */

/**
 * f_app's task half of closeDay: every open, dated, non-template task due on or before `date` that
 * was never found overdue is penalised ONCE (taskOverdue) and marked; then the day's due / done
 * counts for the perfect day. Runs inside closeLifeDayTx.
 */
export function settleTasksOn({ userId, date, rules, rulesVersion, requestId }) {
  const events = [];
  const overdue = stmt(
    `SELECT id FROM tasks
      WHERE user_id = ? AND deleted_at IS NULL AND completed_at IS NULL AND recurrence IS NULL
        AND due_on IS NOT NULL AND due_on <= ? AND overdue_on IS NULL
      ORDER BY id`,
  ).all(userId, date);
  for (const t of overdue) {
    const mark = stmt(
      `UPDATE tasks SET overdue_on = ?, updated_at = unixepoch()
        WHERE id = ? AND user_id = ? AND overdue_on IS NULL AND completed_at IS NULL`,
    ).run(date, t.id, userId);
    if (mark.changes !== 1) throw new Error('settleTasksOn: an overdue task changed under the lock');
    const ev = postCoinEvent({
      userId,
      reasonKey: 'task.overdue',
      amountMinor: -pointsToMinor(rules.taskOverdue),
      localDate: date,
      sourceType: 'task',
      sourceId: t.id,
      rules,
      rulesVersion,
      requestId,
    });
    if (ev) events.push(ev);
  }
  const c = stmt(
    `SELECT COUNT(*) AS due,
            COALESCE(SUM(CASE WHEN completed_on IS NOT NULL AND completed_on <= ? THEN 1 ELSE 0 END), 0) AS done
       FROM tasks
      WHERE user_id = ? AND deleted_at IS NULL AND recurrence IS NULL AND due_on = ?`,
  ).get(date, userId, date);
  return { due: c.due, done: c.done, overdue: overdue.length, events };
}

/** A lapsed gap marks the tasks that went overdue in it — without a penalty (plan L6). */
export function lapseTasks({ userId, lastLapsed }) {
  return stmt(
    `UPDATE tasks SET overdue_on = ?, updated_at = unixepoch()
      WHERE user_id = ? AND deleted_at IS NULL AND completed_at IS NULL AND recurrence IS NULL
        AND due_on IS NOT NULL AND due_on <= ? AND overdue_on IS NULL`,
  ).run(lastLapsed, userId, lastLapsed).changes;
}

/* ══ tasks: the materializer ══════════════════════════════════════════════════════════════════ */

/**
 * Create the instances recurring templates owe for today .. today + 7 (f_app
 * materializeRecurringTasks). Idempotent: a (template, day) pair is created at most once (the
 * UNIQUE index is the backstop), and a deleted occurrence is not re-created. Stops at the open-task
 * cap. `onlyTemplateId` limits the run to one template (create / edit of that template).
 */
export function materializeFor(userId, today, onlyTemplateId = null) {
  const templates = stmt(
    `SELECT id, title, notes, priority, points, due_on AS dueOn, due_time AS dueTime, recurrence
       FROM tasks
      WHERE user_id = ? AND deleted_at IS NULL AND recurrence IS NOT NULL AND (? IS NULL OR id = ?)
      ORDER BY id`,
  ).all(userId, onlyTemplateId, onlyTemplateId);
  let open = countOpenTasks(userId);
  const created = [];
  for (const t of templates) {
    const rule = parseRecurrence(t.recurrence);
    if (!rule || !t.dueOn) continue;
    const existingDays = stmt('SELECT occurrence_on AS d FROM tasks WHERE parent_task_id = ? AND user_id = ?')
      .all(t.id, userId)
      .map((r) => r.d);
    for (const day of daysToMaterialize({ rule, anchor: t.dueOn, today, existingDays })) {
      if (open >= LIFEOS_LIMITS.openTasks) return created;
      const ins = stmt(
        `INSERT INTO tasks (user_id, title, notes, priority, points, due_on, due_time, parent_task_id, occurrence_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(userId, t.title, t.notes, t.priority, t.points, day, t.dueTime, t.id, day);
      created.push(Number(ins.lastInsertRowid));
      open += 1;
    }
  }
  return created;
}

/**
 * Drop a template's instances that are still open and not yet due before today (f_app
 * dropOpenInstances): an open instance has no coin events, so deleting it loses nothing, and the
 * materializer regenerates from the changed rule. A deleted (by the user) occurrence stays deleted.
 */
export function dropOpenInstances(userId, templateId, today) {
  // An instance that was completed and reopened has coin events (an award and its reversal) that
  // name it as their source; a hard delete would let SQLite hand its id to a new task. Those are
  // soft-deleted instead — they keep their day, so the materializer does not re-create that one day.
  const soft = stmt(
    `UPDATE tasks SET deleted_at = unixepoch(), updated_at = unixepoch()
      WHERE parent_task_id = ? AND user_id = ? AND deleted_at IS NULL AND completed_at IS NULL
        AND overdue_on IS NULL AND due_on >= ?
        AND EXISTS (SELECT 1 FROM coin_events e
                     WHERE e.user_id = tasks.user_id AND e.source_type = 'task' AND e.source_id = tasks.id)`,
  ).run(templateId, userId, today).changes;
  const hard = stmt(
    `DELETE FROM tasks
      WHERE parent_task_id = ? AND user_id = ? AND deleted_at IS NULL AND completed_at IS NULL
        AND overdue_on IS NULL AND due_on >= ?`,
  ).run(templateId, userId, today).changes;
  return soft + hard;
}
