// src/coins/achievements.js — the evaluator, and the streaks it reads.
//
// ═══ WITHOUT THIS FILE THE ACHIEVEMENTS ARE UNEARNABLE ═════════════════════════════════════════
//
// Migration 019 shipped the catalogue, `user_achievements`, `unlockAchievementTx` and the ledger
// path they pay through — and NOTHING CALLED ANY OF IT. Every piece was correct and the feature
// did not exist. That is a specific and easy failure: the machinery is the interesting part, so it
// gets built and reviewed and attacked, and the two lines that invoke it are nobody's idea of
// work. A route that awards nothing is the coin equivalent of a chart with no data behind it.
//
// ═══ EVALUATION IS SERVER-SIDE, AND THERE IS NO CLAIM ENDPOINT ═════════════════════════════════
//
// Nothing here is reachable from a request body. The evaluator runs AFTER a workout is finished or
// a food entry is logged, decides what is true from the database, and unlocks. The strongest
// anti-mint control in a coin system is the route that does not exist, and this is what makes its
// absence tenable rather than merely restrictive.
//
// ═══ IT IS FIRE-AND-FORGET, AND THAT IS DELIBERATE ═════════════════════════════════════════════
//
// A failed evaluation must never fail the workout that triggered it. Somebody finishing a session
// in a gym basement cares that their session saved; a badge that did not land is recoverable on
// the next one, because every check below is a STATE QUESTION ("have they done ten sessions?")
// rather than an EVENT ("this was the tenth"). A missed run self-heals; a missed event would not.
//
// The unlock itself is still exactly-once — `user_achievements_once_uidx` and the ledger's natural
// key see to that — so running the evaluator twice, or a hundred times, awards once.
//
// ═══ STREAKS ARE COMPUTED, NEVER STORED ════════════════════════════════════════════════════════
//
// T5.3.3 asked for streak COUNTERS. A counter is a second representation of something the log
// already knows, and this project has deleted five of those. A streak is `SELECT DISTINCT
// local_date` walked backwards from today — thirty rows at most, on an index that exists for the
// day view anyway. A stored counter would need a nightly job to break it and would be wrong every
// hour that job was late.
import * as db from '../db/index.js';

/**
 * The longest run of consecutive local dates ending TODAY or YESTERDAY.
 *
 * ENDING YESTERDAY STILL COUNTS, and that is the whole design of a streak. Someone who trained
 * every day for six days and has not trained yet today at 09:00 has a six-day streak, not a broken
 * one — a streak that resets at midnight punishes people for the hour they wake up.
 *
 * Dates are the CLIENT'S local dates, already resolved at write time, so this is string arithmetic
 * over `YYYY-MM-DD` and no timezone enters here.
 */
function streakFrom(dates, today) {
  if (dates.length === 0) return 0;

  const set = new Set(dates);
  const day = (iso, delta) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  };

  // Anchor on today if there is an entry today, otherwise on yesterday. Anywhere further back and
  // the streak is genuinely over.
  let cursor = set.has(today) ? today : day(today, -1);
  if (!set.has(cursor)) return 0;

  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = day(cursor, -1);
  }
  return n;
}

/** The client's local calendar day, from the most recent thing they logged. */
const todayFor = async (userId) => {
  const row = await db.get(
    `SELECT MAX(d) AS today FROM (
       SELECT MAX(local_date) AS d FROM workout_logs WHERE client_user_id = ?
       UNION ALL
       SELECT MAX(local_date) AS d FROM nutrition_log_items WHERE client_user_id = ?)`,
    [userId, userId],
  );
  return row?.today ?? null;
};

/**
 * What this account has earned, as a set of achievement keys.
 *
 * Every entry is a STATE QUESTION answered from the log, so the evaluator is idempotent by
 * construction and does not care how often it runs or whether it missed one.
 */
async function earnedKeys(userId) {
  const keys = [];

  const sessions = await db.get(
    `SELECT COUNT(*) AS n FROM workout_logs
      WHERE client_user_id = ? AND status = 'completed'`,
    [userId],
  );
  if (sessions.n >= 1) keys.push('workout.first');
  if (sessions.n >= 10) keys.push('workout.sessions.10');
  if (sessions.n >= 100) keys.push('workout.sessions.100');

  // A record EVENT, not a record cache. 010's rule: derive from the rows, never from the cache the
  // same batch also advances.
  // `client_user_id`, not `user_id` — and the first version had the wrong column WITH a
  // `.catch(() => ({ n: 0 }))` around it, so the query threw on every call and 'pr.first' was
  // silently unearnable forever. A catch that turns an error into a plausible value is not
  // resilience, it is a defect that has been given somewhere to hide. The whole evaluation is
  // already fire-and-forget at the CALL site, which is the right place for that decision.
  const prs = await db.get(
    `SELECT COUNT(*) AS n FROM workout_pr_events e
      WHERE e.client_user_id = ? AND e.invalidated_at IS NULL`,
    [userId],
  );
  if ((prs?.n ?? 0) >= 1) keys.push('pr.first');

  const today = await todayFor(userId);
  if (today) {
    const trained = await db.all(
      `SELECT DISTINCT local_date AS d FROM workout_logs
        WHERE client_user_id = ? AND status = 'completed'
          AND local_date >= date(?, '-45 days')
        ORDER BY d DESC`,
      [userId, today],
    );
    const workoutStreak = streakFrom(trained.map((r) => r.d), today);
    if (workoutStreak >= 7) keys.push('streak.workout.7');
    if (workoutStreak >= 30) keys.push('streak.workout.30');

    const ate = await db.all(
      `SELECT DISTINCT local_date AS d FROM nutrition_log_items
        WHERE client_user_id = ? AND local_date >= date(?, '-45 days')
        ORDER BY d DESC`,
      [userId, today],
    );
    if (streakFrom(ate.map((r) => r.d), today) >= 7) keys.push('nutrition.logged.7');
  }

  return keys;
}

/**
 * Evaluate and award. Returns what was newly unlocked, for a caller that wants to celebrate.
 *
 * `sourceType`/`sourceId` record the provenance on the unlock row. They are the caller's, not the
 * client's — nothing here reaches a request body.
 */
export async function evaluateAchievements({ userId, requestId, sourceType = null, sourceId = null }) {
  const keys = await earnedKeys(userId);
  if (keys.length === 0) return [];

  // Only the ones not already held, so the common case (a regular who unlocked everything months
  // ago) costs one indexed read and no transactions at all.
  const held = new Set(
    (
      await db.all(
        `SELECT achievement_key AS k FROM user_achievements WHERE user_id = ?`,
        [userId],
      )
    ).map((r) => r.k),
  );
  const fresh = keys.filter((k) => !held.has(k));
  if (fresh.length === 0) return [];

  const unlocked = [];
  for (const key of fresh) {
    // One transaction per achievement rather than one for all of them: a logical write is ONE
    // worker call, and two unlocks are two logical writes. It also means an unlucky collision on
    // one cannot roll back the others.
    const r = await db.unlockAchievement({ userId, achievementKey: key, sourceType, sourceId, requestId });
    if (r?.outcome === 'applied' && !r.replayed) unlocked.push(r);
  }
  return unlocked;
}

/**
 * The same evaluation, with every failure swallowed.
 *
 * FOR THE HOT PATH ONLY. A workout that saved correctly must not report an error because a badge
 * did not land — and it need not, because every check is a state question that the next
 * evaluation asks again. The failure is LOGGED, so a persistent one is visible rather than silent.
 */
export function evaluateInBackground(req, { userId, sourceType = null, sourceId = null }) {
  const requestId = req.res?.locals?.requestId ?? 'evaluator';
  evaluateAchievements({ userId, requestId, sourceType, sourceId }).catch((err) => {
    (req.log ?? console).warn?.({ err, userId }, 'achievement evaluation failed');
  });
}

/** Exported for the probe: streak arithmetic is pure and deserves to be checked without a DB. */
export const __streakFrom = streakFrom;
