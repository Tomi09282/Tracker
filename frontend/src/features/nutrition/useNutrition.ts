import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';

/**
 * MACROS ARRIVE IN HUMAN UNITS AND ARE NEVER RECOMPUTED HERE.
 *
 * The server stores integers in a fixed scale and divides on the way out, so every number below is
 * already grams and kilocalories. This module does no arithmetic on them beyond adding a day up
 * for display, and it never sends one back — a write carries `food_id` and `grams`, and the server
 * copies the macros from its own row. Sending a kcal figure is a 400, deliberately.
 */
export interface FoodRow {
  id: number;
  name: string;
  brand: string | null;
  source: 'usda' | 'off' | 'manual' | 'system';
  verified: 0 | 1;
  kcal_per_100g: number;
  protein_g_per_100g: number;
  carb_g_per_100g: number;
  fat_g_per_100g: number;
  fiber_g_per_100g: number | null;
  serving_g: number | null;
  serving_label: string | null;
}

export interface LogItem {
  id: number;
  meal_label: string | null;
  food_id: number | null;
  plan_day_id: number | null;
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fiber_g: number | null;
}

export interface DayTotals {
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface DayTargets {
  plan_day_id: number;
  day_name: string | null;
  kcal_target: number | null;
  protein_g_target: number | null;
  carb_g_target: number | null;
  fat_g_target: number | null;
}

export interface NutritionDay {
  date: string;
  items: LogItem[];
  totals: DayTotals;
  /** NULL when the schedule rule puts no plan day on this date. Not zero — absent. */
  targets: DayTargets | null;
}

export function useFoodSearch(q: string, lang: string) {
  return useQuery({
    // The language is part of the KEY, not just the URL. 4k: a language-dependent fetch that
    // caches under a language-free key serves the previous language's results after a switch.
    queryKey: ['foods', q, lang],
    queryFn: () =>
      apiWithRefresh<{ foods: FoodRow[] }>(
        `/foods?lang=${encodeURIComponent(lang)}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
    // A search box fires on every keystroke; a short stale window is the difference between one
    // request per word and one per letter.
    staleTime: 30_000,
  });
}

export function useNutritionDay(date: string) {
  return useQuery({
    queryKey: ['nutrition-day', date],
    queryFn: () => apiWithRefresh<NutritionDay>(`/nutrition-log/${date}`),
  });
}

export function useNutritionRange(from: string, to: string) {
  return useQuery({
    queryKey: ['nutrition-range', from, to],
    queryFn: () =>
      apiWithRefresh<{
        from: string;
        to: string;
        days: { date: string; entries: number; kcal: number; protein_g: number; carb_g: number; fat_g: number }[];
      }>(`/nutrition-log?from=${from}&to=${to}`),
  });
}

export function useLogFood(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { food_id: number; grams: number; meal_label?: string | null }) =>
      apiWithRefresh<{ id: number }>('/nutrition-log', {
        method: 'POST',
        body: { ...body, local_date: date, tz_name: Intl.DateTimeFormat().resolvedOptions().timeZone },
      }),
    // Both keys, because the day view and the range chart read the same rows through different
    // queries. Invalidating one leaves the other showing a total that no longer matches its list.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nutrition-day', date] });
      qc.invalidateQueries({ queryKey: ['nutrition-range'] });
    },
  });
}

export function useDeleteLogItem(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiWithRefresh<void>(`/nutrition-log/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nutrition-day', date] });
      qc.invalidateQueries({ queryKey: ['nutrition-range'] });
    },
  });
}

export function useCreateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      brand?: string | null;
      kcal_per_100g: number;
      protein_g_per_100g: number;
      carb_g_per_100g: number;
      fat_g_per_100g: number;
    }) => apiWithRefresh<{ id: number }>('/foods', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foods'] }),
  });
}

/* ── the coach's side ───────────────────────────────────────────────────────────────────────── */

export interface NutritionPlanRow {
  id: number;
  scope: 'template' | 'client' | 'personal' | 'system';
  name: string;
  description: string | null;
  goal: string | null;
  cycle_days: number;
  starts_on: string | null;
  status: 'draft' | 'active' | 'paused' | 'completed';
  revision: number;
  coach_client_id: number | null;
  client_user_id: number | null;
  client_email: string | null;
  client_display_name: string | null;
}

export interface PlanTree {
  plan: NutritionPlanRow;
  days: {
    id: number;
    day_index: number;
    name: string | null;
    notes: string | null;
    kcal_target: number | null;
    protein_g_target: number | null;
    carb_g_target: number | null;
    fat_g_target: number | null;
  }[];
  meals: { id: number; day_id: number; position: number; name: string; time_hint: string | null; notes: string | null }[];
  items: {
    id: number;
    meal_id: number;
    position: number;
    food_id: number | null;
    note: string | null;
    name: string;
    grams: number;
    kcal: number;
    protein_g: number;
    carb_g: number;
    fat_g: number;
    fiber_g: number | null;
  }[];
}

export function useNutritionPlans() {
  return useQuery({
    queryKey: ['nutrition-plans'],
    queryFn: () => apiWithRefresh<{ plans: NutritionPlanRow[] }>('/nutrition-plans'),
  });
}

export function useNutritionPlan(id: number | null) {
  return useQuery({
    queryKey: ['nutrition-plan', id],
    queryFn: () => apiWithRefresh<PlanTree>(`/nutrition-plans/${id}`),
    enabled: id != null,
  });
}

export function useCreateNutritionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; coach_client_id?: number | null; starts_on?: string | null; goal?: string | null }) =>
      apiWithRefresh<{ id: number }>('/nutrition-plans', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition-plans'] }),
  });
}
