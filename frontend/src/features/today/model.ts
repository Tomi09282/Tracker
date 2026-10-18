import type { Habit, LifeosToday, Recurrence, Task } from '../../lib/lifeos-api';
import type { SegmentState } from '../../ui/data/SegmentBar';

/**
 * The arithmetic of Ma — pure functions over `GET /lifeos/today`, written down once so the hero, the
 * rows and their screen-reader words cannot disagree. The rules are the frames' (README-ma, fix
 * rounds 1 and 2) as B-habits-tasks api.md restates them; nothing here computes a coin the server
 * did not send.
 */

export const MINOR_PER_COIN = 100;

/** A good habit that counts in "MA a/b": scheduled today, not times-per-week, not skipped. */
const countsToday = (h: Habit) =>
  h.kind === 'good' && h.scheduledToday && !h.archived && h.scheduleType !== 'times_per_week' && h.log?.status !== 'skipped';

export const habitDone = (h: Habit) => h.log?.status === 'done';

/** A partial counted habit is a half segment only from 50 % (README-ma fix round 1). */
const habitHalf = (h: Habit) => !habitDone(h) && h.targetCount > 1 && (h.log?.count ?? 0) * 2 >= h.targetCount;

/** A bad habit relapsed today (its log counts today's relapses). */
export const relapsedToday = (h: Habit) => h.kind === 'bad' && (h.log?.count ?? 0) > 0;

export interface DayCount {
  done: number;
  half: number;
  total: number;
  segments: SegmentState[];
  /** The only item of the day is the workout, still to do (ma-3's caption). */
  onlyWorkout: boolean;
  /** Everything counted is done and no bad habit relapsed (ma-2's line). */
  perfect: boolean;
}

/**
 * "MA a/b": the scheduled workout + the good habits due today + the tasks due today (open ones and
 * those completed today that were due today). Bad habits and times-per-week habits are shown, not
 * counted; the challenge never counts. `habits` / `tasks` are null when the server does not send
 * them (a backend before migration 032): then only the workout counts.
 */
export function dayCount(day: LifeosToday): DayCount {
  const habits = day.habits ?? [];
  const counted = habits.filter(countsToday);
  const workoutDue = day.workout.due ? 1 : 0;
  const workoutDone = day.workout.due && day.workout.done ? 1 : 0;
  const dueToday = (t: Task) => t.dueOn !== null && t.dueOn === day.today;
  const tasksOpen = day.tasks ? day.tasks.due.filter(dueToday).length : 0;
  const tasksDone = day.tasks ? day.tasks.completedToday.filter(dueToday).length : 0;
  const done = workoutDone + counted.filter(habitDone).length + tasksDone;
  const half = counted.filter(habitHalf).length;
  const total = workoutDue + counted.length + tasksOpen + tasksDone;
  const segments: SegmentState[] = [
    ...Array<SegmentState>(done).fill('on'),
    ...Array<SegmentState>(half).fill('half'),
    ...Array<SegmentState>(Math.max(0, total - done - half)).fill('off'),
  ];
  return {
    done,
    half,
    total,
    segments,
    onlyWorkout: total === 1 && workoutDue === 1 && workoutDone === 0,
    perfect: total > 0 && done === total && !habits.some(relapsedToday),
  };
}

/**
 * "Ma eddig +N", in minor units: the coins paid for tasks completed today + the preview of today's
 * habits (a bad habit's preview is its relapse penalty, negative). Clean-day pay, the kcal outcome
 * and the perfect day come only when the day settles, so they are not in it. Null without the
 * Phase-3 fields.
 */
export function earnedTodayMinor(day: LifeosToday): number | null {
  if (!day.habits || !day.tasks) return null;
  const tasks = day.tasks.completedToday.reduce((sum, t) => sum + (t.paidMinor ?? 0), 0);
  const habits = day.habits.reduce((sum, h) => sum + h.previewMinor, 0);
  return tasks + habits;
}

/** Whole coins from minor units, rounded toward the figure the server would print. */
export const coins = (minor: number) => Math.round(minor / MINOR_PER_COIN);

/** "+18", "−10", "0" — a signed figure with a TRUE minus (U+2212), as the frames print it. */
export function signed(value: number, lang: string) {
  const abs = Math.abs(value).toLocaleString(lang);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `\u2212${abs}`;
  return abs;
}

/** "×1,25" in Hungarian, "×1.25" in English — a multiplier in basis points (12500 = ×1.25). */
export const multiplier = (bp: number, lang: string) =>
  `×${(bp / 10000).toLocaleString(lang, { maximumFractionDigits: 2 })}`;

/** "07:40" — an epoch-seconds instant on the user's own clock (the LifeOS zone when known). */
export function clockOf(epochSeconds: number, lang: string, timeZone: string | null) {
  return new Intl.DateTimeFormat(lang, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(epochSeconds * 1000));
}

/** "Hétfő, október 19." — a day key in the app language, weekday first (see TodayPage). */
export function dayLabel(dayKey: string | null, lang: string) {
  const date = dayKey ? new Date(`${dayKey}T12:00:00Z`) : new Date();
  const zone = dayKey ? { timeZone: 'UTC' } : {};
  return [
    new Intl.DateTimeFormat(lang, { weekday: 'long', ...zone }).format(date),
    new Intl.DateTimeFormat(lang, { month: 'long', day: 'numeric', ...zone }).format(date),
  ].join(', ');
}

/** The day after a day key. */
export const nextDay = (dayKey: string) =>
  new Date(Date.parse(`${dayKey}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Monday-first weekday index (0 = Monday) of a day key. */
export const weekdayIndex = (dayKey: string) => (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7;

/** The level bar: how far the XP is from this level's floor to the next level's threshold, 0..1. */
export function levelProgress(xp: number, floor: number, next: number) {
  if (next <= floor) return 0;
  return Math.min(1, Math.max(0, (xp - floor) / (next - floor)));
}

/**
 * What a task row prints on its right: an open task what completing it NOW pays (half when late),
 * a completed one what it paid.
 */
export const taskCoinsMinor = (t: Task) => (t.completedAt !== null ? t.paidMinor : (t.payoutNowMinor ?? t.valueMinor)) ?? 0;

/** The recurrence word of a task row: one weekday has its own word ("keddenként"), else the period. */
export type RecurrenceWord =
  | { kind: 'daily' }
  | { kind: 'weekly' }
  | { kind: 'weekday'; index: number }
  | { kind: 'monthly' };

export function recurrenceWord(rule: Recurrence): RecurrenceWord {
  if (rule.type === 'daily') return { kind: 'daily' };
  if (rule.type === 'monthly') return { kind: 'monthly' };
  const days = [0, 1, 2, 3, 4, 5, 6].filter((i) => (rule.weekdayMask >> i) & 1);
  return days.length === 1 ? { kind: 'weekday', index: days[0] } : { kind: 'weekly' };
}
