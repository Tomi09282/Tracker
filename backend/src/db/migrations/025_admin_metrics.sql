-- 025_admin_metrics.sql — the indexes the admin dashboard needs, and nothing else.
-- Applies on top of user_version 24.
--
-- ═══ EVERY METRIC IN THE F8 BRIEF WAS A FULL SCAN ══════════════════════════════════════════════
--
-- Measured before writing a line of the endpoint: not one index in the schema leads with a time
-- column on `workout_logs`, `nutrition_log_items`, `coin_ledger` or `users`. Every existing index
-- leads with a USER — which is exactly right for the product, where every read is somebody asking
-- about their own rows, and exactly wrong for a dashboard that groups a date range across everyone.
--
-- `audit_log` is the one exception; 019 and 021 each gave it a `(created_at DESC, id DESC)` index
-- for their own admin reads. This does the same for the four tables the dashboard bucket by.
--
-- ═══ WHAT IS DELIBERATELY NOT HERE ═════════════════════════════════════════════════════════════
--
-- `coin_ledger` already carries five indexes, two of them UNIQUE constraints that are load-bearing
-- controls — `coin_ledger_idem_uidx` IS the replay guarantee. A money table pays for every index on
-- every write, so this adds exactly ONE, on the column the velocity chart groups by, and nothing
-- speculative.
--
-- There is no `users.last_seen_at`, and this migration does not add one. It would mean a write on
-- every authenticated request — a write amplifier on the hottest path in the product, to power one
-- number on one screen. The dashboard measures what the product already records instead, and the
-- endpoint says so in as many words rather than calling it DAU.

-- ── activity, bucketed by the USER'S OWN DAY ────────────────────────────────────────────────
--
-- `local_date` is TEXT 'YYYY-MM-DD' written from the client's timezone, and 010 says in terms why:
-- bucketing on `date(started_at,'unixepoch')` is UTC and mis-buckets every streak, calendar cell
-- and weekly volume for anybody east or west of Greenwich. The dashboard groups on the same column
-- the product does, so "active on the 5th" means the same thing on both.
--
-- The user id trails the date so a COUNT(DISTINCT user) over a range is answered from the index.
CREATE INDEX IF NOT EXISTS workout_logs_date_idx
  ON workout_logs (local_date, client_user_id);

CREATE INDEX IF NOT EXISTS nutrition_log_items_date_idx
  ON nutrition_log_items (local_date, client_user_id);

-- ── signups and coin movement, bucketed by UTC ──────────────────────────────────────────────
--
-- Neither table has a local date and neither should: a registration and a ledger entry are events
-- in server time, not in somebody's calendar. They are charted SEPARATELY from the activity series
-- for that reason — putting a UTC-bucketed bar beside a local-date one on the same axis quietly
-- claims the two share a day boundary, and near midnight they do not.
CREATE INDEX IF NOT EXISTS users_created_idx
  ON users (created_at);

CREATE INDEX IF NOT EXISTS coin_ledger_created_idx
  ON coin_ledger (created_at);

PRAGMA user_version = 25;
