// src/db/lifeos-rewards-items.js — the challenge and reward rows and views (migration 033) that the
// named transactions of tx/lifeos-rewards.js and the Ma read (tx/lifeos.js lifeosTodayQuery) share.
//
// WORKER SIDE ONLY, and deliberately not a tx/ file (the reasoning of lifeos-ledger.js): these are
// fragments that run inside the caller's transaction or read snapshot — nothing re-exports them, so
// Piscina can never be asked to run one by name. Ownership is in every statement
// (`WHERE ... user_id = ?`): a row of another account is indistinguishable from a missing one.
import { stmt } from './conn.js';
import { pointsToMinor } from '../lifeos/rules.js';
import { availability, progressBp } from '../lifeos/rewards.js';

/* ══ challenges ══════════════════════════════════════════════════════════════════════════════════ */

const CHALLENGE_COLS = `c.id, c.name, c.category, c.points, c.weight, c.archived_at AS archivedAt,
  c.created_at AS createdAt, c.updated_at AS updatedAt`;

/** A live (not deleted) challenge of the owner, archived or not. */
export function challengeRow(userId, challengeId) {
  return stmt(`SELECT ${CHALLENGE_COLS} FROM challenges c WHERE c.id = ? AND c.user_id = ? AND c.deleted_at IS NULL`)
    .get(challengeId, userId);
}

export function challengeView(c) {
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    points: c.points,
    weight: c.weight,
    valueMinor: pointsToMinor(c.points),
    archived: c.archivedAt !== null,
    archivedAt: c.archivedAt,
  };
}

/** The draw pool: live, not archived. Bounded by the pool cap (50), read with a hard LIMIT anyway. */
export function poolRows(userId) {
  return stmt(
    `SELECT ${CHALLENGE_COLS} FROM challenges c
      WHERE c.user_id = ? AND c.deleted_at IS NULL AND c.archived_at IS NULL
      ORDER BY c.name, c.id LIMIT 200`,
  ).all(userId);
}

export function countPool(userId) {
  return stmt('SELECT COUNT(*) AS n FROM challenges WHERE user_id = ? AND deleted_at IS NULL AND archived_at IS NULL')
    .get(userId).n;
}

export function countAllChallenges(userId) {
  return stmt('SELECT COUNT(*) AS n FROM challenges WHERE user_id = ?').get(userId).n;
}

/** Challenge ids already turned into a task due on `date` (open or done, not deleted). */
export function acceptedOn(userId, date) {
  return stmt(
    `SELECT DISTINCT challenge_id AS id FROM tasks
      WHERE user_id = ? AND due_on = ? AND challenge_id IS NOT NULL AND deleted_at IS NULL`,
  ).all(userId, date).map((r) => r.id);
}

export function drawRow(userId, date) {
  return stmt(
    `SELECT id, local_date AS localDate, option1_id AS o1, option2_id AS o2, option3_id AS o3,
            rerolls_used AS rerollsUsed, reroll_key AS rerollKey,
            picked_challenge_id AS pickedChallengeId, picked_task_id AS pickedTaskId, picked_at AS pickedAt
       FROM challenge_draws WHERE user_id = ? AND local_date = ?`,
  ).get(userId, date);
}

/**
 * The day's draw as Ma and MAI DOBÁS draw it.
 *   state  'empty_pool' — nothing to draw from (no NAPI DOBÁS block)
 *          'due'        — no draw yet today; the client asks for one (POST /challenges/today/draw)
 *          'drawn'      — options on the table, nothing picked ("Választás nélkül minden
 *                         megnyitáskor visszajön.")
 *          'picked'     — the pick became a task (elvállalva / teljesítve)
 */
export function drawState(userId, today) {
  const poolCount = countPool(userId);
  const d = drawRow(userId, today);
  if (!d) {
    return { date: today, state: poolCount > 0 ? 'due' : 'empty_pool', poolCount, options: [], rerollsLeft: 1, picked: null };
  }
  const ids = [d.o1, d.o2, d.o3].filter((x) => x !== null);
  const options = ids.map((id) => {
    const c = stmt(`SELECT ${CHALLENGE_COLS} FROM challenges c WHERE c.id = ? AND c.user_id = ?`).get(id, userId);
    return { ...challengeView(c), chosen: d.pickedChallengeId === id };
  });
  let picked = null;
  if (d.pickedTaskId !== null) {
    const t = stmt(
      `SELECT id, title, points, completed_at AS completedAt, deleted_at AS deletedAt
         FROM tasks WHERE id = ? AND user_id = ?`,
    ).get(d.pickedTaskId, userId);
    picked = {
      challengeId: d.pickedChallengeId,
      taskId: d.pickedTaskId,
      pickedAt: d.pickedAt,
      done: Boolean(t?.completedAt),
      taskDeleted: Boolean(t?.deletedAt),
    };
  }
  return {
    date: today,
    state: picked ? 'picked' : 'drawn',
    poolCount,
    options,
    rerollsLeft: 1 - d.rerollsUsed,
    picked,
  };
}

/* ══ rewards ═════════════════════════════════════════════════════════════════════════════════════ */

const REWARD_COLS = `r.id, r.name, r.description, r.cost_minor AS costMinor, r.repeatable,
  r.cooldown_days AS cooldownDays, r.archived_at AS archivedAt, r.created_at AS createdAt,
  r.updated_at AS updatedAt`;

export function rewardRow(userId, rewardId) {
  return stmt(`SELECT ${REWARD_COLS} FROM rewards r WHERE r.id = ? AND r.user_id = ?`).get(rewardId, userId);
}

export function countLiveRewards(userId) {
  return stmt('SELECT COUNT(*) AS n FROM rewards WHERE user_id = ? AND archived_at IS NULL').get(userId).n;
}

export function countAllRewards(userId) {
  return stmt('SELECT COUNT(*) AS n FROM rewards WHERE user_id = ?').get(userId).n;
}

export function spendableMinor(userId) {
  const b = stmt('SELECT balance_minor AS b FROM coin_wallets WHERE user_id = ?').get(userId)?.b ?? 0;
  return { balanceMinor: b, spendableMinor: Math.max(0, b) };
}

/** How often, and when last (logical day), this reward was redeemed. */
export function redemptionHistory(userId, rewardId) {
  const h = stmt(
    `SELECT COUNT(*) AS count, MAX(local_date) AS lastOn FROM reward_redemptions
      WHERE user_id = ? AND reward_id = ?`,
  ).get(userId, rewardId);
  return { count: h.count, lastOn: h.lastOn };
}

export function redemptionView(rr) {
  return {
    id: rr.id,
    rewardId: rr.rewardId,
    name: rr.name,
    costMinor: rr.costMinor,
    localDate: rr.localDate,
    redeemedAt: rr.createdAt,
    fulfilled: rr.fulfilledAt !== null,
    fulfilledAt: rr.fulfilledAt,
  };
}

const REDEMPTION_COLS = `rr.id, rr.reward_id AS rewardId, rr.name_snapshot AS name,
  rr.cost_minor_snapshot AS costMinor, rr.local_date AS localDate, rr.fulfilled_at AS fulfilledAt,
  rr.created_at AS createdAt`;

export function redemptionRow(userId, redemptionId) {
  const rr = stmt(`SELECT ${REDEMPTION_COLS} FROM reward_redemptions rr WHERE rr.id = ? AND rr.user_id = ?`)
    .get(redemptionId, userId);
  return rr ? redemptionView(rr) : null;
}

export function redemptionByKey(userId, clientKey) {
  const rr = stmt(`SELECT ${REDEMPTION_COLS} FROM reward_redemptions rr WHERE rr.user_id = ? AND rr.client_key = ?`)
    .get(userId, clientKey);
  return rr ? redemptionView(rr) : null;
}

/** The newest redemptions, of one reward or of all (bounded: the detail page and the history). */
export function redemptionList(userId, rewardId = null, limit = 100) {
  return stmt(
    `SELECT ${REDEMPTION_COLS} FROM reward_redemptions rr
      WHERE rr.user_id = ? AND (? IS NULL OR rr.reward_id = ?)
      ORDER BY rr.id DESC LIMIT ?`,
  ).all(userId, rewardId, rewardId, limit).map(redemptionView);
}

/**
 * A reward as the shop draws it: its cost, whether it can be redeemed today and why not, the bar to
 * its cost and how often it was redeemed. `today` is null before a zone is set (nothing redeemable).
 */
export function rewardView(userId, r, spendable, today) {
  const history = redemptionHistory(userId, r.id);
  const reward = { costMinor: r.costMinor, repeatable: r.repeatable === 1, cooldownDays: r.cooldownDays };
  const avail = today ? availability(reward, history, spendable, today) : { ok: false, reason: 'TIMEZONE_REQUIRED' };
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    costMinor: r.costMinor,
    repeatable: r.repeatable === 1,
    cooldownDays: r.cooldownDays,
    archived: r.archivedAt !== null,
    archivedAt: r.archivedAt,
    redeemedCount: history.count,
    lastRedeemedOn: history.lastOn,
    availability: avail,
    progressBp: progressBp(r.costMinor, spendable),
    balanceAfterMinor: spendable - r.costMinor,
  };
}

/** The shop: live rewards by cost, plus the archived ones for the detail / restore paths. */
export function rewardShop(userId, today) {
  const { balanceMinor, spendableMinor: spendable } = spendableMinor(userId);
  const rows = stmt(
    `SELECT ${REWARD_COLS} FROM rewards r WHERE r.user_id = ?
      ORDER BY (r.archived_at IS NOT NULL), r.cost_minor, r.id LIMIT 500`,
  ).all(userId);
  const views = rows.map((r) => rewardView(userId, r, spendable, today));
  const items = views.filter((v) => !v.archived);
  return {
    balanceMinor,
    spendableMinor: spendable,
    items,
    archived: views.filter((v) => v.archived),
    redeemableCount: items.filter((v) => v.availability.ok).length,
  };
}
