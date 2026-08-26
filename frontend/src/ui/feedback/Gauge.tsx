import { useId } from 'react';
import { cn } from '../../lib/cn';
import { useMotionSafe } from './useMotionSafe';

export interface GaugeSegment {
  /** Share of the whole, 0–1. Segments are drawn in order and should sum to ≤ 1. */
  value: number;
  /** A CSS colour or `var(--token)`. Callers pass semantic tokens, never a literal. */
  color: string;
  label?: string;
}

export interface GaugeProps {
  /**
   * One arc: the filled share, 0–1. Values above 1 are CLAMPED for the arc but the caller's own
   * number is what gets displayed — an over-target day shows `2600 / 2400` beside a full ring,
   * because a ring that wrapped past its own start would read as a fresh 8%.
   */
  value?: number;
  /** Several arcs instead of one. `value` is ignored when this is set. */
  segments?: readonly GaugeSegment[];
  /** Drawn in the middle. A number and its caption, not a sentence. */
  children?: React.ReactNode;
  /** Fraction of the radius the stroke occupies. */
  thickness?: number;
  /** Degrees of the track left open at the bottom. 0 is a closed circle. */
  gap?: number;
  className?: string;
  /** Names the gauge for a screen reader. Required: the visual is the only other cue. */
  label: string;
}

const TAU = Math.PI * 2;
const R = 50;

/**
 * A progress ring, and — with `segments` — a donut.
 *
 * ONE COMPONENT FOR BOTH, because they are the same geometry with a different number of arcs, and
 * the project already learned this lesson once: `ProgressChart` shrank to a mapper when body
 * measurements needed the same picture, rather than growing a second SVG.
 *
 * A ring is the right anchor for a COUNTABLE GOAL WITH A KNOWN DENOMINATOR — sessions this week,
 * calories against a target, a step in a wizard. It is the wrong one for a trend, which is what
 * `TrendChart` is for, and the wrong one for a quantity with no ceiling.
 *
 * THE ARC ALWAYS STARTS AT TWELVE O'CLOCK and sweeps clockwise, so two gauges on one screen can be
 * compared at a glance. An earlier render broke this into two disconnected arcs, which reads as
 * two separate quantities.
 */
export function Gauge({
  value = 0,
  segments,
  children,
  thickness = 0.16,
  gap = 36,
  className,
  label,
}: GaugeProps) {
  const titleId = useId();
  const motionSafe = useMotionSafe();

  const stroke = R * thickness;
  const r = R - stroke / 2;
  const circumference = TAU * r;

  // A RING AND A DONUT WANT THEIR GAP IN DIFFERENT PLACES, and one `gap` number was being spent on
  // both. A ring's gap is the open bottom that stops a full circle reading as a plain outline. A
  // donut's gaps are the seams BETWEEN its segments — the only thing separating two adjacent arcs
  // whose colours are one step apart on the same scale. The coach dashboard asked for a donut, got
  // the ring's 36° hole at six o'clock, and drew all three segments packed together above it.
  const donut = Boolean(segments && segments.length > 1);

  // The seam is carved out of each segment's own end, so every arc still spans its true share of
  // the circle and the proportions stay honest. Round caps add half a stroke at each end and would
  // swallow a seam this size whole, so a donut draws butt caps — which is also why the ring keeps
  // its round ones: they are what make a single arc read as a drawn stroke rather than a slice.
  const SEAM = 0.02;
  const sweep = donut ? 1 : 1 - gap / 360;
  const track = circumference * sweep;
  const seam = donut ? circumference * SEAM : 0;
  const cap = donut ? 'butt' : 'round';

  const arcs = segments
    ? segments.reduce<{ offset: number; drawn: Array<GaugeSegment & { dash: number; at: number }> }>(
        (acc, s) => {
          const clamped = Math.max(0, Math.min(1, s.value));
          const span = track * clamped;
          acc.drawn.push({ ...s, dash: Math.max(0, span - seam), at: acc.offset });
          acc.offset += span;
          return acc;
        },
        { offset: 0, drawn: [] },
      ).drawn
    : [{ value, color: 'var(--accent)', dash: track * Math.max(0, Math.min(1, value)), at: 0 }];

  return (
    <div className={cn('relative inline-grid place-items-center', className)}>
      <svg
        viewBox={`0 0 ${R * 2} ${R * 2}`}
        role="img"
        aria-labelledby={titleId}
        className="size-full"
        /* The rotation puts 0° at twelve o'clock. A ring turns a further half-gap so its open
           bottom lands centred at six o'clock; a donut has no single hole to centre, so it starts
           exactly at twelve and its first segment begins where the eye expects to start reading.
           ────────────────────────────────────────────────────────────────────────────────────
           NO `-rotate-90` CLASS BESIDE THIS, and the reason is a Tailwind v4 change that is easy
           to miss. `-rotate-90` no longer emits `transform: rotate(-90deg)` — it emits the
           STANDALONE `rotate: -90deg` property, which composes WITH `transform` rather than
           replacing it. Measured in the browser: an element carrying both reports
           `rotate: -90deg` AND `transform: matrix(0, -1, 1, 0, 0, 0)`, and renders at -180°.
           The gauge's open bottom was therefore at the TOP, and a donut's first segment started
           at six o'clock. The class was correct before the inline rotation existed; keeping both
           is what broke it. */
        style={{ transform: `rotate(${donut ? -90 : -90 - gap / 2}deg)` }}
      >
        <title id={titleId}>{label}</title>
        <circle
          cx={R}
          cy={R}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
          strokeLinecap={cap}
          strokeDasharray={`${track} ${circumference}`}
        />
        {arcs.map((a, i) =>
          a.dash > 0 ? (
            <circle
              key={i}
              cx={R}
              cy={R}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeLinecap={cap}
              strokeDasharray={`${a.dash} ${circumference}`}
              strokeDashoffset={-a.at}
              className={
                motionSafe
                  ? 'transition-[stroke-dasharray] duration-[var(--duration-slow)] ease-[var(--ease-standard)]'
                  : undefined
              }
            />
          ) : null,
        )}
      </svg>
      {/* The centre is a separate layer rather than SVG text: it holds real typography, real
          tokens and a `tabular-nums` number, none of which survive being drawn as a <text>. */}
      {children ? (
        <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
      ) : null}
    </div>
  );
}
