---
type: adr
title: ADR-0018 The aurora was never on screen, and neither was the glass
status: accepted
phase: 9
date: 2026-08-24
supersedes: nothing — this records a defect, and the two decisions it forced
tags: [decision, adr, design-system, glass, accessibility, phase-9]
---

# ADR-0018 — The aurora was never on screen, and neither was the glass

**Context.** Asked to make the liquid glass better. Before changing anything, measured what it
currently is. Two independent findings, and together they mean the material had **never once been
rendered** — not in review, not in QA, not on the machine it was designed on.

## Finding 1 — an opaque wrapper painted over the aurora on every authenticated screen

`AuroraBackdrop` is `fixed inset-0 -z-10`, and its own docblock states the precondition in
so many words: it works *"under a transparent body"*. `AppLayout` then wrapped it in

```tsx
<div className="min-h-dvh bg-surface-0">
```

A negative-z child paints **after** its stacking context's background but **before** the background
of any non-context ancestor. That div creates no stacking context — no transform, no isolation,
`z-index: auto` — so the order is: body background, aurora, then this div's opaque `--surface-0`
straight over the top.

**Every screen inside `AppLayout` was glass over flat black.** The four public routes mount their
own backdrop with no such wrapper, which is why the login screen looked right and nothing behind it
did — and is exactly why nobody caught it. The one screen that worked was the one everybody used to
check that it worked.

Proved rather than argued: set that background to `transparent` in the live page and took a
screenshot. Flat black became a warm field with the accent glow top-left and the info glow
top-right. The fix is deleting one class; `src/index.css` already paints `--surface-0` on `body`.

## Finding 2 — the reviewing machine had `prefers-reduced-transparency: reduce` on

Measured on the development machine:

| token | resolved to |
|---|---|
| `--card-bg` | `#191510` — fully opaque |
| `--card-blur` | `0px` |
| `--glass-1` | identical to `--surface-1` |
| `--card-edge` | undefined |

The fallback is **correct** and stays: iOS "Reduce Transparency" exists because translucent chrome
is genuinely hard to read for some people, and honouring it is not optional. But it is a
**system-wide** setting, and it meant every judgement ever passed on this material — including
"the liquid glass isn't accurate" — was a judgement about the fallback.

### The decision this forced

`data-transparency` on the root: `system` (default, absent attribute, unchanged behaviour) ·
`full` · `none`, exposed in Settings. The OS preference remains the **default**, not the ceiling.
Two reasons, and the second is not about design:

1. Somebody who enabled the OS setting because one hostile app was unreadable has no other way to
   say "not here".
2. Without it the material cannot be reviewed at all, by anyone, on such a machine — which is how
   an unrendered design got signed off in the first place.

It is stored in `localStorage` only and deliberately NOT synced to `user_theme_prefs`. Whether
translucency is readable depends on the screen in front of you and the OS on that machine; syncing
it would impose one device's accessibility answer on another. `useThemeSync` now names its payload
`SyncedTheme` as an explicit `Pick`, so the next field added has to state which side of that line
it falls on rather than being synced by default.

## What actually makes it read as glass

With the material finally visible, the first pass had translucency and a rim and still looked like
a tinted panel. A pane of glass is not evenly lit: light lands on the top edge and falls off, and
the bottom edge sits in the shadow of the pane's own thickness. A rim of one uniform alpha all the
way round says *outline*; a rim that is bright at the top and gone by the bottom says *object*.

- **`--glass-lip`** — a 1px inset highlight along the top plus a fainter one carrying round the
  sides, replacing the single top hairline.
- **`--glass-underside`** — a low-alpha dark inset just inside the bottom edge. At anything stronger
  it stops reading as depth and starts reading as a second border.
- **`--glass-sheen`** — one wide highlight raking across the face at 145°, at an alpha low enough to
  be felt rather than seen. This is what the `veil` finish was missing: without a blur behind it, a
  62% fill over a soft gradient is a flat wash — translucency with no SURFACE.
- **`--card-saturate: 1.4`** on the `glass` finish. This one surprises people: averaging
  neighbouring pixels averages their chroma, so a plain blur turns the aurora into grey smoke.
  Pushing saturation back past 1 is what makes it read as colour seen *through* something.

**Only the last one touches the compositor**, and it rides a `backdrop-filter` that already exists,
so it adds no layer. The other three are `box-shadow` and `background-image`: they paint in the pass
the element was already painting in. That is why `--card-blur: 0px` can stay — the performance
decision that protects cheap phones is untouched, and the visual gap it left is closed by the three
free effects rather than by spending frames.

## Consequences

- Any ancestor of `AuroraBackdrop` painting an opaque background silently deletes the entire visual
  foundation of the design, with no error and no failing gate. Currently guarded only by a comment;
  a gate rule belongs here.
- The glass material is now judgeable by anyone, on any machine, without changing an OS setting.
- Every earlier report about the glass was made against a fallback and should be re-taken.

See also [[0015-liquid-glass-replaces-the-packs]], [[0016-glass-rim-is-not-a-shadow]],
[[0017-a-person-has-a-name]].
