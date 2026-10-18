// src/lifeos/settle.js — the LAZY day close (plan L6). There is no scheduler in this product: a day
// settles the first time the user's own requests ask about it after it became due (GET
// /lifeos/today, GET /coins/wallet, every LifeOS route), at start(next day) + 6 h.
//
// ═══ ONE WORKER CALL PER LOGICAL STEP ══════════════════════════════════════════════════════════
//
//   1. lifeosSettleState  — one read: which days are due (dates.js dueDays, from the worker clock).
//   2. markLapsedDays     — one transaction for every day OLDER than the 7-day catch-up window.
//   3. closeLifeDay x <=7 — one transaction PER day, oldest first, stopping at the first refusal.
//
// Every transaction re-decides due-ness under its own write lock, so this file can be wrong about
// timing and still not mint: the worst it can do is ask for a day that is not due and be refused.
// Two requests settling the same user at once collide on daily_summaries' primary key; the loser
// answers 'already' (or its whole transaction rolls back), never a second payout.
//
// ═══ THE PER-PROCESS MEMO ══════════════════════════════════════════════════════════════════════
//
// Without it every wallet read pays a settle-state read. With it, once a user is settled the next
// read is free until `nextSettleAt` — the instant the next day becomes due. It is per process and
// only an optimisation: a stale memo (another process, a changed day start) delays a settle until
// nextSettleAt at most, and invalidate() is called on every prefs change in this process.
import * as db from '../db/index.js';

const memo = new Map(); // userId -> nextSettleAt (ms)
const MEMO_MAX = 50_000;

export function invalidateSettled(userId) {
  memo.delete(userId);
}

/**
 * Settle every due day for one user. Never throws to the caller's request: a settle that failed is
 * logged and retried on the next request — the read that triggered it still answers.
 */
export async function ensureSettled(userId, { requestId = 'settle', log = null } = {}) {
  const until = memo.get(userId);
  if (until && Date.now() < until) return;
  try {
    const state = await db.lifeosSettleState({ userId });
    if (!state.started) return;

    if (state.due.lapse.length) await db.markLapsedDays({ userId });
    for (const localDate of state.due.close) {
      const r = await db.closeLifeDay({ userId, localDate, requestId });
      if (r.outcome !== 'closed' && r.outcome !== 'already') {
        log?.warn?.({ userId, localDate, outcome: r.outcome }, 'lifeos day close stopped');
        return; // not memoised: the next request tries again
      }
    }
    if (memo.size >= MEMO_MAX) memo.clear();
    memo.set(userId, state.nextSettleAt);
  } catch (err) {
    log?.error?.({ err, userId }, 'lifeos settle failed');
  }
}

/**
 * Pay a completed workout AFTER the finish has committed, never blocking it — the same contract as
 * coins/achievements.js evaluateInBackground: a coin that did not land must not fail the workout.
 */
export function awardWorkoutInBackground(req, { userId, logId }) {
  const requestId = req.res?.locals?.requestId ?? 'award';
  db.awardWorkout({ userId, logId, requestId }).catch((err) => {
    (req.log ?? console).warn?.({ err, userId, logId }, 'workout award failed');
  });
}
