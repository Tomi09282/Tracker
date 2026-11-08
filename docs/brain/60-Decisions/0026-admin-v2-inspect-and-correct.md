---
type: adr
title: ADR-0026 The admin inspects and corrects accounts and posts; it never reads health content, and every privileged write is re-checked, stepped-up and audited
status: accepted
date: 2026-11-08
tags: [decision, adr, admin, security, marketplace, statistics, backend, frontend]
---

# ADR-0026 — Admin v2: inspect and correct, never read

**Context.** Until November 2026 the admin surface was a user search, a moderation queue and a
metrics page. It could list accounts but not look at one, take a marketplace post down but not
bring it back, and it counted things without saying what the numbers meant. On **2026-11-03** the
owner decided four things: (1) a per-account page the admin can inspect and act on, (2) a
marketplace post page where the admin views every post, takes it down with a required reason and
restores it, **without editing its text**, (3) a cleaner Moderáció with a compact statistics panel
and a door to a detailed Statistics page, (4) lists that page with "Továbbiak". The work was built
as three backend packages (`B-admin-accounts`, `B-admin-posts`, `B-admin-stats`), three frontend
packages (`S-admin-accounts`, `S-admin-posts`, `S-admin-moderation`) and two fix rounds after
independent security and screen reviews (`B-admin-polish`, `S-admin-fix`). The screens are in
[[admin-v2]]; the per-package hand-ins are under `docs/pipeline/pulse/pkg/`.

An admin is the most powerful account in the product and the one whose mistakes are least visible,
so most of the decisions below are about what an admin is **not** allowed to do or see.

## Decision

1. **The admin sees counts, never content.** The account page's activity block is four numbers
   (completed workouts, food-log entries, measurements, photos) under the note "A tartalom privát:
   az admin csak a darabszámot látja." A post that was never published is private to its author:
   the post page answers `bodyWithheld: true` with no body and no media, even with `?body=full`,
   and even after a moderator removed the draft. The Statistics page has no per-person drill-down
   and no query selects a name, e-mail or id (the smoke asserts it). The audit `detail` is never
   returned to the page.

2. **The database, not the token, decides who is an admin.** Every admin route is `requireAuth` +
   `requireRole('admin')` and then re-reads the caller as an **enabled admin in the database**
   (reads through `assertAdmin`, writes inside the transaction under the write lock). A token that
   still says admin after the account was demoted or disabled gets 403. A non-admin always gets 403,
   never 404, so no admin route is an existence oracle.

3. **A privilege that can be stolen needs the actor's own password.** Granting `admin` already did.
   The security review found that **re-enabling a disabled admin did not**: a stolen admin session
   could revive a disabled admin, who then kept admin power after the stolen session was revoked.
   Re-enabling an admin target now carries the same step-up, checked inside
   `setAccountDisabledTx` under the lock. Step-up failures answer `reason: 'step_up_required'` /
   `'step_up_failed'`, and the client does not refresh the session on them (a wrong password used to
   be POSTed twice).

4. **One real effect, one audit row, and replay is a 200.** Every account write returns
   `replayed: boolean`; an action that finds the account already in the requested state writes
   nothing and adds no audit row. `signout-all` and `force-password-change` count as a replay only
   when **nothing can be signed in** (no open refresh family and no access token minted since the
   action last ran) — the first version returned a replay while a copied access token still worked.
   Restore is a separate route from take-down; a second restore is `409 not_removed` and writes
   nothing. Because a restore clears the removal columns, the **moderation log is the only memory**
   that a post was ever removed, and the audit row records the previous remover and reason.

5. **Public visibility follows the author's account.** `PUBLIC_POST` and `PUBLIC_PROFILE`
   (`backend/src/public/visibility.js`) now require the author to be an **enabled coach or admin**.
   Before this, disabling or demoting a coach left their published posts, profile, directory entry
   and pictures on the open internet, because the write side re-read `users.disabled_at` and the read
   side did not. Every public read composes those two constants, so one change covers feed, post,
   search, directory, profile, pictures and thumbnails, and `fileReportTx` composes them too, so a
   hidden post can no longer be reported. The admin's own picture route serves a picture only if its
   post was ever published, because the public route would 404 the cover of the very post being
   reviewed.

6. **Statistics say what they measure.** There is no DAU or MAU, because the product stores no
   last-seen time; the series is `loggedPeople` — distinct people who logged a workout or a meal on
   a local day — and the page prints that note. Every series carries its clock (`local_date`, `utc`
   or `epoch`); windows end on the UTC calendar date; money stays in integer minor units; the window
   is exactly 7, 30 or 90 and anything else is a 400. Results are cached single-flight for 45 s
   (activity half of the panel 30 s), but the two numbers that sit directly above a list
   (`moderationPending`, `openReports`) are live, because a count that disagrees with the list under
   it reads as a bug.

7. **Identifiers and free text are validated as a security boundary.** A numeric `:id` is a
   canonical decimal (`/^[1-9]\d{0,9}$/`, at most 2^31-1): `0x10`, ` 5`, `05`, `5e0` and `5.0` used to
   act on accounts 16 and 5. A display name rejects invisible, bidirectional and control characters
   and runs of combining marks; a disable/enable reason or coin note is normalised and refused when
   it carries malformed UTF-16, C0/C1 controls or bidi overrides. The reason is that `audit_log` is
   append-only and outlives the person, so whatever reaches it stays.

8. **No migration.** Everything fits the existing schema; migration 036 was not used and the last one
   is still 035.

## What the reviews found

One independent security review (eight attack scripts, 2026-11-04) and the independent screen
reviews changed the code in three fix rounds — `B-admin-polish` round 1 (the security findings) and
round 2 (the backend items of the account-screen review), then `S-admin-fix` (the frontend items); the
full tables are in `pkg/B-admin-polish/api.md`. The two **high** findings were the admin re-enable without step-up
(decision 3) and `signout-all` doing nothing for a copied token (decision 4); three **medium**
findings were the loose `:id` spelling, invisible characters in names and bad characters in audit
text (decision 7). The marketplace visibility gap (decision 5) was found and fixed inside the
marketplace package (`B-admin-posts`). Each is covered by a regression in the smoke suite
(`scripts/smoke/admin-accounts`, `admin-posts`, `admin-statistics`, `admin-polish`, `admin-polish-2`),
and planted-defect checks prove those assertions go red when the code is broken:
`mutants-admin-posts.mjs` (26 planted defects), `verify-admin-accounts.mjs` (16 of 16 caught) and the
planted defects inside the statistics section.

## Verified on 2026-11-08, on the integration tip, by hand

Frontend `build` and `verify:gates` (78 passed, 7 dormant) green; backend `check:all` green and
`smoke` 1364 passed / 0 failed. In a browser, against a throwaway database: the Moderáció panel's six
figures and the Statistics page's six blocks equal what the API returns; the account list
(search `kovacs` finds `Kovács`, paging "24 / 28"); the disabled author's account page; the own-account
page hides role, disable and coin rows; a disabled coach's post answers **404** to an anonymous visitor
and drops out of the public feed while an enabled coach's post stays, and the admin sees
`hiddenBy: ["author_disabled"]`; re-enabling a disabled admin answers `401 step_up_required`, then
`401 step_up_failed`, then 200 with the right password; restoring a removed post goes live, the
second restore is 409 with no new audit row.

## Consequences

- Several things an admin would expect are deliberately absent: editing post text, reading a
  workout or a photo, a per-person view in Statistics, a coordinated "post and author profile in one
  action" (two calls), and a profile restore.
- **Open, and the owner's to rule** (each is recorded in `docs/pipeline/pulse/deviations.md`,
  DEV-094 … DEV-100, or in `pkg/B-admin-polish/api.md`):
  - *D1* — the text of a post its author hid and then **edited** is shown to the admin, although it
    never was public; a draft is withheld, a hidden-then-edited post is not.
  - A display name may carry markup (`<script>`). React escapes it and no non-escaping sink exists,
    but which characters a name may have is a product rule shared with `PATCH /auth/me`.
  - DEV-096 — a taken-down **author profile** has no way back; DEV-099 — the moderation queue lists
    its first 50 only and has no cursor; DEV-097 — three post frames are older than the product;
    DEV-098 — figures above 9 999 print as "12k"; DEV-094 items 1–2 — what the audit trail line shows.
- **Known and bounded, not fixed:** the per-admin write budget is per domain (each bucket still
  bounds its own damage); account search with `q` is a full scan (about 290 ms at 50 000 accounts,
  behind a 300 / 15 min read budget); `audit_log` has no `(created_at)` or `(target_type,
  target_id)` index, so the "last 5 events" read and the 24-hour audit count walk the table — fine
  now, the first thing to hurt on a long-lived log, and a future migration.
- The same two-way discipline as [[0013-coach-writes-client-equipment]] applies: a gate, not a habit.
  Every admin write must reach an `INSERT INTO audit_log`, and `check:admin-audit` (part of
  `check:all`) fails if it does not. A refusal is an outcome decided before the first write, which is
  what [[0005 Worker tx commit-on-return law]] requires of a transaction that commits on return.

## Related

[[admin-v2]] · [[0013-coach-writes-client-equipment]] · [[0021-pulse-implementation]] ·
[[0005 Worker tx commit-on-return law]]
