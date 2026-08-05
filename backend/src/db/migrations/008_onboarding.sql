-- 008_onboarding.sql — F11: the first-login questionnaire.
--
-- What this row is for: the coach needs to know who they just took on, and the plan builder needs
-- to know what the client can actually do. Both read the same profile, which is why it is one
-- table and not a pile of preference keys.
--
-- The row is created on the FIRST keystroke, not on submit. A half-finished questionnaire that
-- survives a closed tab is the difference between a client who finishes onboarding and one who
-- never comes back, so `status` distinguishes a draft from a completed profile and `step` records
-- where to resume.
--
-- Language policy: every enum here is a bounded code, never display text. The client renders
-- `onboarding.goal.strength` through i18n, so a new language is a JSON file, not a migration. The
-- one field that holds real prose — `notes` — is the client's own words in their own language and
-- is never translated; showing a coach a machine-translated injury description would be worse
-- than showing them the original.

CREATE TABLE IF NOT EXISTS onboarding_profiles (
  -- One profile per user, so the user id IS the key. A separate surrogate id would allow two.
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
  -- Resume point. Bounded so a forged value cannot drive the client to a step that does not exist.
  step   INTEGER NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 20),

  primary_goal TEXT CHECK (primary_goal IN (
    'strength', 'muscle', 'fat-loss', 'endurance', 'mobility', 'health', 'sport'
  )),
  experience TEXT CHECK (experience IN ('none', 'beginner', 'intermediate', 'advanced')),

  -- Bounds are the honest ones, not the polite ones: 14 sessions a week is two a day, which some
  -- athletes genuinely do; 15 would be a typo or an attack.
  sessions_per_week INTEGER CHECK (sessions_per_week BETWEEN 1 AND 14),
  session_minutes   INTEGER CHECK (session_minutes BETWEEN 10 AND 240),
  training_location TEXT CHECK (training_location IN ('gym', 'home', 'outdoor', 'mixed')),

  -- Display units only. Everything is STORED metric so that no conversion can ever happen twice,
  -- and the imperial user sees a converted view of a single canonical number.
  units TEXT NOT NULL DEFAULT 'metric' CHECK (units IN ('metric', 'imperial')),

  height_cm      REAL CHECK (height_cm BETWEEN 90 AND 260),
  bodyweight_kg  REAL CHECK (bodyweight_kg BETWEEN 25 AND 400),
  birth_year     INTEGER CHECK (birth_year BETWEEN 1900 AND 2100),
  -- Optional and self-declared. It exists because strength norms and 1RM formulas differ, not to
  -- categorise anyone — hence the explicit opt-out value rather than a NULL that looks like an
  -- unanswered question.
  sex TEXT CHECK (sex IN ('female', 'male', 'other', 'undisclosed')),

  -- The client's own words, shown to their coach verbatim.
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),

  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);

-- Which equipment the client can actually reach. A junction, not a JSON list, because the plan
-- builder filters exercises by it — `WHERE equipment_id IN (...)` against a JSON blob is a table
-- scan and a parse, and cannot use an index.
CREATE TABLE IF NOT EXISTS onboarding_equipment (
  user_id      INTEGER NOT NULL REFERENCES onboarding_profiles(user_id) ON DELETE CASCADE,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, equipment_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_onboarding_equipment_eq ON onboarding_equipment (equipment_id);

-- Injuries and limitations. A separate table because there can be several, each with its own
-- severity, and because "avoid loading this area" is a filter the plan builder will run.
--
-- `body_area` is joint-centric on purpose: people are injured at knees, shoulders and wrists, which
-- are not muscle groups, so reusing `muscle_groups` here would have forced every real answer into
-- the wrong vocabulary.
CREATE TABLE IF NOT EXISTS onboarding_limitations (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES onboarding_profiles(user_id) ON DELETE CASCADE,
  body_area TEXT NOT NULL CHECK (body_area IN (
    'neck', 'shoulder', 'elbow', 'wrist', 'upper-back', 'lower-back',
    'hip', 'knee', 'ankle', 'foot', 'chest', 'abdomen', 'other'
  )),
  -- Drives how hard the plan builder avoids the area: 'avoid' removes exercises outright,
  -- 'caution' keeps them but flags them, 'past' is history the coach should know and nothing more.
  severity TEXT NOT NULL DEFAULT 'caution' CHECK (severity IN ('past', 'caution', 'avoid')),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  -- The same area twice would give the plan builder two contradicting severities to choose from.
  UNIQUE (user_id, body_area)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_limitations_user ON onboarding_limitations (user_id, severity);

-- Keeps `updated_at` honest without every write remembering to set it. Scoped to the columns a
-- human edits so that the trigger cannot recurse through its own UPDATE.
CREATE TRIGGER IF NOT EXISTS trg_onboarding_touch
AFTER UPDATE ON onboarding_profiles
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE onboarding_profiles SET updated_at = unixepoch() WHERE user_id = NEW.user_id;
END;
