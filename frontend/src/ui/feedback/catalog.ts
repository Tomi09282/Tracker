/**
 * The element catalog — the single list of every feedback element and its five variants.
 *
 * This is the frontend's copy of what `element_style_config` stores. The admin studio reads
 * from here for its labels, the playground iterates it, and the smoke suite asserts the two
 * stay in step: a variant offered in the UI that the database will not accept, or a row in the
 * database with no implementation, are both bugs the parity check catches.
 */

export const VARIANTS = ['A', 'B', 'C', 'D', 'E'] as const;
export type Variant = (typeof VARIANTS)[number];

export interface CatalogEntry {
  id: string;
  name: string;
  /** Which phase implements the component this element belongs to. */
  phase: number;
  /**
   * Does any component actually READ this variant?
   *
   * Three entries are false. They have rows in `element_style_config`, labels here, and a settable
   * endpoint — and nothing anywhere consults them, so an admin can pick a variant, watch it save
   * and see it audited while the product does not change by a pixel. The studio labels those inert
   * rather than pretending, and `scripts/check-element-roster.mjs` holds this field to the measured
   * `useElementVariant` call sites so it cannot quietly become a lie in either direction.
   */
  live: boolean;
  variants: Record<Variant, string>;
}

export const CATALOG: CatalogEntry[] = [
  {
    id: 'E1',
    name: 'Button',
    phase: 1,
    live: true,
    variants: {
      A: 'Press-spring',
      B: 'Ripple',
      C: 'Sheen-sweep',
      D: 'Morph-to-progress',
      E: 'Icon-slide',
    },
  },
  {
    id: 'E2',
    name: 'Copy button',
    phase: 1,
    live: true,
    variants: {
      A: 'Copy→check morph',
      B: 'Check + tooltip pop',
      C: 'Mini-confetti',
      D: 'Fill-wipe',
      E: 'Count badge',
    },
  },
  {
    id: 'E3',
    name: 'Icon button',
    phase: 1,
    live: true,
    variants: {
      A: 'Micro-bounce',
      B: 'Ink-dot',
      C: 'Icon-morph',
      D: 'Ring-pulse',
      E: 'Ghost→accent',
    },
  },
  {
    id: 'E4',
    name: 'Toggle',
    phase: 1,
    live: true,
    variants: {
      A: 'Squash-thumb',
      B: 'Icon-in-thumb',
      C: 'Text-slide',
      D: 'Glow-on',
      E: 'Saving-state',
    },
  },
  {
    id: 'E5',
    name: 'Checkbox',
    phase: 1,
    live: true,
    variants: {
      A: 'Draw-on',
      B: 'Bounce-in',
      C: 'Strike-label',
      D: 'Ring-confirm',
      E: 'Indeterminate-sweep',
    },
  },
  {
    id: 'E6',
    name: 'Segmented control',
    phase: 1,
    live: true,
    variants: {
      A: 'Sliding-thumb',
      B: 'Underline-sweep',
      C: 'Scale-elevate',
      D: 'Icon-bounce',
      E: 'Fill-cascade',
    },
  },
  {
    id: 'E7',
    name: 'Text input',
    phase: 1,
    live: true,
    variants: {
      A: 'Focus-glow',
      B: 'Shake-on-error',
      C: 'Success-tick',
      D: 'Char-pop',
      E: 'Gradient-border',
    },
  },
  { id: 'E8', name: 'Select', phase: 1, live: true, variants: { A: 'Spring-open', B: 'Check-slide', C: 'Highlight-trail', D: 'Sheet-up', E: 'Live-search' } },
  { id: 'E9', name: 'Date picker', phase: 1, live: true, variants: { A: 'Pop-select', B: 'Range-paint', C: 'Today-pulse', D: 'Quick-chips', E: 'Swipe-month' } },
  { id: 'E10', name: 'Tabs', phase: 1, live: true, variants: { A: 'Motion-highlight', B: 'Underline-grow', C: 'Icon-colorize', D: 'Badge-flush', E: 'Content-swap' } },
  { id: 'E11', name: 'Bottom nav item', phase: 1, live: true, variants: { A: 'Active-pill', B: 'Bounce-dot', C: 'Icon-morph', D: 'Badge-bubble', E: 'Center-FAB' } },
  { id: 'E12', name: 'Card', phase: 1, live: true, variants: { A: 'Lift-press', B: 'Tilt-glare', C: 'Border-beam', D: 'Hero-expand', E: 'Select-mode' } },
  { id: 'E13', name: 'List item + swipe', phase: 1, live: true, variants: { A: 'Swipe-reveal', B: 'Check-swipe', C: 'Long-press menu', D: 'Reorder-drag', E: 'Tap-ripple' } },
  { id: 'E14', name: 'Modal / sheet', phase: 1, live: true, variants: { A: 'Spring-sheet', B: 'Scale-dialog', C: 'Morph-from-trigger', D: 'Stacked-sheets', E: 'Success-close' } },
  { id: 'E15', name: 'Toast', phase: 1, live: true, variants: { A: 'Slide-stack', B: 'Progress-line', C: 'Typed-icon', D: 'Undo-flip', E: 'Coin-toast' } },
  { id: 'E16', name: 'Progress / ring', phase: 1, live: true, variants: { A: 'Spring-fill', B: 'Striped-flow', C: 'Milestone-pop', D: 'Ring-odometer', E: 'Color-ramp' } },
  { id: 'E17', name: 'Slider', phase: 1, live: true, variants: { A: 'Thumb-grow', B: 'Tick-snap', C: 'Fill-gradient', D: 'Dual-range', E: 'Icon-ends' } },
  { id: 'E18', name: 'Skeleton', phase: 1, live: true, variants: { A: 'Shimmer-sweep', B: 'Pulse-soft', C: 'Stagger-reveal', D: 'Shape-morph', E: 'Exact-ghost' } },
  { id: 'E19', name: 'Pull to refresh', phase: 1, live: true, variants: { A: 'Spinner-grow', B: 'Logo-flip', C: 'Rubber-band', D: 'Status-morph', E: 'Surprise-drop' } },
  { id: 'E20', name: 'FAB', phase: 1, live: true, variants: { A: 'Speed-dial', B: 'Morph-sheet', C: 'Hide-on-scroll', D: 'Drag-dock', E: 'Progress-halo' } },
  // E21–E26 belong to components that arrive in later phases. Their rows exist in the database
  // and their labels exist here, so the admin studio is complete from day one; only the
  // implementations are missing, and the playground marks them as such rather than pretending.
  { id: 'E21', name: 'Set-check row', phase: 2, live: true, variants: { A: 'Tap-complete', B: 'Hold-to-confirm', C: 'Swipe-weight', D: 'PR-flash', E: 'Undo-pill' } },
  { id: 'E22', name: 'Rest timer', phase: 2, live: true, variants: { A: 'Ring-shrink', B: 'Time-chip', C: 'Top-bar', D: 'Next-up', E: 'Auto-advance' } },
  { id: 'E23', name: 'Like / reaction', phase: 6, live: false, variants: { A: 'Heart-burst', B: 'Double-tap', C: 'Reaction-bar', D: 'Liked-pulse', E: 'Count-roll' } },
  { id: 'E24', name: 'Follow button', phase: 6, live: false, variants: { A: 'Morph-pill', B: 'Bell-offer', C: 'Avatar-slide', D: 'First-of-day', E: 'Unfollow-guard' } },
  { id: 'E25', name: 'Coin balance', phase: 5, live: true, variants: { A: 'Odometer-roll', B: 'Fly-to-wallet', C: 'Balance-pulse', D: 'Breakdown-sheet', E: 'Milestone-banner' } },
  { id: 'E26', name: 'Streak / achievement', phase: 5, live: true, variants: { A: 'Flame-flicker', B: 'Unlock-overlay', C: 'Next-tease', D: 'Streak-freeze', E: 'Confetti-finale' } },
  { id: 'E27', name: 'Interval stage', phase: 2, live: false, variants: { A: 'Bar-count', B: 'Ring-count', C: 'Full-bleed', D: 'Round-dots', E: 'Coach-voice' } },
];

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
