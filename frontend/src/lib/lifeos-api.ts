/**
 * The LifeOS API — response and request types. Core: migration 031, backend package B-core
 * (docs/pipeline/pulse/pkg/B-core/api.md). Habits, tasks and the full day close: migration 032,
 * backend package B-habits-tasks (docs/pipeline/pulse/pkg/B-habits-tasks/api.md). The daily challenge
 * draw and the reward shop: migration 033, backend package B-rewards-challenges
 * (docs/pipeline/pulse/pkg/B-rewards-challenges/api.md).
 * Focus sessions and the statistics: migration 035, backend package B-focus
 * (docs/pipeline/pulse/pkg/B-focus/api.md).
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

/**
 * PATCH /me/prefs 409 (B-lifeos-polish): the new zone or day start would make a day that has
 * already settled (or was settled by the clock, or lies before the LifeOS start) the new "today".
 * `changeableAt` (epoch ms) is the first moment the same change goes through.
 */
export interface DaySettledError {
  error: string;
  code: 'DAY_SETTLED';
  changeableAt: number;
  requestId: string;
}

/**
 * The task point rules in force (B-lifeos-polish), as the priority picker and the capture sheet
 * print them ("Alacsony 5 / Közepes 10 / Fontos 20"): the admin rule set, in minor units.
 */
export interface TaskPointRules {
  /** priority 1 (Alacsony) */
  lowMinor: number;
  /** priority 2 (Közepes) */
  midMinor: number;
  /** priority 3 (Fontos) */
  highMinor: number;
  /** A late completion pays this share, 0..100. */
  latePct: number;
  /** The one-time penalty when a dated task goes overdue at the day close. */
  overdueMinor: number;
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

/** GET /lifeos/today (Phase-2 to Phase-6 fields; nutrition joins later). */
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
  /** B-lifeos-polish: the capture sheet's priority picker. */
  taskRules: TaskPointRules;
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
  /** Phase 4: the day's challenge draw (NAPI DOBÁS); null before a zone is set. */
  challenge: ChallengeDraw | null;
  /** Phase 5: the next event that starts after now, within 7 calendar days (KÖVETKEZŐ); null when none or before a zone. */
  nextEvent: NextEvent | null;
  /** Phase 6: Ma's FÓKUSZ block — the open focus block and today's paid focus. Empty before a zone. */
  focus: TodayFocus;
}

/** The LifeOS fields GET /coins/ledger adds to each entry (null for non-LifeOS movements). */
export interface LifeosLedgerFields {
  localDate: DayKey | null;
  /** 'workout_log' | 'day' (Phase 2), 'task' | 'habit_day' (Phase 3), 'reward' (Phase 4: a
   *  reward.redeem spend, sourceId = the reward, sourceTitle = the name on the receipt), 'focus' (Phase 6). */
  sourceType: string | null;
  sourceId: number | null;
  /** The workout's title, the task's title, the habit's name or the focus block's title; null for day-level movements. */
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
  /** Phase 4: the challenge this task was picked from (MAI DOBÁS), or null. */
  challengeId: number | null;
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
  /** B-lifeos-polish: the rule set the values were computed with, and the priority picker's rules
   *  (present before a zone too). */
  rulesVersion: number;
  taskRules: TaskPointRules;
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

/* ── Phase 4: the daily challenge draw and the reward shop (migration 033, package B-rewards-challenges) ── */

/** The challenge categories (Fegyelem, Mozgás, Elme, Kapcsolat, Étkezés); the client translates them. */
export type ChallengeCategory = 'discipline' | 'movement' | 'mind' | 'connection' | 'food';

/** One challenge of the pool. */
export interface Challenge {
  id: number;
  name: string;
  category: ChallengeCategory | null;
  /** Whole coins the picked task pays, 0..50. */
  points: number;
  /** Draw weight 1..5 (five segments): 2 is twice as likely as 1. */
  weight: number;
  /** points x 100. */
  valueMinor: number;
  archived: boolean;
  /** Epoch seconds, or null. */
  archivedAt: number | null;
}

/** GET /challenges. */
export interface ChallengesResponse {
  /** The draw pool (AKTÍV), by name. */
  active: Challenge[];
  /** ARCHIVÁLT, by name. */
  archived: Challenge[];
  limits: { pool: number };
}

/** POST /challenges (201 `{ challenge }`, 200 `{ challenge, replayed: true }` on a replayed key). */
export interface ChallengeCreate {
  clientKey: string;
  name: string;
  category?: ChallengeCategory | null;
  /** Default: the admin rule challengePoints (15). */
  points?: number;
  /** Default 1. */
  weight?: number;
}

/** PATCH /challenges/:id (at least one field). */
export type ChallengePatch = Partial<Omit<ChallengeCreate, 'clientKey'>>;

export interface ChallengeResponse {
  challenge: Challenge;
  replayed?: true;
}

/** One option of the day's draw. */
export interface ChallengeOption extends Challenge {
  /** This option was picked. */
  chosen: boolean;
}

/**
 * The day's draw (GET /lifeos/today `challenge`, GET /challenges/today `draw`, and every draw write).
 *   empty_pool — nothing to draw from (Ma shows no NAPI DOBÁS)
 *   due        — no draw yet today: POST /challenges/today/draw
 *   drawn      — options on the table, nothing picked yet
 *   picked     — the pick became a task (elvállalva; `picked.done` = teljesítve)
 */
export interface ChallengeDraw {
  date: DayKey;
  state: 'empty_pool' | 'due' | 'drawn' | 'picked';
  /** Live challenges in the pool. */
  poolCount: number;
  /** Up to three (fewer with a smaller pool); empty for empty_pool / due. */
  options: ChallengeOption[];
  /** 1 until the day's one reroll is used ("még 1 maradt ma"). */
  rerollsLeft: 0 | 1;
  picked: {
    challengeId: number;
    taskId: number;
    /** Epoch seconds. */
    pickedAt: number;
    /** The task was completed. */
    done: boolean;
    /** The task was deleted after the pick. */
    taskDeleted: boolean;
    /** B-lifeos-polish: Ma's picked teaser ("Lift helyett lépcső egész nap · Mai kihívás · +15 érme"). */
    title: string | null;
    /** The task's full value (its points). */
    valueMinor: number | null;
    /** What the task paid (null while open, or when the pay was reversed). */
    paidMinor: number | null;
  } | null;
}

/** GET /challenges/today. */
export interface ChallengeTodayResponse {
  started: boolean;
  /** null before a zone is set. */
  draw: ChallengeDraw | null;
}

/** POST /challenges/today/draw: 201 `{ draw }` (new), 200 `{ draw, already: true }` (the day's draw). */
export interface ChallengeDrawResponse {
  draw: ChallengeDraw;
  already?: true;
}

/** POST /challenges/today/reroll. */
export interface ChallengeRerollBody {
  rerollKey: string;
}

/** 200 `{ draw }`, or `{ draw, replayed: true }` for the same rerollKey. */
export interface ChallengeRerollResponse {
  draw: ChallengeDraw;
  replayed?: true;
}

/** POST /challenges/today/pick ("Ezt vállalom"). */
export interface ChallengePickBody {
  challengeId: number;
  /** The new task's idempotency key. */
  clientKey: string;
}

/** 201 `{ task, draw }`, or 200 with `replayed: true` for the same clientKey and challenge. */
export interface ChallengePickResponse {
  task: Task;
  draw: ChallengeDraw;
  replayed?: true;
}

/** The 409 codes of the challenge routes (besides TIMEZONE_REQUIRED / LIMIT_REACHED / conflict). */
export type ChallengeRefusalCode = 'NO_DRAW' | 'EMPTY_POOL' | 'REROLL_USED' | 'ALREADY_PICKED' | 'NOT_OFFERED';

/** Why a reward cannot be redeemed now (f_app order: ALREADY_REDEEMED, COOLDOWN, INSUFFICIENT). */
export type RewardAvailability =
  | { ok: true }
  | { ok: false; reason: 'ALREADY_REDEEMED' }
  | { ok: false; reason: 'COOLDOWN'; availableOn: DayKey; daysLeft: number }
  | { ok: false; reason: 'INSUFFICIENT'; missingMinor: number }
  | { ok: false; reason: 'TIMEZONE_REQUIRED' };

/** One reward as the shop and the detail draw it. */
export interface Reward {
  id: number;
  name: string;
  description: string | null;
  /** Whole coins x 100. */
  costMinor: number;
  repeatable: boolean;
  /** Logical days between two redemptions, or null (no limit; always null when one-time). */
  cooldownDays: number | null;
  archived: boolean;
  archivedAt: number | null;
  redeemedCount: number;
  lastRedeemedOn: DayKey | null;
  availability: RewardAvailability;
  /** 0..10000: the share of the cost the spendable balance covers (the 4 pt bar). */
  progressBp: number;
  /** spendable − cost (negative = still missing). */
  balanceAfterMinor: number;
}

/** GET /rewards. */
export interface RewardsResponse {
  started: boolean;
  today: DayKey | null;
  balanceMinor: number;
  /** ELKÖLTHETŐ: max(0, balance). */
  spendableMinor: number;
  /** JUTALOMBOLT: live rewards by cost. */
  items: Reward[];
  archived: Reward[];
  /** Profil's JUTALMAK "N elérhető", the Érmék door's "N beváltható". */
  redeemableCount: number;
  limits: { rewards: number; costMaxMinor: number };
}

/** One redemption (a receipt: name and cost are snapshots). */
export interface RewardRedemption {
  id: number;
  rewardId: number;
  name: string;
  costMinor: number;
  localDate: DayKey;
  /** Epoch seconds. */
  redeemedAt: number;
  /** "Teljesítve" — bookkeeping only. */
  fulfilled: boolean;
  fulfilledAt: number | null;
}

/** GET /rewards/:id. */
export interface RewardDetailResponse {
  reward: Reward;
  spendableMinor: number;
  /** BEVÁLTÁSOK, newest first, at most 100. */
  redemptions: RewardRedemption[];
}

/** GET /rewards/redemptions. */
export interface RedemptionsResponse {
  redemptions: RewardRedemption[];
}

/** POST /rewards. Cost in WHOLE coins (1..10000). */
export interface RewardCreate {
  clientKey: string;
  name: string;
  description?: string | null;
  cost: number;
  /** Default true. */
  repeatable?: boolean;
  /** 0 or null = no limit; must be absent / 0 / null when one-time. */
  cooldownDays?: number | null;
}

/** PATCH /rewards/:id (at least one field). */
export type RewardPatch = Partial<Omit<RewardCreate, 'clientKey'>>;

export interface RewardResponse {
  reward: Reward;
  replayed?: true;
}

/** POST /rewards/:id/redeem. */
export interface RewardRedeemBody {
  clientKey: string;
}

/** 201, or 200 with `replayed: true` for the same clientKey. */
export interface RewardRedeemResponse {
  redemption: RewardRedemption;
  balanceMinor: number;
  spendableMinor: number;
  replayed?: true;
}

/** A refused redeem (409). */
export interface RewardRedeemRefusal {
  error: string;
  code: 'ALREADY_REDEEMED' | 'COOLDOWN' | 'INSUFFICIENT';
  availableOn?: DayKey;
  daysLeft?: number;
  missingMinor?: number;
  requestId: string;
}

/** POST /rewards/redemptions/:id/fulfilled → `{ redemption }`. */
export interface RedemptionFulfilledBody {
  fulfilled: boolean;
}


/* ── Phase 5: the calendar, events and reminders (migration 034, package B-calendar) ─────────── */

/** An event's repeat rule: the task engine's three shapes plus `yearly` (the first date's month and day). */
export type EventRecurrence = Recurrence | { type: 'yearly' };

/** Reminder offsets in minutes before the start (0 = at the start); the form offers 0 / 15 / 60 / 1440. */
export type ReminderOffset = number;

/**
 * One occurrence of an event as drawn on one CALENDAR day (events follow the wall clock, not the
 * logical day). A multi-day occurrence is listed on every day it touches.
 */
export interface EventOccurrence {
  eventId: number;
  /** The calendar day this entry is drawn on. */
  date: DayKey;
  /** The local date (event zone) this occurrence starts on — the recurrence's own day. */
  occurrenceDate: DayKey;
  title: string;
  location: string | null;
  allDay: boolean;
  /** Epoch seconds. All-day: local midnight .. the midnight after the last day (exclusive). */
  startAt: number;
  endAt: number;
  /** 'HH:MM' in the user's zone; null for all-day ("EGÉSZ NAP"). */
  startTime: string | null;
  /** null for all-day and for a zero-length event. */
  endTime: string | null;
  /** null for all-day. */
  durationMinutes: number | null;
  /** Began on an earlier calendar day / continues on a later one. */
  startsBefore: boolean;
  endsAfter: boolean;
  /** The repeat rule (the repeat glyph), or null. */
  recurrence: EventRecurrence | null;
  untilDate: DayKey | null;
}

/** One scheduled plan day on a calendar day (the shape GET /lifeos/today uses). */
export type CalendarWorkout = TodayWorkoutOccurrence;

/** One calendar day of GET /calendar. */
export interface CalendarDay {
  date: DayKey;
  /** All-day first, then by start. */
  events: EventOccurrence[];
  /** Plan days scheduled that day, rest days included (isRest: "Pihenőnap"). */
  workouts: CalendarWorkout[];
  tasks: {
    /** Open, due that (logical) day — by time, date-only last. */
    due: Task[];
    /** Completed that day. */
    completed: Task[];
    /** Only on the logical today: open tasks due before it. */
    overdue: Task[];
  };
  /** The DayRail dot: an event, a non-rest workout, or a task due / done that day. */
  busy: boolean;
}

/** GET /calendar?from=YYYY-MM-DD&days=1..42 (defaults: the calendar today, 7). */
export interface CalendarResponse {
  /** A zone is set (events and tasks need it). */
  started: boolean;
  timezone: string | null;
  /** The CALENDAR today in the user's zone. */
  today: DayKey;
  /** The LifeOS logical today (tasks); null before a zone. */
  logicalToday: DayKey | null;
  from: DayKey;
  /** Inclusive. */
  to: DayKey;
  days: CalendarDay[];
  /** Open undated tasks ("Bármikor"), by priority. */
  anytime: Task[];
  /** What a full workout pays, in points (the "+30 érme"). */
  workoutPointsFull: number;
}

/** One event as GET /events/:id and every event write answer it. */
export interface CalendarEvent {
  id: number;
  title: string;
  notes: string | null;
  location: string | null;
  allDay: boolean;
  /** The typed fields, in the event's own zone (`timezone`). */
  date: DayKey;
  startTime: string | null;
  /** All-day: the last day (inclusive). Timed: the date the end falls on. */
  endDate: DayKey;
  endTime: string | null;
  durationMinutes: number | null;
  timezone: string;
  recurrence: EventRecurrence | null;
  untilDate: DayKey | null;
  /** Ascending offsets in minutes. */
  reminders: ReminderOffset[];
  /** The FIRST occurrence, epoch seconds. */
  startAt: number;
  endAt: number;
  /** The first occurrence that has not ended yet, or null. */
  next: EventOccurrence | null;
  /** Occurrences left from today through untilDate ("még 9 alkalom"); null without an until date. */
  remaining: number | null;
  /** The occurrence on `?on=YYYY-MM-DD`, when asked and there is one. */
  occurrence: EventOccurrence | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * POST /events body (.strict()). The client sends the WALL CLOCK; the server resolves the instants
 * in the user's zone. Timed: `startTime` required; no `endTime` = zero length; an `endTime` before
 * the start with no `endDate` ends after midnight. All-day: no times; `endDate` = the last day
 * (inclusive). At most 14 days. `untilDate` needs `recurrence`. Capture's Esemény half sends this.
 */
export interface EventCreate {
  clientKey: string;
  title: string;
  notes?: string | null;
  location?: string | null;
  allDay?: boolean;
  date: DayKey;
  startTime?: string;
  endTime?: string | null;
  endDate?: DayKey | null;
  recurrence?: EventRecurrence | null;
  untilDate?: DayKey | null;
  /** At most four, no repeats, 0..10080. */
  reminders?: ReminderOffset[];
}

/**
 * PATCH /events/:id body (.strict(), at least one key). Time fields are merged over the stored
 * ones; a move that names no end keeps the length. `reminders` replaces the set. Every occurrence
 * moves (single-occurrence edits are not supported).
 */
export type EventPatch = Partial<Omit<EventCreate, 'clientKey'>>;

/** POST /events -> 201 { event } (200 with replayed: true); GET / PATCH /events/:id -> { event }. */
export interface EventResponse {
  event: CalendarEvent;
  replayed?: true;
}

/** GET /lifeos/today -> nextEvent: the next occurrence that starts within 7 days ("KÖVETKEZŐ"). */
export interface NextEvent {
  eventId: number;
  date: DayKey;
  title: string;
  location: string | null;
  allDay: boolean;
  startAt: number;
  endAt: number;
  startTime: string | null;
  endTime: string | null;
  recurring: boolean;
  /** B-lifeos-polish: the reminder offsets, minutes before the start, ascending ([] = none). */
  reminders: number[];
  /**
   * B-lifeos-polish (ma-1 "Trattoria Toscana · emlékeztető 18:30"): the reminder that fires first —
   * the largest offset — as epoch seconds and as the wall-clock time in the user's zone.
   */
  firstReminder: { minutesBefore: number; at: number; time: string } | null;
}

/**
 * The self-notifications the reminders write (GET /notifications): `type` is one of these, `title`
 * the item's own name, `body` its time ("10:00–10:45 · Klinika", "21:30", "15:00"), `link_path`
 * `/calendar/events/<id>`, `/habits/<id>` or `/tasks`.
 */
export type ReminderNotificationType = 'lifeos.event' | 'lifeos.habit' | 'lifeos.task';

/* ── Phase 6: focus sessions and the statistics (migration 035, package B-focus) ──────────────── */

/**
 * planned (starts later) · active (running) · ended (ran out, waiting for Befejezés / Feladás) ·
 * done (finished and paid) · cancelled (Feladás, paid nothing).
 */
export type FocusStatus = 'planned' | 'active' | 'ended' | 'done' | 'cancelled';

/**
 * One focus block (GET /focus/current, /focus/:id, every focus write). Times are epoch SECONDS;
 * startTime / endTime are the user's wall clock ('HH:MM'). Amounts are minor units.
 */
export interface FocusSession {
  id: number;
  /** "Min dolgozol?" */
  title: string;
  status: FocusStatus;
  startsAt: number;
  endsAt: number;
  /** focus-1 / focus-2 "21:10" · "22:00". */
  startTime: string | null;
  endTime: string | null;
  plannedMinutes: number;
  /** Whole minutes spent (to now while open, to the close when closed): focus-2 "15 / 50 perc". */
  elapsedMinutes: number;
  /** The countdown (focus-2 "34:42"); the whole plan while planned, 0 when closed. */
  remainingSeconds: number;
  /** "Rajta vagy még?" every N minutes; 0 = none. */
  checkinMinutes: number;
  /** focus-2 ELLENŐRZÉS "1 / 3": checkinsDone / checkinsMax. */
  checkinsDone: number;
  checkinsMax: number;
  /** A check-in can be counted right now (the lime "Rajta vagyok" pill is live). */
  checkinDue: boolean;
  /** When the next check-in becomes answerable (epoch s), null when none is left. */
  nextCheckinAt: number | null;
  lastCheckinAt: number | null;
  /** The whole plan with every check-in answered (focus-1 "Várhatóan +23 érme"). */
  expectedMinor: number;
  /** What Befejezés would pay now (null while planned or closed); the daily coin cap may trim it. */
  payoutNowMinor: number | null;
  closedAt: number | null;
  /** The logical day of the finish / cancel. */
  closedOn: DayKey | null;
  /** done only: the minutes and check-ins the award paid for (focus-3 "50 PERC", "3 / 3"). */
  paidMinutes: number | null;
  paidCheckins: number | null;
  /** done only: the coins credited (focus-3 "+23 jóváírva"); 0 when nothing was paid. */
  awardedMinor: number | null;
  /** done only: the 400-coin daily cap trimmed the award. */
  capped: boolean;
}

/** The rules a focus screen draws its estimates with (admin-global, see PointRules). */
export interface FocusRules {
  pointsPerHour: number;
  checkinPoint: number;
  /** Paid focus minutes per logical day (a finish beyond it pays for the minutes left). */
  maxMinutesPerDay: number;
  minCheckinGapMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  maxCheckinMinutes: number;
}

/** GET /focus/current. Before a zone is set: started false, session null. */
export interface FocusCurrentResponse {
  started: boolean;
  today: DayKey | null;
  /** The server's clock (epoch s) — correct the countdown against it. */
  now?: number;
  session: FocusSession | null;
  /** Focus minutes already paid today. */
  todayMinutes: number;
  rules: FocusRules;
}

/** GET /focus — the open block first, then the newest closed ones (at most 50 closed). */
export interface FocusListResponse {
  started: boolean;
  today?: DayKey;
  now?: number;
  sessions: FocusSession[];
}

/** GET /focus/:id and POST /focus/:id/cancel. */
export interface FocusSessionResponse {
  now?: number;
  session: FocusSession;
  /** cancel only: it was cancelled already. */
  already?: true;
}

/** POST /focus body (.strict()). */
export interface FocusStart {
  /** 8..64 of [A-Za-z0-9_-]; the same key answers the first session whatever the body. */
  clientKey: string;
  /** 1..120 characters. */
  title: string;
  /** 5..720 (focus-1: 25 / 50 / 60 / 90 / 120). */
  minutes: number;
  /** 0 = none, else 5..180 (focus-1: 0 / 10 / 15 / 30). */
  checkinMinutes: number;
  /** A PLANNED start, epoch seconds: now .. now + 24 h (absent = now; the past is refused). */
  startAt?: number;
}

/** POST /focus -> 201 { session } (200 with replayed: true). */
export interface FocusStartResponse {
  session: FocusSession;
  replayed?: true;
}

/** POST /focus/:id/checkin (empty body). counted false = not due yet / within 5 minutes of the last. */
export interface FocusCheckinResponse {
  session: FocusSession;
  counted: boolean;
  reason?: 'not_due' | 'too_soon';
}

/** POST /focus/:id/finish (empty body). `already` = it was finished; nothing paid again. */
export interface FocusFinishResponse {
  session: FocusSession;
  awardedMinor: number;
  capped: boolean;
  already?: true;
}

/** The 409 codes of the focus routes (plus TIMEZONE_REQUIRED and LIMIT_REACHED as LifeosRefusal). */
export type FocusRefusalCode =
  | 'TIMEZONE_REQUIRED'
  | 'LIMIT_REACHED'
  | 'FOCUS_OPEN'
  | 'FOCUS_NOT_STARTED'
  | 'FOCUS_NOT_ACTIVE'
  | 'FOCUS_NO_CHECKINS'
  | 'FOCUS_CLOSED';

export interface FocusRefusal {
  error: string;
  code: FocusRefusalCode;
  /** FOCUS_OPEN: the open session; FOCUS_NOT_ACTIVE: the session as it stands. */
  session?: FocusSession;
  /** LIMIT_REACHED: sessions per logical day (48). */
  limit?: number;
  requestId: string;
}

/** GET /lifeos/today.focus — Ma's FÓKUSZ block. */
export interface TodayFocus {
  /** The open block (planned: "Következő blokk · 25 perc · +8 érme · 14:00"; active; ended). */
  current: FocusSession | null;
  /** Paid focus minutes, finished blocks and focus coins of the logical today. */
  todayMinutes: number;
  todaySessions: number;
  todayEarnedMinor: number;
  maxMinutesPerDay: number;
}

/** closed | lapsed (settled) · open (not settled yet) · before_start · future. */
export type LifeosDayStatus = 'closed' | 'lapsed' | 'open' | 'before_start' | 'future';

/** One logical day (GET /lifeos/days). Settled facts are null on days that have not settled. */
export interface LifeosDay {
  date: DayKey;
  status: LifeosDayStatus;
  /** Net of every LifeOS movement of the day, reversals included. */
  netMinor: number;
  earnedMinor: number;
  /** Positive: the coins lost (penalties, reversals of earns). */
  lostMinor: number;
  /** Penalties of the day (negative movements that are not reversals). */
  penalties: number;
  perfect: boolean;
  workoutDue: boolean | null;
  workoutDone: boolean | null;
  kcalTarget: number | null;
  kcalEaten: number | null;
  kcalOutcome: 'hit' | 'over' | 'under' | 'no_data' | null;
  habitsScheduled: number | null;
  habitsDone: number | null;
  tasksDue: number | null;
  tasksDone: number | null;
  /** Paid focus minutes of blocks finished that day. */
  focusMinutes: number;
}

/** GET /lifeos/days?from&to (both or neither; at most 92 days; default: the last 14). */
export interface LifeosDaysResponse {
  started: boolean;
  today: DayKey | null;
  startedOn?: DayKey | null;
  from: DayKey | null;
  to: DayKey | null;
  days: LifeosDay[];
}

/** A habit's settled day on the Napok SegmentBar (lit = done, half = partial / frozen, off = missed). */
export type HabitCellState = 'done' | 'partial' | 'frozen' | 'missed' | 'relapse' | 'skipped' | 'open' | 'lapsed' | 'none';

/** GET /lifeos/stats?days=7..28 (14)&weeks=1..12 (4) — Haladás > Napok in one answer. */
export interface LifeosStatsResponse {
  started: boolean;
  today: DayKey | null;
  startedOn?: DayKey | null;
  /** EZEN A HÉTEN: "490 érme · átlag 70 / nap · előző hét 339". */
  week: {
    from: DayKey;
    to: DayKey;
    netMinor: number;
    /** net / days elapsed this week (Monday..today), rounded. */
    avgPerDayMinor: number;
    daysElapsed: number;
    prevWeekNetMinor: number;
  } | null;
  /** The day columns, oldest first, the last one today. */
  days: Array<Pick<LifeosDay, 'date' | 'status' | 'netMinor' | 'earnedMinor' | 'lostMinor' | 'perfect'>>;
  /** HETEK, newest first: "42. hét · okt. 12–18. · 1 tökéletes nap · +490". */
  weeks: Array<{
    weekStart: DayKey;
    weekEnd: DayKey;
    isoYear: number;
    isoWeek: number;
    netMinor: number;
    earnedMinor: number;
    lostMinor: number;
    perfectDays: number;
    penalties: number;
    /** The week holding today. */
    current: boolean;
  }>;
  /** SZOKÁSOK over the settled window (the days before today): "okt. 5–17.". */
  habits: {
    from: DayKey;
    to: DayKey;
    rows: Array<{
      id: number;
      name: string;
      kind: HabitKind;
      scheduleType: HabitSchedule;
      /** "12 NAP" · "×1,25" · freezes. */
      streak: HabitStreak;
      cells: Array<{ date: DayKey; state: HabitCellState }>;
    }>;
  } | null;
  /** KALÓRIA over the same window: "4 nap a cél fölött a 13-ból · −10 érme naponta". */
  kcal: {
    from: DayKey;
    to: DayKey;
    /** The newest target in the window ("cél 2200 kcal"), null without a nutrition plan. */
    targetKcal: number | null;
    days: Array<{ date: DayKey; targetKcal: number | null; eatenKcal: number | null; outcome: LifeosDay['kcalOutcome'] }>;
    overDays: number;
    hitDays: number;
    trackedDays: number;
    windowDays: number;
    /** What a day over the target costs (rules.kcalGoalMissed) and a hit pays (rules.kcalGoalHit). */
    penaltyMinor: number;
    rewardMinor: number;
  } | null;
  /** f_app overview(). */
  overview: {
    xp: number;
    level: number;
    bounds: { levelFloorXp: number; nextLevelXp: number };
    balanceMinor: number;
    spendableMinor: number;
    daysTracked: number;
    perfectDays: number;
    workouts: number;
    focusSessions: number;
    focusMinutes: number;
    bestStreak: { habitId: number; name: string; days: number } | null;
    activeStreaks: Array<{ habitId: number; name: string; streak: number; freezes: number }>;
  };
}
