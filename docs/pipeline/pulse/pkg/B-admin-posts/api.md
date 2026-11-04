# B-admin-posts — the admin side of marketplace posts (no migration)

Backend for the frontend lane S-admin-posts (Piactér > Posztok list, the post inspect page, restore).
Owner decisions 2026-11-03: the admin **views** every post, **takes it down** (required reason) and
**restores** it; the admin does **not** edit post text. Frames: `admin-market-v2`, `admin-post-detail-1/2/3`,
`-2-takedown`, `-2-restore`, `-2-draft`.

House rules unchanged: `/api/v1`, cookie auth, `X-CSRF: 1` on writes, JSON bodies, `{ error, code, requestId }`
error envelope, `.strict()` bodies/queries, times are **epoch seconds**. Every route below is
`requireAuth` + `requireRole('admin')` + a **database** re-check of the role (reads: `assertAdmin`; the write: under
the write lock inside the transaction) + two rate limiters (per IP and per admin account).

| Route | Purpose | Success | Errors |
|---|---|---|---|
| `GET /admin/marketplace/posts` | the list | 200 | 400 `validation_error`, 401, 403, 429 |
| `GET /admin/marketplace/posts/:publicId` | the inspect page, one request | 200 | 400 (bad query), 401, 403, 404 `not_found` |
| `POST /admin/marketplace/posts/:publicId/restore` | lift a take-down | 200 | 400, 401, 403, 404, 409 `conflict` / `reason:'not_removed'` |
| `GET /admin/marketplace/media/:key` | a post picture for the admin page | 200 `image/webp` | 401, 403, 404 |
| `POST /admin/marketplace/remove` | **existing** take-down, reused (response extended) | 200 | 400, 401, 403, 404, 409 |

`:publicId` is the 12-character public id (`/^[A-Za-z0-9_-]{12}$/`). A malformed id and an unknown id are the same
404. `:key` is `pub_<32 hex>.webp`.

## 1. State of a post

Derived on the server, one precedence: **`removed` > `withdrawn` > `draft` > `live`**.

| state | meaning |
|---|---|
| `draft` | `published_at` NULL, not withdrawn, not removed (private to the author) |
| `live` | published, not withdrawn, not removed. **Live is a row state, not "visible"**: see `visible` / `publicVisibility` |
| `withdrawn` | the author withdrew it (`deleted_at`) |
| `removed` | a moderator took it down (`removed_at` + remover + reason). A removed *draft* is `removed` |

The design's "Visszavonva" = `withdrawn`, "Levéve" = `removed`.

## 2. `GET /admin/marketplace/posts`

Query (all optional, `.strict()`):

| Key | Values | Default |
|---|---|---|
| `q` | trimmed, 1..80 chars, no control characters. Matches the **title**, the author **handle**, the author's profile **display name** and account display name. A leading `@` is ignored (`@kovacs` = `kovacs`) | none |
| `state` | `all` `draft` `live` `withdrawn` `removed` | `all` |
| `kind` | a `post_kinds` key (`program` `event` `announcement`), regex-shaped | none |
| `sort` | `newest` (publication date, creation date for a draft) · `oldest` · `reports` (most **open** reports first, then newest) | `newest` |
| `cursor` | the `nextCursor` of the previous page, for the **same** sort | first page |
| `limit` | 1..50 | 20 |

Search design (decided and justified): substring `LIKE` with `%`, `_` and `\` **escaped** (a search for `%` finds titles
containing a percent sign) on title / handle / names, OR an **FTS5 token-prefix** match **column-filtered to the title**
(accent- and case-insensitive: `guggolas` finds "Guggolás"). The FTS index also holds every `body_src`, drafts
included, so an unfiltered MATCH would be an oracle for the words of a private draft; the filter makes the search
unable to look inside any body. Limits: names with non-ASCII letters match case-sensitively and with their accents
(LIKE), titles match both ways.

Answer:

```json
{
  "posts": [ { "id": "Ap0abc1234xy", "title": "Guggolás mesterkurzus", "kind": "program", "state": "live",
               "createdAt": 1790000000, "publishedAt": 1790003600, "withdrawnAt": null, "removedAt": null,
               "openReports": 2,
               "authorId": 17, "authorHandle": "kovacs-peter", "authorName": "Kovács Péter", "authorRole": "coach",
               "authorDisabled": false, "visible": true } ],
  "total": 31,
  "nextCursor": "WzE3OTAwMDM2MDAsNDJd",
  "query": { "q": null, "state": "all", "kind": null, "sort": "newest" }
}
```

* `total` counts the **filtered** set (not the page): "7 / 31 poszt".
* `openReports` counts reports with status `open`.
* `visible` = this post is on the public surface **right now** (the same predicate every public read uses).
  `state: 'live'` with `visible: false` means the post is hidden by something other than its own state: the author is
  disabled or demoted, or the profile is unpublished / removed (the inspect page says which).
* The row date to print is `publishedAt ?? createdAt`.
* `authorHandle` / `authorName` are `null` / the account name when the author has no profile row.
* The row carries **no body, no e-mail, no row id**.
* A `cursor` that is not exactly the tuple the chosen sort produces (garbage, wrong width, non-integers, > 200 chars) is
  a **400**, not a silent restart.

## 3. `GET /admin/marketplace/posts/:publicId`

Optional `?body=full` adds the rendered document tree; without it only the excerpt travels. Any other query key or value
is a 400. One database snapshot answers everything.

```json
{
  "post": {
    "id": "Ap0abc1234xy", "title": "…", "kind": "event", "state": "live",
    "city": { "key": "budapest", "name": "Budapest" },
    "eventAt": 1792000000, "eventTz": "Europe/Budapest", "capacity": 24,
    "price": { "minor": 45000, "currency": "HUF", "minorUnits": 0 },
    "createdAt": 1790000000, "publishedAt": 1790003600, "withdrawnAt": null, "removedAt": null,
    "removal": { "at": 1790100000, "by": { "id": 3, "email": "admin@…", "displayName": "Takács Dániel" }, "reason": "…" },
    "updatedAt": 1790100000, "rowVersion": 3,
    "bodyWithheld": false,
    "body": { "excerpt": "…", "docVersion": 1, "doc": null },
    "mediaWithheld": false,
    "media": [ { "role": "cover", "key": "pub_….webp", "thumbKey": "pub_….webp", "width": 1600, "height": 900,
                 "alt": null, "url": "/api/v1/admin/marketplace/media/pub_….webp",
                 "thumbUrl": "/api/v1/admin/marketplace/media/pub_….webp" } ],
    "publicVisibility": { "visible": true, "hiddenBy": [] }
  },
  "author": { "id": 17, "handle": "kovacs-peter", "displayName": "Kovács Péter", "role": "coach",
              "disabled": false, "disabledAt": null,
              "profile": { "published": true, "removed": false, "verified": true } },
  "timeline": [ { "kind": "created", "at": 1790000000 }, { "kind": "published", "at": 1790003600 },
                { "kind": "removed", "at": 1790100000, "by": { "id": 3, "email": "…", "displayName": "…" }, "reason": "…" } ],
  "moderationLog": [ { "action": "remove", "at": 1790100000, "by": { "id": 3, "email": "…", "displayName": "…" },
                       "reason": "…", "note": null, "reportId": null, "reportStatus": null, "removed": true } ],
  "reports": { "total": 2, "open": 2, "distinctReporters": 2,
               "items": [ { "id": 41, "reason": "scam", "severity": 80, "note": null, "snapshot": "…",
                            "snapshotTruncated": false, "status": "open", "closed": false,
                            "createdAt": 1790050000, "resolvedAt": null, "resolutionNote": null } ] }
}
```

* **The draft rule.** A post that was **never published** (`publishedAt: null`) is private to its author: the answer has
  `bodyWithheld: true`, `body: null`, `mediaWithheld: true`, `media: []` — even with `?body=full`, and also when the draft was
  later removed by a moderator. Metadata (title, kind, dates, author, state) is shown. Frame `admin-post-detail-2-draft`
  prints "Nem nyilvános · csak a szerző látja." from `bodyWithheld`.
* A post that **was** published stays readable in every later state (`withdrawn`, `removed`): body excerpt, pictures,
  reports — that content was public and is what a report is about.
* `post.price` is **display only**. `eventAt` / `eventTz` / `capacity` are null for kinds that do not have them.
* `post.removal` is non-null only while `state === 'removed'`. `timeline` is the current-state timeline (oldest first):
  `created`, `published`, `withdrawn`, `removed`. `moderationLog` is the audit history of this post (newest first, max 50):
  `remove`, `restore`, `resolve` — because a restore clears the removal columns, only the log remembers that a post was
  removed before. `by` is `{ id, email, displayName }` or `null` (an erased admin).
* **`publicVisibility.hiddenBy`** — why the post is not on the open internet, any of: `draft`, `withdrawn`, `removed`,
  `author_disabled`, `author_not_coach`, `profile_unpublished`, `profile_removed`. Empty and `visible: true` = public.
  **Design note:** frame `admin-post-detail-3` says "A szerző le van tiltva, de a posztja még látszik." That sentence was
  true before this package; **after the visibility fix a disabled author's post is NOT visible** (see section 7). Print
  "A szerző le van tiltva, ezért a poszt nem látszik." (new key) when `hiddenBy` contains `author_disabled`; the
  coordinated-take-down offer is then about taking the profile down too, not about a post that is still showing.
* **Reports never carry reporter identity** (no id, no e-mail, no name). Open reports sort first, then newest; max 30.
  `severity` is the reason's `severity_rank` (0..100). `snapshot` exists only while the report is open (a trigger clears
  it when the case closes), so a closed report shows `status`, `closed`, `resolvedAt`, `resolutionNote` only. `report.id`
  is what `POST /admin/marketplace/reports/:id/resolve` takes (body `{status, note, remove, removal_reason}`, unchanged).
* `author.id` is for the link to the account page. `author.displayName` is the public profile name, else the account name.
* An unknown / malformed id: 404.

## 4. `POST /admin/marketplace/posts/:publicId/restore`

Body (`.strict()`, optional): `{ "note"?: string | null }` — 1..500 characters after sanitising; an empty body or no body
at all is fine.

* **200** `{ "restored": true, "replayed": false, "post": { "id", "state": "live" | "draft" | "withdrawn", "rowVersion": n, "visible": boolean } }`.
  `visible: false` after a restore means the post came back but something else still hides it (disabled author, …):
  tell the admin, do not claim "újra megjelenik a nyilvános oldalon".
* **404** unknown / malformed id · **403** the database says the caller is not (or no longer) an admin · **400** bad body.
* **409** `{ "error": "conflict", "code": "conflict", "reason": "not_removed", "requestId" }` — the post is not currently
  removed: a second restore, or the loser of a race (two admins, or restore vs take-down). **Nothing is written** on a 409.

What it does, in **one** `IMMEDIATE` transaction (`restoreRemovedPostTx`): re-reads the admin under the write lock;
requires the post to be removed; clears `removed_at`, `removed_by`, `removal_reason` and bumps `row_version` in one
guarded `UPDATE ... WHERE removed_at IS NOT NULL`; inserts **one** audit row `marketplace.moderation.restore`
(actor, `coach_post` target, request id, and in `detail` the note and the previous remover / reason, because the
statement itself clears them). Replay-safe: the second call is the 409 above and adds no audit row.

## 5. `GET /admin/marketplace/media/:key`

Serves the 1600 px image or the 480 px thumbnail of a post picture to a signed-in admin: `200 image/webp`,
`Cache-Control: private, max-age=300`, `nosniff`. Exists because the public route gates on the public predicate, so the
cover of a withdrawn or removed post would be a 404 on the very page that reviews it. It serves a picture only if its
post was **ever published** and the picture is not deleted: a draft's pictures are private, and everything else is the
same single 404. Use the `url` / `thumbUrl` the detail answer gives; they are plain `<img src>` same-origin URLs (cookies).

## 6. `POST /admin/marketplace/remove` (existing, reused)

Take-down of a post by its **public id**: body `{ "post_id": "<12 chars>", "handle": null, "removal_reason": "…" }`
(exactly one of `post_id` / `handle`; reason required, 1..2000). Unchanged behaviour: a second take-down is a replay
and keeps the **first** remover and reason. Changes in this package:

* the answer now says what was taken down so the page can refresh: `{ "removed": true, "replayed": boolean, "target": { "kind": "post" | "profile", "id": "<publicId or handle>" }, "state": "removed" }`;
* a **per-admin-account** limiter (60 / 15 min) next to the per-IP one, on this route and on the other two admin routes of
  that file (`GET /admin/marketplace/reports`, `POST /admin/marketplace/reports/:id/resolve`);
* it still accepts a draft or a withdrawn post (the design hides the button for them; the server does not forbid it).

"Szerző profiljának levétele" is the same route with `handle`. The coordinated "post and author profile in one action" is
**not** built (two calls); see follow-ups.

## 7. The visibility gap (security) — fixed in `src/public/visibility.js`

`PUBLIC_POST` and `PUBLIC_PROFILE` did not look at the author's **account**, so disabling or demoting a coach left their
published posts, profile page, directory entry and post pictures on the open internet (the write side re-reads
`users.disabled_at` / `users.role`; the read side did not). Both predicates now require the author to be an **enabled
`coach` or `admin`** (a correlated `EXISTS` on `users`, binds no parameter, takes effect on the next request in both
directions). Every public read composes these two constants, so one change covers: `GET /public/posts` (feed, city, kind,
sort), `/public/posts/:id`, `/public/search` (FTS), `/public/coaches` (directory), `/public/coaches/:handle` (profile and
post grid), `/public/media/:key` (pictures). There is no sitemap or feed route. The report lookup in `fileReportTx`
(worker.js) kept its own hand-copied predicate that had drifted; it now composes the same constants, so a hidden
post / profile can no longer be reported (404).

Regression test: `scripts/smoke/admin-posts.js` section "visibility" disables an author through the real
`POST /admin/users/:id/disable`, asserts all eight public reads (post, feed, search, profile, post grid, directory, image,
thumbnail) are gone and the report is 404, enables and asserts they are back, then demotes to `user` and promotes back.

## 8. Migration

**None. 036 is NOT used.** Restoring is possible with the 021/022 triggers as they are: `trg_post_removal_pair_upd`
accepts "both NULL"; `trg_post_removed_by_admin_upd` / `trg_post_removal_reasoned_upd` fire only when a value is *set*;
`trg_post_frozen_while_removed_upd` fires only on content columns; `published_at` write-once is untouched; the
publish-standing and restore-standing triggers watch `published_at` / `deleted_at`, not `removed_at`. The audit trigger
`trg_audit_log_marketplace_complete` is satisfied (request id, target type, target id, actor). The owner does not need to
coordinate a new migration number for this package.

## 9. TypeScript types (copy into `frontend/src/features/admin/**` or `lib/admin-api.ts`)

```ts
export type AdminPostState = 'draft' | 'live' | 'withdrawn' | 'removed';
export type AdminPostStateFilter = 'all' | AdminPostState;
export type AdminPostSort = 'newest' | 'oldest' | 'reports';
export type AdminPostKind = 'program' | 'event' | 'announcement'; // post_kinds keys; treat as string

export interface AdminPostRow {
  id: string;                       // 12-char public id
  title: string;
  kind: string;
  state: AdminPostState;
  createdAt: number;                // epoch seconds
  publishedAt: number | null;       // print publishedAt ?? createdAt
  withdrawnAt: number | null;
  removedAt: number | null;
  openReports: number;
  authorId: number;
  authorHandle: string | null;
  authorName: string | null;
  authorRole: 'user' | 'coach' | 'admin';
  authorDisabled: boolean;
  visible: boolean;                 // on the public surface right now
}

export interface AdminPostList {
  posts: AdminPostRow[];
  total: number;                    // size of the filtered set
  nextCursor: string | null;
  query: { q: string | null; state: AdminPostStateFilter; kind: string | null; sort: AdminPostSort };
}

export interface AdminPerson { id: number; email: string; displayName: string | null }

export type HiddenBy =
  | 'draft' | 'withdrawn' | 'removed'
  | 'author_disabled' | 'author_not_coach' | 'profile_unpublished' | 'profile_removed';

export interface AdminPostMedia {
  role: 'cover' | 'gallery';
  key: string; thumbKey: string;
  width: number; height: number; alt: string | null;
  url: string; thumbUrl: string;    // same-origin, cookie-authenticated <img src>
}

export interface AdminPostDetail {
  post: {
    id: string; title: string; kind: string; state: AdminPostState;
    city: { key: string; name: string } | null;
    eventAt: number | null; eventTz: string | null; capacity: number | null;
    price: { minor: number; currency: string; minorUnits: number } | null; // display only
    createdAt: number; publishedAt: number | null; withdrawnAt: number | null; removedAt: number | null;
    removal: { at: number; by: AdminPerson | null; reason: string | null } | null;
    updatedAt: number; rowVersion: number;
    bodyWithheld: boolean;          // true = never published: body and media are private to the author
    body: { excerpt: string; docVersion: number; doc: unknown | null } | null; // doc only with ?body=full
    mediaWithheld: boolean;
    media: AdminPostMedia[];        // cover first
    publicVisibility: { visible: boolean; hiddenBy: HiddenBy[] };
  };
  author: {
    id: number; handle: string | null; displayName: string | null;
    role: 'user' | 'coach' | 'admin';
    disabled: boolean; disabledAt: number | null;
    profile: { published: boolean; removed: boolean; verified: boolean } | null;
  };
  timeline: Array<
    | { kind: 'created' | 'published' | 'withdrawn'; at: number }
    | { kind: 'removed'; at: number; by: AdminPerson | null; reason: string | null }
  >;
  moderationLog: Array<{
    action: 'remove' | 'restore' | 'resolve';
    at: number; by: AdminPerson | null;
    reason: string | null; note: string | null;
    reportId: number | null; reportStatus: string | null; removed: boolean;
  }>;
  reports: {
    total: number; open: number; distinctReporters: number;
    items: Array<{
      id: number; reason: string; severity: number; note: string | null;
      snapshot: string | null; snapshotTruncated: boolean;
      status: 'open' | 'triaged' | 'upheld' | 'rejected' | 'duplicate'; closed: boolean;
      createdAt: number; resolvedAt: number | null; resolutionNote: string | null;
    }>;
  };
}

export interface AdminPostRestoreResult {
  restored: true; replayed: false;
  post: { id: string; state: AdminPostState; rowVersion: number; visible: boolean };
}
export interface AdminRemoveResult {
  removed: true; replayed: boolean;
  target: { kind: 'post' | 'profile'; id: string }; state: 'removed';
}
```

Error handling for the frontend: branch on `code` (`validation_error` 400, `unauthorized` 401, `forbidden` 403,
`not_found` 404, `conflict` 409 with `reason`, `rate_limited` 429), never on `error` text. `409 not_removed` on restore
means "somebody else already restored it": reload the post, show the live state, no error toast.

## 10. Proof

* `scripts/smoke/admin-posts.js`: 187 assertions (forge / replay / race / IDOR / extremes + the visibility matrix +
  a static check that every new route carries both limiter tiers). Runs inside `npm run smoke` and alone with
  `node scripts/smoke-run.mjs --only=admin-posts`.
* `scripts/mutants-admin-posts.mjs`: 26 planted defects, applied one at a time to the real source; each must turn the
  section red. Result recorded in the hand-in report (not part of `check:all`; it rewrites source while it runs).
