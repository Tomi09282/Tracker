import { useQuery } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';

export interface TodayDay {
  day_id: number;
  day_name: string;
  plan_id: number;
  plan_name: string;
  is_rest: 0 | 1;
  est_minutes: number | null;
  /** 'HH:MM' wall clock, or null for "no particular time". */
  start_time: string | null;
  slot: number;
  exercise_count: number;
  /** Set once this occurrence has been trained — the card must not still say "start". */
  log_id: number | null;
}

export function useToday() {
  return useQuery({
    queryKey: ['today'],
    queryFn: () => apiWithRefresh<{ date: string; days: TodayDay[] }>('/my-plans/today'),
    // The answer changes at midnight in the user's timezone, not on a timer. Refetching on focus
    // covers the case that actually happens: the phone was asleep and it is now tomorrow.
    refetchOnWindowFocus: true,
  });
}
