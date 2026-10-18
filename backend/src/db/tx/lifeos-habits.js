// src/db/tx/lifeos-habits.js — the habit transactions and reads (migration 032).
//
// Runs INSIDE a Piscina worker: worker.js re-exports this module and Piscina resolves a task by
// export name, so every `export function` here is a task the facade (src/db/index.js) may name.
// The rules of src/db/tx/lifeos.js hold here too:
//
//   * ONE logical read or write = ONE worker call; IMMEDIATE transactions for every write.
//   * ADR-0005: every check that can refuse runs BEFORE the first write; after it nothing returns
//     conditionally (the one exemption is a `changes === 0` probe on the FIRST write).
//   * Ownership is in the SQL: every habit is read and written `WHERE id = ? AND user_id = ?`, and a
//     habit of another account is indistinguishable from one that does not exist (404).
//   * No coins move here. A habit pays when its day settles (plan L5, src/lifeos/habits.js); these
//     transactions only record what the user says about a day — and only while that day is open
//     (the edit window, plan L4; trg_habit_log_settled_* is the backstop).
//   * "Now" is the worker's clock; the day a write lands on defaults to the user's logical today.
import { getDb, stmt, rethrow } from '../conn.js';
import { editWindow, readPrefs, readRules } from '../lifeos-ledger.js';
import { countAllHabits, countLiveHabits, habitDetail, habitRow, habitView, habitViews, logRow } from '../lifeos-items.js';
import { dayKeyFor } from '../../lifeos/dates.js';
import { goodStatusFor, isScheduledOn } from '../../lifeos/habits.js';
import { LIFEOS_LIMITS } from '../../lifeos/rules.js';

function todayFor(prefs, nowMs) {
  return dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);
}

/* ══ reads ═══════════════════════════════════════════════════════════════════════════════════════ */

/** GET /habits: every habit with its streak, today's log and preview. */
export function habitsQuery({ userId }) {
  try {
    const prefs = readPrefs(userId);
    if (!prefs) return null;
    if (!prefs.timezone || !prefs.startedOn) return { started: false, today: null, habits: [], limits: { live: LIFEOS_LIMITS.habits } };
    const { rules } = readRules();
    const today = todayFor(prefs, Date.now());
    return {
      started: true,
      today,
      habits: habitViews(userId, today, rules),
      rules: { freezeEvery: rules.freezeEvery, maxFreezes: rules.maxFreezes, partialHabitMinPct: rules.partialHabitMinPct },
      limits: { live: LIFEOS_LIMITS.habits },
    };
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /habits/:id: the habit, its last 12 weeks of settled days and their coins. */
export function habitQuery({ userId, habitId }) {
  try {
    const prefs = readPrefs(userId);
    if (!prefs?.timezone || !prefs.startedOn) return null;
    const { rules } = readRules();
    return habitDetail(userId, habitId, todayFor(prefs, Date.now()), rules);
  } catch (err) {
    return rethrow(err);
  }
}

/* ══ createHabitTx ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * A new habit. Refuses before writing: no zone yet (409 TIMEZONE_REQUIRED, the plan's rule for every
 * LifeOS create), the live cap (20) and the total cap. A replay of the same clientKey answers the
 * habit it already made ('replayed'), whatever the body says — the first write wins.
 * Coins default to the rules in force (f_app: habitSuccess for a good habit, badHabitCleanDay for a
 * bad one, habitPenalty), and are capped at 50 by the schema whatever the client sends.
 */
export function createHabitTx({ userId, input, clientKey }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    if (!prefs.timezone || !prefs.startedOn) return { outcome: 'timezone_required' };

    current = 'SELECT the replay';
    const prior = stmt('SELECT id FROM habits WHERE user_id = ? AND client_key = ?').get(userId, clientKey);
    const { rules } = readRules();
    const now = Date.now();
    const today = todayFor(prefs, now);
    if (prior) return { outcome: 'replayed', habit: habitView(userId, habitRow(userId, prior.id), today, rules) };

    current = 'SELECT the caps';
    if (countLiveHabits(userId) >= LIFEOS_LIMITS.habits) return { outcome: 'cap', limit: LIFEOS_LIMITS.habits };
    if (countAllHabits(userId) >= LIFEOS_LIMITS.habitsTotal) return { outcome: 'cap', limit: LIFEOS_LIMITS.habitsTotal };

    const good = input.kind === 'good';
    const scheduleType = good ? input.scheduleType ?? 'daily' : 'daily';
    const pointsSuccess = Math.min(50, input.pointsSuccess ?? (good ? rules.habitSuccess : rules.badHabitCleanDay));
    const pointsPenalty = Math.min(50, input.pointsPenalty ?? rules.habitPenalty);
    const sortOrder = stmt('SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM habits WHERE user_id = ?').get(userId).n;

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT habits';
    const ins = stmt(
      `INSERT INTO habits
         (user_id, name, kind, schedule_type, weekday_mask, times_per_week, target_count, unit,
          points_success, points_penalty, reminder_time, sort_order, started_on, client_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      input.name,
      input.kind,
      scheduleType,
      scheduleType === 'weekdays' ? input.weekdayMask : 127,
      scheduleType === 'times_per_week' ? input.timesPerWeek : null,
      good ? input.targetCount ?? 1 : 1,
      good ? input.unit ?? null : null,
      Math.max(0, pointsSuccess),
      Math.max(0, pointsPenalty),
      input.reminderTime ?? null,
      Math.min(sortOrder, 10000),
      today,
      clientKey,
    );
    const id = Number(ins.lastInsertRowid);
    return { outcome: 'created', habit: habitView(userId, habitRow(userId, id), today, rules) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ updateHabitTx ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * Edit a habit's settings (name, schedule, count, unit, coins, reminder). The kind and the start
 * day never change (trg_habit_identity_frozen). A bad habit stays a plain daily habit. A changed
 * schedule or coin value applies to every day that has not settled yet — the same rule the f_app
 * settings follow — and the coins stay capped at 50.
 */
export function updateHabitTx({ userId, habitId, patch }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the habit (owned)';
    const prefs = readPrefs(userId);
    if (!prefs?.timezone || !prefs.startedOn) return { outcome: 'timezone_required' };
    const h = habitRow(userId, habitId);
    if (!h) return { outcome: 'missing' };
    const good = h.kind === 'good';
    if (!good && (patch.scheduleType !== undefined || patch.weekdayMask !== undefined || patch.timesPerWeek !== undefined
      || patch.targetCount !== undefined || patch.unit !== undefined)) {
      return { outcome: 'wrong_kind' };
    }
    const scheduleType = patch.scheduleType ?? h.scheduleType;
    const weekdayMask = scheduleType === 'weekdays' ? patch.weekdayMask ?? (h.scheduleType === 'weekdays' ? h.weekdayMask : null) : 127;
    const timesPerWeek = scheduleType === 'times_per_week' ? patch.timesPerWeek ?? h.timesPerWeek : null;
    if (weekdayMask === null || (scheduleType === 'times_per_week' && !timesPerWeek)) return { outcome: 'invalid' };
    const { rules } = readRules();

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE habits';
    const upd = stmt(
      `UPDATE habits
          SET name = ?, schedule_type = ?, weekday_mask = ?, times_per_week = ?, target_count = ?, unit = ?,
              points_success = ?, points_penalty = ?, reminder_time = ?, updated_at = unixepoch()
        WHERE id = ? AND user_id = ?`,
    ).run(
      patch.name ?? h.name,
      scheduleType,
      weekdayMask,
      timesPerWeek,
      patch.targetCount ?? h.targetCount,
      patch.unit !== undefined ? patch.unit : h.unit,
      patch.pointsSuccess ?? h.pointsSuccess,
      patch.pointsPenalty ?? h.pointsPenalty,
      patch.reminderTime !== undefined ? patch.reminderTime : h.reminderTime,
      habitId,
      userId,
    );
    if (upd.changes === 0) return { outcome: 'missing' };
    const today = todayFor(prefs, Date.now());
    return { outcome: 'applied', habit: habitView(userId, habitRow(userId, habitId), today, rules) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ archiveHabitTx ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Archive (or restore) a habit. An archived habit is not settled (f_app activeHabitsOn); restoring
 * one is a create as far as the live cap is concerned. Archiving again / restoring again is a no-op.
 */
export function archiveHabitTx({ userId, habitId, archived }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the habit (owned)';
    const prefs = readPrefs(userId);
    if (!prefs?.timezone || !prefs.startedOn) return { outcome: 'timezone_required' };
    const h = habitRow(userId, habitId);
    if (!h) return { outcome: 'missing' };
    const { rules } = readRules();
    const today = todayFor(prefs, Date.now());
    if ((h.archivedAt !== null) === archived) return { outcome: 'unchanged', habit: habitView(userId, h, today, rules) };
    if (!archived && countLiveHabits(userId) >= LIFEOS_LIMITS.habits) return { outcome: 'cap', limit: LIFEOS_LIMITS.habits };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE habits (archive)';
    const upd = stmt(
      `UPDATE habits SET archived_at = CASE WHEN ? THEN unixepoch() ELSE NULL END, updated_at = unixepoch()
        WHERE id = ? AND user_id = ?`,
    ).run(archived ? 1 : 0, habitId, userId);
    if (upd.changes === 0) return { outcome: 'missing' };
    return { outcome: 'applied', habit: habitView(userId, habitRow(userId, habitId), today, rules) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ the day's log: count, skip, relapse ═════════════════════════════════════════════════════════ */

/**
 * The shared guard of the three log writes: the account has a day, the habit is the caller's, it is
 * live, it exists on the day, it is scheduled that day, and the day is still open. Returns either
 * a refusal outcome or what the write needs.
 */
function logGuard(userId, habitId, localDate) {
  const prefs = readPrefs(userId);
  if (!prefs?.timezone || !prefs.startedOn) return { refuse: { outcome: 'timezone_required' } };
  const h = habitRow(userId, habitId);
  if (!h) return { refuse: { outcome: 'missing' } };
  if (h.archivedAt !== null) return { refuse: { outcome: 'archived' } };
  const now = Date.now();
  const today = todayFor(prefs, now);
  const date = localDate ?? today;
  const window = editWindow(userId, prefs, date, now, today);
  if (window === 'future') return { refuse: { outcome: 'future' } };
  if (window !== 'open') return { refuse: { outcome: 'locked' } };
  if (date < h.startedOn) return { refuse: { outcome: 'locked' } };
  if (!isScheduledOn(h, date)) return { refuse: { outcome: 'not_scheduled' } };
  return { h, date, today };
}

/** Write the day's log row (insert or update), ownership-scoped. Returns the statement result. */
function upsertLog(userId, habitId, date, count, status) {
  return stmt(
    `INSERT INTO habit_logs (habit_id, user_id, local_date, count, status, done_at)
     SELECT h.id, h.user_id, ?, ?, ?, CASE WHEN ? = 'done' THEN unixepoch() END
       FROM habits h WHERE h.id = ? AND h.user_id = ? AND h.archived_at IS NULL
     ON CONFLICT (habit_id, local_date) DO UPDATE
        SET count = excluded.count,
            status = excluded.status,
            done_at = CASE WHEN excluded.status = 'done' THEN COALESCE(habit_logs.done_at, excluded.done_at) END,
            updated_at = unixepoch()
      WHERE habit_logs.user_id = excluded.user_id`,
  ).run(date, count, status, status, habitId, userId);
}

function logAnswer(userId, h, date, today) {
  const { rules } = readRules();
  return { log: { date, ...(logRow(userId, h.id, date) ?? { count: 0, status: 'pending', doneAt: null }) }, habit: habitView(userId, habitRow(userId, h.id), today, rules) };
}

/**
 * Set a GOOD habit's count for a day (f_app setHabitCount): clamped to [0, target]; at the target
 * the log is 'done'. Absolute, not a delta, so a replayed or doubled request lands on the same
 * state. Un-checking is count 0. Coins are decided at the day close.
 */
export function setHabitCountTx({ userId, habitId, localDate = null, count }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the guard';
    const g = logGuard(userId, habitId, localDate);
    if (g.refuse) return g.refuse;
    if (g.h.kind !== 'good') return { outcome: 'wrong_kind' };
    const clamped = Math.max(0, Math.min(Math.floor(count), g.h.targetCount));
    const status = goodStatusFor(clamped, g.h.targetCount);

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPSERT habit_logs (count)';
    const w = upsertLog(userId, habitId, g.date, clamped, status);
    if (w.changes === 0) return { outcome: 'missing' };
    return { outcome: 'applied', ...logAnswer(userId, g.h, g.date, g.today) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/** Skip a GOOD habit for a day (f_app skipHabit): no coins, no penalty, the streak holds. */
export function skipHabitTx({ userId, habitId, localDate = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the guard';
    const g = logGuard(userId, habitId, localDate);
    if (g.refuse) return g.refuse;
    if (g.h.kind !== 'good') return { outcome: 'wrong_kind' };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPSERT habit_logs (skip)';
    const w = upsertLog(userId, habitId, g.date, 0, 'skipped');
    if (w.changes === 0) return { outcome: 'missing' };
    return { outcome: 'applied', ...logAnswer(userId, g.h, g.date, g.today) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Set a BAD habit's relapses for a day (f_app recordRelapse, as an absolute count so a replay is
 * harmless; "undo one" is the count minus one). The day's penalty is min(count x penalty x factor,
 * daily relapse cap), taken when the day settles.
 */
export function recordRelapseTx({ userId, habitId, localDate = null, count }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the guard';
    const g = logGuard(userId, habitId, localDate);
    if (g.refuse) return g.refuse;
    if (g.h.kind !== 'bad') return { outcome: 'wrong_kind' };
    const n = Math.max(0, Math.min(Math.floor(count), 100));

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPSERT habit_logs (relapse)';
    const w = upsertLog(userId, habitId, g.date, n, n > 0 ? 'relapse' : 'pending');
    if (w.changes === 0) return { outcome: 'missing' };
    return { outcome: 'applied', ...logAnswer(userId, g.h, g.date, g.today) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}
