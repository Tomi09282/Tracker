-- 031_lifeos_core.sql — the LifeOS core: the user's day, the admin's point rules, and coins that
-- can be EARNED over and over (and taken back exactly) without loosening anything 019 guarantees.
-- Applies on top of user_version 29 (030 is reserved for the theme-pack retirement; the runner's
-- ledger applies a late 030 correctly, see worker.js migrate()).
--
-- Approved plan: C:/Users/Petike/.claude/plans/abundant-booping-willow.md, "LifeOS backend design"
-- and the economy sheet (owner, 2026-10-18): 1 point = 1 coin, a daily earn cap of 400 coins,
-- penalties may take the balance below zero and spends may not, a day settles 6 h after the next
-- one starts, at most 7 days of catch-up, the perfect day needs the scheduled workout.
--
-- ═══ WHAT IS NEW, AND WHY EACH IS A TABLE ══════════════════════════════════════════════════════
--
--   user_prefs       the user's timezone and day start. Until now the timezone was never written
--                    (onboarding_profiles.timezone exists and nothing sets it), so every date in
--                    the product was a UTC date. One row per user, opened by a trigger like the
--                    wallet, so "the prefs might not exist" is never a state code has to model.
--   point_rule_sets  the point rules, ADMIN-GLOBAL and append-only (plan L1): per-user rules would
--                    let anyone mint a shared currency. The newest row is in force.
--   coin_events      every LifeOS award, penalty and reversal (plan L7). 019's ledger has a
--                    natural-key index — one row per (reason, ref) — which is exactly right for a
--                    purchase and exactly wrong for "a workout pays every time". The event is the
--                    thing the ledger row points at, so each movement still has ONE ledger row
--                    and the index keeps holding.
--   daily_summaries  one row per settled day — the idempotency of the day close (plan L6).
--
-- ═══ AND WHAT CHANGES IN 019 ═══════════════════════════════════════════════════════════════════
--
--   * coin_reasons gains `xp` (this reason earns XP) and `spend` (this reason is a SPEND and must
--     be covered by the balance).
--   * trg_coin_ledger_never_negative is DROPPED and replaced by trg_coin_ledger_spend_covered:
--     a penalty or a reversal may take the balance below zero (plan L3), a spend may not. 019
--     wrote the floor as a droppable trigger precisely so that this would be a DROP and not a
--     rebuild of the money table.
--   * trg_coin_ledger_ref_truthful is recreated with a third clause: a ledger row that claims a
--     coin_event must match that event's owner, reason and amount.
--
-- Money stays integer minor units (1 coin = 100), every amount column carries a typeof() CHECK.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. user_prefs — the day boundary
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- IANA zone. Shape only here; whether the runtime KNOWS the zone is checked by the route
  -- (src/lifeos/dates.js isValidTimeZone) before a value ever reaches this column.
  timezone           TEXT CHECK (timezone IS NULL OR (length(timezone) BETWEEN 3 AND 64
                                 AND (timezone GLOB '*/*' OR timezone = 'UTC')
                                 AND timezone NOT GLOB '*[^A-Za-z0-9_/+-]*')),
  timezone_set_at    INTEGER CHECK (timezone_set_at IS NULL OR typeof(timezone_set_at) = 'integer'),
  -- The Nap és időzóna frame offers exactly these four starts.
  day_start_hour     INTEGER NOT NULL DEFAULT 4 CHECK (day_start_hour IN (0, 2, 4, 6)),
  -- The first logical day LifeOS settles. Set once, when a timezone is first known; days before it
  -- never settle, so a new user is not handed a week of empty "missed" days.
  lifeos_started_on  TEXT CHECK (lifeos_started_on IS NULL OR lifeos_started_on = date(lifeos_started_on)),
  -- f_app settings.kcalTolerancePct: the kcal goal is hit within +/- this % of the target.
  kcal_tolerance_pct INTEGER NOT NULL DEFAULT 10
                     CHECK (typeof(kcal_tolerance_pct) = 'integer' AND kcal_tolerance_pct BETWEEN 1 AND 50),
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TRIGGER IF NOT EXISTS trg_user_opens_prefs
AFTER INSERT ON users FOR EACH ROW
BEGIN
  INSERT OR IGNORE INTO user_prefs (user_id) VALUES (NEW.id);
END;

-- BACKFILL. The only timezone data that exists is onboarding_profiles.timezone (010), which no
-- route writes today; it is carried over when it has the IANA shape, never guessed.
INSERT OR IGNORE INTO user_prefs (user_id, timezone)
SELECT u.id,
       (SELECT op.timezone FROM onboarding_profiles op
         WHERE op.user_id = u.id AND op.timezone GLOB '*/*'
           AND length(op.timezone) BETWEEN 3 AND 64
           AND op.timezone NOT GLOB '*[^A-Za-z0-9_/+-]*')
  FROM users u;

-- The start day is written once. Moving it would re-open days that already settled (or skip days
-- that never did), and both are a way to mint or erase coins.
CREATE TRIGGER IF NOT EXISTS trg_user_prefs_started_once
BEFORE UPDATE OF lifeos_started_on ON user_prefs FOR EACH ROW
WHEN OLD.lifeos_started_on IS NOT NULL AND NEW.lifeos_started_on IS NOT OLD.lifeos_started_on
BEGIN
  SELECT RAISE(ABORT, 'the first LifeOS day cannot be moved');
END;

-- The timezone changes at most once per 24 h (plan: "tz change <= 1/24 h, audited"). The route
-- answers a distinguishable 409 first; this is the backstop for every other writer.
CREATE TRIGGER IF NOT EXISTS trg_user_prefs_timezone_daily
BEFORE UPDATE OF timezone ON user_prefs FOR EACH ROW
WHEN NEW.timezone IS NOT OLD.timezone
 AND OLD.timezone IS NOT NULL
 AND OLD.timezone_set_at IS NOT NULL
 AND unixepoch() - OLD.timezone_set_at < 86400
BEGIN
  SELECT RAISE(ABORT, 'the time zone can only change once a day');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. point_rule_sets — admin-global, append-only, newest in force
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- The rules are ONE validated JSON object rather than thirty-five columns: the set is versioned as
-- a whole (the Szabályok frame shows "7. verzió"), validated as a whole by the same zod schema the
-- route uses (src/lifeos/rules.js pointRulesSchema), and adding a rule next phase is a schema
-- change in one file instead of an ALTER here. The one key the DATABASE reads — dailyEarnCap, by
-- the cap trigger below — is CHECKed to exist as an integer.
CREATE TABLE IF NOT EXISTS point_rule_sets (
  id          INTEGER PRIMARY KEY,
  rules_json  TEXT NOT NULL CHECK (json_valid(rules_json)
                                   AND json_type(rules_json) = 'object'
                                   AND length(rules_json) BETWEEN 2 AND 4000
                                   AND json_type(rules_json, '$.dailyEarnCap') = 'integer'
                                   AND json_extract(rules_json, '$.dailyEarnCap') BETWEEN 0 AND 10000),
  note        TEXT CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 280),
  -- SET NULL so erasing an admin cannot destroy the rule history; the immutability trigger carries
  -- the matching carve-out (014:96 idiom), as coin_ledger does for actor_user_id.
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TRIGGER IF NOT EXISTS trg_point_rule_set_immutable
BEFORE UPDATE ON point_rule_sets FOR EACH ROW
WHEN NOT (OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
      AND NEW.id IS OLD.id AND NEW.rules_json IS OLD.rules_json
      AND NEW.note IS OLD.note AND NEW.created_at IS OLD.created_at)
BEGIN
  SELECT RAISE(ABORT, 'a rule set is history and cannot be rewritten');
END;

-- Nothing cascades into this table (created_by is SET NULL, an UPDATE), so a DELETE trigger cannot
-- block an account deletion — unlike coin_ledger, where one would.
CREATE TRIGGER IF NOT EXISTS trg_point_rule_set_no_delete
BEFORE DELETE ON point_rule_sets FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'a rule set is history and cannot be deleted');
END;

-- Version 1: f_app DEFAULT_RULES, the fractional ones in basis points, plus the economy sheet's
-- daily cap. verify-lifeos-rules.mjs asserts this row equals DEFAULT_RULES in src/lifeos/rules.js,
-- so the two copies cannot drift apart unnoticed.
INSERT OR IGNORE INTO point_rule_sets (id, rules_json, note) VALUES (1, json('{
  "habitSuccess": 10, "habitPenalty": 5, "badHabitCleanDay": 15,
  "badHabitRelapseFactorBp": 20000, "badHabitRelapseDailyCap": 30, "partialHabitMinPct": 50,
  "taskLow": 5, "taskMid": 10, "taskHigh": 20, "taskLatePct": 50, "taskOverdue": 5,
  "workoutComplete": 30, "workoutFullPct": 80, "workoutHalfPct": 50,
  "challengePoints": 15, "focusPointsPerHour": 20, "focusCheckinPoint": 2,
  "mealEaten": 3, "perfectDayNeedsKcal": 1, "kcalGoalHit": 20, "kcalGoalMissed": 10, "perfectDay": 25,
  "streakTier1Days": 7, "streakTier1MultBp": 12500, "streakTier2Days": 30, "streakTier2MultBp": 15000,
  "milestone1Days": 7, "milestone1Bonus": 25, "milestone2Days": 30, "milestone2Bonus": 100,
  "milestone3Days": 100, "milestone3Bonus": 500, "freezeEvery": 30, "maxFreezes": 2,
  "dailyEarnCap": 400
}'), 'f_app defaults + the economy sheet (owner, 2026-10-18)');


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. coin_reasons — xp and spend, and the LifeOS reasons
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE coin_reasons ADD COLUMN xp INTEGER NOT NULL DEFAULT 0 CHECK (xp IN (0, 1));
ALTER TABLE coin_reasons ADD COLUMN spend INTEGER NOT NULL DEFAULT 0 CHECK (spend IN (0, 1));

-- A purchase is a spend. An admin debit keeps 019's behaviour (it may not overdraw) — a support
-- correction that would put somebody in debt is a business conversation, not a button.
UPDATE coin_reasons SET spend = 1 WHERE key IN ('store.purchase', 'admin.debit');

-- Every LifeOS movement points at a coin_event. Ceilings in minor units: an earn can never exceed
-- the largest daily cap the rules allow (10000 coins), a penalty or a reversal the largest single
-- amount a rule can produce (1000 coins, the relapse cap).
INSERT OR IGNORE INTO coin_reasons (key, sign, ref_type, max_minor, label, xp, spend) VALUES
  ('workout.completed', 1, 'coin_event', 1000000, 'Workout completed',       1, 0),
  ('task.done',         1, 'coin_event', 1000000, 'Task completed',          1, 0),
  ('habit.done',        1, 'coin_event', 1000000, 'Habit done',              1, 0),
  ('habit.clean_day',   1, 'coin_event', 1000000, 'Clean day',               1, 0),
  ('streak.milestone',  1, 'coin_event', 1000000, 'Streak milestone',        1, 0),
  ('day.kcal_hit',      1, 'coin_event', 1000000, 'Calorie goal hit',        1, 0),
  ('day.perfect',       1, 'coin_event', 1000000, 'Perfect day',             1, 0),
  ('focus.finish',      1, 'coin_event', 1000000, 'Focus session',           1, 0),
  ('habit.missed',     -1, 'coin_event', 100000,  'Habit missed',            0, 0),
  ('habit.relapse',    -1, 'coin_event', 100000,  'Relapse',                 0, 0),
  ('task.overdue',     -1, 'coin_event', 100000,  'Task overdue',            0, 0),
  ('day.kcal_over',    -1, 'coin_event', 100000,  'Calorie goal exceeded',   0, 0),
  ('reversal.credit',   1, 'coin_event', 1000000, 'Reversal',                0, 0),
  ('reversal.debit',   -1, 'coin_event', 1000000, 'Reversal',                0, 0);


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. coin_events — what a LifeOS movement IS, before it is money
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- An event is written first and its ledger row second, inside the same worker transaction
-- (src/db/tx/lifeos.js postCoinEvent: cap -> event -> ledger). The ledger row carries
-- ref_type 'coin_event', ref_id = this id, and trg_coin_ledger_ref_truthful below proves they agree.
--
-- REPEATABLE, BUT ONCE PER THING. The natural key is (user, reason, source, seq) among
-- NON-reversal events: one award per workout, one kcal outcome per day. `seq` is what lets a thing
-- pay AGAIN after it was taken back (a task completed, reopened, completed) — and the seq trigger
-- allows seq n only when seq n-1 has been reversed, so a second live award for one thing is
-- unstorable rather than merely unlikely.
--
-- UNDO IS A NEW EVENT (plan L3): a reversal points at its original through a UNIQUE
-- reverses_event_id, carries the exact negated amount, and moves the balance through the same
-- ledger. Nothing is ever updated, so a reversal can never be "lost" and can never be applied twice.
CREATE TABLE IF NOT EXISTS coin_events (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason_key        TEXT NOT NULL REFERENCES coin_reasons(key) ON DELETE RESTRICT,
  amount_minor      INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor <> 0),
  -- The XP this event adds (or, for the reversal of an XP award, removes). Derived from the reason
  -- and proven by trg_coin_event_shape; stored so XP is one indexed SUM, never a join per read.
  xp_minor          INTEGER NOT NULL DEFAULT 0 CHECK (typeof(xp_minor) = 'integer'),
  -- The LOGICAL day the movement belongs to (src/lifeos/dates.js) — the day the cap counts against.
  local_date        TEXT NOT NULL CHECK (local_date = date(local_date)),
  -- What paid. Polymorphic and without an FK, like coin_ledger.ref_*: a money record must outlive
  -- the thing it paid for. 'day' events use the epoch day number of local_date as source_id.
  source_type       TEXT NOT NULL CHECK (length(source_type) BETWEEN 2 AND 40
                                         AND source_type GLOB '[a-z]*'
                                         AND source_type NOT GLOB '*[^a-z_]*'),
  source_id         INTEGER NOT NULL CHECK (typeof(source_id) = 'integer' AND source_id > 0),
  seq               INTEGER NOT NULL DEFAULT 0
                    CHECK (typeof(seq) = 'integer' AND seq BETWEEN 0 AND 1000),
  reverses_event_id INTEGER UNIQUE REFERENCES coin_events(id) ON DELETE CASCADE,
  rules_version     INTEGER REFERENCES point_rule_sets(id),
  request_id        TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 64),
  note              TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 280),
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS coin_events_natural_uidx
  ON coin_events (user_id, reason_key, source_type, source_id, seq) WHERE reverses_event_id IS NULL;
-- The day's earnings (the cap) and the day's net (the week chart).
CREATE INDEX IF NOT EXISTS coin_events_day_idx ON coin_events (user_id, local_date, amount_minor);
-- XP = SUM(xp_minor), covering.
CREATE INDEX IF NOT EXISTS coin_events_xp_idx ON coin_events (user_id, xp_minor);

-- The reason must be a live LifeOS reason; the sign must match it; the magnitude must be within its
-- ceiling; xp_minor must be what the reason says (the amount for an XP earn, 0 otherwise, and the
-- original's negation for a reversal); a reversal reason only on a reversal and vice versa.
CREATE TRIGGER IF NOT EXISTS trg_coin_event_shape
BEFORE INSERT ON coin_events FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM coin_reasons r
   WHERE r.key = NEW.reason_key
     AND r.active = 1
     AND r.ref_type = 'coin_event'
     AND ((r.sign = 1 AND NEW.amount_minor > 0) OR (r.sign = -1 AND NEW.amount_minor < 0))
     AND abs(NEW.amount_minor) <= r.max_minor
     AND ((NEW.reverses_event_id IS NULL
           AND r.key NOT IN ('reversal.credit', 'reversal.debit')
           AND NEW.xp_minor = CASE WHEN r.xp = 1 THEN NEW.amount_minor ELSE 0 END)
       OR (NEW.reverses_event_id IS NOT NULL
           AND r.key IN ('reversal.credit', 'reversal.debit')
           AND NEW.seq = 0
           AND NEW.xp_minor = -(SELECT o.xp_minor FROM coin_events o
                                 WHERE o.id = NEW.reverses_event_id))))
BEGIN
  SELECT RAISE(ABORT, 'this coin event contradicts the reason it claims');
END;

-- A reversal undoes exactly one ORIGINAL of the same person: the exact negated amount, the same
-- thing and the same day. A reversal of a reversal is refused (undo the undo by paying again, which
-- the seq rule governs).
CREATE TRIGGER IF NOT EXISTS trg_coin_event_reversal_truthful
BEFORE INSERT ON coin_events FOR EACH ROW
WHEN NEW.reverses_event_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM coin_events o
   WHERE o.id = NEW.reverses_event_id
     AND o.user_id = NEW.user_id
     AND o.reverses_event_id IS NULL
     AND NEW.amount_minor = -o.amount_minor
     AND NEW.source_type = o.source_type
     AND NEW.source_id = o.source_id
     AND NEW.local_date = o.local_date)
BEGIN
  SELECT RAISE(ABORT, 'a reversal must undo exactly one movement of the same account');
END;

-- seq n exists only after seq n-1 of the same thing was reversed: one live award per thing.
CREATE TRIGGER IF NOT EXISTS trg_coin_event_seq
BEFORE INSERT ON coin_events FOR EACH ROW
WHEN NEW.reverses_event_id IS NULL AND NEW.seq > 0 AND NOT EXISTS (
  SELECT 1 FROM coin_events p
    JOIN coin_events rv ON rv.reverses_event_id = p.id
   WHERE p.user_id = NEW.user_id
     AND p.reason_key = NEW.reason_key
     AND p.source_type = NEW.source_type
     AND p.source_id = NEW.source_id
     AND p.seq = NEW.seq - 1
     AND p.reverses_event_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'this thing has already been paid for');
END;

-- THE DAILY EARN CAP, AS A BACKSTOP (economy sheet: 400 coins per logical day). postCoinEvent
-- trims an award to the room left, so this never fires on the real path; it is what makes "the
-- cap was bypassed" unstorable for every other writer. It reads the rule set in force — the cap
-- is an admin rule (the Szabályok frame's "Napi plafon"). Earned = positive original events of the
-- day that have not been reversed; a reversal.credit (undoing a penalty) is not an earn.
CREATE TRIGGER IF NOT EXISTS trg_coin_event_daily_cap
BEFORE INSERT ON coin_events FOR EACH ROW
WHEN NEW.amount_minor > 0 AND NEW.reverses_event_id IS NULL
 AND (SELECT COALESCE(SUM(e.amount_minor), 0) FROM coin_events e
       WHERE e.user_id = NEW.user_id AND e.local_date = NEW.local_date
         AND e.amount_minor > 0 AND e.reverses_event_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM coin_events x WHERE x.reverses_event_id = e.id))
     + NEW.amount_minor
     > 100 * (SELECT json_extract(s.rules_json, '$.dailyEarnCap') FROM point_rule_sets s
               ORDER BY s.id DESC LIMIT 1)
BEGIN
  SELECT RAISE(ABORT, 'the daily coin cap is reached');
END;

-- Append-only. No FK action ever UPDATEs this table (user and reversal are CASCADE deletes), so
-- there is no carve-out. A DELETE trigger is deliberately absent: it would abort the cascade from
-- users and make account deletion impossible (019's reasoning for coin_ledger).
CREATE TRIGGER IF NOT EXISTS trg_coin_event_immutable
BEFORE UPDATE ON coin_events FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'a coin event is history and cannot be rewritten');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. daily_summaries — one row per settled day
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- The PRIMARY KEY is the day close's idempotency: a day settles at most once, under concurrency,
-- because a second INSERT aborts and rolls its whole transaction (and its coin events) back.
-- Coins earned / lost on the day are NOT stored here: they are SUM()s over coin_events by
-- local_date, so a later reversal shows up in the day's figure instead of contradicting it.
-- Habit and task counts exist from day one so Phase 3 adds behaviour, not columns.
CREATE TABLE IF NOT EXISTS daily_summaries (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date       TEXT NOT NULL CHECK (local_date = date(local_date)),
  -- 'closed' settled with coins; 'lapsed' was older than the catch-up window (plan L6): no coins,
  -- no penalty, the streaks reset.
  status           TEXT NOT NULL CHECK (status IN ('closed', 'lapsed')),
  workout_due      INTEGER CHECK (workout_due IS NULL OR workout_due IN (0, 1)),
  workout_done     INTEGER CHECK (workout_done IS NULL OR workout_done IN (0, 1)),
  kcal_target_x10  INTEGER CHECK (kcal_target_x10 IS NULL OR (typeof(kcal_target_x10) = 'integer' AND kcal_target_x10 >= 0)),
  kcal_eaten_x10   INTEGER CHECK (kcal_eaten_x10 IS NULL OR (typeof(kcal_eaten_x10) = 'integer' AND kcal_eaten_x10 >= 0)),
  kcal_outcome     TEXT CHECK (kcal_outcome IS NULL OR kcal_outcome IN ('hit', 'over', 'under', 'no_data')),
  habits_scheduled INTEGER NOT NULL DEFAULT 0 CHECK (typeof(habits_scheduled) = 'integer' AND habits_scheduled >= 0),
  habits_done      INTEGER NOT NULL DEFAULT 0 CHECK (typeof(habits_done) = 'integer' AND habits_done >= 0),
  tasks_due        INTEGER NOT NULL DEFAULT 0 CHECK (typeof(tasks_due) = 'integer' AND tasks_due >= 0),
  tasks_done       INTEGER NOT NULL DEFAULT 0 CHECK (typeof(tasks_done) = 'integer' AND tasks_done >= 0),
  perfect_day      INTEGER NOT NULL DEFAULT 0 CHECK (perfect_day IN (0, 1)),
  rules_version    INTEGER REFERENCES point_rule_sets(id),
  closed_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, local_date),
  -- A lapsed day settled nothing: no outcome, no perfect day.
  CHECK (status = 'closed' OR (perfect_day = 0 AND workout_due IS NULL AND workout_done IS NULL
                               AND kcal_outcome IS NULL)),
  CHECK (status = 'lapsed' OR (workout_due IS NOT NULL AND workout_done IS NOT NULL
                               AND kcal_outcome IS NOT NULL))
);

CREATE TRIGGER IF NOT EXISTS trg_daily_summary_immutable
BEFORE UPDATE ON daily_summaries FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'a settled day cannot be rewritten');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. the trigger swaps on coin_ledger
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- NEVER-NEGATIVE -> SPEND-COVERED (plan L3). The same placement (the ledger INSERT, never the
-- wallet UPDATE — 019's cascade argument) and the same message, so every route that maps it keeps
-- working; it now fires only for a reason marked as a spend.
DROP TRIGGER IF EXISTS trg_coin_ledger_never_negative;
CREATE TRIGGER IF NOT EXISTS trg_coin_ledger_spend_covered
BEFORE INSERT ON coin_ledger FOR EACH ROW
WHEN (SELECT r.spend FROM coin_reasons r WHERE r.key = NEW.reason_key) = 1
 AND (SELECT w.balance_minor FROM coin_wallets w WHERE w.user_id = NEW.user_id)
     + NEW.amount_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'you do not have enough coins');
END;

-- REF-TRUTHFUL, recreated with the coin_event clause. The first two clauses are 019's, verbatim.
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
BEGIN
  SELECT RAISE(ABORT, 'this movement does not match the thing it is paying for');
END;

PRAGMA user_version = 31;
