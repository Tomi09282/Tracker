// src/coins/integrity.js — the coin reconciliation, in ONE place.
//
// ═══ WHY THIS IS A MODULE ══════════════════════════════════════════════════════════════════════
//
// GET /admin/coins/audit used to carry these four queries inline. The admin Statistics page now
// shows an "Integritás ellenőrzés: Rendben" row, and that row must mean exactly what the audit page
// means. A second copy of the queries would agree on the day it was written and drift the first time
// somebody tightened one of them — and then the Statistics page would say "Rendben" over a ledger the
// audit page flags. So both routes call this, and there is one definition of "the books are clean".
//
// Every check must return ZERO rows. `limit` bounds the rows each check hands back: the audit page
// asks for a page of examples (50), the Statistics page asks for enough to count honestly (see
// STATS_LIMIT in admin/statistics.js).
import * as db from '../db/index.js';

export async function coinIntegrity(limit = 50) {
  // 1. A wallet that disagrees with its ledger. There is no AFTER DELETE recompute, so a
  //    hand-deleted row leaves the cache high until the next movement heals it downward — this
  //    is what makes that window visible rather than silent.
  const drifting = await db.all(
    `SELECT w.user_id AS userId, w.balance_minor AS balanceMinor,
            COALESCE((SELECT SUM(l.amount_minor) FROM coin_ledger l WHERE l.user_id = w.user_id), 0)
              AS ledgerSumMinor
       FROM coin_wallets w
      WHERE w.balance_minor <> COALESCE(
            (SELECT SUM(l.amount_minor) FROM coin_ledger l WHERE l.user_id = w.user_id), 0)
      LIMIT ?`,
    [limit],
  );

  // 2. Money and receipts must be one-to-one in both directions.
  const unpaidPurchases = await db.all(
    `SELECT p.id AS purchaseId, p.user_id AS userId
       FROM coin_purchases p
      WHERE NOT EXISTS (SELECT 1 FROM coin_ledger l
                         WHERE l.reason_key = 'store.purchase'
                           AND l.ref_type = 'coin_purchase' AND l.ref_id = p.id)
      LIMIT ?`,
    [limit],
  );
  const orphanDebits = await db.all(
    `SELECT l.id AS entryId, l.user_id AS userId
       FROM coin_ledger l
      WHERE l.reason_key = 'store.purchase'
        AND NOT EXISTS (SELECT 1 FROM coin_purchases p WHERE p.id = l.ref_id)
      LIMIT ?`,
    [limit],
  );

  // 3. Nobody owns anything nobody paid for.
  const unbackedEntitlements = await db.all(
    `SELECT e.id AS entitlementId, e.user_id AS userId
       FROM coin_entitlements e
      WHERE e.revoked_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM coin_purchases p
                         WHERE p.id = e.purchase_id AND p.user_id = e.user_id)
      LIMIT ?`,
    [limit],
  );

  const clean =
    drifting.length === 0 &&
    unpaidPurchases.length === 0 &&
    orphanDebits.length === 0 &&
    unbackedEntitlements.length === 0;

  return { clean, drifting, unpaidPurchases, orphanDebits, unbackedEntitlements };
}
