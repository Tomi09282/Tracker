import type { CSSProperties } from 'react';
import { pulseSrcSet } from '../../assets/pulse';
import { initialsOf, personInitials, type Person } from '../../lib/person';
import { cn } from '../../lib/cn';
import { Skeleton } from '../feedback/ScreenSkeleton';

/*
 * Monogram — the person, drawn as type (kit `monogramMark`, Pulse System §5).
 *
 * The product has no profile photographs: wherever a person appears (the Profile hero, a coach's
 * roster row, the client anchor, the chat partner, the public coach page) the two initials ARE the
 * picture. No disc, no tile, no ring behind them — the letters stand on the canvas, in Big Shoulders
 * Display Black, upper-case, tracking -1 %, line height = size.
 *
 * ═══ INK-TIGHT ══════════════════════════════════════════════════════════════════════════════════
 *
 * The kit measures the rendered letters and makes the frame exactly their ink box
 * (`app-kit.js` `monogramMark`: `_ink(t)`, the text moved by -ink.left / -ink.top). Every frame
 * places a monogram by that box: "KP" at 28 is 25 x 22 with its ink on x 24; "TD." on Profile is
 * 152 x 141 + the dot. So the element that draws the letters is trimmed to its ink, the same way
 * `Numeral` trims a figure:
 *
 *   top / bottom  `text-box: trim-both cap alphabetic` cuts the line box to cap height and
 *                 baseline; a padding of the overshoot puts back what THIS string's glyphs draw
 *                 beyond them (the round top of "S" / "G", the accent of "Á", the tail of "Q").
 *   left / right  a negative margin of the first letter's left and the last letter's right side
 *                 bearing (plus the trailing tracking Chrome adds after the last glyph).
 *
 * The bearings and overshoots are the glyph table below: Big Shoulders Display Black as the shipped
 * woff2 renders in Chrome (pixel scan at 1000 px, `docs/pipeline/pulse/pkg/F9/proofs/
 * monogram-metrics.json`). They agree with the Figma ink boxes to 0.1 pt: KP 28 = 25.1 x 22.4,
 * KP 64 = 57.3 x 51.2, TD 176 = 152 x 140.8, KP 176 = 157.6, VM 28 = 33.0, SB 28 = 22.96 high.
 *
 * ═══ THE DOT ════════════════════════════════════════════════════════════════════════════════════
 *
 * A full stop in the lamp colour ("TD." on Profile): diameter round(size / 8), set round(d / 2.75)
 * after the ink, its bottom on the ink box's bottom. It may carry a state (the client anchor: lime =
 * owns the account, warning = handover pending) — then `dotLabel` names it for assistive tech,
 * because a colour alone says nothing to a screen reader. Never a presence light.
 *
 * ═══ THE TEXTURE ════════════════════════════════════════════════════════════════════════════════
 *
 * From 96 up (chat anchor 96, client anchor 124, the heroes 176) the letters are filled with the
 * light stone texture (`texture-monogram`) instead of ink: `background-clip: text` over
 * `color: transparent`. UNDER the image lies `background-color: var(--text-1)`: a texture that is
 * late, blocked or failed leaves ink letters, never invisible initials (assets.md 7.3, row 15).
 * The crop is the kit's: the image scaled so that 84 % of it covers the text node, starting 16 % in
 * from the left and 15 % down, measured from the node's box (`imageTransform` in `monogramMark`).
 */

/** The sizes the frames draw: 28 a row lead, 64 the board's mid size, 96 the chat anchor, 124 the client anchor, 176 a hero. */
export type MonogramSize = 28 | 64 | 96 | 124 | 176;

/** `ink` = text-1 · `pending` = text-3 (a day that is not set, `plan-editor`). Ignored under the texture. */
export type MonogramTone = 'ink' | 'pending';

/** The dot's colour: the lamp, or the warning tone (a state that waits for someone). */
export type MonogramDot = 'accent' | 'warn';

export interface MonogramProps {
  /** The person: the letters come from `personInitials` (display name, else the e-mail local part). */
  person?: Person;
  /** Or the letters themselves ("KP", a day number "3"). Drawn upper-case, as given — no initials are derived. */
  initials?: string;
  /** Default 28. */
  size?: MonogramSize;
  /** The full stop after the letters: `true` = the lamp colour. Default none. */
  dot?: boolean | MonogramDot;
  /** The dot's accessible name, when its colour carries a state ("Saját fiókot használ"). Without it the dot is decoration. */
  dotLabel?: string;
  /** The light texture as the letters' fill (over an ink fallback). Default: on from 96 up, off below. */
  light?: boolean;
  /** Default `ink`. */
  tone?: MonogramTone;
  /**
   * What a screen reader reads for the monogram. Default: nothing — the name is printed beside it,
   * and "T D" before "Takács Dániel" says it twice. Give it where the name is NOT printed
   * (`coach-plans`: a client plan row shows the letters only).
   */
  label?: string;
  /** Placement only — never a size, a colour or a `text-…` class. */
  className?: string;
  /** Kit specimen and captures only: `fallback` draws the textured letters as if the image never arrived. */
  'data-force'?: 'fallback';
}

export interface MonogramSkeletonProps {
  /** Default 28. */
  size?: MonogramSize;
  /** Placement only. */
  className?: string;
}

/* ── the face ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Big Shoulders Display, weight 900, in em: [advance, left bearing, right bearing, ink top above
 * the baseline, ink bottom below it]. Measured from the shipped woff2 (latin + latin-ext subsets) in
 * headless Chrome by pixel scan at 1000 px (`docs/pipeline/pulse/pkg/F9/proofs/monogram-metrics.json`).
 * The digits are the same numbers as `Numeral`'s table (F10): `plan-editor` draws day numbers as
 * monograms.
 */
const GLYPH: Record<string, readonly [number, number, number, number, number]> = {
  A: [0.478, 0.01, 0.01, 0.8, 0],
  B: [0.4725, 0.04, 0.0315, 0.8, 0],
  C: [0.49, 0.035, 0.03, 0.81, 0.01],
  D: [0.495, 0.04, 0.035, 0.8, 0],
  E: [0.408, 0.04, 0.022, 0.8, 0],
  F: [0.406, 0.04, 0.02, 0.8, 0],
  G: [0.493, 0.035, 0.031, 0.81, 0.01],
  H: [0.485, 0.04, 0.04, 0.8, 0],
  I: [0.23, 0.04, 0.04, 0.8, 0],
  J: [0.4525, 0.017, 0.0305, 0.8, 0.01],
  K: [0.4965, 0.04, 0.0085, 0.8, 0],
  L: [0.402, 0.04, 0.015, 0.8, 0],
  M: [0.745, 0.04, 0.04, 0.8, 0],
  N: [0.543, 0.04, 0.04, 0.8, 0],
  O: [0.4965, 0.035, 0.0345, 0.81, 0.01],
  P: [0.4705, 0.04, 0.0215, 0.8, 0],
  Q: [0.4965, 0.035, 0.0345, 0.81, 0.125],
  R: [0.477, 0.04, 0.018, 0.8, 0],
  S: [0.474, 0.025, 0.025, 0.81, 0.01],
  T: [0.419, 0.006, 0.006, 0.8, 0],
  U: [0.487, 0.031, 0.031, 0.8, 0.01],
  V: [0.494, 0.01, 0.01, 0.8, 0],
  W: [0.8, 0.017, 0.017, 0.8, 0],
  X: [0.471, 0.012, 0.012, 0.8, 0],
  Y: [0.465, 0.008, 0.008, 0.8, 0],
  Z: [0.418, 0.017, 0.017, 0.8, 0],
  Á: [0.478, 0.01, 0.01, 0.979, 0],
  Ä: [0.478, 0.01, 0.01, 0.954, 0],
  É: [0.408, 0.04, 0.022, 0.979, 0],
  Í: [0.23, 0.04, -0.037, 0.979, 0],
  Ó: [0.4965, 0.035, 0.0345, 0.979, 0.01],
  Ö: [0.4965, 0.035, 0.0345, 0.954, 0.01],
  Ő: [0.4965, 0.035, 0.0045, 0.98, 0.01],
  Ú: [0.487, 0.031, 0.031, 0.979, 0.01],
  Ü: [0.487, 0.031, 0.031, 0.954, 0.01],
  Ű: [0.487, 0.031, 0, 0.98, 0.01],
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
  // `initialsOf` returns a middle dot for an empty name.
  '·': [0.189, 0.04, 0.04, 0.473, -0.364],
};
/** A letter the table does not hold (another script, a rarer accent): average bearings, cap high. */
const OTHER = [0.48, 0.03, 0.03, 0.8, 0] as const;
const glyph = (ch: string | undefined) => (ch !== undefined && GLYPH[ch]) || OTHER;

/** `monogramMark`'s tracking: -1 %. */
const TRACKING = -0.01;
/** The cap line below the top of a line box as tall as the size (Chrome: half-leading + ascent - cap). */
const CAP_IN_NODE = (1 - (0.984 + 0.213)) / 2 + 0.984 - 0.8;
/** The kit's crop: 84 % of the image covers the text node, from 16 % in and 15 % down. */
const CROP = { scale: 0.84, left: 0.16, top: 0.15 } as const;

const em = (n: number) => `${+n.toFixed(4)}em`;

/** Whether this browser trims a line box to cap height and baseline. Checked once. */
const TRIMS = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('text-box', 'trim-both cap alphabetic');
const TRIM_CLASS = '[text-box:trim-both_cap_alphabetic]';

/** The ink box of a string, as offsets from its (trimmed) text box, plus the overshoot above the cap. */
function inkBox(text: string): { style: CSSProperties; overTop: number; advance: number } {
  const chars = [...text];
  const first = glyph(chars[0]);
  const last = glyph(chars[chars.length - 1]);
  const overTop = Math.max(0, ...chars.map((ch) => glyph(ch)[3] - 0.8));
  const bottom = Math.max(0, ...chars.map((ch) => glyph(ch)[4]));
  const advance = chars.reduce((sum, ch) => sum + glyph(ch)[0] + TRACKING, 0);
  return {
    overTop,
    advance,
    style: {
      // No `text-box`: the same box from the face's ascent, descent and cap height (tokens.css, F10).
      ...(TRIMS ? {} : { marginTop: 'var(--trim-display-t)', marginBottom: 'var(--trim-display-b)' }),
      marginLeft: em(-first[1]),
      marginRight: em(-(last[2] + TRACKING)),
      paddingTop: overTop ? em(overTop) : undefined,
      paddingBottom: bottom ? em(bottom) : undefined,
    },
  };
}

/** The texture as a text fill, cropped as the kit crops it, over the ink fallback. */
function textureFill(text: string, overTop: number, advance: number, src: string | null): CSSProperties {
  const chars = [...text];
  const nodeWidth = advance - TRACKING; // Figma's text node ends on the last advance, without the trailing tracking.
  const lsb = glyph(chars[0])[1];
  const width = nodeWidth / CROP.scale;
  const height = 1 / CROP.scale;
  // From the text node's top-left to the image's: -crop offset x the image size. The node's left is
  // the element's left; its top lies CAP_IN_NODE above the cap line, the element's `overTop` above it.
  const x = -(CROP.left - (CROP.scale * lsb) / nodeWidth) * width;
  const y = -(CROP.top - CROP.scale * CAP_IN_NODE) * height + (TRIMS ? overTop - CAP_IN_NODE : 0);
  return {
    color: 'transparent',
    backgroundColor: 'var(--text-1)',
    backgroundImage: src ? `url("${src}")` : undefined,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${em(width)} ${em(height)}`,
    backgroundPosition: `${em(x)} ${em(y)}`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
  };
}

const TEXTURE = pulseSrcSet('texture-monogram').src;
const TONE: Record<MonogramTone, string> = { ink: 'text-text-1', pending: 'text-text-3' };
const DOT: Record<MonogramDot, string> = { accent: 'bg-accent', warn: 'bg-warning' };

/* ── Monogram ─────────────────────────────────────────────────────────────────────────────────── */

/** Two letters for a person, ink-tight on the canvas (kit `monogramMark`). */
export function Monogram({ person, initials, size = 28, dot, dotLabel, light, tone = 'ink', label, className, 'data-force': force }: MonogramProps) {
  const text = (initials ?? (person ? personInitials(person) : initialsOf(''))).toLocaleUpperCase();
  const box = inkBox(text);
  const textured = light ?? size >= 96;
  const d = dot ? Math.round(size / 8) : 0;
  const dotTone: MonogramDot = dot === 'warn' ? 'warn' : 'accent';
  return (
    <span
      data-kit="monogramMark"
      data-size={size}
      className={cn('inline-flex shrink-0 items-end', className)}
    >
      <span
        aria-hidden
        className={cn('inline-block whitespace-nowrap', TRIM_CLASS, !textured && TONE[tone])}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: `${size}px`,
          lineHeight: `${size}px`,
          letterSpacing: em(TRACKING),
          ...box.style,
          ...(textured ? textureFill(text, box.overTop, box.advance, force === 'fallback' ? null : TEXTURE) : {}),
        }}
      >
        {text}
      </span>
      {d ? (
        <span
          role={dotLabel ? 'img' : undefined}
          aria-label={dotLabel}
          aria-hidden={dotLabel ? undefined : true}
          data-tone={dotTone}
          className={cn('shrink-0 rounded-full', DOT[dotTone])}
          style={{ width: d, height: d, marginLeft: Math.round(d / 2.75) }}
        />
      ) : null}
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/** Two letters' ink at each size (0.9 x 0.8 of it), as static classes the compiler can see. */
const SKELETON: Record<MonogramSize, string> = {
  28: 'h-[22px] w-[25px]',
  64: 'h-[51px] w-[58px]',
  96: 'h-[77px] w-[86px]',
  124: 'h-[99px] w-[112px]',
  176: 'h-[141px] w-[158px]',
};

/**
 * The monogram's place while the person loads: one block the size of two letters' ink, radius 2 —
 * Pulse's skeleton, never a circle and never a spinner. `aria-hidden` (the `Skeleton`); the screen
 * announces the load.
 */
export function MonogramSkeleton({ size = 28, className }: MonogramSkeletonProps) {
  return <Skeleton className={cn('shrink-0', SKELETON[size], className)} />;
}
