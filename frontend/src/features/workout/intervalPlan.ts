import type { LogExercise, LogSet } from './useWorkout';

/**
 * The interval schedule — pure arithmetic, no React, no clock, no DOM.
 *
 * The whole timer is derived from ONE epoch anchor: what phase you are in at time T is a lookup,
 * not an accumulation. That is the `useRestTimer` lesson generalised — a counter that decrements
 * loses time every screen lock, which on a phone mid-Tabata is constantly. It also means the hard
 * part of this feature can be unit-tested without mounting anything.
 *
 * THE MAPPING THIS FILE OWNS: **a round is a set row.** The server materialises `block.rounds` rows
 * for a circuit or EMOM, so `setId` is read off a row that already exists and is never invented.
 * Checking a round is therefore an UPDATE guarded by its own `write_uid`, and a crash at round 5
 * resumes from rows 1-4 carrying `completed_at` with no new server code.
 */

export type SegmentKind = 'prepare' | 'work' | 'rest' | 'setBreak';

export interface Segment {
  kind: SegmentKind;
  /** 1-based round number; 0 for prepare and setBreak. */
  round: number;
  /** Which movement inside the round; -1 for prepare and setBreak. */
  memberIndex: number;
  /** Only a `work` segment owns a row. Everything else is time with nothing to record. */
  setId: number | null;
  seconds: number;
  /** Offsets from the anchor, cumulative. */
  startMs: number;
  endMs: number;
}

export interface IntervalMember {
  logExerciseId: number;
  name: string;
  setIds: number[];
  completed: boolean[];
  targetSeconds: (number | null)[];
  targetRestSeconds: (number | null)[];
}

export type IntervalBlockKind = 'circuit' | 'emom' | 'amrap';

export interface IntervalBlock {
  blockOrdinal: number;
  blockKind: IntervalBlockKind;
  members: IntervalMember[];
  rounds: number;
  /** False → the stage says so rather than guessing a duration the coach never wrote. */
  runnable: boolean;
}

const INTERVAL_KINDS: readonly string[] = ['circuit', 'emom', 'amrap'];

export const isIntervalKind = (kind: string | null | undefined): kind is IntervalBlockKind =>
  kind != null && INTERVAL_KINDS.includes(kind);

/**
 * Group the session's exercises into runnable interval blocks.
 *
 * `rounds` is the MINIMUM row count across members, not the maximum and not the first member's.
 * In practice every member takes `block.rounds` rows from the same materialisation, so they agree —
 * but a legacy row or a mid-session edit could leave them ragged, and a schedule that indexes past
 * a member's array would read `undefined` and coerce a duration out of nothing. Surplus rows stay
 * pending and remain hand-checkable through an ordinary set row, which is the honest fallback.
 */
export function groupIntervalBlocks(exercises: LogExercise[], sets: LogSet[]): IntervalBlock[] {
  const byOrdinal = new Map<number, LogExercise[]>();
  for (const ex of exercises) {
    if (!isIntervalKind(ex.block_kind)) continue;
    const key = ex.block_ordinal ?? 0;
    const bucket = byOrdinal.get(key);
    if (bucket) bucket.push(ex);
    else byOrdinal.set(key, [ex]);
  }

  const blocks: IntervalBlock[] = [];
  for (const [blockOrdinal, group] of [...byOrdinal.entries()].sort((a, b) => a[0] - b[0])) {
    const ordered = [...group].sort((a, b) => a.position - b.position || a.id - b.id);
    const members: IntervalMember[] = ordered.map((ex) => {
      const rows = sets
        .filter((s) => s.log_exercise_id === ex.id)
        .sort((a, b) => a.set_index - b.set_index);
      return {
        logExerciseId: ex.id,
        name: ex.exercise_name_snapshot,
        setIds: rows.map((r) => r.id),
        // A VOIDED round counts as `completed` here, and that is correct rather than sloppy: the
        // flag drives whether `buildSchedule` emits a segment for the round, and a voided round
        // CANNOT be re-checked — `trg_log_set_void_terminal` makes the void terminal and
        // `recordSetTx` requires `voided_at IS NULL`. Emitting a segment for it would run a
        // countdown whose post is guaranteed to 409. Skipping it is the only outcome that works.
        //
        // Spelled out because the neighbouring reads of `completed_at` needed `voided_at` added and
        // this one deliberately does not — an unexplained inconsistency invites a "fix" that breaks
        // the block.
        completed: rows.map((r) => r.completed_at != null || r.voided_at != null),
        targetSeconds: rows.map((r) => r.target_seconds),
        targetRestSeconds: rows.map((r) => r.target_rest_seconds),
      };
    });

    const blockKind = ordered[0].block_kind as IntervalBlockKind;
    const rounds = members.length ? Math.min(...members.map((m) => m.setIds.length)) : 0;
    blocks.push({ blockOrdinal, blockKind, members, rounds, runnable: runnableFor(blockKind, members, rounds) });
  }
  return blocks;
}

/**
 * Whether every duration the schedule needs actually exists.
 *
 * A duration is NEVER coerced from a null. A reps-based circuit has no `target_seconds`, and an
 * EMOM whose block carries no `rest_seconds` has no minute window — guessing 60 would be inventing
 * a prescription the coach did not write, and the lifter would train to it.
 */
function runnableFor(kind: IntervalBlockKind, members: IntervalMember[], rounds: number): boolean {
  if (!members.length || rounds < 1) return false;
  if (kind === 'amrap') return members.every((m) => positive(m.targetSeconds[0]));
  // For an EMOM the WINDOW is the block's rest, and it is what the work segment is measured by.
  const pick = (m: IntervalMember, r: number) => (kind === 'emom' ? m.targetRestSeconds[r] : m.targetSeconds[r]);
  for (let r = 0; r < rounds; r += 1) {
    for (const m of members) if (!positive(pick(m, r))) return false;
  }
  return true;
}

const positive = (n: number | null | undefined): n is number => typeof n === 'number' && n > 0;

/**
 * Expand a block into the exact list of timed segments.
 *
 * ROUNDS ALREADY CARRYING `completed_at` ARE SKIPPED, NOT REPLAYED. That one rule is what makes an
 * app-kill resume, a mid-block navigation and a hole left by a skip all land on the same code path:
 * the durable state is the database, and the schedule is rebuilt from whatever is still pending.
 * Nothing is persisted to localStorage — a timer restored from a stale anchor would fast-forward
 * and fabricate rounds, which is exactly what the interruption rule exists to prevent.
 */
export function buildSchedule(block: IntervalBlock, opts: { prepareSeconds: number }): Segment[] {
  if (!block.runnable) return [];
  const out: Segment[] = [];
  let at = 0;

  const push = (kind: SegmentKind, seconds: number, round: number, memberIndex: number, setId: number | null) => {
    const ms = seconds * 1000;
    out.push({ kind, round, memberIndex, setId, seconds, startMs: at, endMs: at + ms });
    at += ms;
  };

  // Emitted only when there is something to prepare FOR — a block with every round already done
  // gets an empty schedule, and the stage renders "done" rather than counting down to nothing.
  const anyPending = block.members.some((m) => m.completed.some((c) => !c));
  if (!anyPending) return [];
  if (opts.prepareSeconds > 0) push('prepare', opts.prepareSeconds, 0, -1, null);

  for (let r = 0; r < block.rounds; r += 1) {
    for (let mi = 0; mi < block.members.length; mi += 1) {
      const m = block.members[mi];
      if (m.completed[r]) continue;

      const work = block.blockKind === 'emom' ? m.targetRestSeconds[r] : m.targetSeconds[r];
      if (!positive(work)) continue;
      push('work', work, r + 1, mi, m.setIds[r] ?? null);

      // An EMOM has no rest: the window IS the round, and the next one starts on the minute.
      if (block.blockKind === 'emom') continue;
      const rest = m.targetRestSeconds[r];
      if (positive(rest)) push('rest', rest, r + 1, mi, null);
    }
  }

  // A Tabata ends on work, not on rest. Trailing rest would leave the lifter watching a countdown
  // to nothing after the block is already over.
  while (out.length && out[out.length - 1].kind === 'rest') {
    const dropped = out.pop();
    if (dropped) at -= dropped.seconds * 1000;
  }
  return out;
}

/**
 * Which segment is live at `elapsedMs`.
 *
 * Returns -1 before the block, `0..length-1` inside, and `schedule.length` when it is over —
 * so EVERY caller must compute done before indexing. Binary search because it runs four times a
 * second for the length of a session.
 */
export function segmentAt(schedule: Segment[], elapsedMs: number): number {
  if (!schedule.length) return 0;
  if (elapsedMs < 0) return -1;
  if (elapsedMs >= schedule[schedule.length - 1].endMs) return schedule.length;

  let lo = 0;
  let hi = schedule.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = schedule[mid];
    if (elapsedMs < s.startMs) hi = mid - 1;
    else if (elapsedMs >= s.endMs) lo = mid + 1;
    else return mid;
  }
  return schedule.length;
}

/** Total prescribed length, for the AMRAP cap line and the stage's overall progress. */
export const scheduleSeconds = (schedule: Segment[]): number =>
  schedule.length ? Math.round(schedule[schedule.length - 1].endMs / 1000) : 0;
