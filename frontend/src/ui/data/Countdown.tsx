import type { CSSProperties } from 'react';
import { cn } from '../../lib/cn';

/*
 * Countdown — a ticking time in the display face, in FIXED-WIDTH digit cells (lane G-lifeos, kit
 * gap F.2; ruling DEV-003: a number that changes on screen in the display face never shifts
 * sideways). Used by focus-2 (the running session, "34:42").
 *
 * Source: `figma-build/lifeos/focus-2.body.js` `countdown`:
 *
 *   every digit sits CENTRED BY ITS INK in a cell as wide as the widest digit's ink + 6;
 *   the colon in a cell of its own ink + 20; the box is one cap high (the ink of "0").
 *
 * Measured on focus-2@2x (giant, 124 / 108, Big Shoulders Display Black): ink of "3" 29.5-83,
 * "4" 92.5-150, ":" 164.5-185, "4" 199.5-257, "2" 267.5-319, the box from x 24 — which is a digit
 * cell of 65 and a colon cell of 41: 24 + 65 + 65 + 41 + 65 + 65 = 325. In em of the size, so the
 * fluid giant (min(124, 31vw)) keeps the same proportions: 65 / 124 and 41 / 124.
 *
 * Centring by INK, not by advance: each glyph is moved by half the difference of its side bearings
 * (Big Shoulders Display Black as the shipped woff2 renders, the table `Numeral` measured —
 * docs/pipeline/pulse/pkg/F10/proofs/face-metrics.json). Inside the cells the face's tracking is
 * off: the cells are the spacing.
 *
 * Vertically the box is trimmed to the cap line and the baseline (`text-box`, with the token
 * fallback of `Numeral`), plus the 0.01 em the round digits draw above and below.
 *
 * Accessibility: `role="timer"` (polite by nothing — a timer is not live, it would speak every
 * second). The spoken text is `srText`, or the time as drawn.
 *
 * Reference: docs/pipeline/pulse/kit/lifeos.md.
 */

export type CountdownSize = 'giant' | 'num';
export type CountdownTone = 'ink' | 'pending';

export interface CountdownProps {
  /** Seconds left (or elapsed). Below 0 counts as 0. Drawn `m:ss`, `mm:ss`, from an hour `h:mm:ss`. */
  seconds: number;
  /** `giant` (default, focus-2) or `num` (48). */
  size?: CountdownSize;
  /** `ink` (default) or `pending` (`text-3`: paused, not started). */
  tone?: CountdownTone;
  /** Minutes drawn with two digits at least ("05:00"). Default true, as the frame. */
  padMinutes?: boolean;
  /** What a screen reader says instead of the figure ("34 perc 42 másodperc van hátra"). */
  srText?: string;
  /** Placement only — never a `text-…` class. */
  className?: string;
}

/** Side bearings [left, right] in em — a copy of the digits and the colon of `Numeral`'s face table. */
const BEARING: Record<string, readonly [number, number]> = {
  '0': [0.04, 0.04],
  '1': [0.03, 0.04],
  '2': [0.04, 0.029],
  '3': [0.03, 0.04],
  '4': [0.03, 0.01],
  '5': [0.04, 0.04],
  '6': [0.04, 0.0325],
  '7': [0.02, 0.03],
  '8': [0.038, 0.0375],
  '9': [0.032, 0.04],
  ':': [0.04, 0.04],
};

/** The digit cell and the colon cell, in em of the size (focus-2: 65 and 41 at 124). */
const DIGIT_CELL = 65 / 124;
const COLON_CELL = 41 / 124;

const em = (n: number) => `${+n.toFixed(4)}em`;

const TRIMS = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('text-box', 'trim-both cap alphabetic');
const TRIM_CLASS = '[text-box:trim-both_cap_alphabetic]';
const TRIM_FALLBACK: CSSProperties = TRIMS ? {} : { marginTop: 'var(--trim-display-t)', marginBottom: 'var(--trim-display-b)' };

/** `seconds` as drawn. */
export function formatCountdown(seconds: number, padMinutes = true): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${padMinutes ? String(m).padStart(2, '0') : m}:${ss}`;
}

const STEP: Record<CountdownSize, string> = { giant: 'text-giant', num: 'text-num' };
const TONE: Record<CountdownTone, string> = { ink: 'text-text-1', pending: 'text-text-3' };

export function Countdown({ seconds, size = 'giant', tone = 'ink', padMinutes = true, srText, className }: CountdownProps) {
  const text = formatCountdown(seconds, padMinutes);
  return (
    <span
      data-kit="countdown"
      data-size={size}
      role="timer"
      className={cn('inline-flex tracking-normal', STEP[size], TONE[tone], className)}
      // THE ONE SIZE MECHANISM of the giant (Numeral): the fluid size inline, never a second text-… class.
      style={size === 'giant' ? { fontSize: 'var(--giant-fluid)' } : undefined}
    >
      <span className="sr-only">{srText ?? text}</span>
      <span
        aria-hidden
        // inline-BLOCK, not flex: `text-box` trims the lines of a block container only.
        className={cn('inline-block whitespace-nowrap', TRIM_CLASS)}
        style={{ ...TRIM_FALLBACK, paddingTop: `max(0em, 0.81em - var(--face-display-cap))`, paddingBottom: '0.01em' }}
      >
        {[...text].map((ch, i) => {
          const [l, r] = BEARING[ch] ?? [0.035, 0.035];
          return (
            <span
              // A position in the string is the cell's identity: a digit that changes stays in its cell.
              key={i}
              data-kit-part="cell"
              className="inline-block text-center"
              style={{ width: em(ch === ':' ? COLON_CELL : DIGIT_CELL), transform: `translateX(${em((r - l) / 2)})` }}
            >
              {ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}
