import type { FocusRules, FocusSession } from '../../lib/lifeos-api';

/**
 * The focus screens' arithmetic and words — nothing here decides an amount. The server pays (B-focus
 * api.md, "The economy of a focus block"); these helpers only draw the same rules BEFORE a block
 * exists (focus-1's estimate) and explain what was paid AFTER (focus-3's sum line).
 */

/** focus-1's IDŐTARTAM words, in minutes (B-focus api.md: "focus-1 offers 25 / 50 / 60 / 90 / 120"). */
export const DURATIONS = [25, 50, 60, 90, 120] as const;
/** focus-1's ELLENŐRZÉS words: Nincs (0) / 10 / 15 / 30. */
export const CHECKINS = [0, 10, 15, 30] as const;
/** The frame's selection (focus-1: "50 perc", "15 perc"). */
export const DEFAULT_MINUTES = 50;
export const DEFAULT_CHECKIN = 15;
/** POST /focus: title 1..120. */
export const TITLE_MAX = 120;

/** How many check-ins a block of `minutes` holds: the interval's multiples strictly before the end. */
export function checkinsFor(minutes: number, interval: number): number {
  if (interval <= 0) return 0;
  return Math.floor((minutes - 1) / interval);
}

/** The minutes' share: round(minutes × perHour / 60) (f_app focus.ts; 50 × 20 / 60 = 16.7 -> 17). */
export function minutesCoins(minutes: number, rules: Pick<FocusRules, 'pointsPerHour'>): number {
  return Math.round((minutes * rules.pointsPerHour) / 60);
}

/** focus-1 "Várhatóan +23 érme": the whole plan, every check-in answered, in COINS (1 point = 1 coin). */
export function expectedCoins(minutes: number, interval: number, rules: Pick<FocusRules, 'pointsPerHour' | 'checkinPoint'>): number {
  return minutesCoins(minutes, rules) + checkinsFor(minutes, interval) * rules.checkinPoint;
}

/** Minor units (1 coin = 100) to whole coins, as the ledger shows them. */
export const coinsOf = (minor: number) => Math.round(minor / 100);

/** "21:10" in the user's wall clock, from epoch seconds. */
export function clockAt(epochSeconds: number, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(
    new Date(epochSeconds * 1000),
  );
}

/** "21:10 → 22:00" / "21:10 – 22:00": two clock figures, the separator is the frame's. */
export const span = (start: string, end: string, sep: '→' | '–') => `${start} ${sep} ${end}`;

/**
 * The wall-clock time a block really ended. A block closed before its planned end (Befejezés early)
 * ends at the close, not at the plan: the planned end time moved back by what was left. Zone-free: both
 * clocks are the server's wall times and the shift is a difference of two instants.
 */
export function endedAtClock(s: Pick<FocusSession, 'endTime' | 'endsAt' | 'closedAt'>): string {
  const end = s.endTime ?? '';
  if (s.closedAt === null || s.closedAt >= s.endsAt || !/^\d{2}:\d{2}$/.test(end)) return end;
  const minutes = Math.round((s.endsAt - s.closedAt) / 60);
  const total = (((Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5)) - minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "1 / 3": mono figures, the frame's spacing. */
export const ratio = (done: number, of: number) => `${done} / ${of}`;

/** A session that is still open: planned, running or ran out. */
export const isOpen = (s: FocusSession | null | undefined): s is FocusSession =>
  !!s && (s.status === 'planned' || s.status === 'active' || s.status === 'ended');
