import { dayKeyToDate } from '../../../ui/primitives/weekdays';

/**
 * Pure helpers of Haladás > Napok. No copy lives here: dates come from `Intl`, words from i18n.
 */

/** Whole coins from minor units (the server's amounts are minor: 100 = 1 coin). */
export const coinsOf = (minor: number) => Math.trunc(minor / 100);

/** "+157", "−20", "0" — whole coins with a TRUE minus (U+2212), as the frame prints them. */
export function signedFigure(coins: number, locale: string) {
  const figure = Math.abs(coins).toLocaleString(locale);
  return coins > 0 ? `+${figure}` : coins < 0 ? `−${figure}` : figure;
}

/** The day of the month of a `YYYY-MM-DD` key: the day columns' mono label ("5" … "18"). */
export function dayOfMonth(key: string) {
  const d = dayKeyToDate(key);
  return d ? String(d.getDate()) : key;
}

/** "október 18., vasárnap" — what a screen reader says for one day column. */
export function spokenDay(key: string, locale: string) {
  const d = dayKeyToDate(key);
  return d ? new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'long' }).format(d) : key;
}

/** "okt. 5." — one short day (the kcal axis). */
export function shortDay(key: string, locale: string) {
  const d = dayKeyToDate(key);
  return d ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d) : key;
}

/**
 * "okt. 12–18.", "szept. 28. – okt. 4." — a span of days as the locale writes a range (the week
 * rows' sub line and SZOKÁSOK "okt. 5–17."). `Intl` folds the shared month itself.
 */
export function dayRange(from: string, to: string, locale: string) {
  const a = dayKeyToDate(from);
  const b = dayKeyToDate(to);
  if (!a || !b) return `${from} – ${to}`;
  const f = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  return a.getTime() === b.getTime() ? f.format(a) : f.formatRange(a, b);
}

/**
 * Hungarian vowel harmony of a number's elative suffix: "13-ból" but "14-ből". The suffix follows
 * the LAST word the number is read as — the units digit, or the tens word for a round ten
 * (tíz-ből, húsz-ból), the hundreds for a round hundred (száz-ból). True = the back-vowel form
 * (-ból). Used only to pick between two i18n keys; other languages have one form.
 */
export function hungarianBackVowel(n: number) {
  const x = Math.abs(Math.trunc(n));
  if (x === 0) return false; // nulla-ból… is never shown (a window always has days)
  const units = x % 10;
  if (units !== 0) return [3, 6, 8].includes(units); // három, hat, nyolc -> ból; the rest -> ből
  const tens = Math.trunc(x / 10) % 10;
  if (tens !== 0) return [2, 3, 6, 8].includes(tens); // húsz, harminc, hatvan, nyolcvan -> ból
  const hundreds = Math.trunc(x / 100) % 10;
  if (hundreds !== 0) return true; // száz -> ból
  return false; // ezer -> ből
}

