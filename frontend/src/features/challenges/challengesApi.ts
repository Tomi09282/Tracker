import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, apiWithRefresh } from '../../lib/api';
import type {
  Challenge,
  ChallengeCreate,
  ChallengeDraw,
  ChallengeDrawResponse,
  ChallengePatch,
  ChallengePickResponse,
  ChallengeRefusalCode,
  ChallengeRerollResponse,
  ChallengeResponse,
  ChallengesResponse,
  ChallengeTodayResponse,
  LifeosToday,
  TaskCompleteResponse,
  TaskReopenResponse,
} from '../../lib/lifeos-api';

/**
 * The daily challenge draw and the challenge pool — the B-rewards-challenges routes (contract:
 * docs/pipeline/pulse/pkg/B-rewards-challenges/api.md, types: lib/lifeos-api.ts). The hooks live
 * under a non-`use*` file name (as `habits/habitsApi.ts`), so the frozen `features/**\/use*.ts` glob
 * needs no exception.
 *
 * NOT QUEUED OFFLINE (plan L9): the draw, the reroll and the pick belong to ONE logical day; a write
 * that landed late could land on another day, so a failed write is reported and never kept.
 *
 * Every draw write answers the day's draw as the server now holds it. It is put straight into the two
 * caches that show it — `GET /challenges/today` (MAI DOBÁS) and `GET /lifeos/today` (Ma's NAPI
 * DOBÁS) — and the pick, which creates a task, also marks the task lists and Ma stale.
 */

export const DRAW_KEY = ['challenges', 'today'] as const;
export const POOL_KEY = ['challenges', 'pool'] as const;
/** Ma's read (`features/today/useLifeosToday.ts`, package S-ma): the same key, written here by value. */
const LIFEOS_TODAY_KEY = ['lifeos', 'today'] as const;

export function useChallengeToday() {
  return useQuery({
    queryKey: DRAW_KEY,
    queryFn: () => apiWithRefresh<ChallengeTodayResponse>('/challenges/today'),
    // The draw belongs to the logical day: coming back to the app the next morning must show the new day.
    refetchOnWindowFocus: true,
  });
}

export function useChallenges() {
  return useQuery({
    queryKey: POOL_KEY,
    queryFn: () => apiWithRefresh<ChallengesResponse>('/challenges'),
  });
}

/** Writes the day's draw the server answered into MAI DOBÁS and into Ma. */
function putDraw(qc: QueryClient, draw: ChallengeDraw) {
  qc.setQueryData<ChallengeTodayResponse>(DRAW_KEY, (old) => ({ started: old?.started ?? true, draw }));
  qc.setQueryData<LifeosToday>(LIFEOS_TODAY_KEY, (day) => (day ? { ...day, challenge: draw } : day));
}

/** `POST /challenges/today/draw` (body `{}`) — idempotent per day: a second call answers the first draw. */
export function useDraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiWithRefresh<ChallengeDrawResponse>('/challenges/today/draw', { method: 'POST', body: {} }),
    onSuccess: ({ draw }) => putDraw(qc, draw),
  });
}

/** `POST /challenges/today/reroll { rerollKey }` — once a day, before the pick; the same key replays. */
export function useReroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rerollKey: string) =>
      apiWithRefresh<ChallengeRerollResponse>('/challenges/today/reroll', { method: 'POST', body: { rerollKey } }),
    onSuccess: ({ draw }) => putDraw(qc, draw),
  });
}

/**
 * `POST /challenges/today/pick { challengeId, clientKey }` ("Ezt vállalom") — the pick becomes a
 * task due today; no coin moves here (the task pays on completion like any task).
 */
export function usePick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { challengeId: number; clientKey: string }) =>
      apiWithRefresh<ChallengePickResponse>('/challenges/today/pick', { method: 'POST', body }),
    onSuccess: ({ draw }) => {
      putDraw(qc, draw);
      // A new task is due today: Ma's task list and count, and the task pages.
      void qc.invalidateQueries({ queryKey: LIFEOS_TODAY_KEY });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Completing / reopening the task a pick became (Ma's NAPI DOBÁS row once "elvállalva"): the task
 * routes of B-habits-tasks, the same writes as any task row. The award and its exact reversal are
 * the server's; the answer's task is written into Ma and the coin reads are refreshed.
 */
export function useChallengeTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, done }: { taskId: number; done: boolean }): Promise<TaskCompleteResponse | TaskReopenResponse> =>
      done
        ? apiWithRefresh<TaskCompleteResponse>(`/tasks/${taskId}/complete`, { method: 'POST', body: {} })
        : apiWithRefresh<TaskReopenResponse>(`/tasks/${taskId}/reopen`, { method: 'POST', body: {} }),
    onSuccess: ({ task }) => {
      const done = task.completedAt !== null;
      qc.setQueryData<LifeosToday>(LIFEOS_TODAY_KEY, (day) => {
        if (!day) return day;
        const picked = day.challenge?.picked;
        const challenge =
          day.challenge && picked && picked.taskId === task.id ? { ...day.challenge, picked: { ...picked, done } } : day.challenge;
        if (!day.tasks) return { ...day, challenge };
        const others = (list: typeof task[]) => list.filter((x) => x.id !== task.id);
        return {
          ...day,
          challenge,
          tasks: {
            ...day.tasks,
            due: done ? others(day.tasks.due) : [...others(day.tasks.due), task],
            completedToday: done ? [...others(day.tasks.completedToday), task] : others(day.tasks.completedToday),
          },
        };
      });
    },
    onSettled: () => {
      for (const key of [LIFEOS_TODAY_KEY, DRAW_KEY, ['coin-wallet'], ['coin-ledger'], ['tasks']]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** Writes the challenge the server answered into the pool, in its list (live or archived), by name. */
function putChallenge(qc: QueryClient, c: Challenge) {
  qc.setQueryData<ChallengesResponse>(POOL_KEY, (old) => {
    if (!old) return old;
    const rest = (list: Challenge[]) => list.filter((x) => x.id !== c.id);
    const byName = (list: Challenge[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
    return c.archived
      ? { ...old, active: rest(old.active), archived: byName([...rest(old.archived), c]) }
      : { ...old, active: byName([...rest(old.active), c]), archived: rest(old.archived) };
  });
  // The pool size and today's options are on the draw (poolCount, an archived option is gone).
  void qc.invalidateQueries({ queryKey: POOL_KEY, refetchType: 'none' });
  void qc.invalidateQueries({ queryKey: DRAW_KEY });
  void qc.invalidateQueries({ queryKey: LIFEOS_TODAY_KEY });
}

/** A fresh idempotency key (8..64 of [A-Za-z0-9_-]) for one create, reroll or pick. */
export function newClientKey(prefix = 'c') {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${raw.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64);
}

export function useCreateChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChallengeCreate) => apiWithRefresh<ChallengeResponse>('/challenges', { method: 'POST', body }),
    onSuccess: ({ challenge }) => putChallenge(qc, challenge),
  });
}

export function usePatchChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ChallengePatch }) =>
      apiWithRefresh<ChallengeResponse>(`/challenges/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: ({ challenge }) => putChallenge(qc, challenge),
  });
}

/** "Archiválás" (out of the draw, kept) / "Visszaállítás" (back into the draw; counts against the cap of 50). */
export function useArchiveChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archive }: { id: number; archive: boolean }) =>
      apiWithRefresh<ChallengeResponse>(`/challenges/${id}/${archive ? 'archive' : 'restore'}`, { method: 'POST', body: {} }),
    onSuccess: ({ challenge }) => putChallenge(qc, challenge),
  });
}

/** `DELETE /challenges/:id` — the tasks it became keep their history. */
export function useDeleteChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiWithRefresh<void>(`/challenges/${id}`, { method: 'DELETE' }),
    onSuccess: (_r, id) => {
      qc.setQueryData<ChallengesResponse>(POOL_KEY, (old) =>
        old ? { ...old, active: old.active.filter((c) => c.id !== id), archived: old.archived.filter((c) => c.id !== id) } : old,
      );
      void qc.invalidateQueries({ queryKey: DRAW_KEY });
      void qc.invalidateQueries({ queryKey: LIFEOS_TODAY_KEY });
    },
  });
}

/** The 409 code of a refused challenge write, when it is one of the documented ones. */
export function refusalOf(err: unknown): ChallengeRefusalCode | 'LIMIT_REACHED' | 'TIMEZONE_REQUIRED' | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const known: readonly string[] = ['NO_DRAW', 'EMPTY_POOL', 'REROLL_USED', 'ALREADY_PICKED', 'NOT_OFFERED', 'LIMIT_REACHED', 'TIMEZONE_REQUIRED'];
  return known.includes(err.code) ? (err.code as ChallengeRefusalCode | 'LIMIT_REACHED' | 'TIMEZONE_REQUIRED') : null;
}
