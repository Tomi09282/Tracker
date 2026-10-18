import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiWithRefresh } from '../../lib/api';
import { useDayPrefs, useTimezoneBootstrap } from '../settings/dayPrefs';
import type {
  DayKey,
  PointRules,
  Recurrence,
  Task,
  TaskCompleteResponse,
  TaskCreate,
  TaskPatch,
  TaskPriority,
  TaskReopenResponse,
  TaskResponse,
  TasksResponse,
} from '../../lib/lifeos-api';

/**
 * Feladatok — the data of the task screens: `GET /tasks` and its five writes (backend package
 * B-habits-tasks, contract `docs/pipeline/pulse/pkg/B-habits-tasks/api.md`).
 *
 * Read by the Feladatok page (`TasksPage`), the task sheet (`TaskSheet`) and the capture sheet
 * (`features/capture/CaptureSheet`). The hooks live in this non-`use*` file so the frozen
 * `features/**\/use*.ts` glob needs no exception.
 *
 * NOT QUEUED OFFLINE (plan L9): a completion pays on the logical TODAY, so a write that landed
 * late would pay the wrong day. A write that fails is reported, never kept for later.
 *
 * Every write changes coins (a completion pays, a reopen reverses, a delete moves the lists), so
 * each one refreshes the task lists, the LifeOS day (Ma) and the wallet / ledger.
 */

export const TASKS_KEY = ['lifeos', 'tasks'] as const;

/** The five tabs of the page, in the frame's order: Ma · Közelgő · Lejárt · Bármikor · Kész. */
export const TASK_TABS = ['today', 'upcoming', 'overdue', 'anytime', 'done'] as const;
export type TaskTab = (typeof TASK_TABS)[number];

export const PRIORITIES: readonly TaskPriority[] = [1, 2, 3];

/** The i18n word of each priority (`tasks.priority.<key>`): 1 low (5) · 2 medium (10) · 3 high (20). */
export const PRIORITY_KEY: Record<TaskPriority, 'low' | 'mid' | 'high'> = { 1: 'low', 2: 'mid', 3: 'high' };

export function useTasks() {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: () => apiWithRefresh<TasksResponse>('/tasks'),
  });
}

/**
 * LifeOS STARTS the first time the server knows the user's zone (B-core api.md "The day"): until
 * then `GET /tasks` answers `started: false, today: null` and no task can be written. The silent
 * first-time zone write (`useTimezoneBootstrap`, features/settings/dayPrefs.ts) belongs on the
 * signed-in shell (request R-S-tasks-fix-01); until the shell mounts it, the task screens mount it
 * themselves. It tries at most once per page load whoever mounts it, so a second mount is harmless.
 *
 * When the zone is known while the lists still say "not started", the LifeOS reads are re-read, so
 * the logical today (and with it the sheets' pills) arrives without a reload.
 */
export function useLifeosStart(data: TasksResponse | undefined) {
  useTimezoneBootstrap();
  const prefs = useDayPrefs();
  const qc = useQueryClient();
  const zone = prefs.data?.timezone ?? null;
  const waiting = data !== undefined && !data.started;
  useEffect(() => {
    // Two mounts (the page and its capture sheet) may both see the zone arrive: the second call
    // joins the refetch already running instead of cancelling it (one request, not two).
    if (zone && waiting) void qc.invalidateQueries({ queryKey: ['lifeos'] }, { cancelRefetch: false });
  }, [zone, waiting, qc]);
}

/** After any write: the lists, the Ma day (`/lifeos/today`) and the wallet / ledger move together. */
function useRefreshAfterWrite() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['lifeos'] });
    void qc.invalidateQueries({ queryKey: ['coin-wallet'] });
    void qc.invalidateQueries({ queryKey: ['coin-ledger'] });
  };
}

/**
 * The idempotency key of one create (`clientKey`, the server's replay guard): minted ONCE per
 * opened form, so a double tap or a retried request creates one task, never two.
 */
export function mintClientKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

/** `POST /tasks` — the task sheet's "Létrehozás" and the capture sheet's "Mentés". */
export function useCreateTask() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: (body: TaskCreate) => apiWithRefresh<TaskResponse>('/tasks', { method: 'POST', body }),
    onSuccess: refresh,
  });
}

/** `PATCH /tasks/:id` — the task sheet's "Mentés" on an existing task. */
export function useUpdateTask() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TaskPatch }) =>
      apiWithRefresh<TaskResponse>(`/tasks/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: refresh,
  });
}

/** `DELETE /tasks/:id` (soft; coins stay as they are). A second delete is a 404 = already gone. */
export function useDeleteTask() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await apiWithRefresh<void>(`/tasks/${id}`, { method: 'DELETE' });
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
    },
    onSuccess: refresh,
  });
}

/**
 * The check of a row: `POST /tasks/:id/complete` on an open task, `/reopen` on a completed one.
 * Both are idempotent on the server (`already: true` pays / reverses nothing again).
 */
export function useToggleTask() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }): Promise<TaskCompleteResponse | TaskReopenResponse> =>
      done
        ? apiWithRefresh<TaskCompleteResponse>(`/tasks/${id}/complete`, { method: 'POST', body: {} })
        : apiWithRefresh<TaskReopenResponse>(`/tasks/${id}/reopen`, { method: 'POST', body: {} }),
    onSuccess: refresh,
  });
}

/* ── what the rows print ────────────────────────────────────────────────────────────────────── */

/** "+20" — whole coins with a sign (1 coin = 100 minor; the frames print points, 1 point = 1 coin). */
export function coinsLabel(minor: number): string {
  const coins = Math.trunc(minor / 100);
  return coins < 0 ? `−${Math.abs(coins)}` : `+${coins}`;
}

/**
 * What the coin column of a row says (tasks-1: "+N" in mono): a completed task its live award, an
 * open one what completing it NOW pays (half when late — the server's `payoutNowMinor`).
 */
export function rowCoinsMinor(task: Task): number | null {
  if (task.completedAt !== null) return task.paidMinor;
  return task.payoutNowMinor ?? task.valueMinor;
}

/**
 * What each priority pays on time under the rules in force (task-form "Közepes · 10").
 *
 * 1. The server's own figures, when `GET /tasks` carries them: `rules.taskLow / taskMid / taskHigh`
 *    in points (request R-S-tasks-fix-02 - the PointRules keys; read only when present, so the
 *    screen works before and after the backend adds them).
 * 2. Else read from the tasks themselves: a task with no coin override (`points: null`) pays
 *    exactly its priority's rule (`valueMinor`).
 *
 * The full rule set is admin-only (`GET /admin/rules`), so a priority neither source shows has no
 * value here - the form then prints the word alone, never a guessed number.
 */
type TaskRuleFigures = Partial<Pick<PointRules, 'taskLow' | 'taskMid' | 'taskHigh'>>;
const RULE_OF: Record<TaskPriority, keyof TaskRuleFigures> = { 1: 'taskLow', 2: 'taskMid', 3: 'taskHigh' };

export function priorityValues(data: TasksResponse | undefined): Partial<Record<TaskPriority, number>> {
  const out: Partial<Record<TaskPriority, number>> = {};
  if (!data) return out;
  const rules = (data as TasksResponse & { rules?: TaskRuleFigures }).rules;
  for (const p of PRIORITIES) {
    const points = rules?.[RULE_OF[p]];
    if (typeof points === 'number' && Number.isInteger(points) && points >= 0) out[p] = points * 100;
  }
  for (const list of [data.due, data.overdue, data.anytime, data.completedToday, data.upcoming, data.done, data.templates]) {
    for (const task of list) if (task.points === null && out[task.priority] === undefined) out[task.priority] = task.valueMinor;
  }
  return out;
}

/**
 * A refused write is told in ONE sentence whatever its code ("Nem sikerült a művelet. Próbáld
 * újra."): the screens have no approved words for DAY_LOCKED, LIMIT_REACHED or TIMEZONE_REQUIRED
 * yet (PLAN R22 — no invented copy; logged in the package's deviations). The code still decides
 * one thing: a refusal that a retry cannot fix offers no "Újra".
 */
export const retryable = (err: unknown) =>
  !(err instanceof ApiError && err.status === 409 && ['DAY_LOCKED', 'LIMIT_REACHED', 'TEMPLATE', 'TIMEZONE_REQUIRED'].includes(err.code));

/* ── days ───────────────────────────────────────────────────────────────────────────────────── */

/** `YYYY-MM-DD` as a local calendar day (never through UTC, which would move it across midnight). */
export function dayDate(key: DayKey): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** The day `days` after `key`, as a key. */
export function addDays(key: DayKey, days: number): DayKey {
  const d = dayDate(key);
  if (!d) return key;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const upperFirst = (s: string, locale: string) => (s ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s);

/** "október 19." / "October 19" / "19. Oktober" — the day of a section head, in the app's language. */
export function monthDay(key: DayKey, locale: string): string {
  const d = dayDate(key);
  return d ? new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(d) : key;
}

/** "Kedd, október 20." — a day that is not today, weekday first and capitalised (as Home writes it). */
export function weekdayMonthDay(key: DayKey, locale: string): string {
  const d = dayDate(key);
  if (!d) return key;
  return `${upperFirst(new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d), locale)}, ${monthDay(key, locale)}`;
}

/** "okt. 17." — a past due day on a row of the Lejárt tab. */
export function shortDay(key: DayKey, locale: string): string {
  const d = dayDate(key);
  return d ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d) : key;
}

/**
 * The day in a 165 pt date field (task-form "Vas, október 25.", capture "Szerda, október 21."):
 * the long weekday while the words fit the field (19 characters at `body` 16), else the weekday
 * cut to its usual short form — Hungarian calendars write the first three letters ("Vas", "Csü"),
 * the other languages Intl's own short weekday ("Sun", "So"). On a narrow phone (`narrow`: the
 * field is about 144 wide at 360) neither weekday form fits beside the day, so the field drops the
 * weekday and keeps the day itself ("október 21.") rather than cutting the day off.
 */
export function fieldDay(key: string, locale: string, narrow = false): string {
  const d = dayDate(key);
  if (!d) return key;
  if (narrow) return monthDay(key, locale);
  const long = weekdayMonthDay(key, locale);
  if (long.length <= 19) return long;
  const wd = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
  const short = locale.startsWith('hu') ? wd.slice(0, 3) : new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d).replace(/\.$/, '');
  return `${upperFirst(short, locale)}, ${monthDay(key, locale)}`;
}

/** "09:12" — the wall clock of an epoch-seconds instant (a completion), 24 h. */
export function clockOf(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ── recurrence ─────────────────────────────────────────────────────────────────────────────── */

/** The word after the repeat glyph on a row (tasks-1 "hetente"): the rule's kind. */
export type RecurrenceWordKey = 'daily' | 'weekly' | 'monthly';
export const recurrenceWord = (r: Recurrence): RecurrenceWordKey => r.type;

/** Weekday indexes (0 = Monday) set in an f_app weekday mask. */
export function maskDays(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((i) => (mask & (1 << i)) !== 0);
}
