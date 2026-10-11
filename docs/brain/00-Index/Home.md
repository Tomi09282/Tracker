---
type: moc
title: TRACKER Brain — Home
tags: [index]
---

> [!tip] Resuming?
> Start at [[Next Session]] — it names the one task to do first.

> [!important] The visual design changed on 2026-10-11 — Pulse is the design of record
> The owner dropped the liquid-glass look. Every screen is now drawn in Figma in **Pulse V1
> "Open Field"**; none of it is implemented yet. Start at [[58-Pulse/0000 Index]]; the decision is
> [[60-Decisions/0020-pulse-replaces-liquid-glass]]. The `55-Screens` notes still describe what
> each screen does, but no longer what it looks like.

# TRACKER Brain

Coach-client workout & nutrition tracking platform. This vault is a **mirror** of
`docs/brain/` in the repo (`scripts/brain-sync.mjs` regenerates it after every approved
phase) — edit in the repo, never here.

## Start here — every session

> [!important] Read [[TODO Master|the master TODO map]] FIRST
> It is the project's external memory: every phase, task, acceptance criterion, locked
> decision and open question, each with a live status. Conversation memory is never
> authoritative — this map is.

## Maps of content

- [[TODO Master|Master TODO map]] — external memory; phase status board + open questions
- [[10-Architecture/Overview|Architecture overview]] — system shape, BASE pattern, stack
- [[20-Data-Model/ERD|Data model]] — ERD + per-table notes
- [[30-API/Endpoints|API index]] — every endpoint, one note each
- [[40-Pipeline/Phase-1/Phase Report|Pipeline]] — per-phase artifacts, PVP logs, reports
- [[50-UX-Concepts/UX Base Pack|UX base pack]] — shell behaviour: offline, palette, haptics, toasts
- [[50-UX-Concepts/Theme Engine|UX concepts]] — theme engine, feedback variants, muscle map
- [[60-Decisions/0000 Index|Decisions (ADR)]] — why things are the way they are

## Phase status

```dataview
TABLE status AS Status, reviewer-consensus AS Consensus, approved AS Approved
FROM "40-Pipeline"
WHERE type = "phase-report"
SORT phase ASC
```

## Open questions

```dataview
LIST
FROM "60-Decisions"
WHERE status = "open"
```
