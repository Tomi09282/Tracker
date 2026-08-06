-- 018_audit_log_survives_erasure.sql — a live erasure blocker, repaired.
--
-- ═══ THE BUG, WHICH IS SHIPPING TODAY ══════════════════════════════════════════════════════════
--
-- `audit_log.actor_id` is `REFERENCES users(id) ON DELETE SET NULL` (001_init.sql:71), and
-- `audit_log_no_update` (001_init.sql:84) is a BEFORE UPDATE trigger with NO WHEN clause.
--
-- **An FK action is an UPDATE as far as triggers are concerned.** So deleting a user who has ever
-- produced an audit row runs SET NULL, which fires the trigger, which aborts — which aborts the
-- whole DELETE. A person who once changed their password cannot be erased.
--
-- MEASURED, NOT ASSUMED. Nothing in this repo had ever established that SQLite propagates an FK
-- action through a BEFORE UPDATE trigger, so it was probed directly before this file was written:
--
--     insert a user → write one audit row naming them → DELETE FROM users
--     → SQLITE_CONSTRAINT_TRIGGER: audit_log is append-only
--
-- The recovery from that probe is itself the argument for urgency: cleaning up the test user
-- required DROPPING `audit_log_no_delete`, removing the row, and recreating the trigger. **The
-- only way out of this bug is to switch off the guarantee it protects.**
--
-- 010_plans_and_logs.sql:866-870 records this exact finding and carved `workout_pr_events` around
-- it. `audit_log` never got the carve-out. It is latent only because `verify-schema.mjs` deletes a
-- user who happens to have no audit rows — a test that passes because its subject is absent, which
-- is this project's most-repeated defect shape. That test is strengthened in the same commit.
--
-- ═══ THE REPLACEMENT IS STRICTER THAN IT LOOKS ═════════════════════════════════════════════════
--
-- It does not relax append-only; it names the ONE update that erasure means. The single permitted
-- UPDATE is `actor_id` moving FROM a value TO NULL with every other column byte-identical. An
-- actor_id moving to a DIFFERENT user still aborts. Any other column changing still aborts.
-- Re-pointing an audit row at somebody else was never possible and still is not.
--
-- `IS` rather than `=` throughout: `NULL = NULL` is NULL in SQL, so `=` would make every row with
-- a NULL detail or ip look "changed" and abort the erasure this trigger exists to permit.
--
-- Note there is no separate carve-out for `audit_log_no_delete`. A DELETE of an audit row is still
-- absolutely forbidden, which is correct: erasure unlinks the actor, it does not rewrite history.

DROP TRIGGER IF EXISTS audit_log_no_update;

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log FOR EACH ROW
WHEN NOT (
  -- the erasure carve-out: an actor becoming anonymous, and nothing else moving
  OLD.actor_id IS NOT NULL
  AND NEW.actor_id IS NULL
  AND NEW.id          IS OLD.id
  AND NEW.action      IS OLD.action
  AND NEW.target_type IS OLD.target_type
  AND NEW.target_id   IS OLD.target_id
  AND NEW.detail      IS OLD.detail
  AND NEW.request_id  IS OLD.request_id
  AND NEW.ip          IS OLD.ip
  AND NEW.created_at  IS OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

PRAGMA user_version = 18;
