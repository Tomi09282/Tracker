-- 033_lifeos_rewards_challenges.sql — the daily challenge draw and the reward shop.
-- Applies on top of 032 (habits and tasks). Approved plan: C:/Users/Petike/.claude/plans/
-- abundant-booping-willow.md, Phase 4 "Rewards + challenges"; design round B (challenges-1 / -2,
-- rewards-1, reward-detail, reward-form) and the economy sheet (owner, 2026-10-18).
--
-- ═══ WHAT IS NEW, AND WHY EACH IS A TABLE ══════════════════════════════════════════════════════
--
--   challenges          the user's pool of small missions (f_app "dobás"). User-defined, so every
--                       number is bounded here: coins 0..50 (the task override's cap — a picked
--                       challenge BECOMES a task and pays through completeTaskTx), weight 1..5 (the
--                       pool frame draws the weight as five segments). The pool cap (50 live) and
--                       the total cap live in the transaction because a CHECK cannot count rows.
--   challenge_draws     the day's draw: one row per (user, logical day), UNIQUE — that index IS the
--                       draw's idempotency. It holds the (up to) three options, the one reroll and
--                       the pick. The options are drawn in the worker with crypto.randomInt.
--   tasks.challenge_id  the task a pick created points back at its challenge, so "accepted today"
--                       is one indexed lookup and Ma can say "elvállalva" / "teljesítve".
--   rewards             what the user saves up for. The cost is whole coins (a multiple of 100
--                       minor), capped at rewardCostMax (10000 coins) — a reward is a SPEND and the
--                       spend must stay within the reason's ceiling below.
--   reward_redemptions  the receipt. Everything on it is a snapshot (019's coin_purchases idiom);
--                       the LEDGER points at it (ref_type 'reward_redemption'), never the reverse.
--
-- ═══ AND WHAT CHANGES IN 019 / 031 ═════════════════════════════════════════════════════════════
--
--   * coin_reasons gains 'reward.redeem': sign -1, ref 'reward_redemption', spend = 1 (so
--     trg_coin_ledger_spend_covered refuses it below zero — a reward is never bought on debt),
--     xp = 0 (the coins-1v2 line: "A beváltás nem csökkenti az XP-t és a szintet"; XP is a sum
--     over coin_events and a redemption is not an event).
--   * trg_coin_ledger_ref_truthful is recreated with a fourth clause: a 'reward.redeem' row must
--     match its redemption's owner and negated cost snapshot. The first three clauses are 031's,
--     verbatim.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. challenges
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS challenges (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80 AND name = trim(name)),
  -- The five categories of the round-B frames (Fegyelem, Mozgás, Elme, Kapcsolat, Étkezés) as
  -- stable keys; the client translates them. NULL = no category line.
  category    TEXT CHECK (category IS NULL OR category IN ('discipline', 'movement', 'mind', 'connection', 'food')),
  -- Whole coins the picked task pays (tasks.points carries it, capped at 50 there too).
  points      INTEGER NOT NULL CHECK (typeof(points) = 'integer' AND points BETWEEN 0 AND 50),
  -- Relative draw weight: 2 is twice as likely as 1 (f_app). Five segments on the pool frame.
  weight      INTEGER NOT NULL DEFAULT 1 CHECK (typeof(weight) = 'integer' AND weight BETWEEN 1 AND 5),
  archived_at INTEGER CHECK (archived_at IS NULL OR typeof(archived_at) = 'integer'),
  -- Soft delete (f_app deleteChallenge): the tasks a challenge already became keep their history.
  deleted_at  INTEGER CHECK (deleted_at IS NULL OR typeof(deleted_at) = 'integer'),
  client_key  TEXT NOT NULL CHECK (length(client_key) BETWEEN 8 AND 64
                                   AND client_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  -- A deleted challenge is also out of the pool.
  CHECK (deleted_at IS NULL OR archived_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS challenges_client_key_uidx ON challenges (user_id, client_key);
CREATE INDEX IF NOT EXISTS challenges_pool_idx ON challenges (user_id, deleted_at, archived_at, id);

CREATE TRIGGER IF NOT EXISTS trg_challenge_identity_frozen
BEFORE UPDATE OF user_id, client_key ON challenges FOR EACH ROW
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.client_key IS NOT OLD.client_key
BEGIN
  SELECT RAISE(ABORT, 'a challenge keeps its owner and key');
END;

-- A deleted challenge stays deleted (its tasks point at it; restoring it is a new challenge).
CREATE TRIGGER IF NOT EXISTS trg_challenge_deleted_final
BEFORE UPDATE ON challenges FOR EACH ROW
WHEN OLD.deleted_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'a deleted challenge cannot be changed');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. tasks.challenge_id — the task a pick created
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- SET NULL, not CASCADE: challenges are never hard-deleted except with their user (who takes the
-- tasks too), so the action never fires in practice; if it ever did, the task must survive.
ALTER TABLE tasks ADD COLUMN challenge_id INTEGER REFERENCES challenges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_challenge_idx ON tasks (user_id, due_on, challenge_id) WHERE challenge_id IS NOT NULL;

-- A challenge task belongs to the challenge's owner, is a one-off (never a template or an instance).
CREATE TRIGGER IF NOT EXISTS trg_task_challenge_owner
BEFORE INSERT ON tasks FOR EACH ROW
WHEN NEW.challenge_id IS NOT NULL AND (NEW.recurrence IS NOT NULL OR NEW.parent_task_id IS NOT NULL
  OR NOT EXISTS (SELECT 1 FROM challenges c WHERE c.id = NEW.challenge_id AND c.user_id = NEW.user_id))
BEGIN
  SELECT RAISE(ABORT, 'a challenge task must be a one-off of the challenge''s owner');
END;

-- The link is written once, at the pick. (The FK's SET NULL is the one allowed change.)
CREATE TRIGGER IF NOT EXISTS trg_task_challenge_frozen
BEFORE UPDATE OF challenge_id ON tasks FOR EACH ROW
WHEN NEW.challenge_id IS NOT OLD.challenge_id AND NOT (OLD.challenge_id IS NOT NULL AND NEW.challenge_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'a task keeps the challenge it came from');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. challenge_draws — one draw per user per logical day
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- The UNIQUE (user_id, local_date) makes a second draw of the same day unstorable: two concurrent
-- draws serialise on the IMMEDIATE lock and the second finds the first. The options are columns,
-- not a child table: a draw offers at most three (HÁROM LEHETŐSÉG), a smaller pool fewer.
CREATE TABLE IF NOT EXISTS challenge_draws (
  id                  INTEGER PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date          TEXT NOT NULL CHECK (local_date = date(local_date)),
  option1_id          INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  option2_id          INTEGER REFERENCES challenges(id) ON DELETE CASCADE,
  option3_id          INTEGER REFERENCES challenges(id) ON DELETE CASCADE,
  -- The one reroll of the day ("még 1 maradt ma"). reroll_key makes a retried reroll a replay.
  rerolls_used        INTEGER NOT NULL DEFAULT 0 CHECK (rerolls_used IN (0, 1)),
  reroll_key          TEXT CHECK (reroll_key IS NULL OR (length(reroll_key) BETWEEN 8 AND 64
                                                         AND reroll_key NOT GLOB '*[^A-Za-z0-9_-]*')),
  picked_challenge_id INTEGER REFERENCES challenges(id) ON DELETE CASCADE,
  picked_task_id      INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  picked_at           INTEGER CHECK (picked_at IS NULL OR typeof(picked_at) = 'integer'),
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, local_date),
  CHECK (option2_id IS NULL OR option2_id <> option1_id),
  CHECK (option3_id IS NULL OR (option2_id IS NOT NULL AND option3_id <> option1_id AND option3_id <> option2_id)),
  CHECK ((rerolls_used = 1) = (reroll_key IS NOT NULL)),
  -- A pick is all three columns or none, and it is one of the options.
  CHECK ((picked_challenge_id IS NULL) = (picked_at IS NULL)
         AND (picked_challenge_id IS NULL) = (picked_task_id IS NULL)),
  CHECK (picked_challenge_id IS NULL OR picked_challenge_id IN (option1_id, option2_id, option3_id))
);

-- The options are the owner's live (pool) challenges at the moment they are written.
CREATE TRIGGER IF NOT EXISTS trg_challenge_draw_options_owned
BEFORE INSERT ON challenge_draws FOR EACH ROW
WHEN (SELECT COUNT(*) FROM challenges c
       WHERE c.user_id = NEW.user_id AND c.archived_at IS NULL AND c.deleted_at IS NULL
         AND c.id IN (NEW.option1_id, NEW.option2_id, NEW.option3_id))
     <> 1 + (NEW.option2_id IS NOT NULL) + (NEW.option3_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'a draw offers only the owner''s live challenges');
END;

CREATE TRIGGER IF NOT EXISTS trg_challenge_draw_reroll_owned
BEFORE UPDATE OF option1_id, option2_id, option3_id ON challenge_draws FOR EACH ROW
WHEN (SELECT COUNT(*) FROM challenges c
       WHERE c.user_id = NEW.user_id AND c.archived_at IS NULL AND c.deleted_at IS NULL
         AND c.id IN (NEW.option1_id, NEW.option2_id, NEW.option3_id))
     <> 1 + (NEW.option2_id IS NOT NULL) + (NEW.option3_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'a draw offers only the owner''s live challenges');
END;

-- What may change, and how: the options only with the one reroll (0 -> 1) and only before the
-- pick; the pick once; nothing about whose day it is.
CREATE TRIGGER IF NOT EXISTS trg_challenge_draw_shape
BEFORE UPDATE ON challenge_draws FOR EACH ROW
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.local_date IS NOT OLD.local_date
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.rerolls_used < OLD.rerolls_used
  OR (OLD.reroll_key IS NOT NULL AND NEW.reroll_key IS NOT OLD.reroll_key)
  OR (OLD.picked_at IS NOT NULL AND (NEW.picked_at IS NOT OLD.picked_at
        OR NEW.picked_challenge_id IS NOT OLD.picked_challenge_id OR NEW.picked_task_id IS NOT OLD.picked_task_id))
  OR ((NEW.option1_id IS NOT OLD.option1_id OR NEW.option2_id IS NOT OLD.option2_id
        OR NEW.option3_id IS NOT OLD.option3_id)
      AND NOT (OLD.rerolls_used = 0 AND NEW.rerolls_used = 1 AND OLD.picked_at IS NULL AND NEW.picked_at IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'a draw is rerolled once and picked once');
END;

-- The picked task is the owner's, is the picked challenge's, and is due on the draw's day.
CREATE TRIGGER IF NOT EXISTS trg_challenge_draw_pick_truthful
BEFORE UPDATE OF picked_task_id ON challenge_draws FOR EACH ROW
WHEN NEW.picked_task_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM tasks t
   WHERE t.id = NEW.picked_task_id AND t.user_id = NEW.user_id
     AND t.challenge_id = NEW.picked_challenge_id AND t.due_on = NEW.local_date)
BEGIN
  SELECT RAISE(ABORT, 'the picked task must be the challenge''s task of that day');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. rewards
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rewards (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80 AND name = trim(name)),
  description   TEXT CHECK (description IS NULL OR length(description) BETWEEN 1 AND 280),
  -- Whole coins in minor units: 1..10000 coins (rewardCostMax, src/lifeos/rules.js LIFEOS_LIMITS).
  cost_minor    INTEGER NOT NULL CHECK (typeof(cost_minor) = 'integer'
                                        AND cost_minor BETWEEN 100 AND 1000000 AND cost_minor % 100 = 0),
  repeatable    INTEGER NOT NULL DEFAULT 1 CHECK (repeatable IN (0, 1)),
  -- Logical days between two redemptions ("Pihenő két beváltás között"); NULL = no limit
  -- (the form's "0 = nincs korlát"). A one-time reward has no cooldown.
  cooldown_days INTEGER CHECK (cooldown_days IS NULL
                               OR (typeof(cooldown_days) = 'integer' AND cooldown_days BETWEEN 1 AND 365)),
  archived_at   INTEGER CHECK (archived_at IS NULL OR typeof(archived_at) = 'integer'),
  client_key    TEXT NOT NULL CHECK (length(client_key) BETWEEN 8 AND 64
                                     AND client_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (repeatable = 1 OR cooldown_days IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS rewards_client_key_uidx ON rewards (user_id, client_key);
CREATE INDEX IF NOT EXISTS rewards_shop_idx ON rewards (user_id, archived_at, cost_minor, id);

CREATE TRIGGER IF NOT EXISTS trg_reward_identity_frozen
BEFORE UPDATE OF user_id, client_key ON rewards FOR EACH ROW
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.client_key IS NOT OLD.client_key
BEGIN
  SELECT RAISE(ABORT, 'a reward keeps its owner and key');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. reward_redemptions — the receipt
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id                  INTEGER PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Rewards are archived, never deleted (only with their user), so CASCADE cannot lose a receipt.
  reward_id           INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  -- SNAPSHOTS: a receipt that changes when the reward is edited is not a receipt.
  name_snapshot       TEXT NOT NULL CHECK (length(name_snapshot) BETWEEN 1 AND 80),
  cost_minor_snapshot INTEGER NOT NULL CHECK (typeof(cost_minor_snapshot) = 'integer'
                                              AND cost_minor_snapshot BETWEEN 100 AND 1000000),
  -- The logical day of the redemption: the cooldown counts in logical days, the statement groups by it.
  local_date          TEXT NOT NULL CHECK (local_date = date(local_date)),
  -- Bookkeeping only ("Teljesítve"): it moves no coins.
  fulfilled_at        INTEGER CHECK (fulfilled_at IS NULL OR typeof(fulfilled_at) = 'integer'),
  client_key          TEXT NOT NULL CHECK (length(client_key) BETWEEN 8 AND 64
                                           AND client_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  request_id          TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 64),
  created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

-- THE REPLAY GUARANTEE: one client key, one receipt (and the ledger's idempotency index, one debit).
CREATE UNIQUE INDEX IF NOT EXISTS reward_redemptions_key_uidx ON reward_redemptions (user_id, client_key);
CREATE INDEX IF NOT EXISTS reward_redemptions_reward_idx ON reward_redemptions (reward_id, id DESC);
CREATE INDEX IF NOT EXISTS reward_redemptions_user_idx ON reward_redemptions (user_id, id DESC);

-- The receipt says what the reward says right now: the owner's, live (not archived), its name and
-- its cost. The client never sends a cost; this makes it so that it could not matter if it did.
CREATE TRIGGER IF NOT EXISTS trg_reward_redemption_truthful
BEFORE INSERT ON reward_redemptions FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM rewards r
   WHERE r.id = NEW.reward_id AND r.user_id = NEW.user_id AND r.archived_at IS NULL
     AND r.cost_minor = NEW.cost_minor_snapshot AND r.name = NEW.name_snapshot)
BEGIN
  SELECT RAISE(ABORT, 'the amounts on this receipt are not the ones the reward defines');
END;

-- A one-time reward is redeemed once, ever (the backstop of ALREADY_REDEEMED).
CREATE TRIGGER IF NOT EXISTS trg_reward_redemption_once
BEFORE INSERT ON reward_redemptions FOR EACH ROW
WHEN (SELECT r.repeatable FROM rewards r WHERE r.id = NEW.reward_id) = 0
 AND EXISTS (SELECT 1 FROM reward_redemptions x WHERE x.reward_id = NEW.reward_id)
BEGIN
  SELECT RAISE(ABORT, 'this reward can be redeemed only once');
END;

-- A receipt is a receipt: only the fulfilled mark may change.
CREATE TRIGGER IF NOT EXISTS trg_reward_redemption_immutable
BEFORE UPDATE ON reward_redemptions FOR EACH ROW
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.reward_id IS NOT OLD.reward_id
  OR NEW.name_snapshot IS NOT OLD.name_snapshot OR NEW.cost_minor_snapshot IS NOT OLD.cost_minor_snapshot
  OR NEW.local_date IS NOT OLD.local_date OR NEW.client_key IS NOT OLD.client_key
  OR NEW.request_id IS NOT OLD.request_id OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'a redemption is a receipt and cannot be rewritten');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. the coin reason and the ref-truthful clause
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO coin_reasons (key, sign, ref_type, max_minor, label, xp, spend, cap_exempt) VALUES
  ('reward.redeem', -1, 'reward_redemption', 1000000, 'Reward redeemed', 0, 1, 0);

-- REF-TRUTHFUL, recreated with the reward clause. The first three clauses are 031's, verbatim.
DROP TRIGGER IF EXISTS trg_coin_ledger_ref_truthful;
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
  OR (NEW.ref_type = 'coin_event' AND NOT EXISTS (
        SELECT 1 FROM coin_events e
         WHERE e.id = NEW.ref_id
           AND e.user_id = NEW.user_id
           AND e.reason_key = NEW.reason_key
           AND e.amount_minor = NEW.amount_minor))
  OR (NEW.reason_key = 'reward.redeem' AND NOT EXISTS (
        SELECT 1 FROM reward_redemptions rr
         WHERE rr.id = NEW.ref_id
           AND rr.user_id = NEW.user_id
           AND NEW.amount_minor = -rr.cost_minor_snapshot))
BEGIN
  SELECT RAISE(ABORT, 'this movement does not match the thing it is paying for');
END;

PRAGMA user_version = 33;
