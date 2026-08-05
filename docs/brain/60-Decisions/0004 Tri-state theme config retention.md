---
type: adr
title: ADR-0004 Tri-state custom-theme config retention
status: accepted
phase: 1
date: 2026-08-03
---

> [!warning] HISTORICAL — the code this note described was deleted 2026-08-04
> Kept for its engineering lessons only. Nothing here describes running code.
> See [[60-Decisions/0006 Full rebuild from scratch|ADR-0006]].

# ADR-0004 — Tri-state `custom` semantics for theme prefs

**Context.** Early spec drafts required `custom` iff `theme='custom'` and forbade it
otherwise — so exploring a pack destroyed saved builder work (SPEC-PVP K4), and the
first fix still had a corner hole: `PUT {theme:'custom', custom:null}` over a stored
config produced a dangling `custom` theme with NULL config (R2-1).

**Decision.** `custom` is independent of the active theme with three states:
**absent** = retain stored (pack switches lose nothing) · **null** = explicit clear ·
**object** = validate + store as draft regardless of active theme. The cross-field guard
evaluates the **effective post-update state**: any PUT whose resulting row would be
`theme='custom' AND custom_config IS NULL` gets 400. Two prepared upsert variants
(`SET theme=?` / `SET theme=?, custom_config=?`), both fully parameterized. GET always
returns the stored config so the builder reopens saved work. Server re-verifies the
WCAG contrast pair whenever `custom` is present — never trusts the client.

**Consequences.** Exploratory pack switching is free; the API has no reachable
inconsistent state; the 4 KB DDL cap + contrast guard apply on every write.
