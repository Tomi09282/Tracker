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
    'min-h-[var(--target-min)] min-w-[var(--target-min)]',

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
        primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-pressed',
        secondary:
          'border border-[var(--surface-border)] bg-surface-1 text-text-1 hover:bg-surface-2',
        ghost: 'text-text-2 hover:bg-accent-subtle hover:text-text-1',
        // Destructive is never styled as primary and never sits in the primary position.
        danger: 'bg-danger text-on-danger hover:opacity-90',
      },
      shape: {
        button: 'rounded-button px-4',
        // Square controls: the floor already guarantees 44×44, so no width class is needed.
        icon: 'rounded-chip px-0',
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
