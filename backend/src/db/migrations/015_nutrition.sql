-- 015_nutrition.sql — F4 nutrition plans, v1.
--
-- SHAPED AFTER 010 ON PURPOSE. `nutrition_plans` carries the same scope/author/link/client columns
-- as `workout_plans`, with the same triggers, because the entitlement question is identical: a
-- template is a coach's mould, a client instance hangs off the LINK so archiving withdraws it on
-- the next request, and the client's own guard is single-table `WHERE client_user_id = ?` so they
-- keep their food after a coach walks away. Inventing a second answer to a question 010 already
-- answered is this project's one recurring bug class, and it does not get to happen in a new file.
--
-- SCOPE IS THE CORE AND NOTHING ELSE, for the reason 013 records: a review of a fuller design put
-- every severe defect in the elaborate parts. So there is no recipe table, no barcode column, no
-- water tracking, no micronutrients beyond fibre, and NO STORED TOTALS. ADD COLUMN is legal in
-- SQLite; a wrong CHECK is not removable.
--
-- ═══ TOTALS ARE NEVER STORED ═══════════════════════════════════════════════════════════════════
--
-- A day's kcal is `SUM()` over its items at read time, every time. Not a rollup column, not a
-- trigger-maintained counter, not a value the client may send. Three reasons, in order of how
-- much they cost when ignored:
--
--   1. T4.1.10, which is the owner's rule and not a preference: the server recomputes every
--      consequence from its own data. A stored total is a number a client could eventually talk
--      the server into writing. A SUM over grams cannot be forged without forging the grams.
--   2. A rollup is a second copy of a fact, and 010 already taught this project what a second copy
--      does. `workout_logs` rollups are RECOMPUTED rather than incremented for exactly this
--      reason; nutrition skips the copy entirely.
--   3. It is cheap. A plan day holds at most 60 items by the cap below. Summing 60 integers is
--      not the thing that will ever make this app slow.
--
-- ═══ INTEGER MACROS, BECAUSE FLOATS DRIFT ══════════════════════════════════════════════════════
--
-- Every macro is an INTEGER in a fixed scale, never REAL. Summing 40 REAL values and comparing the
-- result to a target is how a day reads 1999.9999 against a 2000 goal.
--
--   grams_x10           tenths of a gram      1500  = 150.0 g
--   kcal_per_100g_x10   tenths of a kcal      1650  = 165.0 kcal / 100 g
--   *_mg_per_100g       milligrams            25000 = 25.0 g / 100 g
--
-- A portion is `per_100g * grams_x10 / 1000`, which is exact integer arithmetic in SQLite:
-- 25000 mg × 1500 ÷ 1000 = 37500 mg = 37.5 g of protein in a 150 g portion. The x10 on kcal is
-- what stops 165 kcal/100 g × 150 g truncating 247.5 down to 247 on every single row.
--
-- Deliberately NOT added: a CHECK that 4·protein + 4·carb + 9·fat ≈ kcal. It is tempting and it is
-- wrong — fibre, polyols and alcohol all break it, and real USDA rows violate it routinely. A
-- CHECK cannot be altered later. Import flags the outliers instead.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- FOODS
--
-- One row per food, from any source. `source` + `source_ref` is what makes the table
-- source-agnostic: USDA today, OpenFoodFacts or a user's own entry later, with no schema change
-- and no second table to keep in step. T4.1.9 (barcode) is deferred, and this is the column it
-- will land in when it is not.
--
-- owner_user_id is NULL for everything the product ships and NOT NULL for a food a user typed in.
-- That single column is the whole visibility rule: a global food is visible to everyone, a
-- personal one to its author. Same shape as `exercises` in 003, and the predicate is spelled once
-- in the route layer rather than re-derived per query.
CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY,

  source TEXT NOT NULL DEFAULT 'manual'
         CHECK (source IN ('usda', 'off', 'manual', 'system')),

  -- The id in the source system, so a re-import updates rather than duplicates. UNIQUE per source
  -- and NULL for manual entries — SQLite treats NULLs as distinct in a UNIQUE index, which is what
  -- lets a thousand hand-typed foods coexist while USDA #173687 exists exactly once.
  source_ref TEXT CHECK (source_ref IS NULL OR length(source_ref) BETWEEN 1 AND 64),

  owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  -- Diacritics folded at write time by lib/normalize.js. Hungarian food names are full of them and
  -- a user searching "turo" must find "túró".
  normalized_name TEXT NOT NULL,
  brand TEXT CHECK (brand IS NULL OR length(brand) <= 80),

  -- Per 100 g, always. A serving is a convenience below, never the unit of storage: "1 medium
  -- banana" is not a quantity, and every downstream sum would have to know which foods meant
  -- grams and which meant units.
  kcal_per_100g_x10   INTEGER NOT NULL CHECK (kcal_per_100g_x10   BETWEEN 0 AND 9000),
  protein_mg_per_100g INTEGER NOT NULL CHECK (protein_mg_per_100g BETWEEN 0 AND 100000),
  carb_mg_per_100g    INTEGER NOT NULL CHECK (carb_mg_per_100g    BETWEEN 0 AND 100000),
  fat_mg_per_100g     INTEGER NOT NULL CHECK (fat_mg_per_100g     BETWEEN 0 AND 100000),
  fiber_mg_per_100g   INTEGER CHECK (fiber_mg_per_100g IS NULL OR
                                     fiber_mg_per_100g BETWEEN 0 AND 100000),

  -- One optional household portion, in grams. "1 slice = 28 g". Purely a UI shortcut that resolves
  -- to grams before anything is stored.
  serving_g_x10   INTEGER CHECK (serving_g_x10 IS NULL OR serving_g_x10 BETWEEN 1 AND 100000),
  serving_label   TEXT CHECK (serving_label IS NULL OR length(serving_label) <= 40),

  -- Set by an importer that trusts its source, never by a user request. A hand-typed food is
  -- unverified forever; the flag exists so search can rank a curated row above a guess.
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- An imported food has a source_ref; a manual one has an owner. A row with neither is
  -- unattributable and a row that is 'manual' with no owner is invisible to everyone including
  -- whoever typed it.
  CHECK ((source = 'manual' AND owner_user_id IS NOT NULL AND source_ref IS NULL)
      OR (source <> 'manual' AND source_ref IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS foods_source_ref_uidx
  ON foods (source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS foods_owner_idx ON foods (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS foods_name_idx  ON foods (normalized_name, id);

CREATE TRIGGER IF NOT EXISTS trg_foods_touch
AFTER UPDATE ON foods FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE foods SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- FTS5 shadow for search. Note brain-gen.mjs excludes any table matching %_fts% from the generated
-- docs, so this deliberately does not appear in docs/brain/20-Data-Model/.
CREATE VIRTUAL TABLE IF NOT EXISTS foods_fts USING fts5(
  name, brand, content='foods', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS trg_foods_fts_ins AFTER INSERT ON foods BEGIN
  INSERT INTO foods_fts (rowid, name, brand) VALUES (NEW.id, NEW.name, NEW.brand);
END;
CREATE TRIGGER IF NOT EXISTS trg_foods_fts_del AFTER DELETE ON foods BEGIN
  INSERT INTO foods_fts (foods_fts, rowid, name, brand) VALUES ('delete', OLD.id, OLD.name, OLD.brand);
END;
CREATE TRIGGER IF NOT EXISTS trg_foods_fts_upd AFTER UPDATE ON foods BEGIN
  INSERT INTO foods_fts (foods_fts, rowid, name, brand) VALUES ('delete', OLD.id, OLD.name, OLD.brand);
  INSERT INTO foods_fts (rowid, name, brand) VALUES (NEW.id, NEW.name, NEW.brand);
END;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- NUTRITION PLANS
--
-- Column-for-column the entitlement half of `workout_plans`. Read 010's comments for the
-- reasoning; it has not changed because the question has not changed.
CREATE TABLE IF NOT EXISTS nutrition_plans (
  id INTEGER PRIMARY KEY,

  scope TEXT NOT NULL DEFAULT 'template'
        CHECK (scope IN ('template', 'client', 'personal', 'system')),

  -- AUTHOR, not owner: for scope='client' this is the COACH. "Whose plan is this" goes through
  -- client_user_id, always.
  author_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- CASCADE rather than SET NULL, because the CHECK below requires a link for scope='client' and a
  -- SET NULL would leave the row violating its own CHECK — which aborts the parent delete and
  -- traps a coach who can never delete their account.
  coach_client_id INTEGER REFERENCES coach_clients(id) ON DELETE CASCADE,
  client_user_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,

  source_plan_id  INTEGER REFERENCES nutrition_plans(id) ON DELETE SET NULL,
  source_revision INTEGER CHECK (source_revision IS NULL OR source_revision > 0),

  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  normalized_name TEXT NOT NULL,
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),

  goal TEXT CHECK (goal IS NULL OR goal IN (
    'strength', 'muscle', 'fat-loss', 'endurance', 'mobility', 'health', 'sport')),

  -- Same schedule rule as 010: an occurrence is starts_on + k·cycle_days + day_index. The rule
  -- lives in src/plans/schedule.js and is spelled exactly once; this table only stores its inputs.
  cycle_days INTEGER NOT NULL DEFAULT 7 CHECK (cycle_days BETWEEN 1 AND 28),
  starts_on  TEXT CHECK (starts_on IS NULL OR starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),

  archived_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),

  CHECK ((scope = 'client'   AND coach_client_id IS NOT NULL AND client_user_id IS NOT NULL)
      OR (scope = 'personal' AND client_user_id IS NOT NULL AND coach_client_id IS NULL)
      OR (scope = 'template' AND author_user_id IS NOT NULL AND client_user_id IS NULL)
      OR (scope = 'system'   AND author_user_id IS NULL AND client_user_id IS NULL))
);

CREATE INDEX IF NOT EXISTS nutrition_plans_author_idx ON nutrition_plans (author_user_id, scope, archived_at);
CREATE INDEX IF NOT EXISTS nutrition_plans_client_idx ON nutrition_plans (client_user_id, status, archived_at);
CREATE INDEX IF NOT EXISTS nutrition_plans_link_idx   ON nutrition_plans (coach_client_id, status);
CREATE INDEX IF NOT EXISTS nutrition_plans_name_idx   ON nutrition_plans (normalized_name, id);

CREATE TRIGGER IF NOT EXISTS trg_nutrition_plans_touch
AFTER UPDATE ON nutrition_plans FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE nutrition_plans SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- client_user_id is denormalised FROM the link, so it must agree with the link or the client's
-- single-table guard is forgeable. These two make the copy unforgeable rather than trusting every
-- writer to remember — the same treatment trg_plan_link_client_* gives 010.
CREATE TRIGGER IF NOT EXISTS trg_nutrition_plan_link_client_ins
AFTER INSERT ON nutrition_plans FOR EACH ROW
WHEN NEW.coach_client_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'nutrition plan client must match its coach link')
   WHERE NEW.client_user_id IS NOT (
     SELECT client_id FROM coach_clients WHERE id = NEW.coach_client_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_nutrition_plan_link_client_upd
AFTER UPDATE ON nutrition_plans FOR EACH ROW
WHEN NEW.coach_client_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'nutrition plan client must match its coach link')
   WHERE NEW.client_user_id IS NOT (
     SELECT client_id FROM coach_clients WHERE id = NEW.coach_client_id);
END;

-- Scope is frozen after insert. A template that becomes a client instance would skip the clone,
-- and every client sharing that template would then share one row.
CREATE TRIGGER IF NOT EXISTS trg_nutrition_plan_scope_frozen
AFTER UPDATE OF scope ON nutrition_plans FOR EACH ROW
WHEN NEW.scope <> OLD.scope
BEGIN
  SELECT RAISE(ABORT, 'nutrition plan scope cannot change after creation');
END;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- PLAN DAYS
--
-- One row per day_index in the cycle. Targets live HERE and not on the plan, because a training
-- day and a rest day have different targets and that is most of the point of a nutrition plan.
--
-- The targets are nullable: a plan may prescribe meals without prescribing a number, and a plan
-- may prescribe a number without prescribing meals. Both are real coaching styles.
CREATE TABLE IF NOT EXISTS nutrition_plan_days (
  id INTEGER PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES nutrition_plans(id) ON DELETE CASCADE,

  day_index INTEGER NOT NULL CHECK (day_index >= 0),
  name TEXT CHECK (name IS NULL OR length(trim(name)) BETWEEN 1 AND 80),

  kcal_target_x10   INTEGER CHECK (kcal_target_x10   IS NULL OR kcal_target_x10   BETWEEN 0 AND 150000),
  protein_mg_target INTEGER CHECK (protein_mg_target IS NULL OR protein_mg_target BETWEEN 0 AND 1000000),
  carb_mg_target    INTEGER CHECK (carb_mg_target    IS NULL OR carb_mg_target    BETWEEN 0 AND 2000000),
  fat_mg_target     INTEGER CHECK (fat_mg_target     IS NULL OR fat_mg_target     BETWEEN 0 AND 1000000),

  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE (plan_id, day_index)
);

CREATE TRIGGER IF NOT EXISTS trg_nutrition_plan_days_touch
AFTER UPDATE ON nutrition_plan_days FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE nutrition_plan_days SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- day_index must be inside the cycle, on the way in and on the way out. 010 learned the second
-- half the hard way: shrinking cycle_days on a plan that already has a day 6 leaves an orphan the
-- schedule rule can never reach, and the row looks perfectly valid sitting in the table.
CREATE TRIGGER IF NOT EXISTS trg_nutrition_day_in_cycle_ins
AFTER INSERT ON nutrition_plan_days FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'nutrition day index must be inside the plan cycle')
   WHERE NEW.day_index >= (SELECT cycle_days FROM nutrition_plans WHERE id = NEW.plan_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_nutrition_day_in_cycle_upd
AFTER UPDATE ON nutrition_plan_days FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'nutrition day index must be inside the plan cycle')
   WHERE NEW.day_index >= (SELECT cycle_days FROM nutrition_plans WHERE id = NEW.plan_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_nutrition_cycle_shrink
AFTER UPDATE OF cycle_days ON nutrition_plans FOR EACH ROW
WHEN NEW.cycle_days < OLD.cycle_days
BEGIN
  SELECT RAISE(ABORT, 'shrinking the cycle would strand a day outside it')
   WHERE EXISTS (SELECT 1 FROM nutrition_plan_days
                  WHERE plan_id = NEW.id AND day_index >= NEW.cycle_days);
END;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- MEALS
--
-- A named slot inside a day. `position` orders them; `time_hint` is a display string and NOT a
-- schedule — nothing fires at 08:00, and calling the column `time` would invite something to.
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY,

  -- Denormalised so a plan-wide read is one join instead of two, and kept honest by the parent
  -- triggers below rather than by every writer remembering. Same pattern as workout_plan_blocks.
  plan_id INTEGER NOT NULL REFERENCES nutrition_plans(id) ON DELETE CASCADE,
  day_id  INTEGER NOT NULL REFERENCES nutrition_plan_days(id) ON DELETE CASCADE,

  position INTEGER NOT NULL CHECK (position >= 0),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  time_hint TEXT CHECK (time_hint IS NULL OR time_hint GLOB '[0-2][0-9]:[0-5][0-9]'),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 500),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS meals_day_idx  ON meals (day_id, position, id);
CREATE INDEX IF NOT EXISTS meals_plan_idx ON meals (plan_id);

CREATE TRIGGER IF NOT EXISTS trg_meals_touch
AFTER UPDATE ON meals FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE meals SET updated_at = unixepoch() WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_meal_parent_ins
AFTER INSERT ON meals FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'meal plan must match its day plan')
   WHERE NEW.plan_id IS NOT (SELECT plan_id FROM nutrition_plan_days WHERE id = NEW.day_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_meal_parent_upd
AFTER UPDATE ON meals FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'meal plan must match its day plan')
   WHERE NEW.plan_id IS NOT (SELECT plan_id FROM nutrition_plan_days WHERE id = NEW.day_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_meal_count_cap
AFTER INSERT ON meals FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'a day cannot hold more than 12 meals')
   WHERE (SELECT COUNT(*) FROM meals WHERE day_id = NEW.day_id) > 12;
END;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- MEAL ITEMS
--
-- THE SNAPSHOT IS THE POINT. `food_id` is a pointer that may go NULL; the four `*_snapshot`
-- columns are what the plan actually said. 010's `exercise_name_snapshot` decision, applied to a
-- table where getting it wrong is worse: a coach prescribing 200 g of a food at 165 kcal/100 g,
-- and someone later correcting that food to 190, must not silently re-write what was prescribed.
--
-- So the read NEVER joins `foods` for numbers. It joins only to offer a live link. The snapshot is
-- the value, and 4z in the hot notes says the rest: a snapshot is not a fallback for a missing
-- join, it IS the display value.
CREATE TABLE IF NOT EXISTS meal_items (
  id INTEGER PRIMARY KEY,

  plan_id INTEGER NOT NULL REFERENCES nutrition_plans(id) ON DELETE CASCADE,
  meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,

  -- SET NULL, not CASCADE. Deleting a food must not delete what a coach prescribed last month.
  food_id INTEGER REFERENCES foods(id) ON DELETE SET NULL,

  position INTEGER NOT NULL CHECK (position >= 0),

  -- Tenths of a gram: 1 = 0.1 g, 5000000 = 500 kg, which is not a portion but is a cheap ceiling.
  grams_x10 INTEGER NOT NULL CHECK (grams_x10 BETWEEN 1 AND 5000000),

  food_name_snapshot TEXT NOT NULL CHECK (length(trim(food_name_snapshot)) BETWEEN 1 AND 160),
  kcal_per_100g_x10_snapshot   INTEGER NOT NULL CHECK (kcal_per_100g_x10_snapshot   BETWEEN 0 AND 9000),
  protein_mg_per_100g_snapshot INTEGER NOT NULL CHECK (protein_mg_per_100g_snapshot BETWEEN 0 AND 100000),
  carb_mg_per_100g_snapshot    INTEGER NOT NULL CHECK (carb_mg_per_100g_snapshot    BETWEEN 0 AND 100000),
  fat_mg_per_100g_snapshot     INTEGER NOT NULL CHECK (fat_mg_per_100g_snapshot     BETWEEN 0 AND 100000),
  fiber_mg_per_100g_snapshot   INTEGER CHECK (fiber_mg_per_100g_snapshot IS NULL OR
                                              fiber_mg_per_100g_snapshot BETWEEN 0 AND 100000),

  note TEXT CHECK (note IS NULL OR length(note) <= 200),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS meal_items_meal_idx ON meal_items (meal_id, position, id);
CREATE INDEX IF NOT EXISTS meal_items_plan_idx ON meal_items (plan_id);
-- SQLite does not index foreign keys for you, and without this every food delete is a full scan
-- of what will be the largest table in this migration.
CREATE INDEX IF NOT EXISTS meal_items_food_idx ON meal_items (food_id) WHERE food_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_meal_items_touch
AFTER UPDATE ON meal_items FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE meal_items SET updated_at = unixepoch() WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_meal_item_parent_ins
AFTER INSERT ON meal_items FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'meal item plan must match its meal plan')
   WHERE NEW.plan_id IS NOT (SELECT plan_id FROM meals WHERE id = NEW.meal_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_meal_item_parent_upd
AFTER UPDATE ON meal_items FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'meal item plan must match its meal plan')
   WHERE NEW.plan_id IS NOT (SELECT plan_id FROM meals WHERE id = NEW.meal_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_meal_item_count_cap
AFTER INSERT ON meal_items FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'a meal cannot hold more than 60 items')
   WHERE (SELECT COUNT(*) FROM meal_items WHERE meal_id = NEW.meal_id) > 60;
END;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- NUTRITION LOGS
--
-- What was actually eaten, which is a DIFFERENT SHAPE from what was prescribed and deliberately
-- not a mirror of it. A log has no cycle, no day_index and no plan hierarchy — it has a date and a
-- list of foods. Building it as a second copy of the plan tree would mean every schedule question
-- has two answers, which is the bug this project keeps finding.
--
-- The link to the plan is `plan_day_id`, nullable and SET NULL, and it exists only so the
-- adherence view (T4.1.6) can put "logged" next to "target". A client with no coach logs food with
-- that column NULL and nothing about the table changes.
CREATE TABLE IF NOT EXISTS nutrition_log_items (
  id INTEGER PRIMARY KEY,

  -- The client's own guard is single-table, with no join and no status filter: they own what they
  -- ate, and archiving a coach link does not touch it.
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The date the CLIENT was living, resolved by src/plans/schedule.js from their timezone at write
  -- time. Never derived from created_at at read time — a set logged at 00:30 in Budapest is not
  -- yesterday's, and a server in another zone must not decide otherwise.
  local_date TEXT NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  tz_name TEXT CHECK (tz_name IS NULL OR length(tz_name) <= 64),

  -- Free text, not an FK to `meals`: a client eating breakfast is not necessarily eating THE
  -- prescribed breakfast, and forcing the association would make every unplanned snack unloggable.
  meal_label TEXT CHECK (meal_label IS NULL OR length(trim(meal_label)) BETWEEN 1 AND 80),

  -- Both nullable and both SET NULL. Adherence is a comparison, not a foreign key.
  plan_day_id INTEGER REFERENCES nutrition_plan_days(id) ON DELETE SET NULL,
  food_id     INTEGER REFERENCES foods(id) ON DELETE SET NULL,

  grams_x10 INTEGER NOT NULL CHECK (grams_x10 BETWEEN 1 AND 5000000),

  food_name_snapshot TEXT NOT NULL CHECK (length(trim(food_name_snapshot)) BETWEEN 1 AND 160),
  kcal_per_100g_x10_snapshot   INTEGER NOT NULL CHECK (kcal_per_100g_x10_snapshot   BETWEEN 0 AND 9000),
  protein_mg_per_100g_snapshot INTEGER NOT NULL CHECK (protein_mg_per_100g_snapshot BETWEEN 0 AND 100000),
  carb_mg_per_100g_snapshot    INTEGER NOT NULL CHECK (carb_mg_per_100g_snapshot    BETWEEN 0 AND 100000),
  fat_mg_per_100g_snapshot     INTEGER NOT NULL CHECK (fat_mg_per_100g_snapshot     BETWEEN 0 AND 100000),
  fiber_mg_per_100g_snapshot   INTEGER CHECK (fiber_mg_per_100g_snapshot IS NULL OR
                                              fiber_mg_per_100g_snapshot BETWEEN 0 AND 100000),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- The one hot read: "everything I ate on this date". Covering, so a day view never touches the
-- table's other 5 000 rows.
CREATE INDEX IF NOT EXISTS nutrition_log_items_day_idx
  ON nutrition_log_items (client_user_id, local_date, id);
CREATE INDEX IF NOT EXISTS nutrition_log_items_food_idx
  ON nutrition_log_items (food_id) WHERE food_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS nutrition_log_items_plan_day_idx
  ON nutrition_log_items (plan_day_id) WHERE plan_day_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_nutrition_log_items_touch
AFTER UPDATE ON nutrition_log_items FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE nutrition_log_items SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- A day cannot hold an unbounded number of entries. Not a nutrition rule — a denial-of-service
-- ceiling, because this is the one table in the product an ordinary user writes to freely.
CREATE TRIGGER IF NOT EXISTS trg_nutrition_log_day_cap
AFTER INSERT ON nutrition_log_items FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'a day cannot hold more than 200 logged items')
   WHERE (SELECT COUNT(*) FROM nutrition_log_items
           WHERE client_user_id = NEW.client_user_id AND local_date = NEW.local_date) > 200;
END;

PRAGMA user_version = 15;
