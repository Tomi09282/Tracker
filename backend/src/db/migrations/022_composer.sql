-- 022_composer.sql — the WRITE side of the public marketplace. Applies on top of user_version 21.
--
-- Phase 6 shipped the read surface and nothing else: seven public GETs, a parser, a renderer, three
-- anonymous React routes. A coach could not create a profile or publish a post, and the two posts
-- that exist were inserted by a script through the DB facade. This migration is what the write
-- routes stand on.
--
-- ═══ WHERE THESE CHANGES CAME FROM ════════════════════════════════════════════════════════════
--
-- A thirteen-agent adversarial pass over three independent composer designs: 60 defects, 1 fatal,
-- 18 severe. Every item below cites the finding it answers. The media surface carried roughly 40%
-- of the total defect weight, so the gallery and every media UPDATE were CUT by owner decision —
-- a cover image is the whole feature, and replacing one is DELETE then POST.
--
-- Every factual claim this file depends on was checked against the LIVE schema before a line of it
-- was written — columns, triggers, policy rows, the active guidelines version. Sixteen of seventeen
-- held; the seventeenth was the checker being sloppy, not the schema disagreeing. That step is here
-- because verify-021 failed seven times on invented column names, and each of those failures was
-- cheap only because nothing had been built on top yet.

-- ── 1. Idempotency, in the house form ────────────────────────────────────────────────────────
--
-- A column inside the guard's own uniqueness constraint, the way 010 and 019 already do it — NOT a
-- shared idempotency_keys table, which both of those files explicitly refuse.
--
-- The scope is the OWNER, not the key alone. A globally unique key lets one account probe another's
-- key space and receive their stored result, and it lets a collision between two unrelated coaches
-- silently return the wrong post. Scoping to author_user_id costs one column in the index.
ALTER TABLE coach_posts ADD COLUMN write_uid TEXT
  CHECK (write_uid IS NULL OR (length(write_uid) BETWEEN 8 AND 96
         AND write_uid NOT GLOB '*[^A-Za-z0-9_:-]*'));
CREATE UNIQUE INDEX IF NOT EXISTS coach_posts_write_uid_uidx
  ON coach_posts (author_user_id, write_uid) WHERE write_uid IS NOT NULL;

ALTER TABLE post_media ADD COLUMN write_uid TEXT
  CHECK (write_uid IS NULL OR (length(write_uid) BETWEEN 8 AND 96
         AND write_uid NOT GLOB '*[^A-Za-z0-9_:-]*'));
CREATE UNIQUE INDEX IF NOT EXISTS post_media_write_uid_uidx
  ON post_media (post_id, write_uid) WHERE write_uid IS NOT NULL;

-- ── 2. A replay has to compare INTENT, not just presence ─────────────────────────────────────
--
-- Two uploads under one key are a retry only if they carry the same bytes. Without this the second
-- request is answered with the first one's row whatever the coach actually sent, which turns a
-- network hiccup into "the wrong image is on my post and the API said OK".
ALTER TABLE post_media ADD COLUMN content_sha256 TEXT
  CHECK (content_sha256 IS NULL OR (length(content_sha256) = 64
         AND content_sha256 NOT GLOB '*[^a-f0-9]*'));

-- ── 3. Optimistic concurrency that cannot collide ────────────────────────────────────────────
--
-- unixepoch() is one-second granular. A guard of the form "WHERE updated_at = ?" therefore does
-- nothing at all when both edits land inside the same second — the lost update it exists to prevent
-- is exactly the case where two writes are close together — and it reports a false conflict on a
-- retry that arrives in the next second. A counter has neither failure.
ALTER TABLE coach_posts ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;

-- ── 4. Directory position is written once ────────────────────────────────────────────────────
--
-- Ordering the coach directory by published_at makes unpublish-then-publish a free bump to the top,
-- repeatable as fast as the rate limit allows, and it breaks the keyset cursor for everyone else
-- while it happens. A post's feed position is already write-once; this is the same rule for
-- profiles. Backfilled so existing rows keep the position they already had.
ALTER TABLE coach_profiles ADD COLUMN listed_at INTEGER;
UPDATE coach_profiles SET listed_at = published_at WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_profiles_listed_idx
  ON coach_profiles (listed_at DESC, user_id)
  WHERE published_at IS NOT NULL AND removed_at IS NULL;

-- ── 5. THE BODY RULE, corrected ──────────────────────────────────────────────────────────────
--
-- 021 wrote the co-movement rule as an exclusive-or: refuse the update when exactly one of body_src
-- and body_doc moved. The intent was right and the shape was wrong, in both directions.
--
-- It refuses ORDINARY EDITS. Reflowing a paragraph or changing indentation changes body_src and
-- produces a byte-identical body_doc, so one side moved and the other did not, and the write is
-- aborted. The author has typed something real and the product tells them no.
--
-- And it makes the corpus uneditable on the day the grammar changes. Re-parsing under a new
-- doc_version moves body_doc while body_src stands still — so after a doc_version bump, every
-- existing post is permanently unwritable, including a title-only edit, with no request that
-- succeeds and no escape through delete-and-reinsert.
--
-- What actually matters is one direction: the doc is the half the public reads, and it must never
-- move unless the source it was parsed from moved, or the grammar that parsed it did. The other
-- direction is a false positive. 021 states the principle itself — a rule that blocks an ordinary
-- edit gets deleted — so this is that file's own standard applied to its own trigger.
DROP TRIGGER IF EXISTS trg_post_body_moves_as_one_upd;
CREATE TRIGGER trg_post_doc_needs_a_source_upd
BEFORE UPDATE OF body_src, body_doc, doc_version ON coach_posts FOR EACH ROW
WHEN NEW.body_doc     IS NOT OLD.body_doc
 AND NEW.body_src     IS     OLD.body_src
 AND NEW.doc_version  IS     OLD.doc_version
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: doc_moved_without_source');
END;

-- ── 6. The profile bio had NO rule at all ────────────────────────────────────────────────────
--
-- Measured on the live schema: coach_profiles carries fourteen triggers and not one of them watches
-- the bio. An update that rewrites bio_src alone is accepted and leaves a stale bio_doc — and
-- bio_doc is the half the public reads, so the profile keeps showing the old text while the author
-- is looking at the new one. Same rule as posts, so one handling pattern covers both tables.
CREATE TRIGGER trg_profile_bio_doc_needs_a_source_upd
BEFORE UPDATE OF bio_src, bio_doc, doc_version ON coach_profiles FOR EACH ROW
WHEN NEW.bio_doc      IS NOT OLD.bio_doc
 AND NEW.bio_src      IS     OLD.bio_src
 AND NEW.doc_version  IS     OLD.doc_version
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: doc_moved_without_source');
END;

-- ── 7. post_media identity is frozen ─────────────────────────────────────────────────────────
--
-- Measured: post_media has three triggers and all three are INSERT triggers. An UPDATE is entirely
-- unguarded, and post_id is not frozen — so a single UPDATE can re-point an image row at another
-- coach's post. The routes are ownership-scoped, but that is a property of the code, and the code is
-- the thing most likely to be rewritten. Make it a property of the data.
--
-- With the gallery cut there is no legitimate UPDATE of any of these columns at all, which is the
-- cheapest kind of rule to enforce.
CREATE TRIGGER trg_post_media_identity_frozen_upd
BEFORE UPDATE ON post_media FOR EACH ROW
WHEN NEW.post_id     IS NOT OLD.post_id
  OR NEW.storage_key IS NOT OLD.storage_key
  OR NEW.thumb_key   IS NOT OLD.thumb_key
  OR NEW.created_at  IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'post_media: identity_is_frozen');
END;

-- ── 8. The two keys must differ ──────────────────────────────────────────────────────────────
--
-- storage_key and thumb_key each carry their own UNIQUE index, which says nothing about the pair.
-- The serve route matches "storage_key = ? OR thumb_key = ?", so a row where the two are equal
-- serves the full image wherever a thumbnail was asked for. 128 bits of randomness makes that
-- improbable; a trigger makes it impossible, and costs nothing.
CREATE TRIGGER trg_post_media_keys_distinct_ins
BEFORE INSERT ON post_media FOR EACH ROW
WHEN NEW.storage_key = NEW.thumb_key
BEGIN
  SELECT RAISE(ABORT, 'post_media: keys_must_differ');
END;

-- ── 9. Restore is a publication event, and nothing was watching it ───────────────────────────
--
-- trg_post_publish_standing_upd fires only when published_at goes from NULL to NOT NULL. Restoring
-- a withdrawn post clears deleted_at and never touches published_at, so the standing check does not
-- run: a coach who has not accepted the guidelines now in force can return an entire withdrawn back
-- catalogue to the anonymous surface, and a coach whose profile has since been unpublished can put
-- posts back on a marketplace their profile is no longer part of.
--
-- Account age and the daily quota are deliberately NOT re-checked here. The post was published
-- once, published_at does not move, and re-charging a quota slot for un-hiding something that was
-- already public would make withdrawal a punishment. What is re-checked is standing: who you are,
-- whether your profile is live, and whether you have agreed to the rules as they stand today.
CREATE TRIGGER trg_post_restore_standing_upd
BEFORE UPDATE OF deleted_at ON coach_posts FOR EACH ROW
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
 AND OLD.published_at IS NOT NULL
 AND NOT (
      EXISTS (SELECT 1 FROM users u
               WHERE u.id = OLD.author_user_id
                 AND u.disabled_at IS NULL
                 AND u.role IN ('coach','admin'))
  AND EXISTS (SELECT 1 FROM coach_profiles p
               WHERE p.user_id = OLD.author_user_id
                 AND p.published_at IS NOT NULL
                 AND p.removed_at IS NULL)
  AND EXISTS (SELECT 1 FROM guidelines_acceptances a
                JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
               WHERE a.user_id = OLD.author_user_id))
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: restore_denied');
END;

PRAGMA user_version = 22;
