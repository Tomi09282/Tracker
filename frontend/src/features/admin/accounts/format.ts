import { useTranslation } from 'react-i18next';
import { toCoins } from '../../coins/useCoins';

/**
 * "2026. 11. 03." and "2026. 11. 03. 08:12": the way the frames write an instant, in the reader's
 * language (Hungarian puts the year first, the others follow their own order). Seconds in, text out.
 */
export function useAccountFormat() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const date = (s: number) =>
    new Date(s * 1000).toLocaleDateString(lang, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateTime = (s: number) =>
    new Date(s * 1000).toLocaleString(lang, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  /** "11. 03." - the ledger's short day (the year is the page's, not the row's). */
  const shortDate = (s: number) => new Date(s * 1000).toLocaleDateString(lang, { month: '2-digit', day: '2-digit' });
  const time = (s: number) =>
    new Date(s * 1000).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false });
  return { date, dateTime, shortDate, time };
}

/** A coin amount in whole coins with its sign: +30, -50 (hyphen-minus: it exists in every face the ledger is set in). */
export const signedCoins = (minor: number) => {
  const c = toCoins(minor);
  return `${c > 0 ? '+' : c < 0 ? '-' : ''}${Math.abs(c)}`;
};
