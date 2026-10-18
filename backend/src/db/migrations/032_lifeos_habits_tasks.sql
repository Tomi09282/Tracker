-- 032_lifeos_habits_tasks.sql — habits, their daily logs, their settled day results, and tasks.
-- Applies on top of 031 (the LifeOS core). Approved plan: C:/Users/Petike/.claude/plans/
-- abundant-booping-willow.md, Phase 3 "Habits + tasks + Ma"; the economy sheet (owner, 2026-10-18)
-- and the owner's ruling that streak milestones are OUTSIDE the daily earn cap.
--
-- ═══ WHAT IS NEW, AND WHY EACH IS A TABLE ══════════════════════════════════════════════════════
--
--   habits             what the user wants to do (good) or stop doing (bad). User-defined, so every
--                      number on it is bounded here: the per-item coins are at most 50 (the habit
--                      form's "legfeljebb 50"), the item cap (20 live habits) lives in the
--                      transaction because a CHECK cannot count rows.
--   habit_logs         what the user SAID about a habit on a logical day: a count, a skip, relapses.
--                      Editable until that day settles — and not one write after (trigger below).
--   habit_day_results  what the DAY CLOSE decided about a habit on a day: the outcome, the streak,
--                      the freezes. Immutable. Streaks and freezes are DERIVED from the newest row
--                      (plan: "streaks / freezes are derived from immutable habit_day_results, not
--                      mutable counters"), so there is no counter on `habits` that a bug could drift.
--                      Its id is the source of every habit coin event of that day.
--   tasks              one-off tasks, recurring templates (recurrence IS NOT NULL) and the instances
--                      the materializer creates from a template (parent_task_id).
--
-- ═══ AND WHAT CHANGES IN 031 ═══════════════════════════════════════════════════════════════════
--
--   * coin_reasons gains `cap_exempt`: the owner ruled that streak milestones (7 / 30 / 100 days)
--     do not count against the 400-coin daily cap. trg_coin_event_daily_cap is recreated to skip
--     them, both as the new event and in the day's sum.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. habits
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS habits (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80 AND name = trim(name)),
  kind            TEXT NOT NULL CHECK (kind IN ('good', 'bad')),
  -- f_app: daily · weekdays (a Monday-first bit mask, bit0 = Monday) · times_per_week (any day
  -- counts, the weekly quota is checked when the week ends on Sunday).
  schedule_type   TEXT NOT NULL DEFAULT 'daily' CHECK (schedule_type IN ('daily', 'weekdays', 'times_per_week')),
  weekday_mask    INTEGER NOT NULL DEFAULT 127
                  CHECK (typeof(weekday_mask) = 'integer' AND weekday_mask BETWEEN 1 AND 127),
  times_per_week  INTEGER CHECK (times_per_week IS NULL
                                 OR (typeof(times_per_week) = 'integer' AND times_per_week BETWEEN 1 AND 7)),
  target_count    INTEGER NOT NULL DEFAULT 1
                  CHECK (typeof(target_count) = 'integer' AND target_count BETWEEN 1 AND 100),
  unit            TEXT CHECK (unit IS NULL OR (length(unit) BETWEEN 1 AND 20 AND unit = trim(unit))),
  -- Per-item coins, user-set but capped (plan L1): "legfeljebb 50" on the form. Whole coins.
  points_success  INTEGER NOT NULL CHECK (typeof(points_success) = 'integer' AND points_success BETWEEN 0 AND 50),
  points_penalty  INTEGER NOT NULL CHECK (typeof(points_penalty) = 'integer' AND points_penalty BETWEEN 0 AND 50),
  reminder_time   TEXT CHECK (reminder_time IS NULL
                              OR (reminder_time GLOB '[0-2][0-9]:[0-5][0-9]' AND reminder_time <= '23:59')),
  sort_order      INTEGER NOT NULL DEFAULT 0 CHECK (typeof(sort_order) = 'integer' AND sort_order BETWEEN 0 AND 10000),
  -- The logical day the habit was created: the first day it is scheduled (f_app activeHabitsOn).
  started_on      TEXT NOT NULL CHECK (started_on = date(started_on)),
  archived_at     INTEGER CHECK (archived_at IS NULL OR typeof(archived_at) = 'integer'),
  -- An idempotency key from the client: a replayed create returns the habit it already made.
  client_key      TEXT NOT NULL CHECK (length(client_key) BETWEEN 8 AND 64
                                       AND client_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  -- A bad habit is a daily thing to stay away from: no count, no weekly quota (f_app's form).
  CHECK (kind = 'good' OR (schedule_type = 'daily' AND target_count = 1)),
  CHECK ((schedule_type = 'times_per_week') = (times_per_week IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS habits_client_key_uidx ON habits (user_id, client_key);
CREATE INDEX IF NOT EXISTS habits_user_idx ON habits (user_id, archived_at, sort_order, id);

-- The day a habit starts is the day it was created; moving it would re-open or skip settled days.
CREATE TRIGGER IF NOT EXISTS trg_habit_identity_frozen
BEFORE UPDATE OF user_id, kind, started_on, client_key ON habits FOR EACH ROW
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.kind IS NOT OLD.kind
  OR NEW.started_on IS NOT OLD.started_on OR NEW.client_key IS NOT OLD.client_key
BEGIN
  SELECT RAISE(ABORT, 'a habit keeps its owner, kind and start day');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. habit_logs — what the user said about a day, editable until the day settles
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS habit_logs (
  id          INTEGER PRIMARY KEY,
  habit_id    INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  -- Denormalised owner, proven equal to the habit's by trg_habit_log_owner: the settled-day
  -- trigger and every ownership-scoped read key on it without a join.
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date  TEXT NOT NULL CHECK (local_date = date(local_date)),
  -- Good habit: completions (0..target). Bad habit: relapses that day.
  count       INTEGER NOT NULL DEFAULT 0 CHECK (typeof(count) = 'integer' AND count BETWEEN 0 AND 100),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped', 'relapse')),
  -- When the count reached the target (the "kész 07:40" line); NULL unless status = 'done'.
  done_at     INTEGER CHECK (done_at IS NULL OR typeof(done_at) = 'integer'),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (habit_id, local_date),
  CHECK ((status = 'done') = (done_at IS NOT NULL)),
  CHECK (status <> 'skipped' OR count = 0),
  CHECK (status <> 'relapse' OR count > 0)
);

CREATE INDEX IF NOT EXISTS habit_logs_user_day_idx ON habit_logs (user_id, local_date);

-- The log and its habit belong to the same person (insert and every update).
CREATE TRIGGER IF NOT EXISTS trg_habit_log_owner
BEFORE INSERT ON habit_logs FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM habits h WHERE h.id = NEW.habit_id AND h.user_id = NEW.user_id)
BEGIN
  SELECT RAISE(ABORT, 'a habit log must belong to the habit''s owner');
END;

CREATE TRIGGER IF NOT EXISTS trg_habit_log_owner_upd
BEFORE UPDATE ON habit_logs FOR EACH ROW
WHEN NEW.habit_id IS NOT OLD.habit_id OR NEW.user_id IS NOT OLD.user_id OR NEW.local_date IS NOT OLD.local_date
BEGIN
  SELECT RAISE(ABORT, 'a habit log keeps its habit, owner and day');
END;

-- THE EDIT WINDOW (plan L4): a day is editable until it settles. Once daily_summaries holds the
-- day, a log of that day can no longer be written — not by the routes (which refuse first, with a
-- 409) and not by any other writer. No DELETE trigger: the user's erasure cascades through here and
-- a refusing trigger would make account deletion impossible (019's reasoning for coin_ledger).
CREATE TRIGGER IF NOT EXISTS trg_habit_log_settled_insert
BEFORE INSERT ON habit_logs FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_summaries s WHERE s.user_id = NEW.user_id AND s.local_date = NEW.local_date)
BEGIN
  SELECT RAISE(ABORT, 'this day has settled and can no longer be edited');
END;

CREATE TRIGGER IF NOT EXISTS trg_habit_log_settled_update
BEFORE UPDATE ON habit_logs FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_summaries s WHERE s.user_id = OLD.user_id AND s.local_date = OLD.local_date)
BEGIN
  SELECT RAISE(ABORT, 'this day has settled and can no longer be edited');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. habit_day_results — what the day close decided, immutable
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- One row per habit per settled day on which the habit was scheduled (an unscheduled weekday is
-- transparent and has no row), plus one 'lapsed' row per habit at the end of a lapsed gap (plan L6:
-- older gaps reset the streak, no coins, no penalty).
--
--   outcome   done     the target was reached (good) — streak +1
--             missed   a scheduled good habit not done (a partial >= 50 % still pays its share), or
--                      a times-per-week quota missed on Sunday — streak 0
--             skipped  the user skipped the day — streak unchanged, no coins
--             frozen   a miss excused by a streak freeze — streak unchanged, no penalty
--             open     a times-per-week habit not done on a weekday — no change, no penalty
--             clean    a bad habit with no relapse — streak +1
--             relapse  a bad habit with relapses — streak 0
--             lapsed   the end of a lapsed gap — streak 0, best and freezes kept
CREATE TABLE IF NOT EXISTS habit_day_results (
  id                INTEGER PRIMARY KEY,
  habit_id          INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date        TEXT NOT NULL CHECK (local_date = date(local_date)),
  outcome           TEXT NOT NULL CHECK (outcome IN ('done', 'missed', 'skipped', 'frozen', 'open', 'clean', 'relapse', 'lapsed')),
  count             INTEGER NOT NULL DEFAULT 0 CHECK (typeof(count) = 'integer' AND count BETWEEN 0 AND 100),
  target_count      INTEGER NOT NULL DEFAULT 1 CHECK (typeof(target_count) = 'integer' AND target_count BETWEEN 1 AND 100),
  -- The multiplier the day was paid at (the streak BEFORE the day), basis points.
  multiplier_bp     INTEGER NOT NULL DEFAULT 10000 CHECK (typeof(multiplier_bp) = 'integer' AND multiplier_bp BETWEEN 10000 AND 50000),
  streak_after      INTEGER NOT NULL CHECK (typeof(streak_after) = 'integer' AND streak_after >= 0),
  best_after        INTEGER NOT NULL CHECK (typeof(best_after) = 'integer' AND best_after >= streak_after),
  freezes_after     INTEGER NOT NULL CHECK (typeof(freezes_after) = 'integer' AND freezes_after BETWEEN 0 AND 10),
  -- Times-per-week habits: consecutive weeks with the quota met ("4 HÉT"); NULL for the others.
  week_streak_after INTEGER CHECK (week_streak_after IS NULL OR (typeof(week_streak_after) = 'integer' AND week_streak_after >= 0)),
  -- Sunday rows of a times-per-week habit: was the week's quota met? NULL otherwise.
  quota_met         INTEGER CHECK (quota_met IS NULL OR quota_met IN (0, 1)),
  -- The milestone the streak reached on this day (7 / 30 / 100 by default), and a freeze earned.
  milestone_days    INTEGER CHECK (milestone_days IS NULL OR (typeof(milestone_days) = 'integer' AND milestone_days > 0)),
  freeze_earned     INTEGER NOT NULL DEFAULT 0 CHECK (freeze_earned IN (0, 1)),
  rules_version     INTEGER REFERENCES point_rule_sets(id),
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (habit_id, local_date)
);

CREATE INDEX IF NOT EXISTS habit_day_results_user_idx ON habit_day_results (user_id, local_date);

CREATE TRIGGER IF NOT EXISTS trg_habit_result_owner
BEFORE INSERT ON habit_day_results FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM habits h WHERE h.id = NEW.habit_id AND h.user_id = NEW.user_id)
BEGIN
  SELECT RAISE(ABORT, 'a habit result must belong to the habit''s owner');
END;

-- A result is written by the close of ITS day, before that day's summary row: once the day has
-- settled, nothing can add a result to it (and so nothing can add the coins that point at one).
CREATE TRIGGER IF NOT EXISTS trg_habit_result_settled
BEFORE INSERT ON habit_day_results FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM daily_summaries s WHERE s.user_id = NEW.user_id AND s.local_date = NEW.local_date)
BEGIN
  SELECT RAISE(ABORT, 'this day has settled and can no longer be edited');
END;

CREATE TRIGGER IF NOT EXISTS trg_habit_result_immutable
BEFORE UPDATE ON habit_day_results FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'a settled habit day cannot be rewritten');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. tasks
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Three shapes in one table, as in f_app:
--   one-off    recurrence NULL, parent_task_id NULL
--   template   recurrence NOT NULL — never shown in day lists, never completed; the materializer
--              turns it into instances for today .. today + 7 (MATERIALIZE_DAYS)
--   instance   parent_task_id = the template, occurrence_on = its day (UNIQUE per template, so a
--              (template, day) pair is created at most once — and a deleted occurrence stays deleted)
--
-- The due day is a LOGICAL day (due_on) plus an optional wall-clock time (due_time): "ma" with no
-- time is a real shape on the Feladatok frame. Completion stores the logical day it happened on
-- (completed_on) — the day the coins count against and the day whose settle locks the reopen.
CREATE TABLE IF NOT EXISTS tasks (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120 AND title = trim(title)),
  notes           TEXT CHECK (notes IS NULL OR length(notes) BETWEEN 1 AND 1000),
  priority        INTEGER NOT NULL DEFAULT 2 CHECK (priority IN (1, 2, 3)),
  -- f_app's per-task override, capped like a habit's coins.
  points          INTEGER CHECK (points IS NULL OR (typeof(points) = 'integer' AND points BETWEEN 0 AND 50)),
  due_on          TEXT CHECK (due_on IS NULL OR due_on = date(due_on)),
  due_time        TEXT CHECK (due_time IS NULL
                              OR (due_time GLOB '[0-2][0-9]:[0-5][0-9]' AND due_time <= '23:59')),
  recurrence      TEXT CHECK (recurrence IS NULL
                              OR (json_valid(recurrence) AND length(recurrence) <= 100
                                  AND json_extract(recurrence, '$.type') IN ('daily', 'weekly', 'monthly'))),
  parent_task_id  INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  occurrence_on   TEXT CHECK (occurrence_on IS NULL OR occurrence_on = date(occurrence_on)),
  completed_at    INTEGER CHECK (completed_at IS NULL OR typeof(completed_at) = 'integer'),
  completed_on    TEXT CHECK (completed_on IS NULL OR completed_on = date(completed_on)),
  -- The settled day on which the task was found overdue (once; f_app overduePenalizedAt). Whether
  -- that cost coins is in coin_events: a day that lapsed marks without a penalty (plan L6).
  overdue_on      TEXT CHECK (overdue_on IS NULL OR overdue_on = date(overdue_on)),
  deleted_at      INTEGER CHECK (deleted_at IS NULL OR typeof(deleted_at) = 'integer'),
  client_key      TEXT CHECK (client_key IS NULL OR (length(client_key) BETWEEN 8 AND 64
                                                     AND client_key NOT GLOB '*[^A-Za-z0-9_-]*')),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (due_time IS NULL OR due_on IS NOT NULL),
  CHECK (recurrence IS NULL OR (due_on IS NOT NULL AND parent_task_id IS NULL AND completed_at IS NULL)),
  CHECK ((parent_task_id IS NULL) = (occurrence_on IS NULL)),
  CHECK ((completed_at IS NULL) = (completed_on IS NULL)),
  -- A task the user made carries their key; an instance is the materializer's and has none.
  CHECK ((parent_task_id IS NULL) = (client_key IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS tasks_client_key_uidx ON tasks (user_id, client_key) WHERE client_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_occurrence_uidx ON tasks (parent_task_id, occurrence_on) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_open_idx ON tasks (user_id, deleted_at, completed_at, due_on);
CREATE INDEX IF NOT EXISTS tasks_done_idx ON tasks (user_id, completed_on);

-- An instance belongs to its template's owner.
CREATE TRIGGER IF NOT EXISTS trg_task_parent_owner
BEFORE INSERT ON tasks FOR EACH ROW
WHEN NEW.parent_task_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM tasks t WHERE t.id = NEW.parent_task_id AND t.user_id = NEW.user_id AND t.recurrence IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'a task instance must belong to its template''s owner');
END;

CREATE TRIGGER IF NOT EXISTS trg_task_identity_frozen
BEFORE UPDATE OF user_id, parent_task_id, occurrence_on, client_key ON tasks FOR EACH ROW
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.parent_task_id IS NOT OLD.parent_task_id
  OR NEW.occurrence_on IS NOT OLD.occurrence_on OR NEW.client_key IS NOT OLD.client_key
BEGIN
  SELECT RAISE(ABORT, 'a task keeps its owner, template and key');
END;

-- A completion of a SETTLED day is history: it cannot be undone or moved (the reopen window ends
-- when the completion's day settles), and a completion cannot be written onto a settled day.
CREATE TRIGGER IF NOT EXISTS trg_task_completion_settled
BEFORE UPDATE OF completed_at, completed_on ON tasks FOR EACH ROW
WHEN (OLD.completed_on IS NOT NULL AND NEW.completed_on IS NOT OLD.completed_on
      AND EXISTS (SELECT 1 FROM daily_summaries s WHERE s.user_id = OLD.user_id AND s.local_date = OLD.completed_on))
  OR (NEW.completed_on IS NOT NULL AND NEW.completed_on IS NOT OLD.completed_on
      AND EXISTS (SELECT 1 FROM daily_summaries s WHERE s.user_id = NEW.user_id AND s.local_date = NEW.completed_on))
BEGIN
  SELECT RAISE(ABORT, 'this day has settled and can no longer be edited');
END;

-- overdue_on is written once, by the close.
CREATE TRIGGER IF NOT EXISTS trg_task_overdue_once
BEFORE UPDATE OF overdue_on ON tasks FOR EACH ROW
WHEN OLD.overdue_on IS NOT NULL AND NEW.overdue_on IS NOT OLD.overdue_on
BEGIN
  SELECT RAISE(ABORT, 'a task is found overdue once');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. coin reasons: streak milestones are outside the daily cap (owner, 2026-10-18)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE coin_reasons ADD COLUMN cap_exempt INTEGER NOT NULL DEFAULT 0 CHECK (cap_exempt IN (0, 1));
UPDATE coin_reasons SET cap_exempt = 1 WHERE key = 'streak.milestone';

-- The 031 backstop, recreated: an exempt reason neither meets the cap nor counts towards it.
DROP TRIGGER IF EXISTS trg_coin_event_daily_cap;
CREATE TRIGGER IF NOT EXISTS trg_coin_event_daily_cap
BEFORE INSERT ON coin_events FOR EACH ROW
WHEN NEW.amount_minor > 0 AND NEW.reverses_event_id IS NULL
 AND (SELECT r.cap_exempt FROM coin_reasons r WHERE r.key = NEW.reason_key) = 0
 AND (SELECT COALESCE(SUM(e.amount_minor), 0) FROM coin_events e
       JOIN coin_reasons r ON r.key = e.reason_key AND r.cap_exempt = 0
       WHERE e.user_id = NEW.user_id AND e.local_date = NEW.local_date
         AND e.amount_minor > 0 AND e.reverses_event_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM coin_events x WHERE x.reverses_event_id = e.id))
     + NEW.amount_minor
     > 100 * (SELECT json_extract(s.rules_json, '$.dailyEarnCap') FROM point_rule_sets s
               ORDER BY s.id DESC LIMIT 1)
BEGIN
  SELECT RAISE(ABORT, 'the daily coin cap is reached');
END;

PRAGMA user_version = 32;
