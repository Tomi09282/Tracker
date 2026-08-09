---
type: spec
title: Composer build spec — adversarial synthesis
updated: 2026-08-09
tags: [spec, phase-7, composer, marketplace, adversarial]
---

# Composer build spec

Produced by a 13-agent adversarial pass on 2026-08-09: four readers mapped the existing schema,
write conventions, markdown/media pipelines and publish gates; three independent designs were drawn
from those maps under different stances (smallest-core, explicit-state-machine, attacker-first);
five attack lenses (forge / replay / race / IDOR / extremes) were run across all three; one
synthesis produced what follows.

**Yield: 60 defects — 1 fatal, 18 severe.** Defect weight by feature (fatal=4, severe=2, else 1):

- `media-upload` — 20
- `post-edit` — 8
- `post-publish` — 7
- `media-cover-replace` — 7
- `post-create` — 7
- `profile-edit` — 5
- `post-compose` — 4
- `handle-claim` — 4
- `media-delete` — 3
- `post-withdraw-restore` — 2
- `post-create + media-upload` — 2
- `profile-publish` — 2
- `post-body` — 2
- `profile-edit + post-publish + media-upload` — 1
- `post-create (taxonomy)` — 1
- `post-create + profile-edit` — 1
- `media-edit` — 1
- `profile-create` — 1
- `composer-bootstrap` — 1
- `directory-read` — 1
- `short-text-fields` — 1

The method this project uses is that the signal is WHERE DEFECTS CLUSTER, not their total. Phase 5
cut the coach marketplace on 13 of 21; Phase 6 cut comments and reactions on 4 fatal plus ~15
severe, and recorded the cut as the phase's main result. The media surface here carries roughly 40%
of all defect weight in what is one column of one table.

**Nothing below is committed to yet — the cuts in §1.2 are the owner's decision.**

---

# FINAL BUILD SPEC — Phase 7: The Coach-Side Composer

**Status:** build spec, ready to implement. Supersedes designs 1–3.
**Scope:** the write surface for the public marketplace shipped in Phase 6.
**Migration:** `022_composer.sql`. **New backend files:** 5. **New frontend files:** 8. **Named worker transactions:** 11 (check-worker-tx must go from 11 → 22).

---

## 1. VERDICT

### 1.1 What gets built

| Surface | Built |
|---|---|
| Guidelines consent | read active version + accept it (nothing in `src/` touches these tables today; without this route **every publish in the product is denied**) |
| Coach profile | create, edit, publish, unpublish |
| Posts | create draft, edit, publish, withdraw, restore, list, read-as-author |
| Preview | server-side parse, rendered by the reader's own `DocRenderer` |
| Media | **one cover image per post: upload, delete, author-side view.** Nothing else. |

### 1.2 What gets CUT, and the clustering evidence

Total defect weight across the five passes: **≈85**. The media surface carries **34 of it** — `media-upload 20` + `media-cover-replace 7` + `media-delete 3` + `media-edit 1` + `post-create+media-upload 2` + a share of `profile-edit+post-publish+media-upload 1`. That is 40% of every defect found, in a feature that is one column of one table. This is the Phase-5 (13/21 → cut the marketplace) and Phase-6 (4 fatal + ~15 severe → cut comments and reactions) signal, and it points at the same answer.

**CUT 1 — the gallery, image reordering, and all media editing.** Removes: the sort_order `MAX+1` overflow past the `0..8` CHECK (EXTREMES-7), the reorder set-equality surface, D3's `role_key`-required-on-alt-edit cover destruction (FORGE-9), and — because `post_media` has **zero UPDATE triggers and an unfrozen `post_id`** — the entire class of "an UPDATE re-points a media row at another coach's post". Every UPDATE not written is an IDOR that cannot exist.

**CUT 2 — cover *replacement*.** "Replace the cover" is the single highest-defect verb in the corpus: it produced the only **FATAL** finding (RACE-1: `updatePostMediaTx` soft-deletes the cover, then `return {outcome:'missing'}` — better-sqlite3 **commits on return**, so the coach's cover is destroyed and the API answers 404), plus RACE-2 (the same commit-on-return shape latent in *all three* designs, invisible to `check-worker-tx`), RACE-9 / EXTREMES-3 (the per-post cap refuses a legal swap at exactly 9 images because the probe does not subtract the row it is about to delete), REPLAY-6 (a retry with a regenerated key destroys the cover), and FORGE-3 (`z.coerce.boolean()` — measured: `'false'` → `true` — makes the destruction confirmation unrefusable). **Changing a cover is `DELETE` then `POST`: two operations that are each already atomic, with no window that matters.** One extra slot of the daily-40 budget, in exchange for deleting one fatal and four severe defects.

**CUT 3 — handle rename.** `handle` is absent from the profile edit schema, so `.strict()` refuses it and `trg_profile_handle_available_upd` / `trg_profile_handle_retire_upd` are **unreachable from this surface**. Removes IDOR-1 (SEVERE: one account locks ~1 440–5 760 handles/day into a one-year global cooldown, retaining exclusive reclaim), REPLAY-10, and RACE-5 (a stale tab reverts a rename and burns *both* handles for a year from a headline edit).

**CUT 4 — autosave.** Save is a button. Removes RACE-7 (an in-flight create plus a blur-triggered second create means the replay answer discards the coach's newest keystrokes and the URL change makes it look like a success) and shrinks REPLAY-5.

**CUT 5 — scheduling.** Measured: `PUBLIC_POST` contains **no** `unixepoch()` comparison, so a future `published_at` is publicly readable the instant it is written; and the quota window `published_at > unixepoch() - 86400` has no upper bound, so ten posts scheduled for next month consume the entire daily allowance every day until then. `published_at` is `unixepoch()` written inside the SQL and is not an input anywhere.

**CUT 6 — a handle-availability endpoint, and distinct handle failure reasons.** `taken` / `reserved` / `in cooldown` collapse to ONE outcome. Distinguishing them enumerates *unpublished* profiles — a row class no public read discloses — and leaks another account's rename timestamp (IDOR-2).

### 1.3 What is NOT cut, and why

**Media is not cut entirely.** After cuts 1 and 2 the surface is three routes and two transactions, and every remaining media defect has a known one-line fix (owner-scoped idempotency, `deleted_at` in the ownership predicate, a `MulterError` branch, a route-level replay probe before the re-encode). The reader already renders a hero image; a text-only marketplace is a materially weaker product; and the `resolveStoredPath` / serve-route repairs have to happen the first time any `post_media` row exists regardless.

**`restore` is not cut.** Design 1 cut it because it re-publishes with no gate (FORGE-1, SEVERE). The cheaper answer is to *give it the gate*: the `PUBLISH_STANDING` projection already exists, and §2.1 adds `trg_post_restore_standing_upd` so the database enforces it too. Withdraw being irreversible — while permanently consuming a quota slot — is a worse product than a gated restore.

**Post edit is not cut** (weight 8) but its two root causes are fixed at the source, not routed around: `row_version` for lost updates (RACE-3/4, EXTREMES via D3's one-second `updated_at`), and the replacement of the body XOR trigger (EXTREMES-1: a `doc_version` bump makes **every existing post permanently uneditable, including title-only edits**, with no request that succeeds and no escape via DELETE+INSERT).

---

## 2. PREREQUISITE REPAIRS

Nothing in §3–§7 is buildable without these. Each item cites the finding that requires it.

### 2.1 `backend/src/db/migrations/022_composer.sql`

```sql
-- 1. Idempotency, house form: a column inside the guard's own uniqueness constraint
--    (010:1144 write_uid, 019:265-285 idempotency_key). NOT an idempotency_keys table
--    (010:43 and 019:93-94 refuse one). OWNER-SCOPED: IDOR-3/4, REPLAY-3, FORGE-2.
ALTER TABLE coach_posts ADD COLUMN write_uid TEXT
  CHECK (write_uid IS NULL OR (length(write_uid) BETWEEN 8 AND 96
         AND write_uid NOT GLOB '*[^A-Za-z0-9_:-]*'));
CREATE UNIQUE INDEX coach_posts_write_uid_uidx
  ON coach_posts (author_user_id, write_uid) WHERE write_uid IS NOT NULL;

ALTER TABLE post_media ADD COLUMN write_uid TEXT
  CHECK (write_uid IS NULL OR (length(write_uid) BETWEEN 8 AND 96
         AND write_uid NOT GLOB '*[^A-Za-z0-9_:-]*'));
CREATE UNIQUE INDEX post_media_write_uid_uidx
  ON post_media (post_id, write_uid) WHERE write_uid IS NOT NULL;

-- 2. The replay must be able to compare INTENT, not just presence (REPLAY-2, REPLAY-4).
ALTER TABLE post_media ADD COLUMN content_sha256 TEXT
  CHECK (content_sha256 IS NULL OR (length(content_sha256) = 64
         AND content_sha256 NOT GLOB '*[^a-f0-9]*'));

-- 3. Optimistic concurrency. unixepoch() is one-second granular, so a timestamp
--    guard silently no-ops inside its own second (RACE-3) and reports a false
--    conflict on a retry. A monotonic counter cannot collide.
ALTER TABLE coach_posts ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;

-- 4. Directory position becomes write-once, the way a post's feed position already is.
--    REPLAY-1 (SEVERE): unpublish->publish is an unlimited directory-bump primitive,
--    ~480-576 bumps/day/account, and it also breaks the directory's keyset cursor.
ALTER TABLE coach_profiles ADD COLUMN listed_at INTEGER;
UPDATE coach_profiles SET listed_at = published_at WHERE published_at IS NOT NULL;
CREATE INDEX coach_profiles_listed_idx ON coach_profiles (listed_at DESC, user_id)
  WHERE published_at IS NOT NULL AND removed_at IS NULL;

-- 5. THE BODY RULE. The XOR trigger refuses ordinary edits (paragraph reflow and
--    line indentation both change body_src and produce a byte-identical body_doc --
--    measured) and, worse, makes the entire published corpus permanently uneditable
--    the day doc_version is bumped (EXTREMES-1). Keep the direction that matters --
--    the doc, which is the half the public reads, may not move unless the source
--    or the grammar version moved -- and drop the direction that is a false positive.
--    021:709-710 states the principle: a rule that blocks an ordinary edit gets deleted.
DROP TRIGGER IF EXISTS trg_post_body_moves_as_one_upd;
CREATE TRIGGER trg_post_doc_needs_a_source_upd
BEFORE UPDATE OF body_src, body_doc, doc_version ON coach_posts FOR EACH ROW
WHEN NEW.body_doc IS NOT OLD.body_doc
 AND NEW.body_src IS OLD.body_src
 AND NEW.doc_version IS OLD.doc_version
BEGIN SELECT RAISE(ABORT, 'coach_posts: doc_moved_without_source'); END;

-- 6. The profile bio has NO co-movement trigger at all -- measured, an UPDATE that
--    rewrites bio_src alone is ACCEPTED and leaves a stale bio_doc, which is the half
--    the public reads. Symmetric rule, so one handling pattern covers both tables.
CREATE TRIGGER trg_profile_bio_doc_needs_a_source_upd
BEFORE UPDATE OF bio_src, bio_doc, doc_version ON coach_profiles FOR EACH ROW
WHEN NEW.bio_doc IS NOT OLD.bio_doc
 AND NEW.bio_src IS OLD.bio_src
 AND NEW.doc_version IS OLD.doc_version
BEGIN SELECT RAISE(ABORT, 'coach_profiles: doc_moved_without_source'); END;

-- 7. post_media has ZERO update triggers and post_id is not frozen. The routes are
--    ownership-scoped, but that is a property of the code. Make it a property of the data.
CREATE TRIGGER trg_post_media_identity_frozen_upd
BEFORE UPDATE ON post_media FOR EACH ROW
WHEN NEW.post_id     IS NOT OLD.post_id
  OR NEW.storage_key IS NOT OLD.storage_key
  OR NEW.thumb_key   IS NOT OLD.thumb_key
  OR NEW.created_at  IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'post_media: identity_is_frozen'); END;

-- 8. Nothing forbids storage_key = thumb_key (the two UNIQUEs are per-column) and the
--    serve route matches (storage_key = ? OR thumb_key = ?), so a collision serves the
--    wrong bytes. 128 bits makes it improbable; this makes it impossible.
CREATE TRIGGER trg_post_media_keys_distinct_ins
BEFORE INSERT ON post_media FOR EACH ROW WHEN NEW.storage_key = NEW.thumb_key
BEGIN SELECT RAISE(ABORT, 'post_media: keys_must_differ'); END;

-- 9. RESTORE IS A PUBLICATION EVENT AND NO 021 TRIGGER WATCHES IT (FORGE-1, SEVERE).
--    published_at never moves, so trg_post_publish_standing_upd does not fire; a coach
--    who has not accepted the guidelines now in force can return their whole withdrawn
--    back catalogue to the anonymous surface. Account age and quota are deliberately
--    NOT re-checked: the post was published once, and published_at does not move.
CREATE TRIGGER trg_post_restore_standing_upd
BEFORE UPDATE OF deleted_at ON coach_posts FOR EACH ROW
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
 AND OLD.published_at IS NOT NULL
 AND NOT (
      EXISTS (SELECT 1 FROM users u
               WHERE u.id = OLD.author_user_id AND u.disabled_at IS NULL
                 AND u.role IN ('coach','admin'))
  AND EXISTS (SELECT 1 FROM coach_profiles p
               WHERE p.user_id = OLD.author_user_id
                 AND p.published_at IS NOT NULL AND p.removed_at IS NULL)
  AND EXISTS (SELECT 1 FROM guidelines_acceptances a
                JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
               WHERE a.user_id = OLD.author_user_id))
BEGIN SELECT RAISE(ABORT, 'coach_posts: restore_denied'); END;

PRAGMA user_version = 22;
```

### 2.2 New shared modules (each one is a collapse, not an addition)

**`backend/src/public/shapes.js`** — the three regexes currently module-private in `public/routes.js` (`PUBLIC_ID_RE = /^[A-Za-z0-9_-]{12}$/`, `HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/`, `PUB_MEDIA_KEY_RE = /^pub_[a-f0-9]{32}\.webp$/`) plus `CITY_KEY_RE`, `KIND_KEY_RE`, `SPECIALTY_KEY_RE`, `CURRENCY_RE`, and `ianaTz` (a zod refine using `new Intl.DateTimeFormat(...,{timeZone})` — the runtime's own IANA table, never a second copy: EXTREMES-13). Both `public/routes.js` and the compose routers import it. Re-typing the handle regex — which must agree with a four-clause column CHECK — is defect class (a) at its most literal.

**`backend/src/public/text.js`** — `sanitizeDisplayText`. Migration 021:318-321 delegates a control to this function and it has never existed (grep: one hit, the comment itself). It is **not** a share of `normaliseSource`'s regex: `normaliseSource` deliberately keeps U+200C/U+200D for emoji and Indic text, and a 120-character run of ZWJ passes every design's bound and every column CHECK, producing an invisible name in the public directory (EXTREMES-10). And SQLite's `trim()` strips ASCII space only — U+3000, U+00A0, TAB and NEWLINE all survive it, so `' a '` passes `z.string().min(3)` and dies on `length(trim(title)) BETWEEN 3 AND 400` as an opaque 400 (EXTREMES-5).

```js
// Shared with markdown.js: the format-character set, exported ONCE.
export const INVISIBLE_FORMAT =
  /[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g;
const CONTROLS  = /[\u0000-\u001F\u007F-\u009F]/g;   // short fields need neither \n nor \t
const JOINERS   = /[\u200C\u200D]/g;                 // stripped HERE, kept in markdown bodies
const COMBO_RUN = /(\p{M})\p{M}{2,}/gu;
const WS        = /\p{White_Space}+/gu;

export function sanitizeDisplayText(raw) {
  if (typeof raw !== 'string') return '';
  if (!raw.isWellFormed()) throw new TextError('malformed_text');   // Node 24
  return raw.normalize('NFC')
    .replace(CONTROLS, '').replace(INVISIBLE_FORMAT, '').replace(JOINERS, '')
    .replace(COMBO_RUN, '$1')
    .replace(WS, ' ')
    .trim();                       // <- the bound zod checks is now the bound SQLite trims to
}
export const displayText = (min, max) =>
  z.string().max(max * 8).transform(sanitizeDisplayText).pipe(z.string().min(min).max(max));
```

**`backend/src/public/body.js`** — `buildBody`, `POST_BODY`, `BIO_BODY`. See §5.

**`backend/src/public/visibility.js`** (extend) — `AUTHOR_POST_ANY`, `AUTHOR_POST_EDITABLE`, `AUTHOR_POST_COLUMNS` (includes `body_src`, which `PUBLIC_POST_COLUMNS` deliberately omits), and `PUBLISH_STANDING`.

**`backend/src/auth/middleware.js`** (extend) — export `multipartCsrf`. Three byte-identical copies already exist (`exercises/media.js`, `chat/attachments.js`, `progress/routes.js`); a fourth is defect class (b) by omission.

### 2.3 `backend/src/lib/media.js`

Three artefacts describe three different file layouts and none agree: 021:898-903 promises `MEDIA_DIR/public/` resolved by `resolveStoredPath(key,'public')`; `resolveStoredPath` takes one argument and matches neither shape; and the shipped serve route bypasses it with a flat `path.join`. Collapse them **in this commit**, choosing the schema's layout, because disjoint namespaces make "a public route serves a client's progress photo" unreachable rather than guarded.

```js
export const PUBLIC_MEDIA_DIR = path.join(MEDIA_DIR, 'public');
// ensureDirs() also mkdirs PUBLIC_MEDIA_DIR.

const NAMESPACES = {
  private: { dir: MEDIA_DIR,        shapes: [/^[0-9a-f-]{36}\.webp$/, /^[0-9a-f]{48}(\.mp4)?$/] },
  public:  { dir: PUBLIC_MEDIA_DIR, shapes: [/^pub_[a-f0-9]{32}\.webp$/] },
};
export function resolveStoredPath(key, namespace = 'private') { /* shape test, join, containment
   check `full.startsWith(dir + path.sep)` kept in the ONE place it already lives */ }

// validateImage(tmpPath) is EXTRACTED from ingestImage: stat-before-decode (0 / >8 MiB),
// fileTypeFromFile magic-byte sniff against ALLOWED_IMAGE (SVG absent), sharp with
// limitInputPixels 40M and failOn:'error', metadata, width*height re-check. BOTH ingestImage
// (unchanged for exercises) and ingestPublicImage call it. One sniff, one allowlist, two policies.
// There are already FOUR sniffers in this repo and three of them do not re-encode.

export async function ingestPublicImage(tmpPath) {
  // -> { storageKey, thumbKey, mime:'image/webp', width, height, bytes, sha256 }
  // keys: `pub_${randomBytes(16).toString('hex')}.webp` == 4+32+5 == 41 chars, lowercase hex only,
  //       satisfying all four CHECK clauses at once. TWO independent draws, asserted distinct.
  // display: .rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true})
  //          .webp({quality:82}).toBuffer()   <- toBuffer so bytes and sha256 come from one pass
  // thumb:   same at 480 / quality 78
  // finally: fs.rm(tmpPath); inner catch rm()s any variant already written.
}
```

### 2.4 Read-surface amendments (`src/public/routes.js`, `visibility.js`, frontend)

Each is one line to a few lines, each closes a named finding, each gets a verify-022 assertion.

1. **Serve route must not crash.** `createReadStream(...).pipe(res)` has **no `'error'` listener** and sits outside the `asyncRoute` promise chain: a `post_media` row whose file is missing is an **uncaughtException and a process restart**, not a 404. The composer is the first thing that can create such a row. Replace with `resolveStoredPath(key.data,'public')` → 404 on null → `res.sendFile(full, (err) => { if (err && !res.headersSent) sendError(res,404,ERR.NOT_FOUND,'not found'); })` (the handled form `exercises/media.js:182-185` already ships).
2. **`GET /public/taxonomy` projects `active`** on kinds and cities (currently only specialties filter it), so the composer's picker cannot offer a kind the INSERT trigger will refuse (FORGE-6). Two designs claimed "the form and the trigger read the same row"; measured, they do not.
3. **`GET /public/taxonomy` returns `currencies`** (`SELECT code, minor_units AS minorUnits FROM public_currencies WHERE active = 1`), and `frontend/.../usePublic.ts:formatPrice` takes `minorUnits` and divides by `10 ** minorUnits`. Measured: today `formatPrice(5000,'HUF','hu')` renders **"50 Ft"** — every Hungarian price on the public page is shown at one hundredth of its value (EXTREMES-4, SEVERE). Also drop the hardcoded `maximumFractionDigits: 0`, which renders €0.01 as "0 EUR".
4. **`PROFILE_SORTS` orders by `c.listed_at DESC`** (see §2.1 item 4).
5. **`PUBLIC_POST` gains `p.published_at <= unixepoch()`** — retires the live disagreement with 021:621-623. A no-op today (no future values exist) and it keeps the partial feed indexes usable as a prefix.
6. **`PUBLIC_POST` and `PUBLIC_PROFILE` gain the kill switch** as a **correlated subquery, never a bound parameter** (visibility.js's whole safety argument is that it binds zero): `((SELECT value FROM public_policy WHERE key='public_surface_enabled') = 1 AND ...)`. Fail-closed by construction — a missing row yields NULL and hides everything. Today the switch is documented as "THE KILL SWITCH" and read by nothing.
7. **Opaque cursors.** `GET /public/coaches` currently returns `c.user_id` as `nextCursor` — anonymous enumeration of `users.id`, the exact defect `PUBLIC_PROFILE_COLUMNS` omits `user_id` to prevent. Use the existing, currently-unused `src/lib/cursor.js` `encodeCursor`/`decodeCursor` on both the directory and feed cursors. Transparent to the client, which only echoes the value.

### 2.5 `backend/src/lib/http.js` and `server.js`

- **`errorHandler` gains a `MulterError` branch**, before the constraint check: `LIMIT_FILE_SIZE` → 413 `ERR.PAYLOAD_TOO_LARGE`, everything else → 400 `ERR.VALIDATION`, logged at `info`. Today a 9 MiB phone photo — the single most likely upload failure — is an unhandled 500 written to `logs/server.log` at error level (EXTREMES-6), and the carefully-written `MediaError` 400 branch never runs.
- **Scoped JSON parser**, mounted immediately above the global one:
  ```js
  app.use('/api/v1/compose', express.json({ limit: COMPOSE_JSON_LIMIT }));  // '176kb'
  app.use(express.json({ limit: '64kb' }));                                  // unchanged elsewhere
  ```
  `express.json` skips an already-parsed body, so the 64 KB cap stays in force for the rest of the product. `body.js` carries a **module-load assertion** tying the two numbers together (`if (POST_BODY.maxChars * 8 + 16384 > COMPOSE_JSON_LIMIT_BYTES) throw`) — the assertion, not a comment, is what stops them drifting. Without this, a legal 20 000-character body of accented or CJK text is a **413 fired before zod or the parser**, with an error the composer cannot explain (EXTREMES-11).
- **Mount order.** `composeUploadRoutes` beside `mediaRoutes`/`attachmentRoutes`/`progressUploadRoutes` **above** `app.use(csrfProtection)`; `composeRoutes` **below** it. Nothing goes in `src/public/routes.js` — `check-routes.mjs:174-197` fails the build on `requireAuth`/`requireRole`/`req.user` in that file, and mounting beside `publicRoutes` would silently forfeit all three CSRF layers while the gate stayed green.

---

## 3. ROUTE TABLE

All routes live in `backend/src/public/compose.js` (`const router = Router(); export default router;`) except the upload, which lives in `backend/src/public/compose-media.js` with its own `const router`. **The variable must literally be named `router`, the path must be a single-quoted literal, and the chain must terminate at the token `asyncRoute`**, or `check-routes.mjs:64-80` cannot see the route at all — measured, `uploadRouter.post('/progress-photos', …)` is already invisible to the gate, and an invisible route passes the auth check, the limiter check and the strict-schema check by not existing to them.

**Chain order is always `requireAuth, requireCoach, <ipLimiter>, <accountLimiter>, asyncRoute(...)`.** `requireAuth` must be first: `check-routes.mjs:85` matches `/require(Auth|Admin|Role)/` and **does not match `requireCoach`**, and the account limiter needs `req.user`.

**Error convention.** Object-level miss → `sendError(res, 404, ERR.NOT_FOUND, 'not found')`, one answer for not-yours / never-existed / withdrawn / removed / malformed id. Role gate → 403 (`requireCoach`, the codebase's one documented exception). A state the *caller* can act on → 409 hand-built as `{ error, code: ERR.CONFLICT, reason: '<snake_case>', requestId, ...facts }`; the client maps `reason` to an i18n key. **No trigger message ever reaches a coach**: every 021 `RAISE` string is snake_case on purpose and `http.js:104` withholds all of them, so `publish_denied`, `publish_quota_reached`, `handle_unavailable`, `kind_shape_invalid` and `per_post_cap_reached` are all the same nine words. Every refusal a coach can hit is pre-checked.

### Rate-limit tiers (module-scope constants; every one added to `scripts/smoke-limits.js`)

| Constant | Key | Limit / 15 min |
|---|---|---|
| `composeReadLimiter` | IP | 600 |
| `composePreviewIpLimiter` / `composePreviewAccountLimiter` | IP / `prev:${uid}` | 300 / 200 |
| `composeWriteIpLimiter` / `composeWriteAccountLimiter` | IP / `compose:${uid}` | 120 / 60 |
| `publishIpLimiter` / `publishAccountLimiter` / `publishTargetLimiter` | IP / `pub:${uid}` / `pubt:${uid}:${publicId}` | 20 / 60 / 10 |
| `coverUploadIpLimiter` / `coverUploadAccountLimiter` | IP / `cover:${uid}` | 30 / 20 |

All carry `skip: () => process.env.NODE_ENV === 'test'`. `publishAccountLimiter` is deliberately **60, well above the DB quota of 10/day** — the DB quota is the bound that survives a restart and a second cluster worker; a limiter that duplicates the ceiling lets eight retries of one publish exhaust the budget for every other post (REPLAY-13).

---

### 3.1 `GET /compose/context`

The composer's entire bootstrap in **one statement**: profile, standing, guidelines, quotas, limits. Design 1's three-pool-call version can return `{profile:null, standing:{profileLive:true}}` and render a ladder that contradicts itself (RACE-10) — each pool call is a different worker thread with its own read snapshot.

```js
const emptyQuery = z.object({}).strict();
```

```sql
SELECT
  (SELECT c.handle       FROM coach_profiles c WHERE c.user_id = @uid AND c.removed_at IS NULL) AS handle,
  (SELECT c.display_name FROM coach_profiles c WHERE c.user_id = @uid AND c.removed_at IS NULL) AS displayName,
  (SELECT c.published_at FROM coach_profiles c WHERE c.user_id = @uid AND c.removed_at IS NULL) AS profilePublishedAt,
  (SELECT c.listed_at    FROM coach_profiles c WHERE c.user_id = @uid AND c.removed_at IS NULL) AS listedAt,
  EXISTS (SELECT 1 FROM coach_profiles c WHERE c.user_id = @uid AND c.removed_at IS NOT NULL)   AS profileRemoved,
  u.disabled_at IS NULL                                                    AS enabled,
  u.role IN ('coach','admin')                                              AS roleOk,
  u.created_at + (SELECT value FROM public_policy WHERE key='min_account_age_s_to_publish') AS eligibleAt,
  u.created_at <= unixepoch()
    - (SELECT value FROM public_policy WHERE key='min_account_age_s_to_publish')            AS oldEnough,
  (SELECT v.version  FROM guidelines_versions v WHERE v.active = 1)        AS activeGuidelinesVersion,
  (SELECT v.i18n_key FROM guidelines_versions v WHERE v.active = 1)        AS activeGuidelinesI18nKey,
  (SELECT a.accepted_at FROM guidelines_acceptances a
     JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
    WHERE a.user_id = @uid)                                                AS guidelinesAcceptedAt,
  (SELECT value FROM public_policy WHERE key='post_publish_daily_max')     AS postPublishDailyMax,
  (SELECT COUNT(*) FROM coach_posts q WHERE q.author_user_id = @uid
     AND q.published_at IS NOT NULL AND q.published_at > unixepoch() - 86400) AS publishedToday,
  (SELECT MIN(q.published_at) FROM coach_posts q WHERE q.author_user_id = @uid
     AND q.published_at IS NOT NULL AND q.published_at > unixepoch() - 86400) AS oldestPublishedAt,
  (SELECT value FROM public_policy WHERE key='media_daily_max')            AS mediaDailyMax,
  -- NO deleted_at filter: this must count the way trg_post_media_daily_cap_ins counts.
  (SELECT COUNT(*) FROM post_media m JOIN coach_posts p ON p.id = m.post_id
    WHERE p.author_user_id = @uid AND m.created_at > unixepoch() - 86400)  AS mediaToday,
  unixepoch()                                                              AS now
FROM users u WHERE u.id = @uid;
```

Also returns the product limits (`titleMax:140`, `bodyMax:POST_BODY.maxChars`, `bioMax:BIO_BODY.maxChars`, `specialtyMax:6`) so the editor's counters cannot carry a second copy.

**404/403:** never 404 — nothing is addressed. 403 from `requireCoach` only. No profile → `handle: null`, which is a state, not a miss. **Rate:** `composeReadLimiter`. **Idempotency:** n/a.

---

### 3.2 `POST /compose/guidelines/accept`

```js
const acceptBody = z.object({
  // The client ECHOES the version it displayed; it does not choose it. The stored version is
  // derived from active=1 inside the INSERT, so this field can only cause a refusal.
  version: z.string().regex(/^[0-9.]{3,12}$/),
}).strict();
```

**Authz:** subject is `req.user.id`; no id accepted. **404/403:** no 404 reachable. Echoed version ≠ active → 409 `stale_version` with `activeVersion` so the UI re-renders the text the coach is actually consenting to. No active row → 500 (server misconfiguration, not a coach error). **Rate:** `composeWriteIpLimiter` + `composeWriteAccountLimiter`. **Idempotency:** natural key `PRIMARY KEY (user_id, version)` + `INSERT OR IGNORE`; a re-accept returns the ORIGINAL `accepted_at`. `OR REPLACE` is forbidden — the row is append-only (`trg_guidelines_acceptance_immutable`) and a replace would rewrite evidence.

---

### 3.3 `GET /compose/profile`

```js
const emptyQuery = z.object({}).strict();
```
```sql
SELECT c.handle, c.display_name AS displayName, c.headline, c.bio_src AS bioSrc,
       c.bio_doc AS bioDoc, c.doc_version AS docVersion, c.city_key AS city,
       c.published_at AS publishedAt, c.removed_at AS removedAt,
       CASE WHEN c.verified_at IS NULL THEN 0 ELSE 1 END AS verified
  FROM coach_profiles c WHERE c.user_id = ?;
SELECT specialty_key AS key FROM coach_profile_specialties WHERE user_id = ?;
```
Returns `bio_src` — the markdown source no public read returns. **404/403:** no row → `200 {profile:null}`; a removed profile IS returned with `removedAt` set (it is the coach's own row and hiding it produces support tickets, not security). 403 from `requireCoach`. **Rate:** `composeReadLimiter`.

---

### 3.4 `POST /compose/profile` (create)

```js
const profileCreateBody = z.object({
  handle:       z.string().regex(HANDLE_RE),
  display_name: displayText(2, 120),
  headline:     displayText(2, 200).nullable(),
  bio_src:      z.string().max(BIO_BODY.maxChars).nullable(),
  city_key:     z.string().regex(CITY_KEY_RE).nullable(),
  specialties:  z.array(z.string().regex(SPECIALTY_KEY_RE)).max(6),
})
  .strict()
  .refine((v) => new Set(v.specialties).size === v.specialties.length, 'duplicate specialty');
// `.strict()` FIRST -- check-routes.mjs:146 tests /^\}\)\s*\.strict\(\)/ on the 40 chars after
// the matching brace, so `.refine().strict()` FAILS the build.
//
// ABSENT AND THAT IS THE CONTROL (021:337-340): verified_at, verified_by, published_at, listed_at,
// removed_at, removed_by, removal_reason, user_id, created_at, write_uid. `.strict()` REJECTS each
// as an unknown key. There is no idempotency_key: coach_profiles.user_id IS the primary key, so a
// validated-and-discarded token would be a promise the API does not keep (FORGE-7, REPLAY-11).
// The duplicate refine is required: ['strength','strength'] otherwise reaches
// PRIMARY KEY (user_id, specialty_key) as an opaque 400 (EXTREMES-14).
```

**Authz:** `user_id = req.user.id`, never a body field. **No trigger requires `role IN ('coach','admin')` at profile INSERT — only at publish** — so `requireCoach` plus the DB-side role re-read in the INSERT's SELECT are the only things stopping a `user`-role account from squatting handles. Stated as a code control.

**404/403:** 403 from `requireCoach`. Profile already exists with the same handle → 200 replayed. With a different handle → 409 `profile_exists`. Handle unavailable → **one** 409 `handle_unavailable` for reserved / taken / cooling. Unknown or inactive specialty / city → 409 naming the key. **Rate:** `composeWriteIpLimiter` + `composeWriteAccountLimiter`. **Idempotency:** natural key (the PK).

---

### 3.5 `PUT /compose/profile` (edit)

```js
const profileUpdateBody = z.object({
  display_name: displayText(2, 120),
  headline:     displayText(2, 200).nullable(),
  bio_src:      z.string().max(BIO_BODY.maxChars).nullable(),
  city_key:     z.string().regex(CITY_KEY_RE).nullable(),
  specialties:  z.array(z.string().regex(SPECIALTY_KEY_RE)).max(6),
})
  .strict()
  .refine((v) => new Set(v.specialties).size === v.specialties.length, 'duplicate specialty');
// `handle` IS ABSENT (CUT 3). PUT, not PATCH: every field is required and null means cleared,
// which removes absent-vs-null merge semantics entirely. BIO_BODY.maxChars = 8000 < the column's
// 16384 CHECK -- LIMITS.chars is 20000, so a 17000-character bio parses cleanly and then dies on
// a raw CHECK the coach cannot act on.
```
```sql
UPDATE coach_profiles SET ... , updated_at = unixepoch()
 WHERE user_id = ? AND removed_at IS NULL;     -- changes === 0 -> 404
```
**404/403:** `changes === 0` → 404, covering "no profile yet" and "a moderator removed it". **Rate:** compose write pair. **Idempotency:** total assignment; a replay is byte-identical.

---

### 3.6 `POST /compose/profile/publish` · 3.7 `POST /compose/profile/unpublish`

```js
const publishBody = z.object({}).strict();   // published_at is unixepoch() in the SQL
```
Separate routes and separate transactions, **not** a shared `setPublished(bool)`: the profile's `published_at` is clearable and re-settable while a post's is write-once, `listed_at` is written only on the publish path, and only publish carries a standing gate. A shared helper would be correct for exactly one of the two.

**404/403:** 404 when no profile / removed. 403 from `requireCoach` only. Publish standing failures → 409 `reason ∈ {account_disabled, not_a_coach, needs_guidelines, too_new(+eligibleAt), session_stale}`. Already in the target state → 200 `replayed:true`. **Rate:** `publishIpLimiter` + `publishAccountLimiter`. **Idempotency:** natural (`published_at IS NULL` / `IS NOT NULL` in the WHERE).

Unpublish has **no** standing gate — a coach who has lost standing must still be able to take themselves down — and the response reports how many live posts went dark, because `PUBLIC_POST` requires a live profile and there is no sweep.

---

### 3.8 `GET /compose/posts`

```js
const manageQuery = z.object({
  state:  z.enum(['all','draft','live','withdrawn','removed']).optional(),
  cursor: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  limit:  z.coerce.number().int().min(1).max(24).optional(),
}).strict();
```
```sql
SELECT ${AUTHOR_POST_COLUMNS} FROM coach_posts p
 WHERE ${AUTHOR_POST_ANY}                 -- (p.author_user_id = ?)
   AND (? IS NULL OR p.id < ?)
   AND (? IS NULL OR ${STATE_FILTERS[state]})   -- a CLOSED map, never a WHERE from a query key
 ORDER BY p.created_at DESC, p.id DESC LIMIT ?;
```
**Must not compose `PUBLIC_POST`** — that requires `published_at IS NOT NULL` and would return zero drafts, a bug that looks like an empty state. Rides `coach_posts_author_manage_idx`, the one deliberately non-partial index in 021. **404/403:** never 404. **Rate:** `composeReadLimiter`.

---

### 3.9 `POST /compose/posts` (create draft)

```js
const clientKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);   // ':' EXCLUDED

const postCreateBody = z.object({
  idempotency_key: clientKey,
  kind_key:  z.string().regex(KIND_KEY_RE),        // SHAPE only -- post_kinds is a TABLE
  title:     displayText(3, 140),
  body_src:  z.string().min(1).max(POST_BODY.maxChars),
  city_key:  z.string().regex(CITY_KEY_RE).nullable(),
  event_at:  z.number().int().min(946684800).max(4102444800).nullable(),
  event_tz:  ianaTz.nullable(),
  capacity:  z.number().int().min(1).max(100000).nullable(),
  price_minor:    z.number().int().min(0).max(100000000).nullable(),
  price_currency: z.string().regex(CURRENCY_RE).nullable(),
})
  .strict()
  .refine((v) => (v.price_minor === null) === (v.price_currency === null))
  .refine((v) => v.event_at === null || v.event_tz !== null);
// published_at, public_id, author_user_id, write_uid, row_version: all absent, all server-minted.
// The per-kind rules are NOT restated here; they are read from the stored post_kinds row.
```
```sql
INSERT INTO coach_posts (public_id, author_user_id, kind_key, title,
       body_src, body_doc, body_excerpt, doc_version,
       city_key, event_at, event_tz, capacity, price_minor, price_currency, write_uid)
SELECT ?, c.user_id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  FROM coach_profiles c
  JOIN users u ON u.id = c.user_id AND u.disabled_at IS NULL AND u.role IN ('coach','admin')
 WHERE c.user_id = ? AND c.removed_at IS NULL;    -- an INSERT has no WHERE: the SELECT is the guard
```
`author_user_id` is projected out of the row the **server** matched, never bound from the request. `published_at` is absent from the column list, so neither publish twin nor the quota twin can fire and a draft costs no quota.

**404/403:** 403 from `requireCoach`. No profile → 409 `no_profile`. Kind unknown/inactive/mis-shaped → 409 with a named reason. Bad city/currency → 409 naming it. `MarkdownError` → 400 `{code, detail}`. Same key + different title/body → 409 `key_reused`. **Rate:** compose write pair. **Idempotency:** `write_uid = post:${userId}:${key}`, index `(author_user_id, write_uid)`, probe carries `author_user_id = ?`.

---

### 3.10 `GET /compose/posts/:publicId`

```js
const publicIdParam = z.object({ publicId: z.string().regex(PUBLIC_ID_RE) }).strict();
```
Returns every field including `body_src`, `row_version`, `removedAt`, and the cover descriptor. **404/403:** 404 for not-yours / never-existed / malformed id (a 400 on a malformed id plus a 404 on an unknown one is together a shape oracle). A **removed** post IS returned with `removedAt`, read-only, so an appeal is possible; `removal_reason` is not returned (§8). **Rate:** `composeReadLimiter`.

---

### 3.11 `PUT /compose/posts/:publicId` (edit)

```js
const postUpdateBody = z.object({
  expected_row_version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  title:     displayText(3, 140),
  body_src:  z.string().min(1).max(POST_BODY.maxChars),
  city_key:  z.string().regex(CITY_KEY_RE).nullable(),
  event_at:  z.number().int().min(946684800).max(4102444800).nullable(),
  event_tz:  ianaTz.nullable(),
  capacity:  z.number().int().min(1).max(100000).nullable(),
  price_minor:    z.number().int().min(0).max(100000000).nullable(),
  price_currency: z.string().regex(CURRENCY_RE).nullable(),
})
  .strict()
  .refine((v) => (v.price_minor === null) === (v.price_currency === null))
  .refine((v) => v.event_at === null || v.event_tz !== null);
// kind_key IS ABSENT AND FROZEN. That makes trg_post_kind_shape_upd's missing `k.active = 1`
// clause unreachable from this surface rather than argued about (FORGE-4).
// published_at, deleted_at, removed_at*, public_id, author_user_id, created_at: absent, so
// `.strict()` gives a readable 400 where trg_post_identity_frozen_upd would give nine words.
```
```sql
UPDATE coach_posts
   SET title = ?, body_src = ?, body_doc = ?, body_excerpt = ?, doc_version = ?,
       city_key = ?, event_at = ?, event_tz = ?, capacity = ?,
       price_minor = ?, price_currency = ?,
       row_version = row_version + 1, updated_at = unixepoch()
 WHERE id = ? AND author_user_id = ?
   AND deleted_at IS NULL AND removed_at IS NULL
   AND row_version = ?;
```
**ONE statement, no branch.** All four body columns are always in the SET list. This is only safe because §2.1 replaced the XOR trigger — under 021 as shipped, a source-only edit (paragraph reflow, `- ` → `* `) aborts, and after a grammar bump *every* edit aborts. `removed_at IS NULL` is load-bearing: without it `trg_post_frozen_while_removed_upd` — which has **no value comparison at all** and fires on the mere presence of a column name in the SET list — aborts as a generic 400 instead of the house 404.

**404/403:** `changes === 0` and the pre-read found no row → 404. `changes === 0` and the pre-read found the row → 409 `stale` carrying the current row. Kind-shape conflict → 409 naming the field. `MarkdownError` → 400 `{code, detail}`. **Rate:** compose write pair. **Idempotency:** `row_version` is the guard; a retry of a landed save gets 409 `stale` with the current row, which the client recognises as its own text and accepts.

---

### 3.12 `POST /compose/posts/:publicId/publish`

```js
const publishBody = z.object({}).strict();
```
```sql
UPDATE coach_posts SET published_at = unixepoch(), row_version = row_version + 1,
                       updated_at = unixepoch()
 WHERE id = ? AND author_user_id = ?
   AND published_at IS NULL AND deleted_at IS NULL AND removed_at IS NULL
   AND EXISTS (SELECT 1 FROM users u WHERE u.id = coach_posts.author_user_id
                 AND u.disabled_at IS NULL AND u.role IN ('coach','admin')
                 AND u.session_version = ?
                 AND u.created_at <= unixepoch()
                      - (SELECT value FROM public_policy WHERE key='min_account_age_s_to_publish'))
   AND EXISTS (SELECT 1 FROM coach_profiles p WHERE p.user_id = coach_posts.author_user_id
                 AND p.published_at IS NOT NULL AND p.removed_at IS NULL)
   AND EXISTS (SELECT 1 FROM guidelines_acceptances a
                 JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
                WHERE a.user_id = coach_posts.author_user_id)
   AND (SELECT COUNT(*) FROM coach_posts q WHERE q.author_user_id = coach_posts.author_user_id
          AND q.published_at IS NOT NULL AND q.published_at > unixepoch() - 86400)
       < (SELECT value FROM public_policy WHERE key='post_publish_daily_max');
```
**404/403:** 404 (object looked up **first**, before any standing statement — IDOR-8). 403 `requireCoach` only. 401 `session_stale`. 409 `reason ∈ {account_disabled, not_a_coach, too_new(+eligibleAt), needs_guidelines(+activeVersion), profile_required, profile_not_published, quota_reached(+used,max,nextSlotAt)}`. Already published → 200 `replayed:true`. **`quota_reached` is 409, not 429** — it is a business rule; every 429 in this product comes from express-rate-limit. **Rate:** `publishIpLimiter` + `publishAccountLimiter` + `publishTargetLimiter`. **Idempotency:** natural, and unusually strong — `published_at IS NULL` in the WHERE plus the write-once trigger behind it.

---

### 3.13 `POST /compose/posts/:publicId/withdraw` · 3.14 `.../restore`

```js
const withdrawBody = z.object({}).strict();
const restoreBody  = z.object({}).strict();
```
```sql
-- withdraw: NO removed_at term. deleted_at is absent from trg_post_frozen_while_removed_upd's
-- column list on purpose: an author may always take their own content back.
UPDATE coach_posts SET deleted_at = unixepoch(), row_version = row_version + 1,
                       updated_at = unixepoch()
 WHERE public_id = ? AND author_user_id = ? AND deleted_at IS NULL;

-- restore: removed_at IS NULL IS carried, AND the standing gate is repeated as EXISTS terms.
UPDATE coach_posts SET deleted_at = NULL, row_version = row_version + 1, updated_at = unixepoch()
 WHERE public_id = ? AND author_user_id = ?
   AND deleted_at IS NOT NULL AND removed_at IS NULL
   AND EXISTS (SELECT 1 FROM users u WHERE u.id = coach_posts.author_user_id
                 AND u.disabled_at IS NULL AND u.role IN ('coach','admin'))
   AND EXISTS (SELECT 1 FROM coach_profiles p WHERE p.user_id = coach_posts.author_user_id
                 AND p.published_at IS NOT NULL AND p.removed_at IS NULL)
   AND EXISTS (SELECT 1 FROM guidelines_acceptances a
                 JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
                WHERE a.user_id = coach_posts.author_user_id);
```
There is no `unpublish`: `published_at` is write-once, so a restored post returns at its **original feed position** and consumes **no** quota — that is the anti-bump property working, and the UI says so. There is no hard delete: `content_reports` and `audit_log` hang off the row, a `DELETE` would cascade `post_media` and free a rowid that a stale report could then point at.

**404/403:** `changes === 0` with no row → 404. Restore refused by standing → 409 with the same reason set as publish. Already in the target state → 200 `replayed:true` with the ORIGINAL timestamp (REPLAY-12 applies to withdraw too). **Rate:** compose write pair.

---

### 3.15 `POST /compose/preview`

```js
const previewBody = z.object({
  surface:  z.enum(['post','bio']),
  body_src: z.string().min(1).max(POST_BODY.maxChars),
}).strict();
```
Writes nothing, reads nothing. Returns `{doc, excerpt, version}` from the same `buildBody` the write path uses, so the preview and the published page are the same function of the same input. **404/403:** 403 `requireCoach`; `MarkdownError` → 400 `{code, detail}` mapped to `public.compose.markdown.<code>`. **Rate:** `composePreviewIpLimiter` + `composePreviewAccountLimiter`, client debounce 400 ms.

---

### 3.16 `POST /compose/posts/:publicId/cover` (multipart — `compose-media.js`)

```js
const coverFields = z.object({
  idempotency_key: clientKey,
  alt: displayText(1, 200).optional(),   // '' after sanitising -> stored NULL, because
                                         // post_media.alt CHECKs length(trim(alt)) >= 1
}).strict();
// NO role field: this route only ever writes role_key = 'cover'. NO replace_cover:
// a second cover is a 409, and replacing is DELETE then POST (CUT 2).
```

**Chain:** `requireAuth, requireCoach, coverUploadIpLimiter, coverUploadAccountLimiter, multipartCsrf, requireCoverSlot, upload.single('file'), asyncRoute(...)`
`// ── nothing above this line has written a byte, and nothing below runs without ownership ──`

`requireCoverSlot` is an `asyncRoute` middleware that **parses the param with zod first** and answers 404 on a shape failure, then:
```sql
SELECT p.id,
       (SELECT m.id FROM post_media m
         WHERE m.post_id = p.id AND m.role_key = 'cover' AND m.deleted_at IS NULL) AS liveCover,
       (SELECT id FROM post_media m2 WHERE m2.post_id = p.id AND m2.write_uid = ?) AS priorId
  FROM coach_posts p
 WHERE p.public_id = ? AND p.author_user_id = ?
   AND p.deleted_at IS NULL AND p.removed_at IS NULL;
```
Miss → 404 **before multer writes a byte** (the publicId is not merely guessable, it is *published*). `deleted_at IS NULL` is mandatory: without it an upload racing a withdraw attaches an image to a withdrawn post and permanently burns a daily slot that never refunds (RACE-6). `liveCover` non-null → 409 `cover_exists`. `priorId` non-null → the **advisory replay probe**: answer with the stored descriptor *before* paying for a sharp re-encode (REPLAY-7).

**multer:** `{ dest: QUARANTINE_DIR, limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 4, parts: 8 } }` — disk not memory, quarantine not the served tree.

**404/403:** 404 for not-yours / withdrawn / removed / never-existed / malformed id. 403 from `requireCoach` and from `multipartCsrf`; 415 for a non-multipart content type. 400 with `MediaError.reason`. 413 for `LIMIT_FILE_SIZE` (§2.5). 409 `cover_exists`, 409 `daily_cap` (+used, max), 409 `key_reused` (same key, different bytes or alt). **Rate:** cover upload pair. **Idempotency:** `write_uid = cover:${postId}:${key}`, index `(post_id, write_uid)`, replay compares `content_sha256` and `alt`.

---

### 3.17 `DELETE /compose/posts/:publicId/cover` · 3.18 `GET /compose/posts/:publicId/cover`

```js
const publicIdParam = z.object({ publicId: z.string().regex(PUBLIC_ID_RE) }).strict();
// No body on the DELETE: a body would have to satisfy csrfProtection's JSON rule for no gain.
```
DELETE soft-deletes; **the bytes stay on disk** (`exercises/media.js:137-138` — a soft delete that hard-deletes bytes cannot be undone). GET streams the display variant to the **author** after an ownership-scoped read (`author_user_id = ?`, not a visibility predicate) via `resolveStoredPath(key,'public')` + `res.sendFile(full, cb)`, `Cache-Control: private, no-store`. It exists because a draft's cover is unreachable through `/public/media/:key` (which carries the full `PUBLIC_POST` predicate) and a composer that cannot show you your own draft after a reload is broken. **404/403:** `changes === 0` / no row → 404; a replayed DELETE returns the ORIGINAL `deletedAt` with `replayed:true`, not 404. **Rate:** compose write pair / `composeReadLimiter`.

---

## 4. NAMED WORKER TRANSACTIONS

Eleven functions in `src/db/worker.js`, eleven one-line wrappers in `src/db/index.js` (`export const createPost = (args) => pool.run(args, { name: 'createPostTx' })`). **No `writeTx` anywhere in this feature** — every write has a guard, a branch or an audit row paired with a `changes === 0` probe, which `index.js:29-35` states `writeTx` cannot do.

Every body has the exact house skeleton, and `conn.transaction(() => {` must be written **literally** — `check-worker-tx.mjs` matches that string and nothing else, so a hoisted closure or an arrow with a parameter is invisible to the ADR-0005 gate:

```js
export function xTx({ ...args }) {
  const conn = getDb();
  let current = null;
  const tx = conn.transaction(() => { /* ... */ });
  try { return tx.immediate(); } catch (err) { return rethrow(err, current); }
}
```

**ADR-0005 rules for this feature, stated once and applied to all eleven:**
1. Every check that can produce an **error result** runs above `// ── from here on, nothing may conditionally return ──`.
2. The `changes === 0 → return` exemption is legal **only on the first write in the body**. Anywhere later it must be `throw` — a return commits (this is RACE-1, the corpus's only FATAL: a cover soft-delete followed by a guarded write followed by `return {outcome:'missing'}` destroys the image and reports 404).
3. Where every predicate of a guarded write was established by a pre-check **under the same write lock**, `changes === 0` is impossible and must `throw`. `return view(true)` there manufactures a false "already published" with `publishedAt: null` (RACE-8).
4. The response is built by **one closure declared first**, called by both the fresh and the replay path, reading values back off the stored row — never rebuilt from JS variables.
5. The four body columns arrive **pre-parsed** from the main thread. No worker calls `parseBody`, so no `MarkdownError` is reachable after a write.

### 4.1 `createPostTx`

```js
export function createPostTx({ userId, kindKey, title, body, city, eventAt, eventTz,
                               capacity, priceMinor, priceCurrency, idempotencyKey,
                               requestId, ip = null }) {
  const conn = getDb();
  let current = null;
  const tx = conn.transaction(() => {
    // (0) THE VIEW CLOSURE, declared first so its return is textually above every write.
    const view = (postId, replayed) => {
      current = 'SELECT the post';
      const row = stmt(`SELECT public_id AS id, kind_key AS kind, title, body_src AS bodySrc,
                               body_doc AS doc, body_excerpt AS excerpt, doc_version AS docVersion,
                               city_key AS city, event_at AS eventAt, event_tz AS eventTz,
                               capacity, price_minor AS priceMinor, price_currency AS priceCurrency,
                               published_at AS publishedAt, deleted_at AS deletedAt,
                               row_version AS rowVersion, created_at AS createdAt
                          FROM coach_posts WHERE id = ?`).get(postId);
      return { outcome: 'applied', replayed, ...row };
    };

    const writeUid = `post:${userId}:${idempotencyKey}`;   // ':' excluded from clientKey's regex

    // ── every check that can return an error result runs BEFORE the first write (ADR-0005) ──

    // (1) REPLAY, owner-scoped in the WHERE -- not by a string convention in another module.
    current = 'SELECT the prior attempt';
    const prior = stmt(`SELECT id, title, body_src AS bodySrc FROM coach_posts
                         WHERE author_user_id = ? AND write_uid = ?`).get(userId, writeUid);
    if (prior && (prior.title !== title || prior.bodySrc !== body.src))
      return { outcome: 'key_reused', publicId: view(prior.id, true).id };   // 409, never a 2nd effect
    if (prior) return view(prior.id, true);

    // (2) the author's profile
    current = 'SELECT the profile';
    const profile = stmt(`SELECT user_id FROM coach_profiles
                           WHERE user_id = ? AND removed_at IS NULL`).get(userId);
    if (!profile) return { outcome: 'no_profile' };

    // (3) the kind's OWN rules, from the reference row -- never a z.enum, never a second copy
    current = 'SELECT the kind';
    const kind = stmt(`SELECT requires_event_at AS requiresEventAt, allows_capacity AS allowsCapacity,
                              allows_price AS allowsPrice
                         FROM post_kinds WHERE key = ? AND active = 1`).get(kindKey);
    if (!kind) return { outcome: 'kind_unknown' };
    if (kind.requiresEventAt === 1 && eventAt === null) return { outcome: 'kind_shape', reason: 'event_at_required' };
    if (kind.allowsCapacity === 0 && capacity !== null)  return { outcome: 'kind_shape', reason: 'capacity_not_allowed' };
    if (kind.allowsPrice === 0 && priceMinor !== null)   return { outcome: 'kind_shape', reason: 'price_not_allowed' };

    // (4) reference membership -- public_cities and public_currencies have NO active-flag trigger,
    //     so an unknown or retired key would otherwise be an opaque FK 400 (FORGE-8, EXTREMES-9).
    current = 'SELECT the reference rows';
    const refs = stmt(`SELECT (? IS NULL OR EXISTS (SELECT 1 FROM public_cities
                                 WHERE key = ? AND active = 1))     AS cityOk,
                              (? IS NULL OR EXISTS (SELECT 1 FROM public_currencies
                                 WHERE code = ? AND active = 1))    AS currencyOk`)
                     .get(city, city, priceCurrency, priceCurrency);
    if (!refs.cityOk)     return { outcome: 'city_unknown' };
    if (!refs.currencyOk) return { outcome: 'currency_unknown' };

    // (5) mint public_id under the write lock; a UNIQUE collision would be an opaque 400
    current = 'SELECT the public_id probe';
    let publicId = null;
    for (let i = 0; i < 5 && publicId === null; i += 1) {
      const candidate = randomBytes(9).toString('base64url');           // 12 chars, 72 bits
      if (!stmt('SELECT 1 FROM coach_posts WHERE public_id = ?').get(candidate)) publicId = candidate;
    }
    if (publicId === null) throw new Error('public_id space exhausted after five draws');

    // ── from here on, nothing may conditionally return ─────────────────────────────
    current = 'INSERT coach_posts';
    const created = stmt(`INSERT INTO coach_posts (...) SELECT ?, c.user_id, ... FROM coach_profiles c
                            JOIN users u ON u.id = c.user_id AND u.disabled_at IS NULL
                                        AND u.role IN ('coach','admin')
                           WHERE c.user_id = ? AND c.removed_at IS NULL`).run(/* ... */);
    if (created.changes === 0) return { outcome: 'no_profile' };
    // ^ the ONE permitted post-write branch, and it is the FIRST write in this body.

    current = 'SELECT the new id';
    const postId = stmt('SELECT id FROM coach_posts WHERE public_id = ?').get(publicId).id;

    current = 'INSERT audit_log';
    stmt(`INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
          VALUES (?, 'marketplace.post.create', 'coach_post', ?, ?, ?, ?)`)
      .run(userId, postId, JSON.stringify(view(postId, false)), requestId, ip);
    // target_id is coach_posts.id (INTEGER). trg_audit_log_marketplace_complete refuses a NULL,
    // and 021:1183-1186 records that pointing it at a TEXT key deadlocked a previous design.
    // request_id comes from res.locals.requestId threaded in as an argument -- NEVER req.id.

    return view(postId, false);
  });
  try { return tx.immediate(); } catch (err) { return rethrow(err, current); }
}
```

### 4.2 `publishPostTx` — validation order (the object is looked up FIRST)

| # | Statement | Outcome on failure |
|---|---|---|
| 0 | `view()` closure declared | — |
| 1 | `SELECT id, published_at, deleted_at, removed_at, kind_key, event_at FROM coach_posts WHERE public_id = ? AND author_user_id = ?` | `missing` → **404** (before anything is said about the caller — IDOR-8). Already published → `view(id, true)` |
| 2 | `PUBLISH_STANDING` (one statement) | `not_a_coach` 403 · `account_disabled` 403 · `session_stale` 401 · `too_new` 409 (+`eligibleAt`) · `needs_guidelines` 409 (+`activeVersion`, `activeGuidelinesI18nKey`) · `profile_required` / `profile_not_published` 409 |
| 3 | quota: `COUNT(*)` + `MIN(published_at)` + `post_publish_daily_max`, one statement, counted **exactly as the trigger counts it** (including withdrawn and removed posts) | `quota_reached` 409 + `{used, max, nextSlotAt: oldest + 86400}` |
| 4 | kind still `active = 1` and still shaped | `kind_shape` 409 naming the field |
| — | `── from here on, nothing may conditionally return ──` | |
| 5 | the guarded `UPDATE` of §3.12, with `session_version = ?` bound (`requireAuth`'s sv cache is **30 s stale** and a publish is an irreversible push to the open internet) | `changes === 0` → **`throw`** |
| 6 | `INSERT INTO audit_log (… 'marketplace.post.publish', 'coach_post', <id>, <JSON of a read-back row>, …)` | — |

### 4.3 The other nine, in one table

| Tx | Pre-write checks (all above the marker) | First write | Post-write branch |
|---|---|---|---|
| `acceptGuidelinesTx` | active version (`throw` if none — misconfiguration); echoed version ≠ active → `stale_version`; existing acceptance → `view(true)` | `INSERT OR IGNORE … SELECT ?, v.version, ? FROM guidelines_versions v WHERE v.active = 1` | none (audit row unconditional on the fresh path) |
| `createCoachProfileTx` | existing profile (same handle → replay, different → `profile_exists`); **one** handle statement returning `reserved/taken/cooling` as three booleans → **one** outcome `handle_unavailable`; specialty membership+active via a **fixed six-placeholder `IN` list padded with NULL** (constant SQL, one cached statement, no `IN` built from request data); city membership | `INSERT INTO coach_profiles (…)` — `published_at`, `listed_at`, `verified_*`, `removed_*` absent from the column list, so the publish and verify INSERT twins **cannot fire** | `throw` |
| `updateCoachProfileTx` | profile exists and `removed_at IS NULL` → `missing`; specialty + city membership. **Both before the DELETE** — after it, a conditional return would COMMIT a profile stripped of its specialties | `UPDATE coach_profiles … WHERE user_id = ? AND removed_at IS NULL` | `changes === 0` → `missing` (first write) |
| `publishCoachProfileTx` | profile (`missing` / already published → `view(true)`); `PUBLISH_STANDING` branched in a fixed order | `UPDATE … SET published_at = unixepoch(), listed_at = COALESCE(listed_at, unixepoch()) …` — **`listed_at` is write-once by `COALESCE`** | `throw` |
| `unpublishCoachProfileTx` | profile (`missing` / already dark → `view(true)`). No standing gate, deliberately | `UPDATE … SET published_at = NULL …` (`listed_at` untouched) | `throw` |
| `updatePostTx` | post by `(public_id, author_user_id)` → `missing` when absent **or `removed_at IS NOT NULL`** (so a moderated post is a 404, not `trg_post_frozen_while_removed_upd`'s generic 400); `row_version` mismatch → `stale` + current row; kind shape on the merged values; city/currency membership | the single `UPDATE` of §3.11 | `changes === 0` → `stale` (first write) |
| `withdrawPostTx` | post → `missing`; already withdrawn → `view(true)` with the ORIGINAL `deleted_at` | `UPDATE … SET deleted_at = unixepoch() … WHERE deleted_at IS NULL` | `throw` |
| `restorePostTx` | post → `missing` (absent, not withdrawn, **or removed**); the three standing EXISTS as named outcomes | the guarded `UPDATE` of §3.14 | `throw` |
| `attachPostCoverTx` | post ownership + `deleted_at IS NULL` + `removed_at IS NULL` → `missing`; replay on `(post_id, write_uid)` comparing `content_sha256` and `alt` → `view(true)` or `key_reused`; live cover → `cover_exists`; daily cap counted **without a `deleted_at` filter**, matching the trigger → `daily_cap`; `image/webp` active | `INSERT INTO post_media (…) SELECT p.id, 'cover', ?, ?, 'image/webp', ?,?,?, ?, 0, ?, ? FROM coach_posts p WHERE p.id = ? AND p.author_user_id = ? AND p.deleted_at IS NULL AND p.removed_at IS NULL` — `mime` is a **server-side literal**, `sort_order` is the constant 0 | `changes === 0` → `missing` (first write) |
| `deletePostCoverTx` | pre-read `SELECT id, storage_key, thumb_key, deleted_at FROM post_media m WHERE m.post_id = (SELECT p.id FROM coach_posts p WHERE p.public_id = ? AND p.author_user_id = ?) AND m.role_key='cover'` → `missing` / already deleted → `view(true)`. **Do not use `UPDATE … RETURNING` with `.changes`** — measured, `.run()` discards the returned rows and `.all()` returns no `.changes`, and an `if (!row)` shape fails `check-worker-tx`'s textual exemption | `UPDATE post_media SET deleted_at = unixepoch() WHERE id = ? AND deleted_at IS NULL` | `throw` (the row was proved under the same lock) |

---

## 5. THE BODY RULE — ONE DEFINITION

This is the project's number-one defect class, so it gets exactly one producer, one consumer, one statement and one gate.

### 5.1 The producer — `backend/src/public/body.js`

```js
import { normaliseSource, parseBody, assertDocShape, MarkdownError } from './markdown.js';

// The two surfaces have DIFFERENT storage bounds. LIMITS.chars is 20000 while
// coach_profiles.bio_src is CHECK'd <= 16384, so a 17000-character bio parses cleanly and then
// dies on a raw constraint. Each surface carries its own bound HERE and nowhere else.
export const POST_BODY = { maxChars: 20_000 };
export const BIO_BODY  = { maxChars:  8_000 };

// Two numbers that must agree, checked at boot instead of in a comment (EXTREMES-11).
if (POST_BODY.maxChars * 8 + 16_384 > COMPOSE_JSON_LIMIT_BYTES)
  throw new Error('compose JSON limit is smaller than the body bound it must admit');

export function buildBody(raw, profile) {
  if (typeof raw !== 'string' || !raw.isWellFormed())
    throw new MarkdownError('malformed_text');          // (2) below
  const parsed = parseBody(raw);                        // ONE parse
  assertDocShape(parsed.doc);                           // the structural half zod cannot express
  const src = normaliseSource(raw);                     // (1)
  if (src.length > profile.maxChars) throw new MarkdownError('too_long', profile.maxChars);
  if (parsed.excerpt.length === 0) throw new MarkdownError('no_visible_text');   // (5)
  return {
    src,                        // (1) NOT the request string
    doc: parsed.json,           // (3) NOT JSON.stringify(parsed.doc)
    excerpt: parsed.excerpt,    // (4) derived from the DOC, never the source
    version: parsed.version,    // (6) NOT the literal 1
  };
}
```

Six properties, each closing a specific way the four columns drift apart:

1. **`src` is `normaliseSource(raw)`.** `parseBody` normalises internally and builds the tree from the normalised text; storing the raw input desynchronises the source from the tree that produced it, and **no trigger can detect it** — SQLite has no parser, so nothing in the database ever verifies that `body_doc = parseBody(body_src)`.
2. **Lone surrogates are rejected.** Measured: `JSON.parse` accepts an unpaired `\ud83d`, `normaliseSource` keeps it, `JSON.stringify` escapes it into `body_doc` as text, and V8's UTF-8 conversion replaces it with U+FFFD on the way into `body_src`. The result is a `body_doc` that is not the parse of its `body_src`, in exactly the column pair this whole section exists to protect, invisibly (EXTREMES-8).
3. **`doc` is `parsed.json`** — the string `parseBody` already serialised and byte-checked against `LIMITS.bytes`. Its own JSDoc omits the field and nothing in the repo consumes it; a caller that re-stringifies stores bytes the limit check never saw.
4. **`excerpt` is `excerptOf(doc)`.** From the source it would carry markdown punctuation into a feed card. `trg_post_excerpt_is_derived_upd` enforces only that it never moves *alone*; that it is actually derived is this function's job.
5. **An empty excerpt is refused.** `body_src = "\\"` parses to `[{k:'p',c:[{k:'br'}]}]` with `excerpt = ""` — a legal publish that consumes one of ten daily slots and renders a blank feed card forever (EXTREMES-15).
6. **`version` is read off the return value.** `version: 1` at `markdown.js:340` is the only place the document version exists; a route writing `doc_version = 1` mints the second definition.

### 5.2 The consumer, the statement, and the trigger

- **`buildBody` runs on the main thread, in the route, once.** The worker receives four opaque values and never parses. Parsing in the worker would put a second producer in the system and CPU work on the SQL thread.
- **The four columns appear together in exactly three statements in the whole product**: `createPostTx`'s INSERT, `updatePostTx`'s UPDATE, and `updateCoachProfileTx`'s UPDATE (three of the four, no excerpt). `updatePostTx` **always** lists all four — there is no "skip the body write" branch, because §2.1 replaced the XOR trigger.
- **On INSERT nothing in the database checks the derivation** — both body triggers are UPDATE-only, and no trigger can express "is the parse of". That is a CODE control and this spec says so, rather than repeating 021:320's mistake of asserting a control that was never built.

### 5.3 The gate — `backend/scripts/check-body-writes.mjs` (into `check:all`)

Reads the **real** `src/db/worker.js`. Fails the build if:
1. any SQL literal containing `body_doc` does not also contain `body_src`, `body_excerpt` and `doc_version` (or `bio_doc` without `bio_src` and `doc_version`);
2. `parseBody(`, `excerptOf(` or `assertDocShape(` appears anywhere outside `src/public/body.js`, `src/public/markdown.js` and their verifiers;
3. `doc_version` is assigned a numeric literal anywhere in `src/`.

It carries no copy of the parser and no copy of the schema — it asserts a property of the real statements (evidence rule 4).

---

## 6. MEDIA FLOW, END TO END

### 6.1 Happy path

1. `requireAuth, requireCoach, coverUploadIpLimiter, coverUploadAccountLimiter, multipartCsrf, requireCoverSlot` — ownership, post liveness, cover-slot availability and the **advisory replay probe** all resolved before multer. Nothing above this line has written a byte.
2. `upload.single('file')` → `QUARANTINE_DIR`, `{fileSize: 8 MiB, files:1, fields:4, parts:8}`.
3. `coverFields.safeParse(req.body)`.
4. `ingestPublicImage(req.file.path)`:
   - `validateImage` — stat before decode, magic-byte sniff (SVG absent), sharp with `limitInputPixels: 40M`, dimension re-check.
   - `.rotate()` **before** the resize, then `1600` display at q82 and `480` thumb at q78, both `.toBuffer()`, then written to `PUBLIC_MEDIA_DIR`. Re-encoding from decoded pixels **is** the sanitisation — EXIF/GPS and appended trailing data do not survive. This is why `post_media_mimes` activates only `image/webp`: `progress/routes.js` and `chat/attachments.js` both `rename()` the client's original bytes into the served tree, and copying either would publish the photographer's coordinates to anonymous readers.
   - Keys: `pub_${randomBytes(16).toString('hex')}.webp` — 41 chars, lowercase hex, satisfying all four CHECK clauses at once. **Two independent draws, asserted distinct.** The existing `${randomUUID()}.webp` is 41 chars by coincidence but contains hyphens and no prefix and fails the CHECK on both counts.
   - `sha256` of the display buffer; `bytes` = display buffer length.
   - `finally { fs.rm(tmpPath) }`; inner catch rm()s any variant already written.
5. `db.attachPostCover({...})` — one worker call, one transaction.
6. 201 with `{ storageKey, thumbKey, width, height, alt }`. The frontend needs **both**: the hero renders `storageKey`, cards render `thumbKey`.

### 6.2 Order, and the tie-breaker

**Files first, row second, always.** The row is the authority for serving, so an orphan **file** is inert (nothing references it) while an orphan **row** is a 404 for a picture the coach can see — and, before the §2.4 `sendFile` repair, an **uncaughtException and a process restart**. `chat/retention.js:55-57` states the general rule; here it is sharper.

### 6.3 Every way the file and the row can disagree

| Failure | Handling |
|---|---|
| multer limit breached | `MulterError` → 413/400 via the new `errorHandler` branch; the partial quarantine file is unlinked on the error path (`sweepQuarantine` is the backstop, not the plan) |
| sniff/decode rejects | `MediaError` → 400 `err.reason`; quarantine removed by `ingestPublicImage`'s `finally`; nothing else written |
| second variant throws | the first variant is rm()'d inside `ingestPublicImage`; no row exists |
| tx returns `missing` / `cover_exists` / `daily_cap` / `key_reused` | the route rm()s **both** files, then answers. This is the `chat/attachments.js:167-171` compensating delete — the only such precedent in the repo — and it must rm the **ingest outputs**, not `req.file.path`, which by then is gone (chat's own latent bug) |
| tx returns `replayed:true` (the in-transaction probe won a genuine race) | rm() both new files and return the **original** descriptor. Returning the new keys would point the client at bytes no row references |
| the db call throws | catch, rm() both files, re-throw. No row can exist, so no orphan row is possible |
| process dies between the files and the row | two orphan files. Nothing serves them. Accepted (§8) |
| DELETE | soft-delete only; the bytes stay. The public serve stops finding the row and the image is off the internet on the next request |

### 6.4 The two caps count different sets and the UI must never average them

`media_per_post_max` (9) counts `deleted_at IS NULL` — but with cover-only the one-cover UNIQUE partial index binds first, so it is unreachable. `media_daily_max` (40) counts by `created_at` with **no `deleted_at` filter** — deleting an image **does not refund the day's budget**; it is the anti-file-hosting number. Both are read from `public_policy` inside the transaction so the route's number and the trigger's number are the same row, and the delete confirmation says in words that changing a cover costs two of the day's forty.

---

## 7. FRONTEND

Routes, all children of `<RequireAuth><AppLayout/></RequireAuth>` in `frontend/src/app/router.tsx`, all `lazy()` + `suspended(...)`. `/m`, `/m/p/:publicId`, `/m/c/:handle` stay exactly where they are, outside both — the router file carries a comment recording that moving them inside defeated the entire public surface at the client.

```
/coach/marketplace                      ComposerHome
/coach/marketplace/profile              ProfileEditor
/coach/marketplace/posts/new            PostEditor  (create)
/coach/marketplace/posts/:publicId      PostEditor  (edit — same component)
```

Files in `frontend/src/features/marketplace/compose/`: `ComposerHome.tsx`, `ProfileEditor.tsx`, `PostEditor.tsx`, `CoverPanel.tsx`, `PublishChecklist.tsx`, `GuidelinesGate.tsx`, `StateChip.tsx`, `useComposer.ts`. They live **in the existing marketplace folder** because the preview must import the reader's own `DocRenderer`.

**`ComposerHome` is a readiness ladder, not a dashboard.** The schema forces the order — a post cannot publish without a live profile, a profile cannot publish without consent and a 24-hour-old account — so the UI shows the ladder rather than a publish button that always fails: **accept the guidelines → create your profile → publish your profile → write a post → publish it.** Every state comes from `GET /compose/context`; the client **never re-derives the publish predicate**. Step 1 reappears for every coach when a new guidelines version is activated, and it is a first-class state with its own copy, not an error toast — existing content stays live (the read predicate never mentions consent), only new publishes are gated.

**`PostEditor`.** Left: title, kind picker, city, markdown textarea with counters fed by `/compose/context`. The kind picker and the enable/disable rules for event date, capacity and price come from `GET /public/taxonomy`'s `requiresEventAt`/`allowsCapacity`/`allowsPrice` **and its new `active` flag** — the form and `trg_post_kind_shape_ins` read the same row, and a new kind is an INSERT, not a deploy. Right: `<DocRenderer doc={preview.doc} />` fed by `POST /compose/preview`, debounced 400 ms. **There is no markdown parser on the client and there must never be one** — the frontend today has zero HTML sinks (no `dangerouslySetInnerHTML`, no `innerHTML`, no `insertAdjacentHTML`) and a second parser would let the preview and the published page disagree about the one thing the reader sees. `MarkdownError.code` renders as an inline field error via `public.compose.markdown.<code>` with `detail` interpolated.

**Drafts live on the server. Save is a button.** No autosave (CUT 4), no localStorage copy of `body_src` — a locally cached body is a second copy of the exact column §5 exists to collapse, it can disagree with the stored row, and it survives a logout on a shared browser. The **only** client persistence is one `sessionStorage` entry `{ createUid, form }`, written before the first `POST` and cleared only after a create whose `publicId` the client has recorded — so a reload or a tab restore **replays** rather than duplicating (REPLAY-5). `createUid` is derived from the draft session, explicitly reset in the `navigate(..., {replace:true})` callback after a successful create, and the Save button is disabled while the mutation is pending. Every subsequent save is a `PUT` carrying `expected_row_version`; a 409 `stale` shows a diff against the server's copy rather than a silent clobber.

**`CoverPanel`.** One slot. Empty → upload. Filled → the image (from `GET /compose/posts/:publicId/cover` for a draft, `/api/v1/public/media/:storageKey` once published) plus Delete. Changing the cover is Delete then Upload, and the confirm says so, including that it costs two of today's forty uploads and that deleting never refunds. Upload bypasses `apiWithRefresh` exactly as `useProgress.ts:157-178` does: raw `fetch` with `credentials:'include'`, `X-CSRF:'1'`, and Content-Type unset so the browser writes the boundary.

**`useComposer.ts`** uses `apiWithRefresh` — **not** `usePublic.ts`'s `publicGet`, which sets `credentials:'omit'` and would send every composer request without a session. Queries `['composer','context'|'profile'|'posts']`; mutations `useMutation({ mutationFn, onSuccess: () => qc.invalidateQueries({queryKey:['composer']}) })`. `api()` already sets `X-CSRF: 1` on every non-safe method, so composer mutations get CSRF layers 2 and 3 free.

**Types extend, never parallel.** `PostDraft` / `ComposerProfile` extend the existing `PublicPost` / `PublicCoach` with the author-only fields (`bodySrc`, `rowVersion`, `deletedAt`, `removedAt`), reusing `BlockNode`/`InlineNode`. While here: `PublicCoach` gains the `docVersion` the server already sends, and `formatPrice` takes `minorUnits` (§2.4 item 3).

**Copy the schema makes non-negotiable, in hu/en/de:** publishing sets the feed position permanently — a withdrawn post that is restored returns to its original place and consumes no new slot; withdrawing does not give back today's publish allowance; deleting an image does not give back today's upload allowance; your handle cannot be changed later; unpublishing your profile hides every post you have.

---

## 8. ACCEPTED RISK REGISTER

Every finding from the five passes that this spec does **not** fix. Nothing is silently dropped.

| # | Finding | Disposition and reason |
|---|---|---|
| 1 | **FORGE-4 residual** — `trg_post_kind_shape_upd` omits the `k.active = 1` clause its INSERT twin has, and omits `price_currency` from its column list | **Not repaired.** `kind_key` is absent from every composer schema, so the weak twin is unreachable from this surface. Repairing it would newly refuse legitimate price and capacity edits on posts whose kind was later retired. Recorded in 022's header so the next writer of a kind-mutating path knows. |
| 2 | **EXTREMES-16** — `doc_too_large` is unreachable: `LIMITS.nodes`/`lines`/`chars` bind before `LIMITS.bytes` (ceiling ≈156 KB against a 200 KB limit) | **Branch kept, coverage claimed as zero.** Per evidence rule 6, `verify-markdown` records this code as never seen to fire and `markdown.js` gains a comment stating the domination, so a future limit change revisits it. Pretending it is covered is the failure mode; saying it is not is the fix. |
| 3 | **The daily media cap does not refund** (`trg_post_media_daily_cap_ins` counts `created_at` with no `deleted_at` filter) | **Deliberate schema behaviour, not a defect.** Handled by UI copy and by returning the two counters separately. |
| 4 | **No orphan-file sweeper.** Soft deletes leave bytes forever; cover changes and crashed ingests add more | **Deferred.** A sweep that deletes files whose rows exist is catastrophic, so it must join `post_media` and must ship in report-only mode first. `sweepQuarantine` already covers crashed uploads. Follow-up ticket. |
| 5 | **The author is not shown `removal_reason`** | **Product call, deferred.** `removedAt` is returned so an appeal is possible; the exact wording of a tripped rule is withheld from a possible abuser. Revisit with the appeals surface. |
| 6 | **`check-routes.mjs` blind spots** — it only sees a lowercase `router.`, a single-quoted path literal and a chain ending at `asyncRoute`; `uploadRouter.post('/progress-photos', …)` is already invisible; its header advertises an ':id is parsed, not interpolated' rule that is not implemented | **This spec conforms to the visible shape** (both composer routers use `const router`), so no composer route escapes. The existing blind spot and the phantom rule are **not** fixed — they are a gate change, not a feature change, and belong in their own commit. Named so it is not inherited silently. |
| 7 | **`verify:public` (claimed at `public/routes.js:8`) does not exist**; the rule it names is really enforced by `check-routes.mjs:174-197` under a different name | **Comment left wrong.** Fixing four inaccurate comments (`verify:public`, `check-public-text`, `check-trigger-messages`, the `:id` rule) is a separate documentation pass. This spec **implements** `check-public-text.mjs` (§9) so one of the four becomes true. |
| 8 | **`BlockNode`/`InlineNode` in `DocRenderer.tsx` are a hand-maintained mirror of `BLOCK_KINDS`/`INLINE_KINDS`** with nothing generating or checking one against the other | **Deferred.** This spec extends the existing types rather than declaring parallel ones, so the drift is not doubled; generating or gating them is out of scope. |
| 9 | **A brand-new coach cannot publish for 24 hours** (`min_account_age_s_to_publish` = 86400), and `smoke-run.mjs` mints accounts seconds before the suite | **Accepted as behaviour**, handled in tests by backdating `users.created_at` — the one thing the fixture fakes, and it fakes **time**, not a permission (§9). |
| 10 | **Composer JSON bodies up to ~176 KB** on `/api/v1/compose` | **Accepted.** Authenticated, rate-limited at 120/15 min per IP, and the parser is O(n) with hard node and link budgets. The rest of the product keeps the 64 KB cap. |
| 11 | **Two orphan `.webp` files if the process dies between the ingest and the row insert** | **Accepted.** Nothing serves a file without a row; the cost is disk. See #4. |
| 12 | **A moderator-removed post is fully read-only to its author**, and every edit affordance is removed rather than disabled | **Accepted** — the API answers 404/409 either way; a disabled button invites a proxy request. |

---

## 9. VERIFICATION PLAN

### 9.1 Gates wired into `check:all` (today it runs four of nine scripts that exist)

```
check:all = check:routes && check:worker-tx && check:body-writes && check:public-text
         && verify:schema && verify:013 && verify:021 && verify:022
         && verify:markdown && verify:migrations
```
A probe that only runs when somebody remembers is a snapshot, not a gate.

**`check-worker-tx.mjs` gains one rule** and one assertion:
- when the `changes === 0` exemption matches, **fail if any `.run(` appears earlier in the same body** — this is exactly the FATAL RACE-1 shape, and the gate currently passes it;
- the printed body count must be **22**, asserted, not observed. It matches `conn.transaction(() => {` literally, so a hoisted or parameterised closure is invisible to the ADR-0005 check and the count is the only evidence it saw the new work.

**`check-body-writes.mjs`** — §5.3.

**`check-public-text.mjs`** (the gate 021:321 claims exists) — walks `src/public/compose*.js` and fails if any `z.string()` bound for a public short-text column (`title`, `display_name`, `headline`, `alt`) is not wrapped in `displayText(`. It asserts a call shape, not a copy of the sanitiser.

### 9.2 `backend/scripts/verify-022.mjs`

Builds a throwaway DB from the **real** migration files (the `verify-021.mjs` pattern) and drives the **real** route handlers and worker functions — never a copy of their SQL (evidence rule 4). The single fixture lie is **time**: `users.created_at` is backdated to satisfy `min_account_age_s_to_publish`, as `verify-021.mjs` already does and says it does.

### 9.3 Assertions, and how each is SEEN TO FIRE

Evidence rule 6: a probe never seen to fire cannot be told apart from a clean subject. Each assertion below ships with a documented **break** that must be applied once, the failure observed, and the break reverted, before the phase is signed off. The break list lives in `verify-022.mjs`'s header as executable comments.

| # | Assertion | Break that must be seen to fail it |
|---|---|---|
| 1 | Publish is denied with `needs_guidelines` before acceptance and succeeds after | delete the `guidelines_acceptances` insert from `acceptGuidelinesTx` |
| 2 | Publish is denied with `too_new` for a fresh account | remove the fixture's `created_at` backdate |
| 3 | Publish is denied with `profile_not_published` when the profile is a draft | drop the profile-liveness EXISTS from `publishPostTx`'s UPDATE |
| 4 | The 11th publish in 24 h returns `quota_reached` with `used/max/nextSlotAt` | raise `post_publish_daily_max` to 11 |
| 5 | **Restore is denied after the active guidelines version is bumped** (FORGE-1) | drop `trg_post_restore_standing_upd` — the route pre-check must still refuse; drop **both** and the assertion must fail |
| 6 | Clearing `published_at` raises `published_at_is_write_once` | attempt it directly |
| 7 | A source-only edit (paragraph reflow, `- `→`* `) **succeeds** | restore `trg_post_body_moves_as_one_upd` |
| 8 | A `doc_version` bump + reparse of an unchanged source **succeeds**; a doc-only move with unchanged src and version **aborts** | remove the `NEW.doc_version IS OLD.doc_version` clause |
| 9 | `UPDATE coach_profiles SET bio_src = ?` alone leaves no stale `bio_doc` (route) and a doc-only move aborts (trigger) | drop `trg_profile_bio_doc_needs_a_source_upd` |
| 10 | An edit with a stale `expected_row_version` returns 409 `stale` and does **not** write | remove `AND row_version = ?` from the UPDATE |
| 11 | Two edits inside the same wall-clock second: the second gets 409 | replace `row_version` with `updated_at` — this must fail, proving RACE-3 |
| 12 | Create with the same key + different body → 409 `key_reused`; same key + same body → the ORIGINAL row | remove the title/body comparison from the probe |
| 13 | Create replay probe is owner-scoped | remove `author_user_id = ?` from the probe and assert coach B's key does not return coach A's post |
| 14 | Cover upload with the same key + different bytes → 409 `key_reused`; same bytes → the ORIGINAL descriptor and **no** new row | remove the `content_sha256` comparison |
| 15 | A second cover → 409 `cover_exists`, and the existing row is **untouched** | — (the destructive path does not exist; the assertion proves it) |
| 16 | An upload for another coach's `publicId` → 404 **and no file is written to `PUBLIC_MEDIA_DIR`** | move `requireCoverSlot` after `upload.single` |
| 17 | An upload to a withdrawn post → 404, no daily slot consumed | drop `p.deleted_at IS NULL` from `requireCoverSlot` |
| 18 | A `pub_` key resolves under `MEDIA_DIR/public/` and `resolveStoredPath('../../etc/passwd','public')` is null | remove the containment check |
| 19 | **A `post_media` row whose file is missing yields 404, not a process exit** | revert `public/routes.js` to `createReadStream(...).pipe(res)` — the harness must observe an uncaughtException |
| 20 | A 9 MiB upload → 413 with `code: payload_too_large`; two file parts → 400 | remove the `MulterError` branch from `errorHandler` |
| 21 | `display_name = '\u3000\u3000\u3000'`, `'\u200d'.repeat(120)` and `' a '` are all refused with a **field-specific 400** | remove `.trim()` / the joiner strip from `sanitizeDisplayText` |
| 22 | `body_src = 'x\ud83dy'` → 400 `malformed_text`; `body_src = '\\'` → 400 `no_visible_text` | remove the `isWellFormed` / empty-excerpt checks |
| 23 | A 20 000-character CJK body is **accepted** on `/compose/*` and a 20 000-character body is still rejected with 413 on any other route | remove the scoped `express.json` |
| 24 | Unknown / inactive kind, city, currency and specialty each produce a **named** 409 — never the string "this change is not allowed by the data model" | remove the reference probes and assert the generic message appears |
| 25 | `verified_at`, `published_at`, `removed_at`, `post_id`, `public_id`, `author_user_id` in any composer body → 400 unknown key | remove `.strict()` from one schema |
| 26 | `formatPrice(5000,'HUF',minorUnits=0)` renders `5 000 Ft` | restore the unconditional `/100` |
| 27 | Setting `public_surface_enabled = 0` empties `/public/posts`, `/public/coaches` and `/public/media/:key` | remove the term from `PUBLIC_POST` |
| 28 | Unpublish→publish does **not** move the profile in `/public/coaches?sort=recent` | revert `PROFILE_SORTS` to `published_at DESC` |
| 29 | `/public/coaches` `nextCursor` is not a bare integer and still pages correctly | revert to the raw `user_id` cursor |
| 30 | Every marketplace audit row has non-null `request_id`, `target_type`, INTEGER `target_id` | pass `req.id` (which does not exist) instead of `res.locals.requestId` |

### 9.4 Smoke and limits

- **`scripts/smoke.js`** gains the full first-run ladder against a live server: accept → create profile → publish profile → create draft → upload cover → publish → read it back anonymously at `/m/p/:publicId` **and fetch the cover bytes at `/public/media/:storageKey`** → withdraw → confirm 404 anonymously → restore → confirm 200.
- **`scripts/seed-marketplace.mjs`** — the repo has **no** reproducible way to create a `coach_profiles` or `coach_posts` row; the two posts in the dev database were inserted ad hoc. The composer ships the seed the read surface never needed, and it drives the real routes.
- **`scripts/smoke-limits.js`** gains all nine new limiters. `NODE_ENV=test` skips every limiter, so a limiter absent from that suite is a limiter never seen to fire.

---

**Sign-off condition.** `npm run check:all` green, `check-worker-tx` printing **22**, `verify-022` green, and the thirty breaks in §9.3 each applied once, observed to fail, and reverted — recorded in the phase log. A clean result is a statement about coverage before it is a statement about the subject.