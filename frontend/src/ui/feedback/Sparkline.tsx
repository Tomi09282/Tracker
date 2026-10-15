import { cn } from '../../lib/cn';
import { GAP_DAYS, linePath, plot, splitAtGaps, type Plotted } from './chartGeometry';
import type { TrendPoint } from './TrendChart';

/**
 * How a line is inked (Pulse System §7, "sparkline / chart").
 *
 *   'quiet' — a glance inside a row (the Profil weight row): the line in the secondary ink, the end
 *             dot in the primary ink. It is a shape beside a numeral, not the answer.
 *   'live'  — a chart: the line in the primary ink and the end dot in the lime, because the last
 *             reading IS the live datum of the screen.
 */
export type SparklineTone = 'quiet' | 'live';

export interface SparklineProps {
  /** Readings, oldest first. x is TIME (see `chartGeometry.plot`); a pause of 14+ days is drawn dotted. */
  series: TrendPoint[];
  /** Width in pt. With `fluid` it is the design width the 3 pt air is measured against. Default 140. */
  width?: number;
  /** Height in pt. Default 32. */
  height?: number;
  /** Default `'quiet'`. */
  tone?: SparklineTone;
  /** Fill the width of the container instead of a fixed width (the full-width chart of the board). */
  fluid?: boolean;
  /** Placement only. */
  className?: string;
}

/**
 * THE KIT SPARKLINE — `sparkline(vals, w, h, o)` of the Pulse kit, built from its own numbers: a
 * 1.5 px line with round caps and joins, a 3 pt end dot, 3 pt of air on every side, a break drawn
 * `1 5` dotted in the quiet ink. No area, no grid, no box.
 *
 * Decorative: the reading it summarises is always printed beside it (the row's numeral, the chart's
 * table), so it is hidden from assistive technology rather than described twice.
 */
export function Sparkline({ series, width = 140, height = 32, tone = 'quiet', fluid = false, className }: SparklineProps) {
  if (!series.length) return null;
  const pts = plot(series, { w: width, h: height, pad: SPARK_PAD });
  return (
    <TrendLine
      pts={pts}
      width={width}
      height={height}
      fluid={fluid}
      line={tone === 'live' ? 'ink' : 'quiet'}
      end={{ r: 3, tone: tone === 'live' ? 'live' : 'ink' }}
      className={className}
    />
  );
}

/** The kit's air around a sparkline: the end dot's radius, on all four sides. */
export const SPARK_PAD = 3;

export interface TrendLineProps {
  /** Positions from `chartGeometry.plot()` in a `width` x `height` box. */
  pts: Plotted[];
  width: number;
  height: number;
  /** Stretch to the container's width; x positions scale with it, y and every stroke and radius do not. */
  fluid?: boolean;
  /** The ink of the solid runs. */
  line: 'ink' | 'quiet';
  /** The last reading's dot. */
  end: { r: number; tone: 'ink' | 'live' };
  /** A dot on every reading but the last (the hero chart of the progress screen: 2 pt, primary ink). */
  readings?: number;
  /** A pause this many days long or longer is dotted. Default 14. */
  gapDays?: number;
  className?: string;
}

/**
 * The drawing both charts share: runs, dotted breaks, reading dots, the end dot.
 *
 * NOTHING ROUND IS EVER STRETCHED. The previous chart stretched one fixed viewBox with
 * `preserveAspectRatio="none"`: a non-scaling stroke stays honest that way, but every dot becomes an
 * ellipse and a dash pattern stretches with the width. So the drawing is split by what may stretch:
 *
 *   - the solid runs are paths in a nested, stretched viewBox with `non-scaling-stroke` — one path
 *     per run, so its joins are real round joins (separate segments would show a bead at every
 *     joint, where two antialiased caps overlap);
 *   - the dotted breaks and the dots are drawn in the outer drawing with x as a PERCENTAGE of its
 *     width and y in plain pt, so the `1 5` rhythm and every radius are the frame's at any width.
 *
 * A fixed-width sparkline is the same drawing at scale 1. Paint order is the frame's: the dotted
 * breaks, then the line, then the reading dots, then the end dot on top.
 */
export function TrendLine({ pts, width, height, fluid = false, line, end, readings, gapDays = GAP_DAYS, className }: TrendLineProps) {
  if (!pts.length) return null;
  const { solid, gaps } = splitAtGaps(pts, gapDays);
  const px = (p: Plotted) => `${((p.x / width) * 100).toFixed(3)}%`;
  const last = pts[pts.length - 1];
  const stroke = line === 'ink' ? 'stroke-text-1' : 'stroke-text-2';

  return (
    <svg
      data-kit="sparkline"
      width={fluid ? '100%' : width}
      height={height}
      className={cn('block shrink-0 overflow-visible', className)}
      fill="none"
      aria-hidden
      focusable="false"
    >
      {gaps.map(([a, b], i) => (
        <line
          key={i}
          x1={px(a)}
          y1={a.y}
          x2={px(b)}
          y2={b.y}
          className="stroke-text-3"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="1 5"
        />
      ))}
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
        {solid.map((run, i) =>
          run.length > 1 ? (
            <path
              key={i}
              d={linePath(run)}
              className={stroke}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null,
        )}
      </svg>
      {readings
        ? pts.slice(0, -1).map((p, i) => <circle key={i} cx={px(p)} cy={p.y} r={readings} className="fill-text-1" />)
        : null}
      <circle cx={px(last)} cy={last.y} r={end.r} className={end.tone === 'live' ? 'fill-accent' : 'fill-text-1'} />
    </svg>
  );
}
