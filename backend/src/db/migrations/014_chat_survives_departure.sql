-- 014_chat_survives_departure.sql — a departing coach must not delete their client's history.
--
-- 013 shipped with `conversations.coach_client_id ON DELETE CASCADE`, and that chain is:
--   a coach deletes their account
--     -> coach_clients.coach_id CASCADE (006) removes the link
--       -> conversations.coach_client_id CASCADE removes the thread
--         -> messages CASCADE removes every message the CLIENT ever wrote.
--
-- Measured, not theorised: one client message before, zero after.
--
-- THIS IS MIGRATION 011'S HARM ARRIVING THROUGH A DIFFERENT DOOR. 011 exists because
-- `exercises.owner_id ON DELETE CASCADE` meant a departing coach destroyed training history; it
-- fixed that with a BEFORE DELETE trigger that orphans rather than cascades. Fourteen migrations
-- later the same mistake was made again in a new table, by me, in a file whose header talks about
-- the link being the authority.
--
-- The lesson is narrower than "be careful with CASCADE": **CASCADE is correct when the child has
-- no meaning without the parent, and wrong when the child is somebody ELSE's record of what
-- happened.** A conversation is the client's history of their own coaching. The coach's ACCESS is
-- the link; the client's HISTORY is not.
--
-- Worth stating plainly: my own verify-013 probe asserted `deleting the link takes the conversation
-- with it` and called it a pass. A test can encode the bug as the expectation, and then it defends
-- the bug. The corrected assertion is in verify-013 now.
--
-- SQLite cannot alter a foreign key, so this is the 12-step rebuild. It is free here only because
-- the tables have never held a row — which is the entire argument for finding this now.

PRAGMA foreign_keys = OFF;

-- STEP ONE OF THE REBUILD: drop the dependent objects.
--
-- SQLite validates a trigger's body when the table it is attached to is dropped, so a trigger on
-- `messages` that mentions `conversations` makes `DROP TABLE conversations` fail with
-- "no such table: main.conversations" — which is confusing, because the table plainly exists at
-- the moment you run it. It is the TRIGGER that has stopped being resolvable.
--
-- Explicit and complete rather than relying on the drops to cascade: a trigger left behind here
-- would be re-created below with the same name and silently do nothing.
DROP TRIGGER IF EXISTS trg_conversation_parties_frozen;
DROP TRIGGER IF EXISTS trg_conversation_matches_link;
DROP TRIGGER IF EXISTS trg_message_immutable;
DROP TRIGGER IF EXISTS trg_message_sender_is_a_party;
DROP TRIGGER IF EXISTS trg_message_blocked;
DROP TRIGGER IF EXISTS trg_conversation_touch_ins;
DROP TRIGGER IF EXISTS trg_conversation_touch_upd;
DROP TRIGGER IF EXISTS trg_conversation_touch_del;
DROP TRIGGER IF EXISTS trg_notification_immutable;
DROP TRIGGER IF EXISTS trg_notification_recipient_is_a_party;

-- ── conversations, rebuilt ────────────────────────────────────────────────────────────────────
CREATE TABLE conversations_new (
  id INTEGER PRIMARY KEY,

  -- NULLABLE now, and SET NULL. A conversation whose link is gone is not an orphan to be swept:
  -- it is the client's read-only history of a relationship that ended.
  coach_client_id INTEGER UNIQUE REFERENCES coach_clients(id) ON DELETE SET NULL,

  -- The client's own record. CASCADE stays: if the CLIENT deletes their account, their history
  -- goes with them, which is what deleting your account means.
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The coach may leave. The thread must still say who it was with, so the name is SNAPSHOTTED —
  -- the same decision as `exercise_name_snapshot` and for the same reason: a row that renders
  -- "conversation with (deleted)" is worse than one that remembers.
  coach_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  coach_name_snapshot TEXT NOT NULL CHECK (length(coach_name_snapshot) BETWEEN 1 AND 160),

  blocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  blocked_at INTEGER,
  last_message_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  CHECK (coach_id IS NULL OR coach_id <> client_id),
  CHECK ((blocked_at IS NULL) = (blocked_by IS NULL))
);

INSERT INTO conversations_new
  (id, coach_client_id, client_id, coach_id, coach_name_snapshot, blocked_by, blocked_at, last_message_at, created_at)
SELECT c.id, c.coach_client_id, c.client_id, c.coach_id,
       COALESCE((SELECT u.email FROM users u WHERE u.id = c.coach_id), 'coach'),
       c.blocked_by, c.blocked_at, c.last_message_at, c.created_at
  FROM conversations c;

DROP TABLE conversations;
ALTER TABLE conversations_new RENAME TO conversations;

CREATE INDEX IF NOT EXISTS conversations_coach_idx ON conversations (coach_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_client_idx ON conversations (client_id, last_message_at DESC);

-- The parties are still frozen — but `coach_id` may go to NULL exactly once, by the FK action.
-- Spelling that carve-out here rather than forbidding all change is what lets SET NULL work: a
-- blanket freeze would make the coach's account undeletable, trading one harm for another.
CREATE TRIGGER IF NOT EXISTS trg_conversation_parties_frozen
BEFORE UPDATE OF client_id, coach_id, coach_client_id ON conversations FOR EACH ROW
WHEN NEW.client_id IS NOT OLD.client_id
  OR (NEW.coach_id IS NOT OLD.coach_id AND NEW.coach_id IS NOT NULL)
  OR (NEW.coach_client_id IS NOT OLD.coach_client_id AND NEW.coach_client_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'a conversation cannot change who it is between');
END;

CREATE TRIGGER IF NOT EXISTS trg_conversation_matches_link
BEFORE INSERT ON conversations FOR EACH ROW
WHEN NEW.coach_client_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1 FROM coach_clients cc
   WHERE cc.id = NEW.coach_client_id AND cc.coach_id = NEW.coach_id AND cc.client_id = NEW.client_id
)
BEGIN
  SELECT RAISE(ABORT, 'this conversation does not match the relationship it names');
END;

-- ── messages, rebuilt ─────────────────────────────────────────────────────────────────────────
--
-- `sender_id` becomes SET NULL for the same reason. A message written by a coach who has since
-- deleted their account is still part of what the client was told; erasing it rewrites their
-- history to suit somebody else's departure.
CREATE TABLE messages_new (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- Who wrote it, for a row whose author is gone. Cheap, and it is the difference between a thread
  -- that reads correctly forever and one that degrades the day somebody leaves.
  sender_is_coach INTEGER NOT NULL CHECK (sender_is_coach IN (0, 1)),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  deleted_at INTEGER,
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (read_at IS NULL OR read_at >= created_at)
);

INSERT INTO messages_new (id, conversation_id, sender_id, sender_is_coach, body, deleted_at, read_at, created_at)
SELECT m.id, m.conversation_id, m.sender_id,
       CASE WHEN m.sender_id = (SELECT c.coach_id FROM conversations c WHERE c.id = m.conversation_id) THEN 1 ELSE 0 END,
       m.body, m.deleted_at, m.read_at, m.created_at
  FROM messages m;

DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (conversation_id, id DESC);
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON messages (conversation_id, sender_is_coach) WHERE read_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages (sender_id);

CREATE TRIGGER IF NOT EXISTS trg_message_immutable
BEFORE UPDATE ON messages FOR EACH ROW
WHEN NEW.conversation_id IS NOT OLD.conversation_id
  OR NEW.body            IS NOT OLD.body
  OR NEW.created_at      IS NOT OLD.created_at
  OR NEW.sender_is_coach IS NOT OLD.sender_is_coach
  -- `sender_id` may go to NULL once, by the FK action, and never to another user.
  OR (NEW.sender_id IS NOT OLD.sender_id AND NEW.sender_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'a sent message cannot be rewritten: delete it and send another');
END;

CREATE TRIGGER IF NOT EXISTS trg_message_sender_is_a_party
BEFORE INSERT ON messages FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM conversations c
   WHERE c.id = NEW.conversation_id AND (c.coach_id = NEW.sender_id OR c.client_id = NEW.sender_id)
)
BEGIN
  SELECT RAISE(ABORT, 'only the two people in a conversation can post to it');
END;

CREATE TRIGGER IF NOT EXISTS trg_message_blocked
BEFORE INSERT ON messages FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM conversations c WHERE c.id = NEW.conversation_id AND c.blocked_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'this conversation is closed');
END;

-- A thread whose link is gone is READ-ONLY history. Without this, a client could keep writing into
-- a relationship that no longer exists — and nobody would ever read it.
CREATE TRIGGER IF NOT EXISTS trg_message_needs_live_link
BEFORE INSERT ON messages FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM conversations c
    JOIN coach_clients cc ON cc.id = c.coach_client_id
   WHERE c.id = NEW.conversation_id AND cc.status = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'this conversation is closed');
END;

CREATE TRIGGER IF NOT EXISTS trg_conversation_touch_ins
AFTER INSERT ON messages FOR EACH ROW
BEGIN
  UPDATE conversations
     SET last_message_at = (SELECT MAX(created_at) FROM messages m
                             WHERE m.conversation_id = NEW.conversation_id AND m.deleted_at IS NULL)
   WHERE id = NEW.conversation_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_conversation_touch_upd
AFTER UPDATE OF deleted_at ON messages FOR EACH ROW
BEGIN
  UPDATE conversations
     SET last_message_at = (SELECT MAX(created_at) FROM messages m
                             WHERE m.conversation_id = NEW.conversation_id AND m.deleted_at IS NULL)
   WHERE id = NEW.conversation_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_conversation_touch_del
AFTER DELETE ON messages FOR EACH ROW
BEGIN
  UPDATE conversations
     SET last_message_at = (SELECT MAX(created_at) FROM messages m
                             WHERE m.conversation_id = OLD.conversation_id AND m.deleted_at IS NULL)
   WHERE id = OLD.conversation_id;
END;

-- ── notifications: the same door ──────────────────────────────────────────────────────────────
--
-- `coach_client_id ON DELETE CASCADE` had the same shape: a departing coach silently erased the
-- client's notification history. SET NULL keeps the row; the READ predicate is what withdraws the
-- coach's access, and it already checks the link.
CREATE TABLE notifications_new (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_client_id INTEGER REFERENCES coach_clients(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (length(type) BETWEEN 3 AND 40),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body TEXT CHECK (body IS NULL OR length(body) <= 300),
  link_path TEXT CHECK (link_path IS NULL OR (link_path LIKE '/%' AND link_path NOT LIKE '//%')),
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (read_at IS NULL OR read_at >= created_at)
);

INSERT INTO notifications_new SELECT * FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id, id DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON notifications (user_id, id DESC);
CREATE INDEX IF NOT EXISTS notifications_link_idx ON notifications (coach_client_id) WHERE coach_client_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_notification_immutable
BEFORE UPDATE ON notifications FOR EACH ROW
WHEN NEW.user_id    IS NOT OLD.user_id
  OR NEW.type       IS NOT OLD.type
  OR NEW.title      IS NOT OLD.title
  OR NEW.body       IS NOT OLD.body
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'a notification records something that already happened');
END;

CREATE TRIGGER IF NOT EXISTS trg_notification_recipient_is_a_party
BEFORE INSERT ON notifications FOR EACH ROW
WHEN NEW.coach_client_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1 FROM coach_clients cc
   WHERE cc.id = NEW.coach_client_id AND (cc.coach_id = NEW.user_id OR cc.client_id = NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'a notification cannot be addressed outside the relationship it names');
END;

PRAGMA foreign_keys = ON;
PRAGMA user_version = 14;
