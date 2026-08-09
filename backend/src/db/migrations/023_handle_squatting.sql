-- 023_handle_squatting.sql — stop one account holding the handle namespace hostage.
-- Applies on top of user_version 22.
--
-- ═══ THE ATTACK, REPRODUCED BEFORE ANY OF THIS WAS WRITTEN ═════════════════════════════════════
--
-- Renaming a profile retires the OLD handle into `retired_handles` with `released_at = now`, and
-- `trg_profile_handle_available_*` then refuses that handle to EVERYONE ELSE for a year while the
-- previous owner keeps an exclusive claim on it.
--
-- Measured on a throwaway database: one account, ONE PROFILE THAT WAS NEVER PUBLISHED, six renames
-- — six desirable handles locked for 365 days, refused to a second account 6/6, and reclaimable by
-- the squatter 6/6. The composer's write limiter allows 60 requests per 15 minutes per account,
-- so the ceiling is thousands of handles a day from a single free registration.
--
-- The owner kept handle rename against the design review's advice, so this is fixed rather than
-- avoided. That decision is recorded in TODO Phase-7; this file is the bill.
--
-- ═══ THE FIX IS TO ASK WHAT THE COOLDOWN IS FOR ════════════════════════════════════════════════
--
-- `retired_handles` exists to stop IMPERSONATION VIA STALE LINKS: somebody bookmarks
-- /m/c/peter-kovacs, the coach renames, a stranger claims the handle and inherits the traffic and
-- the trust that came with it.
--
-- That risk exists only for a handle that was ever PUBLIC. A profile that was never published has
-- no public URL, no inbound links and no readers — retiring its handle protects nobody, and it is
-- precisely the free move the attack is built on. So retirement now keys on whether the profile was
-- ever listed, and an unpublished profile releases its handle immediately.
--
-- To lock a handle you must now PUBLISH under it first, which costs an accepted guidelines version,
-- an account old enough to publish, and a slot in a quota the database enforces. The cheap bulk
-- move is gone and the protection it was hiding behind is intact.

-- ── 1. A rename cooldown, for the profiles the retirement still applies to ───────────────────
--
-- Publishing raises the cost of one lock; it does not stop a determined account from
-- publish-rename-publish-rename. A coach renaming a live profile more than once in a month is
-- doing something other than fixing a name, and the limiter cannot be the control here: it lives
-- in one process's memory, resets on deploy, and a second cluster worker has its own copy.
INSERT OR IGNORE INTO public_policy (key, value, note) VALUES
  ('handle_rename_cooldown_s', 2592000,
   'How long a LISTED profile must wait between handle changes. An unpublished profile is unaffected.');

ALTER TABLE coach_profiles ADD COLUMN handle_renamed_at INTEGER;

-- ── 2. Retirement keys on "was this ever public" ────────────────────────────────────────────
--
-- `listed_at` is written once when a profile is first published and is never cleared, so it is
-- exactly the question being asked: has anybody ever been able to reach this handle.
DROP TRIGGER IF EXISTS trg_profile_handle_retire_upd;
CREATE TRIGGER trg_profile_handle_retire_upd
AFTER UPDATE OF handle ON coach_profiles FOR EACH ROW
WHEN NEW.handle IS NOT OLD.handle AND OLD.listed_at IS NOT NULL
BEGIN
  INSERT OR REPLACE INTO retired_handles (handle, prev_user_id, released_at)
  VALUES (OLD.handle, OLD.user_id, unixepoch());
END;

DROP TRIGGER IF EXISTS trg_profile_handle_retire_del;
CREATE TRIGGER trg_profile_handle_retire_del
AFTER DELETE ON coach_profiles FOR EACH ROW
WHEN OLD.listed_at IS NOT NULL
BEGIN
  INSERT OR REPLACE INTO retired_handles (handle, prev_user_id, released_at)
  VALUES (OLD.handle, OLD.user_id, unixepoch());
END;

-- ── 3. The cooldown itself, enforced where it cannot be forgotten ───────────────────────────
--
-- Only for profiles that have been listed: an unpublished profile can be renamed as often as its
-- author likes, because nothing anywhere points at it. A first rename is always allowed —
-- `handle_renamed_at` is NULL until one happens.
CREATE TRIGGER trg_profile_handle_rename_cooldown_upd
BEFORE UPDATE OF handle ON coach_profiles FOR EACH ROW
WHEN NEW.handle IS NOT OLD.handle
 AND OLD.listed_at IS NOT NULL
 AND OLD.handle_renamed_at IS NOT NULL
 AND OLD.handle_renamed_at > unixepoch() - (SELECT value FROM public_policy WHERE key = 'handle_rename_cooldown_s')
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: handle_rename_too_soon');
END;

-- The stamp is written by the database, not by the caller. A route that forgot it would silently
-- disable the cooldown above, and the route is the thing most likely to be rewritten.
CREATE TRIGGER trg_profile_handle_rename_stamp_upd
AFTER UPDATE OF handle ON coach_profiles FOR EACH ROW
WHEN NEW.handle IS NOT OLD.handle AND NEW.handle_renamed_at IS OLD.handle_renamed_at
BEGIN
  UPDATE coach_profiles SET handle_renamed_at = unixepoch() WHERE user_id = NEW.user_id;
END;

PRAGMA user_version = 23;
