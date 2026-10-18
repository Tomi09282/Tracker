/**
 * The LifeOS core API (migration 031, backend package B-core) — response and request types.
 *
 * Mirrors the server's zod schemas and worker answers (backend/src/lifeos/routes.js,
 * backend/src/db/tx/lifeos.js); the prose contract is docs/pipeline/pulse/pkg/B-core/api.md.
 * Types only: no fetching here — each screen's hook owns its queries.
 *
 * Every amount is an INTEGER in minor units (1 coin = 100 minor; 1 LifeOS point = 1 coin).
 * XP and levels are in POINTS (whole numbers). Day keys are 'YYYY-MM-DD' in the user's own zone.
 */

/** A logical day key, 'YYYY-MM-DD'. */
export type DayKey = string;

/** The four day starts the "Nap és időzóna" page offers. */
export type DayStartHour = 0 | 2 | 4 | 6;

/** GET /me/prefs -> { prefs }; PATCH /me/prefs -> { prefs }. */
export interface UserPrefs {
  /** IANA zone, null until the client has sent one. */
  timezone: string | null;
  dayStartHour: DayStartHour;
  /** The first LifeOS day (set once, when a zone is first known). */
  startedOn: DayKey | null;
  /** Offset from UTC right now, in minutes (east positive) — for a "GMT+2" label. */
  utcOffsetMinutes: number | null;
  /** The logical today, null without a zone. */
  today: DayKey | null;
  /** Epoch ms from which the zone may change again; null = it may change now. */
  timezoneChangeableAt: number | null;
}

/** PATCH /me/prefs body (.strict(): at least one key, nothing else). */
export interface UserPrefsPatch {
  timezone?: string;
  dayStartHour?: DayStartHour;
}

/** PATCH /me/prefs 409 when the zone changed less than 24 h ago. */
export interface TimezoneTooSoonError {
  error: string;
  code: 'TIMEZONE_TOO_SOON';
  changeableAt: number;
  requestId: string;
}

/** One day of the current Monday..Sunday week on the wallet. */
export interface WalletWeekDay {
  date: DayKey;
  /** Net coin movement of LifeOS events on that logical day (may be negative). */
  netMinor: number;
  /** A day after today (the chart draws nothing for it). */
  future: boolean;
}

/** GET /coins/wallet (extended in 031) and GET /lifeos/today -> wallet. */
export interface LifeosWallet {
  /** May be BELOW ZERO (penalties are not capped at zero) — the frame's "TARTOZÁS". */
  balanceMinor: number;
  /** max(0, balance): what a spend can use. */
  spendableMinor: number;
  /** Whole XP points. */
  xp: number;
  /** floor(sqrt(xp / 100)). */
  level: number;
  bounds: { levelFloorXp: number; nextLevelXp: number };
  dailyEarnCapMinor: number;
  /** Earned today (logical day) so far; null without a zone. */
  todayEarnedMinor: number | null;
  today: DayKey | null;
  /** Monday..Sunday of the current logical week; [] without a zone. */
  week: WalletWeekDay[];
  /** When yesterday settles, wall clock 'HH:00' (day start + 6 h). */
  settleTime: string;
}

/** One scheduled plan day on the workout date. */
export interface TodayWorkoutOccurrence {
  planId: number;
  planName: string;
  dayId: number;
  dayName: string;
  isRest: boolean;
  estMinutes: number | null;
  startTime: string | null;
  exerciseCount: number;
  logId: number | null;
  logStatus: 'in_progress' | 'completed' | 'abandoned' | null;
}

/** GET /lifeos/today (Phase-2 fields; habits, tasks, challenge, focus join in later phases). */
export interface LifeosToday {
  /** A zone is set and LifeOS has a start day. */
  started: boolean;
  timezone: string | null;
  dayStartHour: DayStartHour;
  startedOn: DayKey | null;
  /** The logical today; null without a zone. */
  today: DayKey | null;
  /** The newest settled day (>= startedOn), or null when none has settled yet. */
  settledThrough: DayKey | null;
  rulesVersion: number;
  wallet: LifeosWallet;
  workout: {
    /** The CALENDAR date a workout started now is logged on (workout_logs.local_date). */
    date: DayKey;
    /** A non-rest plan day is scheduled on that date. */
    due: boolean;
    /** A workout was completed on that date. */
    done: boolean;
    /** What a full workout pays, in points (rules.workoutComplete). */
    pointsFull: number;
    occurrences: TodayWorkoutOccurrence[];
  };
}

/** The LifeOS fields GET /coins/ledger adds to each entry (null for non-LifeOS movements). */
export interface LifeosLedgerFields {
  localDate: DayKey | null;
  /** 'workout_log' | 'day' in Phase 2; more sources join in later phases. */
  sourceType: string | null;
  sourceId: number | null;
  /** The workout's title for a workout award; null otherwise. */
  sourceTitle: string | null;
  /** Set on a reversal: the event it undoes. */
  reversesEventId: number | null;
}

/*
 * The LifeOS coin reasons of 031 (coin_reasons.key, the ledger's `reasonKey`) are listed in
 * docs/pipeline/pulse/pkg/B-core/api.md rather than as a string union here: dotted literals in a
 * frontend file read as i18n keys to check-i18n. The ledger keeps `reasonKey: string`.
 */

/** The admin point rules (every key required; the two fractional ones in basis points). */
export interface PointRules {
  habitSuccess: number;
  habitPenalty: number;
  badHabitCleanDay: number;
  /** x2 = 20000. */
  badHabitRelapseFactorBp: number;
  badHabitRelapseDailyCap: number;
  partialHabitMinPct: number;
  taskLow: number;
  taskMid: number;
  taskHigh: number;
  taskLatePct: number;
  taskOverdue: number;
  workoutComplete: number;
  workoutFullPct: number;
  workoutHalfPct: number;
  challengePoints: number;
  focusPointsPerHour: number;
  focusCheckinPoint: number;
  mealEaten: number;
  perfectDayNeedsKcal: 0 | 1;
  kcalGoalHit: number;
  kcalGoalMissed: number;
  perfectDay: number;
  streakTier1Days: number;
  /** x1.25 = 12500. */
  streakTier1MultBp: number;
  streakTier2Days: number;
  /** x1.5 = 15000. */
  streakTier2MultBp: number;
  milestone1Days: number;
  milestone1Bonus: number;
  milestone2Days: number;
  milestone2Bonus: number;
  milestone3Days: number;
  milestone3Bonus: number;
  freezeEvery: number;
  maxFreezes: number;
  /** Coins (not minor) per user per logical day. */
  dailyEarnCap: number;
}

export type PointRuleKey = keyof PointRules;

/** The rule set in force. */
export interface PointRuleSet {
  version: number;
  rules: PointRules;
  note: string | null;
  /** Epoch seconds. */
  createdAt: number;
  /** The publishing admin's display name (null for the seeded version 1 or an erased admin). */
  createdByName: string | null;
}

/** GET /admin/rules. */
export interface AdminRulesResponse {
  current: PointRuleSet;
  defaults: PointRules;
  /** [min, max] inclusive, per key. */
  ranges: Record<PointRuleKey, [number, number]>;
}

/** PUT /admin/rules body (.strict()). */
export interface AdminRulesPut {
  expectedVersion: number;
  rules: PointRules;
  /** 1..280 characters. */
  note?: string;
}

/** PUT /admin/rules 200: the new set, or `unchanged: true` when nothing differed. */
export interface AdminRulesPutResponse {
  current: PointRuleSet;
  unchanged?: true;
}

/** PUT /admin/rules 409 when another admin published first. */
export interface RulesStaleError {
  error: string;
  code: 'RULES_STALE';
  currentVersion: number;
  requestId: string;
}
