-- 004_translations.sql — real multi-language content for the exercise library.
--
-- Why this replaces the `name_hu` column: a per-language COLUMN is not extensible. Adding a
-- third language would mean a migration, a new column on every text field, and a rewrite of
-- every query that reads them. A translations TABLE costs one join and supports any language
-- forever — which is what the data-model rule "extensible, any table, NF3" actually asks for.
--
-- `exercises.name` and `exercises.normalized_name` stay as the CANONICAL English fallback: a
-- row must always be nameable even if a translation is missing, and dedupe and admin listings
-- need one stable key that never depends on the viewer's locale.

-- NOTE: this is a rowid table on purpose, even though (exercise_id, lang) is the natural key.
-- An FTS5 external-content index addresses its source by rowid, and a WITHOUT ROWID table has
-- none — so the composite key lives in a UNIQUE index instead, and a surrogate id carries the
-- FTS link. Getting this wrong fails at CREATE time, which is the good outcome.
CREATE TABLE IF NOT EXISTS exercise_translations (
  id              INTEGER PRIMARY KEY,
  exercise_id     INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  -- ISO 639-1. The CHECK keeps it two lowercase letters, so 'EN', 'en-GB' and 'english' can
  -- never coexist as three spellings of the same thing.
  lang            TEXT NOT NULL CHECK (lang GLOB '[a-z][a-z]'),
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  description     TEXT,
  instructions    TEXT,           -- JSON array of ordered steps
  -- Where this text came from, so a machine translation can later be told apart from a
  -- dataset one or a human edit without guessing.
  origin          TEXT NOT NULL DEFAULT 'dataset'
                  CHECK (origin IN ('dataset', 'human', 'machine')),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS exercise_translations_unique ON exercise_translations (exercise_id, lang);
CREATE INDEX IF NOT EXISTS exercise_translations_lang_idx ON exercise_translations (lang, normalized_name);

CREATE TRIGGER IF NOT EXISTS exercise_translations_updated_at
AFTER UPDATE ON exercise_translations FOR EACH ROW
BEGIN
  UPDATE exercise_translations SET updated_at = unixepoch() WHERE id = OLD.id;
END;

-- Search index over the translations, so a Hungarian query matches Hungarian text and an
-- English one matches English. The visibility predicate is still applied to the BASE exercise
-- row afterwards — this index knows nothing about ownership and must never be the only gate.
CREATE VIRTUAL TABLE IF NOT EXISTS exercise_translations_fts USING fts5(
  name, normalized_name, description,
  content='exercise_translations',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- Backfill from the columns this table replaces. English always exists (it is the canonical
-- name); Hungarian only where the wger import supplied one.
INSERT OR IGNORE INTO exercise_translations (exercise_id, lang, name, normalized_name, description, instructions, origin)
SELECT id, 'en', name, normalized_name, description, instructions, 'dataset'
  FROM exercises;

INSERT OR IGNORE INTO exercise_translations (exercise_id, lang, name, normalized_name, description, instructions, origin)
SELECT id, 'hu', name_hu, lower(name_hu), NULL, NULL, 'dataset'
  FROM exercises
 WHERE name_hu IS NOT NULL AND trim(name_hu) <> '';

-- Populate the FTS index from the rows just written. (An external-content table starts empty;
-- the triggers below only cover future writes.)
INSERT INTO exercise_translations_fts (rowid, name, normalized_name, description)
SELECT id, name, normalized_name, description FROM exercise_translations;

CREATE TRIGGER IF NOT EXISTS exercise_translations_fts_insert
AFTER INSERT ON exercise_translations BEGIN
  INSERT INTO exercise_translations_fts (rowid, name, normalized_name, description)
  VALUES (new.id, new.name, new.normalized_name, new.description);
END;

CREATE TRIGGER IF NOT EXISTS exercise_translations_fts_delete
AFTER DELETE ON exercise_translations BEGIN
  INSERT INTO exercise_translations_fts (exercise_translations_fts, rowid, name, normalized_name, description)
  VALUES ('delete', old.id, old.name, old.normalized_name, old.description);
END;

CREATE TRIGGER IF NOT EXISTS exercise_translations_fts_update
AFTER UPDATE ON exercise_translations BEGIN
  INSERT INTO exercise_translations_fts (exercise_translations_fts, rowid, name, normalized_name, description)
  VALUES ('delete', old.id, old.name, old.normalized_name, old.description);
  INSERT INTO exercise_translations_fts (rowid, name, normalized_name, description)
  VALUES (new.id, new.name, new.normalized_name, new.description);
END;

-- The set of languages the product serves. A lookup table rather than a CHECK, because adding
-- a language must not require a migration — which was the whole problem with `name_hu`.
CREATE TABLE IF NOT EXISTS languages (
  code       TEXT PRIMARY KEY CHECK (code GLOB '[a-z][a-z]'),
  name_en    TEXT NOT NULL,
  name_native TEXT NOT NULL,
  -- Exactly one row carries this: the language every other one falls back to.
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  enabled    INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

INSERT OR IGNORE INTO languages (code, name_en, name_native, is_default, sort_order) VALUES
  ('hu', 'Hungarian', 'Magyar', 0, 10),
  ('en', 'English', 'English', 1, 20);

CREATE UNIQUE INDEX IF NOT EXISTS languages_single_default ON languages (is_default) WHERE is_default = 1;
