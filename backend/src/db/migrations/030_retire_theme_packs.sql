-- 030_retire_theme_packs.sql — the two premium theme packs (Aurora, Ember) leave the store for good.
-- Applies on top of user_version 29.
--
-- ═══ WHY ═══════════════════════════════════════════════════════════════════════════════════════
--
-- The Pulse redesign has ONE look; a theme pack changes nothing any screen draws, so selling one
-- is selling nothing. The owner's ruling (2026-10-17, Phase 0): delist both packs on the server,
-- with NO compensation — the only buyers are dev / test accounts. Until now the client merely
-- hid them, which is a display filter, not a control: a forged request still bought one.
--
-- ═══ WHAT CHANGES, AND HOW 019 ALREADY ALLOWS IT ═══════════════════════════════════════════════
--
--   1. The two store items are DELISTED — `active = 0` and `delisted_at` stamped. 019 freezes what
--      an item IS (id, sku, entitlement_key, created_at: trg_coin_store_item_frozen) and lets
--      whether it is on sale move, so this is the retirement path the schema was built for. Both
--      readers of the catalogue — GET /coins/store and purchaseStoreItemTx — use the same
--      predicate (`active = 1 AND delisted_at IS NULL`), and trg_coin_purchase_truthful compares
--      the receipt against that same live row: from here on a purchase is a 404 at the route and
--      an ABORT at the schema, for every caller.
--   2. The two premium THEME PACKS are retired — `theme_packs.active = 0` (019 freezes only key and
--      entitlement_key: trg_theme_pack_frozen). The free five are untouched.
--   3. A retired pack can never be put back on sale by accident: the triggers below refuse to
--      relist an item that grants a retired pack's entitlement, and refuse a NEW live item that
--      grants one (019's partial unique index releases the entitlement string the moment the old
--      item is delisted, so without this an INSERT would quietly re-open the sale).
--
-- ═══ WHAT DOES NOT CHANGE — HISTORY IS HISTORY ═════════════════════════════════════════════════
--
-- Nothing is deleted and no money moves. coin_purchases, coin_ledger and audit_log are immutable
-- by design (019) and stay byte-identical: a past purchase is still on the buyer's statement with
-- the coins it cost. coin_entitlements are NOT revoked — revoking would fire
-- trg_theme_revoked_resets_pack and rewrite user data for a product decision; an entitlement to a
-- retired pack is a record of what was bought. user_theme_prefs is not touched either: no client
-- reads it any more, and a stored 'aurora' only means the pack cannot be chosen again.
--
-- No compensation (owner ruling): there is no refund ledger row, so no reason key is added.
--
-- The runner executes this file inside ONE immediate transaction (worker.js migrate), so either
-- every statement below lands or none does. Each UPDATE is guarded so it is a no-op on a database
-- where the row is already retired.

UPDATE coin_store_items
   SET active = 0,
       delisted_at = unixepoch()
 WHERE sku IN ('theme.aurora', 'theme.ember')
   AND delisted_at IS NULL;

-- A delisted item that is still `active = 1` would be a second, contradictory signal; make both
-- columns say the same thing even if one of them was set by hand earlier.
UPDATE coin_store_items
   SET active = 0
 WHERE sku IN ('theme.aurora', 'theme.ember')
   AND active = 1;

UPDATE theme_packs
   SET active = 0
 WHERE key IN ('aurora', 'ember')
   AND active = 1;

-- ── THE SALE STAYS CLOSED ─────────────────────────────────────────────────────────────────────
--
-- Keyed on the DATA (any pack that is retired and has a price), not on two hard-coded strings, so
-- a pack retired later is covered by the same rule. The messages carry no table.column token, so
-- they read as sentences wherever they surface.

CREATE TRIGGER IF NOT EXISTS trg_coin_store_item_retired_ins
BEFORE INSERT ON coin_store_items FOR EACH ROW
WHEN NEW.active = 1 AND NEW.delisted_at IS NULL
 AND EXISTS (SELECT 1 FROM theme_packs t
              WHERE t.entitlement_key = NEW.entitlement_key AND t.active = 0)
BEGIN
  SELECT RAISE(ABORT, 'this theme is retired and cannot be sold again');
END;

CREATE TRIGGER IF NOT EXISTS trg_coin_store_item_retired_upd
BEFORE UPDATE OF active, delisted_at ON coin_store_items FOR EACH ROW
WHEN NEW.active = 1 AND NEW.delisted_at IS NULL
 AND EXISTS (SELECT 1 FROM theme_packs t
              WHERE t.entitlement_key = NEW.entitlement_key AND t.active = 0)
BEGIN
  SELECT RAISE(ABORT, 'this theme is retired and cannot be sold again');
END;

-- Retirement of a priced pack is one-way, for the same reason: re-activating Aurora would make
-- every old entitlement wearable again without anybody deciding to sell it.
CREATE TRIGGER IF NOT EXISTS trg_theme_pack_retired_stays
BEFORE UPDATE OF active ON theme_packs FOR EACH ROW
WHEN OLD.active = 0 AND NEW.active = 1 AND OLD.entitlement_key IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'this theme is retired and cannot be sold again');
END;

PRAGMA user_version = 30;
