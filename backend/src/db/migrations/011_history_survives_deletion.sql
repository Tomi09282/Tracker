-- 011_history_survives_deletion.sql — a departing coach must not take their clients' training
-- history with them.
--
-- THE CHAIN, verified by the J4 adversarial review:
--
--   users            → exercises.owner_id          ON DELETE CASCADE   (migration 003)
--   exercises        → workout_log_exercises.exercise_id  ON DELETE SET NULL
--                    → workout_log_sets.exercise_id       ON DELETE SET NULL
--                    → workout_pr_events.exercise_id      ON DELETE SET NULL
--
-- Delete a coach and every custom exercise they authored is destroyed. The logs survive — they
-- snapshot the name — but their `exercise_id` becomes NULL, and every query that GROUPS by it
-- stops working. The client's progress graph for that movement, their record book entry, their
-- "previous" column: all of it silently stops resolving, months of training reduced to unlinked
-- rows. Nothing errors. Nobody is told.
--
-- WHY THIS IS NOT AN FK CHANGE. SQLite cannot alter a foreign key action, and rebuilding
-- `exercises` means rebuilding a table with an FTS5 external-content index, three junction tables
-- pointing at it and 1652 rows of licensed data. The 12-step rebuild is the textbook answer and it
-- is the wrong one here: it is a large, risky migration to change a behaviour that a trigger can
-- prevent from ever being reached.
--
-- WHAT THIS DOES INSTEAD. A BEFORE DELETE trigger on `users` runs *before* the cascade fires and
-- orphans the exercises rather than letting them be destroyed. The row survives, so every
-- `exercise_id` in every log stays valid and every graph keeps grouping.

-- Orphan, do not publish. `owner_id = NULL` with `status` left ALONE is the whole point: a private
-- exercise stays private and becomes invisible to everyone (the visibility predicate needs
-- `status = 'global'` or a matching owner, and NULL matches nobody). Flipping it to 'global' would
-- publish a departing coach's private library to every user of the product, which is a privacy
-- breach dressed up as a fix.
--
-- The one exception is a client's OWN exercise: if the person being deleted authored it for
-- themselves, nothing of theirs needs preserving and the cascade may have it. That is not
-- expressible here without knowing the role, so it is deliberately not attempted — an orphaned
-- private row costs a few hundred bytes and cannot be read by anyone.
CREATE TRIGGER IF NOT EXISTS trg_user_delete_keeps_exercises
BEFORE DELETE ON users FOR EACH ROW
BEGIN
  UPDATE exercises SET owner_id = NULL, updated_at = unixepoch() WHERE owner_id = OLD.id;
END;

-- The same reasoning one level down. `exercises.deleted_at` is a soft delete and the visibility
-- predicate already respects it, so a coach removing an exercise from their library does not reach
-- history either — that path was always safe. This trigger exists for the HARD delete: nothing in
-- the product issues one today, and the point is that if something ever does, it aborts rather
-- than quietly unlinking somebody's year of training.
CREATE TRIGGER IF NOT EXISTS trg_exercise_hard_delete_guard
BEFORE DELETE ON exercises FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM workout_log_sets WHERE exercise_id = OLD.id)
  OR EXISTS (SELECT 1 FROM workout_log_exercises WHERE exercise_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'this exercise has training history: soft-delete it with deleted_at instead');
END;
