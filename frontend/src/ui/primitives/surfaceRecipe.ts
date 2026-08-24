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
        /**
         * Alpha and a sheen, no backdrop-filter. The default, for the reason in the docblock.
         *
         * The sheen is what this variant was missing. Without a blur behind it, a 62% fill over a
         * soft gradient is a flat wash — the eye gets translucency but no SURFACE. A single wide
         * highlight raking across the face is the cheapest thing that says "this is a face": it is
         * a background-image, it composites in the element's own pass, and it is the difference
         * between a card that is see-through and a card that is made of something.
         */
        veil: 'bg-[image:var(--glass-sheen)]',
        /**
         * Alpha, the sheen, a real backdrop blur, and saturation.
         *
         * `saturate` is doing more work here than the blur is. Averaging neighbouring pixels
         * averages their chroma, so a plain blur turns the aurora behind the pane into grey smoke;
         * pushing saturation back past 1 is what makes it read as colour seen THROUGH something.
         * It rides the same `backdrop-filter` that is already there, so it costs no extra layer.
         */
        glass: [
          'bg-[image:var(--glass-sheen)]',
          'backdrop-blur-[var(--blur-lg)] backdrop-saturate-[var(--card-saturate)]',
        ].join(' '),
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
        /*
         * Three insets, not one, and the extra two are what took this from "tinted panel" to
         * "pane". A single top hairline lights the top edge and leaves the other three at the
         * border's flat alpha, so the card reads as an outlined rectangle. Real glass is lit
         * unevenly: bright where the light lands, dark under its own thickness.
         *
         * `--glass-lip` carries the highlight over the top and faintly round the sides;
         * `--glass-underside` puts the pane's own shadow just inside the bottom edge. Both are
         * inset shadows painting in the pass the element already had, so the cost is zero — the
         * expensive half of glass is `backdrop-filter`, and that lives on `finish`.
         */
        true: 'shadow-[var(--glass-lip),var(--glass-underside)]',
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
