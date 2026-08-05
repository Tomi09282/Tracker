// token-lint-disable-file: every literal below is DATA, not styling.
//
// The hexes here are values the user picks or the algorithm compares against — they are never
// used to paint this app's own surfaces. Keeping them in one exempt file means the colour rules
// stay absolute everywhere else: no component may quietly introduce a raw hex "just this once".

import type { Gradient } from './ThemeProvider';

/**
 * Accent presets offered in the picker.
 *
 * Each one clears 4.5:1 against BOTH black and white, so choosing a preset can never produce an
 * unreadable label whichever foreground the contrast guard selects. The custom picker below
 * them is where the guard actually has work to do.
 */
export const ACCENT_PRESETS = [
  '#6E8CFB', // the Midnight default
  '#4ADE80',
  '#FBBF24',
  '#F87171',
  '#22D3EE',
  '#C084FC',
  '#FB923C',
  '#F0ABFC',
] as const;

/** Starting point for the gradient builder: two stops in one hue family, 135°, per the Bible. */
export const DEFAULT_GRADIENT: Gradient = {
  type: 'linear',
  angle: 135,
  stops: [
    { color: '#6E8CFB', position: 0 },
    { color: '#3B54C4', position: 100 },
  ],
};

/** The two candidate foregrounds a WCAG contrast check compares against. */
export const BLACK = '#000000';
export const WHITE = '#FFFFFF';

/**
 * Darkest surface across every pack (Neon's). Used only as the contrast guard's fallback for
 * the instant before the stylesheet applies — being the darkest, it can only make the guard
 * stricter, never looser.
 */
export const DARKEST_SURFACE = '#06070A';
