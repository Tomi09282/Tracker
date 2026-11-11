import { useQuery } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';

/**
 * Today's plan days — `GET /my-plans/today`, the query the Kezdőlap read (`features/home/useToday.ts`,
 * moved here with the page; same key, same endpoint, so every mutation that invalidates `['today']`
 * still refreshes Ma's MAI EDZÉS block).
 */

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
  /** Set once this occurrence has been trained — the block must not still say "start". */
  log_id: number | null;
}

export function useTodayPlan() {
  return useQuery({
    queryKey: ['today'],
    queryFn: () => apiWithRefresh<{ date: string; days: TodayDay[] }>('/my-plans/today'),
    // The answer changes when the day turns in the user's timezone, not on a timer. Refetching on
    // focus covers the case that actually happens: the phone was asleep and it is now tomorrow.
    refetchOnWindowFocus: true,
  });
}

/** One plan day of the week window (`GET /my-plans/week`), as the Kezdőlap's week strip read it. */
export interface WeekOccurrence {
  date: string;
  day_id: number;
  day_name: string;
  is_rest: 0 | 1;
  start_time: string | null;
  exercise_count: number;
  plan_name: string;
  moved?: boolean;
  log_id: number | null;
  log_status: string | null;
}

/**
 * The plan's occurrences from `from` for `days` days — the week strip's query (same key shape,
 * `['week', from]`). Ma reads tomorrow from it for the rest-day line ("Holnap: …").
 */
export function useWeekPlan(from: string | null, days = 7) {
  return useQuery({
    queryKey: ['week', from, days],
    enabled: from !== null,
    queryFn: () => apiWithRefresh<{ occurrences: WeekOccurrence[] }>(`/my-plans/week?from=${from}&days=${days}`),
  });
}
