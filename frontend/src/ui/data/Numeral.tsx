import type { CSSProperties } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { DigitRoller } from '../feedback/CountUp';

/*
 * Numeral and Fraction — the big figures of Pulse (kit `numeral` / `fraction`, Pulse System 2.2, 4).
 *
 * ═══ INK-TIGHT ══════════════════════════════════════════════════════════════════════════════════
 *
 * In the frames a figure is placed by its INK, not by its text box: the Figma kit measures the
 * rendered glyphs and makes the frame exactly the ink box (`app-kit.js` `numeral`, `fraction`).
 * "2" on Home stands on x 24 with its ink, 8 under the eyebrow with its ink — its text box starts
 * at x 19. A CSS text box would put every figure 3-5 pt right of the gutter and 3 pt low.
 *
 * So the element that draws the digits is trimmed to its ink:
 *
 *   top / bottom  `text-box: trim-both cap alphabetic` cuts the line box to cap height and
 *                 baseline; a padding of the overshoot puts back what the glyphs of THIS string
 *                 draw beyond them (the round top of "0", the tail of the comma in "83,1").
 *   left / right  a negative margin of the first glyph's left and the last glyph's right side
 *                 bearing (and the trailing tracking Chrome adds after the last glyph).
 *
 * The bearings and overshoots come from `GLYPH` below: Big Shoulders Display Black as the shipped
 * woff2 renders in Chrome (measured on a 1000 px canvas, docs/pipeline/pulse/pkg/F10/proofs). They
 * agree with the ink boxes exported from Figma to 0.1 pt (home-1 "2" left bearing 5.0, coins-1
 * "190" ink 147.6 x 101.7, progress-1 "83,1" ink height 118).
 *
 * Where `text-box` is not supported the same box comes from margins computed from the face's
 * ascent, descent and cap height (tokens.css, lane F10; `1lh` carries the line height, so the
 * fluid giant still fits).
 *
 * ═══ THE GIANT'S ONE SIZE MECHANISM ═════════════════════════════════════════════════════════════
 *
 * The giant numeral carries `text-giant` (line-height 108, weight 900, tracking -1 %, the display
 * face) and its fluid size as an INLINE style, `fontSize: var(--giant-fluid)` = min(124px, 31vw).
 * Never a second `text-…` class: `cn()` would keep only one `text-<size>` and drop `text-giant`
 * with everything bound to it (src/lib/cn.ts). At 402 pt the giant is 124 / 108, as drawn; at 360
 * it is 111.6 on the same 108 line.
 */

/** The two numeral roles of the ramp. `giant` is the ONE hero numeral of a screen; `num` is every other big figure. */
export type NumeralSize = 'giant' | 'num';

/** `ink` = a value that is there · `pending` = planned, a denominator, a zero · `warn` = over target. */
export type NumeralTone = 'ink' | 'pending' | 'warn';

/**
 * How the figure behaves when its value changes while it is on screen.
 *
 *   static  it does not change: exactly as drawn (the default)
 *   tick    it changes continuously (a countdown): fixed-width digit cells, no roll
 *   roll    it changes now and then (a balance, a count): exactly as drawn at rest; the digits
 *           that changed roll in `--duration-slow`
 */
export type NumeralMode = 'static' | 'tick' | 'roll';

export interface NumeralProps {
  /** A string is drawn as given ("83,1", "2:59"); a number is formatted in the app language. */
  value: string | number;
  /** Default `num`. */
  size?: NumeralSize;
  /** Default `ink`. */
  tone?: NumeralTone;
  /** Default `static`. */
  mode?: NumeralMode;
  /** `roll` only: the value the digits roll in from when the figure first appears. */
  from?: string | number;
  /** How a numeric `value` (and `from`) is formatted. Ignored for a string. */
  format?: Intl.NumberFormatOptions;
  /** A unit on the digits' baseline ("kg", "g") in `cap`, `text-2` — 6 after the ink of a giant, 4 after a `num`. */
  unit?: string;
  /** What a screen reader says instead of the figure ("2 edzés a 4-ből"). */
  srText?: string;
  /** Placement only — never a `text-…` class. */
  className?: string;
}

export interface FractionProps {
  /** The part that is done — ink. */
  value: string | number;
  /** The whole — pending, like the slash. */
  of: string | number;
  /** Default `num`. The slash is set at 80 % of the size, so its ink is exactly cap high (99 at the giant, 38 at `num`). */
  size?: NumeralSize;
  /** Applies to `value`; the whole is always static. Default `static`. */
  mode?: NumeralMode;
  /** What a screen reader says instead of "2 / 4". */
  srText?: string;
  /** Placement only — never a `text-…` class. */
  className?: string;
}

/* ── the face ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Big Shoulders Display, weight 900, in em: [advance, left bearing, right bearing, ink top above
 * the baseline, ink bottom below it]. Measured from the shipped woff2 in Chrome 155 by pixel scan
 * at 1000 px (`docs/pipeline/pulse/pkg/F10/proofs/face-metrics.json`).
 */
const GLYPH: Record<string, readonly [number, number, number, number, number]> = {
  '0': [0.507, 0.04, 0.04, 0.81, 0.01],
  '1': [0.274, 0.03, 0.04, 0.8, 0],
  '2': [0.49, 0.04, 0.029, 0.81, 0],
  '3': [0.504, 0.03, 0.04, 0.8, 0.01],
  '4': [0.511, 0.03, 0.01, 0.8, 0],
  '5': [0.515, 0.04, 0.04, 0.8, 0.01],
  '6': [0.4985, 0.04, 0.0325, 0.81, 0.01],
  '7': [0.485, 0.02, 0.03, 0.8, 0],
  '8': [0.5005, 0.038, 0.0375, 0.81, 0.01],
  '9': [0.499, 0.032, 0.04, 0.81, 0.01],
  ',': [0.251, 0.04, 0.04, 0.142, 0.142],
  '.': [0.25, 0.04, 0.04, 0.139, 0],
  ':': [0.25, 0.04, 0.04, 0.439, 0],
  '/': [0.41, 0.03, 0.03, 0.8, 0.2],
  '%': [0.682, 0.03, 0.04, 0.805, 0.006],
  '+': [0.536, 0.04, 0.04, 0.585, 0],
  '−': [0.516, 0.04, 0.04, 0.423, 0],
  '-': [0.446, 0.03, 0.03, 0.42, 0],
  '–': [0.546, 0.03, 0.03, 0.42, 0],
};
/** A glyph the table does not hold (a space, the em dash of a failed read): average bearings, cap high (0.8 em). */
const OTHER = [0.5, 0.035, 0.035, 0.8, 0] as const;

const DIGITS = '0123456789';
const glyph = (ch: string | undefined) => (ch !== undefined && GLYPH[ch]) || OTHER;

/** The widest digit: the cell a ticking digit stands in. */
const CELL = Math.max(...[...DIGITS].map((d) => glyph(d)[0]));
/** In a cell, the narrowest ink margin any digit leaves — the edge a ticking figure is trimmed to. */
const CELL_LEFT = Math.min(...[...DIGITS].map((d) => (CELL - glyph(d)[0]) / 2 + glyph(d)[1]));
const CELL_RIGHT = Math.min(...[...DIGITS].map((d) => (CELL - glyph(d)[0]) / 2 + glyph(d)[2]));

/** Tracking of each role, in em (tokens.css `--text-giant--letter-spacing`, `--text-num` has none). */
const TRACKING: Record<NumeralSize, number> = { giant: -0.01, num: 0 };

const em = (n: number) => `${+n.toFixed(4)}em`;

/** Whether this browser trims a line box to cap height and baseline. Checked once. */
const TRIMS = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('text-box', 'trim-both cap alphabetic');

/**
 * The trim itself: native where supported, else the same box from the face's ascent, descent and
 * cap height (tokens.css, lane F10: `--trim-display-t` / `-b`, computed against the line height).
 */
const TRIM_CLASS = '[text-box:trim-both_cap_alphabetic]';
const TRIM_FALLBACK: CSSProperties = TRIMS ? {} : { marginTop: 'var(--trim-display-t)', marginBottom: 'var(--trim-display-b)' };

/**
 * The box of a figure's ink, as offsets from its trimmed text box: the side bearings come off the
 * sides; above the cap and below the baseline the box grows by what this string's glyphs draw there.
 * `cells`: the digits stand in fixed cells, so the edges are the cells' (the widest digit touches them).
 */
function inkOffsets(text: string, size: NumeralSize, { cells = false, overshoot = true } = {}): CSSProperties {
  const chars = [...text];
  const first = chars[0];
  const last = chars[chars.length - 1];
  const isDigit = (ch: string | undefined) => ch !== undefined && DIGITS.includes(ch);
  const left = cells && isDigit(first) ? CELL_LEFT : glyph(first)[1];
  const right = (cells && isDigit(last) ? CELL_RIGHT : glyph(last)[2]) + TRACKING[size];
  // Glyph tops are measured from the baseline; the trimmed box starts on the cap line.
  const top = overshoot ? Math.max(...chars.map((ch) => glyph(ch)[3])) : 0;
  const bottom = overshoot ? Math.max(0, ...chars.map((ch) => glyph(ch)[4])) : 0;
  return {
    ...TRIM_FALLBACK,
    marginLeft: em(-left),
    marginRight: em(-right),
    paddingTop: overshoot ? `max(0em, ${em(top)} - var(--face-display-cap))` : undefined,
    paddingBottom: bottom ? em(bottom) : undefined,
  };
}

/* ── shared pieces ────────────────────────────────────────────────────────────────────────────── */

/** `text-num` declares no tracking, so it is set to none here — a `num` inside a tracked eyebrow must not inherit it. */
const STEP: Record<NumeralSize, string> = { giant: 'text-giant', num: 'text-num tracking-normal' };
const TONE: Record<NumeralTone, string> = { ink: 'text-text-1', pending: 'text-text-3', warn: 'text-warning' };

/** THE ONE SIZE MECHANISM: `text-giant` on the element, the fluid size inline. Nothing for `num`. */
const sizeStyle = (size: NumeralSize): CSSProperties | undefined => (size === 'giant' ? { fontSize: 'var(--giant-fluid)' } : undefined);

function useFigure(value: string | number, format?: Intl.NumberFormatOptions): string {
  const { i18n } = useTranslation();
  return typeof value === 'number' ? value.toLocaleString(i18n.language, format) : value;
}

/** Up when a numeric value grew since the last one shown, down when it fell; `up` for strings. */
function useDirection(value: string | number): 'up' | 'down' {
  const [last, setLast] = useState({ value, direction: 'up' as 'up' | 'down' });
  if (last.value !== value) {
    const direction = typeof value === 'number' && typeof last.value === 'number' && value < last.value ? 'down' : 'up';
    setLast({ value, direction });
  }
  return last.direction;
}

/** The digits of one figure, trimmed to their ink. */
function Figure({ text, size, mode, from, direction, overshoot, hidden, className }: { text: string; size: NumeralSize; mode: NumeralMode; from?: string; direction: 'up' | 'down'; overshoot: boolean; hidden?: boolean; className?: string }) {
  const cells = mode === 'tick';
  return (
    <span aria-hidden={hidden || undefined} className={cn('inline-block whitespace-nowrap', TRIM_CLASS, className)} style={inkOffsets(text, size, { cells, overshoot })}>
      <DigitRoller text={text} cells={cells} cell={em(CELL)} roll={mode === 'roll'} fromText={mode === 'roll' ? from : undefined} direction={direction} />
    </span>
  );
}

/* ── Numeral ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * A big figure on its ink (kit `numeral`). It hugs its content and stands on the edge it is given:
 * a giant's ink starts exactly on the gutter. With `unit` the unit stands on the digits' baseline.
 */
export function Numeral({ value, size = 'num', tone = 'ink', mode = 'static', from, format, unit, srText, className }: NumeralProps) {
  const figure = useFigure(value, format);
  const start = useFigure(from ?? '', format);
  const direction = useDirection(value);
  return (
    <span
      data-kit="numeral"
      data-size={size}
      data-mode={mode}
      className={cn('inline-flex items-baseline', STEP[size], TONE[tone], size === 'giant' ? 'gap-1.5' : 'gap-1', className)}
      style={sizeStyle(size)}
    >
      {srText ? <span className="sr-only">{srText}</span> : null}
      <Figure text={figure} size={size} mode={mode} from={from === undefined ? undefined : start} direction={direction} overshoot hidden={!!srText} />
      {unit ? (
        <span aria-hidden={srText ? true : undefined} className={cn('font-body text-cap tracking-normal normal-case text-text-2', TRIM_CLASS)}>
          {unit}
        </span>
      ) : null}
    </span>
  );
}

/* ── Fraction ─────────────────────────────────────────────────────────────────────────────────── */

/** The slash at 80 % of the size: its ink (cap + descender, one em) is then exactly one cap high. */
const SLASH: Record<NumeralSize, { fontSize: string; letterSpacing: string }> = {
  giant: { fontSize: 'calc(99em / 124)', letterSpacing: em(TRACKING.giant) },
  num: { fontSize: 'calc(38em / 48)', letterSpacing: 'normal' },
};

/**
 * "2 / 4" on its ink (kit `fraction`): the part in ink, slash and whole pending, 12 apart between
 * inks at the giant and 6 at `num`. The box is one cap high from the whole's cap line, so a
 * fraction under an eyebrow stands exactly where the frame draws it.
 */
export function Fraction({ value, of, size = 'num', mode = 'static', srText, className }: FractionProps) {
  const part = useFigure(value);
  const whole = useFigure(of);
  const direction = useDirection(value);
  // The whole's overshoot is the fraction's (the Figma frame is the whole's ink box).
  const wholeBox = inkOffsets(whole, size);
  return (
    <span
      data-kit="fraction"
      data-size={size}
      className={cn('inline-flex items-start', STEP[size], size === 'giant' ? 'gap-3' : 'gap-1.5', className)}
      style={{ ...sizeStyle(size), paddingTop: wholeBox.paddingTop, paddingBottom: wholeBox.paddingBottom }}
    >
      <span className="sr-only">{srText ?? `${part} / ${whole}`}</span>
      <span aria-hidden className="contents">
        <Figure text={part} size={size} mode={mode} direction={direction} overshoot={false} className="text-text-1" />
        <span className={cn('inline-block leading-none text-text-3', TRIM_CLASS)} style={{ ...SLASH[size], ...inkOffsets('/', size, { overshoot: false }), letterSpacing: SLASH[size].letterSpacing }}>
          /
        </span>
        <Figure text={whole} size={size} mode="static" direction="up" overshoot={false} className="text-text-3" />
      </span>
    </span>
  );
}
