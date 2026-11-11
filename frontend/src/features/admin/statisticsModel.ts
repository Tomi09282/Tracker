import { useQuery } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';
import type { TrendPoint } from '../../ui/feedback/TrendChart';

/*
 * The two reads behind the admin statistics: the compact panel on Moderáció (`GET /admin/stats`,
 * its additive `panel` key) and the Statistics page (`GET /admin/statistics?days=7|30|90`).
 *
 * The types are the ones of docs/pipeline/pulse/pkg/B-admin-stats/api.md, written out here because
 * the server is not a TypeScript project. Both routes are admin-only and answer counts, never a
 * name or an id: this file carries no authority, it only says what the page may draw.
 *
 * ═══ THE CLOCKS ARE THE SERVER'S ═══════════════════════════════════════════════════════════════
 *
 * Every series is dense and ascending (exactly `days` points, zero where nothing happened) and its
 * day keys are `YYYY-MM-DD` of the clock the response names. The page never infers a missing day and
 * never reads a day key as a local date.
 */

export type DayKey = string;
export interface DailyN {
  day: DayKey;
  n: number;
}

export interface AdminPanel {
  today: DayKey;
  users: { total: number; new7d: number };
  /** The coach role only (not `GET /admin/metrics` coaches.withClients). */
  activeCoaches: number;
  workouts: { clock: 'local_date'; today: number; last7d: number };
  /** Exactly what the queue lists. The older `moderation.pending` of the same payload can differ by orphans. */
  moderationPending: number;
  openReports: number;
  loggedPeople: { clock: 'local_date'; daily: DailyN[]; today: number; inWindow: number };
}

/** `GET /admin/stats`: the old keys the page no longer draws are left out of the type. */
export interface AdminStats {
  panel: AdminPanel;
}

export type StatisticsDays = 7 | 30 | 90;
export const STATISTICS_WINDOWS: readonly StatisticsDays[] = [7, 30, 90];
export const DEFAULT_WINDOW: StatisticsDays = 30;

export interface AdminStatistics {
  window: { days: StatisticsDays; from: DayKey; to: DayKey; today: DayKey; clock: 'utc' };
  users: {
    total: number;
    byRole: { user: number; coach: number; admin: number };
    disabled: number;
    mustChange: number;
    new7d: number;
    signups: { clock: 'utc'; daily: DailyN[]; total: number };
  };
  activity: {
    loggedPeople: { clock: 'local_date'; daily: DailyN[]; today: number; inWindow: number };
    completedWorkouts: { clock: 'local_date'; daily: DailyN[]; total: number; today: number; last7d: number };
    nutritionLog: { clock: 'local_date'; daily: { day: DayKey; people: number; entries: number }[]; totalEntries: number };
  };
  coins: {
    clock: 'utc';
    daily: { day: DayKey; mintedMinor: number; spentMinor: number; entries: number }[];
    mintedMinor: number;
    spentMinor: number;
    movedMinor: number;
    entries: number;
    integrity: { ok: boolean; drifting: number; unpaidPurchases: number; orphanDebits: number; unbackedEntitlements: number; capped: boolean };
  };
  marketplace: {
    clock: 'epoch';
    posts: { total: number; draft: number; scheduled: number; live: number; withdrawn: number; removed: number };
    reports: { open: number; triaged: number; openBySeverity: { high: number; medium: number; low: number }; resolvedInWindow: number };
  };
  coaches: {
    withRole: number;
    withClients: number;
    activeLinks: number;
    clientsPerCoach: number | null;
    distribution: { bucket: '1' | '2-3' | '4-5' | '6-10' | '11+'; coaches: number }[];
  };
  system: {
    clock: 'epoch';
    liveSessions: { people: number; logins: number };
    auditEvents24h: number;
    exercises: { total: number; global: number; private: number; custom: number; pendingReview: number };
    media: { total: number; bytes: number };
    translations: { rows: number; langs: number };
  };
}

/** The panel's read. It shares the `['admin', 'stats']` key with nothing else; a decision on the queue refreshes it with the rest of `['admin']`. */
export function useAdminStats(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiWithRefresh<AdminStats>('/admin/stats'),
    enabled,
    // Offline, a read that is not cached FAILS (and reaches the designed error state with "Újra") instead of
    // pausing for ever behind a loading skeleton (review S-admin-moderation 5).
    networkMode: 'always',
  });
}

/** The Statistics page's read, one key per window so a switch back is instant. */
export function useAdminStatistics(days: StatisticsDays, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'statistics', days],
    queryFn: () => apiWithRefresh<AdminStatistics>(`/admin/statistics?days=${days}`),
    enabled,
    networkMode: 'always', // see useAdminStats
  });
}

/** A dense daily series as the kit's chart points. */
export function toTrend<T extends { day: DayKey }>(rows: readonly T[], value: (row: T) => number): TrendPoint[] {
  return rows.map((row) => ({ date: row.day, value: value(row) }));
}

/** Whole coins out of integer minor units — display only (1 coin = 100 minor, `toCoins` of useCoins.ts). */
export const MINOR_PER_COIN = 100;
export const toWholeCoins = (minor: number) => Math.round(minor / MINOR_PER_COIN);

/** `?days=` of the URL, or the default: anything but 7, 30 or 90 is not a window the server would answer. */
export function parseWindow(raw: string | null): StatisticsDays {
  const n = Number(raw);
  return (STATISTICS_WINDOWS as readonly number[]).includes(n) && String(n) === raw ? (n as StatisticsDays) : DEFAULT_WINDOW;
}

/**
 * A figure that has to fit a column of the panel: exact up to 9 999, then "12k" / "3M" (whole thousands, whole
 * millions - the Statistics page has the exact figure). `from` lowers the threshold for the small second figure of a
 * pair ("/ 1,2k"). Review S-admin-moderation 3: six-digit counts printed over their neighbours.
 */
export function compactFigure(n: number, lang: string, from = 10_000): string | number {
  if (n < from) return n;
  const fmt = (x: number, digits: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(x);
  if (n >= 1_000_000) return `${fmt(Math.floor(n / 1_000_000), 0)}M`;
  return from >= 10_000 ? `${fmt(Math.floor(n / 1_000), 0)}k` : `${fmt(Math.floor(n / 100) / 10, 1)}k`;
}
