---
type: phase-report
phase: 1
title: Phase 1 — report (rebuild)
status: in_progress
approved: false
updated: 2026-08-04
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

_Pending. Fills in at approval, with the E2E matrix and the commit hash._
