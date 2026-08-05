---
type: phase-report
phase: 1
title: Phase 1 — report (rebuild)
status: closed
approved: true
updated: 2026-08-06
tags: [pipeline, phase-1]
---

# Phase 1 — UI foundation · exercise library · admin-lite

> [!warning] This report replaces one describing a DELETED build
> The original Phase 1 was removed in full ([[60-Decisions/0006 Full rebuild from scratch|ADR-0006]]).
> Its report claimed 1648 seeded exercises and 20 endpoints that no longer existed anywhere —
> a memory describing absent code, which is exactly the failure mode the external-memory law
> exists to prevent. Everything below is measured against the current tree.

Binding spec: `docs/pipeline/phase-1/spec.md` · Task list: [[TODO Phase-1]]

## Progress

32 of 55 tasks. Phase 0 (foundation) closed at 18/18 before this phase began.

| Job | State |
|---|---|
| J1 app shell — router, nav, API client, i18n, auth screens | done |
| J2 theme engine — 5 packs, accent picker, gradient builder, contrast guard, persistence | done |
| J3 feedback architecture + E1–E7 (35 of 100 variants) | done |
| J5 exercise backend — schema, CRUD, FTS, filters, anti-IDOR | done |
| J5b seed — 1652 exercises from wger + free-exercise-db | done |
| J5c media pipeline — sniff, re-encode, EXIF strip, gated serving | done |
| J5d multi-language content model — 22 languages | done |
| J6 library UI — list, filters, infinite scroll, detail | done |
| J3c feedback catalog E8–E20 | pending |
| J6b animated muscle-map SVG | pending |
| J7 admin-lite — stats, moderation queue | pending |

## Verification (current)

| Gate | Result |
|---|---|
| `npm run build` (check-tokens + tsc + vite) | PASS |
| `npm run smoke` | PASS — 81 checks |
| `npm run smoke:limits` | PASS — 5 checks |
| `npm audit` backend / frontend | PASS — 0 vulnerabilities |
| DOM measurement at 360 px and 1440 px | PASS — 0 targets below 44×44, no horizontal overflow |
| Screenshot capture | **BLOCKED** — the in-app browser pane does not composite frames on this machine (OQ-5) |

## Key numbers

Schema version 4 · 13 tables + 2 FTS5 shadows · 22 endpoints · 1652 global exercises ·
3929 translation rows across 22 languages · 35 of 100 feedback-variant implementations.

## Defects found by measurement, not by reading

Recorded because each was invisible to code review and only a running check caught it:

1. Neither prescribed font was loading — the app rendered in the OS default.
2. Tailwind tree-shook half the motion and sizing tokens to empty strings.
3. A self-referential token (`--ease-standard`) resolved to nothing.
4. The WCAG accent guard was **vacuous** — its condition can never fail for any colour.
5. The checkbox sized its hit area to its 24 px graphic.
6. Library rows were 90 px against a 72 px cap.
7. 582 exercise translations were French, stored under `hu`.
8. Migrations only ran at server boot, so every script met a stale schema.
9. Piscina reduced every SQLite error to `{code:'SQLITE_ERROR'}` with no message.

## Outcome

**Approved by the owner on 2026-08-06. Commit `ca680c8`.**

57 of 58 tasks. The one that did not ship as specified is T1.11, and it closed as an **accepted
deviation** rather than a gap — see [[0011-animate-ui-deviation]]. One task, T1.31 (gender/body
variants and 3D rotation on the muscle map), moves forward as a feature rather than a phase blocker.

### What actually closed the phase

Three items sat open for two phases and were closed by doing them, not by lowering the bar:

- **T1.43 — the E2E walk had never run.** It ran at 360x740 and 1440x900 in BOTH roles, 27
  route/role/width combinations. See [[E2E Matrix Phase-1]]. It found two defects, both on
  ROLE-GATED pages: `/admin` for a non-admin and `/coach` for a non-coach each rendered nothing
  but an `EmptyState`, which emits an `h2` — leaving those pages with no `h1` and a
  screen-reader user with nothing to navigate by. **A gated page is the one nobody walks**, which
  is exactly why the walk had to be done in both roles.
- **T1.42 — the worker-tx review item.** ADR-0005's third clause was a code-review checklist item;
  it became `npm run check:worker-tx`, and **found a live violation on its first run**.
  `copyDaysTx` grew a plan's cycle BEFORE checking the destination slots, and better-sqlite3
  commits on return — so a refused copy committed the growth. Because the schedule is
  `starts_on + k*cycle_days + day_index`, that silently re-dated every future occurrence for the
  client. The bug outlived the full rebuild that ADR-0005's own banner describes.
- **T1.51 — screenshots.** The stated blocker (the browser pane not compositing frames) stopped
  being true; it was verified by capturing frames rather than by assuming.

### Verification at close

| Gate | Result |
|---|---|
| `npm run build` — check-tokens + check-i18n + check-interval + tsc + vite | PASS |
| `npm run smoke` | PASS — 316 checks |
| `npm run check:routes` | PASS — 74 routes, 8 public by design, 45 writes all limited |
| `npm run check:worker-tx` | PASS — 6 transaction bodies, no conditional return after a write |
| `npm run verify:schema` | PASS — 21 invariants |
| `npm audit` backend / frontend | PASS — 0 vulnerabilities |
| E2E at 360 px and 1440 px, both roles | PASS — 27 combinations, 0 defects |
| Screenshot capture | PASS — the OQ-5 blocker no longer holds |

Every one of those gates was proven load-bearing by breaking the thing it guards and watching it
fail by name. A gate never seen to fail is not evidence.

### What the phase report cannot claim

The visual half of the Bible audit still needs the Bible document, which lives outside this repo.
Real-device rendering (iOS Safari, Android WebView) and actual screen-reader behaviour are asserted
structurally, not observed. Both are named in [[Bible Audit Phase-2]] rather than quietly folded
into a pass.
