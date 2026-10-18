/**
 * The LifeOS API — response and request types. Core: migration 031, backend package B-core
 * (docs/pipeline/pulse/pkg/B-core/api.md). Habits, tasks and the full day close: migration 032,
 * backend package B-habits-tasks (docs/pipeline/pulse/pkg/B-habits-tasks/api.md).
 *
 * Mirrors the server's zod schemas and worker answers (backend/src/lifeos/*routes.js,
 * backend/src/db/tx/lifeos*.js).
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

/** GET /lifeos/today (Phase-2 and Phase-3 fields; challenge, focus and nutrition join later). */
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
  /** Phase 3: live habits scheduled today, plus every live bad habit (shown daily). Empty before a zone. */
  habits: Habit[];
  /** Phase 3: today's tasks. Empty before a zone. */
  tasks: {
    /** Open, due today — by time, date-only last. */
    due: Task[];
    /** Open, due before today (with the penalty a settled day took, if any). */
    overdue: Task[];
    completedToday: Task[];
    anytimeCount: number;
    /** Open non-template tasks (the cap of 300 counts templates too). */
    openCount: number;
  };
}

/** The LifeOS fields GET /coins/ledger adds to each entry (null for non-LifeOS movements). */
export interface LifeosLedgerFields {
  localDate: DayKey | null;
  /** 'workout_log' | 'day' (Phase 2), 'task' | 'habit_day' (Phase 3); more join in later phases. */
  sourceType: string | null;
  sourceId: number | null;
  /** The workout's title, the task's title or the habit's name; null for day-level movements. */
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

/* ── Phase 3: habits, tasks, the full day close (migration 032, package B-habits-tasks) ──────── */

/** The 409 codes the habit and task routes answer (with `limit` on LIMIT_REACHED). */
export type LifeosRefusalCode =
  | 'TIMEZONE_REQUIRED'
  | 'LIMIT_REACHED'
  | 'DAY_LOCKED'
  | 'NOT_SCHEDULED'
  | 'WRONG_KIND'
  | 'ARCHIVED'
  | 'TEMPLATE';

export interface LifeosRefusal {
  error: string;
  code: LifeosRefusalCode;
  /** LIMIT_REACHED only: the cap that was hit (20 live habits, 100 habits in all, 300 open tasks). */
  limit?: number;
  requestId: string;
}

export type HabitKind = 'good' | 'bad';
/** daily · weekdays (Monday-first bit mask, bit0 = Monday) · times_per_week (weekly quota, checked on Sunday). */
export type HabitSchedule = 'daily' | 'weekdays' | 'times_per_week';
export type HabitLogStatus = 'pending' | 'done' | 'skipped' | 'relapse';

/** What the user said about a habit on a day (editable until the day settles). */
export interface HabitLog {
  date: DayKey;
  /** Good habit: completions (0..target). Bad habit: relapses that day. */
  count: number;
  status: HabitLogStatus;
  /** Epoch seconds when the count reached the target; null unless done. */
  doneAt: number | null;
}

/** The streak as SETTLED so far (today counts only once it settles). */
export interface HabitStreak {
  current: number;
  best: number;
  freezes: number;
  /** The multiplier today will be paid at, basis points (10000 = x1, 12500 = x1.25, 15000 = x1.5). */
  multiplierBp: number;
  /** Times-per-week habits: consecutive weeks with the quota met; null for the others. */
  weekStreak: number | null;
}

/** One habit as GET /habits, GET /lifeos/today and every habit write answer it. */
export interface Habit {
  id: number;
  name: string;
  kind: HabitKind;
  scheduleType: HabitSchedule;
  /** 127 unless scheduleType is 'weekdays'. */
  weekdayMask: number;
  timesPerWeek: number | null;
  targetCount: number;
  unit: string | null;
  /** Whole coins per completion (bad habit: per clean day), 0..50. */
  pointsSuccess: number;
  /** Whole coins per miss (bad habit: per relapse, before the factor and the daily cap), 0..50. */
  pointsPenalty: number;
  /** HH:MM or null. */
  reminderTime: string | null;
  sortOrder: number;
  /** The first day the habit is scheduled (its creation day). */
  startedOn: DayKey;
  archived: boolean;
  /** Live, existing and scheduled on the logical today. */
  scheduledToday: boolean;
  /** Today's log, or null when nothing was said today. */
  log: HabitLog | null;
  streak: HabitStreak;
  /** Times-per-week habits: done days Monday..today; null for the others. */
  weekDone: number | null;
  /** What today pays if it settles as it stands (good: the full or partial share; bad: minus the relapses). */
  previewMinor: number;
  /** What a done day (good) or a clean day (bad) pays at today's multiplier. */
  fullMinor: number;
}

/** GET /habits. */
export interface HabitsResponse {
  started: boolean;
  today: DayKey | null;
  /** Live habits first, then the archived ones. */
  habits: Habit[];
  /** The rules the Szokasok footer line quotes; absent before a zone. */
  rules?: { freezeEvery: number; maxFreezes: number; partialHabitMinPct: number };
  limits: { live: number };
}

export type HabitDayOutcome = 'done' | 'missed' | 'skipped' | 'frozen' | 'open' | 'clean' | 'relapse' | 'lapsed';

/** One settled day of a habit (GET /habits/:id). */
export interface HabitDay {
  id: number;
  date: DayKey;
  outcome: HabitDayOutcome;
  count: number;
  targetCount: number;
  /** The multiplier the day was paid at. */
  multiplierBp: number;
  streakAfter: number;
  /** The milestone reached that day (7 / 30 / 100 by default), else null. */
  milestoneDays: number | null;
  /** 1 when the day earned a streak freeze. */
  freezeEarned: 0 | 1;
  /** Sunday rows of a times-per-week habit: the week's quota met (1) or not (0); else null. */
  quotaMet: 0 | 1 | null;
  doneAt: number | null;
  /** The net coins of the day for this habit (award + milestone - penalty). */
  coinsMinor: number;
}

/** GET /habits/:id: the habit and its last 12 Monday..Sunday weeks of settled days (newest first). */
export interface HabitDetailResponse {
  habit: Habit;
  /** The Monday the 12 weeks start on. */
  from: DayKey;
  days: HabitDay[];
  totals: {
    coinsMinor: number;
    /** done + clean days. */
    done: number;
    /** done, missed, clean and relapse days (skipped, frozen, open and lapsed do not count). */
    scheduled: number;
  };
}

/** POST /habits body (.strict()). A bad habit takes no schedule fields, count or unit. */
export interface HabitCreate {
  /** 8..64 of [A-Za-z0-9_-]: a replay with the same key answers the first habit (200, replayed). */
  clientKey: string;
  kind: HabitKind;
  name: string;
  scheduleType?: HabitSchedule;
  /** Required with 'weekdays', refused otherwise. */
  weekdayMask?: number;
  /** Required with 'times_per_week', refused otherwise. */
  timesPerWeek?: number;
  targetCount?: number;
  unit?: string | null;
  pointsSuccess?: number;
  pointsPenalty?: number;
  reminderTime?: string | null;
}

/** PATCH /habits/:id body (.strict(), at least one key; schedule fields need scheduleType). */
export type HabitPatch = Partial<Omit<HabitCreate, 'clientKey' | 'kind'>>;

/** POST /habits -> 201 { habit } (200 with replayed: true on a replay); PATCH / archive / restore -> { habit }. */
export interface HabitResponse {
  habit: Habit;
  replayed?: true;
}

/** POST /habits/:id/log and /relapse body: an ABSOLUTE count (replay-safe). Default day: today. */
export interface HabitCountBody {
  date?: DayKey;
  count: number;
}

/** POST /habits/:id/skip body. */
export interface HabitSkipBody {
  date?: DayKey;
}

/** POST /habits/:id/log | skip | relapse -> 200. */
export interface HabitLogResponse {
  log: HabitLog;
  habit: Habit;
}

/** RRULE-light (f_app): every N days from the first day, a Monday-first weekday mask, or a day of the month. */
export type Recurrence =
  | { type: 'daily'; interval?: number }
  | { type: 'weekly'; weekdayMask: number }
  | { type: 'monthly'; day: number };

/** 1 low (5) · 2 medium (10) · 3 high (20). */
export type TaskPriority = 1 | 2 | 3;

/** One task as every task route answers it. */
export interface Task {
  id: number;
  title: string;
  notes: string | null;
  priority: TaskPriority;
  /** The per-task coin override, 0..50, or null (the priority decides). */
  points: number | null;
  /** The logical due day, or null (anytime). */
  dueOn: DayKey | null;
  /** HH:MM wall clock on the due day, or null (due by the end of the day). */
  dueTime: string | null;
  /** The template's rule (also on its instances, for the repeat glyph). */
  recurrence: Recurrence | null;
  /** A recurring template: never completed, never in a day list; its instances are. */
  isTemplate: boolean;
  parentTaskId: number | null;
  /** Epoch seconds. */
  completedAt: number | null;
  /** The logical day it was completed on (its coins count there; reopen until it settles). */
  completedOn: DayKey | null;
  /** The settled day it was found overdue on. */
  overdueOn: DayKey | null;
  /** What it pays on time. */
  valueMinor: number;
  /** Completing it now would be late (half pay). */
  lateNow: boolean;
  /** What completing it now pays (before the daily cap); null once completed. */
  payoutNowMinor: number | null;
  /** The live award of a completed task (after the cap); null otherwise. */
  paidMinor: number | null;
  /** The overdue penalty a settled day took (negative), or null. */
  overduePenaltyMinor: number | null;
}

/** GET /tasks: the task tabs (today, upcoming, overdue, anytime, done). */
export interface TasksResponse {
  started: boolean;
  today: DayKey | null;
  due: Task[];
  overdue: Task[];
  anytime: Task[];
  completedToday: Task[];
  /** Open, due in the next 7 days. */
  upcoming: Task[];
  /** Completed in the last 7 days, newest first, at most 100. */
  done: Task[];
  templates: Task[];
  openCount: number;
  limits?: { open: number };
}

/** POST /tasks body (.strict()). Capture sends the same. */
export interface TaskCreate {
  clientKey: string;
  title: string;
  notes?: string | null;
  priority?: TaskPriority;
  points?: number | null;
  /** Required with dueTime and with recurrence. */
  dueOn?: DayKey | null;
  dueTime?: string | null;
  recurrence?: Recurrence | null;
}

/** PATCH /tasks/:id body (.strict(), at least one key). A template cannot drop its recurrence (409). */
export type TaskPatch = Partial<Omit<TaskCreate, 'clientKey'>>;

/** POST /tasks -> 201 { task } (200 with replayed: true); GET / PATCH /tasks/:id -> { task }. */
export interface TaskResponse {
  task: Task;
  replayed?: true;
}

/** POST /tasks/:id/complete -> 200 (empty body). `already` = it was completed; nothing paid again. */
export interface TaskCompleteResponse {
  task: Task;
  awardedMinor: number;
  late?: boolean;
  /** The daily cap trimmed the award. */
  capped?: boolean;
  already?: true;
}

/** POST /tasks/:id/reopen -> 200 (empty body): the award reversed exactly. */
export interface TaskReopenResponse {
  task: Task;
  /** Negative: the coins taken back. */
  reversedMinor: number;
  already?: true;
}
