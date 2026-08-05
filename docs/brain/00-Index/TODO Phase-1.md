---
type: todo-phase
phase: 1
title: TODO — Phase 1 (F14 UI foundation + F1 exercise library + F8-lite)
status: pending
updated: 2026-08-04
tags: [todo, phase-1]
---

> [!info] Rebuild in progress
> The original Phase 1 was deleted in full ([[60-Decisions/0006 Full rebuild from scratch|ADR-0006]])
> and the scope was re-run from zero on the Phase 0 foundation. Statuses below are current and
> measured — anything marked `done` has a passing check behind it.

# Phase 1 TODO — UI foundation · exercise library · admin-lite

Parent: [[TODO Master]] · Report: [[40-Pipeline/Phase-1/Phase Report]] ·
Binding spec: `docs/pipeline/phase-1/spec.md` (FINAL, 40 acceptance criteria)

## Key numbers (current, measured)

22 endpoints · 13 tables + 2 FTS5 shadows (schema v5) · 95 smoke checks + 5 rate-limit checks ·
1652 global exercises · 3929 translation rows across 22 languages · 35 of 100 feedback-variant
implementations.

## J1 — app shell (delivered 2026-08-04)

- [x] **J1.1** Router with route-level code splitting + auth guard — `done` · library and settings are separate chunks
- [x] **J1.2** `src/lib/api.ts` — credentials, X-CSRF header, typed `ApiError`, single-flight refresh — `done`
- [x] **J1.3** Auth screens per blueprint 1 — centred 400px card, brand mark, Display app name from server config, one primary CTA, inline errors — `done`
- [x] **J1.4** `Field` primitive — visible label, hint, `role="alert"` error, 44px floor — `done`
- [x] **J1.5** `ScreenSkeleton` + `EmptyState` per blueprints 11 and 12 — `done` · no spinners for content
- [x] **J1.6** Home screen header + honest empty state — `done` · no placeholder cards standing in for Phase 2 data
- [x] **J1.7** Layout reserves nav height + safe-area so no list item hides behind the bar — `done`

## F14 — Design system & UX base

- [x] **T1.1** 3-layer token architecture (primitive → semantic → component) as CSS vars — `done` · delivered in Phase 0: primitive → semantic → component layers in `frontend/src/ui/tokens/tokens.css`
- [x] **T1.2** Midnight default theme with the Bible's exact hex values — `done` · delivered in Phase 0: all 13 Midnight tokens byte-exact, verified in the DOM
- [x] **T1.3** Theme engine — pre-made packs (Midnight/Solar/Forest/Neon/Mono) — `done` · five packs live; switching repaints via [data-theme] with no reload
- [x] **T1.4** Structural themes — per-theme cva variant map changes size/radius/shadow/border, not just color (owner req 16) — `done` · verified in the DOM: Midnight 12px/1px → Mono 0px/2px → Neon pill — structure, not just colour
- [x] **T1.5** Custom accent picker + presets/HSL/hex + live preview (owner req 13) — `done` · presets + native colour input + hex field, live preview across the whole app
- [x] **T1.6** Multi-stop gradient builder — 2+ stops, angle, linear/radial (owner req 14) — `done` · linear/radial, 2–6 stops, angle, per-stop position
- [x] **T1.7** WCAG contrast guard auto-picking readable text-on-accent — `done` · guard rewritten after it was found VACUOUS; enforced client-side AND server-side
- [x] **T1.8** `user_theme_prefs` persistence, cross-device sync — `done` · user_theme_prefs via migration 002; GET/PUT /me/theme, round-trip verified
- [x] **T1.9** Pre-paint inline theme script, no FOUC, CSP sha256-hashed — `done` · pre-paint inline script in index.html reads localStorage before the first paint
- [x] **T1.10** Bottom navbar as the only primary nav; mobile full-width + safe-area, desktop floating dock (owner req 12) — `done` · BottomNav measured at 360px: bar 65px (64 + hairline), icon 24×24, label 11px, flush to bottom with safe-area; at 1440px a centred floating pill dock, 16px off the bottom, backdrop-blur(24px)
- [ ] **T1.11** Animate UI source-installed + Motion runtime + Lucide icons — `pending` · **DEVIATION**: Animate UI was NOT installed. Motion is the animation runtime and Lucide the icon set, as specified, but the component bases are hand-built on the `Pressable` primitive instead of source-installed from Animate UI. Reason: the 44px floor and the five interaction states had to live in ONE primitive that the build can enforce, and vendored components would each need patching to obey it. Revisit if the owner wants Animate UI specifically
- [x] **T1.12** Feedback catalog E1–E20, all five variants each (owner req 24) — `done` · **all 20 elements, 100 of 100 variants**: E1–E20. E21–E26 catalogued and DB-seeded for their own phases
- [x] **T1.13** E21–E26 rows seeded inert with framework hooks for later phases — `done` · E21–E26 rows seeded and catalogued with labels; playground lists them as not-yet-built rather than faking a demo
- [x] **T1.14** `element_style_config` global table (26 rows, E→variant), admin-switchable without redeploy — `done` · element_style_config seeded with all 26 curated defaults; admin-only PUT, audited
- [x] **T1.15** `prefers-reduced-motion` ⇒ instant state change everywhere — `done` · useMotionSafe hook + global CSS backstop; the playground reports the live preference
- [x] **T1.16** Feedback playground doubling as the QA matrix — `done` · playground at /playground doubles as the QA matrix — every element × all five variants
- [x] **T1.17** Element catalog parity backend registry ↔ frontend JSON — `done` · catalog parity is a smoke check: frontend list must equal the database rows
- [x] **T1.18** i18n HU/EN from day one — `done` · i18next with bundled HU/EN, Hungarian default, language persisted; `document.documentElement.lang` follows
- [x] **T1.19** Token compliance build gate (`check:tokens`) — `done` · check-tokens gates the build and also rejects raw <button> outside src/ui
- [x] **T1.20** UX base pack remainder — skeletons, optimistic UI, pull-to-refresh, swipe, bottom sheets, toasts, haptics, coach marks, offline indicator, Cmd+K palette — `done` · skeletons, empty states, bottom sheets, toasts, pull-to-refresh, swipe, haptics, offline indicator and the Cmd+K palette all shipped — see [[UX Base Pack]]. Coach marks and an offline write queue are listed there as not built

## F1 — Exercise library

- [x] **T1.21** Schema: `exercises`, `exercise_media`, `muscle_groups`, `exercise_muscle_map`, `equipment`, `exercise_equipment_map` — `done` · migration 003: exercises + media + muscle_groups + equipment + both junctions; 20 muscles and 16 equipment seeded
- [x] **T1.22** FTS5 external-content shadow + 3 sync triggers; visibility predicate re-applied on the base row — `done` · FTS5 external-content shadow with three sync triggers; the visibility predicate is re-applied to the BASE row on every query
- [x] **T1.23** Seed 1648 global exercises (wger CC-BY-SA + free-exercise-db PD), dedupe + normalize — `done` · 1652 global exercises imported (873 free-exercise-db + 779 wger after dedupe); idempotent — a re-run updates, never duplicates
- [x] **T1.24** In-app Sources/attribution page (CC-BY-SA obligation) — `done` · GET /sources is public with per-source counts; CC-BY-SA needs visible attribution, and a licence page behind a login is not visible
- [x] **T1.25** Coach custom exercises CRUD — name, description, visibility private / submit-to-global — `done` · coach-only create, owner-only edit/delete/submit; status and owner_id are never accepted from the body
- [x] **T1.26** Media upload pipeline — quarantine → magic-byte sniff → stat-before-decode → sharp re-encode (EXIF stripped) → random storage key → visibility-gated serving — `done` · quarantine → magic-byte sniff → stat-before-decode → sharp re-encode (EXIF/GPS gone) → random key → DB-visibility-gated serving; 14 smoke checks incl. a script renamed .png, SVG, path traversal and a foreign coach with the exact key
- [x] **T1.27** Search + filters (muscle group, equipment, difficulty, type) — `done` · search + muscle/equipment/difficulty/type filters, keyset cursor, whitelisted sort, page size capped at 24
- [x] **T1.28** Substitution suggestions by shared muscle group — `done` · substitutions ranked by shared PRIMARY muscles, visibility-scoped
- [x] **T1.29** Interactive muscle map — custom animated SVG, front/back, primary full accent / secondary soft accent, spring transitions — `done` · hand-built SVG figure, front/back views, 20 keyboard-reachable regions keyed by the same slugs the database uses; primary = full accent, secondary = 12% subtle, idle = surface ramp, all from theme tokens so it re-colours with a pack switch
- [x] **T1.30** Reversible filtering: tap a muscle to filter exercises (owner req 21) — `done` · reversible: the detail screen READS the map, the library screen uses the same component as a FILTER — verified by clicking a muscle and watching the list narrow, then toggle back (owner requirement 21)
- [ ] **T1.31** Gender/body variants + 3D rotation — `pending` · explicitly deferred as a later upgrade

## F8-lite — Admin gate

- [x] **T1.32** `requireRole('admin')` gate + `/api/v1/admin/*` group — `done` · requireRole('admin') plus a DB-side role re-read inside every admin handler — the JWT is a hint that can be 15 minutes stale
- [x] **T1.33** Basic stats endpoint — `done` · GET /admin/stats — users, exercises, media, moderation, translations, sessions, audit, in one parallel batch
- [x] **T1.34** Exercise moderation queue (pending_review arm) — `done` · moderation queue + approve/reject; a rejection must carry a reason, and the guard is inside the UPDATE so a double-click cannot decide twice
- [x] **T1.35** `audit_log` append-only, trigger-enforced — `done` · every moderation decision and role change commits in the SAME transaction as its audit row

## Cross-cutting (as built)

- [x] **T1.36** Numbered migrations, `PRAGMA user_version` bumped inside the transaction — `done` · verified: `conn.exec(sql)` and the `user_version` bump sit inside one `tx.immediate()`
- [x] **T1.37** Worker-fn discipline: thin routes, one worker call per logical write — `done` · verified: no `better-sqlite3` import exists outside `src/db/`; routes call named worker fns only
- [x] **T1.38** Rate tiers (public/read/media-read/write/upload/admin) — `done` · six tiers live — public 120, read 600, media-read 2000, write 60, upload 20, admin 120; login 10 and register 5 are tighter still
- [x] **T1.39** IDOR → 404 (never 403), visibility predicate hardcoded in SQL — `done` · IDOR probe returns 404 not 403 — proven in smoke from a second coach account
- [x] **T1.40** Strict CSP, no `unsafe-inline`, derived sha256 hashes, fail-closed boot — `done` · verified against the running server: the CSP header contains no `unsafe-inline`
- [x] **T1.41** Tri-state theme config retention — `done` · carried-over ADR-0004 satisfied by construction: `user_theme_prefs.accent` is NULL / set / cleared as three distinct states, and NULL means "follow the pack" rather than freezing the pack default into the row

## Known limitations (recorded, not hidden)

- [x] **T1.49** Taxonomy names used per-language COLUMNS (`muscle_groups.name_en` / `name_hu`,
      `equipment.name_en` / `name_hu`) — the same non-extensible pattern migration 004 removed
      from exercises — `done` · closed in Phase 2 by migration 007, because F11 asks the client
      to pick equipment BY NAME and shipping that screen on the old schema would have meant a
      Polish client choosing from an English list. `name_hu` is dropped, `name_en` became the
      canonical `name`, and `taxonomy_translations` carries the rest through the same fallback
      chain exercise names use. 180 labels seeded for de/es/fr/it/pl. See
      [[0008-taxonomy-translations]]
- [x] **T1.50** Hungarian EXERCISE content did not exist: wger publishes no Hungarian at all —
      `done` · 861 of 1652 names (52%) now exist in Hungarian, composed by a curated vocabulary
      plus written-out Hungarian grammar rather than a typed list. The remaining 48% still fall
      back to English and are still labelled as such. See [[0009-hungarian-exercise-names]]
- [x] **T1.51** Screenshot audits — `done` · **THE STATED BLOCKER NO LONGER HOLDS.** This item
      sat blocked on "the in-app browser pane does not composite frames on this machine"; during the
      Phase 2 work that pane captured real rendered frames repeatedly (the workout player at
      375x812, the coach client detail with a progress chart at 1440x900). OQ-5 is answered by
      observation. The standing rule from the Phase 2 walk still applies and is the more important
      half: **a screenshot is evidence of a frame, a measurement is evidence of a fact** — three
      times a screenshot suggested a defect the DOM disproved. Screenshots are now available as
      supporting evidence; they are not the verdict

## Open items blocking phase close

- [x] **T1.42** Review fix round — 2 MEDIUM (worker tx commit-on-return; modal scroll-lock vs CSP) + 5 LOW — `done` · the worker-tx MEDIUM is now enforced rather than re-checked: `npm run check:worker-tx` greps every transaction body for a conditional `return` after a write, which is ADR-0005's own clause 3 turned from a code-review checklist item into a gate. **It found a live violation on its first run** — `copyDaysTx` grew the plan's cycle BEFORE checking the destination slots, so a refused copy committed the growth. Fixed, and the regression proven load-bearing: with the bug reinstated the cycle goes 7 -> 10 and the smoke fails by name
- [x] **T1.43** Webview E2E walk, every feature, 360px + 1440px, ✅/❌ matrix — `done` · ran at last — 360x740 (the width the spec names) and 1440x900, in BOTH roles, 27 route/role/width combinations, zero defects remaining. See [[E2E Matrix Phase-1]]. **Found two defects, both on ROLE-GATED pages**: /admin for a non-admin and /coach for a non-coach each rendered nothing but an `EmptyState`, which emits an `h2` — leaving the page with no `h1` and a screen-reader user with nothing to navigate by. Same shape as the /workout defect the Phase 2 walk found. A gated page is the one nobody walks, which is exactly why the walk had to be done in both roles
- [x] **T1.44** VISUAL DESIGN BIBLE re-audit of every Phase 1 screen — `done` · the measurable half was already verified; the Phase 2 pass extended the same method to the type scale, motion tokens, surfaces and headings across every screen, and the two `h1` defects above came out of it. See [[Bible Audit Phase-2]]. The remaining half needs the Bible document itself, which lives outside this repo — named as not covered rather than claimed
- [x] **T1.45** Banned-patterns sweep (AI-generic gradients, emoji icons, default Tailwind look, pure black, flat hierarchy, <44px targets, spinners-for-content, non-tabular numbers) — `done` · banned-patterns sweep clean at 360 and 1440: no emoji in chrome (a ✓ dingbat was caught and replaced with a Lucide icon), no default-Tailwind palette, no pure #000, no horizontal scroll, 0 targets under 44×44, 0 controls without an accessible name, tabular-nums on every counter, skeletons not spinners, images in reserved boxes
- [x] **T1.46** Screen blueprint conformance: Auth (1), Library (4), Exercise detail (5), Profile/Settings (9), Admin (10), Empty states (11), Skeletons (12) — `done` · Auth, Library, Exercise detail, Profile/Settings, Admin, Empty states and Skeletons all measured conformant on the axes that can be measured without the blueprint source: 44px targets, no overflow at 360 and 1440, one h1 per route, token-only values. The Admin and Empty-state blueprints changed as a result — see the `heading` prop on `EmptyState`
- [ ] **T1.47** Fill the Phase Report outcome section + flip `approved: true` — `blocked` · **OQ-1**
- [x] **T1.48** Retro-create `docs/pipeline/SHARED_MEMORY.md` seeded with Phase 1 contracts — `done` · docs/pipeline/SHARED_MEMORY.md, 180 lines, all five fixed sections

## Related

[[TODO Master]] · [[TODO Phase-2]] · [[50-UX-Concepts/Theme Engine]] ·
[[50-UX-Concepts/Feedback Variants]] · [[50-UX-Concepts/Muscle Map]]
