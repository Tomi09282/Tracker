import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, apiWithRefresh } from '../../lib/api';
import type {
  Habit,
  HabitCreate,
  HabitDetailResponse,
  HabitLogResponse,
  HabitPatch,
  HabitResponse,
  HabitsResponse,
  LifeosRefusalCode,
} from '../../lib/lifeos-api';

/**
 * Habits — the B-habits-tasks routes (contract: docs/pipeline/pulse/pkg/B-habits-tasks/api.md,
 * types: lib/lifeos-api.ts). The hooks live under a non-`use*` file name, as `settings/dayPrefs.ts`
 * does, so the frozen `features/**\/use*.ts` glob needs no exception.
 *
 * NOT QUEUED OFFLINE (plan L9): a habit write records what the user says about ONE logical day,
 * and the day settles 6 h after the next one starts. A write that landed late could hit a settled
 * day, so a failed write is reported and never kept for later.
 *
 * Every write answers the habit as the server now holds it; that habit is put straight into the
 * list and the detail caches, then the reads that summarise habits (Ma, the wallet) are marked
 * stale so they refetch when next shown.
 */

export const HABITS_KEY = ['habits'] as const;
export const habitKey = (id: number) => ['habits', id] as const;

export function useHabits() {
  return useQuery({
    queryKey: HABITS_KEY,
    queryFn: () => apiWithRefresh<HabitsResponse>('/habits'),
  });
}

export function useHabitDetail(id: number | null) {
  return useQuery({
    queryKey: habitKey(id ?? 0),
    queryFn: () => apiWithRefresh<HabitDetailResponse>(`/habits/${id}`),
    enabled: id !== null,
    // A habit of another account and a missing one are the same 404: nothing to retry.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

/** Writes the habit the server answered into every cache that shows it. */
function putHabit(qc: QueryClient, habit: Habit) {
  qc.setQueryData<HabitsResponse>(HABITS_KEY, (old) =>
    old ? { ...old, habits: old.habits.some((h) => h.id === habit.id) ? old.habits.map((h) => (h.id === habit.id ? habit : h)) : [...old.habits, habit] } : old,
  );
  qc.setQueryData<HabitDetailResponse>(habitKey(habit.id), (old) => (old ? { ...old, habit } : old));
  // The summaries of the day: Ma (`/lifeos/today`) and the wallet read habits; refetch on next view.
  void qc.invalidateQueries({ queryKey: HABITS_KEY, refetchType: 'none' });
  void qc.invalidateQueries({ queryKey: ['lifeos'] });
  void qc.invalidateQueries({ queryKey: ['coin-wallet'] });
}

/**
 * The day log of a habit. `count` is ABSOLUTE (a replay lands on the same state): a good habit's
 * completions (0 un-checks, the target is done), a bad habit's relapses. `skip` marks a good habit
 * skipped for the day.
 */
export type HabitLogWrite =
  | { kind: 'log'; habitId: number; count: number }
  | { kind: 'relapse'; habitId: number; count: number }
  | { kind: 'skip'; habitId: number };

export function useHabitLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (w: HabitLogWrite) =>
      apiWithRefresh<HabitLogResponse>(`/habits/${w.habitId}/${w.kind}`, {
        method: 'POST',
        body: w.kind === 'skip' ? {} : { count: w.count },
      }),
    onSuccess: ({ habit }) => putHabit(qc, habit),
  });
}

/** A fresh idempotency key for one create (8..64 of [A-Za-z0-9_-]). */
export function newClientKey() {
  const raw = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `h-${raw.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64);
}

export function useCreateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: HabitCreate) => apiWithRefresh<HabitResponse>('/habits', { method: 'POST', body }),
    onSuccess: ({ habit }) => putHabit(qc, habit),
  });
}

export function usePatchHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: HabitPatch }) =>
      apiWithRefresh<HabitResponse>(`/habits/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: ({ habit }) => putHabit(qc, habit),
  });
}

/** Archive (out of the daily list, the history kept) or restore (counts against the live cap). */
export function useArchiveHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archive }: { id: number; archive: boolean }) =>
      apiWithRefresh<HabitResponse>(`/habits/${id}/${archive ? 'archive' : 'restore'}`, { method: 'POST', body: {} }),
    onSuccess: ({ habit }) => putHabit(qc, habit),
  });
}

/** The 409 code of a refused habit write, when it is one of the documented ones. */
export function refusalOf(err: unknown): LifeosRefusalCode | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const known: readonly string[] = ['TIMEZONE_REQUIRED', 'LIMIT_REACHED', 'DAY_LOCKED', 'NOT_SCHEDULED', 'WRONG_KIND', 'ARCHIVED', 'TEMPLATE'];
  return known.includes(err.code) ? (err.code as LifeosRefusalCode) : null;
}
