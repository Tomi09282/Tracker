-- 026_subscriptions.sql — coach subscription tiers and the state a processor reports.
-- Applies on top of user_version 25.
--
-- ═══ THE TIERS ARE DATA, NOT CODE ══════════════════════════════════════════════════════════════
--
-- `subscription_tiers` is a table rather than a constant in a module because pricing changes and
-- migrations are expensive. A tier's cap and price are rows; adding a tier or changing a limit is
-- an INSERT or an UPDATE, not a deploy. What is NOT data is the KEY — routes and the seat guard
-- reference `tier_key`, so keys are permanent once used.
--
-- ═══ `client_cap` NULL MEANS UNLIMITED, AND THERE IS NO SECOND SPELLING ════════════════════════
--
-- Not 999999, not -1, not a separate `is_unlimited` flag. Every one of those is two things that
-- must agree — the recurring defect class this project keeps finding — and the flag version is the
-- worst: a row with `is_unlimited = 1, client_cap = 10` has two answers and the code picks one.
-- NULL is the SQL spelling of "no limit", and `COUNT(*) < cap` is simply not asked when it is NULL.
--
-- ═══ WHY THE STATE IS A TABLE THE PROCESSOR WRITES, NOT A LOOKUP ═══════════════════════════════
--
-- The seat guard runs inside a worker transaction on every client link. It cannot call Stripe: it
-- would turn a 2 ms local write into a network round trip inside a held write lock, and it would
-- fail open or fail closed during an outage — both wrong. So the processor's webhooks are the only
-- writer of `coach_subscriptions`, and every read is local.
--
-- ═══ A COACH WITH NO ROW IS ON THE FREE TIER ═══════════════════════════════════════════════════
--
-- Deliberately: requiring a row would mean every signup path, every seed, every test fixture and
-- every future import has to remember to create one, and the day one forgets, a coach has no tier
-- at all and the guard has to invent an answer. Absent = free is the one rule that cannot be
-- forgotten into an undefined state.

CREATE TABLE subscription_tiers (
  key           TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  -- NULL = unlimited. See above.
  client_cap    INTEGER,
  -- Integer minor units, like every other money column in this schema. No floats in the money path.
  price_minor   INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'EUR',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  -- A retired tier stops being offered but must keep resolving: coaches are still ON it until they
  -- move, and deleting the row would orphan their subscription's foreign key.
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (client_cap IS NULL OR client_cap >= 0),
  CHECK (price_minor >= 0),
  CHECK (length(currency) = 3)
);

-- Starting shape. Numbers are the owner's to change and this is the only place they live; the free
-- tier's cap of 3 is a placeholder pending that decision, not a considered price point.
INSERT INTO subscription_tiers (key, name, client_cap, price_minor, currency, sort_order) VALUES
  ('free',      'Free',       3,    0, 'EUR', 0),
  ('starter',   'Starter',   10,    0, 'EUR', 1),
  ('pro',       'Pro',       50,    0, 'EUR', 2),
  ('unlimited', 'Unlimited', NULL,  0, 'EUR', 3);

CREATE TABLE coach_subscriptions (
  coach_id                 INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier_key                 TEXT NOT NULL REFERENCES subscription_tiers(key),
  -- The processor's own vocabulary, narrowed to what this product acts on. `past_due` is NOT
  -- `canceled`: a failed card is a dunning window, and dropping a coach to free on the first
  -- decline would cost them their clients over a bank's fraud heuristic.
  status                   TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','canceled')),
  provider                 TEXT NOT NULL DEFAULT 'stripe',
  provider_customer_id     TEXT,
  provider_subscription_id TEXT,
  current_period_end       INTEGER,
  -- The processor's event clock, not ours. Webhooks arrive out of order — that is documented
  -- behaviour, not an edge case — so an event older than the row we hold must be DISCARDED rather
  -- than applied. Without this column that comparison has nothing to compare against, and a
  -- delayed `canceled` from last week would overwrite this morning's `active`.
  provider_event_at        INTEGER,
  updated_at               INTEGER NOT NULL DEFAULT (unixepoch())
);

-- One subscription per processor-side subscription, so a duplicated webhook cannot create a second
-- row for the same remote object.
CREATE UNIQUE INDEX coach_subscriptions_provider_sub_idx
  ON coach_subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- ═══ THE WEBHOOK LEDGER ════════════════════════════════════════════════════════════════════════
--
-- T8.2.6 requires replay defence on timestamp AND event id. The timestamp half is a header check;
-- the event-id half needs somewhere to remember what has already been processed, and it has to be
-- the DATABASE rather than memory — a process restart must not reopen the replay window, and a
-- second process must not have its own private idea of what it has seen.
--
-- `INSERT` on this table IS the idempotency claim: the unique key makes a replayed event fail the
-- insert, inside the same transaction that would have applied it.
CREATE TABLE processor_events (
  id            INTEGER PRIMARY KEY,
  provider      TEXT NOT NULL DEFAULT 'stripe',
  event_id      TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  -- When the PROCESSOR made it, for the ordering rule above and for the age check.
  event_at      INTEGER NOT NULL,
  received_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  request_id    TEXT
);

CREATE UNIQUE INDEX processor_events_unique_idx ON processor_events (provider, event_id);
-- Sweeping old rows is a maintenance job, and it needs a time-leading index or it is a full scan
-- of a table that only ever grows. Same lesson as 025.
CREATE INDEX processor_events_received_idx ON processor_events (received_at);

-- The seat guard counts a coach's ACTIVE links on every attempt to add one. Without this it is a
-- scan of `coach_clients` filtered by status, on the hot path of the two routes that add clients.
CREATE INDEX coach_clients_active_idx ON coach_clients (coach_id, status);

PRAGMA user_version = 26;
