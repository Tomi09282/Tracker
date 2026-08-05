-- 003_exercises.sql — the exercise library (F1).

-- Lookup tables rather than CHECK constraints: admins must be able to add a muscle group or a
-- piece of equipment without a migration. Slugs are the stable key; the display names are
-- per-language columns so a rename never breaks a mapping.
CREATE TABLE IF NOT EXISTS muscle_groups (
  id       INTEGER PRIMARY KEY,
  slug     TEXT NOT NULL UNIQUE,
  name_en  TEXT NOT NULL,
  name_hu  TEXT NOT NULL,
  -- Which side of the body map this muscle is drawn on.
  body_side TEXT NOT NULL DEFAULT 'front' CHECK (body_side IN ('front', 'back', 'both')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS equipment (
  id      INTEGER PRIMARY KEY,
  slug    TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_hu TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exercises (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  name_hu     TEXT,
  -- Diacritics stripped and lowercased at write time. SQLite cannot fold "tricepsz" and
  -- "trícepsz" together on its own, so the folded form is stored and searched instead.
  normalized_name TEXT NOT NULL,
  description TEXT,
  instructions TEXT,           -- JSON array of steps: ordered prose, not a relation

  -- Visibility. `global` rows came from a dataset or passed moderation; `private` belongs to
  -- its owner alone; `pending_review` is awaiting an admin; `rejected` keeps the reason so the
  -- coach is not left guessing.
  status      TEXT NOT NULL DEFAULT 'private'
              CHECK (status IN ('global', 'private', 'pending_review', 'rejected')),
  owner_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- NULL = dataset row
  rejection_reason TEXT,
  submitted_at INTEGER,

  source      TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('wger', 'free-exercise-db', 'custom')),
  source_uid  TEXT,
  difficulty  TEXT CHECK (difficulty IS NULL OR difficulty IN ('beginner', 'intermediate', 'advanced')),
  exercise_type TEXT CHECK (exercise_type IS NULL OR exercise_type IN ('strength', 'stretching', 'cardio', 'mobility', 'plyometrics')),

  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at  INTEGER
);

-- The scope column carries a composite index, because EVERY list query filters on visibility
-- before anything else.
CREATE INDEX IF NOT EXISTS exercises_scope_idx  ON exercises (status, owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS exercises_owner_idx  ON exercises (owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS exercises_sort_idx   ON exercises (normalized_name, id);
-- Partial unique index: one row per dataset entry, while custom exercises (source_uid NULL)
-- are free to repeat a name.
CREATE UNIQUE INDEX IF NOT EXISTS exercises_source_uid_unique
  ON exercises (source, source_uid) WHERE source_uid IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS exercises_updated_at
AFTER UPDATE ON exercises FOR EACH ROW
BEGIN
  UPDATE exercises SET updated_at = unixepoch() WHERE id = OLD.id;
END;

-- FTS5 external-content shadow. It indexes only the searchable text; the visibility predicate
-- is re-applied to the BASE row on every query, so the index can never leak a private row.
CREATE VIRTUAL TABLE IF NOT EXISTS exercises_fts USING fts5(
  name, name_hu, normalized_name, description,
  content='exercises',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS exercises_fts_insert AFTER INSERT ON exercises BEGIN
  INSERT INTO exercises_fts (rowid, name, name_hu, normalized_name, description)
  VALUES (new.id, new.name, new.name_hu, new.normalized_name, new.description);
END;

CREATE TRIGGER IF NOT EXISTS exercises_fts_delete AFTER DELETE ON exercises BEGIN
  INSERT INTO exercises_fts (exercises_fts, rowid, name, name_hu, normalized_name, description)
  VALUES ('delete', old.id, old.name, old.name_hu, old.normalized_name, old.description);
END;

CREATE TRIGGER IF NOT EXISTS exercises_fts_update AFTER UPDATE ON exercises BEGIN
  INSERT INTO exercises_fts (exercises_fts, rowid, name, name_hu, normalized_name, description)
  VALUES ('delete', old.id, old.name, old.name_hu, old.normalized_name, old.description);
  INSERT INTO exercises_fts (rowid, name, name_hu, normalized_name, description)
  VALUES (new.id, new.name, new.name_hu, new.normalized_name, new.description);
END;

-- Junction tables, never a JSON list of relations. `role` is what lets the muscle map fill a
-- primary target solid and a secondary one softly.
CREATE TABLE IF NOT EXISTS exercise_muscle_map (
  exercise_id     INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  muscle_group_id INTEGER NOT NULL REFERENCES muscle_groups(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'secondary')),
  PRIMARY KEY (exercise_id, muscle_group_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS exercise_muscle_by_muscle ON exercise_muscle_map (muscle_group_id, role);

CREATE TABLE IF NOT EXISTS exercise_equipment_map (
  exercise_id  INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  PRIMARY KEY (exercise_id, equipment_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS exercise_equipment_by_equipment ON exercise_equipment_map (equipment_id);

CREATE TABLE IF NOT EXISTS exercise_media (
  id          INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  -- Random opaque key, never the uploaded filename: a user-supplied name is a path-traversal
  -- vector and leaks whatever the user happened to call the file.
  storage_key TEXT NOT NULL UNIQUE,
  -- The mime the SERVER decided after sniffing and re-encoding, not what the client claimed.
  mime        TEXT NOT NULL,
  width       INTEGER,
  height      INTEGER,
  bytes       INTEGER,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at  INTEGER
);

CREATE INDEX IF NOT EXISTS exercise_media_exercise_idx ON exercise_media (exercise_id, deleted_at, position);

-- Seed taxonomies. These are the sets the muscle map and the filter chips are drawn from, so
-- they ship with the schema rather than with the dataset import.
INSERT OR IGNORE INTO muscle_groups (slug, name_en, name_hu, body_side, sort_order) VALUES
  ('chest','Chest','Mell','front',10),
  ('front-delts','Front deltoids','Elülső vállizom','front',20),
  ('side-delts','Side deltoids','Oldalsó vállizom','both',30),
  ('rear-delts','Rear deltoids','Hátsó vállizom','back',40),
  ('biceps','Biceps','Bicepsz','front',50),
  ('triceps','Triceps','Tricepsz','back',60),
  ('forearms','Forearms','Alkar','both',70),
  ('abs','Abdominals','Hasizom','front',80),
  ('obliques','Obliques','Ferde hasizom','front',90),
  ('lats','Lats','Széles hátizom','back',100),
  ('traps','Trapezius','Csuklyásizom','back',110),
  ('lower-back','Lower back','Alsó hát','back',120),
  ('glutes','Glutes','Farizom','back',130),
  ('quads','Quadriceps','Négyfejű combizom','front',140),
  ('hamstrings','Hamstrings','Combhajlító','back',150),
  ('calves','Calves','Vádli','back',160),
  ('adductors','Adductors','Közelítő izmok','front',170),
  ('abductors','Abductors','Távolító izmok','back',180),
  ('neck','Neck','Nyak','both',190),
  ('full-body','Full body','Teljes test','both',200);

INSERT OR IGNORE INTO equipment (slug, name_en, name_hu, sort_order) VALUES
  ('bodyweight','Bodyweight','Saját testsúly',10),
  ('barbell','Barbell','Rúd',20),
  ('dumbbell','Dumbbell','Kézisúlyzó',30),
  ('kettlebell','Kettlebell','Kettlebell',40),
  ('machine','Machine','Gép',50),
  ('cable','Cable','Kábel',60),
  ('smith-machine','Smith machine','Smith-gép',70),
  ('resistance-band','Resistance band','Gumiszalag',80),
  ('ez-bar','EZ bar','EZ-rúd',90),
  ('pull-up-bar','Pull-up bar','Húzódzkodó rúd',100),
  ('bench','Bench','Pad',110),
  ('medicine-ball','Medicine ball','Medicinlabda',120),
  ('stability-ball','Stability ball','Fitneszlabda',130),
  ('foam-roller','Foam roller','Hengerelő',140),
  ('trx','Suspension trainer','TRX',150),
  ('other','Other','Egyéb',160);
