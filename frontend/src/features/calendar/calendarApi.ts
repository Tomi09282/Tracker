import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiWithRefresh } from '../../lib/api';
import type {
  CalendarResponse,
  DayKey,
  EventCreate,
  EventPatch,
  EventResponse,
  TaskCompleteResponse,
  TaskReopenResponse,
} from '../../lib/lifeos-api';

/**
 * Naptár — the data of the calendar screens: `GET /calendar`, `GET /events/:id` and the three event
 * writes (backend package B-calendar, contract `docs/pipeline/pulse/pkg/B-calendar/api.md`), plus the
 * task check of the TEENDŐK rows (`/tasks/:id/complete` / `/reopen`, B-habits-tasks).
 *
 * The hooks live in this non-`use*` file so the frozen `features/**\/use*.ts` glob needs no exception.
 *
 * Every key starts with `lifeos`: a task written anywhere (Ma, Feladatok, the capture sheet)
 * invalidates `['lifeos']`, so the calendar's busy dots and TEENDŐK follow without a hook of theirs.
 *
 * NOT QUEUED OFFLINE (plan L9, and the reminders are materialised from the server's own clock): a
 * write that fails is reported, never kept for later.
 */

export const CALENDAR_KEY = ['lifeos', 'calendar'] as const;

/** One DayRail week: `from` = its Monday, seven days (api.md: "the DayRail week sends the Monday and 7"). */
export function useCalendarWeek(from: DayKey) {
  return useQuery({
    queryKey: [...CALENDAR_KEY, 'week', from],
    queryFn: () => apiWithRefresh<CalendarResponse>(`/calendar?from=${from}&days=7`),
    // A week step keeps the old week on screen until the new one answers (the rail does not blink).
    placeholderData: keepPreviousData,
  });
}

/** One event; `on` = the calendar day it was opened from (its occurrence there: the eyebrow and the range). */
export function useCalendarEvent(id: number | null, on: DayKey | null) {
  return useQuery({
    queryKey: [...CALENDAR_KEY, 'event', id, on],
    queryFn: () => apiWithRefresh<EventResponse>(`/events/${id}${on ? `?on=${on}` : ''}`),
    enabled: id !== null,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

/** After an event write: the calendar weeks, the event views and Ma's KÖVETKEZŐ (`/lifeos/today`). */
function useRefreshAfterWrite() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['lifeos'] });
  };
}

/**
 * The idempotency key of one create (`clientKey`): minted ONCE per opened form, so a double tap or
 * a retried request creates one event, never two. 24 of `[a-z0-9]` (the server takes 8..64).
 */
export function mintEventKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

/** `POST /events` — the event sheet's "Mentés" and the capture sheet's Esemény half. */
export function useCreateEvent() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: (body: EventCreate) => apiWithRefresh<EventResponse>('/events', { method: 'POST', body }),
    onSuccess: refresh,
  });
}

/** `PATCH /events/:id` — every occurrence moves with the event (single-occurrence edits do not exist). */
export function useUpdateEvent() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: EventPatch }) =>
      apiWithRefresh<EventResponse>(`/events/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: refresh,
  });
}

/** `DELETE /events/:id` — the event with every occurrence. A second delete is a 404 = already gone. */
export function useDeleteEvent() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await apiWithRefresh<void>(`/events/${id}`, { method: 'DELETE' });
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
    },
    onSuccess: refresh,
  });
}

/**
 * The check of a TEENDŐK row: `POST /tasks/:id/complete` on an open task, `/reopen` on a done one.
 * Both are idempotent on the server. A completion pays, a reopen reverses: the wallet follows.
 */
export function useToggleCalendarTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }): Promise<TaskCompleteResponse | TaskReopenResponse> =>
      done
        ? apiWithRefresh<TaskCompleteResponse>(`/tasks/${id}/complete`, { method: 'POST', body: {} })
        : apiWithRefresh<TaskReopenResponse>(`/tasks/${id}/reopen`, { method: 'POST', body: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lifeos'] });
      void qc.invalidateQueries({ queryKey: ['coin-wallet'] });
      void qc.invalidateQueries({ queryKey: ['coin-ledger'] });
    },
  });
}

/**
 * A refusal a retry cannot fix offers no "Újra": a 409 (no time zone yet, the 500-event limit) or
 * a 400 (an impossible time combination — the words are the user's to change).
 */
export const retryable = (err: unknown) => !(err instanceof ApiError && (err.status === 409 || err.status === 400 || err.status === 404));
