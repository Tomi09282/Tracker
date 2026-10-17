---
type: adr
title: ADR-0021 How Pulse was implemented, and what the owner ruled on the way
status: accepted
date: 2026-10-18
tags: [decision, adr, design-system, redesign, pulse, implementation]
---

# ADR-0021 — How Pulse was implemented, and what the owner ruled on the way

**Context.** [[0020-pulse-replaces-liquid-glass]] made Pulse V1 "Open Field" the design of record:
59 Figma frames across 24 screens. Between 2026-10-11 and 2026-10-18 it was implemented on the local
branch `pulse-redesign`, from the plan `docs/pipeline/pulse/PLAN.md` (revision 2) and its machine twin
`work-packages.json`. This record keeps the decisions that shaped the implementation in one place,
so that nobody re-opens them by accident. The owner's own words are in
`docs/pipeline/pulse/understand/00-owner-decisions.md` (D1-D4) and
`docs/pipeline/pulse/understand/01-owner-answers.md` (Q1-Q7 and the later rulings).

## The owner's four decisions (2026-10-11, final)

- **D1 — one look.** Pulse is the only look; the seven theme packs, the aurora skins, the glass
  tokens and `data-transparency` are deleted, not kept selectable. A future pack must stay cheap to
  bring back (one place overrides the accent), but none ships now. Removing the packs from the coin
  store is a backend change with a migration and is its own package. The element-variant system
  (Style Studio, E1..E27) is a different thing: each element has one Pulse look.
- **D2 — the muscle selector's door.** With no running session the "Edzés" tab shows the muscle
  selector / library; with one it shows the player. Home carries a row that opens the library. No new
  tab.
- **D3 — finishing a workout comes later.** The redesign stays frontend-only; the finish action drawn
  in the workout frames is not built and not faked. It becomes its own package (endpoint + hook +
  copy) after the screens.
- **D4 — git.** One local commit per finished step on `pulse-redesign`; never pushed; `master` never
  touched (the repo is public and another developer commits to it).

## The owner's answers to the plan's questions (2026-10-12)

| # | Question | Answer |
|---|---|---|
| Q1 | The mannequin | Neutral renders with SVG regions drawn over them; the five regions without a panel are drawn by anatomy (its own track, F15). |
| Q2 | The coin store still sells the old packs | Hide `theme.*` items on the client meanwhile. Later (2026-10-17): delist them on the backend with **no compensation** — dev and test data only, no real buyers. |
| Q3 | Style Studio | The honest studio: restyled to its two frames; an element that steers nothing is marked "nem használt". |
| Q4 | Frame vs today's behaviour | Behaviour wins; nothing a user can do today disappears; every case is logged in `deviations.md` for a ruling. |
| Q5 | Doors to `/compose` and `/m` on a phone | They stay hidden (URL only); no new door is invented. |
| Q6 | The lit tab under Értesítések | The Kezdőlap tab stays lit. |
| Q7 | The workout player on 360 x 640 | The figure goes first, then the secondary data row. |

## Later rulings

- **2026-10-14, DEV-003 (orchestrator, inside the approved design).** Big Shoulders Display has no
  tabular figures; it stays the display face everywhere. A number that changes on screen in it gets
  fixed-width digit cells from `Numeral`.
- **2026-10-15, the muscle map (owner).** It must look exactly like the frames (library-1..3,
  workout-1/2, exercise-detail-1/2): the graphite mannequin render, a selected muscle as a solid,
  glowing lime panel that follows the render's own grooves. Checked side by side before merge.
- **2026-10-17, the library row on Home (owner).** The "Gyakorlatok" row goes below the nutrition
  section; the first screen of Home stays exactly home-1 / home-2.
- **2026-10-17, capture fixtures (orchestrator).** A fixture that is a mutation answer or a value no
  recording holds is allowed when it is schema-checked against the endpoint's real response type and
  lives only in the package's states; the frame is then reported `matched-fixture`, never `matched`.
  Product code never reads a fixture.
- **2026-10-17, equipment stills (owner).** "Backend bővítés most": the exercise list API returns each
  exercise's equipment keys (done: B-equipment), and the eight equipment types without a still get one
  in the same style (A-equipment, open). No key = an empty cell, never a guessed picture. This is the one
  change for which "backend is untouched" was lifted.
- **2026-10-17, after the closing (owner).** The orchestrator prepares the local merge of
  `pulse-redesign` with `master`; the owner reviews and pushes it himself and coordinates migration
  numbers with the other developer.

## The plan's own rulings (PLAN.md 1.1, R1-R31; the owner could veto any, and did not)

The look:

- **R1 / R2** — a hard switch of the VALUES first, the legacy NAMES bridged until the closing cleanup;
  a bridged token that carried state kept a visible value, decoration went neutral at once.
- **R3** — the ten legacy type steps kept their metrics until closing; the three whose names Pulse
  reuses were renamed `-legacy` by a codemod so they could be counted.
- **R4 / R5** — `control()` got a `size` axis (the 56 pt pill, the 44 pt small pill); shared recipes were
  restyled in place, and props Pulse no longer draws became optional and were then removed.
- **R7 / R8 / R9** — images as alpha-baked WebP through one renderer (`Pic`), 49 files under 1.0 MB;
  three font families installed and glyph-checked before anything depended on them; the lime exists in
  exactly two places (the `--accent` token and the baked copy for the lit rasters), held equal by
  `check:assets`.
- **R10 / R11** — the client theme engine left first; one Pulse look per element variant, the
  playground-only variants retired (F20), the 27 catalogue rows kept dormant because the frozen backend
  still knows them.
- **R12 / R13 / R14 / R15** — the tab bar's icons as image pairs with both states in the DOM; pushed
  headers read their parent from one table; one toast band with the existing contract; D2 as a redirect
  of `/workout` with no session to `/library`.
- **R16 / R17 / R18** — the aurora left with a gate as its heir; the mannequin's props changed additively
  only; dead code was deleted by whoever owned the folder.
- **R21 / R22** — zero-inset floors and the centred 430 pt column are tokens, and the six desktop layouts
  were kept in Pulse skin; no visible string without a source (frame, inventory note or `hu.json`), and a
  proposed string waits in `copy-to-approve.md` for the owner's tick.

How it was proven:

- **R19 / R24 / R25 / R26** — the dev backend kept its rate limiters; every `/api` answer the 59 states need
  was recorded once and every equality proof is a replay under a virtual clock; a capture cannot write
  except to sandbox objects; a fixture is a schema-checked edit of a recorded response.
- **R20 / R27** — sub-states are reached by click scripts that assert arrival; "matches" is measured
  against the Figma geometry export (2 pt, 3 pt for ink-tight numerals).
- **R23 / R28** — `backend/` untouched (one owner-lifted exception above), hooks and routes kept, drift
  from `master` measured at every wave; the integrator works in its own worktree and the owner's checkout
  only fast-forwards to green commits.
- **R29 / R30 / R31** — packages reach foreign files only through hand-in files applied by tools; gate
  exemption lists are data; a tool imports a gate's rule, never repeats it.
- **R6** — lanes published compiling stubs and a kit reference first, so screens could start against them.

## What the closing cleanup left (F19)

The bridge is gone (row 1, with `RETIRED_STEMS` in `check:tokens`), the type scale is the 16 Pulse steps
(row 2), `Surface`, `SummaryTile`, `Gauge`, `DataTable`, the legacy variants and the unrendered props are
gone (row 3), a `primary` with no size is the 56 pt pill (row 4), `check:pulse` has no budgets and every
rule is an unconditional ban (row 5), and the retired shell tokens, keyframes and lane markers are gone
(row 6). After every row the 59 replay captures equalled the pre-cleanup set within 0.1 % of pixels.
`frontend/DESIGN.md` now describes Pulse, and [[58-Pulse/Pulse System]] names tokens instead of numbers.

**Consequences.**

- The values live in `frontend/src/ui/tokens/tokens.css` only; the rules in [[58-Pulse/Pulse System]];
  the frames' exact boxes in the geometry export. A new screen is composed from `src/ui`, and the build
  refuses the old boxed constructs.
- Open, by name: the deviations in `docs/pipeline/pulse/deviations.md` (each waits for a ruling), the
  proposed strings in `copy-to-approve.md`, the sweep's findings in `docs/pipeline/pulse/review/open.md`,
  the eight new equipment stills, and the two follow-up packages in this order: (1) the backend
  delisting of the coin-store packs (Q2), (2) finish / abandon workout (D3).
