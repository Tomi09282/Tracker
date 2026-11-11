import type { LifeosLedgerFields, LifeosWallet } from '../../lib/lifeos-api';
import type { LedgerEntry, Wallet } from './useCoins';
import { toCoins } from './useCoins';

/**
 * Pure helpers of the coins page (LifeOS Phase 2, design round B: coins-1v2 / coins-2v2).
 *
 * The wallet and the ledger grew LifeOS fields on the server (migration 031, package B-core,
 * `lib/lifeos-api.ts`). The hooks in `useCoins.ts` are frozen, so the page reads their answers
 * through these WIDER types: every LifeOS field is optional, because an older server does not
 * send it — and a field that is not there is never drawn as a zero.
 */
export type WalletRead = Wallet & Partial<Omit<LifeosWallet, 'balanceMinor'>>;
export type LedgerRead = LedgerEntry & Partial<LifeosLedgerFields>;

/* ── the level ─────────────────────────────────────────────────────────────────────────────── */

/** The XP SegmentBar's resolution: ten segments between the level's floor and the next level. */
export const XP_SEGMENTS = 10;

export interface LevelRead {
  level: number;
  xp: number;
  next: number;
  /** XP still missing to the next level. */
  missing: number;
  /** The share of the way from this level's floor to the next level, 0..1 (Profil's SZINT bar). */
  progress: number;
  /** One state per segment: full ones lit, the one being filled half, the rest off. */
  segments: ('on' | 'half' | 'off')[];
}

/**
 * The level block, or null when the server did not send a level (an older server): a level that
 * is not known is not drawn.
 *
 * coins-1v2: level 4, 2158 XP, floor 1600, next 2500 → a span of 900 in ten segments of 90; 558
 * XP into the level is 6 full segments and a seventh one begun (half), three off.
 */
export function readLevel(wallet: WalletRead | undefined): LevelRead | null {
  if (!wallet || typeof wallet.level !== 'number' || typeof wallet.xp !== 'number' || !wallet.bounds) return null;
  const { levelFloorXp, nextLevelXp } = wallet.bounds;
  const span = Math.max(1, nextLevelXp - levelFloorXp);
  const into = Math.min(span, Math.max(0, wallet.xp - levelFloorXp));
  const per = span / XP_SEGMENTS;
  const full = Math.min(XP_SEGMENTS, Math.floor(into / per));
  const begun = full < XP_SEGMENTS && into - full * per > 0;
  return {
    level: wallet.level,
    xp: wallet.xp,
    next: nextLevelXp,
    missing: Math.max(0, nextLevelXp - wallet.xp),
    progress: into / span,
    segments: Array.from({ length: XP_SEGMENTS }, (_, i) => (i < full ? 'on' : i === full && begun ? 'half' : 'off')),
  };
}

/**
 * Hungarian puts "az" before a word that starts with a vowel SOUND, "a" otherwise — and a figure is
 * read aloud: "az 5. szintig" (öt), "a 4. szintig" (négy). The numbers that start with a vowel are
 * 1 (egy), every 5..., and 1000-1999 (ezer); 10-19 (tíz) and 100-199 (száz) do not.
 */
export function hungarianArticleIsAz(n: number): boolean {
  const s = String(Math.abs(Math.trunc(n)));
  if (s === '1') return true;
  if (s.length === 4 && s[0] === '1') return true;
  return s[0] === '5';
}

/* ── the statement ─────────────────────────────────────────────────────────────────────────── */

/** 'YYYY-MM-DD' of an epoch-seconds instant in the browser's zone. */
export function localDayKey(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The day before a 'YYYY-MM-DD' key (calendar arithmetic, no zone involved). */
export function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
}

export interface StatementDay {
  date: string;
  /** Net of the day's movements, in whole coins (spends included: coins-2v2 "MA · OKT. 18. -40"). */
  netCoins: number;
  entries: LedgerRead[];
}

/**
 * The statement grouped by day, newest first, in the order the server sends it. A LifeOS movement
 * belongs to its LOGICAL day (`localDate`: the habit pay of yesterday lands in yesterday's group
 * although it was written this morning); any other movement to the browser's calendar day of
 * `createdAt`.
 */
export function groupByDay(entries: readonly LedgerRead[]): StatementDay[] {
  const days: StatementDay[] = [];
  const byDate = new Map<string, StatementDay>();
  for (const e of entries) {
    const date = e.localDate ?? localDayKey(e.createdAt);
    let day = byDate.get(date);
    if (!day) {
      day = { date, netCoins: 0, entries: [] };
      byDate.set(date, day);
      days.push(day);
    }
    day.entries.push(e);
  }
  for (const day of days) day.netCoins = toCoins(day.entries.reduce((sum, e) => sum + e.amountMinor, 0));
  return days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** A signed whole-coin figure as the statement prints it: "+30", "-80" (ASCII hyphen), "0". */
export const signed = (coins: number) => `${coins > 0 ? '+' : ''}${coins}`;
