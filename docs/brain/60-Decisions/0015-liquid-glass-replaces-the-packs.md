---
type: adr
title: ADR-0015 Liquid glass replaces the five theme packs
status: accepted
phase: 9
date: 2026-08-23
supersedes: DESIGN.md DECISION 24 ("each pack's structural identity is deliberate")
tags: [decision, adr, design-system, theme, phase-9]
---

# ADR-0015 — Liquid glass replaces the five theme packs

**Context.** Twenty-seven mockups were approved in a single visual language: translucent smoked
glass over a soft out-of-focus aurora, one large visual anchor per screen, dark and light. The
shipped app instead offers five *dark* packs — Midnight, Solar, Forest, Neon, Mono — each a full
self-contained set of the same token names, switched by `data-theme` on the root element.

The two cannot both be the product. A glass surface derives its character from what is behind it
and from how light catches its edge; five packs derive theirs from being structurally different
from each other. Keeping both means authoring the glass five times and testing five contrast
matrices, for a customisation nobody asked for.

## Decision

**One visual language: liquid glass, in dark and light mode.** `data-theme` survives but shrinks to
declaring a single token — the aurora gradient — so a "theme" becomes a skin over one shared
structure rather than a structure of its own. Four free packs are retired. The two purchasable
packs survive as skins, which is what makes them work for the first time (see [[0018-purchased-theme-packs|ADR-0018]]).

## What DECISION 24 said, and what is actually true

`DESIGN.md` DECISION 24 reads: *"each pack's structural identity is deliberate (midnight calm /
solar soft + 48px controls / neon pill + glow / mono sharp + flat). Flattening these into one look
destroys the theme system."*

It would be convenient to claim the identity was notional and the decision therefore cheap to undo.
**It was measured before writing this, and that claim is false.** Counting how each pack differs
from Midnight, and splitting colour from structure:

| Pack | Tokens differing | Of those, NOT colour |
|---|---|---|
| **Forest** | 7 | **0** |
| Solar | 14 | 7 — all four radii, `--control-h` 48px, both shadow layers |
| Neon | 16 | 7 — all four radii, both shadows, `--shadow-glow` |
| Mono | 18 | 9 — all four radii, `--radius-chip`, `--border-width` 2px, both shadows, `--overlay-border` |

And the structure reaches screens heavily: `rounded-card` appears **171 times** in the source,
`rounded-chip` 83, `rounded-field` 43. A pack that moves `--radius-card` moves 171 rendered
corners. DECISION 24 is right about Solar, Neon and Mono.

**The one exception is Forest, which has no structural identity at all** — seven tokens differ and
every one of them is a colour. Forest is Midnight with a green accent, and has been since it was
written.

## So the decision is a trade, not a correction

Something real is being given up. Three packs genuinely look different, and a user on Mono is about
to lose a sharp, flat, heavy-bordered app they may have chosen deliberately.

It is given up because **one language done well beats five done at 20% each.** Concretely:

- The glass material has to be authored, contrast-checked and performance-tested once per mode
  instead of once per pack per mode — two matrices instead of ten.
- Every screen in the redesign has a large visual anchor and a translucent surface. Five packs
  means five answers to "how does a ring read through this glass over that aurora", and the honest
  expectation is that three of them would never be checked.
- A light mode is arriving ([[0017-light-mode-is-a-second-attribute|ADR-0017]]). Five packs × two
  modes is ten full token sets to keep in agreement. That is the point at which the theme system
  stops being maintained and starts being copied.

## What survives

- `data-theme` as a mechanism, and its pre-paint script. Only its vocabulary shrinks.
- Every token NAME in Layer 2. Nothing is renamed; the four retired blocks are deleted and Midnight
  is folded into `:root`.
- The user's ability to pick — three skins rather than five packs, plus a mode.

## Retirement without a migration, and why the ordering matters

The CSS packs are deleted in T9.2, and the database roster is deactivated later in T9.4. That order
is deliberate and is what makes this safe: once `:root` is the one glass dark set, a stored
`data-theme="neon"` matches nothing and falls through to `:root`, which is glass. Every user on
every retired pack degrades correctly with **zero data migration and zero coordination between
client and server deploys.**

> [!warning] One server-side bug this exposes
> `backend/src/theme/routes.js:112` looks up `WHERE key = ? AND active = 1` and 404s when it finds
> nothing. A user still stored on `neon` who changes their accent gets a "not found" that means
> nothing to them, and `GET /me/theme` returns a pack absent from its own roster so the picker
> shows nothing selected. T9.4.1 sets those preferences to `midnight` **before** deactivating,
> in the same transaction.

## Related

[[0016-glass-rim-is-not-a-shadow]] · [[0017-light-mode-is-a-second-attribute]] · [[0018-purchased-theme-packs]] · [[0006 Full rebuild from scratch]] · [[00-Index/TODO Phase-9]] · [[55-Screens/0000 Index]]
