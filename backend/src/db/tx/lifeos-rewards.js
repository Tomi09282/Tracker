// src/db/tx/lifeos-rewards.js — the challenge and reward transactions and reads (migration 033).
//
// Runs INSIDE a Piscina worker (re-exported by worker.js; every `export function` is a task the
// facade may name). The rules of src/db/tx/lifeos.js hold here too: one logical write = one worker
// call in an IMMEDIATE transaction; ADR-0005 (every refusal before the first write); ownership in the
// SQL (`WHERE id = ? AND user_id = ?`, another account's row is a 404); "now" is the worker's clock.
//
// ═══ THE TWO WRITES THAT MATTER ════════════════════════════════════════════════════════════════
//
//   drawChallengeTx    the day's three options, drawn HERE with node:crypto randomInt (uniform, no
//                      modulo bias), weighted, excluding the challenges accepted today. UNIQUE
//                      (user_id, local_date) is the idempotency: a second draw of the day answers the
//                      first. rerollChallengeTx replaces the options once; pickChallengeTx turns one
//                      option into a normal task with the challenge's coins, due at the end of the
//                      logical day (due_on = today, no time: late only on a later logical day). The
//                      coins move when that task is completed (completeTaskTx), never here.
//   redeemRewardTx     the one LifeOS SPEND. ALREADY_REDEEMED / COOLDOWN / INSUFFICIENT are decided
//                      before the first write; the balance guard sits INSIDE the receipt INSERT
//                      (`... AND w.balance_minor >= r.cost_minor`) and trg_coin_ledger_spend_covered
//                      is the backstop under it, so a spend can never take the balance below zero
//                      (plan L3) even if every check above were defeated.
import { randomInt } from 'node:crypto';
import { getDb, stmt, rethrow } from '../conn.js';
import { readPrefs, readRules } from '../lifeos-ledger.js';
import { countOpenTasks, taskRow, taskView } from '../lifeos-items.js';
import {
  acceptedOn, challengeRow, challengeView, countAllChallenges, countLiveRewards, countAllRewards,
  countPool, drawRow, drawState, poolRows, redemptionByKey, redemptionHistory, redemptionList,
  redemptionRow, rewardRow, rewardShop, rewardView, spendableMinor,
} from '../lifeos-rewards-items.js';
import { dayKeyFor } from '../../lifeos/dates.js';
import { LIFEOS_LIMITS, pointsToMinor } from '../../lifeos/rules.js';
import { drawOptions } from '../../lifeos/challenges.js';
import { availability } from '../../lifeos/rewards.js';

function started(prefs) {
  return Boolean(prefs?.timezone && prefs.startedOn);
}

function todayFor(prefs, nowMs) {
  return dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);
}

/** The worker's CSPRNG, in the shape weightedDraw takes. */
const cryptoInt = (max) => randomInt(max);

/* ══ challenge reads ═════════════════════════════════════════════════════════════════════════════ */

/** GET /challenges: the pool (AKTÍV "8 / 50") and the archived ones (ARCHIVÁLT). */
export function challengesQuery({ userId }) {
  try {
    const prefs = readPrefs(userId);
    if (!prefs) return null;
    const rows = stmt(
      `SELECT c.id, c.name, c.category, c.points, c.weight, c.archived_at AS archivedAt
         FROM challenges c WHERE c.user_id = ? AND c.deleted_at IS NULL
        ORDER BY (c.archived_at IS NOT NULL), c.name, c.id LIMIT 500`,
    ).all(userId).map(challengeView);
    return {
      active: rows.filter((c) => !c.archived),
      archived: rows.filter((c) => c.archived),
      limits: { pool: LIFEOS_LIMITS.challengePool },
    };
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /challenges/:id. */
export function challengeQuery({ userId, challengeId }) {
  try {
    const c = challengeRow(userId, challengeId);
    return c ? challengeView(c) : null;
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /challenges/today: the day's draw (also inside GET /lifeos/today). */
export function challengeTodayQuery({ userId }) {
  try {
    const prefs = readPrefs(userId);
    if (!prefs) return null;
    if (!started(prefs)) return { started: false, draw: null };
    return { started: true, draw: drawState(userId, todayFor(prefs, Date.now())) };
  } catch (err) {
    return rethrow(err);
  }
}

/* ══ challenge pool writes ═══════════════════════════════════════════════════════════════════════ */

/**
 * A new challenge. Refuses before writing: no zone yet (409 TIMEZONE_REQUIRED, as every LifeOS
 * create), the pool cap (50 live) and the total cap (every challenge ever kept, so a create /
 * delete loop cannot grow the table). A replay of the same clientKey answers what it made.
 * points defaults to the admin rule challengePoints (f_app), capped at 50 like a task override.
 */
export function createChallengeTx({ userId, input, clientKey }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    if (!started(prefs)) return { outcome: 'timezone_required' };

    current = 'SELECT the replay';
    const prior = stmt('SELECT id FROM challenges WHERE user_id = ? AND client_key = ?').get(userId, clientKey);
    if (prior) {
      const c = challengeRow(userId, prior.id);
      return c ? { outcome: 'replayed', challenge: challengeView(c) } : { outcome: 'conflict' };
    }
    current = 'SELECT the caps';
    if (countPool(userId) >= LIFEOS_LIMITS.challengePool) return { outcome: 'cap', limit: LIFEOS_LIMITS.challengePool };
    if (countAllChallenges(userId) >= LIFEOS_LIMITS.challengesTotal) return { outcome: 'cap', limit: LIFEOS_LIMITS.challengesTotal };
    const { rules } = readRules();
    const points = input.points ?? Math.min(rules.challengePoints, LIFEOS_LIMITS.challengePointsMax);

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT challenges';
    const ins = stmt(
      `INSERT INTO challenges (user_id, name, category, points, weight, client_key)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userId, input.name, input.category ?? null, points, input.weight ?? 1, clientKey);
    return { outcome: 'created', challenge: challengeView(challengeRow(userId, Number(ins.lastInsertRowid))) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/** Edit a challenge (name, category, coins, weight). A task already picked keeps its coins. */
export function updateChallengeTx({ userId, challengeId, patch }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the challenge (owned)';
    const c = challengeRow(userId, challengeId);
    if (!c) return { outcome: 'missing' };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE challenges';
    const upd = stmt(
      `UPDATE challenges SET name = ?, category = ?, points = ?, weight = ?, updated_at = unixepoch()
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).run(
      patch.name ?? c.name,
      patch.category !== undefined ? patch.category : c.category,
      patch.points ?? c.points,
      patch.weight ?? c.weight,
      challengeId,
      userId,
    );
    if (upd.changes === 0) return { outcome: 'missing' };
    return { outcome: 'applied', challenge: challengeView(challengeRow(userId, challengeId)) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Archive ("Archiválás") or restore ("Visszaállítás"). Idempotent: archiving an archived challenge
 * answers it unchanged. A restore that would exceed the pool cap is refused before writing.
 * An archived challenge leaves the pool; a draw already showing it keeps showing it, but it can no
 * longer be picked (f_app acceptChallenge: "challenge archived").
 */
export function setChallengeArchivedTx({ userId, challengeId, archived }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the challenge (owned)';
    const c = challengeRow(userId, challengeId);
    if (!c) return { outcome: 'missing' };
    if ((c.archivedAt !== null) === archived) return { outcome: 'applied', challenge: challengeView(c) };
    if (!archived && countPool(userId) >= LIFEOS_LIMITS.challengePool) return { outcome: 'cap', limit: LIFEOS_LIMITS.challengePool };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE challenges (archive)';
    const upd = stmt(
      `UPDATE challenges SET archived_at = CASE WHEN ? = 1 THEN unixepoch() ELSE NULL END, updated_at = unixepoch()
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).run(archived ? 1 : 0, challengeId, userId);
    if (upd.changes === 0) return { outcome: 'missing' };
    return { outcome: 'applied', challenge: challengeView(challengeRow(userId, challengeId)) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/** Soft delete (f_app deleteChallenge): the tasks it already became keep their history. */
export function deleteChallengeTx({ userId, challengeId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the challenge (owned)';
    const c = challengeRow(userId, challengeId);
    if (!c) return { outcome: 'missing' };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE challenges (soft delete)';
    const del = stmt(
      `UPDATE challenges SET deleted_at = unixepoch(), archived_at = COALESCE(archived_at, unixepoch()),
              updated_at = unixepoch()
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).run(challengeId, userId);
    if (del.changes === 0) return { outcome: 'missing' };
    return { outcome: 'applied' };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ the daily draw ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Draw today's options (POST /challenges/today/draw). IDEMPOTENT PER DAY: a draw that exists is
 * answered as it is ('already') — never redrawn — so retries, two tabs and a race all see one hand.
 *
 *   forge    — nothing from the client reaches the draw: the pool and the day are the server's,
 *              the randomness is the worker's CSPRNG;
 *   replay   — the second call finds the row ('already');
 *   race     — IMMEDIATE + UNIQUE (user_id, local_date): two draws serialise, the second reads the first;
 *   IDOR     — only the caller's own live challenges (trg_challenge_draw_options_owned proves it again);
 *   extremes — an empty pool is 'empty_pool' (no row), a pool of one or two offers one or two.
 */
export function drawChallengeTx({ userId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const today = todayFor(prefs, Date.now());

    current = 'SELECT the draw of the day';
    if (drawRow(userId, today)) return { outcome: 'already', draw: drawState(userId, today) };
    const ids = drawOptions({ pool: poolRows(userId), acceptedToday: acceptedOn(userId, today) }, cryptoInt);
    if (ids.length === 0) return { outcome: 'empty_pool', draw: drawState(userId, today) };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT challenge_draws';
    stmt(
      `INSERT INTO challenge_draws (user_id, local_date, option1_id, option2_id, option3_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(userId, today, ids[0], ids[1] ?? null, ids[2] ?? null);
    return { outcome: 'drawn', draw: drawState(userId, today) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * The one reroll of the day ("↺ Újradobás · még 1 maradt ma"). New options exclude the previous
 * hand (falling back to the whole unaccepted pool when that leaves too few). A retried reroll with
 * the same rerollKey answers the current hand ('replayed'); a second reroll is REROLL_USED; a draw
 * that was picked cannot be rerolled; no draw yet is NO_DRAW.
 */
export function rerollChallengeTx({ userId, rerollKey }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const today = todayFor(prefs, Date.now());

    current = 'SELECT the draw of the day';
    const d = drawRow(userId, today);
    if (!d) return { outcome: 'no_draw' };
    if (d.rerollKey === rerollKey) return { outcome: 'replayed', draw: drawState(userId, today) };
    if (d.pickedAt !== null) return { outcome: 'picked' };
    if (d.rerollsUsed >= 1) return { outcome: 'reroll_used' };
    const previous = [d.o1, d.o2, d.o3].filter((x) => x !== null);
    const ids = drawOptions(
      { pool: poolRows(userId), acceptedToday: acceptedOn(userId, today), exclude: previous },
      cryptoInt,
    );
    if (ids.length === 0) return { outcome: 'empty_pool' };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE challenge_draws (reroll, guarded)';
    const upd = stmt(
      `UPDATE challenge_draws
          SET option1_id = ?, option2_id = ?, option3_id = ?, rerolls_used = 1, reroll_key = ?,
              updated_at = unixepoch()
        WHERE id = ? AND user_id = ? AND rerolls_used = 0 AND picked_at IS NULL`,
    ).run(ids[0], ids[1] ?? null, ids[2] ?? null, rerollKey, d.id, userId);
    if (upd.changes === 0) return { outcome: 'reroll_used' };
    return { outcome: 'rerolled', draw: drawState(userId, today) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * "Ezt vállalom": one of today's options becomes a normal task — the challenge's name, priority 2,
 * the challenge's coins as the task's override, due today with no time (= by the end of the logical
 * day; completed later it pays half, like any late task) — and the draw is marked picked.
 *
 *   forge    — the challenge must be one of TODAY'S options of THIS user's draw; coins and due day
 *              come from the stored challenge and the worker clock, never from the body;
 *   replay   — the clientKey is the task's key: the same key answers the task it made ('replayed');
 *              the same key for another challenge is a CONFLICT;
 *   race     — IMMEDIATE + the guarded UPDATE (picked_at IS NULL): two picks serialise, the second
 *              is ALREADY_PICKED;
 *   IDOR     — a challenge id of another account is never an option of this draw (NOT_OFFERED);
 *   extremes — the open-task cap (300) is refused before writing; the coins are <= 50 by schema.
 */
export function pickChallengeTx({ userId, challengeId, clientKey }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const { rules } = readRules();
    const now = Date.now();
    const today = todayFor(prefs, now);

    current = 'SELECT the draw and the replay';
    const d = drawRow(userId, today);
    const prior = stmt('SELECT id, challenge_id AS challengeId FROM tasks WHERE user_id = ? AND client_key = ?').get(userId, clientKey);
    if (prior) {
      if (d && d.pickedTaskId === prior.id && prior.challengeId === challengeId) {
        const t = taskRow(userId, prior.id);
        return { outcome: 'replayed', task: t ? taskView(t, prefs, rules, now) : null, draw: drawState(userId, today) };
      }
      return { outcome: 'conflict' };
    }
    if (!d) return { outcome: 'no_draw' };
    if (d.pickedAt !== null) return { outcome: 'already_picked' };
    if (![d.o1, d.o2, d.o3].includes(challengeId)) return { outcome: 'not_offered' };
    const c = challengeRow(userId, challengeId);
    if (!c || c.archivedAt !== null) return { outcome: 'not_offered' };
    if (acceptedOn(userId, today).includes(challengeId)) return { outcome: 'already_picked' };
    if (countOpenTasks(userId) >= LIFEOS_LIMITS.openTasks) return { outcome: 'cap', limit: LIFEOS_LIMITS.openTasks };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT tasks (the challenge task)';
    const ins = stmt(
      `INSERT INTO tasks (user_id, title, priority, points, due_on, client_key, challenge_id)
       VALUES (?, ?, 2, ?, ?, ?, ?)`,
    ).run(userId, c.name, c.points, today, clientKey, challengeId);
    const taskId = Number(ins.lastInsertRowid);
    current = 'UPDATE challenge_draws (pick, guarded)';
    const upd = stmt(
      `UPDATE challenge_draws
          SET picked_challenge_id = ?, picked_task_id = ?, picked_at = unixepoch(), updated_at = unixepoch()
        WHERE id = ? AND user_id = ? AND picked_at IS NULL`,
    ).run(challengeId, taskId, d.id, userId);
    if (upd.changes !== 1) throw new Error('pickChallengeTx: the draw was picked under the lock');
    return {
      outcome: 'picked',
      task: taskView(taskRow(userId, taskId), prefs, rules, now),
      draw: drawState(userId, today),
      valueMinor: pointsToMinor(c.points),
    };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ reward reads ════════════════════════════════════════════════════════════════════════════════ */

/** GET /rewards: the shop (ELKÖLTHETŐ, JUTALOMBOLT by cost, the archived ones), the redeemable count. */
export function rewardsQuery({ userId }) {
  try {
    const prefs = readPrefs(userId);
    if (!prefs) return null;
    const today = started(prefs) ? todayFor(prefs, Date.now()) : null;
    return { started: Boolean(today), today, ...rewardShop(userId, today), limits: { rewards: LIFEOS_LIMITS.rewards, costMaxMinor: pointsToMinor(LIFEOS_LIMITS.rewardCostMax) } };
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /rewards/:id: one reward and its redemptions (BEVÁLTÁSOK, newest first, at most 100). */
export function rewardQuery({ userId, rewardId }) {
  try {
    const prefs = readPrefs(userId);
    if (!prefs) return null;
    const r = rewardRow(userId, rewardId);
    if (!r) return null;
    const today = started(prefs) ? todayFor(prefs, Date.now()) : null;
    const { spendableMinor: spendable } = spendableMinor(userId);
    return { reward: rewardView(userId, r, spendable, today), spendableMinor: spendable, redemptions: redemptionList(userId, rewardId) };
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /rewards/redemptions: every redemption, newest first, at most 100. */
export function redemptionsQuery({ userId }) {
  try {
    return { redemptions: redemptionList(userId) };
  } catch (err) {
    return rethrow(err);
  }
}

/* ══ reward writes ═══════════════════════════════════════════════════════════════════════════════ */

function rewardFields(input, base = null) {
  const repeatable = input.repeatable ?? (base ? base.repeatable === 1 : true);
  let cooldown = input.cooldownDays !== undefined ? input.cooldownDays : base?.cooldownDays ?? null;
  if (!repeatable || cooldown === 0) cooldown = null;
  return {
    name: input.name ?? base?.name,
    description: input.description !== undefined ? input.description : base?.description ?? null,
    costMinor: input.cost !== undefined ? pointsToMinor(input.cost) : base?.costMinor,
    repeatable: repeatable ? 1 : 0,
    cooldownDays: cooldown,
  };
}

/**
 * A new reward ("Új jutalom"). Refuses before writing: no zone yet, the live cap (100) and the
 * total cap. A replay of the same clientKey answers what it made.
 */
export function createRewardTx({ userId, input, clientKey }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const today = todayFor(prefs, Date.now());
    const { spendableMinor: spendable } = spendableMinor(userId);

    current = 'SELECT the replay';
    const prior = stmt('SELECT id FROM rewards WHERE user_id = ? AND client_key = ?').get(userId, clientKey);
    if (prior) return { outcome: 'replayed', reward: rewardView(userId, rewardRow(userId, prior.id), spendable, today) };
    current = 'SELECT the caps';
    if (countLiveRewards(userId) >= LIFEOS_LIMITS.rewards) return { outcome: 'cap', limit: LIFEOS_LIMITS.rewards };
    if (countAllRewards(userId) >= LIFEOS_LIMITS.rewardsTotal) return { outcome: 'cap', limit: LIFEOS_LIMITS.rewardsTotal };
    const f = rewardFields(input);

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT rewards';
    const ins = stmt(
      `INSERT INTO rewards (user_id, name, description, cost_minor, repeatable, cooldown_days, client_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, f.name, f.description, f.costMinor, f.repeatable, f.cooldownDays, clientKey);
    const r = rewardRow(userId, Number(ins.lastInsertRowid));
    return { outcome: 'created', reward: rewardView(userId, r, spendable, today) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/** Edit a reward. Past redemptions keep their snapshots; the next redemption pays the new cost. */
export function updateRewardTx({ userId, rewardId, patch }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the reward (owned)';
    const prefs = readPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    const r = rewardRow(userId, rewardId);
    if (!r) return { outcome: 'missing' };
    const today = started(prefs) ? todayFor(prefs, Date.now()) : null;
    const { spendableMinor: spendable } = spendableMinor(userId);
    const f = rewardFields(patch, r);
    // Turning a redeemed reward into a one-time one would make it "redeemed twice, once only".
    if (f.repeatable === 0 && r.repeatable === 1 && redemptionHistory(userId, rewardId).count > 1) {
      return { outcome: 'conflict' };
    }

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE rewards';
    const upd = stmt(
      `UPDATE rewards SET name = ?, description = ?, cost_minor = ?, repeatable = ?, cooldown_days = ?,
              updated_at = unixepoch()
        WHERE id = ? AND user_id = ?`,
    ).run(f.name, f.description, f.costMinor, f.repeatable, f.cooldownDays, rewardId, userId);
    if (upd.changes === 0) return { outcome: 'missing' };
    return { outcome: 'applied', reward: rewardView(userId, rewardRow(userId, rewardId), spendable, today) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Archive ("Archiválás", the redemptions stay) or restore. Idempotent. A restore over the live cap
 * is refused before writing.
 */
export function setRewardArchivedTx({ userId, rewardId, archived }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the reward (owned)';
    const prefs = readPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    const r = rewardRow(userId, rewardId);
    if (!r) return { outcome: 'missing' };
    const today = started(prefs) ? todayFor(prefs, Date.now()) : null;
    const { spendableMinor: spendable } = spendableMinor(userId);
    if ((r.archivedAt !== null) === archived) return { outcome: 'applied', reward: rewardView(userId, r, spendable, today) };
    if (!archived && countLiveRewards(userId) >= LIFEOS_LIMITS.rewards) return { outcome: 'cap', limit: LIFEOS_LIMITS.rewards };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE rewards (archive)';
    const upd = stmt(
      `UPDATE rewards SET archived_at = CASE WHEN ? = 1 THEN unixepoch() ELSE NULL END, updated_at = unixepoch()
        WHERE id = ? AND user_id = ?`,
    ).run(archived ? 1 : 0, rewardId, userId);
    if (upd.changes === 0) return { outcome: 'missing' };
    return { outcome: 'applied', reward: rewardView(userId, rewardRow(userId, rewardId), spendable, today) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Redeem a reward ("Beváltás · 80 érme") — the one LifeOS spend.
 *
 *   forge    — the cost is the stored reward's (trg_reward_redemption_truthful proves the snapshot
 *              equals it); the body carries only the clientKey;
 *   replay   — the clientKey: the same key answers the receipt it made ('replayed', no second
 *              debit — reward_redemptions_key_uidx and coin_ledger_idem_uidx both hold it);
 *              the same key for another reward is a CONFLICT;
 *   race     — IMMEDIATE: two redeems with two keys serialise; the second re-reads the balance
 *              (INSUFFICIENT), the history (ALREADY_REDEEMED) or the cooldown (COOLDOWN);
 *   IDOR     — `WHERE r.id = ? AND r.user_id = ?`: another account's reward is a 404;
 *   extremes — a balance in debt has nothing spendable; the guard inside the INSERT and the
 *              spend-covered trigger keep the balance >= 0 whatever happens above them.
 */
export function redeemRewardTx({ userId, rewardId, clientKey, requestId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const today = todayFor(prefs, Date.now());

    current = 'SELECT the replay';
    const prior = redemptionByKey(userId, clientKey);
    if (prior) {
      if (prior.rewardId !== rewardId) return { outcome: 'conflict' };
      return { outcome: 'replayed', redemption: prior, ...spendableMinor(userId) };
    }
    current = 'SELECT the reward (owned, live)';
    const r = rewardRow(userId, rewardId);
    if (!r || r.archivedAt !== null) return { outcome: 'missing' };
    const { spendableMinor: spendable } = spendableMinor(userId);
    const avail = availability(
      { costMinor: r.costMinor, repeatable: r.repeatable === 1, cooldownDays: r.cooldownDays },
      redemptionHistory(userId, rewardId),
      spendable,
      today,
    );
    if (!avail.ok) return { outcome: 'refused', availability: avail };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    // THE BALANCE GUARD IS IN THE INSERT: a receipt is written only while the wallet covers the
    // live cost. Zero rows = nothing was written, which is the ADR's first-write exemption.
    current = 'INSERT reward_redemptions (guarded by the balance)';
    const ins = stmt(
      `INSERT INTO reward_redemptions
         (user_id, reward_id, name_snapshot, cost_minor_snapshot, local_date, client_key, request_id)
       SELECT r.user_id, r.id, r.name, r.cost_minor, ?, ?, ?
         FROM rewards r JOIN coin_wallets w ON w.user_id = r.user_id
        WHERE r.id = ? AND r.user_id = ? AND r.archived_at IS NULL
          AND w.balance_minor >= r.cost_minor`,
    ).run(today, clientKey, requestId, rewardId, userId);
    if (ins.changes === 0) return { outcome: 'refused', availability: { ok: false, reason: 'INSUFFICIENT', missingMinor: r.costMinor - spendable } };
    const redemptionId = Number(ins.lastInsertRowid);
    current = 'INSERT coin_ledger (reward.redeem)';
    const led = stmt(
      `INSERT INTO coin_ledger
         (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key, actor_user_id, request_id)
       SELECT rr.user_id, -rr.cost_minor_snapshot, 'reward.redeem', 'reward_redemption', rr.id,
              'reward:' || rr.user_id || ':' || rr.client_key, rr.user_id, rr.request_id
         FROM reward_redemptions rr WHERE rr.id = ? AND rr.user_id = ?`,
    ).run(redemptionId, userId);
    if (led.changes !== 1) throw new Error('redeemRewardTx: the ledger row did not follow its receipt');
    return { outcome: 'redeemed', redemption: redemptionRow(userId, redemptionId), ...spendableMinor(userId) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/** The "Teljesítve" tick on a redemption — bookkeeping only, it moves no coins. Idempotent. */
export function setRedemptionFulfilledTx({ userId, redemptionId, fulfilled }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the redemption (owned)';
    const rr = redemptionRow(userId, redemptionId);
    if (!rr) return { outcome: 'missing' };
    if ((rr.fulfilledAt !== null) === fulfilled) return { outcome: 'applied', redemption: rr };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE reward_redemptions (fulfilled)';
    const upd = stmt(
      `UPDATE reward_redemptions SET fulfilled_at = CASE WHEN ? = 1 THEN unixepoch() ELSE NULL END
        WHERE id = ? AND user_id = ?`,
    ).run(fulfilled ? 1 : 0, redemptionId, userId);
    if (upd.changes === 0) return { outcome: 'missing' };
    return { outcome: 'applied', redemption: redemptionRow(userId, redemptionId) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}
