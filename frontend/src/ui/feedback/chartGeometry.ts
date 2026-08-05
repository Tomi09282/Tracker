/**
 * Chart geometry — pure, no React, no DOM.
 *
 * Extracted so the one thing a chart can silently get WRONG is testable without mounting anything.
 * Same reasoning as `intervalPlan.ts`: the arithmetic is the part that lies, and arithmetic can be
 * checked exhaustively in milliseconds.
 */

export interface Plotted {
  date: string;
  value: number;
  x: number;
  y: number;
}

const DAY_MS = 86400000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);

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
export function plot(
  points: { date: string; value: number }[],
  box: { w: number; h: number; pad: number },
): Plotted[] {
  if (!points.length) return [];

  const { w, h, pad } = box;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero and, worse, draw a line along the top of the box implying a
  // peak. A single horizontal line through the middle is the honest picture of "no change".
  const flat = max === min;
  const span = max - min || 1;

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
        ? pad + ((utc(p.date) - t0) / timeSpan) * (w - pad * 2)
        : points.length > 1
          ? pad + (i * (w - pad * 2)) / (points.length - 1)
          : w / 2,
    y: flat ? h / 2 : h - pad - ((p.value - min) / span) * (h - pad * 2),
  }));
}

/** The SVG path through the points. */
export const linePath = (pts: Plotted[]): string =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** The same line closed to the baseline, for the gradient fill under it. */
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
