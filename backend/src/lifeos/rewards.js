// src/lifeos/rewards.js — the reward shop rules, PURE. A port of f_app `src/domain/rewards.ts`
// availability / rewardShop, as functions of their inputs.
//
// ═══ THE COOLDOWN COUNTS LOGICAL DAYS ══════════════════════════════════════════════════════════
//
// f_app counts the cooldown in milliseconds from the last redemption. The round-B shop reads it in
// days ("pihen · még 4 nap"; the coffee redeemed on 10.14 with a 3-day pihenő is redeemable again
// from 10.17), so here a reward redeemed on logical day D with N cooldown days is available again
// on D + N — the same day boundary every other LifeOS rule uses.
//
// ═══ THE ORDER OF THE REFUSALS ═════════════════════════════════════════════════════════════════
//
// ALREADY_REDEEMED, then COOLDOWN, then INSUFFICIENT — f_app's order, and the one the shop's status
// line needs: a one-time reward that was redeemed says "beváltva · egyszeri" whatever the balance.
//
// Imported by the worker (redeemRewardTx, the reads) and by verify-033.mjs.
import { addDaysToKey, daysBetween } from './dates.js';

/**
 * Can `reward` be redeemed today?
 *   reward       { costMinor, repeatable (bool), cooldownDays (int | null) }
 *   history      { count, lastOn (logical day of the newest redemption | null) }
 *   spendableMinor  max(0, balance) — a balance in debt can redeem nothing (plan L3)
 * -> { ok: true } | { ok: false, reason: 'ALREADY_REDEEMED' } | { ok: false, reason: 'COOLDOWN',
 *    availableOn, daysLeft } | { ok: false, reason: 'INSUFFICIENT', missingMinor }
 */
export function availability(reward, history, spendableMinor, today) {
  if (!reward.repeatable && history.count > 0) return { ok: false, reason: 'ALREADY_REDEEMED' };
  if (reward.cooldownDays && history.lastOn) {
    const availableOn = addDaysToKey(history.lastOn, reward.cooldownDays);
    if (today < availableOn) {
      return { ok: false, reason: 'COOLDOWN', availableOn, daysLeft: daysBetween(today, availableOn) };
    }
  }
  if (spendableMinor < reward.costMinor) {
    return { ok: false, reason: 'INSUFFICIENT', missingMinor: reward.costMinor - spendableMinor };
  }
  return { ok: true };
}

/** 0..10000 basis points of the cost already covered by the spendable balance (the 4 pt bar). */
export function progressBp(costMinor, spendableMinor) {
  if (costMinor <= 0) return 10000;
  return Math.min(10000, Math.floor((Math.max(0, spendableMinor) * 10000) / costMinor));
}
