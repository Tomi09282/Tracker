// src/lifeos/challenges.js — the daily challenge draw ("dobás"), PURE. A port of f_app
// `src/domain/challenges.ts` drawChallenges, made integer-only and fed its randomness from outside.
//
// ═══ WHERE THE RANDOMNESS COMES FROM ═══════════════════════════════════════════════════════════
//
// f_app multiplies Math.random() by the total weight. Here the caller passes `randomInt(max)` —
// in the worker that is node:crypto's randomInt (uniform on [0, max), no modulo bias), in the
// verify script a scripted sequence — so the draw is testable and nothing a client sends can steer
// it. The function itself never touches a clock, a database or a global.
//
// Imported by the worker (drawChallengeTx / rerollChallengeTx) and by verify-033.mjs.

/** How many options a draw offers (HÁROM LEHETŐSÉG; f_app settings.challengeChoices default 3). */
export const DRAW_SIZE = 3;

/** The weight scale: five segments on the Kihívások frame. */
export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 5;

/** The category keys of the round-B frames (Fegyelem, Mozgás, Elme, Kapcsolat, Étkezés). */
export const CHALLENGE_CATEGORIES = Object.freeze(['discipline', 'movement', 'mind', 'connection', 'food']);

/**
 * Draw up to `count` DISTINCT challenges from `pool`, weighted (weight 2 = twice as likely as 1),
 * without replacement. `pool` is [{ id, weight }]; `randomInt(max)` returns an integer in [0, max).
 * Returns the picked ids in draw order; [] for an empty pool.
 */
export function weightedDraw(pool, count, randomInt) {
  const left = pool.map((c) => ({ id: c.id, weight: c.weight }));
  const picked = [];
  while (picked.length < count && left.length > 0) {
    const total = left.reduce((a, c) => a + c.weight, 0);
    let r = randomInt(total);
    if (!Number.isInteger(r) || r < 0 || r >= total) throw new Error('weightedDraw: randomInt out of range');
    let idx = 0;
    for (; idx < left.length; idx += 1) {
      r -= left[idx].weight;
      if (r < 0) break;
    }
    const [c] = left.splice(idx, 1);
    picked.push(c.id);
  }
  return picked;
}

/**
 * The options of a draw (f_app drawChallenges): the live pool minus the challenges already accepted
 * today minus `exclude` (the previous roll, on a reroll). If excluding the previous roll leaves fewer
 * than DRAW_SIZE, fall back to the whole unaccepted pool — a reroll still offers a full hand.
 */
export function drawOptions({ pool, acceptedToday = [], exclude = [] }, randomInt, count = DRAW_SIZE) {
  const taken = new Set(acceptedToday);
  const ex = new Set(exclude);
  const open = pool.filter((c) => !taken.has(c.id));
  let candidates = open.filter((c) => !ex.has(c.id));
  if (candidates.length < count && ex.size > 0) candidates = open;
  return weightedDraw(candidates, count, randomInt);
}
