# B-admin-polish - the backend fix round after the admin v2 security review

Base: pulse-int 966b625 (B-admin-accounts + B-admin-posts + B-admin-stats merged). Backend only, no
migration, no new route, no i18n.

## Source of the findings

`.pulse/review/security-admin-v2/FINDINGS.md` was never written: the security reviewer ran its eight
attack scripts (01:20-01:30, 2026-11-04) and stopped. The findings below are derived from the raw
attack outputs `.pulse/review/security-admin-v2/attacks/out-01.txt .. out-08.txt`. No REVIEW.md of
S-admin-accounts / S-admin-posts / S-admin-moderation existed at fix time, so no screen-review
backend item could be taken over.

| id | sev | attack | finding | status |
|----|-----|--------|---------|--------|
| H1 | high | 06 | `POST /admin/users/:id/enable` brings back a disabled ADMIN with a reason only; granting admin asks for the actor's password. A stolen admin session re-enabled a disabled admin X, X signed in as admin and kept that power after the stolen session was revoked (then disabled the owner). | fixed |
| H2 | high | 03 S1 / S3 | `signout-all` answered `{ replayed: true }` and did nothing when the account had no open refresh family; a copied access token of a device that had logged out kept working (200, sv not bumped, no audit row). `force-password-change` on an already flagged account was a replay even with a live session (refresh still 200). | fixed |
| M1 | medium | 01 | role / disable / enable (and the coin adjustment, the report resolve, the exercise moderation read/decision) read `:id` with `z.coerce.number()`: `0x10` acted on account 16, ` 5` on account 5 (`+5`, `05`, `5.0`, `5e0` likewise). | fixed |
| M2 | medium | 03 | a display name (admin rename and the user's own PATCH /auth/me, one validator) accepted RLM, ZWSP, ALM, tag characters, INVISIBLE TIMES, LINE / PARAGRAPH SEPARATOR, a lone surrogate, two Hangul fillers (a blank name) and a base letter with 119 combining marks. | fixed |
| M3 | medium | 03 / 07 | disable / enable reasons (and the coin note, the exercise rejection reason) were stored in the append-only audit_log with a NUL, a U+202E override or a lone surrogate. | fixed |
| L1 | low | 05 | the per-admin write budget is per domain: after the 60 account writes are spent, marketplace restore / remove and the coin adjustment still answer 200 (their own 60-buckets). Each bucket still bounds its own damage. | not fixed - listed |
| L2 | low | 08 | account search with `q` on ~50k accounts is a full scan (≈290 ms; a burst of 40 took 716 ms wall and an ordinary user read 270 ms during it). Bounded by the 300 / 15 min read budget. | not fixed - listed |
| L3 | low | 03 | `/admin/marketplace/posts?cursor=` accepts negative integers (`[-1,-1]`): bound parameters, it only yields a different page. | not fixed - listed |
| D1 | owner | 04 V3 | a post hidden by its author (profile unpublished) and then EDITED shows the never-public new text to the admin (`excerpt`); drafts are withheld, a hidden-then-edited post is not. Needs a product decision (withhold the body of every currently invisible post that is not removed? keep a last-public snapshot?). | not fixed - owner decision |
| - | none | 01 | "HOLE? disabledAdmin -> 403": the attack disabled the admin straight in the DB, so the 30-second sv cache still authenticated the token and assertAdmin refused it (403). Correct denial; the API's disable path drops the cache. | not a finding |

## Contract changes (what a client sees)

### POST /admin/users/:id/enable - re-enabling an ADMIN carries the grant's step-up

Body: `{ reason: string (1..2000, see reasons below), password?: string (1..200) }`, strict.

- target role is `admin` and no `password` -> **401** `{ error: 're-enabling an admin requires your password', code: 'unauthorized', reason: 'step_up_required' }` (the same envelope as the admin grant on `/role`). Nothing written.
- a `password` that is not the ACTOR's own -> **401** `{ error: 'invalid credentials', code: 'unauthorized' }`.
- the role is checked inside `setAccountDisabledTx` under the write lock (`stepUp` argument), not from a read before it.
- a non-admin target: unchanged (reason only). Enabling an already enabled admin: a replay, no password needed (nothing is handed over).

Frontend impact (S-admin-accounts): the enable sheet of a disabled ADMIN account needs the same password field the "Admin" role sheet has (frame 2b-role); the copy "Az admin jogosultság visszaadásához add meg a saját jelszavadat" style. Not in any approved frame - see forOrchestrator.

### POST /admin/users/:id/signout-all and /force-password-change - replay only when nothing can be signed in

`replayed: true` now means: no open refresh family AND no access token minted since this action last
ran (a refresh_tokens row created inside one access lifetime after the last applied action's
watermark - rowid above `upTo`, or created after its second; db/tx/admin-accounts.js `liveSessions`).
Otherwise the action applies: refresh tokens revoked, session version bumped, one audit row
(detail `{ sessions, upTo }` / `{ upTo, alreadyFlagged }`). Concurrent calls still apply exactly once.
`force-password-change` on a flagged account WITH a session now applies (ends that session).

### ids

Every admin route with a numeric `:id` accepts a canonical decimal only (`/^[1-9]\d{0,9}$/`, at most
2^31-1; `backend/src/admin/params.js`). The older routes keep the status they answered for a bad id
(role / disable / enable 404, coins 400, report resolve 404, exercise moderation 400 via the error
handler).

### names (`backend/src/lib/display-name.js` `hasInvisible`)

Refused with 400: malformed UTF-16; every `\p{Cf}` except a ZWJ inside an emoji sequence, a ZWJ after
a virama and a ZWNJ between letters; `\p{Zl}` / `\p{Zp}`; the Hangul fillers and the braille blank; a
run of 4+ combining marks. `A<ZWJ>B` (renders as "AB") was allowed before and is refused now.

### reasons (`backend/src/lib/reason-text.js` `reasonText`)

Disable / enable reason (2000), coin note (280), exercise rejection reason (0..500): NFC, CRLF -> LF,
ZWSP / BOM / soft hyphen stripped, then refused with 400 if they carry malformed UTF-16, a C0 / C1
control other than TAB and LF, a bidi embedding / override / isolate or LRM / RLM / ALM. Bounds count
code points after that. Line breaks are allowed.

## Proof

`backend/scripts/smoke/admin-polish.js` (`node scripts/smoke-run.mjs --only=admin-polish`):

- on pulse-int 966b625 (this package's `src/` stashed): **47 FAIL / 57 PASS** - every H1, H2, M1, M2, M3 check red;
- on this branch: **104 PASS / 0 FAIL**.

Two checks of the closed B-admin-accounts smoke encoded the old behaviour and were changed with the fix:
`'zero-width joiner (allowed)', 'A<ZWJ>B'` (now refused; an emoji ZWJ sequence is the allowed probe) and
`replay: already flagged -> replayed:true` while the person was signed in (now applied and the session
ends; a third force with nothing signed in is the replay). `scripts/verify-admin-accounts.mjs`: the two
EnableBody anchors follow the new line, mutant 2 (U+202E out of CONTROLS) is now caught by the account
search check because names are also refused by `hasInvisible`; 16/16 caught.

Gates (fresh DB migrated to 35 + seed:dev-users): check:all 31 steps green, `npm run smoke` 1328 passed
0 failed, verify-admin-accounts 16/16, frontend build green, verify:gates (see handoff.json).

Environment note: on this machine Node 24.16 segfaults now and then on process exit of the
better-sqlite3 / Piscina scripts (rc 139 / 0xC0000005, e.g. seed-taxonomy-i18n in smoke-run setup,
verify-last-admin 1 of 3 runs). The step is re-run; it is not a test failure and not caused by this
package (seen on the stashed pulse-int code as well).

# Round 2 (2026-11-05) - the backend items of the S-admin-accounts screen review

Base: pulse-int a7df161 (round 1 squash-merged as 8bf476b, S-admin-accounts on top). No migration, no
new route, no i18n. `.pulse/review/security-admin-v2/FINDINGS.md` still does not exist (the round-1
table above is still the security review's list); of the three screen reviews only
`.pulse/review/S-admin-accounts/REVIEW.md` exists (S-admin-posts / S-admin-moderation have none yet).

| id | review item | backend fix | status |
|----|-------------|-------------|--------|
| A1 | #2 (blocking) NAPLO prints raw machine codes; routine rows push the admin events out of the last five | `adminAccountDetailQuery` (db/tx/admin-accounts.js) lists only the account actions: `user.role.change`, `user.disable`, `user.enable`, `user.name.change`, `user.lockout.reset`, `user.sessions.revoke`, `user.password.force`, `user.credentials.change`, `coin.admin.adjust` - exactly the `adminUsers.audit.*` keys of the bundles. Static SQL literals, no new parameter. | fixed (backend half; the client fallback `defaultValue: action` is the screen lane's) |
| A2 | #9c a wrong step-up password is POSTed twice (401 -> refresh -> replay) | step-up failures answer `401 { error: 'invalid credentials', code: 'unauthorized', reason: 'step_up_failed' }` (`sendStepUpFailed`, lib/http.js) on `/admin/users/:id/role`, `/admin/users/:id/enable` and `/me/delete`; `apiWithRefresh` (frontend/src/lib/api.ts) does not refresh on a 401 whose `reason` is `step_up_required` / `step_up_failed`. A real session failure (requireAuth) carries no reason, so it still refreshes. | fixed |
| A3 | #11 `/admin/accounts/:id/coins` for a missing account draws an empty ledger | `GET /admin/coins/ledger?user_id=<no such account>` -> **404** `not_found` (ledger rows cascade with the account, so an erased account has none to hide). `user_id` / `actor_id` are canonical decimal ids (`idString`, admin/params.js): `0x10`, ` 5`, `1e1`, `05`, `1.0` are 400 (they read as accounts 16, 5, 10, 5, 1 before). | fixed (the ledger page must draw its "not found" state on the 404 - screen lane) |
| - | #9a/#9b step-up field keeps its error / "Ujra" resends the old password | client only | screen lane |
| - | #1 offline writes queue silently (TanStack networkMode) | client only | screen lane |
| - | #10 a second admin acting on stale state is not told | the server already answers `{ replayed: true }` for the late disable / enable; the sheet can say "already disabled" from it | screen lane |
| - | #12 display name accepts markup (`<script>`) | NOT changed - which characters a name may carry is a product rule shared with PATCH /auth/me; React escapes it and no non-escaping sink exists today | owner decision (forOrchestrator) |
| L3 | (security round 1) posts cursor with negative keys | NOT changed: the closed B-admin-posts smoke asserts on purpose that a well-formed cursor at the numeric extremes is an ordinary page; bound parameters, harmless | not fixed - listed |

## Proof (round 2)

`backend/scripts/smoke/admin-polish-2.js` (runs with `--only=admin-polish` and in the full smoke):

- on pulse-int a7df161 (`git checkout pulse-int -- backend/src`, this branch's smoke files): **15 FAIL / 125 PASS** - every A1, A2 step-up-reason, A3 404 and A3 id-spelling check red;
- on this branch: **140 PASS / 0 FAIL** (round 1 104 + round 2 36).

The client half of A2 (`frontend/src/lib/api.ts`), `proof/client-stepup-refresh.mjs` (transpiles a copy
of api.ts with the frontend's TypeScript, fakes `fetch`, counts requests):

```
OLD  step-up 401 -> 3 requests  POST /role, POST /auth/refresh, POST /role
NEW  step-up 401 -> 1 requests  POST /role
     session 401 -> 3 requests  (GET, refresh, GET) - unchanged on both
```
