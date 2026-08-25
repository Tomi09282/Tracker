---
type: adr
title: ADR-0019 The class merger has to be told the type scale
status: accepted
phase: 9
date: 2026-08-24
tags: [decision, adr, design-system, typography, tooling, phase-9]
---

# ADR-0019 — The class merger has to be told the type scale

**Context.** `cn()` is `twMerge(clsx(...))`, and its whole job is conflict resolution: a caller
passing `px-6` must actually override a primitive's `px-4` rather than both landing in the class
list for the cascade to settle by source order. It has done that job for spacing, radii and colour
since the first component. It has never done it for type.

`tailwind-merge` resolves a conflict by deciding which GROUP a class belongs to, and it ships
knowing stock Tailwind's names. This project's scale is custom — `text-title-1`, `text-body-s`,
`text-caption` — and so are its ink tokens, `text-text-1` / `text-text-2` / `text-text-3`. To an
unconfigured merger every one of those is `text-<something>`, so it filed them all under
text-**colour** and kept the last one it saw.

Measured against the project's own installed `tailwind-merge`, before the fix:

```
cn('text-title-1 tabular-nums', 'text-text-1')  ->  'tabular-nums text-text-1'
cn('text-body-s',               'text-text-2')  ->  'text-text-2'
cn('text-caption',              'text-warning') ->  'text-warning'
cn('text-micro uppercase',      'text-text-3')  ->  'uppercase text-text-3'
```

The size is gone in all four.

## What that cost

Every component that composed a type step with an ink token inside one `cn()` call has been
rendering at the **inherited body size** instead of its declared step. Counted by walking every
`cn(...)` in `src`: **41 call sites across 27 files**, the densest being `SetRow`, `E8E9`,
`ChatPanel` and `Field` — which is to say the workout player, the dropdowns, the conversation and
every form in the app.

The `SummaryTile` figure is the one that surfaced it: declared `text-title-1` (26px), rendering at
15px, on six screens. Every design review of those screens was conducted against type one to three
steps smaller than the source said, and the reviews reported layout and hierarchy findings on that
basis.

## The decision

`cn.ts` declares the scale to the merger with `extendTailwindMerge`, listing the ten steps —
`display`, `title-1`, `title-2`, `title-3`, `body`, `body-s`, `body-strong`, `caption`, `micro`,
`timer` — as the `font-size` group. An explicit literal beats the colour group's catch-all
validator, which is exactly the disambiguation that was missing.

The ink tokens are deliberately **not** listed: they are spelled `text-text-N` at the call site and
belong in the colour group, where the merger already puts them correctly.

Verified after the change, in all three directions:

| input | result |
|---|---|
| size + ink | both survive |
| size + size | last wins |
| ink + ink | last wins |

And in the browser: every type step present on the page renders at exactly its declared size, and
the tile figures read 26px.

## The gate guards the declaration, not the defect

The project's habit is to answer a defect with a gate, and this one only half admits it. The defect
does not live in the source text — every affected file was written correctly. It lives in a
dependency's classification of that text, at runtime, and reproducing it would mean reimplementing
`tailwind-merge`'s group resolution, which is the thing under test. So the original bug cannot be
caught by a gate, and saying so plainly matters more than a gate that pretends otherwise.

What can be checked is the declaration's **completeness**, and `check-type-scale.mjs` does exactly
that: it reads the `--text-*` declarations out of `tokens.css`, reads `TYPE_STEPS` out of `cn.ts`,
and fails if they disagree in either direction. It excludes `--text-1/2/3` (the ink tokens, same
prefix, different meaning) and the `--font-weight` / `--line-height` modifiers.

Proven load-bearing by breaking it both ways: removing `caption` from `cn.ts` reports the step as
unprotected and exits 1; misspelling `timer` as `timerr` reports **two** problems — the stale entry
AND the real step it was hiding — which is the failure mode that would otherwise look like a
passing gate.

## Consequences

- Type across the app is now one to three steps larger in 41 places than it was during every design
  review conducted before today. **Screens reviewed earlier should be re-read**, because hierarchy
  findings made against 15px text where the source said 26px were findings about a different
  screen.
- Any future addition to the type scale has two homes, and the second one is easy to miss.
  `check-type-scale.mjs` in the build chain is what guards it.
- Found by a subagent adding an unrelated prop, not by a review and not by a gate — which is the
  argument for having agents read the code they are about to change rather than only the diff.

See also [[0018-the-aurora-was-never-on-screen]], which is the same shape of defect in a different
layer: correct source, invisible result, and a review process that could not see it.
