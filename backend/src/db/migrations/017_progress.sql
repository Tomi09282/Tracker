-- 017_progress.sql — body measurements and progress photos (F10).
--
-- ═══ THIS IS HEALTH DATA, WHICH CHANGES THE DEFAULTS ═══════════════════════════════════════════
--
-- A body-fat number and a photo in underwear are a GDPR special category. Everything else in this
-- product defaults to "the coach can see their client's training", because that is what coaching
-- is. **This table set defaults to NOBODY**, including the coach, until the client says otherwise.
-- There is no row that grants access by existing; a grant is a row the client created, and
-- revoking is a column the client sets.
--
-- The three rules that follow from that, and which the routes enforce:
--
--   1. **Deny by default.** No `progress_shares` row means no access. Not "share everything",
--      not "share what the coach asks for" — an absent row is a no.
--   2. **Revocation is immediate**, on the very next request, with the same unexpired token. Same
--      property as archiving a link, achieved the same way: the grant is read inside the query
--      that returns the data, never cached into a claim.
--   3. **Every photo read is logged.** Not the list, the READ — who looked at whose picture and
--      when. A client asking "who has seen these" must get a real answer.
--
-- ═══ NO CHECK ON THE METRIC VOCABULARY, AND THAT IS THE POINT ══════════════════════════════════
--
-- The obvious design is `metric TEXT CHECK (metric IN ('weight_kg', 'waist_cm', ...))`. It is also
-- exactly the mistake 013 caught before it shipped: **SQLite cannot alter a CHECK.** Adding
-- "forearm" a year from now would be a 12-step rebuild of a table full of a user's health history.
--
-- So the vocabulary is a REFERENCE TABLE with a foreign key. Adding a metric is an INSERT. The
-- bounds live there too, per metric, enforced by a trigger rather than a CHECK for the same
-- reason: a waist range that turns out to exclude a real person must be fixable with an UPDATE.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- METRICS
--
-- `key` is the primary key and is a stable identifier, never a display string — the label is an
-- i18n key on the client. A metric the product stops offering is `active = 0` rather than deleted,
-- because deleting it would take a user's history with it.
CREATE TABLE IF NOT EXISTS measurement_metrics (
  key TEXT PRIMARY KEY CHECK (key GLOB '[a-z][a-z_]*'),

  -- The canonical unit. Values are stored as value × 1000 in THIS unit, one rule for every metric
  -- so nothing has to branch on which one it is reading.
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'cm', 'pct')),

  -- Bounds, in the stored scale. A trigger enforces them; an UPDATE here fixes a wrong one.
  -- Generous on purpose: this is a typo guard, not a medical opinion about anybody's body.
  min_x1000 INTEGER NOT NULL,
  max_x1000 INTEGER NOT NULL CHECK (max_x1000 > min_x1000),

  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT OR IGNORE INTO measurement_metrics (key, unit, min_x1000, max_x1000, sort_order) VALUES
  ('weight',       'kg',  20000,  400000,  10),
  ('body_fat',     'pct',  1000,   70000,  20),
  ('neck',         'cm',  20000,   80000,  30),
  ('shoulder',     'cm',  60000,  200000,  40),
  ('chest',        'cm',  50000,  200000,  50),
  ('waist',        'cm',  40000,  200000,  60),
  ('hip',          'cm',  50000,  200000,  70),
  ('thigh_left',   'cm',  25000,  120000,  80),
  ('thigh_right',  'cm',  25000,  120000,  90),
  ('calf_left',    'cm',  20000,   80000, 100),
  ('calf_right',   'cm',  20000,   80000, 110),
  ('arm_left',     'cm',  15000,   80000, 120),
  ('arm_right',    'cm',  15000,   80000, 130),
  ('forearm_left', 'cm',  15000,   60000, 140),
  ('forearm_right','cm',  15000,   60000, 150);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- MEASUREMENTS
--
-- Narrow, not wide. A row per (client, metric, date) rather than a column per body part, because
-- the wide shape needs a migration for every new metric and stores a row of NULLs for the person
-- who only ever weighs themselves.
--
-- `measured_on` is a DATE and not a timestamp. Nobody measures their waist at a moment; they
-- measure it on a morning. Storing a timestamp would invite a chart to space points by the hour
-- and would make "one measurement per day" impossible to express as a constraint.
CREATE TABLE IF NOT EXISTS body_measurements (
  id INTEGER PRIMARY KEY,

  -- The client's guard is single-table, with no join and no coach in it: this is their body.
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- RESTRICT rather than CASCADE: removing a metric from the vocabulary must not silently delete
  -- a user's history of it. Deactivate it instead — that is what `active` is for.
  metric_key TEXT NOT NULL REFERENCES measurement_metrics(key) ON DELETE RESTRICT,

  measured_on TEXT NOT NULL
    CHECK (measured_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),

  value_x1000 INTEGER NOT NULL CHECK (value_x1000 > 0),

  note TEXT CHECK (note IS NULL OR length(note) <= 300),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- One value per metric per day. A second weighing replaces the first rather than making the
  -- chart show two points for one morning — and it makes the write an upsert with a natural key
  -- instead of a read-then-write.
  UNIQUE (client_user_id, metric_key, measured_on)
);

-- The one hot read: this person's history of one metric, in date order. Covering.
CREATE INDEX IF NOT EXISTS body_measurements_trend_idx
  ON body_measurements (client_user_id, metric_key, measured_on, value_x1000);

CREATE TRIGGER IF NOT EXISTS trg_body_measurements_touch
AFTER UPDATE ON body_measurements FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE body_measurements SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- Bounds enforced by trigger, not CHECK, so a wrong bound is an UPDATE and not a table rebuild.
-- Both directions, because a typo is as likely in an edit as in a create.
CREATE TRIGGER IF NOT EXISTS trg_measurement_in_range_ins
AFTER INSERT ON body_measurements FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'measurement is outside the plausible range for this metric')
   WHERE NEW.value_x1000 NOT BETWEEN
     (SELECT min_x1000 FROM measurement_metrics WHERE key = NEW.metric_key) AND
     (SELECT max_x1000 FROM measurement_metrics WHERE key = NEW.metric_key);
END;

CREATE TRIGGER IF NOT EXISTS trg_measurement_in_range_upd
AFTER UPDATE ON body_measurements FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'measurement is outside the plausible range for this metric')
   WHERE NEW.value_x1000 NOT BETWEEN
     (SELECT min_x1000 FROM measurement_metrics WHERE key = NEW.metric_key) AND
     (SELECT max_x1000 FROM measurement_metrics WHERE key = NEW.metric_key);
END;

-- An inactive metric cannot receive NEW data, but existing rows stay readable. Retiring a metric
-- must not make a user's past disappear from their own chart.
CREATE TRIGGER IF NOT EXISTS trg_measurement_metric_active
AFTER INSERT ON body_measurements FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'this metric is no longer offered')
   WHERE (SELECT active FROM measurement_metrics WHERE key = NEW.metric_key) = 0;
END;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- PROGRESS PHOTOS
--
-- The storage key is a random 48-hex name, as chat attachments are. **THE KEY IS NOT THE
-- PERMISSION** — 013 wrote that down after the chat media work and it is more true here: a URL
-- appears in histories, proxy logs and screenshots. Every read carries the full predicate.
--
-- `taken_on` is a date for the same reason `measured_on` is: a progress photo belongs to a
-- morning, and the timeline pairs it with that morning's measurements.
CREATE TABLE IF NOT EXISTS progress_photos (
  id INTEGER PRIMARY KEY,

  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  taken_on TEXT NOT NULL
    CHECK (taken_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),

  -- Free text with a suggested vocabulary on the client, not a CHECK. Poses are a UI convention
  -- and the set will change; the 013 rule about unalterable CHECKs applies to anything that looks
  -- like an enum but is really a habit.
  pose TEXT CHECK (pose IS NULL OR length(trim(pose)) BETWEEN 1 AND 40),

  storage_key TEXT NOT NULL UNIQUE CHECK (length(storage_key) BETWEEN 16 AND 128),
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 25 * 1024 * 1024),
  width  INTEGER CHECK (width  IS NULL OR width  BETWEEN 1 AND 20000),
  height INTEGER CHECK (height IS NULL OR height BETWEEN 1 AND 20000),

  note TEXT CHECK (note IS NULL OR length(note) <= 300),

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS progress_photos_client_idx
  ON progress_photos (client_user_id, taken_on DESC, id DESC);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- SHARING
--
-- Per LINK, because that is what every entitlement in this product hangs off, and because a client
-- with two coaches must be able to share with one and not the other. Absent row = nothing shared.
--
-- TWO SEPARATE FLAGS. "My coach can see my waist measurements" and "my coach can see photographs
-- of my body" are different decisions and a single toggle forces the more sensitive one to ride
-- along with the less sensitive one.
--
-- The row is never deleted on revocation, only flipped: `revoked_at` is what a client points at
-- when they want to know what they shared and when they stopped.
CREATE TABLE IF NOT EXISTS progress_shares (
  id INTEGER PRIMARY KEY,

  coach_client_id INTEGER NOT NULL UNIQUE REFERENCES coach_clients(id) ON DELETE CASCADE,

  -- Denormalised from the link so the client's own "what am I sharing" read is single-table, and
  -- frozen by the trigger below so it cannot drift from the link it claims.
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  share_measurements INTEGER NOT NULL DEFAULT 0 CHECK (share_measurements IN (0, 1)),
  share_photos       INTEGER NOT NULL DEFAULT 0 CHECK (share_photos IN (0, 1)),

  granted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER,

  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS progress_shares_client_idx ON progress_shares (client_user_id);

CREATE TRIGGER IF NOT EXISTS trg_progress_shares_touch
AFTER UPDATE ON progress_shares FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE progress_shares SET updated_at = unixepoch() WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_progress_share_client_ins
AFTER INSERT ON progress_shares FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'a share must name the client of the link it grants')
   WHERE NEW.client_user_id IS NOT (
     SELECT client_id FROM coach_clients WHERE id = NEW.coach_client_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_progress_share_client_upd
AFTER UPDATE ON progress_shares FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'a share must name the client of the link it grants')
   WHERE NEW.client_user_id IS NOT (
     SELECT client_id FROM coach_clients WHERE id = NEW.coach_client_id);
END;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ACCESS LOG
--
-- T4.3.1. Who looked at whose health data, and when. Written on the READ, inside the same request
-- that serves the bytes — a log written by a background job is a log that is wrong whenever the
-- job is behind.
--
-- `viewer_user_id` is SET NULL on delete rather than CASCADE, so a coach deleting their account
-- does not erase the record of what they looked at. That is the entire purpose of this table: the
-- client's answer to "who has seen these" must not depend on the viewer's cooperation. The email
-- snapshot is what keeps the row readable after the pointer is gone — the same decision 011 made
-- for workout history and 014 for chat.
CREATE TABLE IF NOT EXISTS progress_access_log (
  id INTEGER PRIMARY KEY,

  subject_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  viewer_email_snapshot TEXT NOT NULL CHECK (length(viewer_email_snapshot) BETWEEN 1 AND 320),

  coach_client_id INTEGER REFERENCES coach_clients(id) ON DELETE SET NULL,

  -- What was looked at. Free text against a small vocabulary rather than a CHECK, per 013.
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 32),
  target_id INTEGER,

  at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- The client's own "who has seen my data" read.
CREATE INDEX IF NOT EXISTS progress_access_log_subject_idx
  ON progress_access_log (subject_user_id, at DESC, id DESC);

PRAGMA user_version = 17;
