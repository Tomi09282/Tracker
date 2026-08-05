-- 010_plans_and_logs.sql — workout authoring, guided execution, personal records and analytics.
--
-- FILENAME FIRST, BECAUSE IT IS THE ONE MISTAKE THAT FAILS SILENTLY. This was specified as "009".
-- `009_language_roster.sql` already exists and the database is already at user_version 9.
-- `migrate()` skips any file whose version <= the current one and reports success, so a second 009
-- would never run, migrate() would return {applied: [], version: 9}, the port would bind, /readyz
-- would pass, and every plan endpoint would 500 with "no such table". There is no error path for a
-- duplicate migration number. Hence 010. Check this directory before naming the next one.
--
-- THE THESIS: a plan is a mutable document, a log is a historical fact, and the bridge between them
-- is a SNAPSHOT taken once — when the client presses Start. The coach must be able to fix a typo in
-- tomorrow's plan at 23:00 without rewriting last Tuesday, and the player must run for forty
-- minutes in a basement with no signal. Materialising the whole session — every set row, with its
-- prescription frozen onto it — at start satisfies both. After that the execution path never reads
-- the plan again.
--
-- Three consequences, each load-bearing:
--   1. CHECKING A SET IS AN UPDATE, NEVER AN INSERT. The row already exists, as 'pending'. That
--      kills the double-tap duplicate-row class before any dedupe logic runs, and it is what lets
--      the idempotency guard live inside the UPDATE's own WHERE clause.
--   2. A COMPLETED SET IS IMMUTABLE, BY TRIGGER. The only permitted mutation is a void, which
--      leaves a tombstone and a reason. Three of six reviews of the candidate designs found the
--      same fatal bug: an endpoint that is simultaneously the replay path and the correction path,
--      silently overwriting a measurement while answering 200, or leaving a record no surviving set
--      supports. Immutability makes that unrepresentable — a DIFFERENT payload against a completed
--      set changes zero rows and is answered 409.
--   3. NO CURRENT-BESTS CACHE TABLE. "My best" is one descent of a partial DESC index. "A badge was
--      shown on 3 March, and a coin was paid for it" is NOT derivable, so only that is stored — as
--      an append-only event with an `invalidated_at` tombstone.
--
-- DELIBERATELY NOT BUILT, so nobody re-litigates it from an empty page:
--   * No `workout_plan_translations`. A coach's plan name is the coach's own prose, exactly like
--     `onboarding_profiles.notes` (008); machine-translating "Bence hét 3 – deload" would be worse
--     than the original. Only `scope='system'` (a future product starter library) will ever need
--     per-language names, and 005 established that dead schema is not harmless. The discriminator
--     ships now; the table ships with the library, in the taxonomy_translations shape (rowid +
--     surrogate id + UNIQUE on the natural key, per the 004 FTS5 note) — never per-language columns.
--   * No materialised calendar. Occurrences are computed from (starts_on, cycle_days, day_index)
--     and diffed against a sparse exceptions table: a year of normal running costs zero rows, and
--     there is no horizon top-up job to forget. One-row-per-session was rejected because it needs a
--     repair path for every plan edit after assignment and its expansion is an unbounded write
--     inside one IMMEDIATE transaction — a self-serve write-lock DoS.
--   * No `idempotency_keys` table. Every write here has a natural key already; a generic table
--     would add a TTL sweeper and stored response bodies for nothing.
--
-- CONVENTIONS, WHERE THE REPO HAS TWO:
--   * Indexes take the SUFFIX form (`*_idx`, `*_unique`) — the 001-006 majority, ~20 against 3.
--     Triggers take the PREFIX form `trg_*` with the 008 WHEN-guarded touch body. That is not
--     taste: the 001-style unguarded touch trigger clobbers an updated_at a backfill set
--     deliberately, and is non-recursive only because `PRAGMA recursive_triggers` is never set in
--     worker.js — turning it on today would infinite-loop six existing tables.
--   * Enum codes are snake_case EXCEPT where they mirror an existing enum, then copied verbatim,
--     kebab included. `goal` reuses onboarding_profiles.primary_goal and `body_area` reuses
--     onboarding_limitations.body_area, so the suggestion query is an equality join. A second
--     spelling of one idea is how a join silently returns nothing.
--   * Timestamps are epoch seconds. CIVIL DATES ARE NOT TIMESTAMPS and are TEXT 'YYYY-MM-DD': a
--     workout scheduled for Tuesday must stay on Tuesday when the client flies to Denver. Every
--     civil-date column carries `CHECK (col = date(col))`, an exact validator — it rejects
--     '2026-08-33', '2026-13-01', '2026-02-30' (date() normalises it to 2026-03-02, so equality
--     fails) and the unpadded '2026-8-5'. TEXT also makes `date(local_date,'+7 days')` correct SQL,
--     which a packed YYYYMMDD integer is not.


-- ═══ AUTHORING ═════════════════════════════════════════════════════════════════════════════════

-- One table for all four kinds of plan, discriminated by `scope`. The roadmap's `is_template`
-- boolean is collapsed into it: a separate boolean permits `is_template=1 AND client_user_id IS NOT
-- NULL`, a meaningless state every read would have to defend against. One enum plus one table CHECK
-- makes every incoherent owner combination unrepresentable, and clone-to-client stays a single
-- INSERT..SELECT instead of a second table plus a UNION in every listing query.
--
-- THE COPY-ON-ASSIGN LAW: a template is a mould, never a live link. Assigning deep-copies. Three
-- arguments converge — a coach fixing a typo at 23:00 must not rewrite what forty clients do at
-- 06:00; per-client edits are impossible against a live link without a sparse-overlay merge on the
-- hottest read path; and a log's "prescribed 4x8 @ 80" must not retroactively become "5x5 @ 100".
-- `source_plan_id` is provenance for a previewable re-clone, not a live link.
CREATE TABLE IF NOT EXISTS workout_plans (
  id INTEGER PRIMARY KEY,

  -- template : a coach's reusable mould. Not assignable — clone it first.
  -- client   : an instance bound to exactly one coach_clients link. What a client trains.
  -- personal : a self-coached user's own plan. No coach in the picture.
  -- system   : product-shipped starter, owner-less, the only scope that will ever be translated.
  scope TEXT NOT NULL DEFAULT 'template'
        CHECK (scope IN ('template', 'client', 'personal', 'system')),

  -- AUTHOR, not owner. The rename is defensive: for scope='client' this is the COACH, and a future
  -- "archive all my plans" screen written as `WHERE owner_user_id = ?` would archive every live
  -- client instance at once and make every client's plan vanish simultaneously. "Whose plan is
  -- this" must go through client_user_id.
  author_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- The LINK is the proof of entitlement, never the client's user id (onboarding/routes.js:255-265).
  -- It is what gives archiving its property: the coach's very next request, with the SAME unexpired
  -- token, matches zero rows. No claim in the JWT to go stale, no cache to bust.
  --
  -- CASCADE, not SET NULL, on purpose: the table CHECK below requires a link for scope='client', so
  -- SET NULL would put the row in violation of its own CHECK and abort the parent delete — a coach
  -- who once had a client could then never delete their account. Prescriptions die with the
  -- relationship; HISTORY does not (workout_logs.coach_client_id is SET NULL and carries snapshots).
  coach_client_id INTEGER REFERENCES coach_clients(id) ON DELETE CASCADE,

  -- Denormalised from the link so the CLIENT's guard is single-table `WHERE client_user_id = ?`,
  -- with no join and no status filter — a client keeps full access after a coach archives them.
  -- They own their training; the coach owned only the relationship. trg_plan_link_client_* makes
  -- this copy unforgeable.
  client_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  source_plan_id  INTEGER REFERENCES workout_plans(id) ON DELETE SET NULL,
  source_revision INTEGER CHECK (source_revision IS NULL OR source_revision > 0),

  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  -- Diacritics folded at write time by lib/normalize.js, as exercises.normalized_name. Makes a
  -- 200-template library searchable without an FTS5 shadow — and note brain-gen.mjs excludes any
  -- table matching %_fts% from the generated docs, so a shadow would vanish from docs/brain/.
  normalized_name TEXT NOT NULL,
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),

  -- Vocabulary copied verbatim from onboarding_profiles.primary_goal / .experience.
  goal TEXT CHECK (goal IS NULL OR goal IN (
    'strength', 'muscle', 'fat-loss', 'endurance', 'mobility', 'health', 'sport')),
  experience TEXT CHECK (experience IS NULL OR experience IN (
    'none', 'beginner', 'intermediate', 'advanced')),

  -- THE SCHEDULE IS A RULE: an occurrence is starts_on + k*cycle_days + day_index, LEFT JOINed
  -- against workout_plan_day_exceptions. cycle_days is bounded to 56 and day_index is bounded
  -- against it by trg_plan_day_in_cycle_*, so occurrences in any window are provably few. Without
  -- that, "generate the next year" is an unbounded loop driven by a client-supplied number.
  cycle_days INTEGER NOT NULL DEFAULT 7 CHECK (cycle_days BETWEEN 1 AND 56),
  starts_on TEXT CHECK (starts_on IS NULL OR starts_on = date(starts_on)),
  ends_on   TEXT CHECK (ends_on   IS NULL OR ends_on   = date(ends_on)),

  -- draft is invisible to the client: a coach builds a week one exercise at a time without the
  -- client watching it appear. The client read predicate is `status <> 'draft'`.
  status TEXT NOT NULL DEFAULT 'draft'
         CHECK (status IN ('draft', 'active', 'paused', 'ended')),

  -- Bumped by trg_plan_rev_* on EVERY structural edit anywhere in the tree. A revision only the
  -- application remembers to bump is a provenance claim that is silently false — every candidate
  -- design carried this column and none of them bumped it, because a structural edit touches a
  -- CHILD table. workout_logs.plan_revision snapshots it.
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),

  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  archived_at INTEGER,

  -- The four legal shapes. A personal plan pins client = author IN THE CHECK, so it can never be
  -- aimed at a stranger even before any trigger runs.
  CHECK (
    (scope = 'template' AND author_user_id IS NOT NULL AND client_user_id IS NULL
                        AND coach_client_id IS NULL)
 OR (scope = 'personal' AND author_user_id IS NOT NULL AND client_user_id = author_user_id
                        AND coach_client_id IS NULL)
 OR (scope = 'client'   AND author_user_id IS NOT NULL AND client_user_id IS NOT NULL
                        AND coach_client_id IS NOT NULL)
 OR (scope = 'system'   AND author_user_id IS NULL     AND client_user_id IS NULL
                        AND coach_client_id IS NULL)
  ),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  -- A template has no start date and should not. An ACTIVE CLIENT plan without one generates zero
  -- occurrences: the client sees the plan in their list, nothing on their home screen, and no
  -- error anywhere. Silence is the worst failure mode, so it is unstorable.
  CHECK (scope <> 'client' OR status <> 'active' OR starts_on IS NOT NULL),
  CHECK (status <> 'ended' OR archived_at IS NOT NULL OR ends_on IS NOT NULL)
);

-- The coach's library and template picker.
CREATE INDEX IF NOT EXISTS workout_plans_author_idx ON workout_plans (author_user_id, scope, archived_at);
-- The client's plan list and the Home "today" card.
CREATE INDEX IF NOT EXISTS workout_plans_client_idx ON workout_plans (client_user_id, status, archived_at);
-- The coach reading one client, joined live through the link so archiving ends it on the next read.
CREATE INDEX IF NOT EXISTS workout_plans_link_idx   ON workout_plans (coach_client_id, status);
-- "Which clients are on this template?" — what makes a bulk re-clone previewable.
CREATE INDEX IF NOT EXISTS workout_plans_source_idx ON workout_plans (source_plan_id) WHERE source_plan_id IS NOT NULL;
-- Starter-library browse, filtered by the onboarding answers.
CREATE INDEX IF NOT EXISTS workout_plans_system_idx ON workout_plans (scope, goal, experience) WHERE scope = 'system';
-- Prefix search over the template library.
CREATE INDEX IF NOT EXISTS workout_plans_name_idx   ON workout_plans (normalized_name, id);

CREATE TRIGGER IF NOT EXISTS trg_workout_plans_touch
AFTER UPDATE ON workout_plans FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE workout_plans SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- THE CROSS-TENANT GUARD, and the most important trigger in this file.
--
-- Every candidate design tried to express this as a table CHECK and every one was wrong the same
-- way: a CHECK over (scope, author, client, link) sees only those four columns, so it can prove
-- they are mutually coherent but NOT that the link actually joins that coach to that client. The
-- attack is one request — `POST /plans {scope:'client', coach_client_id:<a link I really own>,
-- client_user_id:<anyone>}`. The route's ownership SELECT passes, because the link genuinely is the
-- caller's; the CHECK passes; and the victim's `WHERE client_user_id = ?` then renders a stranger's
-- plan inside the trusted app chrome. Once they train it, the attacker's coach-side predicate
-- matches the resulting log and reads their bodyweight, notes and every set. Planting a plan on
-- ANOTHER coach's link is worse because it is permanent: the planter then fails the coach predicate
-- and the real coach fails `author_user_id = ?`, so only raw SQL can remove it.
--
-- An INSERT has no WHERE clause to hide a guard in, which is exactly why this must be a trigger.
CREATE TRIGGER IF NOT EXISTS trg_plan_link_client_ins
BEFORE INSERT ON workout_plans FOR EACH ROW
WHEN NEW.coach_client_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM coach_clients cc
                  WHERE cc.id = NEW.coach_client_id
                    AND cc.client_id = NEW.client_user_id
                    AND cc.coach_id  = NEW.author_user_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_plans: the link must join this author to this client');
END;

CREATE TRIGGER IF NOT EXISTS trg_plan_link_client_upd
BEFORE UPDATE OF coach_client_id, client_user_id, author_user_id, scope ON workout_plans FOR EACH ROW
WHEN NEW.coach_client_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM coach_clients cc
                  WHERE cc.id = NEW.coach_client_id
                    AND cc.client_id = NEW.client_user_id
                    AND cc.coach_id  = NEW.author_user_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_plans: the link must join this author to this client');
END;

-- "Save this client plan as a template" is the obvious feature, and written naively
-- (`SET scope='template', client_user_id=NULL`) it detaches a plan the client is still training:
-- their read fails, their logs' plan_id dangles, and the coach's next edit to what they believe is
-- a detached template silently rewrites live sessions. Save-as-template must COPY.
CREATE TRIGGER IF NOT EXISTS trg_plan_scope_frozen
BEFORE UPDATE OF scope ON workout_plans FOR EACH ROW
WHEN NEW.scope IS NOT OLD.scope
BEGIN
  SELECT RAISE(ABORT, 'a plan cannot change scope: clone it instead');
END;


-- A session slot inside the cycle, addressed by (day_index, slot) — a position in the CYCLE, never
-- a date. That is what makes copy-week targetable and lets a 4-week periodised block exist without
-- a second table. `slot` exists because two-a-days are real and a bare UNIQUE(plan_id, day_index)
-- would forbid them. A prescribed REST day is an explicit row, not a gap: "recover today" and
-- "nothing is scheduled" are different messages, and adherence must not count a prescribed rest as
-- a missed session.
CREATE TABLE IF NOT EXISTS workout_plan_days (
  id      INTEGER PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL CHECK (typeof(day_index) = 'integer' AND day_index BETWEEN 0 AND 55),
  slot      INTEGER NOT NULL DEFAULT 0 CHECK (typeof(slot) = 'integer' AND slot BETWEEN 0 AND 3),
  name  TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  is_rest INTEGER NOT NULL DEFAULT 0 CHECK (is_rest IN (0, 1)),
  est_minutes INTEGER CHECK (est_minutes IS NULL OR est_minutes BETWEEN 5 AND 300),
  -- Preferred start time as 'HH:MM', 24-hour. NULL means "no particular time" and the ICS feed
  -- emits an all-day VEVENT, which is the honest rendering of an unscheduled session rather than a
  -- made-up 09:00. Stored as TEXT because it is a wall-clock intention, not an instant: 18:00
  -- stays 18:00 across a daylight-saving change, which is what a person means by "evenings".
  start_time TEXT CHECK (
    start_time IS NULL
    OR (length(start_time) = 5 AND start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND start_time < '24:00')
  ),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- UNIQUE here and NOT on the `position` columns below, and the difference matters. (day_index,
-- slot) is a SEMANTIC coordinate the calendar resolves — two days in one slot would make "what am I
-- doing on Tuesday" nondeterministic. Copy-day and move-day pick a free slot rather than permuting
-- values, so there is no mid-statement collision to work around.
CREATE UNIQUE INDEX IF NOT EXISTS workout_plan_days_slot_unique ON workout_plan_days (plan_id, day_index, slot);

CREATE TRIGGER IF NOT EXISTS trg_workout_plan_days_touch
AFTER UPDATE ON workout_plan_days FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE workout_plan_days SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- day_index must fall inside the plan's own cycle, in BOTH directions. Without the second half, a
-- coach who shortens a 28-day block to 7 leaves 21 days at indices 7..27; the occurrence generator
-- folds them into the next cycle, where they collide with days 0..6 on the same calendar date and
-- the Home card becomes nondeterministic. SQLite cannot express "less than a column of the parent
-- row" as a CHECK; a trigger reads the parent fine.
CREATE TRIGGER IF NOT EXISTS trg_plan_day_in_cycle_ins
BEFORE INSERT ON workout_plan_days FOR EACH ROW
WHEN NEW.day_index >= (SELECT cycle_days FROM workout_plans WHERE id = NEW.plan_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_plan_days.day_index must be inside the plan cycle');
END;

CREATE TRIGGER IF NOT EXISTS trg_plan_day_in_cycle_upd
BEFORE UPDATE OF day_index, plan_id ON workout_plan_days FOR EACH ROW
WHEN NEW.day_index >= (SELECT cycle_days FROM workout_plans WHERE id = NEW.plan_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_plan_days.day_index must be inside the plan cycle');
END;

CREATE TRIGGER IF NOT EXISTS trg_plan_cycle_shrink
BEFORE UPDATE OF cycle_days ON workout_plans FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM workout_plan_days d
              WHERE d.plan_id = NEW.id AND d.day_index >= NEW.cycle_days)
BEGIN
  SELECT RAISE(ABORT, 'cannot shorten the cycle below an existing day_index: move those days first');
END;

CREATE TRIGGER IF NOT EXISTS trg_plan_day_count_cap
BEFORE INSERT ON workout_plan_days FOR EACH ROW
WHEN (SELECT COUNT(*) FROM workout_plan_days WHERE plan_id = NEW.plan_id) >= 120
BEGIN
  SELECT RAISE(ABORT, 'a plan may hold at most 120 days');
END;


-- The superset / circuit container. EVERY prescribed exercise belongs to a block, including a solo
-- one (kind='single'), so ordering inside a day is total and no renderer needs an "is this grouped"
-- branch or a COALESCE between two sequences. A real table rather than a `group_key TEXT` tag,
-- because a circuit REPEATS THE BLOCK while a straight set repeats the EXERCISE — so `rounds`, the
-- rest between rounds and the cap belong to the block, and a tag would have nowhere to put them (or
-- would duplicate them onto every member, where two members can disagree).
--
-- Note what is NOT here: `day_id` lives on the block and nowhere else. An earlier draft denormalised
-- it onto the exercises too, "so a day renders in one seek", and that created a desync — dragging a
-- block to another day is `UPDATE workout_plan_blocks SET day_id = ?`, which fires no trigger on the
-- child, so the exercises keep pointing at the old day and the calendar shows a phantom session.
-- One owner for one fact.
CREATE TABLE IF NOT EXISTS workout_plan_blocks (
  id INTEGER PRIMARY KEY,
  -- plan_id is denormalised down the whole authoring tree, and it is why every ownership predicate
  -- fits in ONE WHERE clause with no application-side logic:
  --   UPDATE workout_plan_blocks SET ... WHERE id = ? AND plan_id = (SELECT ... one plan guard ...)
  plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  day_id  INTEGER NOT NULL REFERENCES workout_plan_days(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'single'
       CHECK (kind IN ('single', 'superset', 'circuit', 'emom', 'amrap')),
  position INTEGER NOT NULL DEFAULT 0 CHECK (typeof(position) = 'integer' AND position >= 0),
  rounds       INTEGER CHECK (rounds       IS NULL OR rounds       BETWEEN 1 AND 50),
  rest_seconds INTEGER CHECK (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 3600),
  cap_seconds  INTEGER CHECK (cap_seconds  IS NULL OR cap_seconds  BETWEEN 10 AND 7200),
  label TEXT CHECK (label IS NULL OR length(trim(label)) BETWEEN 1 AND 40),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (kind <> 'single' OR (rounds IS NULL AND cap_seconds IS NULL)),
  CHECK (kind NOT IN ('circuit', 'emom') OR rounds IS NOT NULL)
);

-- DELIBERATELY NOT UNIQUE, the counterpart to the UNIQUE on days. SQLite checks UNIQUE per
-- statement, not deferred to commit, so a drag-reorder rewriting positions 0..n-1 in one
-- transaction WILL collide part-way through a unique (day_id, position) and abort a perfectly legal
-- reorder. The alternatives are a two-pass "park everything at +1000000" dance every future
-- contributor has to rediscover, or this: a non-unique index with `id` as tie-break, which keeps
-- the order total even if two positions coincide. A duplicate position is cosmetically harmless; an
-- aborted reorder is a bug report.
CREATE INDEX IF NOT EXISTS workout_plan_blocks_day_idx  ON workout_plan_blocks (day_id, position, id);
CREATE INDEX IF NOT EXISTS workout_plan_blocks_plan_idx ON workout_plan_blocks (plan_id);

CREATE TRIGGER IF NOT EXISTS trg_plan_block_parent_ins
BEFORE INSERT ON workout_plan_blocks FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM workout_plan_days d WHERE d.id = NEW.day_id AND d.plan_id = NEW.plan_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_plan_blocks.plan_id must match the day it belongs to');
END;

CREATE TRIGGER IF NOT EXISTS trg_plan_block_parent_upd
BEFORE UPDATE OF day_id, plan_id ON workout_plan_blocks FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM workout_plan_days d WHERE d.id = NEW.day_id AND d.plan_id = NEW.plan_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_plan_blocks.plan_id must match the day it belongs to');
END;


-- The prescription: one exercise inside one block.
CREATE TABLE IF NOT EXISTS workout_plan_exercises (
  id INTEGER PRIMARY KEY,
  plan_id  INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  block_id INTEGER NOT NULL REFERENCES workout_plan_blocks(id) ON DELETE CASCADE,

  -- SET NULL, never CASCADE and never RESTRICT; both rejections are load-bearing. CASCADE punches
  -- holes in LIVE client plans, because `exercises.owner_id` is ON DELETE CASCADE from users (003):
  -- deleting a coach's account would delete prescribed exercises out of plans clients are mid-block
  -- on, and copy-day would replicate the hole forever. RESTRICT is worse — once any private exercise
  -- appears in any plan or log, `DELETE FROM users WHERE id = <coach>` aborts, so a GDPR erasure
  -- returns 500, and it CANNOT be fixed later: changing an FK action needs the 12-step rebuild, and
  -- `PRAGMA foreign_keys = OFF` is a no-op inside the transaction every migration runs in. A one-way
  -- door. SET NULL plus the snapshot degrades to a named placeholder the coach must resolve.
  exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
  exercise_name_snapshot TEXT NOT NULL CHECK (length(trim(exercise_name_snapshot)) BETWEEN 1 AND 200),

  position INTEGER NOT NULL DEFAULT 0 CHECK (typeof(position) = 'integer' AND position >= 0),

  -- Which of the three prescription shapes this is, STATED rather than inferred from which columns
  -- happen to be NULL, with CHECKs that make the incoherent combinations unstorable.
  target_metric TEXT NOT NULL DEFAULT 'reps' CHECK (target_metric IN ('reps', 'time', 'distance')),

  -- How the load is applied. This is what makes bodyweight training first-class instead of a
  -- permanent zero: without it an entire calisthenics client reports 0 kg of volume, an empty
  -- progress graph, and can never earn a weight or 1RM record. 'assisted' means weight_kg is the
  -- COUNTERWEIGHT and is subtracted. See workout_log_sets.effective_load_kg, where this becomes
  -- arithmetic the database performs rather than a convention the app remembers.
  load_mode TEXT NOT NULL DEFAULT 'external'
            CHECK (load_mode IN ('external', 'bodyweight', 'weighted_bodyweight', 'assisted')),

  target_sets INTEGER NOT NULL DEFAULT 3
              CHECK (typeof(target_sets) = 'integer' AND target_sets BETWEEN 1 AND 50),
  -- A RANGE, because "8-12" is how coaches write it; a single number is min = max.
  target_reps_min INTEGER CHECK (target_reps_min IS NULL OR (typeof(target_reps_min) = 'integer' AND target_reps_min BETWEEN 1 AND 1000)),
  target_reps_max INTEGER CHECK (target_reps_max IS NULL OR (typeof(target_reps_max) = 'integer' AND target_reps_max BETWEEN 1 AND 1000)),
  target_seconds    INTEGER CHECK (target_seconds    IS NULL OR (typeof(target_seconds) = 'integer' AND target_seconds BETWEEN 1 AND 7200)),
  target_distance_m INTEGER CHECK (target_distance_m IS NULL OR (typeof(target_distance_m) = 'integer' AND target_distance_m BETWEEN 1 AND 200000)),

  -- KILOGRAMS. `onboarding_profiles.units` is a DISPLAY preference (008 says so) and must never
  -- reach a write path as a discriminator — a per-row unit column is the classic disaster, because
  -- every SUM and MAX then needs a CASE and the one query that forgets it mixes pounds into a
  -- kilogram total in silence.
  target_weight_kg REAL CHECK (target_weight_kg IS NULL OR (target_weight_kg >= 0 AND target_weight_kg <= 1000)),
  -- What the coach TYPED, in the unit they typed it in. Not a duplicate: a separate historical fact
  -- that makes the imperial round-trip exact instead of 225 lb -> 102.058 kg -> 224.99 lb, and the
  -- CHECK below turns a double conversion — the one arithmetic bug that ships a 2.2x error to a
  -- client's phone — into a write failure. Required together with the kg value so the guard cannot
  -- be switched off by omitting a field, which is how the same CHECK in an earlier draft was
  -- defeated by a one-line payload.
  target_weight_entry_unit  TEXT CHECK (target_weight_entry_unit IS NULL OR target_weight_entry_unit IN ('kg', 'lb')),
  target_weight_entry_value REAL CHECK (target_weight_entry_value IS NULL OR (target_weight_entry_value >= 0 AND target_weight_entry_value <= 2500)),

  -- Percentage programming. Concrete kilograms are resolved by the SERVER at session start from the
  -- client's own canonical e1RM — never sent by the client, never stored as if it were.
  target_percent_1rm REAL CHECK (target_percent_1rm IS NULL OR target_percent_1rm BETWEEN 1 AND 200),
  -- RPE moves in half points. RIR is deliberately absent: RIR = 10 - RPE, and two columns for one
  -- fact are two chances to disagree.
  target_rpe REAL CHECK (target_rpe IS NULL OR target_rpe IN
    (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10)),
  rest_seconds INTEGER CHECK (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 3600),
  tempo TEXT CHECK (tempo IS NULL OR tempo GLOB '[0-9X][0-9X][0-9X][0-9X]'),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  CHECK (target_reps_max IS NULL OR target_reps_min IS NULL OR target_reps_max >= target_reps_min),
  CHECK (target_metric <> 'reps'     OR target_reps_min   IS NOT NULL),
  CHECK (target_metric <> 'time'     OR target_seconds    IS NOT NULL),
  CHECK (target_metric <> 'distance' OR target_distance_m IS NOT NULL),
  -- Absolute load and a percentage are two answers to one question.
  CHECK (target_weight_kg IS NULL OR target_percent_1rm IS NULL),
  CHECK (load_mode <> 'bodyweight' OR target_weight_kg IS NULL),
  CHECK ((target_weight_entry_unit IS NULL) = (target_weight_entry_value IS NULL)),
  CHECK (target_weight_kg IS NULL OR target_weight_entry_value IS NOT NULL),
  CHECK (target_weight_entry_value IS NULL OR target_weight_kg IS NOT NULL),
  CHECK (target_weight_entry_value IS NULL
      OR (target_weight_entry_unit = 'kg' AND abs(target_weight_kg - target_weight_entry_value) < 0.02)
      OR (target_weight_entry_unit = 'lb' AND abs(target_weight_kg - target_weight_entry_value * 0.45359237) < 0.02))
);

CREATE INDEX IF NOT EXISTS workout_plan_exercises_block_idx ON workout_plan_exercises (block_id, position, id);
CREATE INDEX IF NOT EXISTS workout_plan_exercises_plan_idx  ON workout_plan_exercises (plan_id);
-- Serves BOTH "which plans use this exercise" (a coach editing their library, and the pre-delete
-- warning) and the EXISTS that grants a client read access to a coach's private exercise because it
-- was actually prescribed. Without it that clause scans the plan tree on every player open.
CREATE INDEX IF NOT EXISTS workout_plan_exercises_exercise_idx ON workout_plan_exercises (exercise_id) WHERE exercise_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_workout_plan_exercises_touch
AFTER UPDATE ON workout_plan_exercises FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE workout_plan_exercises SET updated_at = unixepoch() WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_plan_exercise_parent_ins
BEFORE INSERT ON workout_plan_exercises FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM workout_plan_blocks b WHERE b.id = NEW.block_id AND b.plan_id = NEW.plan_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_plan_exercises.plan_id must match the block it belongs to');
END;

CREATE TRIGGER IF NOT EXISTS trg_plan_exercise_parent_upd
BEFORE UPDATE OF block_id, plan_id ON workout_plan_exercises FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM workout_plan_blocks b WHERE b.id = NEW.block_id AND b.plan_id = NEW.plan_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_plan_exercises.plan_id must match the block it belongs to');
END;

-- THE AUTHORING HALF OF EXERCISE VISIBILITY. A coach may only prescribe a global exercise or their
-- own. `exercise_id` is otherwise a bare foreign key that accepts any id that merely EXISTS, which
-- is enough to read another coach's private library through the plan editor one id at a time — and
-- the difference between a foreign-key error and a 201 is a clean existence oracle for the whole id
-- space besides. The trigger needs no req.user.id because the plan row carries the authoritative
-- author, and the author cannot be forged (trg_plan_link_client_*).
CREATE TRIGGER IF NOT EXISTS trg_plan_exercise_visible_ins
BEFORE INSERT ON workout_plan_exercises FOR EACH ROW
WHEN NEW.exercise_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM exercises e, workout_plans p
                  WHERE p.id = NEW.plan_id AND e.id = NEW.exercise_id
                    AND e.deleted_at IS NULL
                    AND (e.status = 'global' OR e.owner_id IS NULL OR e.owner_id = p.author_user_id))
BEGIN
  SELECT RAISE(ABORT, 'a plan may only prescribe a global exercise or one its author owns');
END;

CREATE TRIGGER IF NOT EXISTS trg_plan_exercise_visible_upd
BEFORE UPDATE OF exercise_id, plan_id ON workout_plan_exercises FOR EACH ROW
WHEN NEW.exercise_id IS NOT NULL
 AND NEW.exercise_id IS NOT OLD.exercise_id
 AND NOT EXISTS (SELECT 1 FROM exercises e, workout_plans p
                  WHERE p.id = NEW.plan_id AND e.id = NEW.exercise_id
                    AND e.deleted_at IS NULL
                    AND (e.status = 'global' OR e.owner_id IS NULL OR e.owner_id = p.author_user_id))
BEGIN
  SELECT RAISE(ABORT, 'a plan may only prescribe a global exercise or one its author owns');
END;

-- SIZE BOUNDS AS A DENIAL-OF-SERVICE CONTROL, not politeness. startWorkoutTx expands a day into one
-- row per set inside a single IMMEDIATE transaction, and SQLite has exactly one writer: while that
-- runs, every other write in the process — every set check by every other client, every token
-- rotation — waits on busy_timeout = 5000 and then gets SQLITE_BUSY, which the error handler
-- renders as a 500. Nothing else bounds the expansion, so one authenticated account with a scripted
-- plan builder could take the write path down for everyone. 60 exercises x 50 sets = 3000 rows is
-- the worst legal day: bounded and survivable. Unbounded is not.
CREATE TRIGGER IF NOT EXISTS trg_plan_exercise_count_cap
BEFORE INSERT ON workout_plan_exercises FOR EACH ROW
WHEN (SELECT COUNT(*) FROM workout_plan_exercises x
       JOIN workout_plan_blocks b ON b.id = x.block_id
      WHERE b.day_id = (SELECT day_id FROM workout_plan_blocks WHERE id = NEW.block_id)) >= 60
BEGIN
  SELECT RAISE(ABORT, 'a plan day may hold at most 60 exercises');
END;


-- Optional per-set refinement, for what a uniform "3 x 5" cannot express: a 5/5/3/3/1 wave, a top
-- set with backoffs, a warm-up ramp, a terminal AMRAP. Rows here WIN; with none, startWorkoutTx
-- expands `target_sets` uniformly. The branch therefore lives in exactly one place — the
-- session-start transaction — and never in a renderer, because the player only ever consumes
-- materialised set rows.
CREATE TABLE IF NOT EXISTS workout_plan_set_targets (
  id INTEGER PRIMARY KEY,
  plan_id         INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  exercise_row_id INTEGER NOT NULL REFERENCES workout_plan_exercises(id) ON DELETE CASCADE,
  set_index INTEGER NOT NULL CHECK (typeof(set_index) = 'integer' AND set_index BETWEEN 1 AND 50),
  -- 'warmup' is load-bearing, not cosmetic: a warm-up set is excluded from volume and from every
  -- record index. Forgetting that is the commonest way a training app reports a record that never
  -- happened.
  set_kind TEXT NOT NULL DEFAULT 'straight'
           CHECK (set_kind IN ('straight', 'warmup', 'drop', 'backoff', 'amrap', 'failure')),
  target_reps       INTEGER CHECK (target_reps       IS NULL OR (typeof(target_reps) = 'integer' AND target_reps BETWEEN 0 AND 1000)),
  target_seconds    INTEGER CHECK (target_seconds    IS NULL OR (typeof(target_seconds) = 'integer' AND target_seconds BETWEEN 1 AND 7200)),
  target_distance_m INTEGER CHECK (target_distance_m IS NULL OR (typeof(target_distance_m) = 'integer' AND target_distance_m BETWEEN 1 AND 200000)),
  target_weight_kg  REAL CHECK (target_weight_kg IS NULL OR (target_weight_kg >= 0 AND target_weight_kg <= 1000)),
  target_weight_entry_unit  TEXT CHECK (target_weight_entry_unit IS NULL OR target_weight_entry_unit IN ('kg', 'lb')),
  target_weight_entry_value REAL CHECK (target_weight_entry_value IS NULL OR (target_weight_entry_value >= 0 AND target_weight_entry_value <= 2500)),
  target_percent_1rm REAL CHECK (target_percent_1rm IS NULL OR target_percent_1rm BETWEEN 1 AND 200),
  target_rpe REAL CHECK (target_rpe IS NULL OR target_rpe IN
    (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10)),
  rest_seconds INTEGER CHECK (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 3600),
  CHECK (target_weight_kg IS NULL OR target_percent_1rm IS NULL),
  CHECK ((target_weight_entry_unit IS NULL) = (target_weight_entry_value IS NULL)),
  CHECK (target_weight_kg IS NULL OR target_weight_entry_value IS NOT NULL),
  CHECK (target_weight_entry_value IS NULL OR target_weight_kg IS NOT NULL),
  CHECK (target_weight_entry_value IS NULL
      OR (target_weight_entry_unit = 'kg' AND abs(target_weight_kg - target_weight_entry_value) < 0.02)
      OR (target_weight_entry_unit = 'lb' AND abs(target_weight_kg - target_weight_entry_value * 0.45359237) < 0.02))
);

-- UNIQUE is safe here where it was not on `position`, because set_index is a semantic coordinate and
-- the editor replaces the whole ladder delete-then-insert inside one transaction — the
-- onboarding_equipment precedent (onboarding/routes.js:189-199, "the set is never momentarily empty
-- for a concurrent reader") — never incrementally.
CREATE UNIQUE INDEX IF NOT EXISTS workout_plan_set_targets_unique ON workout_plan_set_targets (exercise_row_id, set_index);
CREATE INDEX IF NOT EXISTS workout_plan_set_targets_plan_idx ON workout_plan_set_targets (plan_id);

CREATE TRIGGER IF NOT EXISTS trg_plan_target_parent_ins
BEFORE INSERT ON workout_plan_set_targets FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM workout_plan_exercises x
                  WHERE x.id = NEW.exercise_row_id AND x.plan_id = NEW.plan_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_plan_set_targets.plan_id must match the exercise it refines');
END;

CREATE TRIGGER IF NOT EXISTS trg_plan_target_parent_upd
BEFORE UPDATE OF exercise_row_id, plan_id ON workout_plan_set_targets FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM workout_plan_exercises x
                  WHERE x.id = NEW.exercise_row_id AND x.plan_id = NEW.plan_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_plan_set_targets.plan_id must match the exercise it refines');
END;

-- Keeps the two sources of "how many sets" from disagreeing. Without these, a coach who writes four
-- per-set rows and then lowers target_sets to three leaves an orphan at set_index 4 that the editor
-- never shows, the player faithfully materialises, and every clone duplicates forever.
CREATE TRIGGER IF NOT EXISTS trg_plan_target_index_bound
BEFORE INSERT ON workout_plan_set_targets FOR EACH ROW
WHEN NEW.set_index > (SELECT target_sets FROM workout_plan_exercises WHERE id = NEW.exercise_row_id)
BEGIN
  SELECT RAISE(ABORT, 'set_index exceeds the exercise target_sets');
END;

CREATE TRIGGER IF NOT EXISTS trg_plan_target_sets_shrink
BEFORE UPDATE OF target_sets ON workout_plan_exercises FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM workout_plan_set_targets t
              WHERE t.exercise_row_id = NEW.id AND t.set_index > NEW.target_sets)
BEGIN
  SELECT RAISE(ABORT, 'cannot lower target_sets below an existing per-set target: delete those first');
END;


-- The sparse escape hatch from the cycle rule: "skip this Tuesday", "move it to Wednesday". One row
-- only when a human intervenes, so a plan running normally for a year costs nothing. This is what
-- lets a rule-based calendar survive contact with real life without materialising every session.
CREATE TABLE IF NOT EXISTS workout_plan_day_exceptions (
  id INTEGER PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  day_id  INTEGER NOT NULL REFERENCES workout_plan_days(id) ON DELETE CASCADE,
  -- The date the CYCLE would have produced. The generator emits occurrences and LEFT JOINs this
  -- table, so an exception is a DIFF against the rule, never a replacement for it.
  occurrence_date TEXT NOT NULL CHECK (occurrence_date = date(occurrence_date)),
  action TEXT NOT NULL CHECK (action IN ('skip', 'move')),
  moved_to_date TEXT CHECK (moved_to_date IS NULL OR moved_to_date = date(moved_to_date)),
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 200),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (action <> 'move' OR moved_to_date IS NOT NULL),
  CHECK (action <> 'skip' OR moved_to_date IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS workout_plan_day_exceptions_unique
  ON workout_plan_day_exceptions (day_id, occurrence_date);
CREATE INDEX IF NOT EXISTS workout_plan_day_exceptions_plan_idx
  ON workout_plan_day_exceptions (plan_id, occurrence_date);

CREATE TRIGGER IF NOT EXISTS trg_plan_exception_parent_ins
BEFORE INSERT ON workout_plan_day_exceptions FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM workout_plan_days d WHERE d.id = NEW.day_id AND d.plan_id = NEW.plan_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_plan_day_exceptions.plan_id must match the day');
END;


-- REVISION BUMPS. Safe from recursion because `PRAGMA recursive_triggers` is OFF, and setting
-- updated_at in the same statement makes trg_workout_plans_touch's WHEN guard false so it does not
-- fire at all. The bump is per-statement, so a 200-row clone advances revision by 200 — fine,
-- revision is a change TOKEN, not a count.
CREATE TRIGGER IF NOT EXISTS trg_plan_rev_days_ins AFTER INSERT ON workout_plan_days FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = NEW.plan_id; END;
CREATE TRIGGER IF NOT EXISTS trg_plan_rev_days_upd AFTER UPDATE ON workout_plan_days FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = NEW.plan_id; END;
CREATE TRIGGER IF NOT EXISTS trg_plan_rev_days_del AFTER DELETE ON workout_plan_days FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = OLD.plan_id; END;

CREATE TRIGGER IF NOT EXISTS trg_plan_rev_blocks_ins AFTER INSERT ON workout_plan_blocks FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = NEW.plan_id; END;
CREATE TRIGGER IF NOT EXISTS trg_plan_rev_blocks_upd AFTER UPDATE ON workout_plan_blocks FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = NEW.plan_id; END;
CREATE TRIGGER IF NOT EXISTS trg_plan_rev_blocks_del AFTER DELETE ON workout_plan_blocks FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = OLD.plan_id; END;

CREATE TRIGGER IF NOT EXISTS trg_plan_rev_ex_ins AFTER INSERT ON workout_plan_exercises FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = NEW.plan_id; END;
CREATE TRIGGER IF NOT EXISTS trg_plan_rev_ex_upd AFTER UPDATE ON workout_plan_exercises FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = NEW.plan_id; END;
CREATE TRIGGER IF NOT EXISTS trg_plan_rev_ex_del AFTER DELETE ON workout_plan_exercises FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = OLD.plan_id; END;

CREATE TRIGGER IF NOT EXISTS trg_plan_rev_tgt_ins AFTER INSERT ON workout_plan_set_targets FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = NEW.plan_id; END;
CREATE TRIGGER IF NOT EXISTS trg_plan_rev_tgt_upd AFTER UPDATE ON workout_plan_set_targets FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = NEW.plan_id; END;
CREATE TRIGGER IF NOT EXISTS trg_plan_rev_tgt_del AFTER DELETE ON workout_plan_set_targets FOR EACH ROW
BEGIN UPDATE workout_plans SET revision = revision + 1, updated_at = unixepoch() WHERE id = OLD.plan_id; END;


-- ICS EXPORT NEEDS A CREDENTIAL A CALENDAR CLIENT CAN SEND, and that is not an HttpOnly cookie. So
-- the feed URL carries a bearer secret — replayed on every sync, stored in the calendar provider's
-- cloud, captured by every reverse proxy in the path — and it therefore gets the full invite_codes
-- treatment (006:65-66): SHA-256 at rest, shown in plaintext exactly once.
--
-- `expires_at` is NOT NULL because nobody remembers to revoke a calendar subscription. `revoked_at`
-- exists so revoking ONE leaked feed does not mean rotating the secret and breaking every other
-- subscriber. Scoped to the LINK when a coach holds it, and the archive transaction must also
-- `UPDATE workout_calendar_feeds SET revoked_at = unixepoch() WHERE coach_client_id = ?` — otherwise
-- a fired coach's Google Calendar keeps polling and keeps receiving their ex-client's dated
-- schedule, forever, with nothing in the app to notice.
--
-- ROUTE NOTE: mount BEFORE `app.use(csrfProtection)` (server.js:148) — a calendar client cannot send
-- `X-CSRF: 1`. Own router, own rate-limit tier, 404 (never 401) on a bad token per the repo's
-- enumeration policy, token in a path segment and never a query string.
CREATE TABLE IF NOT EXISTS workout_calendar_feeds (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES workout_plans(id) ON DELETE CASCADE,
  -- Non-NULL when a COACH holds a feed of a client's schedule; NULL when the client holds their own.
  coach_client_id INTEGER REFERENCES coach_clients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL CHECK (token_hash GLOB '[0-9a-f]*' AND length(token_hash) = 64),
  label TEXT CHECK (label IS NULL OR length(trim(label)) BETWEEN 1 AND 40),
  -- The IANA zone `workout_plan_days.start_time` should be resolved in. Without it a feed cannot
  -- turn "18:00" into an instant and every event lands in UTC — an hour or nine off for everyone.
  -- NULL means the feed emits FLOATING local times, which calendar clients render in the viewer's
  -- own zone; that is a deliberate fallback, not an oversight.
  --
  -- The GLOB requires the '/' of an IANA identifier ("Europe/Budapest"), which rejects the two
  -- things people actually paste here: a UTC offset ("+02:00") and an abbreviation ("CET"). Both
  -- lose the daylight-saving rule, and a time that silently shifts by an hour twice a year is
  -- worse than one that was never accepted.
  timezone TEXT CHECK (
    timezone IS NULL OR (length(timezone) BETWEEN 3 AND 64 AND timezone GLOB '*/*')
  ),
  expires_at   INTEGER NOT NULL,
  revoked_at   INTEGER,
  last_used_at INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS workout_calendar_feeds_hash_unique ON workout_calendar_feeds (token_hash);
CREATE INDEX IF NOT EXISTS workout_calendar_feeds_user_idx ON workout_calendar_feeds (user_id, revoked_at);
CREATE INDEX IF NOT EXISTS workout_calendar_feeds_link_idx ON workout_calendar_feeds (coach_client_id) WHERE coach_client_id IS NOT NULL;


-- ═══ EXECUTION ═════════════════════════════════════════════════════════════════════════════════

-- One training session. A freestyle workout is THIS SAME ROW with plan_id and plan_day_id NULL and
-- source='freestyle' — off-plan is first-class because nothing in the execution path joins through
-- those columns. They are breadcrumbs, all ON DELETE SET NULL, and everything human-readable is
-- snapshotted: deleting a plan degrades a log to "orphaned but complete", never to "broken".
CREATE TABLE IF NOT EXISTS workout_logs (
  id INTEGER PRIMARY KEY,
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: deleting a coaching relationship must never delete a client's training
  -- history. This is also the coach's read path, live-joined so archiving ends it immediately.
  coach_client_id INTEGER REFERENCES coach_clients(id) ON DELETE SET NULL,

  plan_id       INTEGER REFERENCES workout_plans(id)     ON DELETE SET NULL,
  plan_day_id   INTEGER REFERENCES workout_plan_days(id) ON DELETE SET NULL,
  plan_revision INTEGER CHECK (plan_revision IS NULL OR plan_revision > 0),
  plan_name_snapshot TEXT CHECK (plan_name_snapshot IS NULL OR length(plan_name_snapshot) <= 120),
  day_name_snapshot  TEXT CHECK (day_name_snapshot  IS NULL OR length(day_name_snapshot)  <= 80),
  -- Which prescribed occurrence this answers. Adherence LEFT JOINs generated occurrences to
  -- (plan_day_id, occurrence_date).
  occurrence_date TEXT CHECK (occurrence_date IS NULL OR occurrence_date = date(occurrence_date)),

  title  TEXT CHECK (title IS NULL OR length(trim(title)) BETWEEN 1 AND 120),
  source TEXT NOT NULL DEFAULT 'plan' CHECK (source IN ('plan', 'freestyle', 'repeat')),
  status TEXT NOT NULL DEFAULT 'in_progress'
         CHECK (status IN ('in_progress', 'completed', 'abandoned')),

  started_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  -- Rewritten by the rollup triggers on every set write, so the stale-session sweeper measures
  -- inactivity rather than time-since-start.
  last_activity_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- THE ANALYTIC UNIT. Epoch seconds are UTC: a 01:00 session in Budapest groups into the previous
  -- UTC day and, once a month, the previous UTC WEEK, so `date(started_at,'unixepoch')` silently
  -- mis-buckets every streak, calendar cell and weekly volume figure. SQLite has no IANA timezone
  -- database, so this cannot be fixed in SQL — it is computed SERVER-side with Intl.DateTimeFormat
  -- from started_at plus onboarding_profiles.timezone, and NEVER recomputed. The workout happened on
  -- that Tuesday, permanently, even if the client later emigrates.
  local_date TEXT NOT NULL CHECK (local_date = date(local_date)),
  tz_name TEXT CHECK (tz_name IS NULL OR length(tz_name) BETWEEN 3 AND 64),

  -- Snapshot, not a join to onboarding_profiles: bodyweight changes, and a 2026 session's
  -- bodyweight-relative volume must use the 2026 number. It is also the input that makes
  -- workout_log_sets.effective_load_kg expressible as a generated column.
  bodyweight_kg REAL CHECK (bodyweight_kg IS NULL OR bodyweight_kg BETWEEN 25 AND 400),
  -- NOT completed_at - started_at. A session left open on a locked phone has a real duration the
  -- player measured and a wall-clock span that is a lie. Both are facts; both are stored.
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400),
  perceived_effort INTEGER CHECK (perceived_effort IS NULL OR perceived_effort BETWEEN 1 AND 10),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),

  -- THE ONLY STORED AGGREGATES IN THIS SCHEMA. Two mechanisms make them safe, neither a convention
  -- anyone must remember: trg_log_rollup_recompute_* rewrites them from SELECT SUM(...) on every set
  -- write, so the database maintains them rather than whichever transaction happened to remember;
  -- and trg_log_rollup_truthful REFUSES any value that is not the true aggregate, which is what
  -- keeps them from being an authoritative number the client can forge. The coach dashboard and any
  -- future "coin velocity" metric read total_volume_kg instead of re-aggregating, so a plainly
  -- writable column here would breach "nothing the client sends is authoritative" — found the boring
  -- way, by a PATCH that set total_volume_kg to 999999 on a CLOSED session and was let through.
  -- Weekly and lifetime rollups are NOT stored: their mutation path and their recompute path would
  -- be different transactions, which is the definition of drift, and summing 5-7 session rows is free.
  total_sets         INTEGER NOT NULL DEFAULT 0 CHECK (total_sets >= 0),
  total_working_sets INTEGER NOT NULL DEFAULT 0 CHECK (total_working_sets >= 0),
  total_reps         INTEGER NOT NULL DEFAULT 0 CHECK (total_reps >= 0),
  total_volume_kg    REAL    NOT NULL DEFAULT 0 CHECK (total_volume_kg >= 0),
  total_work_seconds INTEGER NOT NULL DEFAULT 0 CHECK (total_work_seconds >= 0),
  -- Makes a stale rollup DETECTABLE rather than merely wrong: a rollup_at older than the newest set
  -- in the session is a bug the smoke suite can assert on.
  rollup_at INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at),
  CHECK (source <> 'freestyle' OR (plan_id IS NULL AND plan_day_id IS NULL))
);

-- History feed, streaks, calendar. local_date leads because the user's DAY is what all three group
-- by; `id` trails so the pagination cursor is total.
CREATE INDEX IF NOT EXISTS workout_logs_client_idx ON workout_logs (client_user_id, local_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS workout_logs_link_idx ON workout_logs (coach_client_id, local_date DESC) WHERE coach_client_id IS NOT NULL;
-- ADHERENCE. A plain partial index with no status term, because the adherence query is a LEFT JOIN
-- whose ON clause implies `plan_day_id IS NOT NULL` and nothing else — SQLite only uses a partial
-- index when the query provably implies the index's own predicate, so the status-qualified unique
-- index below cannot serve it and the planner would fall back to a full scan of the largest table in
-- the database, once per outer row.
CREATE INDEX IF NOT EXISTS workout_logs_adherence_idx ON workout_logs (plan_day_id, occurrence_date) WHERE plan_day_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS workout_logs_open_idx ON workout_logs (client_user_id) WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS workout_logs_stale_idx ON workout_logs (last_activity_at) WHERE status = 'in_progress';

-- ONE LIVE SESSION PER CLIENT, enforced by the database rather than a SELECT-then-INSERT in the
-- route. A human cannot be in two gyms, and without this two phones start two set grids that each
-- later claim the same record. The scope is `status='in_progress'` and NOT `status<>'abandoned'`:
-- with a completed log occupying the slot, an evening second session against the same plan day would
-- be permanently unloggable, recoverable only by un-completing a session the freeze trigger forbids
-- un-completing.
CREATE UNIQUE INDEX IF NOT EXISTS workout_logs_one_live_unique ON workout_logs (client_user_id) WHERE status = 'in_progress';

-- One LIVE session per prescribed occurrence, so a double-tapped "Start workout" collides here
-- instead of producing twins.
--
-- ROUTE CONTRACT: startWorkoutTx must read for an existing live log BEFORE its first write and
-- return it, so the ordinary double tap is answered `200 {resumed:true}` rather than surfacing a raw
-- SQLITE_CONSTRAINT_UNIQUE — which lib/http.js has no typed mapping for and would render as a
-- generic 500 to someone standing in a gym. The index is the backstop, not the user experience.
CREATE UNIQUE INDEX IF NOT EXISTS workout_logs_occurrence_unique
  ON workout_logs (client_user_id, plan_day_id, occurrence_date)
  WHERE plan_day_id IS NOT NULL AND status = 'in_progress';

CREATE TRIGGER IF NOT EXISTS trg_workout_logs_touch
AFTER UPDATE ON workout_logs FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE workout_logs SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- A log may only be attached to a plan the client can actually train: their own personal plan, or a
-- client-scoped plan that is theirs. Without this, `plan_day_id` is a bare foreign key and posting
-- someone else's day id launders their entire prescription — exercise names, loads, RPE and the
-- coach's private cue text — into rows the attacker OWNS, which every ownership predicate then
-- happily returns. That is exfiltration through a write endpoint, and 404-not-403 never gets a
-- chance to fire because the id really does exist. It also blocks training a template directly.
CREATE TRIGGER IF NOT EXISTS trg_log_plan_shape_ins
BEFORE INSERT ON workout_logs FOR EACH ROW
WHEN NEW.plan_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM workout_plans p
                  WHERE p.id = NEW.plan_id
                    AND p.client_user_id = NEW.client_user_id
                    AND p.scope IN ('client', 'personal'))
BEGIN
  SELECT RAISE(ABORT, 'a log may only reference a client or personal plan belonging to its client');
END;

CREATE TRIGGER IF NOT EXISTS trg_log_plan_day_ins
BEFORE INSERT ON workout_logs FOR EACH ROW
WHEN NEW.plan_day_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM workout_plan_days d WHERE d.id = NEW.plan_day_id AND d.plan_id = NEW.plan_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_logs.plan_day_id must belong to workout_logs.plan_id');
END;

-- The coach on the log must be the coach of the client, or a fabricated session lands in a
-- stranger's coach feed. Same argument as trg_plan_link_client_*: an INSERT has no WHERE clause.
CREATE TRIGGER IF NOT EXISTS trg_log_link_client_ins
BEFORE INSERT ON workout_logs FOR EACH ROW
WHEN NEW.coach_client_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM coach_clients cc
                  WHERE cc.id = NEW.coach_client_id AND cc.client_id = NEW.client_user_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_logs: the link must belong to this client');
END;

-- A CLOSED SESSION IS A HISTORICAL FACT: it cannot be re-dated into a different week, re-owned,
-- re-attributed to another coach, or reopened.
--
-- THE `IS NOT NULL` HALF OF EACH FK CLAUSE IS NOT DECORATION — it is the difference between a
-- working product and a permanently undeletable account, and it was only found by executing the
-- migration and then running `DELETE FROM users`. plan_id, plan_day_id and coach_client_id are all
-- ON DELETE SET NULL, and an FK action IS an UPDATE as far as triggers are concerned. A flat
-- "coach_client_id may not change" therefore aborts the SET NULL, which aborts the cascade, which
-- aborts the delete — so the first coach to ask for GDPR erasure gets a 500 that no later migration
-- can fix. Allowing the transition TO NULL and nothing else keeps the guarantee while letting the
-- database clean up after itself.
--
-- The rollups are absent from this list on purpose: they stay writable so a post-hoc void can
-- recompute them, and trg_log_rollup_truthful guards them instead — a stronger protection than
-- freezing, because it also holds while the session is still live.
CREATE TRIGGER IF NOT EXISTS trg_workout_logs_frozen
BEFORE UPDATE ON workout_logs FOR EACH ROW
WHEN OLD.status IN ('completed', 'abandoned')
 AND (NEW.client_user_id  IS NOT OLD.client_user_id
   OR (NEW.coach_client_id IS NOT OLD.coach_client_id AND NEW.coach_client_id IS NOT NULL)
   OR (NEW.plan_id         IS NOT OLD.plan_id         AND NEW.plan_id         IS NOT NULL)
   OR (NEW.plan_day_id     IS NOT OLD.plan_day_id     AND NEW.plan_day_id     IS NOT NULL)
   OR NEW.plan_revision   IS NOT OLD.plan_revision
   OR NEW.occurrence_date IS NOT OLD.occurrence_date
   OR NEW.local_date      IS NOT OLD.local_date
   OR NEW.bodyweight_kg   IS NOT OLD.bodyweight_kg
   OR NEW.source          IS NOT OLD.source
   OR NEW.started_at      IS NOT OLD.started_at
   OR NEW.completed_at    IS NOT OLD.completed_at
   OR NEW.status          IS NOT OLD.status)
BEGIN
  SELECT RAISE(ABORT, 'a closed session cannot be re-dated, re-owned, re-attributed or reopened');
END;


-- One exercise inside one session: the display name is snapshotted ONCE per session rather than once
-- per set, a per-exercise note and the superset grouping have a home, and the player's PREVIOUS
-- lookup has a natural unit.
CREATE TABLE IF NOT EXISTS workout_log_exercises (
  id INTEGER PRIMARY KEY,
  log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  -- Denormalised owner, trigger-enforced on INSERT AND UPDATE, so every ownership guard is a
  -- single-table `WHERE id = ? AND client_user_id = ?` with no join to get subtly wrong.
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
  -- The name in the client's language at the time. This is what lets history render forever — after
  -- a rename, after a soft delete, and after `exercises.owner_id ON DELETE CASCADE` has hard-deleted
  -- a departed coach's whole private library. A SNAPSHOT ALONGSIDE the FK, never instead of it:
  -- exercise_id is what the progress graph and the muscle map still join on.
  exercise_name_snapshot TEXT NOT NULL CHECK (length(trim(exercise_name_snapshot)) BETWEEN 1 AND 200),
  plan_exercise_id INTEGER REFERENCES workout_plan_exercises(id) ON DELETE SET NULL,

  -- 'plan' came from the prescription, 'added' is freestyling mid-session, 'substituted' is swapping
  -- something the client could not do today. Off-plan is a first-class origin, not a gap.
  origin TEXT NOT NULL DEFAULT 'plan' CHECK (origin IN ('plan', 'added', 'substituted')),
  substituted_for_exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL,

  -- Grouping SNAPSHOT: two plain scalars, not an FK to workout_plan_blocks. The block may be
  -- regrouped or deleted tomorrow; how the session was PERFORMED is fixed.
  block_kind    TEXT NOT NULL DEFAULT 'single'
                CHECK (block_kind IN ('single', 'superset', 'circuit', 'emom', 'amrap')),
  block_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (typeof(block_ordinal) = 'integer' AND block_ordinal >= 0),
  position      INTEGER NOT NULL DEFAULT 0 CHECK (typeof(position) = 'integer' AND position >= 0),
  target_metric TEXT NOT NULL DEFAULT 'reps' CHECK (target_metric IN ('reps', 'time', 'distance')),
  load_mode TEXT NOT NULL DEFAULT 'external'
            CHECK (load_mode IN ('external', 'bodyweight', 'weighted_bodyweight', 'assisted')),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS workout_log_exercises_log_idx ON workout_log_exercises (log_id, block_ordinal, position, id);
CREATE INDEX IF NOT EXISTS workout_log_exercises_hist_idx ON workout_log_exercises (client_user_id, exercise_id, id DESC);

CREATE TRIGGER IF NOT EXISTS trg_log_exercise_parent_ins
BEFORE INSERT ON workout_log_exercises FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM workout_logs l WHERE l.id = NEW.log_id AND l.client_user_id = NEW.client_user_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_log_exercises.client_user_id must be the owning session client');
END;

-- THE UPDATE TWIN, which three of the six reviews found missing on somebody's log tree. Without it
-- the denormalised owner is a guarantee only at birth: `UPDATE workout_log_exercises SET log_id = ?`
-- re-parents a row into another user's session while client_user_id still names the original owner,
-- and every `WHERE client_user_id = ?` guard downstream then reads a row belonging to someone else.
-- A guarantee with an UPDATE-shaped hole is not a guarantee.
CREATE TRIGGER IF NOT EXISTS trg_log_exercise_parent_upd
BEFORE UPDATE OF log_id, client_user_id ON workout_log_exercises FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM workout_logs l WHERE l.id = NEW.log_id AND l.client_user_id = NEW.client_user_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_log_exercises.client_user_id must be the owning session client');
END;

-- Which exercise a logged session was, is a historical fact. Only the FK's ON DELETE SET NULL may
-- change it; swapping it for another id would move a whole session's sets onto a different
-- exercise's progress graph and record book.
CREATE TRIGGER IF NOT EXISTS trg_log_exercise_identity
BEFORE UPDATE OF exercise_id, plan_exercise_id, origin ON workout_log_exercises FOR EACH ROW
WHEN (NEW.exercise_id IS NOT OLD.exercise_id AND NEW.exercise_id IS NOT NULL)
  OR (NEW.plan_exercise_id IS NOT OLD.plan_exercise_id AND NEW.plan_exercise_id IS NOT NULL)
  OR NEW.origin IS NOT OLD.origin
BEGIN
  SELECT RAISE(ABORT, 'the exercise identity of a logged session is fixed at materialisation');
END;

-- THE CLIENT HALF OF EXERCISE VISIBILITY, and the fix for a genuinely nasty hole.
--
-- exercises/routes.js:26 defines VISIBLE as `(e.deleted_at IS NULL AND (e.status = 'global' OR
-- e.owner_id = ?))` with `?` always req.user.id. So a coach's PRIVATE exercise placed in a client's
-- plan is invisible to the very client meant to perform it, and the plan 404s. Every design spotted
-- that much. The trap is the obvious fix: two designs granted read access to "any exercise I have
-- personally performed" — but the client is the party who WRITES the row that constitutes proof of
-- performance. An ordinary user with no coach can POST one freestyle log exercise per exercise_id
-- from 1 to 1652 and then read every coach's private library, every pending_review submission and
-- every rejection_reason — a self-service ACL over exactly what exercises/routes.js:22-25 protects.
--
-- This closes it at the source: a log exercise may only reference something the client could already
-- read. Access follows the PRESCRIPTION through a LIVE link, never the act of logging, so it cannot
-- bootstrap itself and it evaporates when the coach archives the client. History still renders from
-- exercise_name_snapshot, which is why the snapshot is NOT NULL. There is deliberately NO "anything
-- I once performed" branch in the read predicate either: that would be an unrevokable grant on a
-- departed coach's library with no admin path to take it back.
CREATE TRIGGER IF NOT EXISTS trg_log_exercise_visible_ins
BEFORE INSERT ON workout_log_exercises FOR EACH ROW
WHEN NEW.exercise_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM exercises e
    WHERE e.id = NEW.exercise_id
      AND e.deleted_at IS NULL
      AND (e.status = 'global'
        OR e.owner_id IS NULL
        OR e.owner_id = NEW.client_user_id
        OR EXISTS (SELECT 1 FROM workout_plan_exercises px
                     JOIN workout_plans p ON p.id = px.plan_id
                     LEFT JOIN coach_clients cc ON cc.id = p.coach_client_id
                    WHERE px.exercise_id = NEW.exercise_id
                      AND p.client_user_id = NEW.client_user_id
                      AND (p.coach_client_id IS NULL OR cc.status = 'active'))))
BEGIN
  SELECT RAISE(ABORT, 'this exercise is not readable by this client');
END;


-- ═══ THE HOT TABLE ═════════════════════════════════════════════════════════════════════════════
--
-- Rows are materialised as 'pending' by startWorkoutTx, each carrying a full snapshot of its own
-- prescription. Everything follows from that: the player, the rest timer and the offline queue need
-- nothing from the plan, checking a set is a guarded UPDATE, and a coach editing the plan mid-session
-- cannot change the workout under the client's thumb.
CREATE TABLE IF NOT EXISTS workout_log_sets (
  id INTEGER PRIMARY KEY,
  log_exercise_id INTEGER NOT NULL REFERENCES workout_log_exercises(id) ON DELETE CASCADE,

  -- log_id / client_user_id / exercise_id / local_date are denormalised from the parents and made
  -- unforgeable by trg_log_set_parent_ins and trg_log_set_server_columns. Two reasons, both
  -- load-bearing: (1) ANTI-IDOR — the guard inside every UPDATE is `WHERE id = ? AND
  -- client_user_id = ?`, one table, no join; (2) ANALYTICS — every progress, previous-performance
  -- and record query is keyed (client_user_id, exercise_id, local_date), and without the copies each
  -- is a three-table join over the largest table in the database.
  --
  -- The UPDATE twin is not optional. A `log_id` accepted from the request body and never re-checked
  -- lets an attacker point their own set row at a victim's session, whose recompute-by-aggregate
  -- then sums the attacker's row into the victim's total_volume_kg — a cross-tenant write invisible
  -- in the victim's own set list, because the row hangs off the attacker's exercise.
  log_id         INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id    INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
  local_date     TEXT NOT NULL CHECK (local_date = date(local_date)),

  plan_set_target_id INTEGER REFERENCES workout_plan_set_targets(id) ON DELETE SET NULL,
  set_index INTEGER NOT NULL CHECK (typeof(set_index) = 'integer' AND set_index BETWEEN 1 AND 50),
  set_kind TEXT NOT NULL DEFAULT 'straight'
           CHECK (set_kind IN ('straight', 'warmup', 'drop', 'backoff', 'amrap', 'failure')),

  -- ── the PRESCRIPTION, frozen here at materialisation ────────────────────────────────────────
  -- The order-line price-snapshot pattern, and what lets plans stay mutable documents: "did the
  -- client hit the target?" is answerable forever from the log alone, even after the coach rewrote
  -- the plan the next morning or deleted it the next month. Frozen against ALL updates by
  -- trg_log_set_server_columns, because a client-settable target lets them fabricate what their
  -- coach appears to have prescribed — in the very log the coach reads during a dispute.
  target_reps       INTEGER CHECK (target_reps       IS NULL OR (typeof(target_reps) = 'integer' AND target_reps BETWEEN 0 AND 1000)),
  target_seconds    INTEGER CHECK (target_seconds    IS NULL OR (typeof(target_seconds) = 'integer' AND target_seconds BETWEEN 1 AND 7200)),
  target_distance_m INTEGER CHECK (target_distance_m IS NULL OR (typeof(target_distance_m) = 'integer' AND target_distance_m BETWEEN 1 AND 200000)),
  target_weight_kg  REAL    CHECK (target_weight_kg IS NULL OR (target_weight_kg >= 0 AND target_weight_kg <= 1000)),
  target_rpe REAL CHECK (target_rpe IS NULL OR target_rpe IN
    (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10)),
  target_rest_seconds INTEGER CHECK (target_rest_seconds IS NULL OR target_rest_seconds BETWEEN 0 AND 3600),

  -- ── what the client OBSERVED ───────────────────────────────────────────────────────────────
  -- Raw observations are the ONE thing that legitimately comes from the client. Everything derived
  -- from them is computed below, by the database.
  --
  -- The bounds are history integrity, not politeness: one 999999 kg set poisons every chart and
  -- every record for that exercise permanently. And `typeof(reps) = 'integer'` is not paranoia —
  -- INTEGER is an AFFINITY, not a type, so without it a payload of `reps: 1.0001` stores as a REAL,
  -- dodges every `reps = 1` special case, and mints an infinite series of private rep-buckets in
  -- which every set is automatically a record.
  weight_kg REAL CHECK (weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 1000)),
  entry_unit  TEXT CHECK (entry_unit IS NULL OR entry_unit IN ('kg', 'lb')),
  entry_value REAL CHECK (entry_value IS NULL OR (entry_value >= 0 AND entry_value <= 2500)),
  reps       INTEGER CHECK (reps       IS NULL OR (typeof(reps) = 'integer' AND reps BETWEEN 0 AND 1000)),
  seconds    INTEGER CHECK (seconds    IS NULL OR (typeof(seconds) = 'integer' AND seconds BETWEEN 0 AND 7200)),
  distance_m INTEGER CHECK (distance_m IS NULL OR (typeof(distance_m) = 'integer' AND distance_m BETWEEN 0 AND 200000)),
  rpe REAL CHECK (rpe IS NULL OR rpe IN
    (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10)),
  -- Rest as the player measured it. Distinct from completed_at deltas, which also contain racking,
  -- talking and phone-checking; density analytics needs the real number.
  rest_taken_seconds INTEGER CHECK (rest_taken_seconds IS NULL OR rest_taken_seconds BETWEEN 0 AND 3600),

  -- ── SERVER-OWNED context that makes the derived columns computable ──────────────────────────
  -- Copied down from the log and the log exercise at materialisation, then frozen. bodyweight_kg is
  -- denormalised here for one specific reason: a generated column may not contain a subquery, so
  -- bodyweight-inclusive volume is only expressible as arithmetic if the bodyweight is on the row.
  load_mode TEXT NOT NULL DEFAULT 'external'
            CHECK (load_mode IN ('external', 'bodyweight', 'weighted_bodyweight', 'assisted')),
  bodyweight_kg REAL CHECK (bodyweight_kg IS NULL OR bodyweight_kg BETWEEN 25 AND 400),

  -- ── DERIVED, and unforgeable by construction ────────────────────────────────────────────────
  -- A GENERATED column has no INSERT or UPDATE surface at all, so there is no code path — forged
  -- through a proxy, refactored, or written in a hurry — that can put a client-supplied volume or
  -- 1RM into this database. Strictly stronger than a convention, and the repo's own history
  -- (ADR-0005) is a story about exactly the kind of forgetting a convention permits.
  --
  -- effective_load_kg is what makes bodyweight training real: push-ups and pull-ups produce genuine
  -- volume and genuine records instead of a permanent zero, and an assisted pull-up subtracts its
  -- counterweight instead of reporting the counterweight as the lift.
  effective_load_kg REAL GENERATED ALWAYS AS (
    CASE load_mode
      WHEN 'external'            THEN weight_kg
      WHEN 'bodyweight'          THEN bodyweight_kg
      WHEN 'weighted_bodyweight' THEN CASE WHEN bodyweight_kg IS NULL THEN NULL
                                           ELSE bodyweight_kg + COALESCE(weight_kg, 0) END
      WHEN 'assisted'            THEN CASE WHEN bodyweight_kg IS NULL THEN NULL
                                           ELSE max(bodyweight_kg - COALESCE(weight_kg, 0), 0) END
    END
  ) STORED,

  -- Tonnage is a DEFINITION — load x reps, no competing version — so the engine computes it and it
  -- can neither drift nor be forged.
  volume_kg REAL GENERATED ALWAYS AS (
    CASE WHEN effective_load_kg IS NOT NULL AND reps IS NOT NULL AND reps > 0
         THEN effective_load_kg * reps END
  ) STORED,

  -- THE COMPARISON 1RM, and the resolution of a trap two candidate designs walked into.
  --
  -- A 1RM estimate is a MODEL, not a definition: Epley, Brzycki and Lombardi disagree by up to 3% in
  -- one direction at 5 reps and the OTHER direction at 12. Storing "the current formula" and
  -- comparing with `ORDER BY est_1rm DESC` means that on the day the formula changes every user
  -- silently stops earning records until they out-lift the formula gap, while high-rep lifters get a
  -- wave of unearned badges — with no repair possible short of voiding real training data.
  --
  -- So this is not "the 1RM". It is the CANONICAL COMPARISON SCALE: Epley over effective load,
  -- pinned forever, defined by the schema, generated and therefore unforgeable and unchanging. Every
  -- record comparison and every index uses it and nothing else. The 1RM the product DISPLAYS is
  -- computed in JS at read time, may change whenever the product wants, and is stored nowhere — so a
  -- formula change is a rendering change that can never reshape an 18-month chart.
  --
  -- NULL outside 1..12 reps because Epley diverges badly past ~12 and a 30-rep set would otherwise
  -- manufacture a strength record out of endurance work. It doubles as a planner win: the record
  -- query then says only `e1rm_canonical_kg IS NOT NULL` and this index wins cleanly, where a
  -- repeated reps range makes the planner prefer repmax_idx and add a TEMP B-TREE sort. At exactly
  -- 1 rep the value is the load itself — naive Epley inflates every single by 3.33% and hands out a
  -- record for repeating a lift.
  e1rm_canonical_kg REAL GENERATED ALWAYS AS (
    CASE WHEN effective_load_kg > 0 AND reps IS NOT NULL AND reps BETWEEN 1 AND 12
         THEN CASE WHEN reps = 1 THEN effective_load_kg
                   ELSE effective_load_kg * (1.0 + reps / 30.0) END END
  ) STORED,

  completed_at INTEGER,
  -- ── the IDEMPOTENCY TOKEN ───────────────────────────────────────────────────────────────────
  -- Minted per set-check ATTEMPT by the player and reused verbatim on every retry of that attempt.
  -- It is REQUEST IDENTITY, which is what the candidate designs kept getting wrong: keying
  -- idempotency on row STATE ("is completed_at already set?") makes "the same request twice" and "a
  -- corrected value for the same set" indistinguishable, so an offline queue flushing a 100 kg typo
  -- and its 10 kg correction lands whichever the network delivered last and answers 200 either way.
  -- Here the first write stamps its uid; a true replay carries the same uid and is reported as a
  -- replay; a different payload against a completed set matches nothing and is answered 409 with the
  -- stored row, so a correction becomes an explicit void-and-relog rather than a silent overwrite
  -- the user never learns about.
  write_uid TEXT CHECK (write_uid IS NULL OR length(write_uid) BETWEEN 8 AND 64),

  -- CORRECTIONS ARE APPENDS. Nothing in the log path deletes and nothing edits: `voided_at` is the
  -- tombstone every analytics index filters out, and `corrects_set_id` links a replacement to what
  -- it replaced. That is what keeps the record book from outliving its evidence.
  voided_at INTEGER,
  voided_reason TEXT CHECK (voided_reason IS NULL OR length(voided_reason) <= 200),
  corrects_set_id INTEGER REFERENCES workout_log_sets(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- THE DOUBLE-CONVERSION GUARD. It creeps in at exactly two places: a client that converts lb->kg
  -- before POSTing, and a server that converts again. Both entry columns are required whenever a
  -- load is present, so the guard cannot be disabled by omitting a field — which is how the same
  -- CHECK in an earlier draft was defeated by a one-line payload.
  CHECK ((entry_unit IS NULL) = (entry_value IS NULL)),
  CHECK (weight_kg IS NULL OR entry_value IS NOT NULL),
  CHECK (entry_value IS NULL OR weight_kg IS NOT NULL),
  CHECK (entry_value IS NULL
      OR (entry_unit = 'kg' AND abs(weight_kg - entry_value) < 0.02)
      OR (entry_unit = 'lb' AND abs(weight_kg - entry_value * 0.45359237) < 0.02)),
  -- A checked set that recorded nothing is a UI bug reaching storage.
  CHECK (completed_at IS NULL OR reps IS NOT NULL OR seconds IS NOT NULL OR distance_m IS NOT NULL),
  CHECK (completed_at IS NOT NULL OR write_uid IS NULL),
  CHECK (voided_at IS NULL OR voided_reason IS NOT NULL),
  CHECK (load_mode <> 'bodyweight' OR weight_kg IS NULL)
);

-- The player's grid, and the natural key that makes "previous performance for set 3" unambiguous.
-- UNIQUE because set_index is semantic, not an ordering column.
CREATE UNIQUE INDEX IF NOT EXISTS workout_log_sets_slot_unique ON workout_log_sets (log_exercise_id, set_index);
CREATE INDEX IF NOT EXISTS workout_log_sets_log_idx ON workout_log_sets (log_id, voided_at, set_kind);

-- THE ANALYTICS INDEX. Covering: the months-long progress graph and the player's PREVIOUS column
-- both read entirely from the index and never touch the table. Partial, so voided sets and warm-ups
-- are not merely filtered — they are not in the B-tree at all, and a query that forgets a term
-- cannot accidentally include them.
CREATE INDEX IF NOT EXISTS workout_log_sets_progress_idx
  ON workout_log_sets (client_user_id, exercise_id, local_date DESC, id DESC,
                       weight_kg, reps, effective_load_kg, volume_kg, e1rm_canonical_kg,
                       -- Without these two a duration or distance chart drops off the index into a
                       -- table lookup per row, for exactly the clients whose whole history is
                       -- duration and distance.
                       seconds, distance_m)
  WHERE voided_at IS NULL AND completed_at IS NOT NULL AND set_kind <> 'warmup';

-- "Heaviest ever at exactly 5 reps" — one seek to the head of the DESC run.
CREATE INDEX IF NOT EXISTS workout_log_sets_repmax_idx
  ON workout_log_sets (client_user_id, exercise_id, reps, effective_load_kg DESC)
  WHERE voided_at IS NULL AND completed_at IS NOT NULL AND set_kind <> 'warmup';

-- The canonical-1RM record seek. The predicate is `e1rm_canonical_kg IS NOT NULL` rather than a reps
-- range ON PURPOSE — see the column comment.
CREATE INDEX IF NOT EXISTS workout_log_sets_e1rm_idx
  ON workout_log_sets (client_user_id, exercise_id, e1rm_canonical_kg DESC)
  WHERE voided_at IS NULL AND completed_at IS NOT NULL AND set_kind <> 'warmup'
    AND e1rm_canonical_kg IS NOT NULL;

-- Serves the client-side visibility EXISTS and "has anyone ever logged this exercise", which the
-- moderation queue needs before it soft-deletes one. Non-partial deliberately: the partial index
-- above cannot serve a query that does not repeat its predicate, and SQLite will not infer that.
CREATE INDEX IF NOT EXISTS workout_log_sets_exercise_idx ON workout_log_sets (exercise_id, client_user_id) WHERE exercise_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_log_set_parent_ins
BEFORE INSERT ON workout_log_sets FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM workout_log_exercises x JOIN workout_logs l ON l.id = x.log_id
   WHERE x.id = NEW.log_exercise_id
     AND x.log_id IS NEW.log_id
     AND x.client_user_id IS NEW.client_user_id
     AND x.exercise_id IS NEW.exercise_id
     AND l.local_date IS NEW.local_date)
BEGIN
  SELECT RAISE(ABORT, 'workout_log_sets: log_id/client_user_id/exercise_id/local_date must match the parent');
END;

-- The UPDATE twin covers re-parenting only — log_exercise_id, log_id, client_user_id — and
-- deliberately does NOT list exercise_id or local_date, even though the INSERT check verifies both.
--
-- Same FK-action trap as on workout_logs, and the second place found only by running `DELETE FROM
-- users` against a populated database. `exercise_id` is ON DELETE SET NULL on this table AND on its
-- parent, so deleting an exercise nulls both — but the two UPDATEs happen one at a time, and in the
-- intermediate state the child says NULL while the parent still says 11. A trigger checking equality
-- here would abort that, hence the cascade, hence make the exercise (and the account that owns it)
-- undeletable. exercise_id is instead guarded by trg_log_set_server_columns, which permits the
-- transition to NULL and nothing else.
CREATE TRIGGER IF NOT EXISTS trg_log_set_parent_upd
BEFORE UPDATE OF log_exercise_id, log_id, client_user_id ON workout_log_sets FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM workout_log_exercises x
   WHERE x.id = NEW.log_exercise_id
     AND x.log_id IS NEW.log_id
     AND x.client_user_id IS NEW.client_user_id)
BEGIN
  SELECT RAISE(ABORT, 'workout_log_sets: log_id/client_user_id must match the parent log exercise');
END;

-- SERVER-OWNED COLUMNS, frozen from birth in every state. Written once by startWorkoutTx (or the
-- append-a-set transaction) and never a legitimate target of a later write. Freezing them here
-- rather than trusting a route allow-list means a route that spreads req.body — the mistake
-- onboarding/routes.js:83-91 exists to warn about — fails loudly instead of quietly handing the
-- client control of their own prescription, bodyweight snapshot, analytics bucket, or the load_mode
-- that determines their volume.
-- THE CLONE-SOURCE OWNERSHIP GUARD.
--
-- `source_plan_id` is provenance for a previewable re-clone, which means it is READ later — and a
-- bare client-supplied FK into this same table is a cross-tenant read waiting to happen. The
-- adversarial review executed it: one coach inserted a template citing another coach's plan as its
-- source, and nothing objected.
--
-- INSERT ... VALUES admits no WHERE clause, so the predicate lives here. A source must be a plan
-- the author can already see: their own, or a template they authored. Admins are not exempted —
-- an admin has no reason to clone through this path, and an exemption is a hole someone will find.
CREATE TRIGGER IF NOT EXISTS trg_plan_source_owned_ins
BEFORE INSERT ON workout_plans FOR EACH ROW
WHEN NEW.source_plan_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM workout_plans src
     WHERE src.id = NEW.source_plan_id
       AND src.author_user_id = NEW.author_user_id
  )
BEGIN
  SELECT RAISE(ABORT, 'workout_plans: source_plan_id must be a plan you authored');
END;

-- The UPDATE half. A guard that only fires on INSERT is a guard that is bypassed by writing NULL
-- and then setting the value — which is exactly how every INSERT-only trigger in the designs this
-- schema was distilled from turned out to be defeatable.
CREATE TRIGGER IF NOT EXISTS trg_plan_source_owned_upd
BEFORE UPDATE OF source_plan_id ON workout_plans FOR EACH ROW
WHEN NEW.source_plan_id IS NOT NULL
  AND NEW.source_plan_id IS NOT OLD.source_plan_id
  AND NOT EXISTS (
    SELECT 1 FROM workout_plans src
     WHERE src.id = NEW.source_plan_id
       AND src.author_user_id = NEW.author_user_id
  )
BEGIN
  SELECT RAISE(ABORT, 'workout_plans: source_plan_id must be a plan you authored');
END;

CREATE TRIGGER IF NOT EXISTS trg_log_set_server_columns
BEFORE UPDATE ON workout_log_sets FOR EACH ROW
WHEN NEW.set_index          IS NOT OLD.set_index
  OR NEW.local_date         IS NOT OLD.local_date
  -- Transition to NULL is the FK's ON DELETE SET NULL and must be allowed; anything else is an
  -- attempt to move a logged set onto a different exercise, silently rewriting one exercise's
  -- progress graph and record book with another's numbers.
  OR (NEW.exercise_id IS NOT OLD.exercise_id AND NEW.exercise_id IS NOT NULL)
  -- Same carve-out as exercise_id above, and for the same reason: this column is
  -- ON DELETE SET NULL, and an FK action reaches a BEFORE UPDATE trigger like any other write.
  -- Without `IS NOT NULL`, deleting the plan row a set was materialised from aborts — which is
  -- the plan editor's most ordinary operation, and a coach's account erasure.
  OR (NEW.plan_set_target_id IS NOT OLD.plan_set_target_id AND NEW.plan_set_target_id IS NOT NULL)
  OR NEW.target_reps        IS NOT OLD.target_reps
  OR NEW.target_seconds     IS NOT OLD.target_seconds
  OR NEW.target_distance_m  IS NOT OLD.target_distance_m
  OR NEW.target_weight_kg   IS NOT OLD.target_weight_kg
  OR NEW.target_rpe         IS NOT OLD.target_rpe
  OR NEW.target_rest_seconds IS NOT OLD.target_rest_seconds
  OR NEW.load_mode          IS NOT OLD.load_mode
  OR NEW.bodyweight_kg      IS NOT OLD.bodyweight_kg
  OR NEW.created_at         IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'workout_log_sets: the prescription snapshot and load context are server-owned');
END;

-- THE SINGLE MOST IMPORTANT TRIGGER IN THIS SCHEMA. Once a set is checked its MEASUREMENTS are
-- frozen by the database: no route, no repair script and no console session can rewrite what
-- happened. Un-checking is included deliberately — the undo button calls voidSetTx, which leaves a
-- tombstone and invalidates the record the set earned rather than erasing the evidence that a badge
-- was ever shown. This is what makes the record and (later) reward story airtight: the only two
-- states are "this happened" and "this happened and was later voided, for this reason".
CREATE TRIGGER IF NOT EXISTS trg_log_set_frozen
BEFORE UPDATE ON workout_log_sets FOR EACH ROW
WHEN OLD.completed_at IS NOT NULL
 AND (NEW.weight_kg    IS NOT OLD.weight_kg
   OR NEW.entry_unit   IS NOT OLD.entry_unit
   OR NEW.entry_value  IS NOT OLD.entry_value
   OR NEW.reps         IS NOT OLD.reps
   OR NEW.seconds      IS NOT OLD.seconds
   OR NEW.distance_m   IS NOT OLD.distance_m
   OR NEW.rpe          IS NOT OLD.rpe
   OR NEW.set_kind     IS NOT OLD.set_kind
   OR NEW.completed_at IS NOT OLD.completed_at
   OR NEW.write_uid    IS NOT OLD.write_uid)
BEGIN
  SELECT RAISE(ABORT, 'a completed set is immutable: void it and log a correction instead');
END;

-- A void is terminal. Without this, `SET voided_at = NULL` resurrects the set into all three
-- analytics indexes while the record it earned still carries `invalidated_at` — a permanent
-- divergence between the graph and the records screen, with a stale voided_reason still attached.
CREATE TRIGGER IF NOT EXISTS trg_log_set_void_terminal
BEFORE UPDATE OF voided_at ON workout_log_sets FOR EACH ROW
-- Keyed on STATE, not on whether the two timestamps happen to differ. The original compared
-- values, so re-voiding within the same second slipped through and rewrote voided_reason, while
-- the identical statement a second later aborted.
WHEN OLD.voided_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'a void is terminal: a voided set cannot be un-voided or re-voided');
END;

-- THE SESSION ROLLUPS, MAINTAINED BY THE DATABASE. Every candidate design stored these and then
-- admitted in its own weaknesses section that they "cannot drift as long as every transaction that
-- touches a completed session's sets remembers to recompute" — three transactions today and a fourth
-- written next year by someone who did not read this file. These remove the discipline requirement:
-- the aggregate is rewritten from the set rows themselves on every insert, update and delete.
--
-- Safe from recursion because `PRAGMA recursive_triggers` is OFF, and cheap because the aggregate is
-- one range scan of workout_log_sets_log_idx over the ~25 rows of a single session — a bound the
-- plan-size caps above are what actually guarantee.
--
-- `set_kind <> 'warmup'` splits total_working_sets from total_sets because those are two different
-- questions and only one — working sets per week — is the number a strength coach manages. Counting
-- warm-ups into it inflates a session by 30-40% and makes two clients incomparable purely because
-- their coaches prescribe warm-ups differently.
CREATE TRIGGER IF NOT EXISTS trg_log_rollup_recompute_ins
AFTER INSERT ON workout_log_sets FOR EACH ROW
BEGIN
  UPDATE workout_logs SET
    total_sets         = (SELECT COUNT(*)                     FROM workout_log_sets s WHERE s.log_id = NEW.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL),
    total_working_sets = (SELECT COUNT(*)                     FROM workout_log_sets s WHERE s.log_id = NEW.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL AND s.set_kind <> 'warmup'),
    total_reps         = (SELECT COALESCE(SUM(s.reps), 0)     FROM workout_log_sets s WHERE s.log_id = NEW.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL),
    total_volume_kg    = (SELECT COALESCE(SUM(s.volume_kg),0) FROM workout_log_sets s WHERE s.log_id = NEW.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL AND s.set_kind <> 'warmup'),
    total_work_seconds = (SELECT COALESCE(SUM(s.seconds), 0)  FROM workout_log_sets s WHERE s.log_id = NEW.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL),
    rollup_at = unixepoch(), last_activity_at = unixepoch(), updated_at = unixepoch()
  WHERE id = NEW.log_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_log_rollup_recompute_upd
AFTER UPDATE ON workout_log_sets FOR EACH ROW
BEGIN
  UPDATE workout_logs SET
    total_sets         = (SELECT COUNT(*)                     FROM workout_log_sets s WHERE s.log_id = NEW.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL),
    total_working_sets = (SELECT COUNT(*)                     FROM workout_log_sets s WHERE s.log_id = NEW.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL AND s.set_kind <> 'warmup'),
    total_reps         = (SELECT COALESCE(SUM(s.reps), 0)     FROM workout_log_sets s WHERE s.log_id = NEW.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL),
    total_volume_kg    = (SELECT COALESCE(SUM(s.volume_kg),0) FROM workout_log_sets s WHERE s.log_id = NEW.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL AND s.set_kind <> 'warmup'),
    total_work_seconds = (SELECT COALESCE(SUM(s.seconds), 0)  FROM workout_log_sets s WHERE s.log_id = NEW.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL),
    rollup_at = unixepoch(), last_activity_at = unixepoch(), updated_at = unixepoch()
  WHERE id = NEW.log_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_log_rollup_recompute_del
AFTER DELETE ON workout_log_sets FOR EACH ROW
BEGIN
  UPDATE workout_logs SET
    total_sets         = (SELECT COUNT(*)                     FROM workout_log_sets s WHERE s.log_id = OLD.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL),
    total_working_sets = (SELECT COUNT(*)                     FROM workout_log_sets s WHERE s.log_id = OLD.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL AND s.set_kind <> 'warmup'),
    total_reps         = (SELECT COALESCE(SUM(s.reps), 0)     FROM workout_log_sets s WHERE s.log_id = OLD.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL),
    total_volume_kg    = (SELECT COALESCE(SUM(s.volume_kg),0) FROM workout_log_sets s WHERE s.log_id = OLD.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL AND s.set_kind <> 'warmup'),
    total_work_seconds = (SELECT COALESCE(SUM(s.seconds), 0)  FROM workout_log_sets s WHERE s.log_id = OLD.log_id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL),
    rollup_at = unixepoch(), updated_at = unixepoch()
  WHERE id = OLD.log_id;
END;

-- AND THE ROLLUPS MAY NOT LIE. The guard that makes a stored aggregate acceptable at all: it does
-- not care who is writing or why, it only refuses a value that is not the truth. A route that
-- spreads req.body cannot forge a tonnage, a repair script cannot fat-finger one, and the recompute
-- triggers above pass trivially because they write exactly this expression. It fires only when a
-- rollup column is named in the UPDATE, so the ordinary set-check path pays nothing for it.
CREATE TRIGGER IF NOT EXISTS trg_log_rollup_truthful
BEFORE UPDATE OF total_sets, total_working_sets, total_reps, total_volume_kg, total_work_seconds
ON workout_logs FOR EACH ROW
WHEN NEW.total_sets         IS NOT (SELECT COUNT(*)                     FROM workout_log_sets s WHERE s.log_id = NEW.id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL)
  OR NEW.total_working_sets IS NOT (SELECT COUNT(*)                     FROM workout_log_sets s WHERE s.log_id = NEW.id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL AND s.set_kind <> 'warmup')
  OR NEW.total_reps         IS NOT (SELECT COALESCE(SUM(s.reps), 0)     FROM workout_log_sets s WHERE s.log_id = NEW.id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL)
  OR NEW.total_volume_kg    IS NOT (SELECT COALESCE(SUM(s.volume_kg),0) FROM workout_log_sets s WHERE s.log_id = NEW.id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL AND s.set_kind <> 'warmup')
  OR NEW.total_work_seconds IS NOT (SELECT COALESCE(SUM(s.seconds), 0)  FROM workout_log_sets s WHERE s.log_id = NEW.id AND s.voided_at IS NULL AND s.completed_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'workout_logs rollups are derived: they may only be set to the true aggregate');
END;


-- ═══ PERSONAL RECORDS ══════════════════════════════════════════════════════════════════════════

-- PR EVENTS, NOT CURRENT BESTS — and there is deliberately no current-bests table anywhere.
--
-- "What is my best" is derivable: one descent of workout_log_sets_e1rm_idx. A cache would be a
-- second source of truth needing invalidation on every void and every correction, and the recompute
-- after a void is a full history scan anyway — so it buys nothing on the expensive path and adds
-- drift risk on the cheap one. Every candidate design that kept one had the same bug: the hot write
-- path read the cache without checking its own staleness flag, so a corrected set left a record no
-- surviving set supported and the next genuine record was silently never awarded.
--
-- What is NOT derivable is that a gold badge was SHOWN on 3 March and — once the Phase 7 coin
-- economy exists — that something was paid for it. That is what this stores, append-only with an
-- `invalidated_at` tombstone rather than a row that gets rewritten. A withdrawal is itself history;
-- the audit_log triggers (001) exist for the same reason.
CREATE TABLE IF NOT EXISTS workout_pr_events (
  id INTEGER PRIMARY KEY,
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SET NULL + snapshot, mirroring the log tables exactly. An earlier draft used CASCADE here while
  -- protecting the logs with SET NULL, so a departing coach's account deletion left every client's
  -- log intact and silently deleted their records on those movements, unrebuildable.
  exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
  exercise_name_snapshot TEXT NOT NULL CHECK (length(trim(exercise_name_snapshot)) BETWEEN 1 AND 200),
  source_set_id INTEGER REFERENCES workout_log_sets(id) ON DELETE SET NULL,
  log_id INTEGER REFERENCES workout_logs(id) ON DELETE SET NULL,

  --   'e1rm'           THE primary badge. The only measure monotone in BOTH load and reps, so it is
  --                    comparable across a 5x5 day and a 3x3 day and cannot be gamed by dropping
  --                    reps. Always the CANONICAL scale — see workout_log_sets.e1rm_canonical_kg.
  --   'rep_max'        the secondary badge, bucketed by rep count, because lifters do not trust
  --                    formulas and want "100 kg for 5, for the first time".
  --   'session_volume' best single-session tonnage for one exercise; written by the completion
  --                    transaction, not per set. What a hypertrophy client actually cares about.
  -- Rejected: "heaviest ever, any reps" (1x100 would beat 10x95, which is not progress) and "reps at
  -- a given weight" (redundant with rep_max and a fourth thing to invalidate on every void).
  --   'max_hold'       longest hold in SECONDS. More is better. A calisthenics or rehab client
  --                    earns records here and nowhere else.
  --   'max_distance'   furthest in METRES for a prescribed time. More is better.
  --   'best_time'      fastest in SECONDS over a prescribed distance. LESS is better — the only
  --                    kind that inverts, which is why direction is a stored column and not
  --                    something each comparison site re-derives.
  kind TEXT NOT NULL CHECK (kind IN (
    'e1rm', 'rep_max', 'session_volume', 'max_hold', 'max_distance', 'best_time'
  )),
  -- Which way "better" points, written at insert and never inferred. A ratchet that reads the
  -- direction off the row cannot be written backwards by a caller that forgot which kind it had.
  -- The CHECK below ties it to the kind, so it cannot disagree with the thing it describes.
  higher_is_better INTEGER NOT NULL DEFAULT 1 CHECK (higher_is_better IN (0, 1)),
  -- The unit `value` is expressed in, so a chart never has to guess. kg for load kinds, seconds
  -- for durations, metres for distances.
  value_unit TEXT NOT NULL DEFAULT 'kg' CHECK (value_unit IN ('kg', 'seconds', 'metres')),
  -- 1..12 exact, 13+ collapses to 13, 0 = not applicable. NOT NULL with a 0 sentinel rather than
  -- nullable, because SQLite treats NULLs as DISTINCT in a unique index — a nullable rep_bucket
  -- would silently let two 'e1rm' rows coexist for one set and the backstop below would not exist
  -- while appearing to.
  rep_bucket INTEGER NOT NULL DEFAULT 0
             CHECK (typeof(rep_bucket) = 'integer' AND rep_bucket BETWEEN 0 AND 13),
  value REAL NOT NULL CHECK (value > 0),
  -- The value that was beaten, captured at the moment of beating: not drift-prone (both operands
  -- were already immutable) and it renders "+2.5 kg on your 5RM" with no second query.
  previous_value REAL CHECK (previous_value IS NULL OR previous_value > 0),
  local_date TEXT NOT NULL CHECK (local_date = date(local_date)),
  achieved_at INTEGER NOT NULL DEFAULT (unixepoch()),

  invalidated_at INTEGER,
  invalidated_reason TEXT CHECK (invalidated_reason IS NULL OR length(invalidated_reason) <= 200),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  CHECK (kind <> 'rep_max' OR rep_bucket > 0),
  CHECK (kind <> 'e1rm' OR rep_bucket = 0),
  CHECK (kind <> 'session_volume' OR (rep_bucket = 0 AND source_set_id IS NULL)),
  -- Time and distance records are per-SET achievements like e1rm, not per-session aggregates.
  CHECK (kind NOT IN ('max_hold', 'max_distance', 'best_time') OR rep_bucket = 0),
  -- Direction and unit are determined BY the kind. Storing them is about making the comparison
  -- site simple; letting them disagree with the kind would make it wrong.
  CHECK (higher_is_better = CASE WHEN kind = 'best_time' THEN 0 ELSE 1 END),
  CHECK (value_unit = CASE kind
                        WHEN 'max_hold'     THEN 'seconds'
                        WHEN 'best_time'    THEN 'seconds'
                        WHEN 'max_distance' THEN 'metres'
                        ELSE 'kg'
                      END),
  -- NOTE what is deliberately NOT a CHECK: "a session_volume record must have a log_id". It is true
  -- at insert and enforced by trg_pr_event_session_shape, but as a CHECK it collides head-on with
  -- `log_id ... ON DELETE SET NULL` — deleting a single workout session would put the row in
  -- violation of its own constraint and abort the delete, so a user who trained one session that set
  -- a volume record could never delete that session. Be suspicious of every CHECK that mentions a
  -- column some FK action can null out from underneath it.
  CHECK (previous_value IS NULL OR value > previous_value),
  CHECK (invalidated_at IS NULL OR invalidated_reason IS NOT NULL)
);

-- BACKSTOP 1 — THE REPLAY GUARANTEE. At most one live record event per (set, kind, bucket). Even if
-- every guard in the transaction were defeated, a second event for the same set cannot exist. Since
-- a coin is granted against a workout_pr_events ROW, the same index that stops a double record stops
-- a double award: one constraint, both requirements, and no reward column invented here.
CREATE UNIQUE INDEX IF NOT EXISTS workout_pr_events_source_unique
  ON workout_pr_events (source_set_id, kind, rep_bucket)
  WHERE source_set_id IS NOT NULL AND invalidated_at IS NULL;

-- BACKSTOP 2 — ONE EVENT PER KIND PER DAY, and this one is not about replays. A lifter ramping
-- 90/95/100/102.5/105 kg past their old best mints FIVE record events in one session under a naive
-- per-set append, because each set legitimately beats the one before it — five badges, later five
-- coins, for one session's progress. With this index the write is an upsert that only ever moves the
-- day's event UP, so the final state is "the best of that day" regardless of the order the offline
-- queue delivered in, which also makes the record count deterministic rather than a function of the
-- client's network.
CREATE UNIQUE INDEX IF NOT EXISTS workout_pr_events_day_unique
  ON workout_pr_events (client_user_id, exercise_id, kind, rep_bucket, local_date)
  WHERE invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS workout_pr_events_feed_idx
  ON workout_pr_events (client_user_id, achieved_at DESC) WHERE invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS workout_pr_events_exercise_idx
  ON workout_pr_events (client_user_id, exercise_id, kind, rep_bucket, value DESC) WHERE invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS workout_pr_events_source_idx ON workout_pr_events (source_set_id) WHERE source_set_id IS NOT NULL;

-- The audit_log lesson (001:84-94) applied to records: a record is a historical fact and only its
-- value and invalidation may change. A BEFORE DELETE trigger is deliberately ABSENT — it would abort
-- the ON DELETE CASCADE from users and make account deletion impossible, exactly the trap
-- audit_log's own comment warns about.
CREATE TRIGGER IF NOT EXISTS trg_pr_event_immutable
BEFORE UPDATE ON workout_pr_events FOR EACH ROW
WHEN NEW.client_user_id IS NOT OLD.client_user_id
  OR NEW.kind           IS NOT OLD.kind
  OR NEW.rep_bucket     IS NOT OLD.rep_bucket
  OR NEW.previous_value IS NOT OLD.previous_value
  OR NEW.local_date     IS NOT OLD.local_date
  OR (OLD.invalidated_at IS NOT NULL AND NEW.invalidated_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'a personal record is a historical fact: only its value and invalidation may change');
END;

-- The insert-time half of the shape rule the CHECK above could not safely carry.
CREATE TRIGGER IF NOT EXISTS trg_pr_event_session_shape
BEFORE INSERT ON workout_pr_events FOR EACH ROW
WHEN (NEW.kind =  'session_volume' AND NEW.log_id IS NULL)
  OR (NEW.kind <> 'session_volume' AND NEW.source_set_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'a session-volume record needs a log; every other record needs a source set');
END;

-- A record must belong to the client whose set earned it. Without this, a record event is a row a
-- client can mint against a stranger's set id — cosmetic today, a direct credit transfer once a coin
-- is granted against workout_pr_events.id.
CREATE TRIGGER IF NOT EXISTS trg_pr_event_owner
BEFORE INSERT ON workout_pr_events FOR EACH ROW
WHEN (NEW.source_set_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM workout_log_sets s
                       WHERE s.id = NEW.source_set_id AND s.client_user_id = NEW.client_user_id))
  OR (NEW.log_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM workout_logs l
                       WHERE l.id = NEW.log_id AND l.client_user_id = NEW.client_user_id))
BEGIN
  SELECT RAISE(ABORT, 'a personal record must belong to the client who earned it');
END;


-- ═══ THE MISSING BRIDGE (unblocks the avoid-list suggestion filter) ════════════════════════════

-- 008 chose a JOINT-centric vocabulary for limitations, rightly: people injure knees and shoulders,
-- which are not muscle groups. But exercises are tagged by MUSCLE group, so today "avoid knee"
-- cannot exclude a single exercise — the two vocabularies do not touch anywhere in the schema and
-- the suggestion filter the roadmap asks for is not implementable at all. This is that missing edge.
--
-- A junction with one small enum payload and no other scalars, so WITHOUT ROWID, exactly like
-- exercise_muscle_map (003:97-102). It will never carry an FTS5 external-content index, the one
-- thing that would forbid it (004:12-15).
--
-- `relation` keeps the filter usable: 'loads' drives severity='avoid' (drop the exercise),
-- 'stabilises' drives severity='caution' (keep it, flag it). Without the distinction a knee
-- complaint removes every exercise a calf has ever stabilised. Admin-editable as a TABLE rather than
-- frozen as a CHECK, because the mapping is a clinical judgement that will be corrected without a
-- migration.
CREATE TABLE IF NOT EXISTS body_area_muscle_map (
  -- Copied VERBATIM from onboarding_limitations (008), kebab-case included.
  body_area TEXT NOT NULL CHECK (body_area IN (
    'neck', 'shoulder', 'elbow', 'wrist', 'upper-back', 'lower-back',
    'hip', 'knee', 'ankle', 'foot', 'chest', 'abdomen', 'other')),
  muscle_group_id INTEGER NOT NULL REFERENCES muscle_groups(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'loads' CHECK (relation IN ('loads', 'stabilises')),
  PRIMARY KEY (body_area, muscle_group_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS body_area_muscle_map_muscle_idx ON body_area_muscle_map (muscle_group_id, relation);

-- Seeded through the SLUG, never a literal id: muscle_groups ids are assignment order and differ
-- between a freshly migrated database and an upgraded one.
--
-- `full-body` is mapped as 'loads' onto every major joint on purpose. It is the tag on burpees,
-- thrusters and cleans — precisely the movements a knee or shoulder complaint should flag — and
-- omitting it is how a filter that looks like it works never excludes the exercises that matter.
-- 'other' maps to nothing, deliberately: a free-text limitation is something the coach must READ,
-- not something a machine should silently act on.
INSERT OR IGNORE INTO body_area_muscle_map (body_area, muscle_group_id, relation)
SELECT v.area, g.id, v.relation FROM muscle_groups g JOIN (
            SELECT 'neck'       AS area, 'neck'        AS slug, 'loads'      AS relation
  UNION ALL SELECT 'neck',       'traps',       'stabilises'
  UNION ALL SELECT 'shoulder',   'front-delts', 'loads'
  UNION ALL SELECT 'shoulder',   'side-delts',  'loads'
  UNION ALL SELECT 'shoulder',   'rear-delts',  'loads'
  UNION ALL SELECT 'shoulder',   'chest',       'stabilises'
  UNION ALL SELECT 'shoulder',   'lats',        'stabilises'
  UNION ALL SELECT 'shoulder',   'traps',       'stabilises'
  UNION ALL SELECT 'shoulder',   'full-body',   'loads'
  UNION ALL SELECT 'elbow',      'biceps',      'loads'
  UNION ALL SELECT 'elbow',      'triceps',     'loads'
  UNION ALL SELECT 'elbow',      'forearms',    'stabilises'
  UNION ALL SELECT 'elbow',      'full-body',   'loads'
  UNION ALL SELECT 'wrist',      'forearms',    'loads'
  UNION ALL SELECT 'wrist',      'biceps',      'stabilises'
  UNION ALL SELECT 'wrist',      'triceps',     'stabilises'
  UNION ALL SELECT 'upper-back', 'traps',       'loads'
  UNION ALL SELECT 'upper-back', 'lats',        'loads'
  UNION ALL SELECT 'upper-back', 'rear-delts',  'stabilises'
  UNION ALL SELECT 'lower-back', 'lower-back',  'loads'
  UNION ALL SELECT 'lower-back', 'glutes',      'stabilises'
  UNION ALL SELECT 'lower-back', 'hamstrings',  'stabilises'
  UNION ALL SELECT 'lower-back', 'full-body',   'loads'
  UNION ALL SELECT 'hip',        'glutes',      'loads'
  UNION ALL SELECT 'hip',        'adductors',   'loads'
  UNION ALL SELECT 'hip',        'abductors',   'loads'
  UNION ALL SELECT 'hip',        'hamstrings',  'loads'
  UNION ALL SELECT 'hip',        'quads',       'stabilises'
  UNION ALL SELECT 'hip',        'full-body',   'loads'
  UNION ALL SELECT 'knee',       'quads',       'loads'
  UNION ALL SELECT 'knee',       'hamstrings',  'loads'
  UNION ALL SELECT 'knee',       'glutes',      'stabilises'
  UNION ALL SELECT 'knee',       'calves',      'stabilises'
  UNION ALL SELECT 'knee',       'full-body',   'loads'
  UNION ALL SELECT 'ankle',      'calves',      'loads'
  UNION ALL SELECT 'ankle',      'quads',       'stabilises'
  UNION ALL SELECT 'ankle',      'full-body',   'loads'
  UNION ALL SELECT 'foot',       'calves',      'loads'
  UNION ALL SELECT 'chest',      'chest',       'loads'
  UNION ALL SELECT 'chest',      'front-delts', 'stabilises'
  UNION ALL SELECT 'chest',      'triceps',     'stabilises'
  UNION ALL SELECT 'abdomen',    'abs',         'loads'
  UNION ALL SELECT 'abdomen',    'obliques',    'loads'
  UNION ALL SELECT 'abdomen',    'full-body',   'stabilises'
) v ON v.slug = g.slug;


-- ═══ THE ONE COLUMN THE EXISTING PROFILE IS MISSING ════════════════════════════════════════════

-- Without an IANA zone the server cannot compute the user's local date, and every "today" card,
-- streak and weekly-volume bucket silently uses UTC days — which puts a 01:00 session in Budapest
-- into the previous day, and once a month into the previous WEEK.
--
-- Nullable and with no DEFAULT, because ALTER TABLE ADD COLUMN forbids a non-constant default (the
-- same constraint that forced 006 to add must_change_credentials as a literal) and because a
-- constant 'UTC' would be indistinguishable from a user who genuinely chose UTC. NULL means "assume
-- UTC and ask them". The client may send its detected zone as a HINT on any profile PATCH;
-- workout_logs.local_date is computed server-side from it and never taken from a request.
ALTER TABLE onboarding_profiles ADD COLUMN timezone TEXT
  CHECK (timezone IS NULL OR length(timezone) BETWEEN 3 AND 64);
