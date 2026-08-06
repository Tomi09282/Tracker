-- 016_food_translations_and_seed.sql — multi-language food names, and the starter database.
--
-- ═══ WHY A TRANSLATIONS TABLE AND NOT A name_hu COLUMN ═════════════════════════════════════════
--
-- This is 004's decision, re-applied rather than re-decided. A per-language COLUMN is not
-- extensible: a third language means a migration, a new column on every text field, and a rewrite
-- of every query that reads them. `foods.name` stays the CANONICAL English fallback so a row is
-- always nameable even when a translation is missing, and so dedupe and admin listings have one
-- stable key that does not depend on the viewer's locale.
--
-- The shape is copied from `exercise_translations` deliberately, down to the rowid decision: an
-- FTS5 external-content index addresses its source by rowid, and a WITHOUT ROWID table has none.
-- The natural key lives in a UNIQUE index instead.
--
-- ═══ WHY THE SEED IS IN A MIGRATION ════════════════════════════════════════════════════════════
--
-- Lesson 4i: reference data belongs in a migration, not in an import script. A table whose
-- contents depend on whether somebody remembered to run a command is a table nobody can reason
-- about — the search either works on a fresh clone or it does not, and this way it does.
--
-- 95 foods, per 100 g of the edible portion, raw unless the name says otherwise, from the
-- standard published composition tables (USDA SR Legacy lineage). They are `source = 'system'`
-- and `verified = 1`: curated, owner-less, and outranking hand-typed rows in search.
--
-- HONEST ABOUT PRECISION: these are reference values for a generic item, not for the specific
-- packet in someone's kitchen. A branded product differs, sometimes by a lot, which is exactly
-- what the manual-food path is for. The numbers are rounded to what the columns store — kcal to
-- 0.1, macros to 0.001 g — and no row is claimed to be more precise than that.
--
-- A larger USDA import (scripts/import-usda.mjs) upserts on (source, source_ref) and can add tens
-- of thousands of rows on top of this without touching them: these carry 'system' source_refs and
-- an import carries 'usda' ones, so the two never collide.

CREATE TABLE IF NOT EXISTS food_translations (
  id              INTEGER PRIMARY KEY,
  food_id         INTEGER NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  -- ISO 639-1, two lowercase letters, so 'EN', 'en-GB' and 'english' cannot coexist as three
  -- spellings of one thing.
  lang            TEXT NOT NULL CHECK (lang GLOB '[a-z][a-z]'),
  name            TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  normalized_name TEXT NOT NULL,
  origin          TEXT NOT NULL DEFAULT 'dataset'
                  CHECK (origin IN ('dataset', 'human', 'machine')),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS food_translations_uidx ON food_translations (food_id, lang);
CREATE INDEX IF NOT EXISTS food_translations_lang_idx ON food_translations (lang, normalized_name);

CREATE TRIGGER IF NOT EXISTS trg_food_translations_touch
AFTER UPDATE ON food_translations FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE food_translations SET updated_at = unixepoch() WHERE id = NEW.id;
END;

CREATE VIRTUAL TABLE IF NOT EXISTS food_translations_fts USING fts5(
  name, content='food_translations', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS trg_food_tr_fts_ins AFTER INSERT ON food_translations BEGIN
  INSERT INTO food_translations_fts (rowid, name) VALUES (NEW.id, NEW.name);
END;
CREATE TRIGGER IF NOT EXISTS trg_food_tr_fts_del AFTER DELETE ON food_translations BEGIN
  INSERT INTO food_translations_fts (food_translations_fts, rowid, name)
       VALUES ('delete', OLD.id, OLD.name);
END;
CREATE TRIGGER IF NOT EXISTS trg_food_tr_fts_upd AFTER UPDATE ON food_translations BEGIN
  INSERT INTO food_translations_fts (food_translations_fts, rowid, name)
       VALUES ('delete', OLD.id, OLD.name);
  INSERT INTO food_translations_fts (rowid, name) VALUES (NEW.id, NEW.name);
END;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE SEED
--
-- `INSERT OR IGNORE` against the (source, source_ref) unique index, so re-running this migration
-- on a database that already has it is a no-op rather than a duplicate — the same property the
-- exercise seed has, and the reason a migration may be replayed without fear.

INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'chicken-breast-raw', 'Chicken breast, skinless, raw', 'chicken breast, skinless, raw', 1650,
  31000, 0, 3600, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Chicken breast, skinless, raw', 'chicken breast, skinless, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chicken-breast-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Csirkemell, bőr nélkül, nyers', 'csirkemell, bor nelkul, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chicken-breast-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Hähnchenbrust, ohne Haut, roh', 'hahnchenbrust, ohne haut, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chicken-breast-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'chicken-thigh-raw', 'Chicken thigh, skinless, raw', 'chicken thigh, skinless, raw', 2090,
  17800, 0, 15200, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Chicken thigh, skinless, raw', 'chicken thigh, skinless, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chicken-thigh-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Csirkecomb, bőr nélkül, nyers', 'csirkecomb, bor nelkul, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chicken-thigh-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Hähnchenschenkel, ohne Haut, roh', 'hahnchenschenkel, ohne haut, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chicken-thigh-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'turkey-breast-raw', 'Turkey breast, raw', 'turkey breast, raw', 1110,
  24600, 0, 1200, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Turkey breast, raw', 'turkey breast, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'turkey-breast-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Pulykamell, nyers', 'pulykamell, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'turkey-breast-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Putenbrust, roh', 'putenbrust, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'turkey-breast-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'beef-sirloin-raw', 'Beef sirloin, raw', 'beef sirloin, raw', 2010,
  21400, 0, 12700, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Beef sirloin, raw', 'beef sirloin, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beef-sirloin-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Marha hátszín, nyers', 'marha hatszin, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beef-sirloin-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Rinderlende, roh', 'rinderlende, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beef-sirloin-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'beef-mince-15-raw', 'Beef mince, 15% fat, raw', 'beef mince, 15% fat, raw', 2150,
  18600, 0, 15000, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Beef mince, 15% fat, raw', 'beef mince, 15% fat, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beef-mince-15-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Darált marha, 15% zsír, nyers', 'daralt marha, 15% zsir, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beef-mince-15-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Rinderhack, 15% Fett, roh', 'rinderhack, 15% fett, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beef-mince-15-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'pork-loin-raw', 'Pork loin, raw', 'pork loin, raw', 1430,
  21400, 0, 5900, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Pork loin, raw', 'pork loin, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pork-loin-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Sertéskaraj, nyers', 'serteskaraj, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pork-loin-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Schweinelende, roh', 'schweinelende, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pork-loin-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'pork-belly-raw', 'Pork belly, raw', 'pork belly, raw', 5180,
  9300, 0, 53000, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Pork belly, raw', 'pork belly, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pork-belly-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Sertéshas, nyers', 'serteshas, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pork-belly-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Schweinebauch, roh', 'schweinebauch, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pork-belly-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'ham-cooked-lean', 'Ham, cooked, lean', 'ham, cooked, lean', 1070,
  16600, 1500, 3600, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Ham, cooked, lean', 'ham, cooked, lean', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'ham-cooked-lean';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Sonka, főtt, sovány', 'sonka, fott, sovany', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'ham-cooked-lean';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Kochschinken, mager', 'kochschinken, mager', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'ham-cooked-lean';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'bacon-raw', 'Bacon, raw', 'bacon, raw', 4170,
  12600, 1300, 39700, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Bacon, raw', 'bacon, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bacon-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Bacon, nyers', 'bacon, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bacon-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Bacon, roh', 'bacon, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bacon-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'liver-chicken-raw', 'Chicken liver, raw', 'chicken liver, raw', 1190,
  16900, 700, 4800, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Chicken liver, raw', 'chicken liver, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'liver-chicken-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Csirkemáj, nyers', 'csirkemaj, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'liver-chicken-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Hähnchenleber, roh', 'hahnchenleber, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'liver-chicken-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'salmon-atlantic-raw', 'Salmon, Atlantic, raw', 'salmon, atlantic, raw', 2080,
  20400, 0, 13400, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Salmon, Atlantic, raw', 'salmon, atlantic, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'salmon-atlantic-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Lazac, atlanti, nyers', 'lazac, atlanti, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'salmon-atlantic-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Lachs, atlantisch, roh', 'lachs, atlantisch, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'salmon-atlantic-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'tuna-canned-water', 'Tuna, canned in water, drained', 'tuna, canned in water, drained', 1160,
  25500, 0, 800, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Tuna, canned in water, drained', 'tuna, canned in water, drained', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'tuna-canned-water';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Tonhal, vízben konzerv, lecsöpögtetve', 'tonhal, vizben konzerv, lecsopogtetve', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'tuna-canned-water';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Thunfisch, in Wasser, abgetropft', 'thunfisch, in wasser, abgetropft', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'tuna-canned-water';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'cod-raw', 'Cod, raw', 'cod, raw', 820,
  17800, 0, 700, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Cod, raw', 'cod, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cod-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Tőkehal, nyers', 'tokehal, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cod-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Kabeljau, roh', 'kabeljau, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cod-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'mackerel-raw', 'Mackerel, raw', 'mackerel, raw', 2050,
  18600, 0, 13900, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Mackerel, raw', 'mackerel, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'mackerel-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Makréla, nyers', 'makrela, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'mackerel-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Makrele, roh', 'makrele, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'mackerel-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'shrimp-raw', 'Shrimp, raw', 'shrimp, raw', 850,
  20100, 200, 500, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Shrimp, raw', 'shrimp, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'shrimp-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Garnéla, nyers', 'garnela, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'shrimp-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Garnele, roh', 'garnele, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'shrimp-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'carp-raw', 'Carp, raw', 'carp, raw', 1270,
  17800, 0, 5600, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Carp, raw', 'carp, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'carp-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Ponty, nyers', 'ponty, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'carp-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Karpfen, roh', 'karpfen, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'carp-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'egg-whole-raw', 'Egg, whole, raw', 'egg, whole, raw', 1430,
  12600, 700, 9500, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Egg, whole, raw', 'egg, whole, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'egg-whole-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Tojás, egész, nyers', 'tojas, egesz, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'egg-whole-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Ei, ganz, roh', 'ei, ganz, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'egg-whole-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'egg-white-raw', 'Egg white, raw', 'egg white, raw', 520,
  10900, 700, 200, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Egg white, raw', 'egg white, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'egg-white-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Tojásfehérje, nyers', 'tojasfeherje, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'egg-white-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Eiklar, roh', 'eiklar, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'egg-white-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'milk-2-5', 'Milk, 2.5% fat', 'milk, 2.5% fat', 500,
  3300, 4800, 2500, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Milk, 2.5% fat', 'milk, 2.5% fat', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'milk-2-5';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Tej, 2,8% zsír', 'tej, 2,8% zsir', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'milk-2-5';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Milch, 2,5% Fett', 'milch, 2,5% fett', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'milk-2-5';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'milk-skim', 'Milk, skimmed', 'milk, skimmed', 340,
  3400, 5000, 100, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Milk, skimmed', 'milk, skimmed', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'milk-skim';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Tej, zsírszegény', 'tej, zsirszegeny', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'milk-skim';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Milch, fettarm', 'milch, fettarm', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'milk-skim';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'greek-yogurt-2', 'Greek yogurt, 2% fat', 'greek yogurt, 2% fat', 730,
  9900, 3900, 1900, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Greek yogurt, 2% fat', 'greek yogurt, 2% fat', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'greek-yogurt-2';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Görög joghurt, 2% zsír', 'gorog joghurt, 2% zsir', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'greek-yogurt-2';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Griechischer Joghurt, 2% Fett', 'griechischer joghurt, 2% fett', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'greek-yogurt-2';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'kefir-plain', 'Kefir, plain', 'kefir, plain', 550,
  3300, 4500, 2500, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Kefir, plain', 'kefir, plain', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'kefir-plain';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Kefir, natúr', 'kefir, natur', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'kefir-plain';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Kefir, natur', 'kefir, natur', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'kefir-plain';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'cottage-cheese-lean', 'Cottage cheese, low fat', 'cottage cheese, low fat', 980,
  11100, 3400, 4300, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Cottage cheese, low fat', 'cottage cheese, low fat', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cottage-cheese-lean';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Túró, félzsíros', 'turo, felzsiros', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cottage-cheese-lean';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Hüttenkäse, fettarm', 'huttenkase, fettarm', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cottage-cheese-lean';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'quark-lean', 'Quark, lean', 'quark, lean', 720,
  12000, 4000, 300, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Quark, lean', 'quark, lean', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'quark-lean';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Sovány tehéntúró', 'sovany tehenturo', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'quark-lean';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Magerquark', 'magerquark', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'quark-lean';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'trappist-cheese', 'Semi-hard cheese (trappist type)', 'semi-hard cheese (trappist type)', 3560,
  25500, 1300, 27800, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Semi-hard cheese (trappist type)', 'semi-hard cheese (trappist type)', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'trappist-cheese';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Trappista sajt', 'trappista sajt', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'trappist-cheese';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Schnittkäse (Trappisten-Art)', 'schnittkase (trappisten-art)', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'trappist-cheese';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'mozzarella', 'Mozzarella', 'mozzarella', 2800,
  22200, 2200, 20300, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Mozzarella', 'mozzarella', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'mozzarella';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Mozzarella', 'mozzarella', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'mozzarella';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Mozzarella', 'mozzarella', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'mozzarella';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'butter', 'Butter', 'butter', 7170,
  900, 100, 81100, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Butter', 'butter', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'butter';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Vaj', 'vaj', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'butter';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Butter', 'butter', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'butter';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'sour-cream-20', 'Sour cream, 20% fat', 'sour cream, 20% fat', 1930,
  2500, 3500, 20000, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Sour cream, 20% fat', 'sour cream, 20% fat', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sour-cream-20';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Tejföl, 20% zsír', 'tejfol, 20% zsir', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sour-cream-20';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Schmand, 20% Fett', 'schmand, 20% fett', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sour-cream-20';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'oats-rolled-dry', 'Oats, rolled, dry', 'oats, rolled, dry', 3890,
  16900, 66300, 6900, 10600, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Oats, rolled, dry', 'oats, rolled, dry', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'oats-rolled-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Zabpehely, száraz', 'zabpehely, szaraz', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'oats-rolled-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Haferflocken, trocken', 'haferflocken, trocken', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'oats-rolled-dry';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'rice-white-dry', 'Rice, white, dry', 'rice, white, dry', 3650,
  7100, 80000, 700, 1300, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Rice, white, dry', 'rice, white, dry', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'rice-white-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Rizs, fehér, száraz', 'rizs, feher, szaraz', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'rice-white-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Reis, weiß, trocken', 'reis, weiß, trocken', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'rice-white-dry';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'rice-brown-dry', 'Rice, brown, dry', 'rice, brown, dry', 3700,
  7900, 77200, 2900, 3500, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Rice, brown, dry', 'rice, brown, dry', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'rice-brown-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Rizs, barna, száraz', 'rizs, barna, szaraz', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'rice-brown-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Reis, braun, trocken', 'reis, braun, trocken', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'rice-brown-dry';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'pasta-dry', 'Pasta, dry', 'pasta, dry', 3710,
  13000, 74700, 1500, 3200, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Pasta, dry', 'pasta, dry', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pasta-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Száraztészta', 'szarazteszta', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pasta-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Nudeln, trocken', 'nudeln, trocken', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pasta-dry';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'bread-white', 'Bread, white', 'bread, white', 2650,
  9000, 49000, 3200, 2700, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Bread, white', 'bread, white', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bread-white';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Fehér kenyér', 'feher kenyer', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bread-white';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Weißbrot', 'weißbrot', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bread-white';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'bread-wholemeal', 'Bread, wholemeal', 'bread, wholemeal', 2470,
  13000, 41000, 3400, 7000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Bread, wholemeal', 'bread, wholemeal', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bread-wholemeal';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Teljes kiőrlésű kenyér', 'teljes kiorlesu kenyer', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bread-wholemeal';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Vollkornbrot', 'vollkornbrot', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bread-wholemeal';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'potato-raw', 'Potato, raw', 'potato, raw', 770,
  2000, 17500, 100, 2200, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Potato, raw', 'potato, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'potato-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Burgonya, nyers', 'burgonya, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'potato-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Kartoffel, roh', 'kartoffel, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'potato-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'sweet-potato-raw', 'Sweet potato, raw', 'sweet potato, raw', 860,
  1600, 20100, 100, 3000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Sweet potato, raw', 'sweet potato, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sweet-potato-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Édesburgonya, nyers', 'edesburgonya, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sweet-potato-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Süßkartoffel, roh', 'sußkartoffel, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sweet-potato-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'couscous-dry', 'Couscous, dry', 'couscous, dry', 3760,
  12800, 77400, 600, 5000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Couscous, dry', 'couscous, dry', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'couscous-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Kuszkusz, száraz', 'kuszkusz, szaraz', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'couscous-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Couscous, trocken', 'couscous, trocken', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'couscous-dry';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'quinoa-dry', 'Quinoa, dry', 'quinoa, dry', 3680,
  14100, 64200, 6100, 7000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Quinoa, dry', 'quinoa, dry', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'quinoa-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Quinoa, száraz', 'quinoa, szaraz', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'quinoa-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Quinoa, trocken', 'quinoa, trocken', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'quinoa-dry';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'corn-sweet-raw', 'Sweetcorn, raw', 'sweetcorn, raw', 860,
  3300, 19000, 1400, 2000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Sweetcorn, raw', 'sweetcorn, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'corn-sweet-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Csemegekukorica, nyers', 'csemegekukorica, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'corn-sweet-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Zuckermais, roh', 'zuckermais, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'corn-sweet-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'lentils-dry', 'Lentils, dry', 'lentils, dry', 3520,
  24600, 63400, 1100, 10700, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Lentils, dry', 'lentils, dry', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'lentils-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Lencse, száraz', 'lencse, szaraz', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'lentils-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Linsen, trocken', 'linsen, trocken', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'lentils-dry';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'chickpeas-dry', 'Chickpeas, dry', 'chickpeas, dry', 3780,
  20500, 63000, 6000, 12200, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Chickpeas, dry', 'chickpeas, dry', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chickpeas-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Csicseriborsó, száraz', 'csicseriborso, szaraz', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chickpeas-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Kichererbsen, trocken', 'kichererbsen, trocken', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chickpeas-dry';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'beans-red-dry', 'Red kidney beans, dry', 'red kidney beans, dry', 3370,
  22500, 61300, 1100, 15200, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Red kidney beans, dry', 'red kidney beans, dry', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beans-red-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Vörösbab, száraz', 'vorosbab, szaraz', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beans-red-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Kidneybohnen, trocken', 'kidneybohnen, trocken', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beans-red-dry';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'peas-green-raw', 'Green peas, raw', 'green peas, raw', 810,
  5400, 14500, 400, 5100, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Green peas, raw', 'green peas, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peas-green-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Zöldborsó, nyers', 'zoldborso, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peas-green-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Erbsen, roh', 'erbsen, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peas-green-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'tofu-firm', 'Tofu, firm', 'tofu, firm', 1440,
  17300, 2800, 8700, 2300, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Tofu, firm', 'tofu, firm', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'tofu-firm';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Tofu, kemény', 'tofu, kemeny', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'tofu-firm';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Tofu, fest', 'tofu, fest', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'tofu-firm';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'broccoli-raw', 'Broccoli, raw', 'broccoli, raw', 340,
  2800, 6600, 400, 2600, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Broccoli, raw', 'broccoli, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'broccoli-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Brokkoli, nyers', 'brokkoli, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'broccoli-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Brokkoli, roh', 'brokkoli, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'broccoli-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'spinach-raw', 'Spinach, raw', 'spinach, raw', 230,
  2900, 3600, 400, 2200, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Spinach, raw', 'spinach, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'spinach-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Spenót, nyers', 'spenot, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'spinach-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Spinat, roh', 'spinat, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'spinach-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'carrot-raw', 'Carrot, raw', 'carrot, raw', 410,
  900, 9600, 200, 2800, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Carrot, raw', 'carrot, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'carrot-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Sárgarépa, nyers', 'sargarepa, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'carrot-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Karotte, roh', 'karotte, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'carrot-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'tomato-raw', 'Tomato, raw', 'tomato, raw', 180,
  900, 3900, 200, 1200, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Tomato, raw', 'tomato, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'tomato-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Paradicsom, nyers', 'paradicsom, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'tomato-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Tomate, roh', 'tomate, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'tomato-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'cucumber-raw', 'Cucumber, raw', 'cucumber, raw', 150,
  700, 3600, 100, 500, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Cucumber, raw', 'cucumber, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cucumber-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Uborka, nyers', 'uborka, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cucumber-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Gurke, roh', 'gurke, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cucumber-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'pepper-bell-raw', 'Bell pepper, raw', 'bell pepper, raw', 260,
  1000, 6000, 300, 2100, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Bell pepper, raw', 'bell pepper, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pepper-bell-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Paprika, nyers', 'paprika, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pepper-bell-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Paprika, roh', 'paprika, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pepper-bell-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'onion-raw', 'Onion, raw', 'onion, raw', 400,
  1100, 9300, 100, 1700, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Onion, raw', 'onion, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'onion-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Vöröshagyma, nyers', 'voroshagyma, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'onion-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Zwiebel, roh', 'zwiebel, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'onion-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'cabbage-raw', 'Cabbage, raw', 'cabbage, raw', 250,
  1300, 5800, 100, 2500, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Cabbage, raw', 'cabbage, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cabbage-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Káposzta, nyers', 'kaposzta, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cabbage-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Kohl, roh', 'kohl, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cabbage-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'cauliflower-raw', 'Cauliflower, raw', 'cauliflower, raw', 250,
  1900, 5000, 300, 2000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Cauliflower, raw', 'cauliflower, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cauliflower-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Karfiol, nyers', 'karfiol, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cauliflower-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Blumenkohl, roh', 'blumenkohl, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cauliflower-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'zucchini-raw', 'Zucchini, raw', 'zucchini, raw', 170,
  1200, 3100, 300, 1000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Zucchini, raw', 'zucchini, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'zucchini-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Cukkini, nyers', 'cukkini, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'zucchini-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Zucchini, roh', 'zucchini, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'zucchini-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'mushroom-button-raw', 'Mushrooms, white, raw', 'mushrooms, white, raw', 220,
  3100, 3300, 300, 1000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Mushrooms, white, raw', 'mushrooms, white, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'mushroom-button-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Csiperkegomba, nyers', 'csiperkegomba, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'mushroom-button-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Champignons, roh', 'champignons, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'mushroom-button-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'lettuce-raw', 'Lettuce, raw', 'lettuce, raw', 150,
  1400, 2900, 200, 1300, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Lettuce, raw', 'lettuce, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'lettuce-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Fejes saláta, nyers', 'fejes salata, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'lettuce-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Kopfsalat, roh', 'kopfsalat, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'lettuce-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'banana-raw', 'Banana, raw', 'banana, raw', 890,
  1100, 22800, 300, 2600, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Banana, raw', 'banana, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'banana-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Banán, nyers', 'banan, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'banana-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Banane, roh', 'banane, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'banana-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'apple-raw', 'Apple, raw', 'apple, raw', 520,
  300, 13800, 200, 2400, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Apple, raw', 'apple, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'apple-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Alma, nyers', 'alma, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'apple-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Apfel, roh', 'apfel, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'apple-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'orange-raw', 'Orange, raw', 'orange, raw', 470,
  900, 11800, 100, 2400, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Orange, raw', 'orange, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'orange-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Narancs, nyers', 'narancs, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'orange-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Orange, roh', 'orange, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'orange-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'strawberry-raw', 'Strawberry, raw', 'strawberry, raw', 320,
  700, 7700, 300, 2000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Strawberry, raw', 'strawberry, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'strawberry-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Eper, nyers', 'eper, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'strawberry-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Erdbeere, roh', 'erdbeere, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'strawberry-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'blueberry-raw', 'Blueberry, raw', 'blueberry, raw', 570,
  700, 14500, 300, 2400, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Blueberry, raw', 'blueberry, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'blueberry-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Áfonya, nyers', 'afonya, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'blueberry-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Heidelbeere, roh', 'heidelbeere, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'blueberry-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'grape-raw', 'Grapes, raw', 'grapes, raw', 690,
  700, 18100, 200, 900, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Grapes, raw', 'grapes, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'grape-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Szőlő, nyers', 'szolo, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'grape-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Weintrauben, roh', 'weintrauben, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'grape-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'watermelon-raw', 'Watermelon, raw', 'watermelon, raw', 300,
  600, 7600, 200, 400, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Watermelon, raw', 'watermelon, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'watermelon-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Görögdinnye, nyers', 'gorogdinnye, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'watermelon-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Wassermelone, roh', 'wassermelone, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'watermelon-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'pear-raw', 'Pear, raw', 'pear, raw', 570,
  400, 15200, 100, 3100, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Pear, raw', 'pear, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pear-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Körte, nyers', 'korte, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pear-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Birne, roh', 'birne, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'pear-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'peach-raw', 'Peach, raw', 'peach, raw', 390,
  900, 9500, 300, 1500, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Peach, raw', 'peach, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peach-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Őszibarack, nyers', 'oszibarack, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peach-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Pfirsich, roh', 'pfirsich, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peach-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'avocado-raw', 'Avocado, raw', 'avocado, raw', 1600,
  2000, 8500, 14700, 6700, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Avocado, raw', 'avocado, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'avocado-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Avokádó, nyers', 'avokado, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'avocado-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Avocado, roh', 'avocado, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'avocado-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'raisins', 'Raisins', 'raisins', 2990,
  3100, 79200, 500, 3700, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Raisins', 'raisins', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'raisins';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Mazsola', 'mazsola', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'raisins';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Rosinen', 'rosinen', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'raisins';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'almond-raw', 'Almonds, raw', 'almonds, raw', 5790,
  21200, 21600, 49900, 12500, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Almonds, raw', 'almonds, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'almond-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Mandula, nyers', 'mandula, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'almond-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Mandeln, roh', 'mandeln, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'almond-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'walnut-raw', 'Walnuts, raw', 'walnuts, raw', 6540,
  15200, 13700, 65200, 6700, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Walnuts, raw', 'walnuts, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'walnut-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Dió, nyers', 'dio, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'walnut-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Walnüsse, roh', 'walnusse, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'walnut-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'peanut-raw', 'Peanuts, raw', 'peanuts, raw', 5670,
  25800, 16100, 49200, 8500, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Peanuts, raw', 'peanuts, raw', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peanut-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Földimogyoró, nyers', 'foldimogyoro, nyers', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peanut-raw';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Erdnüsse, roh', 'erdnusse, roh', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peanut-raw';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'peanut-butter', 'Peanut butter', 'peanut butter', 5880,
  25100, 20000, 50400, 6000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Peanut butter', 'peanut butter', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peanut-butter';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Mogyoróvaj', 'mogyorovaj', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peanut-butter';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Erdnussbutter', 'erdnussbutter', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'peanut-butter';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'sunflower-seed', 'Sunflower seeds', 'sunflower seeds', 5840,
  20800, 20000, 51500, 8600, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Sunflower seeds', 'sunflower seeds', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sunflower-seed';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Napraforgómag', 'napraforgomag', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sunflower-seed';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Sonnenblumenkerne', 'sonnenblumenkerne', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sunflower-seed';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'chia-seed', 'Chia seeds', 'chia seeds', 4860,
  16500, 42100, 30700, 34400, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Chia seeds', 'chia seeds', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chia-seed';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Chia mag', 'chia mag', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chia-seed';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Chiasamen', 'chiasamen', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'chia-seed';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'olive-oil', 'Olive oil', 'olive oil', 8840,
  0, 0, 100000, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Olive oil', 'olive oil', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'olive-oil';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Olívaolaj', 'olivaolaj', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'olive-oil';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Olivenöl', 'olivenol', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'olive-oil';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'sunflower-oil', 'Sunflower oil', 'sunflower oil', 8840,
  0, 0, 100000, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Sunflower oil', 'sunflower oil', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sunflower-oil';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Napraforgóolaj', 'napraforgoolaj', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sunflower-oil';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Sonnenblumenöl', 'sonnenblumenol', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sunflower-oil';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'honey', 'Honey', 'honey', 3040,
  300, 82400, 0, 200, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Honey', 'honey', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'honey';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Méz', 'mez', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'honey';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Honig', 'honig', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'honey';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'sugar-white', 'Sugar, white', 'sugar, white', 3870,
  0, 100000, 0, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Sugar, white', 'sugar, white', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sugar-white';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Kristálycukor', 'kristalycukor', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sugar-white';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Zucker, weiß', 'zucker, weiß', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'sugar-white';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'dark-chocolate-70', 'Dark chocolate, 70-85%', 'dark chocolate, 70-85%', 5980,
  7800, 45900, 42600, 10900, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Dark chocolate, 70-85%', 'dark chocolate, 70-85%', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'dark-chocolate-70';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Étcsokoládé, 70-85%', 'etcsokolade, 70-85%', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'dark-chocolate-70';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Zartbitterschokolade, 70-85%', 'zartbitterschokolade, 70-85%', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'dark-chocolate-70';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'cola-regular', 'Cola, regular', 'cola, regular', 370,
  0, 9600, 0, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Cola, regular', 'cola, regular', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cola-regular';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Kóla, cukros', 'kola, cukros', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cola-regular';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Cola, normal', 'cola, normal', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'cola-regular';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'beer-lager', 'Beer, lager', 'beer, lager', 430,
  500, 3600, 0, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Beer, lager', 'beer, lager', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beer-lager';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Sör, világos', 'sor, vilagos', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beer-lager';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Bier, hell', 'bier, hell', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'beer-lager';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'wine-red', 'Wine, red', 'wine, red', 850,
  100, 2600, 0, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Wine, red', 'wine, red', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'wine-red';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Vörösbor', 'vorosbor', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'wine-red';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Rotwein', 'rotwein', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'wine-red';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'turo-rudi', 'Curd cheese bar, chocolate coated', 'curd cheese bar, chocolate coated', 3400,
  6000, 40000, 15000, 1000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Curd cheese bar, chocolate coated', 'curd cheese bar, chocolate coated', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'turo-rudi';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Túró Rudi', 'turo rudi', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'turo-rudi';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Quarkriegel, schokoliert', 'quarkriegel, schokoliert', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'turo-rudi';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'kolbasz-dry', 'Dry sausage, Hungarian', 'dry sausage, hungarian', 4380,
  20000, 2000, 39000, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Dry sausage, Hungarian', 'dry sausage, hungarian', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'kolbasz-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Száraz kolbász', 'szaraz kolbasz', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'kolbasz-dry';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Ungarische Dauerwurst', 'ungarische dauerwurst', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'kolbasz-dry';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'szalonna', 'Cured pork fatback', 'cured pork fatback', 5410,
  8400, 0, 56000, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Cured pork fatback', 'cured pork fatback', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'szalonna';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Szalonna', 'szalonna', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'szalonna';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Speck', 'speck', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'szalonna';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'lecso', 'Lecso (pepper-tomato stew)', 'lecso (pepper-tomato stew)', 580,
  1400, 6500, 2900, 1800, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Lecso (pepper-tomato stew)', 'lecso (pepper-tomato stew)', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'lecso';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Lecsó', 'lecso', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'lecso';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Letscho', 'letscho', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'lecso';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'gulyas-soup', 'Goulash soup', 'goulash soup', 780,
  6200, 5400, 3400, 900, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Goulash soup', 'goulash soup', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'gulyas-soup';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Gulyásleves', 'gulyasleves', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'gulyas-soup';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Gulaschsuppe', 'gulaschsuppe', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'gulyas-soup';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'langos-plain', 'Langos, plain fried dough', 'langos, plain fried dough', 3180,
  6900, 42000, 13600, 1900, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Langos, plain fried dough', 'langos, plain fried dough', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'langos-plain';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Lángos, natúr', 'langos, natur', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'langos-plain';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Langosch, natur', 'langosch, natur', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'langos-plain';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'bableves', 'Bean soup', 'bean soup', 920,
  5100, 12400, 2300, 3400, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Bean soup', 'bean soup', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bableves';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Bableves', 'bableves', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bableves';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Bohnensuppe', 'bohnensuppe', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'bableves';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'paprika-ground-sweet', 'Paprika, ground, sweet', 'paprika, ground, sweet', 2820,
  14100, 53900, 12900, 34900, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Paprika, ground, sweet', 'paprika, ground, sweet', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'paprika-ground-sweet';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Fűszerpaprika, édesnemes', 'fuszerpaprika, edesnemes', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'paprika-ground-sweet';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Paprikapulver, edelsüß', 'paprikapulver, edelsuß', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'paprika-ground-sweet';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'whey-protein-concentrate', 'Whey protein concentrate powder', 'whey protein concentrate powder', 4000,
  80000, 8000, 6000, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Whey protein concentrate powder', 'whey protein concentrate powder', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'whey-protein-concentrate';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Tejsavófehérje koncentrátum por', 'tejsavofeherje koncentratum por', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'whey-protein-concentrate';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Molkenprotein-Konzentrat Pulver', 'molkenprotein-konzentrat pulver', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'whey-protein-concentrate';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'whey-protein-isolate', 'Whey protein isolate powder', 'whey protein isolate powder', 3700,
  90000, 1000, 1000, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Whey protein isolate powder', 'whey protein isolate powder', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'whey-protein-isolate';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Tejsavófehérje izolátum por', 'tejsavofeherje izolatum por', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'whey-protein-isolate';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Molkenprotein-Isolat Pulver', 'molkenprotein-isolat pulver', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'whey-protein-isolate';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'casein-protein', 'Casein protein powder', 'casein protein powder', 3700,
  80000, 6000, 2000, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Casein protein powder', 'casein protein powder', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'casein-protein';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Kazein fehérjepor', 'kazein feherjepor', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'casein-protein';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Casein-Proteinpulver', 'casein-proteinpulver', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'casein-protein';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'creatine-monohydrate', 'Creatine monohydrate', 'creatine monohydrate', 0,
  0, 0, 0, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Creatine monohydrate', 'creatine monohydrate', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'creatine-monohydrate';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Kreatin-monohidrát', 'kreatin-monohidrat', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'creatine-monohydrate';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Creatin-Monohydrat', 'creatin-monohydrat', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'creatine-monohydrate';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'maltodextrin', 'Maltodextrin', 'maltodextrin', 3800,
  0, 95000, 0, 0, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Maltodextrin', 'maltodextrin', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'maltodextrin';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Maltodextrin', 'maltodextrin', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'maltodextrin';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Maltodextrin', 'maltodextrin', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'maltodextrin';
INSERT OR IGNORE INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
  protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g, verified)
VALUES ('system', 'protein-bar-generic', 'Protein bar, generic', 'protein bar, generic', 3700,
  30000, 32000, 12000, 5000, 1);
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'en', 'Protein bar, generic', 'protein bar, generic', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'protein-bar-generic';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'hu', 'Fehérjeszelet, általános', 'feherjeszelet, altalanos', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'protein-bar-generic';
INSERT OR IGNORE INTO food_translations (food_id, lang, name, normalized_name, origin)
SELECT id, 'de', 'Proteinriegel, generisch', 'proteinriegel, generisch', 'dataset'
  FROM foods WHERE source = 'system' AND source_ref = 'protein-bar-generic';

PRAGMA user_version = 16;
