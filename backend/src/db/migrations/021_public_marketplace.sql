-- 021_public_marketplace.sql — F15 Phase 6: coach profiles, public posts, post images, search,
-- private follows, guidelines consent, and a moderation queue with a reader. Applies on top of
-- user_version 19.
--
-- ═══ 020 IS FREE, AND IT WAS NOT WHEN THIS FILE WAS DESIGNED ══════════════════════════════════
--
-- The review that produced this migration read the runner and found a live trap: it gated on
-- `PRAGMA user_version` alone — `if (version <= current) continue` — so once THIS file set the
-- mark to 21, a `020_*.sql` written afterwards would be skipped FOREVER with no error and no log
-- line. Phase 5 had RESERVED 020 for the coach template marketplace, so reserving the number is
-- what armed it. Measured on a throwaway database: 019 and 021 applied, then 020 added, and the
-- second run applied nothing while reporting success.
--
-- Its instruction was to ship a placeholder 020 in the same commit so no gap could exist. THAT IS
-- NOT WHAT WAS DONE, because it treats the instance and leaves the class: the next reservation, or
-- the next migration inserted into a gap, would arm it again.
--
-- Instead the runner now keeps a LEDGER (`schema_migrations`, created as runner infrastructure
-- rather than as a numbered file, because a migration that creates the thing deciding which
-- migrations run has an ordering problem of its own). A file applies when its version is absent
-- from the ledger, whatever its number, and an out-of-order application is reported in
-- `outOfOrder` and logged at warn rather than happening quietly. See `verify:migrations`, which
-- exercises the real `migrate()` rather than a copy of its loop.
--
-- So 020 stays genuinely reserved and this file is simply 021.
--
-- ═══ WHY THIS FILE IS SMALLER THAN THE FEATURE THAT WAS ASKED FOR ══════════════════════════════
--
-- The adversarial review put every fatal finding, and about a third of the severe ones, in ONE
-- place: comments. So comments, replies, reactions and person-level blocking are CUT, exactly as
-- 019 cut the template marketplace when thirteen of twenty-one findings sat in it. Nothing here
-- lets a stranger write on a public page. The consequences are structural, not cosmetic:
--
--   * There is no public identity for a non-coach account, so no public read can fall back to
--     `users.email` — this schema names no user by anything but a coach `handle`.
--   * There is no viewer in the visibility predicate. `src/public/visibility.js` binds ZERO
--     parameters. Anonymous and signed-in callers receive byte-identical bodies, which is what
--     makes `Cache-Control: public` correct rather than a leak waiting for a shared proxy.
--   * There is therefore no `optionalAuth` middleware. The public router never sees `req.user`.
--
-- ═══ THE FOUR RULES THIS FILE OBEYS EVERYWHERE, AND WHY ════════════════════════════════════════
--
-- 1. NO VOCABULARY IN A CHECK. 013 caught it, 017 wrote it down, 019 repeated it, and
--    `exercises.status` is the live example of getting it wrong. Every set of values that can grow
--    is a reference TABLE with a foreign key. Adding a post kind, a report reason, a report
--    status, a city, a currency, a specialty or a mime is an INSERT. Every abuse BUDGET is an
--    integer row in `public_policy`: an UPDATE at 03:00, not a deploy.
--    The CHECKs that remain are only: typeof() guards, `IN (0,1)` flags, GENEROUS storage-safety
--    bounds, and NEGATED GLOBs. The tight product bounds live in zod, where changing one is one line.
--
-- 2. GLOB CHARACTER CLASSES DO NOT REPEAT. `GLOB '[a-z0-9][a-z0-9-]*'` constrains the FIRST TWO
--    CHARACTERS and then `*` matches anything — `'admin' || char(8203)` passes it, and so does
--    `'ab<script>'`. Every format guard here is written NEGATED: `x NOT GLOB '*[^a-z0-9-]*'`,
--    which is the only form that bounds every character. Verified against this repo's sqlite build.
--
-- 3. A BOTH-OR-NEITHER PAIR ON AN ACTOR COLUMN IS A TRIGGER, NEVER A CHECK. `removed_by` is
--    `ON DELETE SET NULL`, and an FK action is an UPDATE as far as constraints are concerned. A
--    `CHECK ((removed_at IS NULL) = (removed_by IS NULL))` therefore ABORTS `DELETE FROM users`
--    for any admin who has ever moderated anything — 018 was written to repair exactly this shape,
--    and a CHECK cannot be carved out afterwards without a twelve-step rebuild. Every pair below
--    is a trigger pair with the erasure carve-out written into the WHEN clause.
--    Pairs on non-actor columns (price/currency) stay CHECKs: nothing sets them NULL behind your back.
--
-- 4. EVERY RAISE(ABORT) MESSAGE CONTAINS A snake_case TOKEN, ON PURPOSE. `src/lib/http.js:104`
--    forwards a trigger's text to the CLIENT unless it looks internal:
--        /\b[a-z]+_[a-z_]+\b/.test(text) || /\b\w+\.\w+\b/.test(text)
--    A friendly sentence like 'this account is blocked' or 'daily comment limit reached' is
--    forwarded VERBATIM and turns every guard into an oracle — one design leaked its whole abuse
--    budget table that way. So messages here are written for the LOG: `coach_posts: publish_denied`.
--    The client gets the generic envelope. `scripts/check-trigger-messages.mjs` enforces it.
--    NOTE ALSO: http.js:124 answers 400 validation_error for every constraint fault. NO TRIGGER
--    HERE CAN PRODUCE A 409. Anything that must answer 409 is a `changes === 0` check in the route.

PRAGMA foreign_keys = ON;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. POLICY — the kill switch and every abuse budget, as data an admin can change at 03:00.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- These are DB facts rather than rate limiters because every limiter in this product is in-memory
-- with no store: it resets on restart and multiplies by worker count the day `cluster.js` lands.
-- A limiter shapes traffic; a trigger bounds damage.
CREATE TABLE IF NOT EXISTS public_policy (
  key   TEXT PRIMARY KEY
        CHECK (key NOT GLOB '*[^a-z0-9_]*' AND length(key) BETWEEN 3 AND 48),
  value INTEGER NOT NULL CHECK (typeof(value) = 'integer' AND value >= 0),
  note  TEXT NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 300 AND length(note) <= 300)
) WITHOUT ROWID;

INSERT OR IGNORE INTO public_policy (key, value, note) VALUES
  ('public_surface_enabled',      1, 'THE KILL SWITCH. 0 empties every public read on the next request. Read as the first term of PUBLIC_POST and PUBLIC_PROFILE.'),
  ('post_publish_daily_max',     10, 'Publishes per coach per rolling 24h. published_at is write-once, so unpublish/republish cannot refresh this.'),
  ('media_per_post_max',          9, 'Images per post: one cover plus eight gallery.'),
  ('media_daily_max',            40, 'Images per coach per rolling 24h. The anti-file-hosting number.'),
  ('report_daily_max',           20, 'Reports per account per rolling 24h. The anti-brigading number; it survives a restart, the limiter does not.'),
  ('min_account_age_s_to_publish', 86400, 'An account may not put anything on the open internet until it is this old.');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. VOCABULARIES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Cities are NOT free text. `city_key` is a public FILTER value that appears in a URL and in an
-- index; free text there means four hundred spellings of Budapest AND a user-controlled string on
-- the query path. It also removes any temptation to fold with SQLite `lower()`, which is ASCII-only
-- and silently fails to match GYŐR against győr. The label is an i18n key on the client (017).
CREATE TABLE IF NOT EXISTS public_cities (
  key          TEXT PRIMARY KEY
               CHECK (key NOT GLOB '*[^a-z0-9-]*' AND length(key) BETWEEN 2 AND 40),
  country_code TEXT NOT NULL CHECK (country_code NOT GLOB '*[^A-Z]*' AND length(country_code) = 2),
  name_native  TEXT NOT NULL CHECK (length(name_native) <= 120 AND length(trim(name_native)) >= 1),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) WITHOUT ROWID;

INSERT OR IGNORE INTO public_cities (key, country_code, name_native, sort_order) VALUES
  ('budapest','HU','Budapest',10), ('debrecen','HU','Debrecen',20), ('szeged','HU','Szeged',30),
  ('miskolc','HU','Miskolc',40),  ('pecs','HU','Pécs',50),         ('gyor','HU','Győr',60),
  ('nyiregyhaza','HU','Nyíregyháza',70), ('kecskemet','HU','Kecskemét',80),
  ('szekesfehervar','HU','Székesfehérvár',90), ('online','HU','Online',999);

-- `minor_units` exists because HUF has ZERO of them. A formatter that assumes 100 minor units per
-- major renders 5000 HUF as "50,00 Ft". 019 could hardcode 100 because a coin is one currency.
CREATE TABLE IF NOT EXISTS public_currencies (
  code        TEXT PRIMARY KEY CHECK (code NOT GLOB '*[^A-Z]*' AND length(code) = 3),
  minor_units INTEGER NOT NULL CHECK (typeof(minor_units) = 'integer' AND minor_units BETWEEN 0 AND 4),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) WITHOUT ROWID;
INSERT OR IGNORE INTO public_currencies (code, minor_units) VALUES
  ('HUF',0), ('EUR',2), ('USD',2), ('GBP',2);

-- Per-kind RULES live on the reference row and a trigger reads them (017's pattern), so
-- "announcements may now carry a date" is an UPDATE rather than a rebuild.
CREATE TABLE IF NOT EXISTS post_kinds (
  key               TEXT PRIMARY KEY
                    CHECK (key NOT GLOB '*[^a-z_]*' AND length(key) BETWEEN 3 AND 24),
  requires_event_at INTEGER NOT NULL DEFAULT 0 CHECK (requires_event_at IN (0,1)),
  allows_capacity   INTEGER NOT NULL DEFAULT 0 CHECK (allows_capacity IN (0,1)),
  allows_price      INTEGER NOT NULL DEFAULT 0 CHECK (allows_price IN (0,1)),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
) WITHOUT ROWID;
INSERT OR IGNORE INTO post_kinds (key, requires_event_at, allows_capacity, allows_price, sort_order) VALUES
  ('program',0,0,1,10), ('event',1,1,1,20), ('announcement',0,0,0,30);

CREATE TABLE IF NOT EXISTS post_media_roles (
  key TEXT PRIMARY KEY CHECK (key NOT GLOB '*[^a-z_]*' AND length(key) BETWEEN 3 AND 24)
) WITHOUT ROWID;
INSERT OR IGNORE INTO post_media_roles (key) VALUES ('cover'), ('gallery');

-- A TABLE, not a CHECK. 013:201 and 017:169 both put a mime allowlist in a CHECK and 017's header
-- called that out as the mistake. Only `image/webp` is ACTIVE, because the only ingest path in this
-- product that RE-ENCODES — and re-encoding is the only thing that strips EXIF/GPS — is
-- `lib/media.js:ingestImage`, whose output is always WebP. Chat attachments and progress photos
-- rename the client's original bytes into the served tree; shipping that to anonymous readers
-- publishes the photographer's coordinates. Admitting video is an INSERT here PLUS a transcode
-- path that does not exist — not an INSERT alone.
CREATE TABLE IF NOT EXISTS post_media_mimes (
  mime   TEXT PRIMARY KEY CHECK (length(mime) BETWEEN 6 AND 64),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
) WITHOUT ROWID;
INSERT OR IGNORE INTO post_media_mimes (mime, active) VALUES
  ('image/webp',1), ('image/avif',0), ('video/mp4',0);

-- Specialties carry their own i18n key. Deliberately NOT a row in `taxonomy_translations`: that
-- table's `kind` is CHECK'd, and reaching a third taxonomy there means dropping and recreating a
-- table three shipped features read. One label column and an i18n key costs nothing and risks nothing.
CREATE TABLE IF NOT EXISTS coach_specialties (
  key        TEXT PRIMARY KEY
             CHECK (key NOT GLOB '*[^a-z_]*' AND length(key) BETWEEN 3 AND 40),
  i18n_key   TEXT NOT NULL CHECK (length(i18n_key) BETWEEN 3 AND 80),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
) WITHOUT ROWID;
INSERT OR IGNORE INTO coach_specialties (key, i18n_key, sort_order) VALUES
  ('strength','public.specialty.strength',10),
  ('hypertrophy','public.specialty.hypertrophy',20),
  ('powerlifting','public.specialty.powerlifting',30),
  ('olympic_lifting','public.specialty.olympic_lifting',40),
  ('endurance','public.specialty.endurance',50),
  ('running','public.specialty.running',60),
  ('mobility','public.specialty.mobility',70),
  ('rehabilitation','public.specialty.rehabilitation',80),
  ('nutrition','public.specialty.nutrition',90),
  ('weight_loss','public.specialty.weight_loss',100),
  ('prenatal','public.specialty.prenatal',110),
  ('senior','public.specialty.senior',120),
  ('youth','public.specialty.youth',130),
  ('calisthenics','public.specialty.calisthenics',140);

-- `reportable = 0` is a moderator-only reason. A user-filed report must not be able to claim the
-- queue's highest severity for itself.
CREATE TABLE IF NOT EXISTS report_reasons (
  key           TEXT PRIMARY KEY
                CHECK (key NOT GLOB '*[^a-z_]*' AND length(key) BETWEEN 3 AND 32),
  reportable    INTEGER NOT NULL DEFAULT 1 CHECK (reportable IN (0,1)),
  severity_rank INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
) WITHOUT ROWID;
INSERT OR IGNORE INTO report_reasons (key, reportable, severity_rank, sort_order) VALUES
  ('illegal',1,100,10), ('sexual',1,90,20), ('violence',1,90,30), ('scam',1,80,40),
  ('impersonation',1,80,50), ('dangerous_advice',1,70,60), ('abuse',1,70,70),
  ('ip_infringement',1,60,80), ('spam',1,40,90), ('other',1,10,100),
  ('legal_order',0,100,110), ('admin_discretion',0,50,120);

-- `is_terminal` is what the resolution triggers read. 013 wrote
-- `CHECK ((status='open') = (resolved_at IS NULL))`, which is a CHECK naming a literal from a
-- vocabulary — the rebuild trap twice over. Adding a non-terminal 'triaged' state here is one INSERT.
CREATE TABLE IF NOT EXISTS report_statuses (
  key         TEXT PRIMARY KEY
              CHECK (key NOT GLOB '*[^a-z_]*' AND length(key) BETWEEN 3 AND 24),
  is_terminal INTEGER NOT NULL CHECK (is_terminal IN (0,1)),
  sort_order  INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
INSERT OR IGNORE INTO report_statuses (key, is_terminal, sort_order) VALUES
  ('open',0,10), ('triaged',0,20), ('upheld',1,30), ('rejected',1,40), ('duplicate',1,50);

-- A handle is a first-segment URL path, so it competes with every route the frontend will add,
-- and impersonating the PLATFORM is a different attack from impersonating a coach.
CREATE TABLE IF NOT EXISTS reserved_handles (
  handle TEXT PRIMARY KEY CHECK (handle NOT GLOB '*[^a-z0-9-]*')
) WITHOUT ROWID;
INSERT OR IGNORE INTO reserved_handles (handle) VALUES
  ('about'),('admin'),('administrator'),('api'),('app'),('assets'),('auth'),('billing'),
  ('coach'),('coaches'),('community'),('config'),('feed'),('follow'),('following'),
  ('guidelines'),('healthz'),('help'),('login'),('logout'),('marketplace'),('me'),('media'),
  ('mod'),('moderator'),('new'),('null'),('official'),('payments'),('post'),('posts'),
  ('public'),('readyz'),('refresh'),('register'),('report'),('reports'),('root'),('search'),
  ('security'),('settings'),('staff'),('static'),('support'),('system'),('team'),('tracker'),
  ('trackerapp'),('undefined'),('user'),('users'),('verified'),('www');

-- A HANDLE THAT IS RELEASED IS NOT FREE. Every share link, printed QR code, Instagram bio link and
-- search result pointing at /c/kissanna-pt keeps resolving after the account is deleted or renamed.
-- Whoever claims the string next inherits that traffic and that reputation. The cooldown is a
-- policy number, so it lives in public_policy rather than in this table's shape.
CREATE TABLE IF NOT EXISTS retired_handles (
  handle       TEXT PRIMARY KEY CHECK (handle NOT GLOB '*[^a-z0-9-]*'),
  -- No FK: the account this belonged to may be gone, which is the main case this table exists for.
  prev_user_id INTEGER,
  released_at  INTEGER NOT NULL DEFAULT (unixepoch())
) WITHOUT ROWID;
INSERT OR IGNORE INTO public_policy (key, value, note) VALUES
  ('handle_cooldown_s', 31536000, 'A released handle cannot be claimed by anyone but its previous owner for this long.');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. COMMUNITY GUIDELINES (T6.4.5) — a WRITE gate on the exposure boundary, never a read gate
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Folding acceptance into the visibility predicate was considered and rejected: publishing v2 would
-- delist every coach who had not yet logged in and take the whole feed dark on a copy edit. So the
-- gate fires at PUBLISH, on both INSERT and UPDATE, and the read predicate never mentions it.
--
-- The document text is an i18n key, not prose in a column: the guidelines must be readable in hu,
-- en and de, and a TEXT column here holds exactly one language.
CREATE TABLE IF NOT EXISTS guidelines_versions (
  version      TEXT PRIMARY KEY
               CHECK (version NOT GLOB '*[^0-9.]*' AND length(version) BETWEEN 3 AND 12),
  i18n_key     TEXT NOT NULL CHECK (length(i18n_key) BETWEEN 3 AND 80),
  published_at INTEGER NOT NULL DEFAULT (unixepoch()),
  -- 1 = the version currently in force. Exactly one, enforced below.
  active       INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1))
) WITHOUT ROWID;

-- EXACTLY ONE ACTIVE VERSION, AS A DATABASE FACT. Index the FLAG, not a nullable timestamp: every
-- row in this partial index has active = 1, so uniqueness on that value permits exactly one row.
-- (A partial index on `retired_at IS NULL` would NOT work — SQLite treats NULLs in a unique index
-- as distinct — which is why the flag exists.)
CREATE UNIQUE INDEX IF NOT EXISTS guidelines_versions_one_active_idx
  ON guidelines_versions (active) WHERE active = 1;

INSERT OR IGNORE INTO guidelines_versions (version, i18n_key, active) VALUES
  ('1.0', 'public.guidelines.v1', 1);

-- A consent record is evidence. Append-only at the database level, for the same reason audit_log is.
CREATE TABLE IF NOT EXISTS guidelines_acceptances (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version     TEXT NOT NULL REFERENCES guidelines_versions(version) ON UPDATE CASCADE,
  accepted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  -- The bridge to the pino request log, same as audit_log. No IP: the request log already has it,
  -- and a second copy is a second thing to erase.
  request_id  TEXT,
  PRIMARY KEY (user_id, version)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS guidelines_acceptances_version_idx
  ON guidelines_acceptances (version, accepted_at);

CREATE TRIGGER IF NOT EXISTS trg_guidelines_acceptance_immutable
BEFORE UPDATE ON guidelines_acceptances FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'guidelines_acceptances: record_is_append_only');
END;
-- No DELETE guard: the users cascade must still work. A deleted account's consent is not evidence
-- anybody is entitled to keep — the opposite call from 018's audit_log carve-out, and deliberate.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. COACH PROFILES (T6.1.1)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- PRIMARY KEY is user_id: one profile per account, no second id to forge, and every join from a
-- post is a primary-key lookup. The PUBLIC key is `handle`. NO PUBLIC READ RETURNS user_id OR
-- users.email — 019's review found the seller's login email rendered to every buyer with no way to
-- scrub it, and a sequential user id in a public response is a census of the whole account table
-- plus a permanent join key from the public namespace into the auth namespace.
CREATE TABLE IF NOT EXISTS coach_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- ASCII-lowercase by construction, so there is no case to fold and no `lower()` (ASCII-only) in
  -- any index or comparison. It also closes homoglyph impersonation outright: Cyrillic 'а' is not
  -- in the class, so `аdmin` cannot be stored at all. First and last characters alphanumeric so a
  -- handle cannot start or end in a hyphen.
  handle TEXT NOT NULL UNIQUE
         CHECK (handle NOT GLOB '*[^a-z0-9-]*'
            AND handle GLOB '[a-z0-9]*'
            AND substr(handle, -1, 1) GLOB '[a-z0-9]'
            AND length(handle) BETWEEN 3 AND 32),

  -- The public name the coach chooses. Separate from anything in `users` so a real-name field
  -- elsewhere can never leak by being reused. Bidi overrides, zero-width characters and combining-
  -- mark runs are stripped by `sanitizeDisplayText` at the edge — that is a CODE control, stated as
  -- one, gated by check-public-text.mjs, and not pretended to be a schema control here.
  -- BOTH bounds: length(trim(x)) alone bounds the TRIMMED length, so 100 KB of spaces plus one
  -- letter passes it. The plain bound is the storage guard.
  display_name TEXT NOT NULL
               CHECK (length(display_name) <= 240 AND length(trim(display_name)) BETWEEN 2 AND 120),
  headline     TEXT CHECK (headline IS NULL OR length(headline) <= 400),

  -- SAME PIPELINE AS A POST BODY, and the same three-column rule. `bio_src` is the author's
  -- markdown and is returned ONLY to its author; `bio_doc` is the closed-vocabulary node tree and
  -- is the only bio a public read returns. Generous storage bounds; zod holds the product ones.
  bio_src     TEXT CHECK (bio_src IS NULL OR length(bio_src) <= 16384),
  bio_doc     TEXT CHECK (bio_doc IS NULL OR (json_valid(bio_doc) AND length(bio_doc) <= 65536)),
  doc_version INTEGER CHECK (doc_version IS NULL OR (typeof(doc_version) = 'integer' AND doc_version > 0)),

  city_key TEXT REFERENCES public_cities(key) ON UPDATE CASCADE,

  -- ADMIN-GRANTED ONLY. The column is absent from every coach-facing zod schema, so `.strict()`
  -- REJECTS it as an unknown field rather than ignoring it, and the trigger below re-reads the
  -- verifier's role from the DATABASE at write time — a role revoked thirty seconds ago must not
  -- still mint a badge.
  verified_at INTEGER,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

  -- NULL = not published. A profile is not public by existing.
  published_at INTEGER,

  -- MODERATOR REMOVAL. A sixth soft-state name on purpose: `deleted_at` already means "the author
  -- took it back" everywhere in this schema, and conflating the two destroys the only evidence
  -- that tells "I changed my mind" from "we took this down". Removing ONE profile row removes that
  -- coach's entire back catalogue from every public read, because PUBLIC_POST requires a live
  -- profile — no sweeper, no fan-out, no route remembering.
  removed_at     INTEGER,
  removed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  removal_reason TEXT CHECK (removal_reason IS NULL OR length(removal_reason) <= 2000),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Structural, and neither column is written by an FK action, so a CHECK is safe here.
  CHECK ((bio_src IS NULL) = (bio_doc IS NULL)),
  CHECK ((bio_doc IS NULL) = (doc_version IS NULL))
);

-- The directory reads. PARTIAL on the predicate's own profile terms so the planner never walks an
-- unpublished or removed row. Ranked verified-then-recent: NOT on a follower count, which is
-- buyable at one free unverified registration per follower.
CREATE INDEX IF NOT EXISTS coach_profiles_public_idx
  ON coach_profiles (published_at DESC, user_id)
  WHERE published_at IS NOT NULL AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS coach_profiles_public_city_idx
  ON coach_profiles (city_key, published_at DESC, user_id)
  WHERE published_at IS NOT NULL AND removed_at IS NULL AND city_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS coach_profiles_verified_idx
  ON coach_profiles (verified_at DESC, user_id) WHERE verified_at IS NOT NULL;

-- SQLite does not index foreign keys for you. Without these, deleting one admin scans this table twice.
CREATE INDEX IF NOT EXISTS coach_profiles_verified_by_fk_idx ON coach_profiles (verified_by) WHERE verified_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_profiles_removed_by_fk_idx  ON coach_profiles (removed_by)  WHERE removed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_profiles_city_fk_idx        ON coach_profiles (city_key)    WHERE city_key IS NOT NULL;

-- ── handle availability ───────────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_profile_handle_available_ins
BEFORE INSERT ON coach_profiles FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM reserved_handles r WHERE r.handle = NEW.handle)
  OR EXISTS (SELECT 1 FROM retired_handles t
              WHERE t.handle = NEW.handle
                AND (t.prev_user_id IS NULL OR t.prev_user_id <> NEW.user_id)
                AND t.released_at > unixepoch() - (SELECT value FROM public_policy WHERE key = 'handle_cooldown_s'))
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: handle_unavailable');
END;

CREATE TRIGGER IF NOT EXISTS trg_profile_handle_available_upd
BEFORE UPDATE OF handle ON coach_profiles FOR EACH ROW
WHEN NEW.handle IS NOT OLD.handle
 AND (EXISTS (SELECT 1 FROM reserved_handles r WHERE r.handle = NEW.handle)
   OR EXISTS (SELECT 1 FROM retired_handles t
               WHERE t.handle = NEW.handle
                 AND (t.prev_user_id IS NULL OR t.prev_user_id <> NEW.user_id)
                 AND t.released_at > unixepoch() - (SELECT value FROM public_policy WHERE key = 'handle_cooldown_s')))
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: handle_unavailable');
END;

-- A released handle is retired automatically, on rename and on delete, so no route can forget.
CREATE TRIGGER IF NOT EXISTS trg_profile_handle_retire_upd
AFTER UPDATE OF handle ON coach_profiles FOR EACH ROW
WHEN NEW.handle IS NOT OLD.handle
BEGIN
  INSERT OR REPLACE INTO retired_handles (handle, prev_user_id, released_at)
  VALUES (OLD.handle, OLD.user_id, unixepoch());
END;

CREATE TRIGGER IF NOT EXISTS trg_profile_handle_retire_del
AFTER DELETE ON coach_profiles FOR EACH ROW
BEGIN
  INSERT OR REPLACE INTO retired_handles (handle, prev_user_id, released_at)
  VALUES (OLD.handle, OLD.user_id, unixepoch());
END;

-- ── the verified badge is an ADMIN fact, proved against the database ──────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_profile_verified_by_admin_ins
BEFORE INSERT ON coach_profiles FOR EACH ROW
WHEN NEW.verified_by IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.verified_by AND u.role = 'admin' AND u.disabled_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: verifier_not_admin');
END;

CREATE TRIGGER IF NOT EXISTS trg_profile_verified_by_admin_upd
BEFORE UPDATE OF verified_at, verified_by ON coach_profiles FOR EACH ROW
WHEN NEW.verified_by IS NOT NULL AND NEW.verified_by IS NOT OLD.verified_by
 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.verified_by AND u.role = 'admin' AND u.disabled_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: verifier_not_admin');
END;

-- ── both-or-neither, AS TRIGGERS, WITH THE 018 ERASURE CARVE-OUT ──────────────────────────────
-- An FK action is an UPDATE. `DELETE FROM users WHERE id = <an admin who has verified anyone>`
-- fires `verified_by → NULL` while `verified_at` stays, which is exactly the shape a naive
-- both-or-neither rule forbids — and a CHECK cannot be carved out without a twelve-step rebuild.
CREATE TRIGGER IF NOT EXISTS trg_profile_verified_pair_ins
BEFORE INSERT ON coach_profiles FOR EACH ROW
WHEN (NEW.verified_at IS NULL) <> (NEW.verified_by IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: verified_pair_incomplete');
END;

CREATE TRIGGER IF NOT EXISTS trg_profile_verified_pair_upd
BEFORE UPDATE OF verified_at, verified_by ON coach_profiles FOR EACH ROW
WHEN (NEW.verified_at IS NULL) <> (NEW.verified_by IS NULL)
 AND NOT (OLD.verified_by IS NOT NULL AND NEW.verified_by IS NULL
          AND NEW.verified_at IS OLD.verified_at)
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: verified_pair_incomplete');
END;

CREATE TRIGGER IF NOT EXISTS trg_profile_removal_pair_ins
BEFORE INSERT ON coach_profiles FOR EACH ROW
WHEN (NEW.removed_at IS NULL) <> (NEW.removed_by IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: removal_pair_incomplete');
END;

CREATE TRIGGER IF NOT EXISTS trg_profile_removal_pair_upd
BEFORE UPDATE OF removed_at, removed_by ON coach_profiles FOR EACH ROW
WHEN (NEW.removed_at IS NULL) <> (NEW.removed_by IS NULL)
 AND NOT (OLD.removed_by IS NOT NULL AND NEW.removed_by IS NULL
          AND NEW.removed_at IS OLD.removed_at AND NEW.removal_reason IS OLD.removal_reason)
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: removal_pair_incomplete');
END;

CREATE TRIGGER IF NOT EXISTS trg_profile_removed_by_admin_upd
BEFORE UPDATE OF removed_at, removed_by ON coach_profiles FOR EACH ROW
WHEN NEW.removed_by IS NOT NULL AND NEW.removed_by IS NOT OLD.removed_by
 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.removed_by AND u.role = 'admin' AND u.disabled_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: remover_not_admin');
END;

-- Moderation is not a black box: a removal names a reason. A TRIGGER, because "removals are
-- reasoned" is a policy and policies get relaxed — DROP TRIGGER is legal, ALTER CHECK is not.
CREATE TRIGGER IF NOT EXISTS trg_profile_removal_reasoned_upd
BEFORE UPDATE OF removed_at ON coach_profiles FOR EACH ROW
WHEN NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL
 AND (NEW.removal_reason IS NULL OR length(trim(NEW.removal_reason)) = 0)
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: removal_needs_reason');
END;

-- ── PUBLISHING A PROFILE REQUIRES STANDING. BOTH TWINS, and the INSERT twin is the point ──────
-- One reviewed design shipped only the UPDATE half while its own write route was an UPSERT, so a
-- first-call INSERT set published_at with no gate at all: a zero-hour account with no consent
-- record became a public, indexable profile. A gate that fires on one of two write shapes is a
-- gate with a door beside it.
CREATE TRIGGER IF NOT EXISTS trg_profile_publish_standing_ins
BEFORE INSERT ON coach_profiles FOR EACH ROW
WHEN NEW.published_at IS NOT NULL
 AND NOT (
   EXISTS (SELECT 1 FROM users u
            WHERE u.id = NEW.user_id AND u.disabled_at IS NULL AND u.role IN ('coach','admin')
              AND u.created_at <= unixepoch() - (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish'))
   AND EXISTS (SELECT 1 FROM guidelines_acceptances a
                 JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
                WHERE a.user_id = NEW.user_id))
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: publish_denied');
END;

CREATE TRIGGER IF NOT EXISTS trg_profile_publish_standing_upd
BEFORE UPDATE OF published_at ON coach_profiles FOR EACH ROW
WHEN NEW.published_at IS NOT NULL AND OLD.published_at IS NULL
 AND NOT (
   EXISTS (SELECT 1 FROM users u
            WHERE u.id = NEW.user_id AND u.disabled_at IS NULL AND u.role IN ('coach','admin')
              AND u.created_at <= unixepoch() - (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish'))
   AND EXISTS (SELECT 1 FROM guidelines_acceptances a
                 JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
                WHERE a.user_id = NEW.user_id))
BEGIN
  SELECT RAISE(ABORT, 'coach_profiles: publish_denied');
END;

-- Specialties: a junction table (001's convention), never a JSON list of relations.
CREATE TABLE IF NOT EXISTS coach_profile_specialties (
  user_id      INTEGER NOT NULL REFERENCES coach_profiles(user_id) ON DELETE CASCADE,
  specialty_key TEXT NOT NULL REFERENCES coach_specialties(key) ON UPDATE CASCADE,
  PRIMARY KEY (user_id, specialty_key)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS coach_profile_specialties_key_idx
  ON coach_profile_specialties (specialty_key, user_id);

-- At most six, so one profile cannot claim every specialty and dominate every filter. SQLite has
-- one writer, so this count is exact under concurrency.
CREATE TRIGGER IF NOT EXISTS trg_profile_specialty_cap_ins
BEFORE INSERT ON coach_profile_specialties FOR EACH ROW
WHEN (SELECT COUNT(*) FROM coach_profile_specialties s WHERE s.user_id = NEW.user_id) >= 6
BEGIN
  SELECT RAISE(ABORT, 'coach_profile_specialties: specialty_cap_reached');
END;

CREATE TRIGGER IF NOT EXISTS trg_profile_specialty_active_ins
BEFORE INSERT ON coach_profile_specialties FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM coach_specialties s WHERE s.key = NEW.specialty_key AND s.active = 1)
BEGIN
  SELECT RAISE(ABORT, 'coach_profile_specialties: specialty_not_active');
END;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. COACH POSTS (T6.1.2, T6.1.7)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- NO HTML IS STORED, TRANSPORTED OR RENDERED. `body_src` is the author's markdown source and is
-- returned ONLY to its author, on the edit form. `body_doc` is a JSON tree over a closed 11-kind
-- vocabulary produced by `src/public/markdown.js`, and it is the only body a public DETAIL read
-- returns. `body_excerpt` is plain text the FEED returns, so a page of 24 cards is not 24 full
-- documents — one design's node tree expanded its source ~12x with no bound on the projection,
-- which is a 64 KB write turned into a multi-megabyte anonymous read.
--
-- All three body columns are produced by ONE parse and written by ONE statement. `doc_version` is
-- indexed so a grammar change can find every stale doc without a table scan and a reparse is
-- auditable rather than silent.
--
-- THERE IS NO `body_folded`. FTS5 indexes `title` and `body_src` directly with
-- `unicode61 remove_diacritics 2`, which folds case and diacritics at tokenise time, and the query
-- goes through the EXISTING `lib/normalize.js:toFtsQuery` (which folds via `normalizeText`). A
-- third stored copy of the same prose is a third thing that can drift — and one design's
-- `body_folded = normalizeText(title || ' ' || body_src)` made a title-only edit either impossible
-- or silently desynchronising, because the co-write trigger and the title were fighting.
CREATE TABLE IF NOT EXISTS coach_posts (
  id INTEGER PRIMARY KEY,

  -- THE PUBLIC NAME: 9 random bytes as base64url, minted server-side. `id` never leaves the
  -- server. A sequential id in a public URL is a free census of how much this product has ever
  -- published (drafts included, via any write that accepts an id), a crawl target, and a probe
  -- oracle for the report endpoint. 72 bits is not enumerable.
  public_id TEXT NOT NULL UNIQUE
            CHECK (public_id NOT GLOB '*[^A-Za-z0-9_-]*' AND length(public_id) = 12),

  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind_key       TEXT NOT NULL REFERENCES post_kinds(key) ON UPDATE CASCADE,

  -- Both bounds again: trim() bounds the trimmed length only.
  title TEXT NOT NULL CHECK (length(title) <= 400 AND length(trim(title)) BETWEEN 3 AND 400),

  -- STORAGE-SAFETY bounds, generous on purpose. The product bounds (title 140, body 20 000) are
  -- zod's job, because "the post limit went up" must be one line and not a rebuild of the largest
  -- public table in the product. These CHECKs should never fire; the parser refuses first, with a
  -- message the coach can act on.
  body_src     TEXT NOT NULL CHECK (length(body_src) BETWEEN 1 AND 65536),
  body_doc     TEXT NOT NULL CHECK (json_valid(body_doc) AND length(body_doc) <= 262144),
  body_excerpt TEXT NOT NULL CHECK (length(body_excerpt) <= 1024),
  doc_version  INTEGER NOT NULL CHECK (typeof(doc_version) = 'integer' AND doc_version > 0),

  city_key TEXT REFERENCES public_cities(key) ON UPDATE CASCADE,

  -- BOUNDED, and the bound is not decoration. Unbounded, `event_at = 0` pins a post to the top of
  -- the ascending "upcoming" feed forever and no amount of legitimate posting displaces it; the
  -- mirror (year 9999, or a TEXT value in an untyped column, which sorts after every integer)
  -- pins it to the bottom and breaks every later range predicate. Year 2000 to 2100.
  event_at INTEGER CHECK (event_at IS NULL
             OR (typeof(event_at) = 'integer' AND event_at BETWEEN 946684800 AND 4102444800)),
  -- An IANA name. A wall-clock time with no zone is a different moment for every reader (010).
  event_tz TEXT CHECK (event_tz IS NULL
             OR (length(event_tz) BETWEEN 3 AND 64 AND event_tz NOT GLOB '*[^A-Za-z0-9/_+-]*')),
  capacity INTEGER CHECK (capacity IS NULL
             OR (typeof(capacity) = 'integer' AND capacity BETWEEN 1 AND 100000)),

  -- PRICE IS DISPLAY ONLY IN THIS PHASE (T6.3.3): no purchase route, no ledger reference, no
  -- entitlement. typeof() and the bound are enforced anyway, because SQLite stores 1.5 and '10' in
  -- a bare INTEGER column without complaint, and 2^63-1 loses precision in JSON.parse before the
  -- buyer ever sees it. The day this becomes money it must not already be full of floats.
  price_minor    INTEGER CHECK (price_minor IS NULL
                   OR (typeof(price_minor) = 'integer' AND price_minor BETWEEN 0 AND 100000000)),
  price_currency TEXT REFERENCES public_currencies(code) ON UPDATE CASCADE,

  -- WRITE-ONCE. NULL = draft; a future value = scheduled, and the predicate compares against
  -- unixepoch() so a scheduled post cannot be read early. It can never be cleared or moved:
  -- unpublish/republish is otherwise an unlimited feed-bump primitive that also walks straight
  -- past any publish quota. Taking a post down is `deleted_at`, which leaves the row for the
  -- reports and the history to hang off.
  published_at INTEGER CHECK (published_at IS NULL OR typeof(published_at) = 'integer'),

  deleted_at INTEGER,                                     -- the author withdrew it
  removed_at INTEGER,                                     -- a moderator took it down
  removed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  removal_reason TEXT CHECK (removal_reason IS NULL OR length(removal_reason) <= 2000),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  -- Written by the route. 003's self-updating AFTER UPDATE trigger works only because
  -- recursive_triggers is off, and making a high-write public table depend on a global pragma is a
  -- dependency nobody will remember when the pragma is next reviewed.
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Structural, and no FK action writes either side, so a CHECK is safe.
  CHECK ((price_minor IS NULL) = (price_currency IS NULL))
);

-- ── FEED INDEXES. Every one PARTIAL on exactly the predicate's own post terms, so the planner
--    never walks a draft, a withdrawal or a removal. The cursor is (published_at, id) descending,
--    which is why id is in every key: published_at alone is not unique, and a keyset cursor on a
--    non-unique key either skips rows or repeats them.
CREATE INDEX IF NOT EXISTS coach_posts_feed_idx
  ON coach_posts (published_at DESC, id DESC)
  WHERE published_at IS NOT NULL AND deleted_at IS NULL AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS coach_posts_feed_city_idx
  ON coach_posts (city_key, published_at DESC, id DESC)
  WHERE city_key IS NOT NULL AND published_at IS NOT NULL AND deleted_at IS NULL AND removed_at IS NULL;

-- Serves the coach's public grid and the following feed's per-author descent.
CREATE INDEX IF NOT EXISTS coach_posts_feed_author_idx
  ON coach_posts (author_user_id, published_at DESC, id DESC)
  WHERE published_at IS NOT NULL AND deleted_at IS NULL AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS coach_posts_feed_kind_idx
  ON coach_posts (kind_key, published_at DESC, id DESC)
  WHERE published_at IS NOT NULL AND deleted_at IS NULL AND removed_at IS NULL;

-- The upcoming-events sort. NOTE: `event_at >= unixepoch()` CANNOT go in this partial index —
-- unixepoch() is non-deterministic and SQLite rejects it — so it lives in the QUERY, and it is not
-- optional: without it a past-dated event sorts first forever.
CREATE INDEX IF NOT EXISTS coach_posts_feed_event_idx
  ON coach_posts (event_at ASC, id DESC)
  WHERE event_at IS NOT NULL AND published_at IS NOT NULL AND deleted_at IS NULL AND removed_at IS NULL;

-- The author's own management list, which DOES include drafts and withdrawals — deliberately not partial.
CREATE INDEX IF NOT EXISTS coach_posts_author_manage_idx
  ON coach_posts (author_user_id, created_at DESC, id DESC);

-- The publish quota counts withdrawn and removed posts too, so it needs a NON-partial index.
CREATE INDEX IF NOT EXISTS coach_posts_author_published_idx
  ON coach_posts (author_user_id, published_at);

-- Finds every doc a parser change made stale, without a table scan.
CREATE INDEX IF NOT EXISTS coach_posts_doc_version_idx ON coach_posts (doc_version);

CREATE INDEX IF NOT EXISTS coach_posts_kind_fk_idx     ON coach_posts (kind_key);
CREATE INDEX IF NOT EXISTS coach_posts_city_fk_idx     ON coach_posts (city_key) WHERE city_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_posts_currency_fk_idx ON coach_posts (price_currency) WHERE price_currency IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_posts_removed_by_fk_idx ON coach_posts (removed_by) WHERE removed_by IS NOT NULL;

-- ── identity is not editable ──────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_post_identity_frozen_upd
BEFORE UPDATE ON coach_posts FOR EACH ROW
WHEN NEW.author_user_id IS NOT OLD.author_user_id
  OR NEW.public_id      IS NOT OLD.public_id
  OR NEW.created_at     IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: identity_is_frozen');
END;

-- published_at is write-once. This is what makes the daily quota unbypassable and removes the
-- unpublish/republish feed-bump entirely.
CREATE TRIGGER IF NOT EXISTS trg_post_published_at_write_once_upd
BEFORE UPDATE OF published_at ON coach_posts FOR EACH ROW
WHEN OLD.published_at IS NOT NULL AND NEW.published_at IS NOT OLD.published_at
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: published_at_is_write_once');
END;

-- ── the body moves as one ─────────────────────────────────────────────────────────────────────
-- Rewriting the source without rewriting the tree leaves the feed rendering the old text while the
-- editor shows the new — and the tree is the half that reaches the screen, so the drift would be
-- silently in the attacker's favour. Note what this does NOT forbid: a title-only edit, and a
-- reparse whose excerpt happens to be unchanged. A rule that blocks an ordinary edit gets deleted.
CREATE TRIGGER IF NOT EXISTS trg_post_body_moves_as_one_upd
BEFORE UPDATE OF body_src, body_doc ON coach_posts FOR EACH ROW
WHEN (NEW.body_src IS NOT OLD.body_src) <> (NEW.body_doc IS NOT OLD.body_doc)
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: body_columns_must_move_together');
END;

-- The excerpt is derived from the tree and may only move when the tree or the grammar does.
CREATE TRIGGER IF NOT EXISTS trg_post_excerpt_is_derived_upd
BEFORE UPDATE OF body_excerpt ON coach_posts FOR EACH ROW
WHEN NEW.body_excerpt IS NOT OLD.body_excerpt
 AND NEW.body_doc IS OLD.body_doc AND NEW.doc_version IS OLD.doc_version
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: excerpt_is_derived');
END;

-- ── per-kind rules, read from the reference row so they are editable ──────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_post_kind_shape_ins
BEFORE INSERT ON coach_posts FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM post_kinds k WHERE k.key = NEW.kind_key AND k.active = 1)
  OR EXISTS (SELECT 1 FROM post_kinds k WHERE k.key = NEW.kind_key AND (
        (k.requires_event_at = 1 AND NEW.event_at IS NULL)
     OR (k.allows_capacity   = 0 AND NEW.capacity IS NOT NULL)
     OR (k.allows_price      = 0 AND NEW.price_minor IS NOT NULL)))
  OR (NEW.event_at IS NOT NULL AND NEW.event_tz IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: kind_shape_invalid');
END;

CREATE TRIGGER IF NOT EXISTS trg_post_kind_shape_upd
BEFORE UPDATE OF kind_key, event_at, event_tz, capacity, price_minor ON coach_posts FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM post_kinds k WHERE k.key = NEW.kind_key AND (
        (k.requires_event_at = 1 AND NEW.event_at IS NULL)
     OR (k.allows_capacity   = 0 AND NEW.capacity IS NOT NULL)
     OR (k.allows_price      = 0 AND NEW.price_minor IS NOT NULL)))
  OR (NEW.event_at IS NOT NULL AND NEW.event_tz IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: kind_shape_invalid');
END;

-- ── PUBLISHING A POST: the same standing as a profile, PLUS a live public profile. BOTH TWINS. ─
-- 019's review found "a demoted or banned coach kept selling and kept being paid" among the
-- thirteen findings that deleted that feature. This is the WRITE-side answer; the read predicate
-- carries the same four facts and takes effect on the very next request with no revocation sweep.
CREATE TRIGGER IF NOT EXISTS trg_post_publish_standing_ins
BEFORE INSERT ON coach_posts FOR EACH ROW
WHEN NEW.published_at IS NOT NULL
 AND NOT (
   EXISTS (SELECT 1 FROM users u
            WHERE u.id = NEW.author_user_id AND u.disabled_at IS NULL AND u.role IN ('coach','admin')
              AND u.created_at <= unixepoch() - (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish'))
   AND EXISTS (SELECT 1 FROM coach_profiles p
                WHERE p.user_id = NEW.author_user_id AND p.published_at IS NOT NULL AND p.removed_at IS NULL)
   AND EXISTS (SELECT 1 FROM guidelines_acceptances a
                 JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
                WHERE a.user_id = NEW.author_user_id))
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: publish_denied');
END;

CREATE TRIGGER IF NOT EXISTS trg_post_publish_standing_upd
BEFORE UPDATE OF published_at ON coach_posts FOR EACH ROW
WHEN NEW.published_at IS NOT NULL AND OLD.published_at IS NULL
 AND NOT (
   EXISTS (SELECT 1 FROM users u
            WHERE u.id = NEW.author_user_id AND u.disabled_at IS NULL AND u.role IN ('coach','admin')
              AND u.created_at <= unixepoch() - (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish'))
   AND EXISTS (SELECT 1 FROM coach_profiles p
                WHERE p.user_id = NEW.author_user_id AND p.published_at IS NOT NULL AND p.removed_at IS NULL)
   AND EXISTS (SELECT 1 FROM guidelines_acceptances a
                 JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
                WHERE a.user_id = NEW.author_user_id))
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: publish_denied');
END;

-- ── the anti-spam number, BOTH TWINS, counted over every post ever published by this author ───
CREATE TRIGGER IF NOT EXISTS trg_post_publish_quota_ins
BEFORE INSERT ON coach_posts FOR EACH ROW
WHEN NEW.published_at IS NOT NULL
 AND (SELECT COUNT(*) FROM coach_posts q
       WHERE q.author_user_id = NEW.author_user_id
         AND q.published_at IS NOT NULL
         AND q.published_at > unixepoch() - 86400)
     >= (SELECT value FROM public_policy WHERE key = 'post_publish_daily_max')
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: publish_quota_reached');
END;

CREATE TRIGGER IF NOT EXISTS trg_post_publish_quota_upd
BEFORE UPDATE OF published_at ON coach_posts FOR EACH ROW
WHEN NEW.published_at IS NOT NULL AND OLD.published_at IS NULL
 AND (SELECT COUNT(*) FROM coach_posts q
       WHERE q.author_user_id = NEW.author_user_id
         AND q.published_at IS NOT NULL
         AND q.published_at > unixepoch() - 86400)
     >= (SELECT value FROM public_policy WHERE key = 'post_publish_daily_max')
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: publish_quota_reached');
END;

-- ── removal ───────────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_post_removal_pair_ins
BEFORE INSERT ON coach_posts FOR EACH ROW
WHEN (NEW.removed_at IS NULL) <> (NEW.removed_by IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: removal_pair_incomplete');
END;

CREATE TRIGGER IF NOT EXISTS trg_post_removal_pair_upd
BEFORE UPDATE OF removed_at, removed_by ON coach_posts FOR EACH ROW
WHEN (NEW.removed_at IS NULL) <> (NEW.removed_by IS NULL)
 AND NOT (OLD.removed_by IS NOT NULL AND NEW.removed_by IS NULL
          AND NEW.removed_at IS OLD.removed_at AND NEW.removal_reason IS OLD.removal_reason)
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: removal_pair_incomplete');
END;

CREATE TRIGGER IF NOT EXISTS trg_post_removed_by_admin_upd
BEFORE UPDATE OF removed_at, removed_by ON coach_posts FOR EACH ROW
WHEN NEW.removed_by IS NOT NULL AND NEW.removed_by IS NOT OLD.removed_by
 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.removed_by AND u.role = 'admin' AND u.disabled_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: remover_not_admin');
END;

CREATE TRIGGER IF NOT EXISTS trg_post_removal_reasoned_upd
BEFORE UPDATE OF removed_at ON coach_posts FOR EACH ROW
WHEN NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL
 AND (NEW.removal_reason IS NULL OR length(trim(NEW.removal_reason)) = 0)
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: removal_needs_reason');
END;

-- A REMOVED POST IS FROZEN. Without this, an author edits the offending text into something
-- innocuous at 03:05, asks for a lift at 10:00, and the moderator reviews content the subject
-- rewrote after the decision. The report's snapshot is the only other copy, and a removal taken on
-- a legal order has no report and therefore no snapshot.
CREATE TRIGGER IF NOT EXISTS trg_post_frozen_while_removed_upd
BEFORE UPDATE OF title, body_src, body_doc, body_excerpt, city_key,
                 event_at, event_tz, capacity, price_minor, price_currency, kind_key
ON coach_posts FOR EACH ROW
WHEN OLD.removed_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'coach_posts: removed_row_is_frozen');
END;

-- ── FTS5, external content over the base table ────────────────────────────────────────────────
-- THE INDEX HOLDS DRAFTS AND REMOVED POSTS, deliberately: the search route ANDs the shared
-- predicate onto the MATCH, so visibility is decided in exactly one place. A visibility-filtered
-- FTS index would be a second copy of the predicate that no trigger could keep honest.
CREATE VIRTUAL TABLE IF NOT EXISTS coach_posts_fts USING fts5(
  title, body_src, city_key,
  content='coach_posts', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- Scoped to the indexed columns: an unqualified AFTER UPDATE reindexes the row on every
-- `updated_at` touch, every publish and every removal, for nothing.
CREATE TRIGGER IF NOT EXISTS trg_coach_posts_fts_ins
AFTER INSERT ON coach_posts BEGIN
  INSERT INTO coach_posts_fts (rowid, title, body_src, city_key)
  VALUES (NEW.id, NEW.title, NEW.body_src, NEW.city_key);
END;

CREATE TRIGGER IF NOT EXISTS trg_coach_posts_fts_del
AFTER DELETE ON coach_posts BEGIN
  INSERT INTO coach_posts_fts (coach_posts_fts, rowid, title, body_src, city_key)
  VALUES ('delete', OLD.id, OLD.title, OLD.body_src, OLD.city_key);
END;

CREATE TRIGGER IF NOT EXISTS trg_coach_posts_fts_upd
AFTER UPDATE OF title, body_src, city_key ON coach_posts BEGIN
  INSERT INTO coach_posts_fts (coach_posts_fts, rowid, title, body_src, city_key)
  VALUES ('delete', OLD.id, OLD.title, OLD.body_src, OLD.city_key);
  INSERT INTO coach_posts_fts (rowid, title, body_src, city_key)
  VALUES (NEW.id, NEW.title, NEW.body_src, NEW.city_key);
END;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. POST MEDIA (T6.1.3) — images only, through the ONE ingest path that re-encodes
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- TWO KEYS PER IMAGE: a 1600px display and a 480px card. `ingestImage` gains a variants option.
-- Serving full-resolution originals to every anonymous request is a bandwidth bill with no ceiling
-- and no account attached to it.
--
-- THE KEYS ARE PREFIXED `pub_` AND LIVE IN `MEDIA_DIR/public/`. Today a single MEDIA_DIR holds
-- exercise media, chat attachments and progress photos, and `resolveStoredPath` accepts two shapes
-- into it — so any public route whose key regex overlaps those shapes is one reordered statement
-- away from serving a client's progress photo to the open internet. Disjoint namespaces make that
-- unreachable rather than guarded: `resolveStoredPath(key, 'public')` matches only `pub_` and joins
-- only the public subtree.
CREATE TABLE IF NOT EXISTS post_media (
  id       INTEGER PRIMARY KEY,
  post_id  INTEGER NOT NULL REFERENCES coach_posts(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL REFERENCES post_media_roles(key) ON UPDATE CASCADE,

  storage_key TEXT NOT NULL UNIQUE
              CHECK (storage_key GLOB 'pub_*' AND storage_key GLOB '*.webp'
                 AND storage_key NOT GLOB '*[^a-z0-9_.]*' AND length(storage_key) = 41),
  thumb_key   TEXT NOT NULL UNIQUE
              CHECK (thumb_key GLOB 'pub_*' AND thumb_key GLOB '*.webp'
                 AND thumb_key NOT GLOB '*[^a-z0-9_.]*' AND length(thumb_key) = 41),

  -- What the SERVER produced after re-encoding, never what the client claimed. A REFERENCE TABLE
  -- rather than a CHECK, because AVIF is a plausible second output. The serving route additionally
  -- sends a Content-Type from a frozen server-side map rather than from this row, so a future
  -- second writer cannot turn a cached, unauthenticated, same-origin URL into an HTML document —
  -- `nosniff` prevents sniffing AWAY from a declared type, not honouring a declared text/html.
  mime TEXT NOT NULL REFERENCES post_media_mimes(mime) ON UPDATE CASCADE,

  width  INTEGER NOT NULL CHECK (typeof(width)  = 'integer' AND width  BETWEEN 1 AND 20000),
  height INTEGER NOT NULL CHECK (typeof(height) = 'integer' AND height BETWEEN 1 AND 20000),
  bytes  INTEGER NOT NULL CHECK (typeof(bytes)  = 'integer' AND bytes  BETWEEN 1 AND 8388608),

  -- Author-written alt text: it lands in a JSX attribute, which React escapes, and it goes through
  -- the same sanitiser and the same XSS fixture list as every other public text field.
  alt TEXT CHECK (alt IS NULL OR (length(alt) <= 400 AND length(trim(alt)) >= 1)),

  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (typeof(sort_order) = 'integer' AND sort_order BETWEEN 0 AND 8),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS post_media_post_idx
  ON post_media (post_id, role_key, sort_order, id) WHERE deleted_at IS NULL;

-- EXACTLY ONE LIVE COVER PER POST, as an index rather than a trigger: it is a uniqueness fact, and
-- the index also serves the feed's cover lookup.
CREATE UNIQUE INDEX IF NOT EXISTS post_media_one_cover_idx
  ON post_media (post_id) WHERE role_key = 'cover' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS post_media_role_fk_idx ON post_media (role_key);
CREATE INDEX IF NOT EXISTS post_media_mime_fk_idx ON post_media (mime);
CREATE INDEX IF NOT EXISTS post_media_created_idx ON post_media (created_at DESC, id DESC);

CREATE TRIGGER IF NOT EXISTS trg_post_media_mime_active_ins
BEFORE INSERT ON post_media FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM post_media_mimes m WHERE m.mime = NEW.mime AND m.active = 1)
BEGIN
  SELECT RAISE(ABORT, 'post_media: mime_not_accepted');
END;

CREATE TRIGGER IF NOT EXISTS trg_post_media_per_post_cap_ins
BEFORE INSERT ON post_media FOR EACH ROW
WHEN (SELECT COUNT(*) FROM post_media m WHERE m.post_id = NEW.post_id AND m.deleted_at IS NULL)
     >= (SELECT value FROM public_policy WHERE key = 'media_per_post_max')
BEGIN
  SELECT RAISE(ABORT, 'post_media: per_post_cap_reached');
END;

-- The anti-file-hosting number. A DB fact, so it holds whether or not the in-memory limiter above
-- it survived a restart or a second cluster worker.
CREATE TRIGGER IF NOT EXISTS trg_post_media_daily_cap_ins
BEFORE INSERT ON post_media FOR EACH ROW
WHEN (SELECT COUNT(*)
        FROM post_media m JOIN coach_posts p ON p.id = m.post_id
       WHERE p.author_user_id = (SELECT author_user_id FROM coach_posts WHERE id = NEW.post_id)
         AND m.created_at > unixepoch() - 86400)
     >= (SELECT value FROM public_policy WHERE key = 'media_daily_max')
BEGIN
  SELECT RAISE(ABORT, 'post_media: daily_cap_reached');
END;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 7. FOLLOWS (T6.1.6) — PRIVATE. No public count, no ranking influence, no stored aggregate.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- A public follower count is buyable at one free unverified registration per follower, and a
-- truthfulness trigger only guarantees the purchased number is arithmetically honest, which is
-- what makes it worth buying. So the count is never public and the directory ranks on
-- verified-then-recency. There is no counter column here at all, and therefore no counter to drift.
CREATE TABLE IF NOT EXISTS coach_follows (
  follower_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_user_id    INTEGER NOT NULL REFERENCES coach_profiles(user_id) ON DELETE CASCADE,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (follower_user_id, coach_user_id)
) WITHOUT ROWID;

-- The FK child index the parent delete needs.
CREATE INDEX IF NOT EXISTS coach_follows_coach_idx ON coach_follows (coach_user_id, follower_user_id);

CREATE TRIGGER IF NOT EXISTS trg_follow_no_self_ins
BEFORE INSERT ON coach_follows FOR EACH ROW
WHEN NEW.follower_user_id = NEW.coach_user_id
BEGIN
  SELECT RAISE(ABORT, 'coach_follows: self_follow_refused');
END;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 8. REPORTS (T6.4.1) — and this table SHIPS WITH ITS READER
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `message_reports` (013) shipped a complete moderation vocabulary that NOTHING EVER READ: one
-- INSERT site, zero SELECTs, `status`/`resolved_at`/`resolved_by` dead since the day they were
-- written, and `body_snapshot` keeping a permanent copy of somebody else's message because the
-- nulling step its own comment promised had no code. 013 predicted it in a comment. That table is
-- NOT rebuilt here — a twelve-step rebuild of live rows holding other people's text buys no
-- safety — it simply keeps its history, and the admin queue reads both.
--
-- TWO REAL FOREIGN KEYS, NOT A POLYMORPHIC (kind, id) POINTER. With two subject types the
-- polymorphic column buys nothing and costs an existence trigger, a dangling-row class, and a
-- rowid-recycling hazard (a cascade-deleted post frees its rowid, and the next post inherits any
-- report aimed at the old one). The "exactly one subject" rule is a TRIGGER, not a CHECK, so
-- adding `subject_comment_id` later is ALTER TABLE ADD COLUMN plus DROP/CREATE TRIGGER — both legal.
--
-- A REPORT HIDES NOTHING, at one report or at fifty. Auto-hiding on report count is the weapon a
-- coordinated group uses to delete a rival. Reports order a human queue; only a moderator's
-- removal takes anything off the internet.
CREATE TABLE IF NOT EXISTS content_reports (
  id INTEGER PRIMARY KEY,

  subject_post_id    INTEGER REFERENCES coach_posts(id) ON DELETE CASCADE,
  subject_profile_id INTEGER REFERENCES coach_profiles(user_id) ON DELETE CASCADE,

  -- Copied by the route from the SERVER's own row inside the same INSERT ... SELECT, never sent by
  -- the client. It makes "you cannot report yourself" a one-column test instead of a per-type join.
  subject_author_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- NULLABLE with an insert-time trigger, NOT `NOT NULL`. A brigade must not be able to erase the
  -- evidence of itself by deleting its own accounts, and `NOT NULL` forecloses ON DELETE SET NULL,
  -- which cannot be changed afterwards without a rebuild.
  reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

  reason_key TEXT NOT NULL REFERENCES report_reasons(key) ON UPDATE CASCADE,
  note       TEXT CHECK (note IS NULL OR length(note) <= 2000),

  -- A COPY of what was reported, so a moderator judges what the reporter saw rather than what the
  -- author has since changed it to. Written as `substr(body_src, 1, 4000)` by the route with the
  -- flag below, NOT as the whole body: a length CHECK smaller than the body's own bound makes any
  -- post longer than the snapshot UNREPORTABLE, which is a padding-shaped blind spot in the queue.
  -- The bound here is generous storage safety; the real 4000 lives in the INSERT.
  body_snapshot      TEXT CHECK (body_snapshot IS NULL OR length(body_snapshot) <= 65536),
  snapshot_truncated INTEGER NOT NULL DEFAULT 0 CHECK (snapshot_truncated IN (0,1)),

  status_key      TEXT NOT NULL DEFAULT 'open' REFERENCES report_statuses(key) ON UPDATE CASCADE,
  resolved_at     INTEGER,
  resolved_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT CHECK (resolution_note IS NULL OR length(resolution_note) <= 2000),

  request_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- One report per person per thing. Partial, because SQLite treats NULLs in a unique index as
-- distinct and each row sets exactly one subject column.
CREATE UNIQUE INDEX IF NOT EXISTS content_reports_dedupe_post_idx
  ON content_reports (subject_post_id, reporter_user_id) WHERE subject_post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS content_reports_dedupe_profile_idx
  ON content_reports (subject_profile_id, reporter_user_id) WHERE subject_profile_id IS NOT NULL;

-- THE QUEUE: open reports, oldest first. Ranking is by DISTINCT REPORTER COUNT and then age,
-- computed in the query — never by the reporter's own claimed severity, which is an ordering key
-- the attacker chooses.
CREATE INDEX IF NOT EXISTS content_reports_queue_idx
  ON content_reports (status_key, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS content_reports_subject_post_idx
  ON content_reports (subject_post_id, status_key) WHERE subject_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_reports_subject_profile_idx
  ON content_reports (subject_profile_id, status_key) WHERE subject_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_reports_reporter_idx ON content_reports (reporter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_reports_author_idx   ON content_reports (subject_author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_reports_reason_fk_idx   ON content_reports (reason_key);
CREATE INDEX IF NOT EXISTS content_reports_status_fk_idx   ON content_reports (status_key);
CREATE INDEX IF NOT EXISTS content_reports_resolver_fk_idx ON content_reports (resolved_by) WHERE resolved_by IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_report_shape_ins
BEFORE INSERT ON content_reports FOR EACH ROW
WHEN (NEW.subject_post_id IS NULL) = (NEW.subject_profile_id IS NULL)
  OR NEW.reporter_user_id IS NULL
  OR NEW.subject_author_user_id IS NULL
  OR NEW.request_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'content_reports: report_shape_invalid');
END;

-- Reporting yourself is not a moderation signal; it is a way to make a permanent copy of your own
-- text after withdrawing it (013's reasoning).
CREATE TRIGGER IF NOT EXISTS trg_report_not_self_ins
BEFORE INSERT ON content_reports FOR EACH ROW
WHEN NEW.reporter_user_id = NEW.subject_author_user_id
BEGIN
  SELECT RAISE(ABORT, 'content_reports: self_report_refused');
END;

CREATE TRIGGER IF NOT EXISTS trg_report_reason_reportable_ins
BEFORE INSERT ON content_reports FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM report_reasons r
                  WHERE r.key = NEW.reason_key AND r.reportable = 1 AND r.active = 1)
BEGIN
  SELECT RAISE(ABORT, 'content_reports: reason_not_available');
END;

-- THE ANTI-BRIGADING NUMBER, as a database fact. The limiter above it is in-memory and does not
-- survive a restart or a second cluster worker; a queue nobody can read is moderation denied.
CREATE TRIGGER IF NOT EXISTS trg_report_daily_quota_ins
BEFORE INSERT ON content_reports FOR EACH ROW
WHEN (SELECT COUNT(*) FROM content_reports x
       WHERE x.reporter_user_id = NEW.reporter_user_id AND x.created_at > unixepoch() - 86400)
     >= (SELECT value FROM public_policy WHERE key = 'report_daily_max')
BEGIN
  SELECT RAISE(ABORT, 'content_reports: report_quota_reached');
END;

-- A report records what was reported and cannot be re-aimed.
CREATE TRIGGER IF NOT EXISTS trg_report_subject_frozen_upd
BEFORE UPDATE OF subject_post_id, subject_profile_id, subject_author_user_id, reason_key, note, created_at
ON content_reports FOR EACH ROW
WHEN NEW.subject_post_id        IS NOT OLD.subject_post_id
  OR NEW.subject_profile_id     IS NOT OLD.subject_profile_id
  OR NEW.reason_key             IS NOT OLD.reason_key
  OR NEW.note                   IS NOT OLD.note
  OR NEW.created_at             IS NOT OLD.created_at
  -- subject_author_user_id may only move to NULL, and only by the users cascade.
  OR (NEW.subject_author_user_id IS NOT OLD.subject_author_user_id AND NEW.subject_author_user_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'content_reports: report_is_frozen');
END;

-- Status and resolution agree, with `is_terminal` read from the reference row so a non-terminal
-- 'triaged' state is one INSERT. Carve-out for the resolver being erased.
CREATE TRIGGER IF NOT EXISTS trg_report_resolution_consistent_ins
BEFORE INSERT ON content_reports FOR EACH ROW
WHEN ((SELECT s.is_terminal FROM report_statuses s WHERE s.key = NEW.status_key) = 1)
     <> (NEW.resolved_at IS NOT NULL)
  OR ((NEW.resolved_at IS NULL) <> (NEW.resolved_by IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'content_reports: resolution_pair_incomplete');
END;

CREATE TRIGGER IF NOT EXISTS trg_report_resolution_consistent_upd
BEFORE UPDATE OF status_key, resolved_at, resolved_by ON content_reports FOR EACH ROW
WHEN (((SELECT s.is_terminal FROM report_statuses s WHERE s.key = NEW.status_key) = 1)
        <> (NEW.resolved_at IS NOT NULL)
      OR ((NEW.resolved_at IS NULL) <> (NEW.resolved_by IS NULL)))
 AND NOT (OLD.resolved_by IS NOT NULL AND NEW.resolved_by IS NULL
          AND NEW.resolved_at IS OLD.resolved_at AND NEW.status_key IS OLD.status_key)
BEGIN
  SELECT RAISE(ABORT, 'content_reports: resolution_pair_incomplete');
END;

CREATE TRIGGER IF NOT EXISTS trg_report_resolver_is_admin_upd
BEFORE UPDATE OF resolved_by ON content_reports FOR EACH ROW
WHEN NEW.resolved_by IS NOT NULL AND NEW.resolved_by IS NOT OLD.resolved_by
 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.resolved_by AND u.role = 'admin' AND u.disabled_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'content_reports: resolver_not_admin');
END;

-- A RESOLVED REPORT KEEPS NO COPY OF ANYBODY'S TEXT. This is 013's promise, given code — as a
-- DATABASE FACT rather than as a step in one route, because this feature has two paths that
-- resolve a report and a third will be added.
CREATE TRIGGER IF NOT EXISTS trg_report_snapshot_cleared_upd
BEFORE UPDATE OF status_key ON content_reports FOR EACH ROW
WHEN (SELECT s.is_terminal FROM report_statuses s WHERE s.key = NEW.status_key) = 1
 AND NEW.body_snapshot IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'content_reports: snapshot_must_be_cleared');
END;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 9. AUDIT COMPLETENESS FOR THIS NAMESPACE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- 019 added the coin equivalent because the convention had ALREADY been violated once —
-- chat/routes.js writes a non-existent `req.id` into request_id — which is the argument for making
-- it a database fact rather than a habit. Moderation on a public surface is where "who took this
-- down, and from which request" has to be recoverable a year later.
--
-- GLOB, not LIKE: LIKE is case-insensitive for ASCII and '_' is a LIKE wildcard (019:144).
--
-- NOTE ON TARGETS: every `marketplace.*` action has an INTEGER target. A consent event targets the
-- USER who consented (`target_type='user'`), not the version string — audit_log.target_id is an
-- INTEGER column, and pointing it at a TEXT primary key is how one design deadlocked its own
-- guidelines-accept transaction and, through it, every publish in the product.
CREATE TRIGGER IF NOT EXISTS trg_audit_log_marketplace_complete
BEFORE INSERT ON audit_log FOR EACH ROW
WHEN NEW.action GLOB 'marketplace.*'
 AND (NEW.request_id IS NULL
   OR NEW.target_type IS NULL
   OR NEW.target_id IS NULL
   OR (NEW.action GLOB 'marketplace.moderation.*' AND NEW.actor_id IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'audit_log: marketplace_event_incomplete');
END;

-- The moderation log read: every takedown, newest first, without scanning the whole audit table.
CREATE INDEX IF NOT EXISTS audit_log_marketplace_idx
  ON audit_log (created_at DESC, id DESC) WHERE action GLOB 'marketplace.moderation.*';

PRAGMA user_version = 21;