// src/db/tx/lifeos-stats.js — the LifeOS statistics reads (Haladás > Napok, plan Phase 6).
//
// Runs INSIDE a Piscina worker (re-exported by worker.js). Two READS, each ONE worker call in ONE
// read transaction (a consistent snapshot: the day columns, the week rows and the habit bars of one
// answer cannot disagree because a settle committed between two of them). Nothing here writes.
//
// Ports of f_app src/domain/stats.ts:
//   pointsHistory  -> the day rows (GET /lifeos/days, and the 14 columns of GET /lifeos/stats)
//   weeklyPoints   -> stats.weeks (net per ISO week, perfect days, penalties)
//   habitHeatmap   -> stats.habits (one SegmentBar per live habit over the settled days)
//   kcalHistory    -> stats.kcal (the KALÓRIA chart and its caption)
//   overview       -> stats.overview (XP, level, days tracked, perfect days, workouts, focus, streaks)
//
// Closed days come from daily_summaries and coin_events; days not settled yet are computed live
// where it is cheap and exact (kcal from the shared nutrition SQL, the workout done flag, focus).
// Every number is keyed on the caller's user id; LifeOS data is private (plan L10).
import { getDb, stmt, rethrow } from '../conn.js';
import { readStartedPrefs, readRules } from '../lifeos-ledger.js';
import { habitViews } from '../lifeos-items.js';
import { addDaysToKey, dayKeyFor, dayRange, weekdayIndex } from '../../lifeos/dates.js';
import { evaluateKcal, levelProgress, pointsToMinor } from '../../lifeos/rules.js';
import { habitCellState, isoWeek, kcalOf, mondayOf, STATS_DAYS } from '../../lifeos/stats.js';
import { DAY_KCAL_EATEN_SQL, DAY_TARGETS_SQL } from '../../nutrition/daySql.js';

function started(prefs) {
  return Boolean(prefs?.timezone && prefs.startedOn);
}

/**
 * The day rows of [from, to] (ascending), as f_app pointsHistory plus the settled day's facts:
 * { date, status, netMinor, earnedMinor, lostMinor, penalties, perfect, workoutDue, workoutDone,
 *   kcalTarget, kcalEaten, kcalOutcome, habitsScheduled, habitsDone, tasksDue, tasksDone,
 *   focusMinutes }. status: closed | lapsed (settled) · open (not settled yet) · before_start ·
 * future. Movements are summed by their LOGICAL day, reversals included (a reopened task nets 0).
 */
function dayRows(userId, prefs, from, to, today) {
  const summaries = new Map(
    stmt(
      `SELECT local_date AS date, status, workout_due AS workoutDue, workout_done AS workoutDone,
              kcal_target_x10 AS kcalTargetX10, kcal_eaten_x10 AS kcalEatenX10, kcal_outcome AS kcalOutcome,
              habits_scheduled AS habitsScheduled, habits_done AS habitsDone, tasks_due AS tasksDue,
              tasks_done AS tasksDone, perfect_day AS perfect
         FROM daily_summaries WHERE user_id = ? AND local_date >= ? AND local_date <= ?`,
    ).all(userId, from, to).map((r) => [r.date, r]),
  );
  const money = new Map(
    stmt(
      `SELECT local_date AS date, SUM(amount_minor) AS net,
              SUM(CASE WHEN amount_minor > 0 THEN amount_minor ELSE 0 END) AS earned,
              SUM(CASE WHEN amount_minor < 0 THEN -amount_minor ELSE 0 END) AS lost,
              SUM(CASE WHEN amount_minor < 0 AND reverses_event_id IS NULL THEN 1 ELSE 0 END) AS penalties
         FROM coin_events WHERE user_id = ? AND local_date >= ? AND local_date <= ?
        GROUP BY local_date`,
    ).all(userId, from, to).map((r) => [r.date, r]),
  );
  const focus = new Map(
    stmt(
      `SELECT closed_on AS date, SUM(paid_minutes) AS minutes FROM focus_sessions
        WHERE user_id = ? AND status = 'done' AND closed_on >= ? AND closed_on <= ?
        GROUP BY closed_on`,
    ).all(userId, from, to).map((r) => [r.date, r.minutes]),
  );

  return dayRange(from, to).map((date) => {
    const m = money.get(date);
    const s = summaries.get(date);
    const base = {
      date,
      netMinor: m?.net ?? 0,
      earnedMinor: m?.earned ?? 0,
      lostMinor: m?.lost ?? 0,
      penalties: m?.penalties ?? 0,
      focusMinutes: focus.get(date) ?? 0,
    };
    if (s) {
      return {
        ...base,
        status: s.status,
        perfect: s.perfect === 1,
        workoutDue: s.workoutDue === null ? null : s.workoutDue === 1,
        workoutDone: s.workoutDone === null ? null : s.workoutDone === 1,
        kcalTarget: kcalOf(s.kcalTargetX10),
        kcalEaten: kcalOf(s.kcalEatenX10),
        kcalOutcome: s.kcalOutcome,
        habitsScheduled: s.habitsScheduled,
        habitsDone: s.habitsDone,
        tasksDue: s.tasksDue,
        tasksDone: s.tasksDone,
      };
    }
    const status = date > today ? 'future' : !prefs.startedOn || date < prefs.startedOn ? 'before_start' : 'open';
    const empty = {
      ...base,
      status,
      perfect: false,
      workoutDue: null,
      workoutDone: null,
      kcalTarget: null,
      kcalEaten: null,
      kcalOutcome: null,
      habitsScheduled: null,
      habitsDone: null,
      tasksDue: null,
      tasksDone: null,
    };
    if (status !== 'open') return empty;
    // Not settled yet: what is exact now. Workouts and nutrition keep CALENDAR dates; for a day
    // not settled yet the logical key is the calendar date the close will read (closeLifeDayTx).
    const target = stmt(DAY_TARGETS_SQL).get(date, userId, date);
    const eaten = stmt(DAY_KCAL_EATEN_SQL).get(userId, date);
    const targetX10 = target?.kcal_target_x10 ?? null;
    const outcome = evaluateKcal({ eaten: eaten.kcal_eaten_x10, target: targetX10, tolerancePct: prefs.kcalTolerancePct });
    const done = stmt(
      `SELECT 1 FROM workout_logs WHERE client_user_id = ? AND local_date = ? AND status = 'completed' LIMIT 1`,
    ).get(userId, date);
    return {
      ...empty,
      workoutDone: Boolean(done),
      kcalTarget: kcalOf(targetX10),
      kcalEaten: outcome === 'no_data' ? null : kcalOf(eaten.kcal_eaten_x10),
      kcalOutcome: outcome,
    };
  });
}

/* ══ GET /lifeos/days ════════════════════════════════════════════════════════════════════════════ */

/**
 * The day rows of a range the route has already bounded (from <= to, at most 92 days), or — with
 * from / to null — of the last 14 logical days. Before a zone is set there is no logical today:
 * started false, no rows.
 */
export function lifeosDaysQuery({ userId, from = null, to = null }) {
  const conn = getDb();
  const read = conn.transaction(() => {
    const prefs = readStartedPrefs(userId);
    if (!prefs) return null;
    if (!started(prefs)) return { started: false, today: null, startedOn: null, from, to, days: [] };
    const today = dayKeyFor(Date.now(), prefs.timezone, prefs.dayStartHour);
    const end = to ?? today;
    const start = from ?? addDaysToKey(end, -(STATS_DAYS.default - 1));
    return { started: true, today, startedOn: prefs.startedOn, from: start, to: end, days: dayRows(userId, prefs, start, end, today) };
  });
  try {
    return read.deferred();
  } catch (err) {
    return rethrow(err);
  }
}

/* ══ GET /lifeos/stats ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Haladás > Napok in one snapshot:
 *   week     EZEN A HÉTEN: this ISO week's net, the average per elapsed day, the previous week's net
 *   days     the last `days` day columns ending today (oldest first)
 *   weeks    HETEK: the last `weeks` ISO weeks, newest first — net, perfect days, penalties
 *   habits   SZOKÁSOK: every live habit's streak, multiplier, freezes and its settled days over
 *            the window before today (`days` - 1 cells, oldest first)
 *   kcal     KALÓRIA: the same window's targets and intake, days over the target, the penalty
 *   overview f_app overview: XP, level, balance, days tracked, perfect days, workouts, focus, streaks
 */
export function lifeosStatsQuery({ userId, days, weeks }) {
  const conn = getDb();
  const read = conn.transaction(() => {
    const prefs = readStartedPrefs(userId);
    if (!prefs) return null;
    const { rules } = readRules();
    const overview = overviewOf(userId);
    if (!started(prefs)) {
      return { started: false, today: null, week: null, days: [], weeks: [], habits: null, kcal: null, overview };
    }
    const today = dayKeyFor(Date.now(), prefs.timezone, prefs.dayStartHour);

    // The columns and the weeks read ONE range of day rows: the oldest Monday needed .. today.
    const monday = mondayOf(today);
    const oldestMonday = addDaysToKey(monday, -7 * (weeks - 1));
    const firstColumn = addDaysToKey(today, -(days - 1));
    const prevMonday = addDaysToKey(monday, -7);
    const from = [oldestMonday, firstColumn, prevMonday].sort()[0];
    const rows = dayRows(userId, prefs, from, today, today);
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const sum = (a, b, f) => dayRange(a, b).reduce((n, d) => n + (byDate.get(d)?.[f] ?? 0), 0);

    const elapsed = weekdayIndex(today) + 1;
    const weekNet = sum(monday, today, 'netMinor');
    const week = {
      from: monday,
      to: addDaysToKey(monday, 6),
      netMinor: weekNet,
      avgPerDayMinor: Math.round(weekNet / elapsed),
      daysElapsed: elapsed,
      prevWeekNetMinor: sum(prevMonday, addDaysToKey(prevMonday, 6), 'netMinor'),
    };

    const dayColumns = dayRange(firstColumn, today).map((d) => {
      const r = byDate.get(d);
      return { date: d, status: r.status, netMinor: r.netMinor, earnedMinor: r.earnedMinor, lostMinor: r.lostMinor, perfect: r.perfect };
    });

    const weekRows = Array.from({ length: weeks }, (_, i) => {
      const ws = addDaysToKey(monday, -7 * i);
      const we = addDaysToKey(ws, 6);
      const last = we < today ? we : today;
      const slice = dayRange(ws, last).map((d) => byDate.get(d));
      const { year, week: wk } = isoWeek(ws);
      return {
        weekStart: ws,
        weekEnd: we,
        isoYear: year,
        isoWeek: wk,
        netMinor: slice.reduce((n, r) => n + r.netMinor, 0),
        earnedMinor: slice.reduce((n, r) => n + r.earnedMinor, 0),
        lostMinor: slice.reduce((n, r) => n + r.lostMinor, 0),
        perfectDays: slice.filter((r) => r.perfect).length,
        penalties: slice.reduce((n, r) => n + r.penalties, 0),
        current: i === 0,
      };
    });

    // The settled window: the `days` - 1 days before today (today has not settled).
    const winFrom = firstColumn;
    const winTo = addDaysToKey(today, -1);
    const results = stmt(
      `SELECT habit_id AS habitId, local_date AS date, outcome, count FROM habit_day_results
        WHERE user_id = ? AND local_date >= ? AND local_date <= ?`,
    ).all(userId, winFrom, winTo);
    const cellOf = new Map(results.map((r) => [`${r.habitId}:${r.date}`, r]));
    const windowDays = winFrom <= winTo ? dayRange(winFrom, winTo) : [];
    const habits = {
      from: winFrom,
      to: winTo,
      rows: habitViews(userId, today, rules)
        .filter((h) => !h.archived)
        .map((h) => ({
          id: h.id,
          name: h.name,
          kind: h.kind,
          scheduleType: h.scheduleType,
          streak: h.streak,
          cells: windowDays.map((d) => ({ date: d, state: habitCellState(cellOf.get(`${h.id}:${d}`)) })),
        })),
    };

    const kcalDays = windowDays.map((d) => {
      const r = byDate.get(d);
      return { date: d, targetKcal: r.kcalTarget, eatenKcal: r.kcalEaten, outcome: r.kcalOutcome };
    });
    const withTarget = kcalDays.filter((k) => k.targetKcal !== null);
    const kcal = {
      from: winFrom,
      to: winTo,
      targetKcal: withTarget.length ? withTarget[withTarget.length - 1].targetKcal : null,
      days: kcalDays,
      overDays: kcalDays.filter((k) => k.outcome === 'over').length,
      hitDays: kcalDays.filter((k) => k.outcome === 'hit').length,
      trackedDays: kcalDays.filter((k) => k.outcome === 'hit' || k.outcome === 'over' || k.outcome === 'under').length,
      windowDays: kcalDays.length,
      penaltyMinor: pointsToMinor(rules.kcalGoalMissed),
      rewardMinor: pointsToMinor(rules.kcalGoalHit),
    };

    return { started: true, today, startedOn: prefs.startedOn, week, days: dayColumns, weeks: weekRows, habits, kcal, overview };
  });
  try {
    return read.deferred();
  } catch (err) {
    return rethrow(err);
  }
}

/** f_app overview(), on this schema. */
function overviewOf(userId) {
  const balanceMinor = stmt('SELECT balance_minor FROM coin_wallets WHERE user_id = ?').get(userId)?.balance_minor ?? 0;
  const xpMinor = stmt('SELECT COALESCE(SUM(xp_minor), 0) AS n FROM coin_events WHERE user_id = ?').get(userId).n;
  const xp = Math.floor(Math.max(0, xpMinor) / 100);
  const { level, floorXp, nextXp } = levelProgress(xp);
  const days = stmt(
    `SELECT COUNT(*) AS tracked, COALESCE(SUM(perfect_day), 0) AS perfect
       FROM daily_summaries WHERE user_id = ? AND status = 'closed'`,
  ).get(userId);
  const workouts = stmt(
    `SELECT COUNT(*) AS n FROM workout_logs WHERE client_user_id = ? AND status = 'completed'`,
  ).get(userId).n;
  const focus = stmt(
    `SELECT COUNT(*) AS sessions, COALESCE(SUM(paid_minutes), 0) AS minutes
       FROM focus_sessions WHERE user_id = ? AND status = 'done'`,
  ).get(userId);
  const best = stmt(
    `SELECT r.habit_id AS habitId, h.name, MAX(r.best_after) AS days
       FROM habit_day_results r JOIN habits h ON h.id = r.habit_id AND h.user_id = r.user_id
      WHERE r.user_id = ? GROUP BY r.habit_id ORDER BY days DESC, r.habit_id LIMIT 1`,
  ).get(userId);
  const active = stmt(
    `SELECT r.habit_id AS habitId, h.name, r.streak_after AS streak, r.freezes_after AS freezes
       FROM habit_day_results r JOIN habits h ON h.id = r.habit_id AND h.user_id = r.user_id
      WHERE r.user_id = ? AND h.archived_at IS NULL
        AND r.local_date = (SELECT MAX(x.local_date) FROM habit_day_results x WHERE x.habit_id = r.habit_id)
        AND r.streak_after > 0
      ORDER BY r.streak_after DESC, r.habit_id`,
  ).all(userId);
  return {
    xp,
    level,
    bounds: { levelFloorXp: floorXp, nextLevelXp: nextXp },
    balanceMinor,
    spendableMinor: Math.max(0, balanceMinor),
    daysTracked: days.tracked,
    perfectDays: days.perfect,
    workouts,
    focusSessions: focus.sessions,
    focusMinutes: focus.minutes,
    bestStreak: best && best.days > 0 ? { habitId: best.habitId, name: best.name, days: best.days } : null,
    activeStreaks: active,
  };
}
