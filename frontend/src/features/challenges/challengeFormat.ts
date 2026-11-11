import type { TFunction } from 'i18next';
import type { Challenge, ChallengeCategory, DayKey } from '../../lib/lifeos-api';

/** The five categories of round B (Fegyelem · Mozgás · Elme · Kapcsolat · Étkezés), in the frames' order. */
export const CATEGORIES: readonly ChallengeCategory[] = ['discipline', 'movement', 'mind', 'connection', 'food'];

/** The category's word, or null for a challenge without one. */
export function categoryLabel(t: TFunction, category: ChallengeCategory | null) {
  return category ? t(`challenges.category.${category}`) : null;
}

/** "+20": the coins a challenge's task pays, as the frames print them (a figure, so mono at the call site). */
export function plusCoins(points: number, lang: string) {
  return `+${points.toLocaleString(lang)}`;
}

/** challenges-2's sub line: "Fegyelem · súly 3" (the weight alone without a category). */
export function poolSub(t: TFunction, c: Challenge) {
  const weight = t('challenges.weight', { count: c.weight });
  const cat = categoryLabel(t, c.category);
  return cat ? `${cat} · ${weight}` : weight;
}

/** "okt. 21." — a logical day key as the head of HÁROM LEHETŐSÉG prints it, in the app's language. */
export function shortDay(day: DayKey, lang: string) {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}
