---
type: ux-concept
title: Theme engine
phase: 1
tags: [ux, theme, tokens]
---

> [!warning] HISTORICAL — the code this note described was deleted 2026-08-04
> Kept for its engineering lessons only. Nothing here describes running code.
> See [[60-Decisions/0006 Full rebuild from scratch|ADR-0006]].

# Theme engine (F14)

## Three token layers (spec §6.3)

1. **Primitives** (`ui/tokens/tokens.css`) — raw values, the only file that may contain
   hex/px: color scales, `--fs-*` type scale, radii, shadows, motion.
2. **Semantic** (`index.css` `@theme inline` bridge) — `bg`, `surface`, `fg`, `muted`,
   `accent`, `on-accent`, `border`, `ring`, `danger`… mapped per pack via
   `[data-theme="…"]` blocks. Tailwind 4's var-driven spacing scale is the spacing
   primitive of record (no custom `--space-*`; SPEC-PVP K5).
3. **Component** — cva variant maps (`buttonTone`, `surfaceTone`, …) consume semantic
   classes only.

**Structural theming** (owner req 16): packs change shape, not just color — Neon =
pills + glow, Mono = sharp + flat; radius/shadow/border/control-height are per-pack cva
variants (AC-25, AC-26: a 6th pack = tokens.css + one assignment).

## Runtime engine (§6.6)

- **Pre-paint script** in `index.html` (hashed in CSP, ADR-0003): reads persisted
  `{theme, custom}`, sets `data-theme` + custom properties before first paint ⇒ no FOUC
  (AC-32).
- **ThemeProvider** (inside AuthProvider — D-14): syncs per user via
  `GET/PUT /api/v1/users/me/theme` ([[60-Decisions/0004 Tri-state custom-theme config retention|ADR-0004]]).
- **Contrast guard**: client computes `on-accent`, server re-verifies ≥ 4.5 (S30).
- **Admin playground** (`/admin/playground`): live pack + variant matrix QA surface.
- **ElementStyleProvider**: variant map from `GET /api/v1/ui/element-styles` (public),
  localStorage cache, atomic swap on admin update.
