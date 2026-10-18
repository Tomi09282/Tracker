// src/lifeos/rules.js — the LifeOS point rules and formulas. A port of f_app
// `src/domain/points/{config,rules,streak}.ts` and `ledger.ts` levelFor, made integer-only.
//
// ═══ ADMIN-GLOBAL, NOT PER USER (plan L1) ══════════════════════════════════════════════════════
//
// In f_app every user edits their own rules, which is harmless in a single-user app and a mint in a
// shared currency. Here one rule set holds for everybody: `point_rule_sets` is append-only, the
// newest row is in force, and only an admin writes one (PUT /admin/rules, setPointRulesTx).
//
// ═══ INTEGERS ONLY ═════════════════════════════════════════════════════════════════════════════
//
// f_app's two fractional rules (the streak multipliers 1.25 / 1.5 and the relapse factor 2) are
// stored in BASIS POINTS (12500 / 15000 / 20000), so no float ever reaches a coin amount and the
// zod schema can say `.int()` about every field. 1 point = 1 coin = 100 minor units (plan L2).
//
// PURE: imported by the worker (inside the transactions) and by the routes (validation).
import { z } from 'zod';

/** f_app DEFAULT_RULES, plus the economy sheet's daily cap (owner, 2026-10-18). */
export const DEFAULT_RULES = Object.freeze({
  // habits
  habitSuccess: 10,
  habitPenalty: 5,
  badHabitCleanDay: 15,
  badHabitRelapseFactorBp: 20000,
  badHabitRelapseDailyCap: 30,
  partialHabitMinPct: 50,
  // tasks
  taskLow: 5,
  taskMid: 10,
  taskHigh: 20,
  taskLatePct: 50,
  taskOverdue: 5,
  // workouts
  workoutComplete: 30,
  workoutFullPct: 80,
  workoutHalfPct: 50,
  // challenges
  challengePoints: 15,
  // focus
  focusPointsPerHour: 20,
  focusCheckinPoint: 2,
  // nutrition + day
  mealEaten: 3,
  perfectDayNeedsKcal: 1,
  kcalGoalHit: 20,
  kcalGoalMissed: 10,
  perfectDay: 25,
  // streaks
  streakTier1Days: 7,
  streakTier1MultBp: 12500,
  streakTier2Days: 30,
  streakTier2MultBp: 15000,
  milestone1Days: 7,
  milestone1Bonus: 25,
  milestone2Days: 30,
  milestone2Bonus: 100,
  milestone3Days: 100,
  milestone3Bonus: 500,
  freezeEvery: 30,
  maxFreezes: 2,
  // the economy sheet: at most this many coins EARNED per user per logical day
  dailyEarnCap: 400,
});

/** f_app RULE_RANGES, the fractional ones scaled to basis points. Drives the zod schema. */
export const RULE_RANGES = Object.freeze({
  habitSuccess: [0, 500],
  habitPenalty: [0, 500],
  badHabitCleanDay: [0, 500],
  badHabitRelapseFactorBp: [0, 100000],
  badHabitRelapseDailyCap: [0, 1000],
  partialHabitMinPct: [0, 100],
  taskLow: [0, 500],
  taskMid: [0, 500],
  taskHigh: [0, 500],
  taskLatePct: [0, 100],
  taskOverdue: [0, 500],
  workoutComplete: [0, 500],
  workoutFullPct: [1, 100],
  workoutHalfPct: [0, 100],
  challengePoints: [0, 500],
  focusPointsPerHour: [0, 500],
  focusCheckinPoint: [0, 100],
  mealEaten: [0, 500],
  perfectDayNeedsKcal: [0, 1],
  kcalGoalHit: [0, 500],
  kcalGoalMissed: [0, 500],
  perfectDay: [0, 500],
  streakTier1Days: [1, 365],
  streakTier1MultBp: [10000, 50000],
  streakTier2Days: [1, 1000],
  streakTier2MultBp: [10000, 50000],
  milestone1Days: [1, 3650],
  milestone1Bonus: [0, 100000],
  milestone2Days: [1, 3650],
  milestone2Bonus: [0, 100000],
  milestone3Days: [1, 3650],
  milestone3Bonus: [0, 100000],
  freezeEvery: [0, 365],
  maxFreezes: [0, 10],
  dailyEarnCap: [0, 10000],
});

export const RULE_KEYS = Object.freeze(Object.keys(DEFAULT_RULES));

/**
 * The full rule set, every key required, nothing else allowed. f_app's two cross-field rules
 * (half <= full, tier 2 >= tier 1) are refinements, so a rule set the engine cannot read is
 * unrepresentable rather than "falls back to the default" as f_app's parseRules does.
 */
export const pointRulesSchema = z
  .object(
    Object.fromEntries(
      RULE_KEYS.map((k) => [k, z.number().int().min(RULE_RANGES[k][0]).max(RULE_RANGES[k][1])]),
    ),
  )
  .strict()
  .refine((r) => r.workoutHalfPct <= r.workoutFullPct, { path: ['workoutHalfPct'] })
  .refine((r) => r.streakTier2Days >= r.streakTier1Days, { path: ['streakTier2Days'] });

/**
 * Item caps (plan L8). Not rules: they bound how much a user can CREATE, which is what keeps a
 * user-defined earn path from being farmed, and they are not an admin's to loosen.
 */
export const LIFEOS_LIMITS = Object.freeze({
  habits: 20,
  openTasks: 300,
  challengePool: 50,
  rewards: 100,
});

/** One coin = 100 minor units (019); one point = one coin (plan L2). */
export const MINOR_PER_POINT = 100;
export const pointsToMinor = (points) => points * MINOR_PER_POINT;

/**
 * Parse a stored rule set. Unlike f_app this never "falls back per key": the row was validated
 * with the same schema when it was written, so a row that fails here is a defect, and a defect in
 * the thing that decides payouts must stop the payout rather than pay by a guess.
 */
export function parseStoredRules(json) {
  return pointRulesSchema.parse(JSON.parse(json));
}

/* ── formulas (f_app points/rules.ts), integer arithmetic ─────────────────────────────────────── */

/** round(base x multiplier), half up, never negative. `bp` = basis points (10000 = x1). */
export function applyMultiplierBp(base, bp = 10000) {
  if (base <= 0) return 0;
  return Math.floor((base * bp + 5000) / 10000);
}

/** Points for a good habit on a day: full -> base x mult, partial >= min% -> floored share, else 0. */
export function habitPoints({ count, target, base, multiplierBp = 10000 }, rules = DEFAULT_RULES) {
  const b = base ?? rules.habitSuccess;
  const t = Math.max(1, target);
  if (count >= t) return applyMultiplierBp(b, multiplierBp);
  if (count <= 0 || count * 100 < rules.partialHabitMinPct * t) return 0;
  return Math.floor((b * count * multiplierBp) / (t * 10000));
}

/** Total penalty (positive) for `count` relapses on one day, capped. */
export function relapseTotal(count, habitPenalty, rules = DEFAULT_RULES) {
  return Math.min(
    Math.floor((count * habitPenalty * rules.badHabitRelapseFactorBp + 5000) / 10000),
    rules.badHabitRelapseDailyCap,
  );
}

/** Penalty (positive) for one more relapse, within the day's remaining room. */
export function relapsePenalty({ penalty, alreadyLostToday }, rules = DEFAULT_RULES) {
  const p = Math.floor(((penalty ?? rules.habitPenalty) * rules.badHabitRelapseFactorBp + 5000) / 10000);
  const room = Math.max(0, rules.badHabitRelapseDailyCap - alreadyLostToday);
  return Math.min(p, room);
}

export function taskBasePoints(priority, rules = DEFAULT_RULES) {
  return priority === 1 ? rules.taskLow : priority === 3 ? rules.taskHigh : rules.taskMid;
}

export function taskPoints({ priority, override = null, late }, rules = DEFAULT_RULES) {
  const base = override ?? taskBasePoints(priority, rules);
  return late ? Math.floor((base * rules.taskLatePct) / 100) : base;
}

/** Full at >= workoutFullPct of the sets, half at >= workoutHalfPct, nothing below. */
export function workoutPoints({ completionPct, base }, rules = DEFAULT_RULES) {
  const b = base ?? rules.workoutComplete;
  if (completionPct >= rules.workoutFullPct) return b;
  if (completionPct >= rules.workoutHalfPct) return Math.floor(b / 2);
  return 0;
}

/** Default kcal tolerance (f_app settings.kcalTolerancePct). */
export const KCAL_TOLERANCE_PCT = 10;

/**
 * 'hit' within tolerance, 'over' above, 'under' below, 'no_data' with nothing eaten or no target.
 * Under-eating is never penalised. Works on any consistent unit (the worker passes kcal x10).
 */
export function evaluateKcal({ eaten, target, tolerancePct = KCAL_TOLERANCE_PCT }) {
  if (!target || eaten <= 0) return 'no_data';
  if (Math.abs(eaten - target) * 100 <= target * tolerancePct) return 'hit';
  return eaten > target ? 'over' : 'under';
}

/* ── streaks (f_app points/streak.ts) ──────────────────────────────────────────────────────────── */

export function milestones(rules = DEFAULT_RULES) {
  return [
    { days: rules.milestone1Days, bonus: rules.milestone1Bonus },
    { days: rules.milestone2Days, bonus: rules.milestone2Bonus },
    { days: rules.milestone3Days, bonus: rules.milestone3Bonus },
  ];
}

export function multiplierBpFor(streak, rules = DEFAULT_RULES) {
  if (streak >= rules.streakTier2Days) return rules.streakTier2MultBp;
  if (streak >= rules.streakTier1Days) return rules.streakTier1MultBp;
  return 10000;
}

/** done / clean +1, missed / relapse -> 0 (best kept), skipped unchanged. */
export function nextStreak(state, outcome) {
  switch (outcome) {
    case 'done':
    case 'clean': {
      const current = state.current + 1;
      return { current, best: Math.max(state.best, current) };
    }
    case 'missed':
    case 'relapse':
      return { current: 0, best: state.best };
    case 'skipped':
      return { ...state };
    default:
      throw new Error(`unknown streak outcome ${outcome}`);
  }
}

export function freezeEarned(streak, rules = DEFAULT_RULES) {
  return rules.freezeEvery > 0 && streak > 0 && streak % rules.freezeEvery === 0 ? 1 : 0;
}

export function milestoneBonus(streak, rules = DEFAULT_RULES) {
  return milestones(rules)
    .filter((m) => m.days === streak)
    .reduce((a, m) => a + m.bonus, 0);
}

/* ── levels (f_app points/ledger.ts) ──────────────────────────────────────────────────────────── */

/** level = floor(sqrt(xp / 100)), xp in POINTS. */
export function levelFor(xpPoints) {
  return Math.floor(Math.sqrt(Math.max(0, xpPoints) / 100));
}

/** The level, its floor and the next level's threshold, all in points. */
export function levelProgress(xpPoints) {
  const level = levelFor(xpPoints);
  return { level, floorXp: level * level * 100, nextXp: (level + 1) * (level + 1) * 100 };
}
