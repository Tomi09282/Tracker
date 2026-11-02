// src/db/tx/lifeos.js — the LifeOS core's named worker transactions and reads (migration 031).
//
// Runs INSIDE a Piscina worker: worker.js re-exports this module (`export * from './tx/lifeos.js'`)
// and Piscina resolves a task by export name, so every name the facade passes (src/db/index.js) is
// an `export function` here. check-route-tx proves each facade name resolves; check-worker-tx and
// check-admin-audit read this file through scripts/lib/worker-sources.mjs.
//
// ═══ THE RULES EVERY FUNCTION BELOW KEEPS ══════════════════════════════════════════════════════
//
//   * ONE logical read or write = ONE worker call. A transaction never spans two pool calls.
//   * IMMEDIATE transactions (`tx.immediate()`): the write lock is taken on the first statement,
//     so every read that decides a payout happens under the same lock as the payout.
//   * ADR-0005: better-sqlite3 COMMITS ON RETURN. Every check that can refuse runs BEFORE the first
//     write; after it nothing returns conditionally, and an invariant that fails THROWS.
//   * Prepared statements with bound parameters only; the SQL text never varies with input.
//   * Every coin movement goes through postCoinEvent: cap -> event -> ledger. Nothing else here
//     inserts into coin_events or coin_ledger.
//   * "Now" is the worker's own clock — never a value from a request.
import { getDb, stmt, rethrow } from '../conn.js';
import { activeEvent, earnedOn, lastSettled, postCoinEvent, readPrefs, readRules, readStartedPrefs } from '../lifeos-ledger.js';
import { habitViews, lapseHabits, lapseTasks, settleHabitsOn, settleTasksOn, taskLists } from '../lifeos-items.js';
import { drawState } from '../lifeos-rewards-items.js';
import {
  addDaysToKey,
  calendarKeyFor,
  dayKeyFor,
  dayStartInstant,
  dueDays,
  epochDay,
  offsetMs,
  settledThroughFor,
  weekdayIndex,
  SETTLE_DELAY_MS,
} from '../../lifeos/dates.js';
import {
  evaluateKcal,
  levelProgress,
  parseStoredRules,
  pointRulesSchema,
  pointsToMinor,
  workoutPoints,
  RULE_KEYS,
  taskPointRules,
} from '../../lifeos/rules.js';
import { workoutDueOn } from '../../plans/occurrences.js';
import { loadOccurrences, nextEventFor, workoutDoneOn, workoutView } from '../lifeos-calendar.js';
import { DAY_KCAL_EATEN_SQL, DAY_TARGETS_SQL } from '../../nutrition/daySql.js';
import { todayFocusFor } from '../lifeos-focus-views.js';

/* ══ shared reads (helpers, not tasks: NOT exported, so Piscina cannot be asked to run them) ══ */

/** The moment the NEXT day settles, for the per-process memo in src/lifeos/settle.js. */
function nextSettleAt(settledThrough, prefs) {
  return dayStartInstant(addDaysToKey(settledThrough, 2), prefs.timezone, prefs.dayStartHour).getTime() + SETTLE_DELAY_MS;
}

/** The wallet as the Érmék screen reads it: balance (may be < 0), spendable, XP, level, the week. */
function walletView(userId, prefs, rules, nowMs) {
  const balanceMinor = stmt('SELECT balance_minor FROM coin_wallets WHERE user_id = ?').get(userId)?.balance_minor ?? 0;
  const xpMinor = stmt('SELECT COALESCE(SUM(xp_minor), 0) AS n FROM coin_events WHERE user_id = ?').get(userId).n;
  const xp = Math.floor(Math.max(0, xpMinor) / 100);
  const { level, floorXp, nextXp } = levelProgress(xp);

  let today = null;
  let week = [];
  let todayEarnedMinor = null;
  if (prefs?.timezone) {
    today = dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);
    todayEarnedMinor = earnedOn(userId, today);
    const monday = addDaysToKey(today, -weekdayIndex(today));
    const sunday = addDaysToKey(monday, 6);
    const rows = stmt(
      `SELECT local_date AS date, SUM(amount_minor) AS netMinor FROM coin_events
        WHERE user_id = ? AND local_date >= ? AND local_date <= ?
        GROUP BY local_date`,
    ).all(userId, monday, sunday);
    const byDate = new Map(rows.map((r) => [r.date, r.netMinor]));
    week = Array.from({ length: 7 }, (_, i) => {
      const date = addDaysToKey(monday, i);
      return { date, netMinor: byDate.get(date) ?? 0, future: date > today };
    });
  }
  const settleHour = ((prefs?.dayStartHour ?? 4) + SETTLE_DELAY_MS / 3600000) % 24;
  return {
    balanceMinor,
    spendableMinor: Math.max(0, balanceMinor),
    xp,
    level,
    bounds: { levelFloorXp: floorXp, nextLevelXp: nextXp },
    dailyEarnCapMinor: pointsToMinor(rules.dailyEarnCap),
    todayEarnedMinor,
    today,
    week,
    settleTime: `${String(settleHour).padStart(2, '0')}:00`,
  };
}

/* ══ reads ═══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * What ensureSettled needs to decide which days are due: one read, one snapshot.
 */
export function lifeosSettleStateQuery({ userId }) {
  try {
    const prefs = readStartedPrefs(userId);
    if (!prefs?.timezone || !prefs.startedOn) return { started: false };
    const now = Date.now();
    const settledThrough = settledThroughFor(now, prefs.timezone, prefs.dayStartHour);
    const lastClosed = lastSettled(userId);
    return {
      started: true,
      startedOn: prefs.startedOn,
      lastClosed,
      settledThrough,
      nextSettleAt: nextSettleAt(settledThrough, prefs),
      due: dueDays({ lastClosed, startedOn: prefs.startedOn, settledThrough }),
    };
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /me/prefs and the PATCH answer. */
function prefsView(userId) {
  const prefs = readPrefs(userId);
  if (!prefs) return null;
  const now = Date.now();
  const tz = prefs.timezone;
  return {
    timezone: tz,
    dayStartHour: prefs.dayStartHour,
    startedOn: prefs.startedOn,
    utcOffsetMinutes: tz ? Math.round(offsetMs(now, tz) / 60000) : null,
    today: tz ? dayKeyFor(now, tz, prefs.dayStartHour) : null,
    // The next moment the zone may change (null = it may change now).
    timezoneChangeableAt:
      tz && prefs.timezoneSetAt && now / 1000 - prefs.timezoneSetAt < 86400
        ? (prefs.timezoneSetAt + 86400) * 1000
        : null,
  };
}

export function userPrefsQuery({ userId }) {
  try {
    return prefsView(userId);
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /lifeos/today (Phase-2 fields). One read snapshot. */
export function lifeosTodayQuery({ userId }) {
  try {
    const prefs = readStartedPrefs(userId);
    if (!prefs) return null;
    const { version, rules } = readRules();
    const now = Date.now();
    const tz = prefs.timezone;
    // The date a workout started NOW is logged on (workout_logs.local_date is the calendar date in
    // the user's zone, src/plans/schedule.js localDateFor) — UTC while no zone is stored.
    const workoutDate = tz ? calendarKeyFor(now, tz) : new Date(now).toISOString().slice(0, 10);
    const occurrences = loadOccurrences(userId, workoutDate, 1).filter((o) => o.date === workoutDate);
    const settledThrough = tz ? settledThroughFor(now, tz, prefs.dayStartHour) : null;
    return {
      started: Boolean(tz && prefs.startedOn),
      timezone: tz,
      dayStartHour: prefs.dayStartHour,
      startedOn: prefs.startedOn,
      today: tz ? dayKeyFor(now, tz, prefs.dayStartHour) : null,
      settledThrough: prefs.startedOn && settledThrough && settledThrough >= prefs.startedOn ? settledThrough : null,
      rulesVersion: version,
      // B-lifeos-polish: the capture sheet's priority picker ("Alacsony 5 / Közepes 10 / Fontos 20").
      taskRules: taskPointRules(rules),
      wallet: walletView(userId, prefs, rules, now),
      workout: {
        date: workoutDate,
        due: workoutDueOn(occurrences, workoutDate),
        done: Boolean(workoutDoneOn(userId, workoutDate, rules.workoutHalfPct)),
        pointsFull: rules.workoutComplete,
        occurrences: occurrences.map(workoutView),
      },
      // Phase 5 (034): Ma's KÖVETKEZŐ line — the next event that starts after now, within 7 days.
      nextEvent: prefs.startedOn ? nextEventFor(userId, prefs, now) : null,
      ...todayItems(userId, prefs, rules, now),
      // Phase 4 (033): the day's challenge draw — read only; the client draws on 'due'.
      challenge: tz && prefs.startedOn ? drawState(userId, dayKeyFor(now, tz, prefs.dayStartHour)) : null,
      // Phase 6: Ma's FÓKUSZ block (migration 035).
      focus: todayFocusFor(userId, prefs, rules, now),
    };
  } catch (err) {
    return rethrow(err);
  }
}

/**
 * The Phase-3 half of the Ma screen: the habits drawn on today (live ones scheduled today, plus the
 * bad habits, which are shown every day) and today's tasks — open ones due today, overdue ones (with
 * the penalty a settled day already took), the count completed today. Before a zone is set there
 * is no logical today, so both are empty.
 */
function todayItems(userId, prefs, rules, nowMs) {
  if (!prefs.timezone || !prefs.startedOn) {
    return { habits: [], tasks: { due: [], overdue: [], completedToday: [], anytimeCount: 0, openCount: 0 } };
  }
  const today = dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);
  const habits = habitViews(userId, today, rules).filter((h) => !h.archived && (h.scheduledToday || h.kind === 'bad'));
  const lists = taskLists(userId, today, prefs, rules, nowMs);
  return {
    habits,
    tasks: {
      due: lists.due,
      overdue: lists.overdue,
      completedToday: lists.completedToday,
      anytimeCount: lists.anytime.length,
      openCount: lists.openCount,
    },
  };
}

/** GET /coins/wallet. */
export function walletQuery({ userId }) {
  try {
    const prefs = readStartedPrefs(userId);
    const { rules } = readRules();
    return walletView(userId, prefs, rules, Date.now());
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /admin/rules: the rule set in force, who wrote it and when. */
export function pointRulesQuery() {
  try {
    const row = stmt(
      `SELECT s.id AS version, s.rules_json, s.note, s.created_at AS createdAt,
              u.display_name AS createdByName
         FROM point_rule_sets s LEFT JOIN users u ON u.id = s.created_by
        ORDER BY s.id DESC LIMIT 1`,
    ).get();
    if (!row) return null;
    const { rules_json: json, ...rest } = row;
    return { ...rest, rules: parseStoredRules(json) };
  } catch (err) {
    return rethrow(err);
  }
}

/* ══ setUserPrefsTx — PATCH /me/prefs ════════════════════════════════════════════════════════════ */

/**
 * The timezone and the day start.
 *
 *   * The zone changes at most once per 24 h (trg_user_prefs_timezone_daily is the backstop): a
 *     zone switch moves "today", and switching back and forth is a way to live one day twice.
 *     Every change is AUDITED (plan: "tz change <= 1/24 h, audited").
 *   * The first time a zone is known, LifeOS starts: lifeos_started_on = the logical today. Days
 *     before it never settle. Written once (trg_user_prefs_started_once).
 *   * The same zone again is a no-op for the zone (the client re-sends the browser zone on every
 *     open), so it never spends the 24 h allowance.
 */
export function setUserPrefsTx({ userId, timezone, dayStartHour, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs) return { outcome: 'missing' };

    const tzChanged = timezone !== undefined && timezone !== prefs.timezone;
    const dshChanged = dayStartHour !== undefined && dayStartHour !== prefs.dayStartHour;
    const now = Date.now();
    if (tzChanged && prefs.timezone && prefs.timezoneSetAt && now / 1000 - prefs.timezoneSetAt < 86400) {
      return { outcome: 'too_soon', changeableAt: (prefs.timezoneSetAt + 86400) * 1000 };
    }

    const nextTz = tzChanged ? timezone : prefs.timezone;
    const nextDsh = dshChanged ? dayStartHour : prefs.dayStartHour;
    const startOn = !prefs.startedOn && nextTz ? dayKeyFor(now, nextTz, nextDsh) : null;

    // NEVER BACK ONTO A SETTLED DAY (security review LifeOS, attacks 02 / 02b / 11): a zone switch
    // westwards, or a day-start change across a DST night, can make the new logical "today" a day
    // that already has its daily_summaries row (or was already settled by the clock under the old
    // boundary, or lies before the LifeOS start). Every write keyed on "today" — a focus payout, a
    // task completion, a challenge draw — would then land on a closed day and use its spent cap
    // again. The change is refused until the new boundary's today is past every settled day; the
    // answer says when that is.
    if (prefs.startedOn && nextTz && (tzChanged || dshChanged)) {
      const newToday = dayKeyFor(now, nextTz, nextDsh);
      const floors = [lastSettled(userId), addDaysToKey(prefs.startedOn, -1)];
      if (prefs.timezone) floors.push(settledThroughFor(now, prefs.timezone, prefs.dayStartHour));
      const floor = floors.filter(Boolean).sort().pop();
      if (newToday <= floor) {
        return {
          outcome: 'day_settled',
          changeableAt: dayStartInstant(addDaysToKey(floor, 1), nextTz, nextDsh).getTime(),
        };
      }
    }

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE user_prefs';
    const upd = stmt(
      `UPDATE user_prefs
          SET timezone = ?,
              timezone_set_at = CASE WHEN ? THEN unixepoch() ELSE timezone_set_at END,
              day_start_hour = ?,
              lifeos_started_on = COALESCE(lifeos_started_on, ?),
              updated_at = unixepoch()
        WHERE user_id = ?`,
    ).run(nextTz, tzChanged ? 1 : 0, nextDsh, startOn, userId);
    if (upd.changes !== 1) throw new Error('setUserPrefsTx: the prefs row vanished under the lock');

    if (tzChanged) {
      current = 'INSERT audit_log (timezone)';
      stmt(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
         VALUES (?, 'lifeos.prefs.timezone', 'user', ?, ?, ?, ?)`,
      ).run(userId, userId, JSON.stringify({ from: prefs.timezone, to: nextTz }), requestId, ip);
    }
    if (dshChanged) {
      current = 'INSERT audit_log (day start)';
      stmt(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
         VALUES (?, 'lifeos.prefs.day_start', 'user', ?, ?, ?, ?)`,
      ).run(userId, userId, JSON.stringify({ from: prefs.dayStartHour, to: nextDsh }), requestId, ip);
    }

    current = 'SELECT the view';
    return { outcome: 'applied', prefs: prefsView(userId) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ setPointRulesTx — PUT /admin/rules ══════════════════════════════════════════════════════════ */

/**
 * Append a new rule set. The most consequential admin write in LifeOS: it decides what every user
 * earns from the next day close on.
 *
 *   * THE ROLE AND SESSION ARE RE-READ HERE, under the write lock (adminAdjustCoinsTx's shape): a
 *     JWT that says admin is a fifteen-minute-old hint; assertAdmin in the route is a separate pool
 *     call. The guarded INSERT repeats both, so the WRITE is gated, not just preceded by a check.
 *   * expectedVersion is an optimistic lock: two admins editing at once — the second is told the
 *     rules moved under them (409 with the current version), never silently overwrites.
 *   * The rules are validated again with the route's schema: a worker never trusts its caller.
 *   * Audited with the per-key diff.
 */
export function setPointRulesTx({
  actorId, actorSessionVersion, rules, note = null, expectedVersion, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the actor (DB-side role + session re-check)';
    const actor = stmt(
      'SELECT id, role, session_version FROM users WHERE id = ? AND disabled_at IS NULL',
    ).get(actorId);
    if (!actor || actor.role !== 'admin') return { outcome: 'forbidden' };
    if (actor.session_version !== actorSessionVersion) return { outcome: 'forbidden' };

    const parsed = pointRulesSchema.safeParse(rules);
    if (!parsed.success) return { outcome: 'invalid' };

    current = 'SELECT the rule set in force';
    const { version, rules: before } = readRules();
    if (version !== expectedVersion) return { outcome: 'stale', currentVersion: version };

    // Canonical key order, so equal rule sets are equal strings.
    const next = Object.fromEntries(RULE_KEYS.map((k) => [k, parsed.data[k]]));
    const changed = Object.fromEntries(
      RULE_KEYS.filter((k) => before[k] !== next[k]).map((k) => [k, [before[k], next[k]]]),
    );
    if (Object.keys(changed).length === 0) return { outcome: 'unchanged', version };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT point_rule_sets (role, session and version guards inside the statement)';
    const ins = stmt(
      `INSERT INTO point_rule_sets (rules_json, note, created_by)
       SELECT ?, ?, a.id FROM users a
        WHERE a.id = ? AND a.role = 'admin' AND a.session_version = ? AND a.disabled_at IS NULL
          AND (SELECT MAX(id) FROM point_rule_sets) = ?`,
    ).run(JSON.stringify(next), note, actorId, actorSessionVersion, expectedVersion);
    // The ADR-0005 exemption: the first and only write so far matched nothing, so committing
    // commits nothing. Every predicate was read above under the same lock; this cannot fire.
    if (ins.changes === 0) return { outcome: 'stale', currentVersion: version };
    const newVersion = Number(ins.lastInsertRowid);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'lifeos.rules.set', 'point_rule_set', ?, ?, ?, ?)`,
    ).run(actorId, newVersion, JSON.stringify({ from: version, changed, note }), requestId, ip);

    current = 'SELECT the view';
    return { outcome: 'applied', view: pointRulesQuery() };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ the day close ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * Settle ONE logical day: habits (f_app settleHabit — freeze, miss, partial >= 50 %, relapse cap,
 * the times-per-week Sunday quota, streak, milestones OUTSIDE the daily cap, freezes earned; see
 * src/lifeos/habits.js), overdue tasks, the kcal outcome, the workout due / done, the perfect day.
 *
 * ORDER OF WRITES: habit results and every coin event first, the summary row LAST.
 *
 * Idempotent per (user, day): daily_summaries' PRIMARY KEY. Due-ness is decided HERE, from the
 * worker's clock and the stored prefs — never from the caller's say-so: the day must be settled
 * (start of the next day + 6 h has passed), on or after the LifeOS start, and the previous day must
 * already be settled, so days close in order and a gap cannot be skipped over.
 *
 * Perfect day = a habit that counts or the scheduled workout exists, every counted habit was done,
 * every task due was completed, the scheduled workout was done (the owner's economy sheet: the
 * perfect day NEEDS the scheduled workout), and the kcal goal held when meals were tracked against
 * a target (perfectDayNeedsKcal). f_app requires at least one habit; here the scheduled workout
 * anchors a day too, as Phase 2 already settled it. Tasks alone never make a perfect day.
 */
export function closeLifeDayTx({ userId, localDate, requestId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readStartedPrefs(userId);
    if (!prefs?.timezone || !prefs.startedOn) return { outcome: 'not_started' };
    if (localDate < prefs.startedOn) return { outcome: 'not_due' };
    const settledThrough = settledThroughFor(Date.now(), prefs.timezone, prefs.dayStartHour);
    if (localDate > settledThrough) return { outcome: 'not_due' };

    current = 'SELECT the summary (idempotency)';
    const existing = stmt(
      'SELECT status FROM daily_summaries WHERE user_id = ? AND local_date = ?',
    ).get(userId, localDate);
    if (existing) return { outcome: 'already', status: existing.status };
    if (localDate > prefs.startedOn) {
      const prev = stmt(
        'SELECT 1 FROM daily_summaries WHERE user_id = ? AND local_date = ?',
      ).get(userId, addDaysToKey(localDate, -1));
      if (!prev) return { outcome: 'gap' };
    }

    current = 'SELECT the rules';
    const { version, rules } = readRules();

    current = 'SELECT the workout';
    const workoutDue = workoutDueOn(loadOccurrences(userId, localDate, 1), localDate) ? 1 : 0;
    const workoutDone = workoutDoneOn(userId, localDate, rules.workoutHalfPct);

    current = 'SELECT the nutrition';
    const target = stmt(DAY_TARGETS_SQL).get(localDate, userId, localDate);
    const eaten = stmt(DAY_KCAL_EATEN_SQL).get(userId, localDate);
    const targetX10 = target?.kcal_target_x10 ?? null;
    const kcalOutcome = evaluateKcal({
      eaten: eaten.kcal_eaten_x10,
      target: targetX10,
      tolerancePct: prefs.kcalTolerancePct,
    });

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    const ctx = { userId, date: localDate, rules, rulesVersion: version, requestId };
    current = 'settle the habits (results + coins)';
    // A habit archived during the day still settles it (security review LifeOS 12).
    const bounds = {
      dayStart: Math.floor(dayStartInstant(localDate, prefs.timezone, prefs.dayStartHour).getTime() / 1000),
      nextDayStart: Math.floor(dayStartInstant(addDaysToKey(localDate, 1), prefs.timezone, prefs.dayStartHour).getTime() / 1000),
    };
    const habits = settleHabitsOn({ ...ctx, bounds });
    current = 'settle the tasks (overdue + counts)';
    const tasks = settleTasksOn(ctx);

    const mealsTracked = targetX10 !== null && eaten.entries > 0;
    const kcalOk = rules.perfectDayNeedsKcal !== 1 || !mealsTracked || kcalOutcome === 'hit';
    // Something to be perfect ABOUT: a habit that counts or the scheduled workout. Tasks alone do
    // not make a day perfect (f_app requires a habit; "a task due today, ticked" would otherwise
    // be a 25-coin perfect day on demand).
    // Security review LifeOS 05(a): the anchor is something the user DID — a good habit that counts or
    // the scheduled workout. A bad habit is clean by default, so "one bad habit, nothing else" was a
    // 25-coin perfect day every day with zero effort. Bad habits still count for "every habit".
    const anchor = habits.goodScheduled > 0 || workoutDue === 1;
    const allDone =
      habits.done === habits.scheduled && tasks.done === tasks.due && (!workoutDue || workoutDone === 1);
    const perfect = anchor && allDone && kcalOk ? 1 : 0;

    const day = { localDate, sourceType: 'day', sourceId: epochDay(localDate), rules, rulesVersion: version, requestId, userId };
    const events = [...habits.events, ...tasks.events];
    current = 'postCoinEvent (kcal)';
    if (kcalOutcome === 'hit') {
      events.push(postCoinEvent({ ...day, reasonKey: 'day.kcal_hit', amountMinor: pointsToMinor(rules.kcalGoalHit) }));
    } else if (kcalOutcome === 'over') {
      events.push(postCoinEvent({ ...day, reasonKey: 'day.kcal_over', amountMinor: -pointsToMinor(rules.kcalGoalMissed) }));
    }
    current = 'postCoinEvent (perfect day)';
    if (perfect === 1) {
      events.push(postCoinEvent({ ...day, reasonKey: 'day.perfect', amountMinor: pointsToMinor(rules.perfectDay) }));
    }

    // LAST: the summary. A habit result cannot be added to a day whose summary exists
    // (trg_habit_result_settled), and this primary key rolls a concurrent second close back whole.
    current = 'INSERT daily_summaries';
    stmt(
      `INSERT INTO daily_summaries
         (user_id, local_date, status, workout_due, workout_done, kcal_target_x10, kcal_eaten_x10,
          kcal_outcome, habits_scheduled, habits_done, tasks_due, tasks_done, perfect_day, rules_version)
       VALUES (?, ?, 'closed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId, localDate, workoutDue, workoutDone, targetX10,
      kcalOutcome === 'no_data' ? null : eaten.kcal_eaten_x10, kcalOutcome,
      habits.scheduled, habits.done, tasks.due, tasks.done, perfect, version,
    );

    return {
      outcome: 'closed',
      localDate,
      workoutDue: workoutDue === 1,
      workoutDone: workoutDone === 1,
      kcalOutcome,
      habitsScheduled: habits.scheduled,
      habitsDone: habits.done,
      tasksDue: tasks.due,
      tasksDone: tasks.done,
      tasksOverdue: tasks.overdue,
      perfectDay: perfect === 1,
      events: events.filter(Boolean),
    };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Lapse every day OLDER than the catch-up window (plan L6): a row, no coins, no penalty — and the
 * streaks reset: one 'lapsed' habit result per live habit on the LAST lapsed day (written before
 * that day's summary), and the tasks that went overdue inside the gap are marked without a penalty.
 * Which days is decided here from the stored state, not taken from the caller. At most 3660 rows.
 */
export function markLapsedDaysTx({ userId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readStartedPrefs(userId);
    if (!prefs?.timezone || !prefs.startedOn) return { outcome: 'not_started', lapsed: [] };
    const settledThrough = settledThroughFor(Date.now(), prefs.timezone, prefs.dayStartHour);
    const { lapse } = dueDays({ lastClosed: lastSettled(userId), startedOn: prefs.startedOn, settledThrough });
    const days = lapse.slice(0, 3660);
    if (days.length === 0) return { outcome: 'applied', lapsed: [], habits: 0, tasks: 0 };
    const { version } = readRules();
    const lastLapsed = days[days.length - 1];

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT habit_day_results (lapsed)';
    const habits = lapseHabits({ userId, lastLapsed, rulesVersion: version });
    current = 'UPDATE tasks (overdue inside the gap, no penalty)';
    const tasks = lapseTasks({ userId, lastLapsed });
    current = 'INSERT daily_summaries (lapsed)';
    const ins = stmt(
      `INSERT INTO daily_summaries (user_id, local_date, status, rules_version) VALUES (?, ?, 'lapsed', ?)`,
    );
    for (const d of days) ins.run(userId, d, version);
    return { outcome: 'applied', lapsed: days, habits, tasks };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ awardWorkoutTx — after POST /workouts/:id/finish ════════════════════════════════════════════ */

/**
 * Pay a completed workout (f_app workoutPoints: full at >= workoutFullPct of the sets, half at
 * >= workoutHalfPct). Fire-and-forget after the finish has committed, like the achievement
 * evaluator: a coin that did not land must never fail the workout.
 *
 *   * Owned: the log is read WHERE id = ? AND client_user_id = ?.
 *   * Once: the event's natural key (workout_log, id) — a replay answers 'already'.
 *   * Only while the day is open: a workout dated on a day that has settled pays nothing (L4).
 *   * Completion is counted from the stored sets (working sets, not voided), never from a client
 *     figure.
 */
export function awardWorkoutTx({ userId, logId, requestId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readStartedPrefs(userId);
    if (!prefs?.timezone || !prefs.startedOn) return { outcome: 'not_started' };

    current = 'SELECT the log';
    const log = stmt(
      `SELECT id, local_date AS localDate, status FROM workout_logs WHERE id = ? AND client_user_id = ?`,
    ).get(logId, userId);
    if (!log || log.status !== 'completed') return { outcome: 'missing' };
    if (log.localDate < prefs.startedOn) return { outcome: 'before_start' };
    const settledThrough = settledThroughFor(Date.now(), prefs.timezone, prefs.dayStartHour);
    const summary = stmt('SELECT 1 FROM daily_summaries WHERE user_id = ? AND local_date = ?').get(userId, log.localDate);
    if (summary || log.localDate <= settledThrough) return { outcome: 'settled' };

    const live = activeEvent(userId, 'workout.completed', 'workout_log', log.id);
    if (live) return { outcome: 'already', eventId: live.id, amountMinor: live.amountMinor };

    current = 'SELECT the sets';
    const sets = stmt(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS done
         FROM workout_log_sets
        WHERE log_id = ? AND client_user_id = ? AND voided_at IS NULL AND set_kind <> 'warmup'`,
    ).get(log.id, userId);
    const completionPct = sets.total > 0 ? Math.floor(((sets.done ?? 0) * 100) / sets.total) : 0;

    const { version, rules } = readRules();
    const points = workoutPoints({ completionPct }, rules);
    if (points <= 0) return { outcome: 'nothing', completionPct };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'postCoinEvent (workout)';
    const ev = postCoinEvent({
      userId,
      reasonKey: 'workout.completed',
      amountMinor: pointsToMinor(points),
      localDate: log.localDate,
      sourceType: 'workout_log',
      sourceId: log.id,
      rules,
      rulesVersion: version,
      requestId,
    });
    return { outcome: ev ? 'awarded' : 'capped', completionPct, event: ev };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}
