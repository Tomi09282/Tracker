/**
 * The skeleton the whole muscle map is measured from.
 *
 * The previous figure was a single blob silhouette with muscle shapes hand-typed on top as
 * independent strings. Nothing tied a shape to the body underneath it, so every edit drifted:
 * the pecs sat above the ribcage, the head read as a martini glass, and the two halves were
 * written out separately and were not actually symmetrical.
 *
 * Two structural fixes, and everything else in this folder follows from them:
 *
 *   1. Every shape is built from the NAMED LANDMARKS below. A muscle cannot sit in the wrong
 *      place, because it does not carry its own coordinates — it references the same shoulder
 *      line, ribcage and hip crease the silhouette uses. Move a landmark and the anatomy moves
 *      with it, still attached.
 *   2. Paired muscles are drawn ONCE, for the left side, and mirrored numerically about the
 *      centre line. Symmetry is enforced by arithmetic rather than by typing the same curve
 *      twice with the signs flipped, which is what broke it before.
 *
 * Proportions are a ~7.5-head athletic build — not a medical illustration, but close enough that
 * a lifter recognises where their own muscles are, which is the only accuracy that matters here.
 */

/** The canvas. Taller than it is wide, so the figure fills it without letterboxing. */
export const VIEW = { w: 260, h: 560 } as const;

/** The axis of symmetry. Every mirrored shape reflects across this. */
export const CX = VIEW.w / 2;

/**
 * The figure is laid out on the eight-head canon, and it is worth saying why in numbers.
 *
 * The first attempt put the chin at y=66 with the sole at 522 — a head 46 tall inside a body 502
 * tall, which is 10.9 heads. That is not a stylisation, it is a stretched stick figure, and it is
 * exactly what it looked like on screen. A head of 62 against a body of 496 gives 8 heads, which
 * is the proportion an anatomy drawing uses and the one a viewer reads as "a person".
 *
 * HEAD is therefore the unit everything else is derived from. Change it and the whole figure
 * rescales while staying in proportion.
 */
const TOP = 20;
export const HEAD = 62;
const head = (n: number) => Math.round(TOP + n * HEAD);

/**
 * Vertical landmarks, top to bottom, each annotated with where it falls in the canon. These are
 * the lines the drawing is laid out on; nothing below is a free-floating number.
 */
export const Y = {
  skull: TOP,
  brow: TOP + 22,
  chin: head(1),
  jaw: head(1) + 6,
  /** Where the clavicles meet the sternum — the top of the visible torso. */
  sternumTop: head(1) + 16,
  /** The shoulder line: top of the deltoid caps. Just over 1⅓ heads. */
  shoulder: head(1.35),
  armpit: head(1.7),
  /** Two heads exactly — the canonical nipple line. */
  nipple: head(2),
  /** Bottom of the pectorals, where the abdominal wall starts. */
  ribcage: head(2.5),
  /** Iliac crest: the narrowest point of the waist, above the navel rather than at it. */
  waist: head(2.85),
  navel: head(3),
  hip: head(3.6),
  /** Four heads — the halfway point of the whole figure. */
  crotch: head(4),
  thighMid: head(4.8),
  kneeTop: head(5.7),
  kneeBottom: head(6),
  calfMid: head(6.5),
  ankle: head(7.7),
  foot: head(8),
  /** Arm joints, which do not line up with the torso landmarks and need their own. */
  elbow: head(3.05),
  wrist: head(4.1),
  fingertip: head(4.6),
} as const;

/**
 * Horizontal half-widths, measured OUT from the centre line. Half-widths rather than absolute x
 * values, so a mirrored shape is `CX - w` to `CX + w` with no second set of numbers to keep in
 * sync.
 *
 * The proportion that carries the most visual weight is shoulder ÷ waist. At 68/33 it is a little
 * over 2:1, which reads as trained without becoming a caricature. The first attempt used 62/35 —
 * 1.8:1 — and rendered as a tube with no waist at all.
 */
export const W = {
  skull: 22,
  jaw: 16,
  neck: 16,
  /** Outer edge of the deltoid — the widest point of the figure. */
  shoulder: 68,
  chest: 52,
  ribcage: 44,
  waist: 33,
  hip: 47,
  thigh: 25,
  knee: 17,
  calf: 20,
  ankle: 9,
  /**
   * The arm's own centre line, measured from the body's centre. It has to clear the torso: the
   * ribcage reaches 44 and the waist 33, so an arm centred at 60 with a half-width of 13 leaves
   * a visible gap down the whole flank. Without that gap the arm and the torso fuse into one
   * silhouette and the figure loses its arms entirely — which is what happened first time.
   */
  armAxisTop: 60,
  armAxisElbow: 67,
  armAxisWrist: 72,
  upperArm: 14,
  forearm: 11,
  hand: 10,

  /**
   * The leg's own centre line, for the same reason the arm has one — and it was needed for the
   * same reason too. Measuring the leg from the knee/ankle half-widths directly put its inner
   * edge at 12 and its outer at 23: an eleven-unit-wide knee on a figure with a 136-unit
   * shoulder span. The legs rendered as wires, and the two of them sat almost on top of each
   * other because both edges were measured from the body's centre rather than from the leg's.
   */
  legAxisHip: 23,
  legAxisKnee: 26,
  legAxisAnkle: 27,
  thighTop: 22,
  thighMidW: 19,
  kneeW: 15,
  calfW: 17,
  ankleW: 8,
} as const;

/** A point, so paths can be written as geometry rather than as string arithmetic. */
export type P = readonly [number, number];

/** Absolute x for a half-width, on the left (negative) or right (positive) side. */
export const x = (halfWidth: number, side: -1 | 1 = -1) => CX + halfWidth * side;

/* ── path building ──────────────────────────────────────────────────────────────────────── */
//
// Only absolute commands are emitted. That is not a style preference: `mirror()` below rewrites
// coordinates, and it can only do that safely if every number in the string is an absolute
// position. One relative `c` and the mirrored shape silently lands somewhere else.

export const M = (p: P) => `M${p[0]} ${p[1]}`;
export const L = (p: P) => `L${p[0]} ${p[1]}`;
/** Cubic Bézier with both control points — the workhorse for a muscle belly. */
export const C = (c1: P, c2: P, to: P) => `C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${to[0]} ${to[1]}`;
/** Quadratic — enough for a simple bulge, and half the numbers to get wrong. */
export const Q = (c: P, to: P) => `Q${c[0]} ${c[1]} ${to[0]} ${to[1]}`;
export const Z = 'Z';

export const path = (...parts: string[]) => parts.join('');

/**
 * Reflect a path across the centre line.
 *
 * Every x coordinate becomes `2·CX − x`; y is untouched. Curve control points reflect with the
 * rest, which reverses the winding direction — harmless for a filled shape, and the reason this
 * works at all without re-ordering the commands.
 *
 * Throws on a relative command rather than producing a subtly wrong shape. A mirror that is
 * quietly off by the length of one segment is exactly the failure this file exists to prevent,
 * and it is invisible until someone looks closely at a rendered body and says it is skewed.
 */
export function mirror(d: string): string {
  if (/[mlcqhvsta]/.test(d)) {
    throw new Error(`mirror(): path uses relative commands and cannot be reflected safely: ${d}`);
  }
  return d.replace(/([MLCQ])([^MLCQZ]*)/g, (_m, cmd: string, nums: string) => {
    const values = nums.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const flipped = values.map((v, i) => (i % 2 === 0 ? 2 * CX - v : v));
    return `${cmd}${flipped.join(' ')}`;
  });
}

/** A shape and its reflection, for anything the body has two of. */
export const pair = (d: string): string[] => [d, mirror(d)];
