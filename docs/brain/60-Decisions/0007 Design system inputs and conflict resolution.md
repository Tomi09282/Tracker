---
type: decision
id: 7
title: Design system inputs and conflict resolution
status: accepted
date: 2026-08-04
tags: [decision, adr, design-system, phase-0]
---

# ADR-0007 — Design system inputs and conflict resolution

## Context

Phase 0 builds the token layer before any screen exists (ADR-0006). Two authorities feed it:
the **VISUAL DESIGN BIBLE** (product-specific law) and the **ui-ux-pro-max** skill (design
intelligence). The super prompt's CONFLICT RULE is explicit: the Bible always wins; the skill
informs choices *within* the Bible's constraints.

## The skill's recommendations (queried 2026-08-04)

`search.py "fitness coach client workout tracking mobile dark premium" --design-system
-p "TRACKER" --variance 4 --motion 5 --density 5`

| Dimension | Skill output | Verdict |
|---|---|---|
| Style | **Modern Dark (Cinema Mobile)** | **ADOPTED** — dark-primary, layered elevation, frosted-glass nav, premium, explicitly "avoid pure #000000 (OLED smear)". Aligns with the Bible on every point. |
| Easing | `cubic-bezier(0.16, 1, 0.3, 1)` | **ADOPTED** — identical to the Bible's standard easing. Independent corroboration. |
| Press feedback | scale 0.97 → 1.0, haptic-linked | **ADOPTED** — matches the Bible's E1-A and emil-design-eng's `:active` rule. |
| Palette | Orange `#F97316` / green `#22C55E` on `#1F2937` | **REJECTED** — the Bible fixes Midnight exactly (accent `#6E8CFB`). |
| Typography | Barlow Condensed + Barlow ("sports, athletic") | **REJECTED** — the Bible fixes Space Grotesk + Inter. |
| Pattern | "Enterprise Gateway" (path selection, mega menu, Contact Sales) | **REJECTED** — a B2B *landing-page* pattern; TRACKER is an app shell with a bottom navbar. The query matched a marketing dimension that does not apply. |
| Spring | damping 20 / stiffness 90 | **REJECTED** — the Bible specifies stiffness 300–400 / damping 17–28. |
| Stagger | 60 ms per item | **ADJUSTED** — the Bible caps stagger at 30–50 ms; using 40 ms. |
| Anti-patterns | "static design", "no gamification" | **NOTED** — F12 gamification is already on the roadmap. |

`--domain typography "Space Grotesk Inter geometric sans technical modern"` returned
**"Web3 Bitcoin DeFi (Space Grotesk + Inter + Mono)"** as its top pairing — the Bible's font
choice is a validated pairing in the skill's own database, described as geometric/technical with
high-legibility body. Its third family (JetBrains Mono for figures) is **not** adopted: the Bible
caps the product at two families and mandates `tabular-nums`, which Inter provides.

`--domain ux "touch target dark mode contrast animation reduced-motion tokens"` returned, at
**High** severity: respect `prefers-reduced-motion`; minimum 44×44 px touch targets
(`min-h-[44px] min-w-[44px]`, anti-pattern `w-6 h-6 buttons`); animate 1–2 key elements per view;
body-text contrast. All four are already Bible law and are encoded as Phase 0 gates.

## Decision

Build the token layer to the Bible's exact values. Cite the skill only where it corroborates or
fills a gap the Bible leaves open (style family, press physics, stagger discipline).

Record the three rejections above so a future session does not "helpfully" re-apply the skill's
palette, fonts or landing-page pattern.

## Consequences

- Fonts: `@fontsource/space-grotesk` (display) + `@fontsource-variable/inter` (body), self-hosted
  — not the Google Fonts CDN the skill's CSS import suggests, because the strict CSP forbids
  third-party style and font origins.
- The accent ramp is derived at runtime in OKLab from a single `--accent`, so a user-picked
  custom accent gets the same 10-step ramp as the built-in packs.
- `accent-fg` is computed in JS against the WCAG 4.5:1 floor, because CSS cannot yet compute
  contrast portably.

## Related

[[0006 Full rebuild from scratch]] · [[00-Index/TODO Master]]
