import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The control recipe — every interactive element in the product is built from this.
 *
 * Why a shared recipe rather than per-component classes: the previous implementation lost the
 * 44 px floor in twelve places (a 24 px search field, nine 32 px chips), because each component
 * chose its own height. Here the floor is not a rule anyone has to remember — it is the base
 * layer of every variant, and `check-tokens.mjs` refuses raw `<button>` elements outside
 * `src/ui/` so nothing can bypass it.
 *
 * All five interaction states the Bible requires are defined once, here:
 * hover, active (press), focus-visible, disabled, and busy.
 */
export const control = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-2',
    'font-body whitespace-nowrap',

    // THE FLOOR. Both axes, on every variant, with no way to opt out from a call site.
    //
    // The height reads `--control-h` rather than `--target-min` because control height is one of
    // the four things a theme pack is allowed to change (size / radius / shadow / border), and
    // Solar declares 48px with the comment "Solar = soft: larger radii, deeper shadow, taller
    // controls" — a claim the app did not make anywhere, because nothing consumed the token.
    // Every pack declares `--control-h` at >= 44px (four of five as `var(--target-min)` itself),
    // so the a11y floor is unchanged: this can only ever make a control taller.
    // The WIDTH stays on `--target-min`: it is the floor for a square icon control, not a
    // stylistic dimension, and a taller pack has no reason to widen every chip.
    'min-h-[var(--control-h)] min-w-[var(--target-min)]',

    // Press feedback. `duration-instant` (100ms) because a press must answer immediately;
    // anything slower reads as lag rather than acknowledgement.
    'transition-[transform,background-color,border-color,color,opacity]',
    'duration-[var(--duration-instant)] ease-[var(--ease-standard)]',
    'active:scale-[0.97]',

    // Focus is redrawn, never removed. The ring lives on the accent token so it survives a
    // theme swap.
    'outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
    'focus-visible:outline-[var(--focus-ring)]',

    // Disabled must be unmistakable AND inert — a control that looks pressable but does
    // nothing is worse than one that looks disabled.
    'disabled:pointer-events-none disabled:opacity-45',

    // Busy: the control stays visible and keeps its size (no layout shift) but refuses input.
    'aria-busy:pointer-events-none aria-busy:cursor-progress',

    // Touch devices fire hover on tap, which leaves elements stuck in a hover state after a
    // press. Tailwind 4 already gates `hover:` behind `@media (hover: hover)`; this makes the
    // intent explicit for anyone reading the recipe.
    'cursor-pointer',
  ],
  {
    variants: {
      variant: {
        // Exactly one primary action per screen — the Bible's rule, and the reason this is the
        // only variant with a filled accent background.
        //
        // `--shadow-glow` is Neon's declared structural identity ("pill + glow, no drop shadow")
        // and it reached no product screen: the token is `none` in the other four packs, so
        // carrying it here is the entire visible difference between Neon and Midnight-with-a-
        // cyan-accent, and it costs literally nothing anywhere else. It is not a card shadow —
        // the primary button has no border, so "border OR shadow, never both" is not in play.
        primary:
          'bg-accent text-accent-fg shadow-[var(--shadow-glow)] hover:bg-accent-hover active:bg-accent-pressed',
        // The border WIDTH comes from the pack: Mono declares 2px under "sharp + flat: no radius,
        // heavier border" and every call site wrote Tailwind's `border` (= 1px), so the heaviest
        // pack shipped the same hairline as the calmest one.
        // Hover strengthens the edge as well as the fill — a surface-2 hover on a surface-1
        // control is a 1.1:1 change, which is not an answer to a pointer.
        secondary: [
          'border-[length:var(--border-width)] border-[var(--surface-border)]',
          'bg-surface-1 text-text-1',
          'hover:border-[var(--surface-border-strong)] hover:bg-surface-2',
        ].join(' '),
        ghost: 'text-text-2 hover:bg-accent-subtle hover:text-text-1',
        // Destructive is never styled as primary and never sits in the primary position.
        danger: 'bg-danger text-on-danger hover:opacity-90',
      },
      /**
       * The selected state of a filter chip / toggle — DESIGN §5.6, `bg-accent-subtle` + accent ink.
       *
       * A variant rather than a call-site constant because it was already being hand-written twice
       * (MarketplacePage, ComposePage), and the hover half is the part a call site forgets: without
       * `hover:bg-accent-subtle` the selected chip REVERTS to `surface-2` under the pointer, which
       * reads as "you are about to deselect" on a chip that is merely being hovered.
       *
       * The transparent border is not decoration: `secondary` carries a `--border-width` edge, so a
       * selected chip that simply dropped it would shrink by 1–2px and shove the row.
       *
       * DECLARED BETWEEN `variant` AND `density`, deliberately. cva emits variants in key order and
       * `cn()` runs twMerge over the result, so position decides who wins a conflict: after
       * `variant` the fill/edge/hover overrides land, before `density` the ink sits where the
       * eventual `text-*` colour-group fix (lib/cn.ts) will let it survive alongside `text-body-s`.
       * Until that lands `text-body-s` swallows it — exactly as it already swallows `secondary`'s
       * and `ghost`'s ink today, so this variant is no worse off than the four above it.
       */
      selected: {
        true: [
          'bg-accent-subtle text-on-accent-subtle',
          'border-[length:var(--border-width)] border-transparent',
          'hover:bg-accent-subtle hover:text-on-accent-subtle hover:border-transparent',
        ].join(' '),
      },
      shape: {
        button: 'rounded-button px-4',
        // Square controls: the floor already guarantees 44×44, so no width class is needed.
        // Square, and it has to say so: --control-h is 48px in Solar while --target-min is 44, so a
        // min-width pinned to the floor would render every icon-only chip 44x48.
        icon: 'rounded-chip px-0 min-w-[var(--control-h)]',
        chip: 'rounded-chip px-4',
        field: 'w-full justify-start rounded-field px-3 text-left font-normal',
      },
      /**
       * Visual density. NOTE: this changes padding and type size only — never the hit area.
       * A "small" control is visually smaller while still occupying 44 px of tappable space,
       * which is exactly how the previous build's 32 px chips should have been done.
       */
      density: {
        compact: 'text-body-s px-3',
        default: 'text-body-s',
        large: 'text-title-3 px-5',
      },
    },
    defaultVariants: { variant: 'secondary', shape: 'button', density: 'default' },
  },
);

export type ControlVariants = VariantProps<typeof control>;

/**
 * The STATUS chip — a chip-shaped label that reports state and does nothing when you touch it.
 *
 * Separate from `control` rather than a variant of it, because everything `control` guarantees is
 * wrong here: a `cursor-pointer` on a `<span>` promises an action that does not exist,
 * `active:scale-[0.97]` answers a press nobody made, `min-h-[var(--control-h)]` inflates a 24px
 * word to 44px, and the disabled/busy states have no meaning on a thing that was never a target.
 * The 44px floor exists to protect TARGETS; applying it to a label does not make anything more
 * accessible, it just makes the row taller.
 *
 * It exists because the same string kept being retyped — `workout/SetRow.tsx`'s `Visszavonva`
 * label writes the `neutral` tone below verbatim, and the admin, coaching and library screens
 * hand-roll the tonal ones. A tone is a semantic claim ("this is a warning"), and a claim that is
 * copy-pasted drifts.
 *
 * The tone strings carry the INK and the base carries the size, in that order on purpose: under
 * today's twMerge config `text-caption` and `text-danger` share one class group, and if the sizes
 * came last a `danger` pill would render in the inherited colour — a warning with no warning in
 * it. Losing the caption size to an inherited one is a smaller wrong, and both survive once
 * `lib/cn.ts` teaches twMerge this project's font-size names.
 */
export const chip = cva(['inline-flex items-center gap-1 whitespace-nowrap', 'rounded-chip px-3 py-1', 'text-caption'], {
  variants: {
    tone: {
      /** The default: a bordered pill on the card surface. Says "state", claims nothing about it. */
      neutral:
        'border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-1 text-text-2',
      /** Borderless, recessed — for a count or a tag that must not compete with the row it labels. */
      quiet: 'bg-surface-2 text-text-3',
      // `text-on-accent-subtle`, NOT `text-accent` — DESIGN §7 #63. The wash is the accent at 20%,
      // so accent-on-accent-wash cannot open a contrast gap in any pack at any hue. Three call
      // sites in `features/admin/` currently write the failing pair; this is the one to copy.
      accent: 'bg-accent-subtle text-on-accent-subtle',
      success: 'bg-success-subtle text-success',
      warning: 'bg-warning-subtle text-warning',
      danger: 'bg-danger-subtle text-danger',
      info: 'bg-info-subtle text-info',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type ChipVariants = VariantProps<typeof chip>;
