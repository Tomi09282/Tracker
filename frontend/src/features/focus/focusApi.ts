import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, apiWithRefresh } from '../../lib/api';
import type {
  FocusCheckinResponse,
  FocusCurrentResponse,
  FocusFinishResponse,
  FocusRefusalCode,
  FocusSession,
  FocusSessionResponse,
  FocusStart,
  FocusStartResponse,
} from '../../lib/lifeos-api';

/**
 * Focus blocks — the B-focus routes (contract: docs/pipeline/pulse/pkg/B-focus/api.md, types:
 * lib/lifeos-api.ts, Phase 6). The hooks live under a non-`use*` file name, as `habits/habitsApi.ts`
 * does, so the frozen `features/**\/use*.ts` glob needs no exception.
 *
 * NOT QUEUED OFFLINE (plan L9): a finish pays coins on the logical day it lands on, and the server
 * judges every minute and check-in by its own clock. A write that arrived late would be judged at
 * the wrong moment, so a failed write is reported and never kept for later.
 *
 * Nothing a client sends reaches an amount: the page only names the plan (title, minutes, check-in
 * interval). What the block pays, how many check-ins count and when it ends are the server's.
 */

export const FOCUS_CURRENT_KEY = ['focus', 'current'] as const;

export function useFocusCurrent() {
  return useQuery({
    queryKey: FOCUS_CURRENT_KEY,
    queryFn: async () => {
      const body = await apiWithRefresh<FocusCurrentResponse>('/focus/current');
      // The moment the answer arrived on THIS clock, so the countdown can be corrected for the
      // difference between the server's clock and the device's (api.md: "correct with now").
      return { ...body, receivedAt: Date.now() / 1000 };
    },
  });
}

export type FocusCurrent = FocusCurrentResponse & { receivedAt: number };

/** Writes the block the server answered into the current read, and marks the day summaries stale. */
function putSession(qc: QueryClient, session: FocusSession, now?: number) {
  qc.setQueryData<FocusCurrent>(FOCUS_CURRENT_KEY, (old) =>
    old
      ? {
          ...old,
          // A closed block is no longer the open one: the setup comes back on the next visit.
          session: session.status === 'done' || session.status === 'cancelled' ? null : session,
          ...(now !== undefined ? { now, receivedAt: Date.now() / 1000 } : {}),
        }
      : old,
  );
  // Ma's FÓKUSZ block (`/lifeos/today`) and the wallet read the focus coins; refetch on next view.
  void qc.invalidateQueries({ queryKey: ['lifeos'] });
  void qc.invalidateQueries({ queryKey: ['coin-wallet'] });
  void qc.invalidateQueries({ queryKey: ['coin-ledger'] });
}

/** A fresh idempotency key for one start (8..64 of [A-Za-z0-9_-]). */
export function newFocusKey() {
  const raw = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `f-${raw.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64);
}

export function useStartFocus() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always', // never queued while offline: a block started later would be judged at the wrong moment (review S-focus 6)
    mutationFn: (body: FocusStart) => apiWithRefresh<FocusStartResponse>('/focus', { method: 'POST', body }),
    onSuccess: ({ session }) => putSession(qc, session),
    onError: (err) => {
      // FOCUS_OPEN carries the block that is already open: show it instead of the setup.
      const open = refusalOf(err) === 'FOCUS_OPEN' ? sessionOf(err) : null;
      if (open) putSession(qc, open);
    },
  });
}

export function useFocusCheckin() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (id: number) => apiWithRefresh<FocusCheckinResponse>(`/focus/${id}/checkin`, { method: 'POST', body: {} }),
    onSuccess: ({ session }) => putSession(qc, session),
    onError: (err) => {
      const s = sessionOf(err);
      if (s) putSession(qc, s);
    },
  });
}

export function useFinishFocus() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (id: number) => apiWithRefresh<FocusFinishResponse>(`/focus/${id}/finish`, { method: 'POST', body: {} }),
    onSuccess: ({ session }) => putSession(qc, session),
  });
}

export function useCancelFocus() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (id: number) => apiWithRefresh<FocusSessionResponse>(`/focus/${id}/cancel`, { method: 'POST', body: {} }),
    onSuccess: ({ session }) => putSession(qc, session),
  });
}

const REFUSALS: readonly FocusRefusalCode[] = [
  'TIMEZONE_REQUIRED',
  'LIMIT_REACHED',
  'FOCUS_OPEN',
  'FOCUS_NOT_STARTED',
  'FOCUS_NOT_ACTIVE',
  'FOCUS_NO_CHECKINS',
  'FOCUS_CLOSED',
];

/** The 409 code of a refused focus write, when it is one of the documented ones. */
export function refusalOf(err: unknown): FocusRefusalCode | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  return (REFUSALS as readonly string[]).includes(err.code) ? (err.code as FocusRefusalCode) : null;
}

/** The block a 409 carries (FOCUS_OPEN: the open one; FOCUS_NOT_ACTIVE: the block as it stands). */
function sessionOf(err: unknown): FocusSession | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const s = err.body.session;
  return s && typeof s === 'object' && typeof (s as FocusSession).id === 'number' ? (s as FocusSession) : null;
}
