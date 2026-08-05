-- 007_taxonomy_i18n.sql — the muscle-group and equipment taxonomies stop being bilingual.
--
-- Migration 004 already made this argument for exercise names and won it: a `name_hu` COLUMN
-- means every new language is a schema change, a backfill and a deploy. The taxonomy tables were
-- left behind at the time because they hold 36 rows between them and the pain was theoretical.
--
-- It is not theoretical any more. There are 22 enabled languages, and the very next screen
-- (onboarding) asks the client to pick their available equipment BY NAME. Shipping that screen on
-- top of `name_en`/`name_hu` would mean a Polish client picking equipment from an English list,
-- with no path to fixing it that is not another migration.
--
-- The shape deliberately mirrors `exercise_translations`:
--   canonical name on the row  →  per-language rows in a translations table  →  fallback chain.
-- One pattern for all translated content, not two that drift.
--
-- ONE generic table rather than muscle_group_translations + equipment_translations: both are small
-- lookup sets with an identical shape, and the next taxonomy (body areas, goal labels if they ever
-- leave the enum) plugs in without another migration. The `kind` discriminator is CHECK-bounded so
-- a typo cannot invent a silent third taxonomy.

-- `name_en` becomes the canonical name, matching `exercises.name`. RENAME rather than
-- add-copy-drop: it keeps the column's data in place and cannot half-apply.
ALTER TABLE muscle_groups RENAME COLUMN name_en TO name;
ALTER TABLE equipment RENAME COLUMN name_en TO name;

CREATE TABLE IF NOT EXISTS taxonomy_translations (
  id     INTEGER PRIMARY KEY,
  -- Which taxonomy this row translates. Bounded, so `kind` can be a bound parameter in a query
  -- without any chance of it selecting a table name.
  kind   TEXT NOT NULL CHECK (kind IN ('muscle_group', 'equipment')),
  ref_id INTEGER NOT NULL,
  lang   TEXT NOT NULL REFERENCES languages(code) ON UPDATE CASCADE,
  name   TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  -- Where the text came from, so a machine-translated label can be found and replaced later
  -- without guessing which rows a human wrote.
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'dataset', 'machine')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  -- A taxonomy row has at most one name per language. Without this, a double-run of a seed
  -- silently doubles every label and the UI picks one at random.
  UNIQUE (kind, ref_id, lang)
);

-- The read path always filters on all three, in this order.
CREATE INDEX IF NOT EXISTS idx_taxonomy_tr_lookup ON taxonomy_translations (kind, lang, ref_id);

-- Backfill: the Hungarian labels that already exist are hand-written, so they are `manual`.
INSERT OR IGNORE INTO taxonomy_translations (kind, ref_id, lang, name, origin)
SELECT 'muscle_group', id, 'hu', name_hu, 'manual'
  FROM muscle_groups
 WHERE name_hu IS NOT NULL AND trim(name_hu) <> '';

INSERT OR IGNORE INTO taxonomy_translations (kind, ref_id, lang, name, origin)
SELECT 'equipment', id, 'hu', name_hu, 'manual'
  FROM equipment
 WHERE name_hu IS NOT NULL AND trim(name_hu) <> '';

-- English too, so the read path is uniform: every language, including the canonical one, is a row.
-- The canonical column stays as the last-resort fallback, never as a special case in the query.
INSERT OR IGNORE INTO taxonomy_translations (kind, ref_id, lang, name, origin)
SELECT 'muscle_group', id, 'en', name, 'manual' FROM muscle_groups;

INSERT OR IGNORE INTO taxonomy_translations (kind, ref_id, lang, name, origin)
SELECT 'equipment', id, 'en', name, 'manual' FROM equipment;

-- The bilingual columns are gone. Anything still reading them fails loudly at the next query
-- rather than quietly serving English to a Hungarian client.
ALTER TABLE muscle_groups DROP COLUMN name_hu;
ALTER TABLE equipment DROP COLUMN name_hu;
