-- 028_tier_price_mapping.sql — how a processor's price becomes one of OUR tiers.
-- Applies on top of user_version 27.
--
-- ═══ THE MAPPING IS A COLUMN, NOT A SWITCH STATEMENT ═══════════════════════════════════════════
--
-- A webhook says `price_1QxyzABC`. Nothing in that string says "Starter", and the translation has
-- to live somewhere. The two candidates are a `switch` in the handler and a column here, and 026
-- already settled the principle: tiers are DATA. Creating a price in the Stripe dashboard should
-- be an UPDATE, not a deploy — and a deploy is exactly what a switch statement would require, at
-- the moment somebody is trying to launch a price.
--
-- It also makes the mapping VISIBLE. A price id in a column can be listed, diffed and checked
-- against the dashboard; one buried in a conditional can only be read by someone who knows to look.
--
-- ═══ NULL MEANS "NOT SOLD THROUGH THE PROCESSOR" ═══════════════════════════════════════════════
--
-- `free` has no price id and never will, and neither does a tier granted by hand — the seeded dev
-- coaches are on `unlimited` with no Stripe object behind it. So NULL is not "unconfigured", it is
-- a legitimate and permanent state, and the unique index is partial so any number of tiers may
-- have it.

ALTER TABLE subscription_tiers ADD COLUMN provider_price_id TEXT;

-- One price maps to one tier. Two tiers claiming the same price id is a configuration mistake that
-- would make the handler's answer depend on row order — the kind of bug that shows up as "some
-- customers get the wrong plan" months later.
CREATE UNIQUE INDEX subscription_tiers_price_idx
  ON subscription_tiers (provider_price_id)
  WHERE provider_price_id IS NOT NULL;

-- The webhook arrives naming a CUSTOMER, not a coach. This is the index that turns one into the
-- other on every event.
CREATE INDEX coach_subscriptions_customer_idx
  ON coach_subscriptions (provider, provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

PRAGMA user_version = 28;
