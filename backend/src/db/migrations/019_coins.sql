-- 019_coins.sql — the coin economy: the ledger, the wallet, the app store, achievements and the
-- audited admin adjustment. Applies on top of user_version 18.
--
-- ═══ WHAT IS DELIBERATELY NOT IN THIS FILE ═════════════════════════════════════════════════════
--
-- THE COACH MARKETPLACE AND THE COMMISSION SPLIT ARE NOT HERE. They are migration 019.
--
-- Three designs were written and five adversarial passes attacked all three. Thirteen of the
-- twenty-one fatal-and-severe findings sat in the marketplace, including the only FATAL one: a
-- purchased template was granted with `source_plan_id` pointing at the SELLER's plan, which
-- `trg_plan_source_owned_ins` (010:1256-1266) aborts on every single purchase, for every buyer,
-- with a message the client sanitiser replaces with 'this change is not allowed by the data
-- model'. The rest of that cluster: one purchase turned any coach into a reseller of another
-- coach's programme; a demoted or banned coach kept selling and kept being paid; the seller's
-- login email was rendered to every buyer and could not be scrubbed afterwards; the commission
-- on every receipt and every immutable audit row read zero while the ledger moved the real
-- amount; the four-level plan copy ran to hundreds of statements inside the money transaction
-- under SQLite's single write lock; and the commission itself sat in STORED GENERATED columns,
-- which SQLite cannot ALTER, on the only table that would ever record what the app had earned.
--
-- Migration 013 was saved by exactly this exercise and the lesson recorded afterwards was that
-- the useful signal is not any single defect, it is WHERE THEY CLUSTER. They clustered here.
-- Deleting the feature deletes thirteen defects without writing one fix. ADD COLUMN is legal in
-- SQLite; a wrong CHECK is not removable; and a marketplace built on a ledger that has been in
-- production for a month is a better marketplace than one built on the same day as the ledger.
--
-- Also absent, each removing a named defect rather than deferring one:
--   * no `frozen_at` on the wallet — a freeze predicate on a CREDIT statement silently ate an
--     achievement reward, permanently, and returned 200 with the reward it had not paid.
--   * no lifetime earned/spent counters — a second and third derived copy of the same rows,
--     one of them an increment, which 010 calls the replay-unsafe shape.
--   * no `balance_after_minor` chain — see THE BALANCE below.
--   * no config table — the only policy number left is `coin_reasons.max_minor`, and it is
--     enforced at BOTH ends, so an item priced beyond what a purchase may move is unstorable
--     rather than merely unbuyable.
--   * no item `kind` column and no kinds table — an item grants ONE string.
--
-- ═══ THE MONEY TYPE ════════════════════════════════════════════════════════════════════════════
--
-- ONE COIN = 100 MINOR UNITS. Every amount is an INTEGER named `*_minor`, and every amount column
-- carries `CHECK (typeof(col) = 'integer' AND ...)`. The typeof() half is not decoration: SQLite
-- is dynamically typed and a bare INTEGER column stores 1.5 and '10' without complaint, so
-- typeof() is the ONLY thing that closes the float hole the owner's rules forbid in the money
-- path. This is 015's integer convention (grams_x10, protein_mg), not 010's REAL one.
--
-- ═══ THE BALANCE, AND WHY THERE IS EXACTLY ONE OF IT ═══════════════════════════════════════════
--
-- This project's recurring defect is two things that must agree, drifting apart. The balance is
-- the obvious candidate, so it gets 010's full stored-aggregate contract and nothing else:
--
--   RECOMPUTE  — trg_coin_wallet_recompute writes `balance_minor = (SELECT SUM(amount_minor))`.
--                Never `balance + ?`. worker.js:232 records why: `SET x = x + ?` is what a
--                replay double-counts.
--   TRUTHFUL   — trg_coin_wallet_truthful refuses ANY other value from ANY writer: a route, a
--                repair script, a console session. This is trg_log_rollup_truthful (010:1399)
--                applied to money, and it is what makes drift impossible rather than unlikely.
--
-- A running `balance_after_minor` on each ledger row was designed and REJECTED. It is a second
-- representation: the debit guard would read the chain tail while the truthfulness trigger reads
-- the SUM, and after one hand-deleted row there is NO value that satisfies both triggers — the
-- account can never earn or spend again, and the repair is blocked by the same trigger. Recompute
-- has an exit. A stray DELETE leaves the wallet high until the next movement, which recomputes to
-- the true (lower) SUM and passes; the divergence is caught meanwhile by scripts/verify-coins.mjs.
-- Loud and recoverable beats elegant and bricked.
--
-- Deliberately NO `AFTER DELETE ON coin_ledger` recompute, and this one is subtle. It would fire
-- once per row during a user's ON DELETE CASCADE — O(n) SUMs, each re-validated by the
-- truthfulness trigger — and, worse, the cascade deletes rows in rowid order, so a user whose
-- +1000 credit is deleted before their -250 debit would momentarily recompute to -250 and abort
-- account deletion outright if non-negativity were checked there. It is checked on the LEDGER
-- INSERT instead (see trg_coin_ledger_never_negative), which no delete can reach.
--
-- ═══ WHAT IS NOT A CHECK, AND WHY ══════════════════════════════════════════════════════════════
--
-- SQLite cannot ALTER a CHECK. 013 caught that before shipping, 017 wrote it down, and every
-- attack pass flagged a CHECK that would need a 12-step rebuild of a table full of financial
-- history. So:
--
--   * `balance_minor >= 0`      → trg_coin_ledger_never_negative, a TRIGGER. A clawback or debt
--                                 policy is then a DROP TRIGGER, not a rebuild of the wallet.
--   * per-movement magnitude    → coin_reasons.max_minor, a COLUMN. An UPDATE, not a migration.
--   * the store price ceiling   → the same number, enforced by trigger at item-write time, so an
--                                 unbuyable item cannot be created.
--   * no upper bound anywhere on a wallet or a ledger amount. Two designs put one in a CHECK; a
--     seller near the ceiling then made a BUYER's unrelated purchase fail with a generic 400.
--
-- The CHECKs that DO appear are the ones that are mathematically closed and will never change:
-- `typeof(x) = 'integer'`, `sign IN (-1, 1)`, `flag IN (0, 1)`, `amount_minor <> 0` (a zero
-- movement is not an event), length bounds, and format GLOBs.
--
-- ═══ IDEMPOTENCY: ONE NAMESPACE, COMPOSED BY THE SERVER ════════════════════════════════════════
--
-- The house mechanism is `write_uid` (010:1135) — REQUEST IDENTITY minted per attempt, living in
-- the guard's own uniqueness constraint. There is no `idempotency_keys` table (010:43 refuses
-- one) and no stored response bodies. Two things were found wrong with every candidate:
--
--   1. The probe read one table while the constraint that fires lives in another, so cross-
--      endpoint key reuse degraded to an unexplained 400 that no retry can clear — or, in the
--      admin path, to a FALSE 200: a clawback that reported success, moved nothing, and wrote no
--      audit row, because the probe matched the victim's own purchase debit.
--   2. Server-minted keys ('ach-0000000123') used only characters the client regex allows, so a
--      user could occupy a key the server would later need and permanently brick their own payout.
--
-- Both die the same way: THE STORED KEY IS COMPOSED BY THE SERVER as `<scope>:<actor>:<client>`
-- (`buy:41:aB3-x9Qm`, `adj:1:ticket-4711`) and server-originated movements use `ach:<id>`. ':' is
-- excluded by every route's zod regex, so the two key spaces are provably disjoint; the scope
-- makes cross-endpoint reuse two INDEPENDENT operations instead of a collision; and the actor
-- means a user cannot squat the key an admin console will derive for them. Composed length is
-- bounded here at 96 to leave room for the prefix over the client's 8..64.
--
-- ═══ AND WHAT THE 5 ATTACK PASSES CONFIRMED IS ALREADY SOUND, kept verbatim ════════════════════
--
--   * No API field anywhere carries an amount, a price or a balance. There is no wallet id in the
--     product, so there is none to forge.
--   * There is no quantity, anywhere, which deletes the whole overflow class by construction.
--   * The debit guard is inside the INSERT's own WHERE, under tx.immediate(), which takes the
--     single write lock at BEGIN — so a pre-read is not a TOCTOU (worker.js:236-239).
--   * There is no client-callable achievement claim route. The strongest anti-mint control in
--     this subsystem is the endpoint that does not exist.


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. audit_log — one latent bug repaired BEFORE anything starts writing coin rows to it.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- The append-only carve-out that makes erasure possible SHIPPED SEPARATELY, as migration 018.
-- It repairs a bug that is live today — an FK action is an UPDATE, so `audit_log_no_update`
-- aborted the ON DELETE SET NULL and made any audited user undeletable — and that had no business
-- waiting for a coin economy. It was measured, repaired and proven before this file was written.
--
-- What stays here is the part that is genuinely coin work: making "every coin event names an
-- actor and a request" a database fact rather than a convention.

-- "Every coin event is audited with an actor and a request id" is, today, a convention held by
-- six hand-written call sites — and one of them is ALREADY broken: chat/routes.js:341 reads
-- `req.id`, which no middleware ever sets, so those rows land with request_id NULL. A convention
-- that is already violated is not a guarantee. This makes it one, for coin actions only, without
-- rebuilding an append-only table to add a NOT NULL.
--
-- An ACTOR is demanded only for `coin.admin.*`. Design 2 demanded one for every coin row, which
-- aborts the achievement payout — its actor is legitimately NULL, because the system paid it and
-- 001:71 already established NULL as "the system itself".
--
-- GLOB, not LIKE: LIKE is case-insensitive for ASCII and '_' is a LIKE wildcard.
CREATE TRIGGER IF NOT EXISTS trg_audit_log_coin_complete
BEFORE INSERT ON audit_log FOR EACH ROW
WHEN NEW.action GLOB 'coin.*'
 AND (NEW.request_id IS NULL
   OR NEW.target_type IS NULL
   OR (NEW.action GLOB 'coin.admin.*' AND NEW.actor_id IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'a coin event must record who did it and which request it came from');
END;

CREATE INDEX IF NOT EXISTS audit_log_coin_idx
  ON audit_log (created_at DESC, id DESC) WHERE action GLOB 'coin.*';


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. THE REASON VOCABULARY. A movement must prove itself against one of these rows.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- A reason is not a label. It decides which DIRECTION a movement may go, how large it may be, and
-- what kind of object it must point at. That is what makes "spend a negative amount to mint" and
-- "pay an achievement nine million" UNREPRESENTABLE rather than merely guarded — and it is data,
-- so adding `purchase.refund` or `marketplace.sale` later is an INSERT, not a migration.
--
-- `sign` is a CHECK on purpose: a direction has exactly two states and always will. Two admin
-- reasons rather than one signed reason, so `sign` stays absolute and an audit read never has to
-- look at the amount to know which way it went.
CREATE TABLE IF NOT EXISTS coin_reasons (
  key       TEXT PRIMARY KEY CHECK (key GLOB '[a-z][a-z0-9._]*' AND length(key) BETWEEN 3 AND 40),
  sign      INTEGER NOT NULL CHECK (sign IN (-1, 1)),
  -- The ONLY ref_type an entry with this reason may carry. NULL means it carries none, and NULL
  -- is also what keeps admin adjustments out of the natural-key uniqueness below — repeated
  -- adjustments are legitimate and are guarded by the idempotency key alone.
  ref_type  TEXT CHECK (ref_type IS NULL OR length(ref_type) BETWEEN 1 AND 40),
  -- THE PER-MOVEMENT CEILING, as data. It is also the store's price ceiling (see
  -- trg_coin_store_item_affordable), so an item that could never be paid for cannot be created.
  max_minor INTEGER NOT NULL
            CHECK (typeof(max_minor) = 'integer' AND max_minor >= 1),
  active    INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  label     TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80)
) WITHOUT ROWID;

INSERT OR IGNORE INTO coin_reasons (key, sign, ref_type, max_minor, label) VALUES
  ('achievement.reward',  1, 'user_achievement',  100000,   'Achievement reward'),
  ('store.purchase',     -1, 'coin_purchase',     10000000, 'Store purchase'),
  ('admin.credit',        1, NULL,                1000000,  'Administrative credit'),
  ('admin.debit',        -1, NULL,                1000000,  'Administrative debit');


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. THE WALLET — a cached balance that is not allowed to lie.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Keyed on user_id, and that is an anti-IDOR decision before it is a normalisation one: there is
-- no wallet id, so there is no wallet id to forge, so no endpoint can accept one.
--
-- It exists for READS. The recompute pays a SUM on every write either way, so the wallet saves
-- nothing there; what it saves is that GET /coins/wallet — hit on every app open — is a primary
-- key lookup instead of an aggregate. That is the whole justification and it is honest.
CREATE TABLE IF NOT EXISTS coin_wallets (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- No range CHECK, deliberately. The floor is a droppable trigger and there is no ceiling at all
  -- (SQLite integers are 64-bit; a ceiling in a CHECK made one user's balance break another
  -- user's transaction in two of the three candidate designs).
  balance_minor INTEGER NOT NULL DEFAULT 0 CHECK (typeof(balance_minor) = 'integer'),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Every account has a wallet, so "the wallet might not exist" is never a state code has to model.
CREATE TRIGGER IF NOT EXISTS trg_user_opens_wallet
AFTER INSERT ON users FOR EACH ROW
BEGIN
  INSERT OR IGNORE INTO coin_wallets (user_id) VALUES (NEW.id);
END;

INSERT OR IGNORE INTO coin_wallets (user_id) SELECT id FROM users;

-- A wallet opens empty. Otherwise "create the wallet" is a mint.
CREATE TRIGGER IF NOT EXISTS trg_coin_wallet_opens_empty
BEFORE INSERT ON coin_wallets FOR EACH ROW
WHEN NEW.balance_minor <> 0
BEGIN
  SELECT RAISE(ABORT, 'a wallet opens empty');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. THE LEDGER — the only thing in this schema that may move a balance.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Append-only. An achievement reward, a store purchase and an admin adjustment are the same
-- INSERT with a different reason, so T5.3.2's "no side channel" is a property of the schema
-- rather than a rule anyone has to remember.
--
-- NO `actor_email_snapshot`, and that is a repair rather than an omission. Two designs wrote the
-- ADMIN's email onto the TARGET's ledger row (and the BUYER's onto the SELLER's), which the
-- user's own paginated history then returns — cross-user identity disclosure neither party
-- granted, unerasable afterwards because the immutability trigger froze it. The actor is an id
-- here and a row in audit_log there; erasure nulls both, which is what erasure means.
CREATE TABLE IF NOT EXISTS coin_ledger (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Signed, never zero, integer. The magnitude bound lives in coin_reasons.max_minor so it can
  -- be raised with an UPDATE; only the structural facts are here.
  amount_minor INTEGER NOT NULL
               CHECK (typeof(amount_minor) = 'integer' AND amount_minor <> 0),

  reason_key   TEXT NOT NULL REFERENCES coin_reasons(key) ON DELETE RESTRICT,

  -- Polymorphic and deliberately WITHOUT an FK, like audit_log.target_type/target_id: a money
  -- record must outlive the thing it paid for. Which pairing is legal is decided by the reason.
  ref_type     TEXT CHECK (ref_type IS NULL OR length(ref_type) BETWEEN 1 AND 40),
  ref_id       INTEGER CHECK (ref_id IS NULL OR (typeof(ref_id) = 'integer' AND ref_id > 0)),

  -- REQUEST IDENTITY, COMPOSED BY THE SERVER as `<scope>:<actor>:<client key>` — see the header.
  -- The client's part is bounded 8..64 by the same `^[A-Za-z0-9_-]{8,64}$` regex every route
  -- uses, so a malformed key is a 400 at the edge and never a constraint abort three layers down;
  -- 96 here leaves room for the prefix. ':' is permitted by this CHECK and forbidden by the route
  -- regex — that asymmetry IS the namespace separation.
  idempotency_key TEXT NOT NULL
               CHECK (length(idempotency_key) BETWEEN 8 AND 96
                      AND idempotency_key NOT GLOB '*[^A-Za-z0-9_:-]*'),

  -- Who caused it. NULL = the system (an achievement paying out). SET NULL so a GDPR erasure of
  -- an admin cannot destroy the money record; the immutability trigger carries the matching
  -- carve-out (014:96 idiom) or that same erasure would abort.
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

  -- res.locals.requestId, threaded in as an argument because the worker has no request context.
  -- NOT NULL so "every coin event carries a request id" is a fact and not a habit.
  request_id   TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 64),
  note         TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 280),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- LAYER 1 — THE REPLAY GUARANTEE. One composed key can produce at most one movement on a wallet,
-- ever. Even if every guard above it were defeated, a second effect is not merely unlikely, it is
-- unstorable.
CREATE UNIQUE INDEX IF NOT EXISTS coin_ledger_idem_uidx
  ON coin_ledger (user_id, idempotency_key);

-- LAYER 2 — THE NATURAL KEY, which catches what a FRESH key would slip past: at most one entry
-- per (reason, thing). One debit per purchase row, one reward per unlock row. This is
-- workout_pr_events_source_unique (010:1509-1515) doing exactly the job its own comment predicted
-- it would do for coins — one constraint, both requirements, no second mechanism invented here.
CREATE UNIQUE INDEX IF NOT EXISTS coin_ledger_ref_uidx
  ON coin_ledger (reason_key, ref_type, ref_id) WHERE ref_id IS NOT NULL;

-- COVERING, for the recompute and the truthfulness check — the two hottest reads in the
-- subsystem. Without it each is an index range scan plus a table row fetch per entry; Design 1
-- shipped the SUM and forgot the index.
CREATE INDEX IF NOT EXISTS coin_ledger_sum_idx ON coin_ledger (user_id, amount_minor);
-- The statement list, cursor-paginated on id.
CREATE INDEX IF NOT EXISTS coin_ledger_user_idx ON coin_ledger (user_id, id DESC);
-- "What has this admin been doing to people's wallets?"
CREATE INDEX IF NOT EXISTS coin_ledger_actor_idx
  ON coin_ledger (actor_user_id, id DESC) WHERE actor_user_id IS NOT NULL;

-- A ledger row for an account with no wallet is money that exists in history and nowhere else.
CREATE TRIGGER IF NOT EXISTS trg_coin_ledger_needs_wallet
BEFORE INSERT ON coin_ledger FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM coin_wallets w WHERE w.user_id = NEW.user_id)
BEGIN
  SELECT RAISE(ABORT, 'there is no wallet for this account');
END;

-- ═══ THE SHAPE GUARD — four attacks, one trigger ═══════════════════════════════════════════════
-- The entry must name a LIVE reason; its sign must match that reason's direction; its magnitude
-- must be within that reason's cap; and its ref_type must be exactly the one the reason declares,
-- with a ref_id present precisely when the reason declares one. `IS` rather than `=` on ref_type
-- so the NULL case compares instead of evaluating to NULL.
CREATE TRIGGER IF NOT EXISTS trg_coin_ledger_reason_shape
BEFORE INSERT ON coin_ledger FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM coin_reasons r
   WHERE r.key = NEW.reason_key
     AND r.active = 1
     AND ((r.sign = 1 AND NEW.amount_minor > 0) OR (r.sign = -1 AND NEW.amount_minor < 0))
     AND abs(NEW.amount_minor) <= r.max_minor
     AND NEW.ref_type IS r.ref_type
     AND ((r.ref_type IS NULL AND NEW.ref_id IS NULL)
       OR (r.ref_type IS NOT NULL AND NEW.ref_id IS NOT NULL)))
BEGIN
  SELECT RAISE(ABORT, 'this movement contradicts the reason it claims');
END;

-- ═══ THE MOVEMENT MUST MATCH THE THING IT PAYS FOR ═════════════════════════════════════════════
-- A debit must equal its purchase's snapshotted price and land on the buyer; a reward must equal
-- its unlock's snapshot and land on the earner. Per-reason, and therefore a TRIGGER rather than a
-- CHECK: adding `purchase.refund` next quarter is a DROP/CREATE here, not a rebuild of the money
-- table. Created after the tables it names — SQLite resolves trigger bodies at run time, but
-- readable order is worth more than the licence.
--
-- (Defined below coin_purchases and user_achievements — see section 9.)

-- ═══ NON-NEGATIVITY, AS A DROPPABLE TRIGGER, ON THE INSERT ═════════════════════════════════════
-- A TRIGGER and not a CHECK: two designs put `balance >= 0` in a CHECK on coin_wallets, which
-- welds "coins are earn-only" into the money table forever — the day a clawback or a debt row is
-- wanted it becomes a 12-step rebuild. Here it is a DROP TRIGGER.
--
-- On the LEDGER INSERT and not on the wallet UPDATE, and that placement is load-bearing: on the
-- wallet it would also fire from a recompute driven by an ON DELETE CASCADE, and because the
-- cascade removes rows in rowid order a user whose credit is deleted before their debit would
-- momentarily recompute negative and ABORT THEIR OWN ACCOUNT DELETION. Here no delete can reach it.
--
-- It reads the CACHED balance, not a SUM, so it is free — sound because the two triggers below
-- make the cache provably equal to the SUM.
--
-- This is a BACKSTOP. The real guard is `WHERE w.balance_minor >= i.price_minor` inside the
-- purchase INSERT, which returns a distinguishable 409; a trigger abort would reach the client as
-- 400 validation_error via lib/http.js:119-124. The message carries no snake_case token and no
-- table.column pair, so if it ever does fire the sanitiser forwards it verbatim (lib/http.js:104).
CREATE TRIGGER IF NOT EXISTS trg_coin_ledger_never_negative
BEFORE INSERT ON coin_ledger FOR EACH ROW
WHEN (SELECT w.balance_minor FROM coin_wallets w WHERE w.user_id = NEW.user_id)
     + NEW.amount_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'you do not have enough coins');
END;

-- ═══ THE ONLY WAY A BALANCE MOVES ══════════════════════════════════════════════════════════════
-- RECOMPUTE, never increment. Absorbing rather than additive, so even a defeated idempotency
-- layer could only produce a second ROW (which the two unique indexes forbid), never a wrong
-- number. Safe from recursion because PRAGMA recursive_triggers is OFF — the pragma this
-- connection never sets, and the same reason 010's rollup triggers work (010:1352).
CREATE TRIGGER IF NOT EXISTS trg_coin_wallet_recompute
AFTER INSERT ON coin_ledger FOR EACH ROW
BEGIN
  UPDATE coin_wallets
     SET balance_minor = (SELECT COALESCE(SUM(l.amount_minor), 0)
                            FROM coin_ledger l WHERE l.user_id = NEW.user_id),
         updated_at = unixepoch()
   WHERE user_id = NEW.user_id;
END;

-- ═══ AND THE BALANCE MAY NOT LIE ═══════════════════════════════════════════════════════════════
-- 010's trg_log_rollup_truthful, applied to money. It does not care who is writing or why; it
-- refuses any value that is not the sum of the rows. The recompute above always writes exactly
-- this value, so it passes; every other writer fails.
--
-- SCOPED WITH `OF`, and that matters: an unscoped BEFORE UPDATE fires on every column, including
-- one an FK action writes, which is how a truthfulness trigger turns into an aborted account
-- deletion. coin_wallets has no such column today; the OF clause means it never can.
--
-- The message names a table.column pair on purpose, so lib/http.js suppresses it to the generic
-- 400: this can only fire on a code bug and there is nothing here to tell a client.
CREATE TRIGGER IF NOT EXISTS trg_coin_wallet_truthful
BEFORE UPDATE OF balance_minor ON coin_wallets FOR EACH ROW
WHEN NEW.balance_minor IS NOT (SELECT COALESCE(SUM(l.amount_minor), 0)
                                 FROM coin_ledger l WHERE l.user_id = NEW.user_id)
BEGIN
  SELECT RAISE(ABORT, 'coin_wallets.balance_minor is derived: only the ledger may move it');
END;

-- Append-only, with 014's carve-out for the one UPDATE an FK action performs. A BEFORE DELETE
-- trigger is DELIBERATELY ABSENT for the reason 010:1534-1537 records and audit_log fell into
-- above: it would abort the ON DELETE CASCADE from users and make account deletion impossible.
-- Immutability here is enforced against UPDATE, and against DELETE only by detection.
CREATE TRIGGER IF NOT EXISTS trg_coin_ledger_immutable
BEFORE UPDATE ON coin_ledger FOR EACH ROW
WHEN NOT (OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
      AND NEW.id              IS OLD.id
      AND NEW.user_id         IS OLD.user_id
      AND NEW.amount_minor    IS OLD.amount_minor
      AND NEW.reason_key      IS OLD.reason_key
      AND NEW.ref_type        IS OLD.ref_type
      AND NEW.ref_id          IS OLD.ref_id
      AND NEW.idempotency_key IS OLD.idempotency_key
      AND NEW.request_id      IS OLD.request_id
      AND NEW.note            IS OLD.note
      AND NEW.created_at      IS OLD.created_at)
BEGIN
  SELECT RAISE(ABORT, 'a coin movement is history and cannot be rewritten');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. THE STORE — app-owned only. No seller, no commission, no listings.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- An item grants exactly ONE bounded string, `entitlement_key`. There is no `kind` column, no
-- kinds table and no `theme_pack_key`: a theme pack that costs money NAMES the entitlement it
-- requires (see theme_packs below), so "which item sells this pack" is a join on one string
-- rather than a second copy of the relationship. Selling a badge in a later phase is an INSERT
-- here plus a row wherever badges live — no shape rule, therefore no shape trigger to get wrong.
--
-- Price floor of 1 and no ceiling in the CHECK. A price of 0 was storable in one candidate design
-- and produced an item that could be listed, rendered and never bought: the receipt wrote, and
-- then the debit died on `amount_minor <> 0` with a generic 400, forever, with nothing telling
-- anyone why. The ceiling is enforced against coin_reasons instead (below) so it stays alterable.
CREATE TABLE IF NOT EXISTS coin_store_items (
  id          INTEGER PRIMARY KEY,
  sku         TEXT NOT NULL
              CHECK (sku GLOB '[a-z][a-z0-9._-]*' AND length(sku) BETWEEN 3 AND 64),
  title       TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),

  -- THE ONLY PRICE THERE IS. No request ever carries one; the purchase statement reads it here.
  price_minor INTEGER NOT NULL
              CHECK (typeof(price_minor) = 'integer' AND price_minor >= 1),

  -- WHAT OWNING IT MEANS. 'theme.aurora'. This is the string the entitlement is keyed on.
  entitlement_key TEXT NOT NULL
              CHECK (entitlement_key GLOB '[a-z][a-z0-9._-]*' AND length(entitlement_key) BETWEEN 3 AND 64),

  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  delisted_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS coin_store_items_sku_uidx ON coin_store_items (sku);
-- Two LIVE items granting the same thing is an ambiguity, not a feature.
CREATE UNIQUE INDEX IF NOT EXISTS coin_store_items_entitlement_uidx
  ON coin_store_items (entitlement_key) WHERE delisted_at IS NULL;
CREATE INDEX IF NOT EXISTS coin_store_items_browse_idx
  ON coin_store_items (price_minor, id) WHERE active = 1 AND delisted_at IS NULL;

-- AN ITEM MAY NOT COST MORE THAN A PURCHASE MAY MOVE. One number, `coin_reasons.max_minor` for
-- 'store.purchase', enforced at BOTH ends — so the "priced beyond the cap, therefore permanently
-- unbuyable with an unexplainable 400" state cannot be created. Both directions, because a typo
-- is as likely in an edit as in a create (017:117's reasoning).
CREATE TRIGGER IF NOT EXISTS trg_coin_store_item_affordable_ins
BEFORE INSERT ON coin_store_items FOR EACH ROW
WHEN NEW.price_minor > (SELECT r.max_minor FROM coin_reasons r WHERE r.key = 'store.purchase')
BEGIN
  SELECT RAISE(ABORT, 'that price is higher than a single purchase is allowed to move');
END;

CREATE TRIGGER IF NOT EXISTS trg_coin_store_item_affordable_upd
BEFORE UPDATE OF price_minor ON coin_store_items FOR EACH ROW
WHEN NEW.price_minor > (SELECT r.max_minor FROM coin_reasons r WHERE r.key = 'store.purchase')
BEGIN
  SELECT RAISE(ABORT, 'that price is higher than a single purchase is allowed to move');
END;

-- What an item IS cannot change; what it costs and whether it is on sale can. Repricing is fine;
-- an item that quietly becomes a different product is not, because live entitlements point at
-- the string it grants.
CREATE TRIGGER IF NOT EXISTS trg_coin_store_item_frozen
BEFORE UPDATE ON coin_store_items FOR EACH ROW
WHEN NEW.id IS NOT OLD.id
  OR NEW.sku IS NOT OLD.sku
  OR NEW.entitlement_key IS NOT OLD.entitlement_key
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'an item cannot change what it is: delist it and add another');
END;

CREATE TRIGGER IF NOT EXISTS trg_coin_store_item_touch
AFTER UPDATE ON coin_store_items FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE coin_store_items SET updated_at = unixepoch() WHERE id = OLD.id;
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. PURCHASES — the receipt. Everything on it is a snapshot.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- The LEDGER points at the purchase (`ref_type = 'coin_purchase'`), never the reverse. One
-- direction, so there is no pair of pointers that could disagree, and `coin_ledger_ref_uidx`
-- makes "one debit per purchase row" a database fact.
--
-- item_id is ON DELETE RESTRICT and items are never deleted — only delisted. RESTRICT here cannot
-- block account deletion, because users is not this column's parent.
CREATE TABLE IF NOT EXISTS coin_purchases (
  id                    INTEGER PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id               INTEGER NOT NULL REFERENCES coin_store_items(id) ON DELETE RESTRICT,

  -- SNAPSHOTS. A receipt that changes when an admin reprices the catalogue is not a receipt.
  sku_snapshot          TEXT NOT NULL CHECK (length(sku_snapshot) BETWEEN 3 AND 64),
  title_snapshot        TEXT NOT NULL CHECK (length(trim(title_snapshot)) BETWEEN 1 AND 120),
  entitlement_key       TEXT NOT NULL CHECK (length(entitlement_key) BETWEEN 3 AND 64),
  price_minor_snapshot  INTEGER NOT NULL
                        CHECK (typeof(price_minor_snapshot) = 'integer' AND price_minor_snapshot >= 1),

  request_id            TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 64),
  created_at            INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS coin_purchases_user_idx ON coin_purchases (user_id, id DESC);
CREATE INDEX IF NOT EXISTS coin_purchases_item_idx ON coin_purchases (item_id, id DESC);

-- NOTE what is NOT here: a unique index on (user_id, item_id). One candidate design had one, and
-- it meant a revoked or refunded entitlement could never be re-bought. Buying twice is prevented
-- by the LIVE ENTITLEMENT index below, which a revocation releases.
--
-- The price on the receipt must be the live price. The client never sends one; this makes it so
-- that it could not matter if a later code path did. `IS NOT` rather than `<>` so an item that
-- has gone inactive fails CLOSED instead of comparing against NULL.
CREATE TRIGGER IF NOT EXISTS trg_coin_purchase_truthful
BEFORE INSERT ON coin_purchases FOR EACH ROW
WHEN NEW.price_minor_snapshot IS NOT
       (SELECT i.price_minor FROM coin_store_items i
         WHERE i.id = NEW.item_id AND i.active = 1 AND i.delisted_at IS NULL)
  OR NEW.entitlement_key IS NOT
       (SELECT i.entitlement_key FROM coin_store_items i WHERE i.id = NEW.item_id)
  OR NEW.sku_snapshot IS NOT (SELECT i.sku FROM coin_store_items i WHERE i.id = NEW.item_id)
BEGIN
  SELECT RAISE(ABORT, 'the amounts on this receipt are not the ones the item defines');
END;

-- A receipt is a receipt. No SET NULL columns here, so no carve-out is needed; a future
-- `refunded_at` is an ADD COLUMN plus a DROP/CREATE of this trigger, both cheap.
CREATE TRIGGER IF NOT EXISTS trg_coin_purchase_immutable
BEFORE UPDATE ON coin_purchases FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'a purchase is a receipt and cannot be rewritten');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 7. ENTITLEMENTS — what a purchase actually bought, and the only thing theme-apply consults.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- SURROGATE PRIMARY KEY, AND THIS ONE IS UNALTERABLE IF MISSED. A candidate design used
-- `PRIMARY KEY (user_id, entitlement_key) WITHOUT ROWID` with no lifecycle column, which makes
-- "this person bought it and then lost it" an UNREPRESENTABLE state: the only revocation is a
-- DELETE, which destroys the record by the act of enforcing it, and adding `revoked_at` later
-- means changing the PRIMARY KEY of a WITHOUT ROWID table — a full rebuild of a table hanging off
-- financial history. A surrogate id plus a PARTIAL UNIQUE INDEX gives the identical guarantee
-- today and is a DROP INDEX tomorrow. There is no revocation ROUTE in this migration; there is
-- room for one, because room is the part that cannot be added later.
CREATE TABLE IF NOT EXISTS coin_entitlements (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id         INTEGER NOT NULL REFERENCES coin_store_items(id) ON DELETE RESTRICT,
  purchase_id     INTEGER NOT NULL REFERENCES coin_purchases(id) ON DELETE CASCADE,

  -- Copied from the purchase (itself a snapshot of a FROZEN item column, so this is a copy of an
  -- immutable value and cannot drift) because a partial UNIQUE index may only reference columns
  -- of its own table, and the ownership question has to be one index seek against one table.
  entitlement_key TEXT NOT NULL CHECK (length(entitlement_key) BETWEEN 3 AND 64),

  granted_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at      INTEGER,
  revoked_reason  TEXT CHECK (revoked_reason IS NULL OR length(revoked_reason) BETWEEN 1 AND 280)
);

-- THE DOUBLE-BUY GUARD, and the reason the purchase transaction's "do they already own it?" read
-- is a courtesy rather than the control: two concurrent purchases of the same pack collide here
-- and the loser's whole transaction rolls back, charging nothing because nothing committed.
-- Partial on revoked_at, so a revocation releases the slot and the item can be bought again.
CREATE UNIQUE INDEX IF NOT EXISTS coin_entitlements_live_uidx
  ON coin_entitlements (user_id, entitlement_key) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS coin_entitlements_user_idx ON coin_entitlements (user_id, id DESC);
CREATE INDEX IF NOT EXISTS coin_entitlements_purchase_idx ON coin_entitlements (purchase_id);

-- The grant must match the purchase it claims to come from, and that purchase must be the
-- grantee's. Nothing can hand user B an entitlement backed by user A's receipt.
CREATE TRIGGER IF NOT EXISTS trg_coin_entitlement_truthful
BEFORE INSERT ON coin_entitlements FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM coin_purchases p
   WHERE p.id = NEW.purchase_id
     AND p.user_id = NEW.user_id
     AND p.item_id = NEW.item_id
     AND p.entitlement_key = NEW.entitlement_key)
BEGIN
  SELECT RAISE(ABORT, 'a grant must be backed by the purchase that produced it');
END;

-- Only revocation may be recorded, and it is one-way — trg_log_set_void_terminal's shape.
CREATE TRIGGER IF NOT EXISTS trg_coin_entitlement_immutable
BEFORE UPDATE ON coin_entitlements FOR EACH ROW
WHEN NEW.id IS NOT OLD.id
  OR NEW.user_id IS NOT OLD.user_id
  OR NEW.item_id IS NOT OLD.item_id
  OR NEW.purchase_id IS NOT OLD.purchase_id
  OR NEW.entitlement_key IS NOT OLD.entitlement_key
  OR NEW.granted_at IS NOT OLD.granted_at
  OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'a grant may only be revoked, never re-pointed or restored');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 8. ACHIEVEMENTS — paid through the SAME ledger, because there is no other way to move a balance.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `key` is LENGTH-BOUNDED, and that bound is load-bearing rather than tidy: a candidate design
-- derived the ledger's idempotency key by concatenating this string, against an unbounded GLOB,
-- into a column with an 8..64 CHECK — so a perfectly reasonable 61-character achievement name
-- would make every unlock of it abort forever, surfacing as a 400 on the unrelated endpoint that
-- logged the workout. Here the derived key is `ach:` || printf('%010d', id) — TEN DIGITS, ZERO
-- PADDED, and the padding is not cosmetic.
--
-- THIS COMMENT USED TO SAY `ach:<numeric id>`, "which is fixed-width", AND IT WAS NOT. The first
-- probe run against this schema died on it: `'ach:' || 1` is five characters and the column's own
-- CHECK demands eight, so the very first achievement anybody unlocked would have aborted. The
-- comment described a padded key and the expression produced an unpadded one — two things that
-- must agree, disagreeing, inside the design written to prevent exactly that. It was found by
-- running the thing rather than by reading it, which is the only way this class is ever found.
--
-- Ten digits is above the eight-character floor at id 1 and stays inside the 96-character ceiling
-- forever. It is fixed-width and
-- touches no reference-table string at all. The bound is belt to that brace.
--
-- `reward_minor` allows 0. Two designs forbade it (minimum 1) so the unlock transaction would not
-- have to branch — but a purely cosmetic badge is an obvious future ask and forbidding it welds a
-- product decision into a CHECK on a table with an inbound RESTRICT foreign key. The branch is
-- avoided instead by a PREDICATE (`reward_minor_snapshot > 0`) on the payment statement, whose
-- row count is then ASSERTED against the pre-read reward — see unlockAchievementTx.
CREATE TABLE IF NOT EXISTS achievements (
  key          TEXT PRIMARY KEY
               CHECK (key GLOB '[a-z][a-z0-9._]*' AND length(key) BETWEEN 3 AND 40),
  title_key    TEXT NOT NULL CHECK (length(title_key) BETWEEN 1 AND 64),
  category     TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 32),
  reward_minor INTEGER NOT NULL
               CHECK (typeof(reward_minor) = 'integer' AND reward_minor >= 0),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order   INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

INSERT OR IGNORE INTO achievements (key, title_key, category, reward_minor, sort_order) VALUES
  ('workout.first',        'achievement.workout.first',        'workout',   2500, 10),
  ('workout.sessions.10',  'achievement.workout.sessions.10',  'workout',   5000, 20),
  ('workout.sessions.100', 'achievement.workout.sessions.100', 'workout',  25000, 30),
  ('pr.first',             'achievement.pr.first',             'strength',  2500, 40),
  ('streak.workout.7',     'achievement.streak.workout.7',     'streak',    5000, 50),
  ('streak.workout.30',    'achievement.streak.workout.30',    'streak',   15000, 60),
  ('nutrition.logged.7',   'achievement.nutrition.logged.7',   'nutrition', 2500, 70);

CREATE TABLE IF NOT EXISTS user_achievements (
  id                    INTEGER PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_key       TEXT NOT NULL REFERENCES achievements(key) ON DELETE RESTRICT,

  -- Provenance: the workout_pr_events row, the workout_logs row, whatever earned it. Polymorphic
  -- and FK-free for the same reason coin_ledger.ref_id is.
  source_type           TEXT CHECK (source_type IS NULL OR length(source_type) BETWEEN 1 AND 40),
  source_id             INTEGER CHECK (source_id IS NULL OR (typeof(source_id) = 'integer' AND source_id > 0)),

  reward_minor_snapshot INTEGER NOT NULL
                        CHECK (typeof(reward_minor_snapshot) = 'integer' AND reward_minor_snapshot >= 0),
  unlocked_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

-- THE ANTI-DOUBLE-MINT. Earned once, ever — so the total mintable by achievements is bounded by
-- the catalogue itself: SUM(reward_minor) per account and no more. Combined with
-- coin_ledger_ref_uidx that is one constraint per requirement, the workout_pr_events discipline.
CREATE UNIQUE INDEX IF NOT EXISTS user_achievements_once_uidx
  ON user_achievements (user_id, achievement_key);
CREATE INDEX IF NOT EXISTS user_achievements_feed_idx
  ON user_achievements (user_id, unlocked_at DESC);

-- The snapshot must be the catalogue's number, or the award row is a caller-chosen amount wearing
-- a server-side hat — and the ledger insert reads its amount from here.
CREATE TRIGGER IF NOT EXISTS trg_user_achievement_truthful
BEFORE INSERT ON user_achievements FOR EACH ROW
WHEN NEW.reward_minor_snapshot IS NOT
     (SELECT a.reward_minor FROM achievements a WHERE a.key = NEW.achievement_key AND a.active = 1)
BEGIN
  SELECT RAISE(ABORT, 'this unlock does not pay what its achievement pays');
END;

-- No SET NULL columns, so an unconditional refusal is safe here.
CREATE TRIGGER IF NOT EXISTS trg_user_achievement_immutable
BEFORE UPDATE ON user_achievements FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'an unlock is something that happened and cannot be edited');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 9. THE LEDGER MAY NOT DISAGREE WITH WHAT IT PAYS FOR.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Placed here because it references coin_purchases and user_achievements. Per-reason and
-- therefore a trigger: a new reason is a DROP/CREATE of this one object.
CREATE TRIGGER IF NOT EXISTS trg_coin_ledger_ref_truthful
BEFORE INSERT ON coin_ledger FOR EACH ROW
WHEN (NEW.reason_key = 'store.purchase' AND NOT EXISTS (
        SELECT 1 FROM coin_purchases p
         WHERE p.id = NEW.ref_id
           AND p.user_id = NEW.user_id
           AND NEW.amount_minor = -p.price_minor_snapshot))
  OR (NEW.reason_key = 'achievement.reward' AND NOT EXISTS (
        SELECT 1 FROM user_achievements ua
         WHERE ua.id = NEW.ref_id
           AND ua.user_id = NEW.user_id
           AND NEW.amount_minor = ua.reward_minor_snapshot
           AND ua.reward_minor_snapshot > 0))
BEGIN
  SELECT RAISE(ABORT, 'this movement does not match the thing it is paying for');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 10. THEME PACKS, AND WHY user_theme_prefs IS REBUILT RATHER THAN EXTENDED.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `user_theme_prefs.pack` carries CHECK (pack IN ('midnight','solar','forest','neon','mono')) from
-- 002:9-10. A premium pack sold in the store is UNSTORABLE until that CHECK is gone, and SQLite
-- cannot alter a CHECK.
--
-- The tempting alternative — leave the CHECK and add a nullable `premium_pack_key` beside it,
-- with the applied pack being COALESCE(premium_pack_key, pack) — is REJECTED. That is two columns
-- holding one fact, which is this project's single most common defect, plus a COALESCE rule the
-- server, the client and every future query would each have to know. The table is one small row
-- per user, is referenced by nothing (verified), has no FTS external-content index and holds no
-- licensed data, so this is the cheap case and not the case 011 was right to refuse.
--
-- `surface_hex` lives here so lib/contrast.js stops carrying its own PACK_SURFACES map. That map
-- has a five-entry list and `checkAccent` silently falls back to 'midnight' for anything unknown —
-- which for a NEW pack means an accent validated against the wrong (near-black, most permissive)
-- surface. The map is DELETED in the same commit and `checkAccent(hex, surfaceHex)` takes the
-- surface as an argument the route reads from this table. One authoritative copy on the server.
CREATE TABLE IF NOT EXISTS theme_packs (
  key             TEXT PRIMARY KEY
                  CHECK (key GLOB '[a-z][a-z0-9_]*' AND length(key) BETWEEN 2 AND 32),
  label           TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 40),
  -- The darkest surface an accent must be legible ON. Same format guard as user_theme_prefs.accent.
  surface_hex     TEXT NOT NULL
                  CHECK (surface_hex GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  -- NULL = free. Otherwise the entitlement the wearer must hold, which is the SAME string the
  -- store item grants. One string, two readers, no join table and no second encoding.
  entitlement_key TEXT CHECK (entitlement_key IS NULL OR length(entitlement_key) BETWEEN 3 AND 64),
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order      INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- The five free packs are seeded FIRST and with exactly the keys 002's CHECK permitted, so the
-- copy below cannot violate the new foreign key. surface_hex matches contrast.js verbatim.
INSERT OR IGNORE INTO theme_packs (key, label, surface_hex, entitlement_key, sort_order) VALUES
  ('midnight', 'Midnight', '#0B0D10', NULL,           10),
  ('solar',    'Solar',    '#12100B', NULL,           20),
  ('forest',   'Forest',   '#0A0F0C', NULL,           30),
  ('neon',     'Neon',     '#06070A', NULL,           40),
  ('mono',     'Mono',     '#0A0A0A', NULL,           50),
  ('aurora',   'Aurora',   '#080B14', 'theme.aurora', 60),
  ('ember',    'Ember',    '#140A08', 'theme.ember',  70);

-- A pack's identity and its price gate are frozen; only its presentation and retirement move.
-- Without this, repointing a premium pack's entitlement_key at a free one gives it away to
-- everybody with a single UPDATE.
CREATE TRIGGER IF NOT EXISTS trg_theme_pack_frozen
BEFORE UPDATE ON theme_packs FOR EACH ROW
WHEN NEW.key IS NOT OLD.key OR NEW.entitlement_key IS NOT OLD.entitlement_key
BEGIN
  SELECT RAISE(ABORT, 'a theme cannot change what it costs to unlock');
END;

-- The two premium packs, as store items. 25000 minor = 250 coins.
INSERT OR IGNORE INTO coin_store_items (sku, title, description, price_minor, entitlement_key) VALUES
  ('theme.aurora', 'Aurora', 'A cold northern gradient set.',        25000, 'theme.aurora'),
  ('theme.ember',  'Ember',  'Near-black with a single warm accent.', 25000, 'theme.ember');

-- ── THE REBUILD ────────────────────────────────────────────────────────────────────────────────
--
-- The whole migration file already runs inside ONE transaction (worker.js migrate: conn.exec(sql)
-- inside conn.transaction, committed by tx.immediate), so this is atomic with everything above.
-- PRAGMA foreign_keys is a no-op inside a transaction, so the textbook 12-step dance is neither
-- possible here nor needed: nothing in the schema references user_theme_prefs, so the DROP cannot
-- orphan a child and the RENAME has no foreign keys elsewhere to rewrite.
--
-- ON DELETE RESTRICT on the pack, not SET NULL or CASCADE: retiring a pack must not silently
-- reset everyone's theme, and a pack must not be removable out from under a saved preference.
CREATE TABLE IF NOT EXISTS user_theme_prefs_v19 (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pack       TEXT NOT NULL DEFAULT 'midnight' REFERENCES theme_packs(key) ON DELETE RESTRICT,
  accent     TEXT CHECK (accent IS NULL OR accent GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  gradient   TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO user_theme_prefs_v19 (user_id, pack, accent, gradient, created_at, updated_at)
  SELECT user_id, pack, accent, gradient, created_at, updated_at FROM user_theme_prefs;

-- THE COPY IS ASSERTED BEFORE THE ORIGINAL IS DROPPED, and this is the answer to the one
-- genuinely irreversible step in this file. A silent short copy would reset every affected user's
-- theme to 'midnight' with no second copy to compare against. RAISE() is only legal inside a
-- trigger, so the assertion is a CHECK on a throwaway table: if the counts differ the INSERT
-- violates it, SQLITE_CONSTRAINT_CHECK propagates out of conn.exec, migrate() rethrows, and the
-- ENTIRE migration rolls back with the original table untouched.
CREATE TABLE _m019_assert (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _m019_assert (ok)
  SELECT CASE WHEN (SELECT COUNT(*) FROM user_theme_prefs_v19)
                 = (SELECT COUNT(*) FROM user_theme_prefs) THEN 1 ELSE 0 END;
DROP TABLE _m019_assert;

DROP TRIGGER IF EXISTS user_theme_prefs_updated_at;
DROP TABLE user_theme_prefs;
ALTER TABLE user_theme_prefs_v19 RENAME TO user_theme_prefs;

-- Recreated verbatim from 002:19-23. Non-recursive only because PRAGMA recursive_triggers is OFF.
CREATE TRIGGER IF NOT EXISTS user_theme_prefs_updated_at
AFTER UPDATE ON user_theme_prefs FOR EACH ROW
BEGIN
  UPDATE user_theme_prefs SET updated_at = unixepoch() WHERE user_id = OLD.user_id;
END;

-- ── OWNERSHIP IS CHECKED BY THE SCHEMA, NOT ONLY BY THE ROUTE ──────────────────────────────────
--
-- T5.4.4 says a premium theme is checked server-side on apply. The route does check it, inside its
-- own statement — but one candidate design had ONLY that, and a route check is a check the next
-- write path forgets to copy. Today there is exactly one writer of this table (theme/routes.js),
-- which is precisely the state in which a second one gets added without the guard.
--
-- The messages carry no snake_case token and no table.column pair, so lib/http.js:104-105
-- forwards them to the client verbatim instead of replacing them with the generic sentence. That
-- is deliberate: this one is worth a user reading.
CREATE TRIGGER IF NOT EXISTS trg_theme_pack_entitled_ins
BEFORE INSERT ON user_theme_prefs FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM theme_packs t
   WHERE t.key = NEW.pack AND t.active = 1
     AND (t.entitlement_key IS NULL
       OR EXISTS (SELECT 1 FROM coin_entitlements e
                   WHERE e.user_id = NEW.user_id
                     AND e.entitlement_key = t.entitlement_key
                     AND e.revoked_at IS NULL)))
BEGIN
  SELECT RAISE(ABORT, 'this theme is not unlocked for this account');
END;

CREATE TRIGGER IF NOT EXISTS trg_theme_pack_entitled_upd
BEFORE UPDATE OF pack ON user_theme_prefs FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM theme_packs t
   WHERE t.key = NEW.pack AND t.active = 1
     AND (t.entitlement_key IS NULL
       OR EXISTS (SELECT 1 FROM coin_entitlements e
                   WHERE e.user_id = NEW.user_id
                     AND e.entitlement_key = t.entitlement_key
                     AND e.revoked_at IS NULL)))
BEGIN
  SELECT RAISE(ABORT, 'this theme is not unlocked for this account');
END;

-- A revocation takes the theme back on the next write with no sweeper job. Without this, revoking
-- a paid entitlement leaves the pack applied forever — the entitlement triggers above only fire
-- when somebody writes, and a user who is happy with their stolen theme never will.
--
-- Works because recursive_triggers is OFF for self-recursion and because the pack it writes is
-- free, so trg_theme_pack_entitled_upd fires and PASSES rather than blocking its own cleanup.
CREATE TRIGGER IF NOT EXISTS trg_theme_revoked_resets_pack
AFTER UPDATE OF revoked_at ON coin_entitlements FOR EACH ROW
WHEN NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL
BEGIN
  UPDATE user_theme_prefs
     SET pack = 'midnight'
   WHERE user_id = NEW.user_id
     AND pack IN (SELECT t.key FROM theme_packs t WHERE t.entitlement_key = NEW.entitlement_key);
END;

PRAGMA user_version = 19;