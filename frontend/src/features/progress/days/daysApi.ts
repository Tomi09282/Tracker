import { useQuery } from '@tanstack/react-query';
import { apiWithRefresh } from '../../../lib/api';
import type { LifeosStatsResponse } from '../../../lib/lifeos-api';

/**
 * Haladás > Napok reads ONE snapshot: GET /lifeos/stats (package B-focus, migration 035; contract
 * docs/pipeline/pulse/pkg/B-focus/api.md, types lib/lifeos-api.ts). It carries the week, the day
 * columns, the week rows, the habit consistency cells and the kcal history of the same window, so
 * the screen never stitches two answers that could disagree about which days have settled.
 *
 * The defaults are the frame's: 14 day columns (13 settled days + today) and 4 weeks. The hook
 * lives under a non-`use*` file name (as `habits/habitsApi.ts` does), so the frozen
 * `features/**\/use*.ts` glob needs no exception.
 *
 * The key starts with 'lifeos': every habit / task / focus write already invalidates that prefix,
 * so a day's coins here are refetched the next time the screen is shown after a write elsewhere.
 */
export const STATS_DAYS = 14;
export const STATS_WEEKS = 4;
export const STATS_KEY = ['lifeos', 'stats', STATS_DAYS, STATS_WEEKS] as const;

export function useLifeosStats() {
  return useQuery({
    queryKey: STATS_KEY,
    queryFn: () => apiWithRefresh<LifeosStatsResponse>(`/lifeos/stats?days=${STATS_DAYS}&weeks=${STATS_WEEKS}`),
  });
}
