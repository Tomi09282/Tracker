---
type: todo-phase
phase: 7
title: TODO — Phase 7 (F8 full admin + F9 platform polish)
status: pending
updated: 2026-08-04
tags: [todo, phase-7]
---

# Phase 7 TODO — full admin · Element Style Studio · platform polish

Parent: [[TODO Master]] · Previous: [[TODO Phase-6]] · Owner req 9, 10

## P0 — Kickoff
- [ ] **T7.0.1** SHARED_MEMORY reset + contracts carried forward — `pending`
- [ ] **T7.0.2** ui-ux-pro-max `--design-system` (admin/dashboard, Linear/Raycast crispness) + `--domain chart` (mandatory — the admin is chart-heavy) — `pending` · SO-4
- [ ] **T7.0.3** Read `webdev-standards/references/admin-tooling.md` — `pending`
- [ ] **T7.0.4** `docs/pipeline/phase-7/spec.md` with job slicing + budget lines — `pending`

## F8 — Full admin panel (blueprint 10)
- [ ] **T7.1.1** Left sidebar (icon + label), max-1120px content on a 12-col grid — `pending`
- [ ] **T7.1.2** Stat cards — icon, odometer number (E16D), delta chip — `pending`
- [ ] **T7.1.3** Metrics: DAU/MAU, signups, active coaches, logs/day, coin velocity — `pending`
- [ ] **T7.1.4** Accent area charts — `pending`
- [ ] **T7.1.5** Dense tables — sticky header, row hover, sortable with `aria-sort` — `pending`
- [ ] **T7.1.6** User search + detail — `pending`
- [ ] **T7.1.7** Role grant / disable account / session reset (sv bump) — `pending`
- [ ] **T7.1.8** Audited coin adjust — `pending` · reuses the Phase 5 idempotent ledger path
- [ ] **T7.1.9** Exercise moderation queue (full, upgrading Phase 1's lite version) — `pending`
- [ ] **T7.1.10** Post/comment moderation queue from F15 reports — `pending`
- [ ] **T7.1.11** `audit_log` entry for EVERY admin action, no exceptions — `pending`

## Element Style Studio (owner req 24)
- [ ] **T7.2.1** Element list left / variant cards right with **live interactive preview** — `pending` · blueprint 10
- [ ] **T7.2.2** Switch the active variant per element E1–E26 × A–E — `pending`
- [ ] **T7.2.3** Change applies GLOBALLY to every user, with no code change and no redeploy — `pending` · `element_style_config`
- [ ] **T7.2.4** Every change audited (actor, element, old→new variant, timestamp) — `pending`
- [ ] **T7.2.5** Admin role re-checked in the DB at execution time, not just from the JWT — `pending`

## F9 — Platform polish
- [ ] **T7.3.1** PWA install + offline shell — `pending`
- [ ] **T7.3.2** Offline indicator with queued actions — `pending`
- [ ] **T7.3.3** i18n HU/EN completion sweep — every string keyed, `check:i18n` green — `pending`
- [ ] **T7.3.4** GDPR data export — owner-bound, anti-IDOR — `pending`
- [ ] **T7.3.5** GDPR account deletion (health data = sensitive category) — `pending`
- [ ] **T7.3.6** Capacitor safe-area insets verified on real device sizes — `pending`
- [ ] **T7.3.7** Cmd+K command palette on desktop — `pending` · no open/close animation (used constantly)
- [ ] **T7.3.8** Encrypted backup + documented, tested restore drill — `pending`
- [ ] **T7.3.9** `scripts/rekey.js` runbook documented — `pending` · script exists from BASE

## Security
- [ ] **T7.4.1** Admin routes: `requireRole` + DB role re-check + step-up where destructive — `pending`
- [ ] **T7.4.2** Admin endpoints on their own rate tier, all abuse signals logged — `pending`
- [ ] **T7.4.3** Export/delete flows ownership-bound and rate-limited — `pending`
- [ ] **T7.4.4** Full pre-deploy security checklist walked — `pending`

## Phase gate
- [ ] **T7.5.1** build + smoke + `npm audit` green — `pending`
- [ ] **T7.5.2** Screenshots 360/1440 + Bible line-by-line audit — `pending`
- [ ] **T7.5.3** Webview E2E ✅/❌ matrix — `pending`
- [ ] **T7.5.4** **Full regression sweep across the entire app**, all features, all green — `pending` · E2E protocol final sweep
- [ ] **T7.5.5** Brain updated + sync; SHARED_MEMORY pruned — `pending`

## Related
[[TODO Master]] · [[TODO Phase-6]] · [[TODO Phase-8]]

## F-C — The coach-side composer (the Phase 6 write surface)

Spec: [[Composer Spec]] — a 13-agent adversarial pass, 60 defects (1 fatal, 18 severe). The public
marketplace has shipped read-only since Phase 6: a coach cannot create a profile or publish a post,
and the two posts that exist were inserted by a script through the DB facade.

**OWNER DECISIONS 2026-08-09**, taken against the defect-clustering evidence:

- **Media: cover image only.** Upload, delete, author-side view. The gallery, image reordering and
  every media UPDATE are cut, and replacing a cover is DELETE then POST — two operations that are
  each already atomic. The media surface carried ~40% of all defect weight and the only FATAL
  finding; `post_media` has zero UPDATE triggers and an unfrozen `post_id`, so every UPDATE not
  written is an IDOR that cannot exist.
- **Scheduled publishing: CUT.** Measured — `PUBLIC_POST` contains no `unixepoch()` comparison, so
  a future `published_at` is publicly readable the moment it is written, and the daily quota window
  has no upper bound, so posts scheduled ahead would eat the whole allowance every day until then.
- **Handle rename, autosave and the handle-availability endpoint: KEPT**, against the spec's
  recommendation. They ship WITH their defects fixed rather than avoided — that is the cost the
  decision accepts, and it is written here so the bill is visible rather than discovered later.
- **Client food log stays private** (T4.5.1) — unrelated to the composer, decided in the same pass.

### Blocker, verified before anything else was planned
`guidelines_versions`, `guidelines_acceptances` and `public_policy` exist ONLY in migration 021.
Nothing in `src/` reads or writes them — grepped, not assumed. There is no way for anyone to accept
the community guidelines, so the publish gate would deny every coach in the product. The consent
routes are therefore T7.C.2, not an afterthought.

- [x] **T7.C.1** `022_composer.sql` — owner-scoped `write_uid` idempotency on `coach_posts` and `post_media`, `content_sha256` for intent comparison on replay, `row_version` for optimistic concurrency (`unixepoch()` is one-second granular, so a timestamp guard silently no-ops inside its own second), and the restore-standing trigger — `done` · schema v22. Every claim the migration rests on was checked against the LIVE schema first — 16 of 17 held and the seventeenth was the checker counting all triggers where it meant UPDATE triggers, so the spec was right and my probe was sloppy. `verify:022` is 32 assertions and asserts the ACCEPTED cases with the same weight as the refusals, because the trigger 022 replaces was refused for being too eager: a paragraph reflow changes body_src and can leave body_doc byte-identical, and a doc_version bump moves the doc alone, so 021's exclusive-or aborted ordinary edits and would have frozen the whole published corpus. Mutation-tested: deleting the identity-freeze trigger produces exactly 4 FAILs, restoring it returns 32/32
- [ ] **T7.C.2** Guidelines consent: read the active version, accept it — `pending` · **the blocker above.** Append-only, versioned, and it gates publication
- [ ] **T7.C.3** Coach profile: create, edit, publish, unpublish — `pending`
- [ ] **T7.C.4** Handle rename + availability check — `pending` · KEPT by owner decision, so IDOR-1 (one account locking ~1 440–5 760 handles/day into a one-year global cooldown while retaining exclusive reclaim), REPLAY-10 and RACE-5 (a stale tab reverting a rename from a headline edit, burning BOTH handles for a year) must be genuinely fixed. Availability collapses taken / reserved / in-cooldown to ONE outcome so it cannot enumerate unpublished profiles or leak another account's rename timestamp (IDOR-2)
- [ ] **T7.C.5** Posts: create draft, edit, publish, withdraw, restore, list, read-as-author — `pending` · `row_version` for lost updates; the body XOR trigger replaced, because as specified a `doc_version` bump makes every existing post permanently uneditable including title-only edits, with no request that succeeds and no escape through DELETE+INSERT
- [ ] **T7.C.6** Autosave — `pending` · KEPT by owner decision, so RACE-7 must be fixed: an in-flight create plus a blur-triggered second create must not let the replay answer discard the coach's newest keystrokes behind a URL change that looks like success
- [ ] **T7.C.7** Cover media: upload, delete, author-side view — `pending` · plus the `resolveStoredPath` and serve-route repairs, which are needed the first time any `post_media` row exists regardless
- [ ] **T7.C.8** Server-side preview through the reader's own `DocRenderer` — `pending` · one renderer, so a coach cannot discover that the preview and the published page disagree
- [ ] **T7.C.9** Frontend composer screens — `pending`
- [ ] **T7.C.10** Probes + smoke: every gate SEEN TO FIRE by breaking what it guards — `pending`
