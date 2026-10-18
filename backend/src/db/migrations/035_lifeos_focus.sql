-- 035_lifeos_focus.sql — focus sessions: planned blocks of deep work that pay for the time spent.
-- Applies on top of 032 (habits and tasks). 033 (challenges, rewards) and 034 (calendar) are
-- reserved for their own packages; the runner applies a number below the high-water mark correctly
-- (worker.js migrate(), verify-migration-order), so this file does not depend on them.
--
-- Approved plan: C:/Users/Petike/.claude/plans/abundant-booping-willow.md, Phase 6 "Focus +
-- Haladás + closing"; design round B (focus-1 / focus-2 / focus-3, approved 2026-10-18); f_app
-- src/domain/focus.ts (the rules this ports).
--
-- ═══ WHAT IS NEW ═══════════════════════════════════════════════════════════════════════════════
--
--   focus_sessions   one block of focus: a title, a start, a planned length, a check-in interval.
--                    While it runs the user answers "Rajta vagy még?" check-ins; FINISHING pays
--                    for the minutes actually spent (capped at the planned length) plus a bonus per
--                    check-in, CANCELLING ("Feladás") pays nothing. Coins move only at the finish,
--                    through ONE coin event (reason focus.finish, seeded by 031) whose source is the
--                    session's id.
--
-- ═══ WHY EACH GUARD IS IN THE DATABASE ═════════════════════════════════════════════════════════
--
-- The named transactions in src/db/tx/lifeos-focus.js decide every refusal first; the guards below
-- are the backstops that make the farmable shapes UNSTORABLE for every other writer:
--
--   * ONE UNFINISHED SESSION PER USER — a unique partial index. Two sessions running at once would
--     pay the same wall-clock minute twice.
--   * THE PLAN IS FROZEN — start, length and interval never change after the insert, so a running
--     session cannot be stretched into a bigger payout.
--   * CHECK-INS ARE RATE-LIMITED BY THE CLOCK — at most floor(elapsed / interval) of them, one at a
--     time, and two at least 5 minutes apart (f_app MIN_CHECKIN_GAP_MINUTES). "Elapsed" is measured
--     from the row's own start to the check-in's own timestamp — never unixepoch(): the verify
--     scripts move the worker's clock, and a trigger reading a different clock than the
--     transaction would refuse what the transaction correctly allowed.
--   * A FINISH PAYS NO MORE THAN THE TIME — the paid minutes are at most the minutes between the
--     start and the close (and the planned length), the paid check-ins at most the ones answered.
--   * A CLOSED SESSION IS HISTORY — nothing about it can change afterwards.
--   * THE COIN EVENT IS TRUTHFUL — a focus.finish event must point at a DONE session of the same
--     account, on the session's close day, and cannot exceed what that session's paid minutes and
--     check-ins are worth under the rule set the event names (the daily cap may trim it, never
--     raise it).
--
-- Times are epoch SECONDS (unixepoch(), as every other timestamp in this schema). The logical day
-- of a finish (closed_on) is computed by the transaction from the user's zone and day start.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. focus_sessions
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS focus_sessions (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The client's idempotency key: a retried "Fókusz indítása" answers the session it already made.
  client_key       TEXT NOT NULL CHECK (length(client_key) BETWEEN 8 AND 64
                                        AND client_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  -- "Min dolgozol?"
  title            TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120 AND title = trim(title)),
  -- The logical day the session was created on: bounds how many sessions a day can start.
  created_on       TEXT NOT NULL CHECK (created_on = date(created_on)),
  starts_at        INTEGER NOT NULL CHECK (typeof(starts_at) = 'integer' AND starts_at > 0),
  -- f_app MAX_FOCUS_HOURS = 12; the shortest block is 5 minutes.
  planned_minutes  INTEGER NOT NULL CHECK (typeof(planned_minutes) = 'integer' AND planned_minutes BETWEEN 5 AND 720),
  -- "Rajta vagy még?" every N minutes; 0 = no check-ins. Never shorter than the 5-minute de-dup gap.
  checkin_minutes  INTEGER NOT NULL CHECK (typeof(checkin_minutes) = 'integer'
                                           AND (checkin_minutes = 0 OR checkin_minutes BETWEEN 5 AND 180)),
  checkins_done    INTEGER NOT NULL DEFAULT 0 CHECK (typeof(checkins_done) = 'integer' AND checkins_done BETWEEN 0 AND 144),
  last_checkin_at  INTEGER CHECK (last_checkin_at IS NULL OR typeof(last_checkin_at) = 'integer'),
  -- open: planned / running / ran out, waiting for an answer · done: finished and paid · cancelled
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  closed_at        INTEGER CHECK (closed_at IS NULL OR typeof(closed_at) = 'integer'),
  -- The LOGICAL day of the finish / cancel — the day the coins (and the daily focus minutes) count on.
  closed_on        TEXT CHECK (closed_on IS NULL OR closed_on = date(closed_on)),
  -- What the finish paid FOR (the amount itself is the coin event's): minutes and check-ins.
  paid_minutes     INTEGER CHECK (paid_minutes IS NULL OR (typeof(paid_minutes) = 'integer' AND paid_minutes >= 0)),
  paid_checkins    INTEGER CHECK (paid_checkins IS NULL OR (typeof(paid_checkins) = 'integer' AND paid_checkins >= 0)),
  rules_version    INTEGER REFERENCES point_rule_sets(id),
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK ((status = 'open' AND closed_at IS NULL AND closed_on IS NULL
          AND paid_minutes IS NULL AND paid_checkins IS NULL)
      OR (status = 'done' AND closed_at IS NOT NULL AND closed_on IS NOT NULL
          AND paid_minutes IS NOT NULL AND paid_checkins IS NOT NULL)
      OR (status = 'cancelled' AND closed_at IS NOT NULL AND closed_on IS NOT NULL
          AND paid_minutes IS NULL AND paid_checkins IS NULL)),
  CHECK (checkin_minutes > 0 OR (checkins_done = 0 AND last_checkin_at IS NULL)),
  CHECK ((checkins_done = 0) = (last_checkin_at IS NULL)),
  CHECK (paid_minutes IS NULL OR paid_minutes <= planned_minutes),
  CHECK (paid_checkins IS NULL OR paid_checkins <= checkins_done)
);

-- ONE UNFINISHED SESSION PER USER.
CREATE UNIQUE INDEX IF NOT EXISTS focus_sessions_one_open_uidx ON focus_sessions (user_id) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS focus_sessions_client_key_uidx ON focus_sessions (user_id, client_key);
-- The day's paid minutes (the daily focus limit, the Haladás day rows) and the day's starts.
CREATE INDEX IF NOT EXISTS focus_sessions_closed_idx ON focus_sessions (user_id, closed_on, status);
CREATE INDEX IF NOT EXISTS focus_sessions_created_idx ON focus_sessions (user_id, created_on);

-- The plan is frozen: owner, key, title, start, length, interval and creation day never change.
CREATE TRIGGER IF NOT EXISTS trg_focus_plan_frozen
BEFORE UPDATE OF user_id, client_key, title, created_on, starts_at, planned_minutes, checkin_minutes, created_at
ON focus_sessions FOR EACH ROW
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.client_key IS NOT OLD.client_key OR NEW.title IS NOT OLD.title
  OR NEW.created_on IS NOT OLD.created_on OR NEW.starts_at IS NOT OLD.starts_at
  OR NEW.planned_minutes IS NOT OLD.planned_minutes OR NEW.checkin_minutes IS NOT OLD.checkin_minutes
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'a focus session keeps its plan');
END;

-- A closed session is history.
CREATE TRIGGER IF NOT EXISTS trg_focus_closed_immutable
BEFORE UPDATE ON focus_sessions FOR EACH ROW
WHEN OLD.status <> 'open'
BEGIN
  SELECT RAISE(ABORT, 'a closed focus session cannot be changed');
END;

-- CHECK-INS: one at a time, while the session runs, at most floor(elapsed / interval) in all, and
-- at least 5 minutes after the previous one. Elapsed is measured to the check-in's own timestamp.
CREATE TRIGGER IF NOT EXISTS trg_focus_checkin_paced
BEFORE UPDATE OF checkins_done, last_checkin_at ON focus_sessions FOR EACH ROW
WHEN (NEW.checkins_done IS NOT OLD.checkins_done OR NEW.last_checkin_at IS NOT OLD.last_checkin_at)
 AND (NEW.checkins_done <> OLD.checkins_done + 1
      OR NEW.last_checkin_at IS NULL
      OR OLD.checkin_minutes = 0
      OR NEW.last_checkin_at < OLD.starts_at
      OR NEW.last_checkin_at >= OLD.starts_at + 60 * OLD.planned_minutes
      OR (OLD.last_checkin_at IS NOT NULL AND NEW.last_checkin_at - OLD.last_checkin_at < 300)
      OR NEW.checkins_done > ((NEW.last_checkin_at - OLD.starts_at) / 60) / OLD.checkin_minutes)
BEGIN
  SELECT RAISE(ABORT, 'this check-in is not due');
END;

-- CLOSING: open -> done | cancelled only. A finish happens after the start and pays at most the
-- minutes between the start and the close (and the plan), and at most the check-ins answered.
CREATE TRIGGER IF NOT EXISTS trg_focus_close_truthful
BEFORE UPDATE OF status ON focus_sessions FOR EACH ROW
WHEN NEW.status IS NOT OLD.status
 AND (OLD.status <> 'open'
      OR NEW.checkins_done IS NOT OLD.checkins_done
      OR (NEW.status = 'done'
          AND (NEW.closed_at < OLD.starts_at
               OR NEW.paid_minutes > (min(NEW.closed_at, OLD.starts_at + 60 * OLD.planned_minutes) - OLD.starts_at) / 60
               OR NEW.paid_checkins > OLD.checkins_done)))
BEGIN
  SELECT RAISE(ABORT, 'this focus session cannot be closed like that');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. the focus coin event is truthful
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- focus.finish (031) pays only for a DONE session of the same account, on its close day, and never
-- more than its paid minutes and check-ins are worth under the event's rule set:
--   round(paid_minutes x focusPointsPerHour / 60) + paid_checkins x focusCheckinPoint   (coins)
-- f_app focus.ts rounds (Math.round; SQLite round() agrees for positive halves). The daily earn cap
-- may trim an award below this; nothing may raise it above.
CREATE TRIGGER IF NOT EXISTS trg_coin_event_focus_truthful
BEFORE INSERT ON coin_events FOR EACH ROW
WHEN NEW.reason_key = 'focus.finish' AND NEW.reverses_event_id IS NULL AND NOT EXISTS (
  SELECT 1 FROM focus_sessions f
    JOIN point_rule_sets s ON s.id = NEW.rules_version
   WHERE NEW.source_type = 'focus'
     AND f.id = NEW.source_id
     AND f.user_id = NEW.user_id
     AND f.status = 'done'
     AND f.closed_on = NEW.local_date
     AND NEW.amount_minor <= 100 * (
           CAST(round(f.paid_minutes * json_extract(s.rules_json, '$.focusPointsPerHour') / 60.0) AS INTEGER)
           + f.paid_checkins * json_extract(s.rules_json, '$.focusCheckinPoint')))
BEGIN
  SELECT RAISE(ABORT, 'this focus award does not match the session it pays for');
END;

PRAGMA user_version = 35;
