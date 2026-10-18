import type { Habit } from '../../lib/lifeos-api';
import { WEEKDAYS, dayKeyToDate, maskHas, weekdayShort } from '../../ui/primitives/weekdays';

/**
 * Pure helpers of the habit screens: figures, days and the words a habit is described by. Nothing
 * here holds copy — every word comes from i18n or from `Intl`.
 */

/** "+15", "−10", "0": whole coins from minor units, with a TRUE minus (U+2212) as the frames print it. */
export function signedCoins(minor: number, locale: string) {
  const coins = Math.trunc(minor / 100);
  const figure = Math.abs(coins).toLocaleString(locale);
  return coins > 0 ? `+${figure}` : coins < 0 ? `−${figure}` : figure;
}

/** "×1,25" — a multiplier in basis points, in the app language. */
export function multiplierLabel(bp: number, locale: string) {
  return `×${(bp / 10000).toLocaleString(locale, { maximumFractionDigits: 2 })}`;
}

/** "07:40" — an epoch-seconds instant as a wall-clock time on this device. */
export function clockOf(epochSeconds: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(epochSeconds * 1000));
}

/** "Vasárnap, október 18." — weekday first and capitalised (the DateTrigger inline form). */
export function longDay(key: string, locale: string) {
  const d = dayKeyToDate(key);
  if (!d) return key;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
  const day = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(d);
  return `${weekday.charAt(0).toLocaleUpperCase(locale)}${weekday.slice(1)}, ${day}`;
}

/** "aug. 3." — the strip's first day. */
export function shortDay(key: string, locale: string) {
  const d = dayKeyToDate(key);
  return d ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d) : key;
}

/** The day `n` days after `key` (calendar arithmetic, never through UTC midnight). */
export function addDays(key: string, n: number) {
  const d = dayKeyToDate(key);
  if (!d) return key;
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole days from `a` to `b` (both `YYYY-MM-DD`). */
export function daysBetween(a: string, b: string) {
  const x = dayKeyToDate(a);
  const y = dayKeyToDate(b);
  if (!x || !y) return 0;
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86_400_000);
}

/** "H K Sze Cs P" — the weekdays of a mask, Monday first, in the app language. */
export function maskDays(mask: number, locale: string) {
  return WEEKDAYS.filter((d) => maskHas(mask, d))
    .map((d) => weekdayShort(d, locale))
    .join(' ');
}

/** A counted habit (a daily target above 1: "5/8 pohár"). */
export const isCounted = (h: Habit) => h.kind === 'good' && h.targetCount > 1;

/** Today's count and whether it reached the target. */
export function todayOf(h: Habit) {
  const count = h.log?.count ?? 0;
  return { count, done: h.log?.status === 'done', skipped: h.log?.status === 'skipped', relapses: h.log?.status === 'relapse' ? count : 0 };
}

/** The streak shown at the end of a row and in the hero: days, or weeks for a times-per-week habit. */
export function streakOf(h: Habit): { value: number; weeks: boolean } {
  return h.scheduleType === 'times_per_week' && h.kind === 'good' ? { value: h.streak.weekStreak ?? 0, weeks: true } : { value: h.streak.current, weeks: false };
}

/**
 * Whether a habit counts in "MA a/b" (README-ma fix round 1): a live good habit scheduled today
 * that is not times-per-week. Bad habits and weekly quotas are shown, not counted.
 */
export const countsToday = (h: Habit) => !h.archived && h.kind === 'good' && h.scheduledToday && h.scheduleType !== 'times_per_week';
