---
type: decision
phase: 7
task: T7.5.2
date: 2026-08-13
---

# Phase 7 layout audit — 360 and 1440

## What was measured, and why not screenshots

The task line says "screenshots 360/1440 + Bible line-by-line audit". Screenshots were not the
deliverable that could be produced: the browser pane was not displayed in this session, so no frame
could be captured.

That turned out to matter less than it sounds. **A screenshot is evidence of a frame; a measurement
is evidence of a fact** — and the three things a 360/1440 audit exists to catch are all measurable:
content that runs off the side, tap targets under the floor, and text nobody can read. Each was
asked of the live DOM at both widths instead of judged by eye.

## Horizontal overflow

`document.documentElement.scrollWidth - clientWidth`, per route, after navigation settled.

| width | routes | overflow |
|---|---|---|
| 360 | `/`, `/library`, `/workout`, `/nutrition`, `/progress`, `/settings`, `/coach`, `/coach/plans`, `/admin`, `/coins` | **0 px on every one** |
| 1440 | the same ten, plus `/compose` and `/notifications` | **0 px on every one** |

### The probe had to prove it navigated

The first pass returned ten zeroes, which is exactly what a probe that never left the first screen
would return. Re-run capturing a heading and a content length per route: nine distinct headings
(`Szia!`, `Gyakorlatok`, `Most nincs futó edzés`, `Táplálkozás`, `Haladás`, `Beállítások`,
`Klienseim`, `Áttekintés`, `Érmék`) and content lengths from 76 to 1171 characters. The zeroes are
about ten screens, not one screen ten times.

`/chat` resolved to `/`. Not a defect — there is no `/chat` route; the catch-all handled a path the
probe invented. Checked the neighbouring worry too: `ChatPanel` and `NotificationBell` have no
router entry because both are mounted inside routed screens (`coaching/ChatTab`,
`CoachDashboard`, `HomePage`). No unreachable feature.

## The one apparent overflow, and why it is not one

The moderation panel at 360 reported elements at `right: 461` in a 360 px viewport — 101 px past the
edge — while the document itself did not scroll. Raw numbers like that are where a layout audit
usually stops and files a bug.

Walked up to the nearest scrolling ancestor instead: both are the AdminShell section rail, which is
`overflow-x: auto` with `scrollWidth > clientWidth`. **Reachable by scrolling, which is what a rail
is for.** Had the ancestor been `overflow: hidden` it would have been a real defect, and the probe
distinguishes the two rather than reporting the offset.

## Tap targets

Every `button`, `a[href]`, `input` and `select` inside `main`, at 360, across eight screens:

**Zero under 44 × 44.**

Worth stating as a measurement rather than a design claim. The floor lives in one place — the
`control` recipe's `min-h-[var(--target-min)] min-w-[var(--target-min)]`, with no opt-out at the
call site — and this is the first time it has been confirmed to hold in the rendered DOM rather
than in the source. The previous implementation lost it in twelve places.

## Contrast

WCAG AA, computed per text node from the resolved `color` and the nearest opaque ancestor
background, with the 3:1 large-text threshold applied where the font size and weight earn it.

**One hit, and it is a limitation of the probe, not a defect.**

`/settings` → "Élő előnézet", ratio 1.15 against a required 4.5. The span is `text-accent-fg`
(black) and its container's background is a `linear-gradient(135deg, oklab(0.79 …))` — the theme
preview swatch. `backgroundColor` on a gradient element is `transparent`, so the walk fell through
to the dark card behind it and compared black against `rgb(18, 21, 26)`.

The real background is a 0.79-lightness gradient, and black on it is precisely what `accent-fg`
exists for. **Recorded rather than dropped**: the next person to run this probe will see the same
line, and the useful thing to hand them is "gradients are invisible to this measurement", not a
silently filtered result.

## Coverage — what this audit did NOT establish

- **Nothing about appearance.** Spacing rhythm, type scale, alignment, colour harmony and motion
  are Bible items this cannot see. `check-tokens` covers the token layer statically; the rest is
  unverified by this pass.
- **Gradient and image backgrounds** are not contrast-checked (above).
- **Only `main`.** Fixed chrome — the bottom nav, the offline banner, the command palette — is
  outside the query, and `check-safe-area` owns the edge-inset half of that.
- **Eight screens for contrast and tap targets**, twelve for overflow. Modal and transient states
  (the rejection reason field, the rest timer, error toasts) were not open when measured.
- **One theme, one language.** Measured in the default dark pack in Hungarian. Hungarian is the
  longest of the three bundles, which is the useful case for overflow, but a light pack has its own
  contrast question.
