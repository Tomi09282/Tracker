---
type: decision
id: 6
title: Full rebuild from scratch
status: accepted
date: 2026-08-04
tags: [decision, adr, process]
---

# ADR-0006 — Full rebuild from scratch

## Context

The first implementation (3 commits, 20 761 files, 611.6 MB) reached a state where the backend
was genuinely solid — 50/50 smoke checks passing, 0 npm-audit vulnerabilities, SQLCipher in a
Piscina worker pool, hardened uploads, strict CSP — but the **design layer was wrong at its
foundation**.

A measured re-audit against the VISUAL DESIGN BIBLE produced 13 findings, 5 of them high
severity. The decisive ones were structural rather than cosmetic:

- Neither prescribed font was loaded; the app rendered in the OS default.
- The type scale was the generic Tailwind ramp — five of the Bible's eight steps did not exist.
- Every single Midnight color token differed from the Bible's exact values.
- The brand gradient was the Bible's own first-listed banned pattern (blue→purple "AI-generic").
- Twelve-plus interactive elements rendered below the 44×44px minimum.

The owner independently reported that layouts looked misaligned throughout.

## Decision

Delete the entire repository and rebuild from zero.

A **new Phase 0** is inserted before Phase 1: the design system is built byte-exact to the Bible,
with an automated build gate, **before the first screen exists**.

## Rationale

The findings were not a backlog of cosmetic fixes. Fonts, type scale, palette and the minimum
touch target are the substrate every screen inherits. Patching them under finished screens means
re-laying out every screen anyway, while carrying forward whatever alignment drift the owner was
seeing. Rebuilding the design layer on correct foundations is the same work with a correct
starting point.

The owner chose full deletion over keeping the backend, having been told explicitly what that
costs: the working auth/DB/upload layer must be rebuilt, and the 1648-exercise seed plus 2042
cached images must be re-fetched from the wger and free-exercise-db APIs.

## Consequences

- Everything resets to `pending` in [[00-Index/TODO Master]]. Only knowledge carries over.
- ADR-0001 … ADR-0005 remain valid as **lessons to re-apply**, not as descriptions of live code.
- The exercise seed and all media must be re-fetched.
- `scripts/brain-sync.mjs` was deleted with the repo and must be re-created (with its two known
  bugs already fixed — see G-2 in the master map).
- The brain survived only because the Obsidian vault mirror is a separate directory. That mirror
  is now the proven disaster-recovery path for project memory.

## Related

[[00-Index/TODO Master]] · [[0000 Index]]
