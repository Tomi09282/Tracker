/*
 * Weekdays for the LifeOS kit (lane G-lifeos): the order, the mask and the drawn names.
 *
 * The week starts on Monday (Hungarian use, and f_app's `weekdayMask`: bit 0 = Monday … bit 6 =
 * Sunday — `src/domain/recurrence.ts`). The names are the platform's own short weekday in the app
 * language (`Intl.DateTimeFormat`, `weekday: 'short'`): in Hungarian exactly the frames' words
 * "H K Sze Cs P Szo V" (task-form, habit-form, calendar-1), so no bundle key is needed.
 */

/** Monday = 0 … Sunday = 6, the bit index of a weekday mask. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS: readonly WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6];

/** Every weekday set: 0b1111111. */
export const ALL_WEEKDAYS_MASK = 127;

/** `YYYY-MM-DD` as a local calendar day (never through UTC, which would move it across midnight). */
export function dayKeyToDate(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** The Monday-first index of a local date. */
export function weekdayIndexOf(date: Date): WeekdayIndex {
  return ((date.getDay() + 6) % 7) as WeekdayIndex;
}

export function maskHas(mask: number, day: WeekdayIndex): boolean {
  return (mask & (1 << day)) !== 0;
}

export function maskToggle(mask: number, day: WeekdayIndex): number {
  return mask ^ (1 << day);
}

/** A Monday (2024-01-01) plus `i` days: a fixed date for each weekday, to ask Intl for its name. */
const REFERENCE = (i: WeekdayIndex) => new Date(2024, 0, 1 + i);

const upperFirst = (s: string, locale: string) => (s ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s);

/** The drawn name ("Sze") — short, first letter upper case. */
export function weekdayShort(i: WeekdayIndex, locale: string): string {
  return upperFirst(new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(REFERENCE(i)), locale);
}

/** The spoken name ("szerda") — the accessible name of a weekday chip. */
export function weekdayLong(i: WeekdayIndex, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(REFERENCE(i));
}
