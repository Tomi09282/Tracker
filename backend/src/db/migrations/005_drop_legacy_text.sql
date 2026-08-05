-- 005_drop_legacy_text.sql — removes what migration 004 superseded.
--
-- Two things became dead weight the moment `exercise_translations` landed, and dead schema is
-- not harmless: it invites a future writer to populate a column nothing reads, and it keeps an
-- index alive that costs a write on every insert while answering no query.
--
--   exercises_fts   — the old single-language search index. Search now runs against
--                     exercise_translations_fts. Verified unreferenced in src/ and scripts/.
--   exercises.name_hu — the per-language column the translations table replaced.
--
-- The triggers must go first: SQLite refuses to drop a column a trigger still names.

DROP TRIGGER IF EXISTS exercises_fts_insert;
DROP TRIGGER IF EXISTS exercises_fts_delete;
DROP TRIGGER IF EXISTS exercises_fts_update;
DROP TABLE IF EXISTS exercises_fts;

ALTER TABLE exercises DROP COLUMN name_hu;
