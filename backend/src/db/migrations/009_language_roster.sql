-- 009_language_roster.sql — the set of languages the product knows about becomes schema, not a
-- side effect of an import.
--
-- Migration 004 seeded exactly two rows, hu and en. Every other language row in a working
-- database got there because `seed-translations.mjs` inserted it while importing the wger dataset.
-- That means a freshly migrated database and a seeded one have DIFFERENT language tables, and
-- nothing says so.
--
-- The cost of that showed up the moment the smoke suite tried to test the fallback chain. It runs
-- against a throwaway database with migrations applied and no import, so `UPDATE languages SET
-- enabled = 1 WHERE code = 'de'` changed zero rows — silently, because an UPDATE that matches
-- nothing is not an error. The test then failed with a confusing message about German while the
-- German code was fine.
--
-- The distinction this migration draws:
--   the ROSTER — which languages exist at all — is reference data and belongs in the schema;
--   `enabled` — which of them a user may actually be served — is policy, and stays a runtime flag.
--
-- `enabled = 0` for everything added here. A language turns on when it has a UI bundle, and
-- `backend/scripts/check-languages.mjs` is what proves that.
--
-- Codes and native names follow ISO 639-1 and the names each language uses for itself — never a
-- translated name, because the person reading a language list is the one who cannot read the
-- current interface.

INSERT OR IGNORE INTO languages (code, name_en, name_native, is_default, enabled, sort_order) VALUES
  ('de', 'German',     'Deutsch',     0, 0, 30),
  ('es', 'Spanish',    'Español',     0, 0, 40),
  ('fr', 'French',     'Français',    0, 0, 50),
  ('it', 'Italian',    'Italiano',    0, 0, 60),
  ('pt', 'Portuguese', 'Português',   0, 0, 70),
  ('nl', 'Dutch',      'Nederlands',  0, 0, 80),
  ('pl', 'Polish',     'Polski',      0, 0, 90),
  ('cs', 'Czech',      'Čeština',     0, 0, 100),
  ('sk', 'Slovak',     'Slovenčina',  0, 0, 110),
  ('hr', 'Croatian',   'Hrvatski',    0, 0, 120),
  ('ro', 'Romanian',   'Română',      0, 0, 130),
  ('sv', 'Swedish',    'Svenska',     0, 0, 140),
  ('el', 'Greek',      'Ελληνικά',    0, 0, 150),
  ('tr', 'Turkish',    'Türkçe',      0, 0, 160),
  ('ru', 'Russian',    'Русский',     0, 0, 170),
  ('uk', 'Ukrainian',  'Українська',  0, 0, 180),
  ('az', 'Azerbaijani','Azərbaycan',  0, 0, 190),
  ('id', 'Indonesian', 'Indonesia',   0, 0, 200),
  ('zh', 'Chinese',    '中文',         0, 0, 210),
  -- Right-to-left. Nothing in the UI handles RTL yet, so these are rostered but will not be
  -- enabled until the layout does — enabling one early would ship a mirrored interface that
  -- looks broken to the only people who can read it.
  ('ar', 'Arabic',     'العربية',      0, 0, 220),
  ('he', 'Hebrew',     'עברית',        0, 0, 230),
  ('fa', 'Persian',    'فارسی',        0, 0, 240),
  -- A constructed language with a real wger translation set. Harmless, and honest about what the
  -- dataset actually contains.
  ('eo', 'Esperanto',  'Esperanto',   0, 0, 250);
