-- 013_chat_and_notifications.sql — F6 chat and F5 notifications, v1.
--
-- SCOPE IS DELIBERATELY NARROW, and that is a decision rather than a shortcut. A four-lens
-- adversarial review of a fuller design found every one of its severe defects in the ELABORATE
-- parts — collapse upserts, quiet-hours triggers, an automated retention sweep, a dedupe key
-- bounded by a GLOB that turned out to be a no-op — while reporting the core sound. One of those
-- defects, `CHECK (deliver_after <= created_at + 2678400)`, would have bricked every collapsed
-- notification 31 days on, and SQLite cannot alter a CHECK: it would have been a 12-step rebuild
-- of the largest table in the product.
--
-- So this migration ships the core and nothing else. Quiet hours, notification collapsing,
-- automated retention and a moderation queue arrive in their own migration IF there is traffic
-- that needs them. ADD COLUMN is legal in SQLite; a wrong CHECK is not removable.
--
-- THE LINK IS THE AUTHORITY. Every table here hangs off `coach_clients`, never off a pair of user
-- ids, because archiving the link has to withdraw access on the very next request with no code
-- remembering to act. The review found exactly this missing from the fuller design's inbox: its
-- read key was `WHERE user_id = ?` and the link was not in it, so archiving a client left the
-- coach's notifications about them readable forever.
--
-- SQLite does not index foreign keys for you. Every FK child below therefore carries its own
-- index, because without one each parent delete is a full scan of the largest table here.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- CONVERSATIONS
--
-- Exactly one per link. Not per (coach, client) pair: the same two people can be linked, archived
-- and linked again, and those are different working relationships. Keying on the link means the
-- second one starts clean instead of inheriting a year of the first one's messages.
--
-- ON DELETE CASCADE from the link, not SET NULL. A conversation with no link cannot be authorised
-- by anyone — there would be no predicate to write — so an orphan is not a lesser state, it is an
-- unreachable row. Deleting a USER already cascades to the link (006), which cascades to here.
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  coach_client_id INTEGER NOT NULL UNIQUE REFERENCES coach_clients(id) ON DELETE CASCADE,

  -- Denormalised from the link so the hot read (`is this my conversation`) is one table. Kept
  -- honest by `trg_conversation_parties_frozen` below rather than by every writer remembering —
  -- the same treatment `workout_log_sets.client_user_id` gets in 010.
  coach_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- WHO blocked, not merely that someone did. "Blocked" is not symmetric: a coach blocking a
  -- client and a client blocking a coach are different events with different remedies, and a
  -- single boolean cannot tell a moderator which happened.
  blocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  blocked_at INTEGER,

  -- Denormalised for the conversation LIST, which otherwise needs a correlated MAX() per row.
  -- Recomputed by trigger from the messages themselves, never incremented — the 010 rule.
  last_message_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  CHECK (coach_id <> client_id),
  -- A block is an event: both halves or neither. Without this, `blocked_at` could be set with no
  -- actor and the moderation trail would name nobody.
  CHECK ((blocked_at IS NULL) = (blocked_by IS NULL))
);

-- The list read: every conversation this coach has, newest activity first.
CREATE INDEX IF NOT EXISTS conversations_coach_idx ON conversations (coach_id, last_message_at DESC);
-- A client has one, but the index still earns its place: it is the FK child index for client_id.
CREATE INDEX IF NOT EXISTS conversations_client_idx ON conversations (client_id);

-- The parties are the LINK's parties. Freezing them means the denormalised pair can never drift
-- from `coach_clients`, which is what makes it safe to read them instead of joining.
CREATE TRIGGER IF NOT EXISTS trg_conversation_parties_frozen
BEFORE UPDATE OF coach_id, client_id, coach_client_id ON conversations FOR EACH ROW
WHEN NEW.coach_id IS NOT OLD.coach_id
  OR NEW.client_id IS NOT OLD.client_id
  OR NEW.coach_client_id IS NOT OLD.coach_client_id
BEGIN
  SELECT RAISE(ABORT, 'a conversation cannot change who it is between');
END;

-- The pair must match the link it names. Without this, a forged INSERT could create a conversation
-- whose denormalised coach_id is the attacker while the link belongs to someone else — and every
-- read that trusts the denormalised column would then hand over the thread.
CREATE TRIGGER IF NOT EXISTS trg_conversation_matches_link
BEFORE INSERT ON conversations FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM coach_clients cc
   WHERE cc.id = NEW.coach_client_id
     AND cc.coach_id = NEW.coach_id
     AND cc.client_id = NEW.client_id
)
BEGIN
  SELECT RAISE(ABORT, 'this conversation does not match the relationship it names');
END;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- Denormalised so a message can be authorised without joining, and frozen below. Every read
  -- still carries the conversation predicate; this exists for the WRITE guard.
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 4000 characters. Long enough for a coach to explain a programme change, short enough that a
  -- single row cannot be used as file storage. The bound is here rather than only in zod because
  -- zod guards one route and the column guards every writer that will ever exist.
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),

  -- A tombstone, not a delete. "I sent that and took it back" is information the other party
  -- already saw; erasing the row would make the thread lie about what happened.
  deleted_at INTEGER,

  -- Set by the RECIPIENT's read, never by the sender. One timestamp, not a receipt table: this is
  -- a 1:1 conversation, so there is exactly one other party.
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  CHECK (read_at IS NULL OR read_at >= created_at)
);

-- THE PAGE READ, and the cursor must be the column the filter uses. The review found a design
-- that filtered on one column and paged on another, which scans the whole thread on every poll.
-- Here both are `id`: monotonic, unique, and already the primary key.
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (conversation_id, id DESC);
-- The unread count, per conversation, without touching the table.
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON messages (conversation_id, sender_id) WHERE read_at IS NULL AND deleted_at IS NULL;
-- FK child index: without it, deleting a user scans every message ever sent.
CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages (sender_id);

-- A message is a fact. Only its deletion and its read stamp may ever change.
CREATE TRIGGER IF NOT EXISTS trg_message_immutable
BEFORE UPDATE ON messages FOR EACH ROW
WHEN NEW.conversation_id IS NOT OLD.conversation_id
  OR NEW.sender_id       IS NOT OLD.sender_id
  OR NEW.body            IS NOT OLD.body
  OR NEW.created_at      IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'a sent message cannot be rewritten: delete it and send another');
END;

-- The sender must be one of the two parties. This is the backstop behind the route predicate: a
-- route bug that lost its WHERE clause would otherwise let anyone post into any thread.
CREATE TRIGGER IF NOT EXISTS trg_message_sender_is_a_party
BEFORE INSERT ON messages FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM conversations c
   WHERE c.id = NEW.conversation_id
     AND (c.coach_id = NEW.sender_id OR c.client_id = NEW.sender_id)
)
BEGIN
  SELECT RAISE(ABORT, 'only the two people in a conversation can post to it');
END;

-- A BLOCKED conversation accepts nothing further. Enforced here rather than only in the route,
-- because "blocked" is the one state whose whole value is that it cannot be worked around.
CREATE TRIGGER IF NOT EXISTS trg_message_blocked
BEFORE INSERT ON messages FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM conversations c WHERE c.id = NEW.conversation_id AND c.blocked_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'this conversation is closed');
END;

-- `last_message_at` is RECOMPUTED, never incremented — 010's rule, and the reason a replay cannot
-- corrupt it. Three triggers because insert, soft-delete and hard-delete all change the answer.
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

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ATTACHMENTS — the video form-check.
--
-- The BYTES are the existing media pipeline's problem: magic-byte sniff, re-encode, EXIF strip,
-- random storage key, gated serving. This table only says which message owns which key, so an
-- attachment cannot be reached except through a message the reader is already entitled to.
CREATE TABLE IF NOT EXISTS message_attachments (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4')),
  bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 134217728),  -- 128 MiB
  -- For the coach's timestamped notes: "at 0:14 your knee caves". Null for an image.
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 3600),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS message_attachments_message_idx ON message_attachments (message_id);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- NOTIFICATIONS
--
-- THE PAYLOAD IS A SNAPSHOT, and that is the same decision 010 made for `exercise_name_snapshot`.
-- A notification saying "your coach added Tuesday" must still read correctly after Tuesday is
-- deleted. Resolving at read time would leave rows pointing at nothing, and the alternative —
-- deleting notifications when their subject dies — means every future feature that emits one also
-- has to remember to clean up after itself.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Present when the notification is ABOUT a coach↔client relationship, which is most of them.
  -- This is what lets archiving a link close the inbox: the read predicate checks it, so a
  -- withdrawn relationship stops delivering on the very next request rather than when someone
  -- remembers to purge. The review found a design without it — `WHERE user_id = ?` was the whole
  -- read key — where archiving a client left the coach's notifications about them readable
  -- forever.
  coach_client_id INTEGER REFERENCES coach_clients(id) ON DELETE CASCADE,

  -- A dotted namespace (`chat.message`, `plan.day_added`). Deliberately NOT a CHECK'd enum: every
  -- later phase adds types, and a CHECK cannot be altered. Bounded by length and by the fact that
  -- only the server ever writes it.
  type TEXT NOT NULL CHECK (length(type) BETWEEN 3 AND 40),

  -- Written by the SERVER, never echoed from a request. That is the whole leak defence, and it is
  -- a property of the write path rather than a promise: a client cannot put text here because no
  -- route accepts text for it.
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body TEXT CHECK (body IS NULL OR length(body) <= 300),

  -- Where tapping it goes. A path, never a URL: an absolute URL in a notification is an open
  -- redirect waiting for the first feature that forgets to validate it.
  link_path TEXT CHECK (link_path IS NULL OR (link_path LIKE '/%' AND link_path NOT LIKE '//%')),

  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  CHECK (read_at IS NULL OR read_at >= created_at)
);

-- THE INBOX READ and THE BADGE COUNT must be the same predicate, so they cannot disagree about
-- what "unread" means. Both are served by this one partial index.
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (user_id, id DESC) WHERE read_at IS NULL;
-- The full list, read and unread.
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON notifications (user_id, id DESC);
-- FK child index: without it, archiving or deleting a link scans the largest table here.
CREATE INDEX IF NOT EXISTS notifications_link_idx
  ON notifications (coach_client_id) WHERE coach_client_id IS NOT NULL;

-- A notification is a record of something that happened. Only its read stamp may change.
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

-- The recipient must be a party to the relationship the notification names. Without this, a row
-- could be written that tells one coach about another coach's client.
CREATE TRIGGER IF NOT EXISTS trg_notification_recipient_is_a_party
BEFORE INSERT ON notifications FOR EACH ROW
WHEN NEW.coach_client_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1 FROM coach_clients cc
   WHERE cc.id = NEW.coach_client_id
     AND (cc.coach_id = NEW.user_id OR cc.client_id = NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'a notification cannot be addressed outside the relationship it names');
END;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- REPORTS
--
-- WITH A STATUS, because the review's sharpest product point was that a report written into a
-- table nobody reads is worse than no report button: it promises a response that cannot arrive.
-- The status column is what makes a queue possible, and it mirrors the moderation pattern the
-- exercise library already uses.
CREATE TABLE IF NOT EXISTS message_reports (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  reason TEXT NOT NULL CHECK (reason IN ('abuse', 'spam', 'inappropriate', 'other')),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),

  -- A COPY of the body as reported. The message can be deleted by its sender the moment after a
  -- report is filed, and a moderator looking at an empty row cannot act.
  --
  -- The privacy consequence is real and is stated rather than hidden: this makes a permanent copy
  -- of someone else's message. It is nulled once the report is resolved — the row survives as the
  -- historical fact that a report happened, without keeping the text forever.
  body_snapshot TEXT CHECK (body_snapshot IS NULL OR length(body_snapshot) <= 4000),

  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upheld', 'rejected')),
  resolved_at INTEGER,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- One report per person per message. A second one is not more information, and without this a
  -- report button is a way to flood the queue.
  UNIQUE (message_id, reporter_id),
  CHECK ((status = 'open') = (resolved_at IS NULL))
);

-- The moderation queue: open reports, oldest first.
CREATE INDEX IF NOT EXISTS message_reports_queue_idx ON message_reports (status, created_at);
CREATE INDEX IF NOT EXISTS message_reports_message_idx ON message_reports (message_id);
CREATE INDEX IF NOT EXISTS message_reports_reporter_idx ON message_reports (reporter_id);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- PUSH DEVICES — created and INERT.
--
-- No route writes this yet. It exists so that adding FCM/APNs later is a deployment change rather
-- than a migration against a table full of live chat data, which is the expensive kind.
--
-- The token is stored HASHED, exactly like the ICS feed token and the join codes: a device token
-- is a credential, and a credential that can be read back out of the database is one that leaks
-- with a single stolen backup.
CREATE TABLE IF NOT EXISTS push_devices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  token_hash TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Scoped to the USER, not global. A globally unique token column would let one account claim a
  -- token belonging to another and silently redirect its notifications — the review found exactly
  -- that shape in a design that upserted on the token alone.
  UNIQUE (user_id, token_hash)
);

CREATE INDEX IF NOT EXISTS push_devices_user_idx ON push_devices (user_id) WHERE revoked_at IS NULL;

PRAGMA user_version = 13;
