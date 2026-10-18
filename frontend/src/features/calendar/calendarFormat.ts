import type { DayKey, EventRecurrence, ReminderOffset } from '../../lib/lifeos-api';
import { dayKeyToDate, weekdayIndexOf, type WeekdayIndex } from '../../ui/primitives/weekdays';

/**
 * Naptár — the words and dates the calendar screens print. Pure functions over `DayKey`s
 * (`YYYY-MM-DD`, a LOCAL calendar day: never through UTC, which would move it across midnight).
 *
 * Every word comes from the bundles (`t`); what is computed here is only what Hungarian grammar
 * glues onto a figure (the "-án / -én" of a day of the month), which no bundle can hold for 31 days.
 */

type TFn = (key: string, options?: Record<string, unknown>) => string;

export function keyOf(d: Date): DayKey {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The device's calendar today — only a first guess for the week to ask for; the server's `today` wins. */
export const deviceToday = (): DayKey => keyOf(new Date());

export function addDays(key: DayKey, days: number): DayKey {
  const d = dayKeyToDate(key);
  if (!d) return key;
  d.setDate(d.getDate() + days);
  return keyOf(d);
}

/** The Monday of the week a day is in (the DayRail week runs Monday..Sunday, as the frames). */
export function mondayOf(key: DayKey): DayKey {
  const d = dayKeyToDate(key);
  return d ? addDays(key, -weekdayIndexOf(d)) : key;
}

export const weekdayOf = (key: DayKey): WeekdayIndex => {
  const d = dayKeyToDate(key);
  return d ? weekdayIndexOf(d) : 0;
};

/** The ISO 8601 week number ("43. hét"): the week of the Thursday of the week. */
export function isoWeek(key: DayKey): number {
  const d = dayKeyToDate(key);
  if (!d) return 0;
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekdayIndexOf(d) + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const week1Thursday = new Date(jan4.getFullYear(), 0, 4 - weekdayIndexOf(jan4) + 3);
  return 1 + Math.round((thursday.getTime() - week1Thursday.getTime()) / (7 * 86_400_000));
}

const upperFirst = (s: string, locale: string) => (s ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s);

/** "Október 2026" — the month and year of a day, capitalised (calendar-1's week line). */
export function monthYear(key: DayKey, locale: string): string {
  const d = dayKeyToDate(key);
  if (!d) return key;
  // The month word, then the year: "Október 2026" in all three languages (hu Intl would say "2026. október").
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(d);
  return `${upperFirst(month, locale)} ${d.getFullYear()}`;
}

/** "október 21." / "October 21" / "21. Oktober". */
export function monthDay(key: DayKey, locale: string): string {
  const d = dayKeyToDate(key);
  return d ? new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(d) : key;
}

/** "Szerda, október 21." — the day section's head and event-detail's eyebrow. */
export function weekdayMonthDay(key: DayKey, locale: string): string {
  const d = dayKeyToDate(key);
  if (!d) return key;
  return `${upperFirst(new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d), locale)}, ${monthDay(key, locale)}`;
}

/** "okt. 21." — event-form's Dátum field (words, 106 pt wide). */
export function shortDay(key: string, locale: string): string {
  const d = dayKeyToDate(key);
  return d ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d) : key;
}

/** "December 19" — the until date before "-ig" / "Until …" / "Bis …". */
export function untilDay(key: DayKey, locale: string): string {
  return upperFirst(monthDay(key, locale).replace(/\.$/, ''), locale);
}

/**
 * The Hungarian "-án / -én / -jén" a day of the month takes ("24-én", "1-jén", "3-án"): decided by
 * how the number is SAID (egy, kettő, három …, húsz, harminc), so it is a table and not a rule.
 */
const HU_DAY_SUFFIX: Record<number, string> = {
  1: 'jén', 2: 'án', 3: 'án', 4: 'én', 5: 'én', 6: 'án', 7: 'én', 8: 'án', 9: 'én', 10: 'én',
  11: 'én', 12: 'én', 13: 'án', 14: 'én', 15: 'én', 16: 'án', 17: 'én', 18: 'án', 19: 'én', 20: 'án',
  21: 'jén', 22: 'án', 23: 'án', 24: 'én', 25: 'én', 26: 'án', 27: 'én', 28: 'án', 29: 'én', 30: 'án', 31: 'jén',
};

/** "24-én" (hu) / "24" — a day of the month as the rule sentences say it. */
export function dayOn(day: number, locale: string): string {
  return locale.startsWith('hu') ? `${day}-${HU_DAY_SUFFIX[day] ?? 'én'}` : String(day);
}

/** "október 24-én" (hu) / "October 24" / "24. Oktober" — a yearly rule's date. */
export function monthDayOn(key: DayKey, locale: string): string {
  const d = dayKeyToDate(key);
  if (!d) return key;
  if (!locale.startsWith('hu')) return monthDay(key, locale);
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(d);
  return `${month} ${dayOn(d.getDate(), locale)}`;
}

/** The i18n key segment of each weekday index (0 = Monday): `calendar.rule.on.<key>`. */
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Weekday indexes (0 = Monday) in an f_app weekday mask. */
export const maskDays = (mask: number): WeekdayIndex[] => ([0, 1, 2, 3, 4, 5, 6] as const).filter((i) => (mask & (1 << i)) !== 0);

/**
 * The repeat rule as the agenda's sub line says it, lower case ("minden szombaton", "minden évben,
 * október 24-én"); `anchor` is the event's first day (a yearly rule repeats its month and day).
 */
export function ruleText(rule: EventRecurrence, anchor: DayKey, locale: string, t: TFn): string {
  switch (rule.type) {
    case 'daily':
      return (rule.interval ?? 1) > 1 ? t('calendar.rule.everyN', { count: rule.interval }) : t('calendar.rule.daily');
    case 'weekly':
      return t('calendar.rule.weekly', { days: maskDays(rule.weekdayMask).map((i) => t(`calendar.rule.on.${WEEKDAY_KEYS[i]}`)).join(', ') });
    case 'monthly':
      return t('calendar.rule.monthly', { day: dayOn(rule.day, locale) });
    case 'yearly':
      return t('calendar.rule.yearly', { date: monthDayOn(anchor, locale) });
  }
}

/** event-detail's recurrence row title: "Minden héten, szombaton" — the sentence, capitalised. */
export function ruleTitle(rule: EventRecurrence, anchor: DayKey, locale: string, t: TFn): string {
  if (rule.type === 'weekly') {
    return t('calendar.rule.weeklyTitle', { days: maskDays(rule.weekdayMask).map((i) => t(`calendar.rule.on.${WEEKDAY_KEYS[i]}`)).join(', ') });
  }
  return upperFirst(ruleText(rule, anchor, locale, t), locale);
}

/** The sub line of an agenda row: the place, then the rule ("Hajós Alfréd uszoda · minden szombaton"); capitalised. */
export function agendaSub(parts: (string | null | undefined)[], locale: string): string | null {
  const s = parts.filter((p): p is string => !!p && p.trim() !== '').join(' · ');
  return s ? upperFirst(s, locale) : null;
}

/**
 * event-detail's reminder line: "15 perccel és 1 nappal előtte", "Kezdéskor", "Kezdéskor, 1 órával
 * előtte". Offsets in minutes before the start (0 = at the start).
 */
export function reminderLine(offsets: readonly ReminderOffset[], locale: string, t: TFn): string | null {
  if (offsets.length === 0) return null;
  const sorted = [...offsets].sort((a, b) => a - b);
  const atStart = sorted.includes(0);
  const parts = sorted
    .filter((m) => m > 0)
    .map((m) =>
      m % 1440 === 0
        ? t('calendar.reminder.days', { count: m / 1440 })
        : m % 60 === 0
          ? t('calendar.reminder.hours', { count: m / 60 })
          : t('calendar.reminder.minutes', { count: m }),
    );
  const list =
    parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} ${t('calendar.reminder.and')} ${parts[parts.length - 1]}`;
  const before = list ? t('calendar.reminder.before', { list }) : '';
  const text = atStart ? (before ? `${t('calendar.reminder.atStart')}, ${before}` : t('calendar.reminder.atStart')) : before;
  return upperFirst(text, locale);
}

/** Minutes between two `HH:MM` wall clocks; an end before the start runs past midnight. */
export function minutesBetween(start: string, end: string): number | null {
  const m = /^(\d{2}):(\d{2})$/;
  const a = m.exec(start);
  const b = m.exec(end);
  if (!a || !b) return null;
  const diff = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
  return diff < 0 ? diff + 1440 : diff;
}

/** `HH:MM` plus minutes, on a 24 h clock. */
export function addMinutes(time: string, minutes: number): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const total = (((Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

