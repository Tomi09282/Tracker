-- 024_rename_eligibility.sql — one definition of "may this profile be renamed yet".
-- Applies on top of user_version 23.
--
-- ═══ THE PROBLEM THIS SOLVES IS THE PROJECT'S MOST COMMON BUG ══════════════════════════════════
--
-- 023 put the rename cooldown in a trigger, which is the right place: a route that forgot it would
-- silently disable the rule, and the route is the thing most likely to be rewritten. But a trigger
-- can only ABORT. An abort reaches the client as an opaque failure, and the coach is told nothing —
-- not that they must wait, and certainly not until when.
--
-- The obvious fix is for the rename route to pre-check the same condition and return a 409 carrying
-- `eligibleAt`. That is also how this codebase's single most common defect gets written: TWO THINGS
-- THAT MUST AGREE, drifting apart. The predicate is four clauses long, it reads a policy row, and
-- the day somebody changes one copy, the other keeps enforcing the old rule. The failure is quiet
-- in the worst direction — the route says "go ahead", the trigger aborts, and the coach gets a 500
-- for an operation the product told them was allowed.
--
-- So the predicate moves into a VIEW, and BOTH the trigger and the route read it. There is one
-- answer to "may this be renamed yet", and when it is wrong it is wrong in both places at once.
--
-- The view is not merely a convenience wrapper: a trigger's WHEN clause may contain a subquery, and
-- a BEFORE UPDATE trigger sees the row as it still stands, so the view — which reads the table —
-- answers about the OLD row, which is exactly the row the cooldown is about.

-- ── 1. The one definition ───────────────────────────────────────────────────────────────────
--
-- `too_soon` is the trigger's question. `eligible_at` is the coach's question, and it exists only
-- so the 409 can say WHEN rather than just NO — a refusal a person cannot plan around is a refusal
-- they will retry blindly until the rate limiter answers instead.
--
-- Both are NULL-safe on purpose:
--   * a profile that was never listed is never too soon — nothing points at its old handle, which
--     is the whole argument 023 was built on
--   * a first rename is always allowed, because `handle_renamed_at` is NULL until one happens
DROP VIEW IF EXISTS coach_handle_rename_eligibility;
CREATE VIEW coach_handle_rename_eligibility AS
SELECT
  p.user_id,
  p.handle,
  p.listed_at,
  p.handle_renamed_at,
  (SELECT value FROM public_policy WHERE key = 'handle_rename_cooldown_s') AS cooldown_s,
  CASE
    WHEN p.listed_at IS NULL THEN 0
    WHEN p.handle_renamed_at IS NULL THEN 0
    WHEN p.handle_renamed_at
         > unixepoch() - (SELECT value FROM public_policy WHERE key = 'handle_rename_cooldown_s')
      THEN 1
    ELSE 0
  END AS too_soon,
  CASE
    WHEN p.listed_at IS NULL OR p.handle_renamed_at IS NULL THEN NULL
    ELSE p.handle_renamed_at + (SELECT value FROM public_policy WHERE key = 'handle_rename_cooldown_s')
  END AS eligible_at
FROM coach_profiles p;

-- ── 2. The trigger now asks the view ────────────────────────────────────────────────────────
--
-- Identical behaviour to 023's version, and that is the point: this migration changes WHERE the
-- rule is written, not what it says. verify-024 exercises the trigger through a real rename to
-- prove the rewrite did not quietly relax it — a rule moved is a rule that has to be re-earned.
DROP TRIGGER IF EXISTS trg_profile_handle_rename_cooldown_upd;
CREATE TRIGGER trg_profile_handle_rename_cooldown_upd
BEFORE UPDATE OF handle ON coach_profiles FOR EACH ROW
WHEN NEW.handle IS NOT OLD.handle
 AND (SELECT too_soon FROM coach_handle_rename_eligibility WHERE user_id = OLD.user_id) = 1
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: handle_rename_too_soon');
END;

PRAGMA user_version = 24;
