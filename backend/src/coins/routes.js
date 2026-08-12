// src/coins/routes.js — the coin economy at the HTTP layer (F7).
//
// ═══ THE ROUTES CARRY NO AUTHORITY ═════════════════════════════════════════════════════════════
//
// Every guarantee in this file is a property of migration 019 or of a named worker transaction.
// What is here is translation: a request into arguments, an outcome into a status code. That is
// deliberate — a control that lives in a route is a control the next route forgets to copy, and
// the adversarial review that produced this design found exactly that in every candidate.
//
// So read the WEAK statements below as weak on purpose:
//
//   * The store list reports `owned` per item. That is UX. `coin_entitlements_live_uidx` is what
//     actually stops a second purchase, and it does so under concurrency where a read cannot.
//   * The purchase body carries `expected_price_minor`. That is an AGREEMENT ASSERTION and it can
//     only make the request fail; the amount charged is read from `coin_store_items` inside the
//     INSERT. There is no code path where a number from a request reaches a money column.
//   * The admin endpoint has `requireRole('admin')`. That reads a JWT claim which can be fifteen
//     minutes stale, so it is the fast rejection and nothing more — `adminAdjustCoinsTx` re-reads
//     the role AND the session version from the database under the same write lock as the write.
//
// ═══ WHAT THE CLIENT MAY SEND, EXHAUSTIVELY ════════════════════════════════════════════════════
//
// An item id in a URL. An idempotency key. A price to be checked against. On the admin path, an
// amount and a note. That is the entire attack surface. There is no wallet id in the product, so
// there is none to forge; there is no quantity anywhere, which deletes the whole overflow class by
// construction; and there is NO endpoint that claims an achievement, because the strongest
// anti-mint control in a coin system is the route that does not exist.
//
// ═══ THE KEY NAMESPACE ═════════════════════════════════════════════════════════════════════════
//
// A client key is `^[A-Za-z0-9_-]{8,64}$` and the column permits ':'. That asymmetry is the whole
// separation: the server composes `buy:<userId>:<clientKey>` and `adj:<adminId>:<clientKey>`, so a
// client cannot occupy a server-minted slot, the same string on two endpoints is two independent
// operations rather than a false replay, and one principal cannot squat another's key.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { assertAdmin } from '../lib/assert-admin.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();

const testSkip = () => process.env.NODE_ENV === 'test';

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: testSkip,
});

/**
 * PER-IP AND PER-ACCOUNT, COMPOSED. The owner's rule asks for both, and they stop different
 * things: the IP limit stops one machine hammering many accounts, the account limit stops one
 * account being hammered from many machines. Either alone leaves the other open.
 */
const purchaseIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: testSkip,
});

const purchaseAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // `ipKeyGenerator` rather than raw req.ip: the library normalises IPv6 into a /56 so a single
  // host cannot present itself as a different key per request.
  keyGenerator: (req) => (req.user ? `coin:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});

const adminCoinIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: testSkip,
});

const adminCoinAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `admincoin:${req.user.id}` : ipKeyGenerator(req.ip)),
  skip: testSkip,
});

/* ── validation ─────────────────────────────────────────────────────────────────────────────── */

const idParam = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) }).strict();

/**
 * The client's half of an idempotency key.
 *
 * ':' IS ABSENT FROM THIS CHARACTER CLASS AND THAT IS THE POINT. The column permits it, the client
 * may not use it, and the gap between those two facts is what makes the server's namespace
 * unreachable. Eight characters minimum so a key is not trivially guessable by another client
 * sharing a wallet — there is no such client today, and that is not a reason to make it cheap.
 */
const clientKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const purchaseBody = z
  .object({
    idempotency_key: clientKey,
    // MANDATORY, not optional. An omitted agreement field is a surprise charge waiting for the
    // first price change — the client is asserting the price it showed the user, and a mismatch
    // is a 409 carrying the new one rather than a silent debit of a different amount.
    expected_price_minor: z.number().int().min(1).max(10_000_000),
  })
  .strict();

const adminAdjustBody = z
  .object({
    // Bounded at the EDGE to the same number coin_reasons.max_minor holds, so the two cannot
    // silently diverge; the transaction re-reads the table's value and is the authority.
    amount_minor: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((n) => n !== 0, { message: 'a zero adjustment moves nothing' }),
    note: z.string().trim().min(1).max(280),
    idempotency_key: clientKey,
  })
  .strict();

const pageQuery = z
  .object({
    cursor: z.coerce.number().int().min(1).max(9_007_199_254_740_991).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

const adminLedgerQuery = z
  .object({
    user_id: z.coerce.number().int().positive().max(2_147_483_647).optional(),
    actor_id: z.coerce.number().int().positive().max(2_147_483_647).optional(),
    cursor: z.coerce.number().int().min(1).max(9_007_199_254_740_991).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

/* ── the wallet ─────────────────────────────────────────────────────────────────────────────── */

/**
 * The balance.
 *
 * Scoped to the caller by construction: there is no wallet id in this product, so the query has
 * nothing to accept and nothing to check. A row always exists — `trg_user_opens_wallet` sees to
 * that — so a missing wallet is a bug, not a state, and 0 is the honest answer either way.
 */
router.get(
  '/coins/wallet',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const wallet = await db.get('SELECT balance_minor FROM coin_wallets WHERE user_id = ?', [
      req.user.id,
    ]);
    res.json({ balanceMinor: wallet?.balance_minor ?? 0 });
  }),
);

/**
 * The statement.
 *
 * THE PROJECTION IS A WHITELIST AND THAT IS A CONTROL, NOT A TIDINESS PREFERENCE. `actor_user_id`
 * is NEVER here. Two of the three candidate designs returned the acting admin's identity to every
 * user who had ever received a support credit — cross-user identity disclosure that neither party
 * granted, out of a table that cannot be edited afterwards.
 *
 * Cursor on id, not an offset: an offset over a table users insert into skips rows as it pages.
 */
router.get(
  '/coins/ledger',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const parsed = pageQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { cursor, limit = 25 } = parsed.data;

    const entries = await db.all(
      `SELECT l.id, l.amount_minor AS amountMinor, l.reason_key AS reasonKey,
              l.ref_type AS refType, l.ref_id AS refId, l.note, l.created_at AS createdAt,
              r.label AS reasonLabel
         FROM coin_ledger l
         JOIN coin_reasons r ON r.key = l.reason_key
        WHERE l.user_id = ? AND (? IS NULL OR l.id < ?)
        ORDER BY l.id DESC
        LIMIT ?`,
      [req.user.id, cursor ?? null, cursor ?? null, limit],
    );
    res.json({ entries, nextCursor: entries.length === limit ? entries.at(-1).id : null });
  }),
);

/* ── the store ──────────────────────────────────────────────────────────────────────────────── */

/**
 * What is for sale.
 *
 * The availability predicate is IDENTICAL to the one inside `purchaseStoreItemTx`, so the shop
 * cannot show something that cannot be bought. That is this project's recurring defect — two
 * things that must agree, drifting — applied to a list and a write.
 */
router.get(
  '/coins/store',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const items = await db.all(
      `SELECT i.id, i.sku, i.title, i.description, i.price_minor AS priceMinor,
              i.entitlement_key AS entitlementKey,
              CASE WHEN e.id IS NULL THEN 0 ELSE 1 END AS owned
         FROM coin_store_items i
         LEFT JOIN coin_entitlements e
                ON e.user_id = ? AND e.entitlement_key = i.entitlement_key
               AND e.revoked_at IS NULL
        WHERE i.active = 1 AND i.delisted_at IS NULL
        ORDER BY i.price_minor, i.id`,
      [req.user.id],
    );
    res.json({ items });
  }),
);

/**
 * Buy one.
 *
 * Every outcome the transaction can return is mapped, and the switch has a `default` that THROWS.
 * That is the difference between a 500 with a request id in the log and a new outcome silently
 * falling through to a 200 the day someone adds one.
 */
router.post(
  '/coins/store/:id/purchase',
  requireAuth,
  purchaseIpLimiter,
  purchaseAccountLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = purchaseBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);

    const r = await db.purchaseStoreItem({
      userId: req.user.id,
      itemId: p.data.id,
      expectedPriceMinor: parsed.data.expected_price_minor,
      idempotencyKey: parsed.data.idempotency_key,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    switch (r.outcome) {
      case 'applied':
        return res.json(r);
      // An unknown item, an inactive one and a delisted one are ONE answer, so the catalogue
      // cannot be enumerated by watching which ids answer differently.
      case 'missing':
        return sendError(res, 404, ERR.NOT_FOUND, 'not found');
      case 'price_changed':
        return res.status(409).json({
          error: 'the price changed',
          code: ERR.CONFLICT,
          requestId: res.locals.requestId,
          priceMinor: r.priceMinor,
        });
      case 'already_owned':
        return res.status(409).json({
          error: 'you already own this',
          code: ERR.CONFLICT,
          requestId: res.locals.requestId,
        });
      case 'insufficient':
        return res.status(409).json({
          error: 'not enough coins',
          code: ERR.CONFLICT,
          requestId: res.locals.requestId,
          balanceMinor: r.balanceMinor,
          priceMinor: r.priceMinor,
        });
      // The third case of the key trichotomy: same key, different intent. Never a second effect,
      // and never a silent success reporting somebody else's purchase.
      case 'key_reused':
        return res.status(409).json({
          error: 'that key was already used for a different purchase',
          code: ERR.CONFLICT,
          requestId: res.locals.requestId,
        });
      default:
        throw new Error(`purchaseStoreItemTx returned an unmapped outcome: ${r.outcome}`);
    }
  }),
);

/* ── entitlements and achievements ──────────────────────────────────────────────────────────── */

/** What the caller owns. UX for greying the theme picker; the schema triggers are the control. */
router.get(
  '/coins/entitlements',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const entitlements = await db.all(
      `SELECT id, entitlement_key AS entitlementKey, granted_at AS grantedAt
         FROM coin_entitlements
        WHERE user_id = ? AND revoked_at IS NULL
        ORDER BY id DESC`,
      [req.user.id],
    );
    res.json({ entitlements });
  }),
);

/**
 * The achievement catalogue with the caller's unlocks.
 *
 * TWO DIFFERENT REWARD NUMBERS, DELIBERATELY. `rewardMinor` is what the achievement pays NOW;
 * `paidMinor` is what this person's unlock actually paid, off the snapshot. A single number would
 * make the catalogue rewrite somebody's history the day a reward is retuned.
 *
 * THERE IS NO POST. An unlock is awarded by server-side evaluation, so there is no claim request
 * to forge — the endpoint that does not exist cannot be attacked.
 */
router.get(
  '/coins/achievements',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const achievements = await db.all(
      `SELECT a.key, a.title_key AS titleKey, a.category, a.reward_minor AS rewardMinor,
              a.sort_order AS sortOrder,
              ua.id AS unlockId, ua.unlocked_at AS unlockedAt,
              ua.reward_minor_snapshot AS paidMinor
         FROM achievements a
         LEFT JOIN user_achievements ua ON ua.achievement_key = a.key AND ua.user_id = ?
        WHERE a.active = 1
        ORDER BY a.sort_order, a.key`,
      [req.user.id],
    );
    res.json({ achievements });
  }),
);

/* ── the admin path ─────────────────────────────────────────────────────────────────────────── */


/**
 * Move a wallet by hand.
 *
 * The only endpoint in the product where a human chooses an amount, and therefore the most heavily
 * gated: two rate limiters, a JWT role check, a database role check, and then a THIRD role and
 * session-version check inside the transaction that is repeated in the guarded INSERT's own JOIN.
 *
 * `req.user.sv` is threaded in and compared UNCONDITIONALLY. A candidate design guarded that
 * comparison with `!= null`, which SKIPS IT ENTIRELY when the argument is absent — on the one
 * endpoint that creates currency from nothing, with the audit row still written.
 */
router.post(
  '/admin/users/:id/coins',
  requireAuth,
  requireRole('admin'),
  adminCoinIpLimiter,
  adminCoinAccountLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return undefined;

    const p = idParam.safeParse(req.params);
    const parsed = adminAdjustBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);

    const r = await db.adminAdjustCoins({
      actorUserId: req.user.id,
      actorSessionVersion: req.user.sv,
      targetUserId: p.data.id,
      amountMinor: parsed.data.amount_minor,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotency_key,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    switch (r.outcome) {
      case 'applied':
        return res.json(r);
      // THE ONE DELIBERATE 403 IN THE COIN SUBSYSTEM. It is a ROLE gate — the caller is not an
      // admin any more — and the rule this codebase follows is that a role gate is 403 while an
      // object-level miss is 404. A missing target below is still a 404.
      case 'forbidden':
        return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
      case 'missing':
        return sendError(res, 404, ERR.NOT_FOUND, 'not found');
      case 'out_of_bounds':
        return sendError(res, 400, ERR.VALIDATION, 'that amount is outside what one adjustment may move');
      case 'insufficient':
        return res.status(409).json({
          error: 'that would take the balance below zero',
          code: ERR.CONFLICT,
          requestId: res.locals.requestId,
          balanceMinor: r.balanceMinor,
        });
      case 'key_reused':
        return res.status(409).json({
          error: 'that key was already used for a different adjustment',
          code: ERR.CONFLICT,
          requestId: res.locals.requestId,
        });
      default:
        throw new Error(`adminAdjustCoinsTx returned an unmapped outcome: ${r.outcome}`);
    }
  }),
);

/**
 * The admin statement.
 *
 * THE ONLY PROJECTION IN THE PRODUCT PERMITTED TO INCLUDE `actor_user_id`. Read-only: there is no
 * admin route that edits or deletes a ledger row, and `trg_coin_ledger_immutable` means one could
 * not be written even if there were.
 */
router.get(
  '/admin/coins/ledger',
  requireAuth,
  requireRole('admin'),
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return undefined;

    const parsed = adminLedgerQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { user_id: userId, actor_id: actorId, cursor, limit = 25 } = parsed.data;

    const entries = await db.all(
      `SELECT l.id, l.user_id AS userId, l.amount_minor AS amountMinor,
              l.reason_key AS reasonKey, l.ref_type AS refType, l.ref_id AS refId,
              l.actor_user_id AS actorUserId, l.request_id AS requestId,
              l.note, l.created_at AS createdAt
         FROM coin_ledger l
        WHERE (? IS NULL OR l.user_id = ?)
          AND (? IS NULL OR l.actor_user_id = ?)
          AND (? IS NULL OR l.id < ?)
        ORDER BY l.id DESC
        LIMIT ?`,
      [userId ?? null, userId ?? null, actorId ?? null, actorId ?? null, cursor ?? null, cursor ?? null, limit],
    );
    res.json({ entries, nextCursor: entries.length === limit ? entries.at(-1).id : null });
  }),
);

/**
 * Reconciliation. Three queries that must all return zero rows.
 *
 * It is a PAGE and a SCRIPT (`scripts/verify-coins.mjs`), which is the difference between an audit
 * and a gate: a query that only runs when somebody opens a screen tells you about the moment they
 * opened it. This one runs in the phase gate too.
 */
router.get(
  '/admin/coins/audit',
  requireAuth,
  requireRole('admin'),
  readLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return undefined;

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
        LIMIT 50`,
    );

    // 2. Money and receipts must be one-to-one in both directions.
    const unpaidPurchases = await db.all(
      `SELECT p.id AS purchaseId, p.user_id AS userId
         FROM coin_purchases p
        WHERE NOT EXISTS (SELECT 1 FROM coin_ledger l
                           WHERE l.reason_key = 'store.purchase'
                             AND l.ref_type = 'coin_purchase' AND l.ref_id = p.id)
        LIMIT 50`,
    );
    const orphanDebits = await db.all(
      `SELECT l.id AS entryId, l.user_id AS userId
         FROM coin_ledger l
        WHERE l.reason_key = 'store.purchase'
          AND NOT EXISTS (SELECT 1 FROM coin_purchases p WHERE p.id = l.ref_id)
        LIMIT 50`,
    );

    // 3. Nobody owns anything nobody paid for.
    const unbackedEntitlements = await db.all(
      `SELECT e.id AS entitlementId, e.user_id AS userId
         FROM coin_entitlements e
        WHERE e.revoked_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM coin_purchases p
                           WHERE p.id = e.purchase_id AND p.user_id = e.user_id)
        LIMIT 50`,
    );

    const clean =
      drifting.length === 0 &&
      unpaidPurchases.length === 0 &&
      orphanDebits.length === 0 &&
      unbackedEntitlements.length === 0;

    res.json({ clean, drifting, unpaidPurchases, orphanDebits, unbackedEntitlements });
  }),
);

export default router;
