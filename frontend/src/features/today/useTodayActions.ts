import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';
import type {
  Habit,
  HabitLogResponse,
  LifeosToday,
  Task,
  TaskCompleteResponse,
  TaskReopenResponse,
} from '../../lib/lifeos-api';
import { LIFEOS_TODAY_KEY } from './useLifeosToday';

/**
 * Ma's four writes (B-habits-tasks api.md): a good habit's count, a bad habit's relapses, completing
 * and reopening a task. Every body is ABSOLUTE or empty, so a retried request lands on the same
 * state; the server computes every coin (habits pay when the day settles, tasks on completion).
 *
 * NOT QUEUED OFFLINE (plan L9): a day-dependent coin write must not land late, so a failed write is
 * reported and never kept.
 *
 * The answer's habit / task is written straight into the Ma cache (the row shows its new state at
 * once), then every reader of the same facts is refreshed: Ma itself (the hero, "Ma eddig"), the
 * wallet and ledger, and the habits / tasks pages.
 */

function refresh(qc: QueryClient) {
  for (const key of [LIFEOS_TODAY_KEY, ['coin-wallet'], ['coin-ledger'], ['habits'], ['tasks']]) {
    void qc.invalidateQueries({ queryKey: key });
  }
}

function putHabit(qc: QueryClient, habit: Habit) {
  qc.setQueryData<LifeosToday>(LIFEOS_TODAY_KEY, (day) =>
    day?.habits ? { ...day, habits: day.habits.map((h) => (h.id === habit.id ? habit : h)) } : day,
  );
}

function putTask(qc: QueryClient, task: Task) {
  qc.setQueryData<LifeosToday>(LIFEOS_TODAY_KEY, (day) => {
    if (!day?.tasks) return day;
    const others = (list: Task[]) => list.filter((x) => x.id !== task.id);
    const done = task.completedAt !== null;
    return {
      ...day,
      tasks: {
        ...day.tasks,
        due: done ? others(day.tasks.due) : day.tasks.due.map((x) => (x.id === task.id ? task : x)),
        overdue: done ? others(day.tasks.overdue) : day.tasks.overdue.map((x) => (x.id === task.id ? task : x)),
        completedToday: done ? [...others(day.tasks.completedToday), task] : others(day.tasks.completedToday),
      },
    };
  });
}

/** `POST /habits/:id/log { count }` — a good habit's count for today (0 un-checks). */
export function useLogHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, count }: { id: number; count: number }) =>
      apiWithRefresh<HabitLogResponse>(`/habits/${id}/log`, { method: 'POST', body: { count } }),
    onSuccess: (r) => putHabit(qc, r.habit),
    onSettled: () => refresh(qc),
  });
}

/** `POST /habits/:id/relapse { count }` — a bad habit's relapses today (undo one = count − 1). */
export function useRelapse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, count }: { id: number; count: number }) =>
      apiWithRefresh<HabitLogResponse>(`/habits/${id}/relapse`, { method: 'POST', body: { count } }),
    onSuccess: (r) => putHabit(qc, r.habit),
    onSettled: () => refresh(qc),
  });
}

/** `POST /tasks/:id/complete` (empty body) — pays the task now, on the logical today. */
export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiWithRefresh<TaskCompleteResponse>(`/tasks/${id}/complete`, { method: 'POST', body: {} }),
    onSuccess: (r) => putTask(qc, r.task),
    onSettled: () => refresh(qc),
  });
}

/** `POST /tasks/:id/reopen` (empty body) — reverses the award exactly while its day is open. */
export function useReopenTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiWithRefresh<TaskReopenResponse>(`/tasks/${id}/reopen`, { method: 'POST', body: {} }),
    onSuccess: (r) => putTask(qc, r.task),
    onSettled: () => refresh(qc),
  });
}
