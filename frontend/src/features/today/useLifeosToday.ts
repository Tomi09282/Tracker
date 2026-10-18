import { useQuery } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';
import type { LifeosToday } from '../../lib/lifeos-api';

/**
 * The LifeOS day — `GET /lifeos/today` (B-core, Phase-3 fields from B-habits-tasks;
 * docs/pipeline/pulse/pkg/B-habits-tasks/api.md). One read gives Ma everything that is not the
 * plan: the wallet (balance, level, XP bounds), the workout due / done flags and what a workout
 * pays, today's habits and today's tasks. Reading it also settles any day that is due (the lazy
 * day close, plan L6), so it is refetched whenever the app comes back to the front, and every time
 * Ma mounts: the player lands here after a workout ends, and the 30 s default staleness would
 * otherwise show the workout as still due until the next focus.
 */
export const LIFEOS_TODAY_KEY = ['lifeos', 'today'] as const;

export function useLifeosToday() {
  return useQuery({
    queryKey: LIFEOS_TODAY_KEY,
    queryFn: () => apiWithRefresh<LifeosToday>('/lifeos/today'),
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
}
