-- 002_theming.sql — per-user theme preferences and the global element-style config.

-- One row per user. The pack is a closed set; the accent is a validated hex; the gradient is
-- the one genuinely non-relational thing here — an ordered list of stops plus an angle, which
-- has no meaning outside the theme it belongs to and is never queried by its parts.
CREATE TABLE IF NOT EXISTS user_theme_prefs (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pack       TEXT NOT NULL DEFAULT 'midnight'
             CHECK (pack IN ('midnight', 'solar', 'forest', 'neon', 'mono')),
  -- NULL means "use the pack's own accent". Storing the pack default here instead would
  -- silently freeze it, so a later refinement of the pack would not reach existing users.
  accent     TEXT CHECK (accent IS NULL OR accent GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  gradient   TEXT,  -- JSON: { angle, type, stops: [{ color, position }] } or NULL
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TRIGGER IF NOT EXISTS user_theme_prefs_updated_at
AFTER UPDATE ON user_theme_prefs FOR EACH ROW
BEGIN
  UPDATE user_theme_prefs SET updated_at = unixepoch() WHERE user_id = OLD.user_id;
END;

-- The active feedback variant per element, GLOBAL for every user (owner requirement 24).
-- WITHOUT ROWID because the whole table is read as one small keyed lookup on every page load
-- and never scanned by rowid.
CREATE TABLE IF NOT EXISTS element_style_config (
  element_id TEXT PRIMARY KEY CHECK (element_id GLOB 'E[0-9]*'),
  variant    TEXT NOT NULL DEFAULT 'A' CHECK (variant IN ('A', 'B', 'C', 'D', 'E')),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) WITHOUT ROWID;

-- Curated defaults, from the element catalog. E21–E26 are seeded inert: their elements arrive
-- in later phases, but the row exists so the admin studio has a complete list from day one and
-- no migration is needed when the component lands.
INSERT OR IGNORE INTO element_style_config (element_id, variant) VALUES
  ('E1','D'),  ('E2','A'),  ('E3','A'),  ('E4','A'),  ('E5','A'),
  ('E6','A'),  ('E7','A'),  ('E8','D'),  ('E9','A'),  ('E10','A'),
  ('E11','A'), ('E12','D'), ('E13','B'), ('E14','A'), ('E15','C'),
  ('E16','D'), ('E17','A'), ('E18','A'), ('E19','C'), ('E20','B'),
  ('E21','A'), ('E22','A'), ('E23','A'), ('E24','A'), ('E25','B'), ('E26','A');
