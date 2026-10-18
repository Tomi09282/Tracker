// src/lifeos/habits.js — the habit rules, PURE. A port of f_app `src/domain/habits.ts` (scheduling,
// counts, relapses) and of `dayClose.ts settleHabit`, rewritten as functions of their inputs.
//
// ═══ WHY PURE ══════════════════════════════════════════════════════════════════════════════════
//
// The day close (src/db/tx/lifeos.js closeLifeDayTx) reads the rows under its write lock and asks
// THIS file what they mean; verify-lifeos-rules.mjs asks the same functions f_app's test vectors.
// One implementation, two callers, so the vectors prove what the server pays.
//
// ═══ THE ONE DELIBERATE DIFFERENCE FROM f_app: HABITS PAY AT THE DAY CLOSE (plan L5) ═══════════
//
// f_app credits a good habit the moment it is ticked and re-syncs the credit on every change; a
// relapse is debited at once. Here a habit's coins are decided once, when its day settles: the log
// is the user's statement, the close is the payout. The amounts are f_app's exactly (the same
// multiplier — the streak BEFORE the day — the same partial share, the same relapse cap), so a day
// pays what f_app would have paid by its end. The Ma screen shows the same figure as a preview.
import { addDaysToKey, isBitSet, weekdayIndex } from './dates.js';
import {
  applyMultiplierBp,
  freezeEarned,
  habitPoints,
  milestoneBonus,
  milestones,
  multiplierBpFor,
  nextStreak,
  relapseTotal,
} from './rules.js';

/** f_app isScheduledOn: a times-per-week habit is "scheduled" every day (its quota is weekly). */
export function isScheduledOn(habit, date) {
  switch (habit.scheduleType) {
    case 'daily':
      return true;
    case 'weekdays':
      return isBitSet(habit.weekdayMask, weekdayIndex(date));
    case 'times_per_week':
      return true;
    default:
      return false;
  }
}

/** The state a day starts from: the newest result before it, or a fresh habit. */
export const FRESH_STATE = Object.freeze({ current: 0, best: 0, freezes: 0, weekStreak: 0 });

/** A log's status for a good habit's count (f_app setHabitCount). */
export function goodStatusFor(count, target) {
  return count >= target ? 'done' : 'pending';
}

/**
 * Coins a good habit's day would pay as it stands (the Ma preview, and the close's own figure):
 * the full or partial share at the multiplier of the streak before the day. Whole coins.
 */
export function goodHabitPreview({ count, target, base, streak }, rules) {
  return habitPoints({ count, target, base, multiplierBp: multiplierBpFor(streak, rules) }, rules);
}

/**
 * Settle ONE habit for ONE scheduled day (f_app settleHabit).
 *
 *   habit   { kind, scheduleType, timesPerWeek, targetCount, pointsSuccess, pointsPenalty }
 *   log     { count, status } | null  (no log = nothing said that day)
 *   state   { current, best, freezes, weekStreak } — after the previous settled result
 *   weekDone  times-per-week only: done days Mon..Sun of the week ending on `date` (incl. `date`)
 *
 * Returns the result row's fields and the coin movements in WHOLE COINS:
 *   { outcome, counted: 'done' | 'not_done' | 'excluded', multiplierBp, state (after),
 *     quotaMet, milestoneDays, freezeEarned, coins: [{ reason, points }] }
 * `counted` is f_app's perfect-day verdict: excluded days do not count either way.
 */
export function settleHabitDay({ habit, log, state, date, weekDone = 0 }, rules) {
  const count = log?.count ?? 0;
  const status = log?.status ?? 'pending';
  const multiplierBp = multiplierBpFor(state.current, rules);
  const coins = [];
  let outcome = null; // the streak outcome; null = the streak does not move
  let resultOutcome;
  let counted = 'not_done';
  let freezes = state.freezes;

  if (habit.kind === 'good') {
    // A partial count at or above the minimum share pays its share whatever the outcome
    // (f_app: the credit was given at tap time and the close never takes it back).
    const earned = habitPoints({ count, target: habit.targetCount, base: habit.pointsSuccess, multiplierBp }, rules);
    if (status === 'done' || count >= habit.targetCount) {
      outcome = 'done';
      resultOutcome = 'done';
      counted = 'done';
      if (earned > 0) coins.push({ reason: 'habit.done', points: earned });
    } else if (status === 'skipped') {
      outcome = 'skipped';
      resultOutcome = 'skipped';
      counted = 'excluded';
    } else {
      if (earned > 0) coins.push({ reason: 'habit.done', points: earned });
      if (habit.scheduleType === 'times_per_week') {
        // Never penalised per day; the quota is checked on Sunday.
        resultOutcome = 'open';
        counted = 'excluded';
      } else if (freezes > 0 && state.current > 0) {
        // The miss is excused: no penalty, the streak holds, a freeze is spent.
        freezes -= 1;
        outcome = 'skipped';
        resultOutcome = 'frozen';
        counted = 'excluded';
      } else {
        if (habit.pointsPenalty > 0) coins.push({ reason: 'habit.missed', points: -habit.pointsPenalty });
        outcome = 'missed';
        resultOutcome = 'missed';
      }
    }
  } else if (status === 'relapse' || count > 0) {
    const lost = relapseTotal(count, habit.pointsPenalty, rules);
    if (lost > 0) coins.push({ reason: 'habit.relapse', points: -lost });
    outcome = 'relapse';
    resultOutcome = 'relapse';
  } else {
    const earned = applyMultiplierBp(habit.pointsSuccess, multiplierBp);
    if (earned > 0) coins.push({ reason: 'habit.clean_day', points: earned });
    outcome = 'clean';
    resultOutcome = 'clean';
    counted = 'done';
  }

  // The weekly quota of a times-per-week habit, checked when its week ends (Sunday).
  let quotaMet = null;
  let weekStreak = habit.scheduleType === 'times_per_week' ? state.weekStreak : null;
  if (habit.scheduleType === 'times_per_week' && weekdayIndex(date) === 6) {
    quotaMet = weekDone >= (habit.timesPerWeek ?? 1) ? 1 : 0;
    if (quotaMet === 0) {
      if (habit.pointsPenalty > 0) coins.push({ reason: 'habit.missed', points: -habit.pointsPenalty });
      outcome = 'missed';
      resultOutcome = 'missed';
      weekStreak = 0;
    } else {
      weekStreak += 1;
    }
  }

  let next = { current: state.current, best: state.best };
  let milestoneDays = null;
  let earnedFreeze = 0;
  if (outcome) {
    next = nextStreak(next, outcome);
    const succeeded = outcome === 'done' || outcome === 'clean';
    if (succeeded) {
      earnedFreeze = freezes < rules.maxFreezes ? freezeEarned(next.current, rules) : 0;
      freezes = Math.min(rules.maxFreezes, freezes + freezeEarned(next.current, rules));
      const bonus = milestoneBonus(next.current, rules);
      if (bonus > 0) {
        coins.push({ reason: 'streak.milestone', points: bonus });
        milestoneDays = next.current;
      } else if (milestones(rules).some((m) => m.days === next.current)) {
        milestoneDays = next.current; // a milestone reached with a zero bonus is still reached
      }
    }
  }

  return {
    outcome: resultOutcome,
    counted,
    count,
    multiplierBp,
    state: { current: next.current, best: next.best, freezes, weekStreak: weekStreak ?? 0 },
    weekStreakAfter: weekStreak,
    quotaMet,
    milestoneDays,
    freezeEarned: earnedFreeze,
    coins,
  };
}

/** The Monday of the week containing `date`. */
export function weekStart(date) {
  return addDaysToKey(date, -weekdayIndex(date));
}
