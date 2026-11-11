// src/db/tx/lifeos-tasks.js — the task transactions and reads (migration 032).
//
// Runs INSIDE a Piscina worker (re-exported by worker.js; every `export function` is a task the
// facade may name). The rules of src/db/tx/lifeos.js hold here too: one logical write = one worker
// call in an IMMEDIATE transaction; ADR-0005 (refusals before the first write); ownership in the SQL
// (`WHERE id = ? AND user_id = ?`, another account's task is a 404); "now" is the worker's clock.
//
// ═══ THE ONE TASK WRITE THAT MOVES COINS ═══════════════════════════════════════════════════════
//
// completeTaskTx pays (plan L5: tasks pay on completion), reopenTaskTx takes it back. The amount is
// computed HERE from the stored task (priority or its capped override, half when late — f_app
// taskPoints) and the worker clock; nothing a client sends reaches it. Paying goes through
// postCoinEvent (the daily cap trims it), the undo through reverseCoinEvent (an exact reversal, the
// balance may go below zero). The coin_events seq rule allows a second award for the same task only
// after the first was reversed, so complete / reopen / complete pays once, never twice.
import { getDb, stmt, rethrow } from '../conn.js';
import { activeEvent, editWindow, isSettledDay, postCoinEvent, readStartedPrefs, readRules, reverseCoinEvent } from '../lifeos-ledger.js';
import { countOpenTasks, dropOpenInstances, materializeFor, taskLists, taskRow, taskView } from '../lifeos-items.js';
import { addDaysToKey, dayKeyFor } from '../../lifeos/dates.js';
import { serializeRecurrence } from '../../lifeos/recurrence.js';
import { LIFEOS_LIMITS, pointsToMinor, taskPointRules } from '../../lifeos/rules.js';
import { isLate, taskPayout } from '../../lifeos/tasks.js';

/** A due day further than this is refused: it bounds what a client can park in the table. */
const MAX_DUE_AHEAD_DAYS = 3650;

function todayFor(prefs, nowMs) {
  return dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);
}

function started(prefs) {
  return Boolean(prefs?.timezone && prefs.startedOn);
}

function viewOf(userId, taskId, prefs, rules, nowMs) {
  const t = taskRow(userId, taskId);
  return t ? taskView(t, prefs, rules, nowMs) : null;
}

/* ══ reads ═══════════════════════════════════════════════════════════════════════════════════════ */

/** GET /tasks: the Feladatok tabs (Ma, Közelgő, Lejárt, Bármikor, Kész) and the templates. */
export function tasksQuery({ userId }) {
  try {
    const prefs = readStartedPrefs(userId);
    if (!prefs) return null;
    // The priority picker's numbers (B-lifeos-polish): the admin rules, also before a zone exists.
    const { version, rules } = readRules();
    const taskRules = taskPointRules(rules);
    if (!started(prefs)) return { started: false, today: null, due: [], overdue: [], anytime: [], completedToday: [], upcoming: [], done: [], templates: [], openCount: 0, rulesVersion: version, taskRules };
    const now = Date.now();
    return { started: true, ...taskLists(userId, todayFor(prefs, now), prefs, rules, now), limits: { open: LIFEOS_LIMITS.openTasks }, rulesVersion: version, taskRules };
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /tasks/:id. */
export function taskQuery({ userId, taskId }) {
  try {
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return null;
    const { rules } = readRules();
    return viewOf(userId, taskId, prefs, rules, Date.now());
  } catch (err) {
    return rethrow(err);
  }
}

/* ══ createTaskTx ════════════════════════════════════════════════════════════════════════════════ */

/**
 * A new task, template or capture (Rögzítés reuses this). Refuses before writing: no zone yet
 * (409 TIMEZONE_REQUIRED), the open-task cap (300), a due day before the LifeOS start or more than
 * ten years ahead. A replay of the same clientKey answers the task it already made. A template
 * materializes its instances for today .. today + 7 in the same transaction.
 */
export function createTaskTx({ userId, input, clientKey }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readStartedPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const { rules } = readRules();
    const now = Date.now();
    const today = todayFor(prefs, now);

    current = 'SELECT the replay';
    const prior = stmt('SELECT id FROM tasks WHERE user_id = ? AND client_key = ?').get(userId, clientKey);
    if (prior) return { outcome: 'replayed', task: viewOf(userId, prior.id, prefs, rules, now) };

    if (input.dueOn && (input.dueOn < prefs.startedOn || input.dueOn > addDaysToKey(today, MAX_DUE_AHEAD_DAYS))) {
      return { outcome: 'invalid' };
    }
    current = 'SELECT the cap';
    if (countOpenTasks(userId) >= LIFEOS_LIMITS.openTasks) return { outcome: 'cap', limit: LIFEOS_LIMITS.openTasks };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT tasks';
    const ins = stmt(
      `INSERT INTO tasks (user_id, title, notes, priority, points, due_on, due_time, recurrence, client_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      input.title,
      input.notes ?? null,
      input.priority ?? 2,
      input.points ?? null,
      input.dueOn ?? null,
      input.dueOn ? input.dueTime ?? null : null,
      serializeRecurrence(input.recurrence ?? null),
      clientKey,
    );
    const id = Number(ins.lastInsertRowid);
    current = 'materialize the template';
    const instances = input.recurrence ? materializeFor(userId, today, id) : [];
    return { outcome: 'created', task: viewOf(userId, id, prefs, rules, now), instances: instances.length };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ updateTaskTx ════════════════════════════════════════════════════════════════════════════════ */

/**
 * Edit a task (f_app updateTask). A completed task keeps the coins it was paid; an instance cannot
 * become a template; a template cannot stop being one (delete it instead: its future open
 * instances go with it). A changed template drops its open instances from today on and
 * materializes again from the new rule, in the same transaction.
 */
export function updateTaskTx({ userId, taskId, patch }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the task (owned)';
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const t = taskRow(userId, taskId);
    if (!t) return { outcome: 'missing' };
    const { rules } = readRules();
    const now = Date.now();
    const today = todayFor(prefs, now);

    const isTemplate = t.recurrence !== null;
    if (patch.recurrence === null && isTemplate) return { outcome: 'conflict' };
    if (patch.recurrence && (t.parentTaskId !== null || t.completedAt !== null)) return { outcome: 'conflict' };
    const dueOn = patch.dueOn !== undefined ? patch.dueOn : t.dueOn;
    let dueTime = patch.dueTime !== undefined ? patch.dueTime : t.dueTime;
    if (!dueOn) dueTime = null;
    const recurrence = patch.recurrence !== undefined ? serializeRecurrence(patch.recurrence) : t.recurrence;
    if (recurrence && !dueOn) return { outcome: 'invalid' };
    if (dueOn && dueOn !== t.dueOn && (dueOn < prefs.startedOn || dueOn > addDaysToKey(today, MAX_DUE_AHEAD_DAYS))) {
      return { outcome: 'invalid' };
    }

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE tasks';
    const upd = stmt(
      `UPDATE tasks
          SET title = ?, notes = ?, priority = ?, points = ?, due_on = ?, due_time = ?, recurrence = ?,
              updated_at = unixepoch()
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).run(
      patch.title ?? t.title,
      patch.notes !== undefined ? patch.notes : t.notes,
      patch.priority ?? t.priority,
      patch.points !== undefined ? patch.points : t.points,
      dueOn,
      dueTime,
      recurrence,
      taskId,
      userId,
    );
    if (upd.changes === 0) return { outcome: 'missing' };
    current = 'regenerate the template';
    const nowTemplate = recurrence !== null;
    const dropped = nowTemplate ? dropOpenInstances(userId, taskId, today) : 0;
    const created = nowTemplate ? materializeFor(userId, today, taskId).length : 0;
    return { outcome: 'applied', task: viewOf(userId, taskId, prefs, rules, now), dropped, created };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ deleteTaskTx ════════════════════════════════════════════════════════════════════════════════ */

/**
 * Soft delete (f_app deleteTask). The coin history stays: a completed task's award is not taken
 * back, an overdue penalty is not refunded. Deleting a template also removes its future open
 * instances. A second delete answers 404 (the task no longer exists for the caller).
 */
export function deleteTaskTx({ userId, taskId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the task (owned)';
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const t = taskRow(userId, taskId);
    if (!t) return { outcome: 'missing' };
    const today = todayFor(prefs, Date.now());

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE tasks (soft delete)';
    const del = stmt(
      `UPDATE tasks SET deleted_at = unixepoch(), updated_at = unixepoch()
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).run(taskId, userId);
    if (del.changes === 0) return { outcome: 'missing' };
    current = 'drop the template instances';
    const dropped = t.recurrence !== null ? dropOpenInstances(userId, taskId, today) : 0;
    return { outcome: 'applied', dropped };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ completeTaskTx — the coin-moving one ════════════════════════════════════════════════════════ */

/**
 * Complete a task now (f_app completeTask): it pays its priority's coins (or its capped override),
 * half when late, on the user's logical today, trimmed by the daily cap. Idempotent: completing a
 * completed task answers 'already' and pays nothing. A template cannot be completed.
 *
 *   forge   — the amount is computed from the stored row and the worker clock;
 *   replay  — the second call finds completed_at set ('already'); the guarded UPDATE is the gate;
 *   race    — IMMEDIATE: two completes serialise, the second sees the first;
 *   IDOR    — WHERE id = ? AND user_id = ?;
 *   extremes — the override is capped at 50 by the schema, every earn by the daily cap.
 */
export function completeTaskTx({ userId, taskId, requestId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the task (owned)';
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const t = taskRow(userId, taskId);
    if (!t) return { outcome: 'missing' };
    const { version, rules } = readRules();
    const now = Date.now();
    if (t.recurrence !== null) return { outcome: 'template' };
    if (t.completedAt !== null) return { outcome: 'already', task: taskView(t, prefs, rules, now) };
    const today = todayFor(prefs, now);
    // Never onto a settled day (security review LifeOS 02): only reachable through a boundary change
    // that setUserPrefsTx now refuses; kept as the transaction's own refusal (postCoinEvent throws).
    if (isSettledDay(userId, today)) return { outcome: 'locked' };
    const late = isLate(t, now, prefs.timezone, prefs.dayStartHour);
    const points = taskPayout(t, late, rules);
    const live = activeEvent(userId, 'task.done', 'task', taskId);
    if (live) throw new Error('completeTaskTx: an open task holds a live award');

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE tasks (complete, guarded)';
    const upd = stmt(
      `UPDATE tasks SET completed_at = unixepoch(), completed_on = ?, updated_at = unixepoch()
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND completed_at IS NULL AND recurrence IS NULL`,
    ).run(today, taskId, userId);
    if (upd.changes === 0) return { outcome: 'missing' };
    current = 'postCoinEvent (task.done)';
    const event = postCoinEvent({
      userId,
      reasonKey: 'task.done',
      amountMinor: pointsToMinor(points),
      localDate: today,
      sourceType: 'task',
      sourceId: taskId,
      rules,
      rulesVersion: version,
      requestId,
      note: late ? 'late' : null,
    });
    return { outcome: 'completed', late, event, task: viewOf(userId, taskId, prefs, rules, now) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Undo a completion (f_app uncompleteTask) while the day it was completed on is still open (plan
 * L4; trg_task_completion_settled is the backstop): the award is reversed exactly. An open task
 * answers 'already' and moves nothing.
 */
export function reopenTaskTx({ userId, taskId, requestId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the task (owned)';
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const t = taskRow(userId, taskId);
    if (!t) return { outcome: 'missing' };
    const { rules } = readRules();
    const now = Date.now();
    if (t.completedAt === null) return { outcome: 'already', task: taskView(t, prefs, rules, now) };
    const today = todayFor(prefs, now);
    if (editWindow(userId, prefs, t.completedOn, now, today) !== 'open') return { outcome: 'locked' };
    const live = activeEvent(userId, 'task.done', 'task', taskId);

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE tasks (reopen, guarded)';
    const upd = stmt(
      `UPDATE tasks SET completed_at = NULL, completed_on = NULL, updated_at = unixepoch()
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND completed_at IS NOT NULL`,
    ).run(taskId, userId);
    if (upd.changes === 0) return { outcome: 'missing' };
    current = 'reverseCoinEvent (task.done)';
    const reversal = live ? reverseCoinEvent({ userId, eventId: live.id, requestId, note: 'reopened' }) : null;
    return { outcome: 'reopened', reversal, task: viewOf(userId, taskId, prefs, rules, now) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ materializeRecurringTasksTx ═════════════════════════════════════════════════════════════════ */

/**
 * Create the instances every recurring template owes for today .. today + 7. Run by the lazy
 * settle (src/lifeos/settle.js) after the due days close, so tomorrow's instance appears when the
 * day rolls over ("A következő a nap zárásakor jelenik meg."). Idempotent.
 */
export function materializeRecurringTasksTx({ userId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return { outcome: 'not_started', created: 0 };
    const today = todayFor(prefs, Date.now());

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT tasks (instances)';
    const created = materializeFor(userId, today);
    return { outcome: 'applied', created: created.length };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}
