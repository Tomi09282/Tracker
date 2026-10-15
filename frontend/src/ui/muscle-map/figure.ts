/**
 * The figure's box and its two views — the part of the mannequin a screen lays out around.
 *
 * Every Pulse figure still (the neutral front and back renders and the lit ones) shares ONE canvas,
 * 597 x 1261, with the body in the same place on it: head top at 5.9 % of the height, soles at
 * 94.4 %, hands from 12 % to 87 % of the width (`figma-build/app/library-1.body.js`, the comment
 * above `FW`; the shipped renders measure 5.9 / 94.5 / 12.3-87.7). The frames place the figure by
 * those fractions: the library hangs the head on the stage top (`-0.059 * height`), the player
 * puts the right hand on the content edge (`0.87 * width`).
 *
 * So the box is the contract, not the drawing inside it. A screen that sizes and places the box by
 * these numbers today keeps its layout when the inside changes from the vector map to the render
 * (F15 stage 1) — nothing reflows, because the box never changes shape.
 */
import { MUSCLES_BY_SIDE, type BodySide } from './shapes';

/** The two views of the figure. Same values, same order as the map's own side control. */
export type MuscleSide = BodySide;

/** The canvas every figure still shares, and where the body sits on it (fractions of the box). */
export const FIGURE_BOX = {
  width: 597,
  height: 1261,
  /** Top of the head, as a fraction of the box height. */
  headTop: 0.059,
  /** Soles of the feet, as a fraction of the box height. */
  soles: 0.944,
  /** The left hand's outer edge, as a fraction of the box width. */
  handLeft: 0.12,
  /** The right hand's outer edge, as a fraction of the box width. */
  handRight: 0.87,
} as const;

/**
 * The muscle slugs the figure has a region for on one side, in drawing order.
 *
 * For a screen that draws what the map used to draw for itself: the "also on the other side" note
 * (a highlighted slug that is not in this list is not visible on this side) and a chip row scoped
 * to the visible side. `full-body` has a region on neither side.
 */
export function musclesOnSide(side: MuscleSide): readonly string[] {
  return SLUGS_BY_SIDE[side];
}

const SLUGS_BY_SIDE: Record<MuscleSide, readonly string[]> = {
  front: [...new Set(MUSCLES_BY_SIDE.front.map((m) => m.slug))],
  back: [...new Set(MUSCLES_BY_SIDE.back.map((m) => m.slug))],
};
