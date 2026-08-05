import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSchedule, segmentAt, type IntervalBlock, type Segment } from './intervalPlan';
import { acquireWakeLock, releaseWakeLock, wakeLockWanted } from './wakeLock';

export type IntervalPhase = 'idle' | 'prepare' | 'work' | 'rest' | 'setBreak' | 'paused' | 'done';

export interface IntervalCues {
  /** Entering a segment. Fired from the TICK, never from a render. */
  onEnter: (segment: Segment, round: number, total: number) => void;
  /** 3, 2, 1 before every phase change. */
  onCountdown: (left: number) => void;
  onDone: () => void;
  /** A `work` segment ended; record it. Resolves false if the post failed. */
  onWorkComplete: (setId: number, seconds: number) => Promise<boolean>;
}

/**
 * The interval engine.
 *
 * SINGLE SOURCE OF TRUTH: `{ anchorAt, pausedAt }` plus the schedule. `elapsed()` is the one
 * function that reads the clock and EVERYTHING derives from it. Nothing is ever decremented, and
 * every control that changes time changes the anchor or the pause stamp and nothing else.
 *
 * That is not stylistic. Three separate defects in the first draft of this design were all the same
 * mistake — a value derived from something other than `elapsed()`:
 *
 *   - Pause did not pause. The tick was not gated on the pause stamp, so a paused block ran to
 *     completion behind a frozen display and auto-recorded every round.
 *   - Resume-from-interrupted re-anchored with the ordinary `anchorAt += now - pausedAt` shift,
 *     which cannot land on a chosen index and produces `NaN` if `pausedAt` was never set — a timer
 *     that dies with no error at all.
 *   - The countdown de-dup lived in render, so it re-fired on every repaint.
 *
 * THE INTERRUPTION RULE has no time threshold, deliberately. The honest discriminator is not how
 * stale a boundary is — it is whether a segment was ever ANNOUNCED to the lifter. A segment that
 * was live and cued is a round they know they did; segments that began and ended while JS was
 * frozen are rounds they were never cued for, and only those are unknowable.
 */
export function useIntervalTimer(cues: IntervalCues) {
  const [phase, setPhase] = useState<IntervalPhase>('idle');
  const [, repaint] = useState(0);

  const anchorRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const scheduleRef = useRef<Segment[]>([]);
  const lastIdxRef = useRef(-1);
  const lastCountdownRef = useRef(-1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cuesRef = useRef(cues);
  cuesRef.current = cues;

  const [interrupted, setInterrupted] = useState(false);
  const pendingConfirmRef = useRef<Segment[]>([]);
  const frozenIdxRef = useRef(0);
  const [failedRounds, setFailedRounds] = useState<number[]>([]);

  /** THE one derivation. A frozen `pausedAt` is what makes pause actually pause. */
  const elapsed = useCallback(() => (pausedAtRef.current ?? Date.now()) - anchorRef.current, []);

  const clear = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  /**
   * Every index change routes through here, so nothing can be forgotten.
   *
   * Resetting the countdown ref is the ONLY reason a skip does not swallow the next segment's final
   * beep — without it, `left` would already equal the stale value and the 3-2-1 would never re-arm.
   */
  const enterSegment = useCallback((idx: number) => {
    lastIdxRef.current = idx;
    lastCountdownRef.current = -1;
    const seg = scheduleRef.current[idx];
    if (!seg) return;
    setPhase(seg.kind);
    cuesRef.current.onEnter(seg, seg.round, roundsIn(scheduleRef.current));
  }, []);

  const post = useCallback(async (seg: Segment, seconds: number) => {
    if (seg.setId == null) return;
    const ok = await cuesRef.current.onWorkComplete(seg.setId, seconds);
    if (!ok) setFailedRounds((prev) => (prev.includes(seg.round) ? prev : [...prev, seg.round]));
  }, []);

  /**
   * The tick body, also run SYNCHRONOUSLY on visibilitychange / pageshow / focus.
   *
   * The redundancy across three events is deliberate: `visibilitychange` reliability inside
   * Capacitor's WKWebView is not something this codebase has measured, and the cost of a duplicate
   * call is nothing — the first line makes an unchanged index a no-op.
   */
  const evaluate = useCallback(() => {
    const schedule = scheduleRef.current;
    if (!schedule.length || pausedAtRef.current != null) return;

    const now = elapsed();
    const idx = segmentAt(schedule, now);

    if (idx === lastIdxRef.current) {
      // An ordinary mid-segment tick. Repaint, and arm the 3-2-1 if we are close enough.
      const seg = schedule[idx];
      if (seg) {
        const left = Math.ceil((seg.endMs - now) / 1000);
        if (left <= 3 && left >= 1 && left !== lastCountdownRef.current) {
          lastCountdownRef.current = left;
          cuesRef.current.onCountdown(left);
        }
      }
      repaint((n) => n + 1);
      return;
    }

    // Impossible in a forward-running clock, but a resync is strictly better than misclassifying
    // it as an interruption and prompting the lifter about rounds that never happened.
    if (idx < lastIdxRef.current) {
      lastIdxRef.current = idx;
      repaint((n) => n + 1);
      return;
    }

    // The segment we were in WAS live and cued. The lifter knows about it, so it is a fact.
    const finished = schedule[lastIdxRef.current];
    if (finished?.kind === 'work' && finished.setId != null) {
      // The PRESCRIBED duration, not a measurement. `trg_log_set_frozen` aborts on
      // `NEW.seconds IS NOT OLD.seconds`, which surfaces as a 400 — so a measured value differing
      // by a millisecond of rounding would turn every retry of the same write_uid into a permanent
      // failure. It is also simply what happened: the engine ran the segment to its end.
      void post(finished, finished.seconds);
    }

    if (idx >= schedule.length) {
      clear();
      lastIdxRef.current = schedule.length;
      setPhase('done');
      releaseWakeLock();
      cuesRef.current.onDone();
      return;
    }

    if (idx === lastIdxRef.current + 1) {
      enterSegment(idx);
      repaint((n) => n + 1);
      return;
    }

    // Segments between the last cued one and now ended without ever being announced. Those rounds
    // are unknowable, so the lifter is asked rather than credited or robbed.
    const crossed = schedule.slice(lastIdxRef.current + 1, idx).filter((s) => s.kind === 'work' && s.setId != null);
    frozenIdxRef.current = lastIdxRef.current + 1;
    pendingConfirmRef.current = crossed;
    pausedAtRef.current = Date.now();
    clear();
    setInterrupted(true);
    setPhase('paused');
  }, [clear, elapsed, enterSegment, post]);

  const run = useCallback(() => {
    clear();
    timer.current = setInterval(evaluate, 250);
  }, [clear, evaluate]);

  const start = useCallback(
    (block: IntervalBlock, prepareSeconds: number) => {
      const schedule = buildSchedule(block, { prepareSeconds });
      scheduleRef.current = schedule;
      setFailedRounds([]);
      setInterrupted(false);
      pendingConfirmRef.current = [];
      if (!schedule.length) {
        setPhase('done');
        return;
      }
      anchorRef.current = Date.now();
      pausedAtRef.current = null;
      // -1, so the FIRST segment fires its entry cue even when prepare is disabled and the first
      // index is 0. Initialising to 0 would silently swallow the opening GO.
      lastIdxRef.current = -1;
      lastCountdownRef.current = -1;
      void acquireWakeLock();
      enterSegment(0);
      run();
    },
    [enterSegment, run],
  );

  const pause = useCallback(() => {
    if (pausedAtRef.current != null) return;
    pausedAtRef.current = Date.now();
    clear();
    setPhase('paused');
  }, [clear]);

  const resume = useCallback(() => {
    if (pausedAtRef.current == null) return;
    // The whole schedule shifts by however long the pause lasted. Nothing else is touched.
    anchorRef.current += Date.now() - pausedAtRef.current;
    pausedAtRef.current = null;
    setInterrupted(false);
    pendingConfirmRef.current = [];
    const seg = scheduleRef.current[lastIdxRef.current];
    setPhase(seg?.kind ?? 'work');
    void acquireWakeLock();
    run();
  }, [run]);

  const skip = useCallback(() => {
    // Reads its segment from the REF, never from React state: state is a render behind, and a skip
    // tapped during the last 250 ms of a segment would then post the wrong row.
    if (pausedAtRef.current != null) return;
    const schedule = scheduleRef.current;
    const seg = schedule[lastIdxRef.current];
    if (!seg) return;

    if (seg.kind === 'work' && seg.setId != null) {
      const measured = Math.min(seg.seconds, Math.round((elapsed() - seg.startMs) / 1000));
      // Under a second is not a round. Recording a zero-second round would be a fact nobody
      // performed; leaving the row pending lets it be done properly later.
      if (measured >= 1) void post(seg, measured);
    }

    anchorRef.current -= seg.endMs - elapsed();
    const next = lastIdxRef.current + 1;
    if (next >= schedule.length) {
      clear();
      lastIdxRef.current = schedule.length;
      setPhase('done');
      releaseWakeLock();
      cuesRef.current.onDone();
      return;
    }
    enterSegment(next);
  }, [clear, elapsed, enterSegment, post]);

  const stop = useCallback(() => {
    clear();
    releaseWakeLock();
    scheduleRef.current = [];
    pausedAtRef.current = null;
    lastIdxRef.current = -1;
    setInterrupted(false);
    pendingConfirmRef.current = [];
    setPhase('idle');
  }, [clear]);

  /** "I kept going" — credit the crossed rounds and continue where the clock actually is. */
  const confirmCrossed = useCallback(() => {
    const schedule = scheduleRef.current;
    for (const seg of pendingConfirmRef.current) void post(seg, seg.seconds);
    pendingConfirmRef.current = [];
    const idx = segmentAt(schedule, Date.now() - anchorRef.current);
    setInterrupted(false);
    if (idx >= schedule.length) {
      pausedAtRef.current = null;
      lastIdxRef.current = schedule.length;
      setPhase('done');
      releaseWakeLock();
      cuesRef.current.onDone();
      return;
    }
    // An EXPLICIT re-anchor onto the chosen index. The ordinary resume shift cannot land on a
    // specific segment, and it is the branch that produced `NaN` in review.
    anchorRef.current = Date.now() - schedule[idx].startMs;
    pausedAtRef.current = null;
    enterSegment(idx);
    void acquireWakeLock();
    run();
  }, [enterSegment, post, run]);

  /** "Stop here" — record nothing, rewind to the first unannounced segment, stay paused. */
  const discardCrossed = useCallback(() => {
    const schedule = scheduleRef.current;
    pendingConfirmRef.current = [];
    setInterrupted(false);
    const idx = Math.min(frozenIdxRef.current, Math.max(0, schedule.length - 1));
    anchorRef.current = Date.now() - schedule[idx].startMs;
    pausedAtRef.current = Date.now();
    lastIdxRef.current = idx;
    lastCountdownRef.current = -1;
    setPhase('paused');
  }, []);

  // Returning to the foreground: re-evaluate immediately rather than waiting up to 250 ms, and
  // take the wake lock back — the browser releases it on every tab hide by specification.
  useEffect(() => {
    const wake = () => {
      if (wakeLockWanted()) void acquireWakeLock();
      evaluate();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') wake(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', wake);
    window.addEventListener('focus', wake);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('focus', wake);
    };
  }, [evaluate]);

  // Nothing survives unmount: no interval, no wake lock. The DURABLE state is the database —
  // rounds already checked carry `completed_at`, and `buildSchedule` emits only pending ones, so
  // navigating away and back resumes correctly with nothing persisted client-side. A timer
  // restored from a stale anchor would fast-forward and fabricate rounds, which is precisely what
  // the interruption rule exists to prevent, reintroduced through the back door.
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      releaseWakeLock();
    },
    [],
  );

  const schedule = scheduleRef.current;
  const idx = lastIdxRef.current;
  const done = phase === 'done' || idx >= schedule.length;
  const segment = done || idx < 0 ? null : (schedule[idx] ?? null);
  const now = elapsed();
  const remaining = segment ? Math.max(0, Math.ceil((segment.endMs - now) / 1000)) : 0;

  return {
    phase,
    segment,
    remaining,
    progress: segment && segment.seconds > 0 ? 1 - remaining / segment.seconds : 0,
    round: segment?.round ?? 0,
    totalRounds: roundsIn(schedule),
    running: phase !== 'idle' && phase !== 'done' && phase !== 'paused',
    interrupted,
    pendingCount: pendingConfirmRef.current.length,
    failedRounds,
    start,
    pause,
    resume,
    skip,
    stop,
    confirmCrossed,
    discardCrossed,
  };
}

/** The highest round number the schedule contains — what the lifter is counting toward. */
function roundsIn(schedule: Segment[]): number {
  let max = 0;
  for (const s of schedule) if (s.round > max) max = s.round;
  return max;
}
