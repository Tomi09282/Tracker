import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiWithRefresh, ApiError } from '../../lib/api';

export interface LogSet {
  id: number;
  log_exercise_id: number;
  set_index: number;
  set_kind: string;
  target_reps: number | null;
  target_seconds: number | null;
  target_weight_kg: number | null;
  target_rest_seconds: number | null;
  weight_kg: number | null;
  entry_unit: 'kg' | 'lb' | null;
  entry_value: number | null;
  reps: number | null;
  seconds: number | null;
  rpe: number | null;
  completed_at: number | null;
  voided_at: number | null;
}

export interface LogExercise {
  id: number;
  exercise_id: number | null;
  exercise_name_snapshot: string;
  position: number;
  target_metric: 'reps' | 'time' | 'distance';
  load_mode: string;
  block_kind: string | null;
  /** Which block this movement belongs to. Members of one interval block share it. */
  block_ordinal: number | null;
}

export interface WorkoutLog {
  id: number;
  title: string | null;
  status: string;
  started_at: number;
  total_sets: number;
  total_reps: number | null;
  total_volume_kg: number | null;
}

export interface PrRecord {
  kind: 'e1rm' | 'rep_max' | 'max_hold' | 'max_distance' | 'best_time';
  repBucket: number;
  value: number;
  previous: number | null;
}

const KEY = ['workout', 'current'] as const;

export function useCurrentWorkout() {
  return useQuery({
    queryKey: KEY,
    queryFn: () =>
      apiWithRefresh<{ log: WorkoutLog | null; exercises: LogExercise[]; sets: LogSet[] }>(
        '/workouts/current',
      ),
  });
}

export function useStartWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { plan_day_id?: number | null; title?: string | null }) =>
      apiWithRefresh<{ logId: number; resumed: boolean; sets: number }>('/workouts/start', {
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** What the check returned, so the row can react without a refetch. */
export interface CheckOutcome {
  applied: boolean;
  replayed: boolean;
  records: PrRecord[];
}

/**
 * Check one set.
 *
 * The idempotency key is minted ONCE per set and reused on every retry of that set, which is what
 * makes the server able to tell "the same request twice" from "a corrected value". A key minted
 * per REQUEST would defeat the whole mechanism: two attempts at the same check would look like two
 * different intentions, and the second would come back 409.
 */
export function useCheckSet() {
  const qc = useQueryClient();
  const keys = useRef(new Map<number, string>());

  const uidFor = useCallback((setId: number) => {
    let uid = keys.current.get(setId);
    if (!uid) {
      uid = `s${setId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      keys.current.set(setId, uid);
    }
    return uid;
  }, []);

  const mutation = useMutation({
    mutationFn: ({
      setId,
      ...values
    }: {
      setId: number;
      weight?: number | null;
      weight_unit?: 'kg' | 'lb';
      reps?: number | null;
      seconds?: number | null;
      rpe?: number | null;
      rest_taken_seconds?: number | null;
    }) =>
      apiWithRefresh<CheckOutcome>(`/sets/${setId}/check`, {
        method: 'POST',
        body: { write_uid: uidFor(setId), ...values },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return mutation;
}

/**
 * Undo a recorded set — E21's undo pill, and the escape from a `/check` 409.
 *
 * No idempotency key, unlike the check, and that is not an oversight: a void carries no values to
 * disagree about, so a retry asks for exactly the state that already exists. The server reports
 * `replayed: true` for a second void rather than failing, so the pill can be double-tapped by a
 * shaking hand without consequence.
 */
export function useUndoSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ setId, reason }: { setId: number; reason?: string }) =>
      apiWithRefresh<{ voided: boolean; replayed: boolean; records_withdrawn: number }>(
        `/sets/${setId}/void`,
        { method: 'POST', body: reason ? { reason } : {} },
      ),
    // The records query is invalidated too, not just the session: voiding a set that earned a
    // personal record withdraws that record on the server, and a stale record book would keep
    // showing an achievement the lift no longer supports.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['records'] });
    },
  });
}

/**
 * The rest timer.
 *
 * Driven by a WALL-CLOCK deadline, not by decrementing a counter. A counter loses time whenever the
 * tab is backgrounded — which on a phone is every time the screen locks between sets, i.e. always.
 * Storing the deadline means the remaining time is correct the instant the screen comes back,
 * however long it was away.
 *
 * The interval only exists to repaint; it carries no state, so a missed tick costs nothing.
 */
export function useRestTimer(onElapsed?: () => void) {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Held in a ref so the interval closure always calls the CURRENT callback. Capturing it would
  // freeze whatever the callback was when the timer started, which for a cue that depends on the
  // player's live state is the wrong one by the time it fires.
  const elapsedCb = useRef(onElapsed);
  elapsedCb.current = onElapsed;

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setDeadline(null);
  }, []);

  const start = useCallback((seconds: number) => {
    if (timer.current) clearInterval(timer.current);
    const end = Date.now() + seconds * 1000;
    setDeadline(end);
    setNow(Date.now());
    timer.current = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= end && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
        // Fired from the tick rather than from a render effect: the rest ending is an EVENT, and
        // deriving it from "remaining === 0" in a render would repeat it on every subsequent
        // repaint while the timer sat at zero.
        elapsedCb.current?.();
      }
    }, 250);
  }, []);

  const remaining = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
  const total = useRef(0);
  if (deadline !== null && total.current === 0) total.current = remaining;
  if (deadline === null) total.current = 0;

  return {
    remaining,
    running: deadline !== null && remaining > 0,
    /** 0 → 1 as the rest elapses, for the ring. */
    progress: total.current > 0 ? 1 - remaining / total.current : 0,
    start,
    stop,
  };
}

export { ApiError };
