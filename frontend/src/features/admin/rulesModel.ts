import type { PointRuleKey, PointRules } from '../../lib/lifeos-api';

/**
 * The admin rules page as data — which rule stands in which section, in which order, with what unit
 * and what step (design round B, frame `lifeos/admin-rules`, Figma 182:1279).
 *
 * ═══ WHAT THE FRAME DRAWS, AND WHAT IT DOES NOT ═════════════════════════════════════════════════
 *
 * Ten sections of rows, each row a rule and its stepper. Seven rule keys of `PointRules` have no
 * row of their own, and they are not lost:
 *
 *   streakTier1Days, streakTier2Days, milestone1Days..3Days   name the rows they belong to
 *                                                              ("7 naptól", "30 napos mérföldkő")
 *   mealEaten, perfectDayNeedsKcal                             not drawn, kept as they are
 *
 * A PUT carries EVERY key (the server's schema is `.strict()` with all keys required), so the keys
 * without a stepper travel unchanged from the set in force. Nothing here invents a default.
 *
 * ═══ UNITS ══════════════════════════════════════════════════════════════════════════════════════
 *
 *   coin   a whole number of coins (1 point = 1 coin, plan L2): the figure alone
 *   pct    a percentage: the figure, then "%" in cap text-2
 *   bp     a multiplier stored in basis points (12500 = x1,25): "×" and the decimal, locale-aware
 *   days   a number of days: the figure, then "nap"
 *   count  a count of items: the figure, then "db"
 */

export type RuleUnit = 'coin' | 'pct' | 'bp' | 'days' | 'count';

/** The rule keys that hold a basis-point multiplier. */
type BpKey = 'badHabitRelapseFactorBp' | 'streakTier1MultBp' | 'streakTier2MultBp';

export interface RuleRowSpec {
  key: PointRuleKey;
  unit: RuleUnit;
  /** One tap of − / +. */
  step: number;
  /** i18n key of the row's title (some take `{{days}}`). */
  titleKey: string;
  /** i18n key of the sub line, when the frame draws one. */
  subKey?: string;
  /** The rule whose value the title names (`{{days}}`): "7 naptól" is streakTier1Days. */
  daysFrom?: PointRuleKey;
}

export interface RuleSectionSpec {
  /** Stable id, also the i18n key of the eyebrow: `adminRules.section.<id>`. */
  id: string;
  /** The section's eyebrow carries "érme" on its right (every row of it is paid or charged in coins). */
  coinHead: boolean;
  rows: RuleRowSpec[];
}

const row = (key: PointRuleKey, unit: RuleUnit, name: string, opts: { sub?: boolean | string; step?: number; daysFrom?: PointRuleKey } = {}): RuleRowSpec => ({
  key,
  unit,
  step: opts.step ?? (unit === 'pct' ? 5 : unit === 'bp' ? 500 : 1),
  titleKey: `adminRules.rule.${name}.title`,
  subKey: opts.sub === false ? undefined : typeof opts.sub === 'string' ? opts.sub : `adminRules.rule.${name}.sub`,
  daysFrom: opts.daysFrom,
});

/** The sub line that only names the unit (Alacsony / Közepes / Magas: "érme"). */
const COIN = 'adminRules.coin';

/**
 * The sections in the frame's order. A section's eyebrow carries "érme" only when every row of it is
 * a coin amount (Fókusz, Kihívás, Kalória, Tökéletes nap, Napi plafon); in the mixed sections each
 * coin row names "érme" in its own sub line (fix round 2 of the frame).
 */
export const RULE_SECTIONS: readonly RuleSectionSpec[] = [
  {
    id: 'habit',
    coinHead: false,
    rows: [
      row('habitSuccess', 'coin', 'habitSuccess'),
      row('habitPenalty', 'coin', 'habitPenalty'),
      row('badHabitCleanDay', 'coin', 'badHabitCleanDay'),
      row('badHabitRelapseFactorBp', 'bp', 'badHabitRelapseFactor'),
      row('badHabitRelapseDailyCap', 'coin', 'badHabitRelapseDailyCap'),
      row('partialHabitMinPct', 'pct', 'partialHabitMin'),
    ],
  },
  {
    id: 'task',
    coinHead: false,
    rows: [
      row('taskLow', 'coin', 'taskLow', { sub: COIN }),
      row('taskMid', 'coin', 'taskMid', { sub: COIN }),
      row('taskHigh', 'coin', 'taskHigh', { sub: COIN }),
      row('taskLatePct', 'pct', 'taskLate'),
      row('taskOverdue', 'coin', 'taskOverdue'),
    ],
  },
  {
    id: 'workout',
    coinHead: false,
    rows: [
      row('workoutComplete', 'coin', 'workoutComplete'),
      row('workoutFullPct', 'pct', 'workoutFull'),
      row('workoutHalfPct', 'pct', 'workoutHalf'),
    ],
  },
  {
    id: 'focus',
    coinHead: true,
    rows: [row('focusPointsPerHour', 'coin', 'focusPerHour'), row('focusCheckinPoint', 'coin', 'focusCheckin')],
  },
  { id: 'challenge', coinHead: true, rows: [row('challengePoints', 'coin', 'challenge')] },
  {
    id: 'kcal',
    coinHead: true,
    rows: [row('kcalGoalHit', 'coin', 'kcalHit', { sub: false }), row('kcalGoalMissed', 'coin', 'kcalMissed')],
  },
  { id: 'perfectDay', coinHead: true, rows: [row('perfectDay', 'coin', 'perfectDay')] },
  {
    id: 'streak',
    coinHead: false,
    rows: [
      row('streakTier1MultBp', 'bp', 'streakTier', { daysFrom: 'streakTier1Days' }),
      row('streakTier2MultBp', 'bp', 'streakTier', { daysFrom: 'streakTier2Days' }),
      row('milestone1Bonus', 'coin', 'milestone', { daysFrom: 'milestone1Days', step: 5 }),
      row('milestone2Bonus', 'coin', 'milestone', { daysFrom: 'milestone2Days', step: 5 }),
      row('milestone3Bonus', 'coin', 'milestone', { daysFrom: 'milestone3Days', step: 5 }),
    ],
  },
  {
    id: 'freeze',
    coinHead: false,
    rows: [row('freezeEvery', 'days', 'freezeEvery'), row('maxFreezes', 'count', 'maxFreezes')],
  },
  { id: 'dailyCap', coinHead: true, rows: [row('dailyEarnCap', 'coin', 'dailyCap', { step: 10 })] },
];

/** Every key that has a stepper on the page. */
export const EDITABLE_KEYS: readonly PointRuleKey[] = RULE_SECTIONS.flatMap((s) => s.rows.map((r) => r.key));

const isBp = (key: PointRuleKey): key is BpKey => key.endsWith('Bp');

/**
 * The figure of a value as the row prints it: "10", "50", "×1,25" (the unit after a pct / days /
 * count figure is a separate node, `unitKeyOf`). The decimal mark follows the language: hu and de
 * write "×1,25", en "×1.25".
 */
export function formatRuleValue(key: PointRuleKey, value: number, lang: string): string {
  if (!isBp(key)) return String(value);
  const factor = new Intl.NumberFormat(lang, { maximumFractionDigits: 2, useGrouping: false }).format(value / 10000);
  return `×${factor}`;
}

/** The i18n key of the unit printed after the figure, or null for coins and multipliers. */
export function unitKeyOf(unit: RuleUnit): string | null {
  if (unit === 'pct') return 'adminRules.unit.pct';
  if (unit === 'days') return 'adminRules.unit.days';
  if (unit === 'count') return 'adminRules.unit.count';
  return null;
}

/**
 * The bounds a stepper may move in: the server's range for the key, narrowed by the two
 * cross-field rules its schema refines (half <= full; the second streak tier is not drawn, so its
 * day rule cannot be broken from here).
 */
export function boundsOf(key: PointRuleKey, rules: PointRules, ranges: Record<PointRuleKey, [number, number]>): [number, number] {
  const [min, max] = ranges[key] ?? [0, Number.MAX_SAFE_INTEGER];
  if (key === 'workoutHalfPct') return [min, Math.min(max, rules.workoutFullPct)];
  if (key === 'workoutFullPct') return [Math.max(min, rules.workoutHalfPct), max];
  return [min, max];
}

/** The keys whose draft value differs from the set in force. */
export function changedKeys(current: PointRules, draft: PointRules): PointRuleKey[] {
  return (Object.keys(current) as PointRuleKey[]).filter((k) => draft[k] !== current[k]);
}
