-- 012_element_style_e27.sql — the interval stage joins the element catalogue.
--
-- DATA ONLY. No table, no column, no trigger: T2.8.6 needed no schema change, because
-- `workout_plan_blocks` already carried `rounds`, `rest_seconds` and `cap_seconds`, and a ROUND IS
-- A SET ROW. What was missing was that `b.rounds` was joined and read by nobody.
--
-- 002_theming.sql seeds E1..E26 so the admin style studio has a complete list from day one and no
-- migration is needed when a component finally lands. E27 gets its row for exactly that reason.
-- The frontend does not depend on it — `useElementVariant` already falls back to 'A' — so this is
-- about the studio being able to offer the choice, not about the stage rendering.

INSERT OR IGNORE INTO element_style_config (element_id, variant) VALUES ('E27', 'A');

PRAGMA user_version = 12;
