/**
 * Chart geometry — pure, no React, no DOM.
 *
 * Extracted so the one thing a chart can silently get WRONG is testable without mounting anything.
 * Same reasoning as `intervalPlan.ts`: the arithmetic is the part that lies, and arithmetic can be
 * checked exhaustively in milliseconds.
 *
 * Every chart in the product (`TrendChart`, `ProgressChart`, `Sparkline`) takes its positions from
 * `plot()` below; the Pulse restyle changed what is DRAWN at those positions, never where they are.
 */

export interface Plotted {
  date: string;
  value: number;
  x: number;
  y: number;
}

/**
 * The air between the box edge and the outermost point, per side.
 *
 * A number is the same air on all four sides (the original form, still what `check:interval`
 * calls). The per-side form exists because the Pulse frames pad by the DOT that sits on the
 * outermost point, and the dots differ: the hero chart of `progress-1` keeps 2 pt on the left (a
 * 2 pt reading dot), 4 pt on the right (the 4 pt live end dot) and 5.5 pt above and below.
 */
export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PlotBox {
  w: number;
  h: number;
  pad: number | Inset;
}

const DAY_MS = 86400000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const insetOf = (pad: number | Inset): Inset =>
  typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : pad;

/**
 * A pause between two readings this long or longer is a BREAK: it is drawn dotted, and the longest
 * one is named under the axis ("14 nap kihagyás"). Two weeks, because a week off is ordinary.
 */
export const GAP_DAYS = 14;

/**
 * Place points in a viewBox.
 *
 * **THE X AXIS IS TIME, NOT INDEX.** This is the correction that matters. Positioning by index —
 * the obvious implementation, and the one this chart shipped with first — makes a two-month gap
 * render identically to a one-day gap. On a PROGRESS chart that is not a simplification, it is a
 * false statement: a coach reading evenly-spaced points concludes the client trained steadily when
 * they may have stopped for eight weeks and come back. The whole question the chart answers is
 * "how fast", and index-spacing destroys exactly that.
 *
 * The cost is that clustered sessions crowd together and gaps open up. That is the truth, and a
 * chart that shows a gap is telling the coach something worth knowing.
 */
export function plot(points: { date: string; value: number }[], box: PlotBox): Plotted[] {
  if (!points.length) return [];

  const { w, h } = box;
  const pad = insetOf(box.pad);
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero and, worse, draw a line along the top of the box implying a
  // peak. A single horizontal line through the middle is the honest picture of "no change".
  const flat = max === min;
  const span = max - min || 1;
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

  const t0 = utc(points[0].date);
  const t1 = utc(points[points.length - 1].date);
  // One point, or every point on the same day: there is no time axis to speak of, so fall back to
  // index spacing rather than dividing by zero.
  const timeSpan = t1 - t0;

  return points.map((p, i) => ({
    date: p.date,
    value: p.value,
    x:
      timeSpan > 0
        ? pad.left + ((utc(p.date) - t0) / timeSpan) * innerW
        : points.length > 1
          ? pad.left + (i * innerW) / (points.length - 1)
          : w / 2,
    y: flat ? h / 2 : h - pad.bottom - ((p.value - min) / span) * innerH,
  }));
}

/** The SVG path through the points. */
export const linePath = (pts: Plotted[]): string =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/**
 * The same line closed to the baseline, for a gradient fill under it.
 *
 * Pulse draws no area under a line (Pulse System §7, "no area, no grid, no box"), so no chart
 * renders this any more. It stays exported because it is this module's public surface and it is
 * still a correct, pure function.
 */
export const areaPath = (pts: Plotted[], h: number): string =>
  pts.length ? `${linePath(pts)} L${pts[pts.length - 1].x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z` : '';

/**
 * The longest gap in the series, in days.
 *
 * Surfaced so the chart can SAY when a break dominates the window. Once the x axis is honest the
 * gap is visible, but "visible" and "understood" are different things — a caption naming the break
 * is what stops a coach reading a plunge as a loss of strength when it is really two months off.
 */
export function longestGapDays(points: { date: string }[]): number {
  let worst = 0;
  for (let i = 1; i < points.length; i += 1) {
    const gap = (utc(points[i].date) - utc(points[i - 1].date)) / DAY_MS;
    if (gap > worst) worst = gap;
  }
  return Math.round(worst);
}

/**
 * The line cut at its breaks.
 *
 * `solid` holds the runs of readings that follow each other within `gapDays`; `gaps` holds the
 * steps that cross a break, as [the last reading before it, the first reading after it]. A chart
 * draws the runs as its line and the gaps DOTTED in the quiet ink — the treatment the approved
 * Profil sparkline and the progress frames give a pause, so a straight solid segment across two
 * months off can no longer read as steady progress.
 *
 * Every point is in exactly one run (a lone reading between two breaks is a run of one).
 */
export function splitAtGaps(pts: Plotted[], gapDays: number = GAP_DAYS): { solid: Plotted[][]; gaps: [Plotted, Plotted][] } {
  const solid: Plotted[][] = [];
  const gaps: [Plotted, Plotted][] = [];
  let run: Plotted[] = [];
  pts.forEach((p, i) => {
    if (i > 0) {
      const prev = pts[i - 1];
      if ((utc(p.date) - utc(prev.date)) / DAY_MS >= gapDays) {
        solid.push(run);
        gaps.push([prev, p]);
        run = [];
      }
    }
    run.push(p);
  });
  if (run.length) solid.push(run);
  return { solid, gaps };
}

/**
 * THE SCALE: three values and the height each one belongs at, from one mapping.
 *
 * The values are the data's own max / middle / min — not rounded numbers, because the plot already
 * maps min to the bottom and max to the top, and nicer round numbers would sit where the line never
 * goes. A flat series has no range to divide: ONE tick through the middle says "this is the value
 * and it did not move", where three identical labels would look like a broken axis.
 *
 * `y` is computed exactly as `plot()` computes a point's y, so a label, its gridline and the
 * reading that carries the value cannot drift apart.
 */
export function scaleTicks(values: number[], box: PlotBox): { value: number; y: number }[] {
  if (!values.length) return [];
  const pad = insetOf(box.pad);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return [{ value: lo, y: box.h / 2 }];
  const innerH = box.h - pad.top - pad.bottom;
  return [
    { value: hi, y: pad.top },
    { value: (hi + lo) / 2, y: pad.top + innerH / 2 },
    { value: lo, y: pad.top + innerH },
  ];
}
