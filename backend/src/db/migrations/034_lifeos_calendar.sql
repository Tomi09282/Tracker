-- 034_lifeos_calendar.sql — calendar events, their reminders, and the record of every reminder the
-- server has delivered as a self-notification. Applies on top of 031 (the LifeOS core) and 032
-- (habits, tasks). Number 034 is reserved for the calendar (plan: 031 core · 032 habits / tasks ·
-- 033 challenges / rewards · 034 events · 035 focus) and applies whether 033 lands before or after
-- it: the runner records each applied file (verify-migration-order), so a lower number written
-- later still applies. Approved plan: C:/Users/Petike/.claude/plans/abundant-booping-willow.md,
-- Phase 5 "Calendar".
--
-- ═══ WHAT IS NEW, AND WHY EACH IS A TABLE ══════════════════════════════════════════════════════
--
--   events               what the user put in the calendar. Stored as the FIRST occurrence's two
--                        instants (start_at / end_at, epoch seconds) plus the wall clock it was
--                        written in (start_local, tz): a recurring event keeps its LOCAL start time
--                        on every occurrence day, so the wall clock is the truth and the instants
--                        are its first resolution. Occurrences are computed when read
--                        (src/lifeos/occurrences.js) and never stored — nothing has to roll forward.
--   event_reminders      offsets before an event's start (0 = at the start), at most four per event.
--   reminder_deliveries  one row per reminder the server has turned into a notification (or chose
--                        not to, because a later offset of the same occurrence was due at the same
--                        time). Its unique key is the dedupe: a reminder is delivered once, however
--                        often the app is opened. Self-notifications for habits and tasks (migration
--                        032's reminder_time and due_time) are recorded here too.
--
-- No coin moves in this migration: the calendar pays nothing (f_app: "Calendar events ... No points
-- involved"). Nothing here touches 031's or 032's tables, triggers or reasons.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. events
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS events (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL CHECK (typeof(title) = 'text' AND length(title) BETWEEN 1 AND 120 AND title = trim(title)),
  notes            TEXT CHECK (notes IS NULL OR (typeof(notes) = 'text' AND length(notes) BETWEEN 1 AND 1000)),
  location         TEXT CHECK (location IS NULL
                               OR (typeof(location) = 'text' AND length(location) BETWEEN 1 AND 160 AND location = trim(location))),
  all_day          INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  -- The first occurrence, as instants (epoch SECONDS, like every other timestamp in this schema).
  start_at         INTEGER NOT NULL CHECK (typeof(start_at) = 'integer'),
  end_at           INTEGER NOT NULL CHECK (typeof(end_at) = 'integer'),
  -- The wall clock it was written in: 'YYYY-MM-DDTHH:MM' in `tz`. An all-day event starts at 00:00.
  start_local      TEXT NOT NULL CHECK (length(start_local) = 16
                                        AND substr(start_local, 1, 10) = date(substr(start_local, 1, 10))
                                        AND substr(start_local, 11, 1) = 'T'
                                        AND substr(start_local, 12, 5) GLOB '[0-2][0-9]:[0-5][0-9]'
                                        AND substr(start_local, 12, 5) <= '23:59'),
  -- The IANA zone the event was written in (user_prefs.timezone at the time). Bounded shape only:
  -- the runtime's own zone check ran in the transaction that wrote it.
  tz               TEXT NOT NULL CHECK (length(tz) BETWEEN 3 AND 64 AND tz NOT GLOB '*[^A-Za-z0-9_+/-]*'),
  -- NULL = once. Otherwise one of four rule shapes (src/lifeos/events.js eventRecurrenceSchema, event-times.js parseEventRecurrence).
  recurrence_json  TEXT CHECK (recurrence_json IS NULL
                               OR (length(recurrence_json) <= 120 AND json_valid(recurrence_json)
                                   AND json_type(recurrence_json) = 'object'
                                   AND json_extract(recurrence_json, '$.type') IN ('daily', 'weekly', 'monthly', 'yearly'))),
  -- The last day a rule may produce an occurrence on (inclusive, the event's own local dates).
  until_date       TEXT CHECK (until_date IS NULL OR until_date = date(until_date)),
  -- An idempotency key from the client: a replayed create returns the event it already made.
  client_key       TEXT NOT NULL CHECK (length(client_key) BETWEEN 8 AND 64
                                        AND client_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  -- An end is never before the start, and nothing lasts longer than 14 days (plan B). The extra
  -- hour admits a 14-day all-day run that contains a DST change (local midnights, 14 x 24 h + 1 h).
  CHECK (end_at >= start_at AND end_at - start_at <= 14 * 86400 + 3600),
  -- An all-day event begins at local midnight and lasts whole days (23 / 24 / 25 h each).
  CHECK (all_day = 0 OR (substr(start_local, 12, 5) = '00:00' AND end_at - start_at >= 82800)),
  -- An until date belongs to a rule, and is never before the first day.
  CHECK (until_date IS NULL OR (recurrence_json IS NOT NULL AND until_date >= substr(start_local, 1, 10)))
);

CREATE UNIQUE INDEX IF NOT EXISTS events_client_key_uidx ON events (user_id, client_key);
-- The calendar read: a user's events that can touch a window (start before its end).
CREATE INDEX IF NOT EXISTS events_user_start_idx ON events (user_id, start_at);

-- An event keeps its owner and its idempotency key; everything else is the user's to edit.
CREATE TRIGGER IF NOT EXISTS trg_event_identity_frozen
BEFORE UPDATE OF user_id, client_key ON events FOR EACH ROW
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.client_key IS NOT OLD.client_key
BEGIN
  SELECT RAISE(ABORT, 'an event keeps its owner and client key');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. event_reminders — offsets before the start, at most four per event
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_reminders (
  id              INTEGER PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- Denormalised owner, proven equal to the event's by trg_event_reminder_owner.
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Minutes before the start: 0 (at the start) .. 10080 (a week).
  offset_minutes  INTEGER NOT NULL CHECK (typeof(offset_minutes) = 'integer' AND offset_minutes BETWEEN 0 AND 10080),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (event_id, offset_minutes)
);

CREATE INDEX IF NOT EXISTS event_reminders_user_idx ON event_reminders (user_id, event_id);

CREATE TRIGGER IF NOT EXISTS trg_event_reminder_owner
BEFORE INSERT ON event_reminders FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM events e WHERE e.id = NEW.event_id AND e.user_id = NEW.user_id)
BEGIN
  SELECT RAISE(ABORT, 'a reminder must belong to the event''s owner');
END;

-- At most four per event. A CHECK cannot count rows; this trigger can, and it refuses the fifth
-- whatever wrote it (the transaction refuses first, with a 400).
CREATE TRIGGER IF NOT EXISTS trg_event_reminder_cap
BEFORE INSERT ON event_reminders FOR EACH ROW
WHEN (SELECT COUNT(*) FROM event_reminders r WHERE r.event_id = NEW.event_id) >= 4
BEGIN
  SELECT RAISE(ABORT, 'an event has at most four reminders');
END;

-- A reminder is replaced, never edited (the event form sends the whole set).
CREATE TRIGGER IF NOT EXISTS trg_event_reminder_immutable
BEFORE UPDATE ON event_reminders FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'a reminder is replaced, not edited');
END;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. reminder_deliveries — the dedupe record of every self-notification
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reminder_deliveries (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('event', 'habit', 'task')),
  -- Exactly one subject, the one `kind` names. A deleted event takes its deliveries with it.
  event_id         INTEGER REFERENCES events(id) ON DELETE CASCADE,
  habit_id         INTEGER REFERENCES habits(id) ON DELETE CASCADE,
  task_id          INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  -- The instant the reminder is ABOUT (epoch s): the occurrence's start, the habit's reminder time
  -- on its day, the task's due time. Editing an event's time makes a new occurrence, so a new
  -- reminder — the old one cannot block it.
  occurrence_at    INTEGER NOT NULL CHECK (typeof(occurrence_at) = 'integer'),
  -- Minutes before occurrence_at it fired (an event's offset; 0 for a habit; 60 for a task).
  offset_minutes   INTEGER NOT NULL CHECK (typeof(offset_minutes) = 'integer' AND offset_minutes BETWEEN 0 AND 10080),
  fire_at          INTEGER NOT NULL CHECK (typeof(fire_at) = 'integer'),
  -- The notification it became; NULL when a later offset of the same occurrence was delivered
  -- instead (superseded) or the notification is gone.
  notification_id  INTEGER REFERENCES notifications(id) ON DELETE SET NULL,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK ((kind = 'event') = (event_id IS NOT NULL)
     AND (kind = 'habit') = (habit_id IS NOT NULL)
     AND (kind = 'task')  = (task_id IS NOT NULL)),
  CHECK (fire_at = occurrence_at - offset_minutes * 60)
);

-- THE DEDUPE: one delivery per (subject, occurrence, offset). The subject is whichever of the
-- three ids is set (the CHECK above proves exactly one is), so coalesce() names it.
CREATE UNIQUE INDEX IF NOT EXISTS reminder_deliveries_dedupe_uidx
  ON reminder_deliveries (user_id, kind, coalesce(event_id, habit_id, task_id), occurrence_at, offset_minutes);
CREATE INDEX IF NOT EXISTS reminder_deliveries_user_fire_idx ON reminder_deliveries (user_id, fire_at);
CREATE INDEX IF NOT EXISTS reminder_deliveries_habit_idx ON reminder_deliveries (habit_id) WHERE habit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reminder_deliveries_task_idx ON reminder_deliveries (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reminder_deliveries_notification_idx ON reminder_deliveries (notification_id) WHERE notification_id IS NOT NULL;

-- The subject belongs to the same person as the delivery.
CREATE TRIGGER IF NOT EXISTS trg_reminder_delivery_owner
BEFORE INSERT ON reminder_deliveries FOR EACH ROW
WHEN NOT CASE NEW.kind
  WHEN 'event' THEN EXISTS (SELECT 1 FROM events e WHERE e.id = NEW.event_id AND e.user_id = NEW.user_id)
  WHEN 'habit' THEN EXISTS (SELECT 1 FROM habits h WHERE h.id = NEW.habit_id AND h.user_id = NEW.user_id)
  WHEN 'task'  THEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = NEW.task_id AND t.user_id = NEW.user_id)
  ELSE 0 END
BEGIN
  SELECT RAISE(ABORT, 'a reminder delivery must belong to its subject''s owner');
END;

-- And its notification is addressed to that person (a self-notification, never someone else's).
CREATE TRIGGER IF NOT EXISTS trg_reminder_delivery_notification
BEFORE INSERT ON reminder_deliveries FOR EACH ROW
WHEN NEW.notification_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM notifications n
                  WHERE n.id = NEW.notification_id AND n.user_id = NEW.user_id AND n.coach_client_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'a reminder notification is addressed to its owner alone');
END;

-- A delivery is a record of something that happened. Only the FK's own SET NULL may touch it.
CREATE TRIGGER IF NOT EXISTS trg_reminder_delivery_immutable
BEFORE UPDATE ON reminder_deliveries FOR EACH ROW
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.kind IS NOT OLD.kind
  OR NEW.event_id IS NOT OLD.event_id OR NEW.habit_id IS NOT OLD.habit_id OR NEW.task_id IS NOT OLD.task_id
  OR NEW.occurrence_at IS NOT OLD.occurrence_at OR NEW.offset_minutes IS NOT OLD.offset_minutes
  OR NEW.fire_at IS NOT OLD.fire_at OR NEW.created_at IS NOT OLD.created_at
  OR (NEW.notification_id IS NOT NULL AND NEW.notification_id IS NOT OLD.notification_id)
BEGIN
  SELECT RAISE(ABORT, 'a reminder delivery records something that already happened');
END;

PRAGMA user_version = 34;
