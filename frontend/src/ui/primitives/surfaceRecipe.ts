import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The recipe every panel is built from — the surface counterpart to `control.ts`.
 *
 * `DESIGN.md` G4 specified this by name before the glass work started:
 * *"Proposed: `src/ui/primitives/Surface.tsx`, built like `control.ts` — a cva recipe."* This is
 * that proposal implemented, not a new idea.
 *
 * WHY IT EXISTS NOW AND DID NOT BEFORE.
 * A card used to be two properties — `bg-surface-1` plus a border — and hand-writing two
 * properties 92 times was merely wasteful. A glass card is six: alpha fill, blur or no blur, the
 * inset rim, the pack's border width, the radius and the padding. Six copied 92 times is the
 * failure ADR-0006 was written about. G4 also measured the drift that had already happened:
 * `p-3` beat `p-4` 121:62, so the padding decision had quietly been re-made per call site.
 *
 * THE `finish` AXIS IS A PERFORMANCE DECISION, NOT A STYLE ONE.
 * `backdrop-filter` puts its element on its own compositing layer and re-samples the backdrop
 * every frame. A list of a dozen cards on a mid-range Android is where that becomes visible, and
 * this app is used on cheap phones in gyms. So `veil` — alpha, no blur — is the DEFAULT, and
 * `glass` is opted into only by surfaces that float over MOVING content: the nav, sheets, toasts,
 * the rest timer, the command palette, a hero anchor. The visual difference is close to nothing,
 * because the aurora behind is already out of focus and blurring a soft gradient adds little.
 */
export const surface = cva(
  [
    'rounded-[var(--card-radius)]',
    // The pack owns the width (Mono declares 2px); the surface owns the colour.
    'border-[length:var(--border-width)] border-[var(--card-border)]',
  ],
  {
    variants: {
      elevation: {
        /** A resting panel on the page. The default, and by far the most common. */
        card: 'bg-[var(--card-bg)]',
        /** A well INSIDE a card — a field, a bar track, a hero box. Never a second card style. */
        inset: 'bg-surface-2',
        /** A bottom sheet or dialog: it owns most of what is behind it and carries a shadow. */
        sheet: 'bg-[var(--sheet-bg)] shadow-[var(--shadow-overlay)] border-[var(--overlay-border)]',
        /** A bar pinned to an edge — the nav, the offline strip. */
        bar: 'bg-[var(--nav-bg)]',
      },
      finish: {
        /** Alpha only. The default, for the reason in the docblock above. */
        veil: '',
        /** Alpha plus a real backdrop blur. For surfaces that float over moving content. */
        glass: 'backdrop-blur-[var(--blur-lg)]',
        /** Opaque. For anything that must stay legible regardless of what is behind it. */
        solid: 'bg-surface-1',
      },
      /**
       * The specular rim (ADR-0016): a bright line along the top edge where a pane catches light.
       *
       * An INSET highlight, which is why F-09 ("border OR shadow, never both") is not in play — it
       * renders inside the element's own box and claims no elevation. Remove it and the card looks
       * like plastic, not like it descended. That is the test.
       */
      rim: {
        true: 'shadow-[inset_0_1px_0_var(--card-rim)]',
        false: '',
      },
      /** Hover and focus, for a card that is itself a link or a button. G4's recorded gap. */
      interactive: {
        true: [
          'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
          'hover:border-[var(--surface-border-strong)] hover:bg-surface-2',
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-[var(--focus-ring)]',
        ].join(' '),
        false: '',
      },
      pad: {
        none: '',
        card: 'p-[var(--card-pad)]',
      },
    },
    // A sheet carries a shadow, so it must not also carry a rim — that would be the F-09 pairing
    // this system exists to prevent. Encoded here rather than left to every call site to remember.
    compoundVariants: [{ elevation: 'sheet', rim: true, class: 'shadow-[var(--shadow-overlay)]' }],
    defaultVariants: {
      elevation: 'card',
      finish: 'veil',
      rim: true,
      interactive: false,
      pad: 'card',
    },
  },
);

export type SurfaceVariants = VariantProps<typeof surface>;
