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
  // The open bottom is what stops a full ring reading as a plain circle outline.
  const sweep = 1 - gap / 360;
  const track = circumference * sweep;

  const arcs = segments
    ? segments.reduce<{ offset: number; drawn: Array<GaugeSegment & { dash: number; at: number }> }>(
        (acc, s) => {
          const clamped = Math.max(0, Math.min(1, s.value));
          acc.drawn.push({ ...s, dash: track * clamped, at: acc.offset });
          acc.offset += track * clamped;
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
        className="size-full -rotate-90"
        /* The rotation puts 0° at twelve o'clock; the gap then opens at the bottom, centred,
           because the dash offset below starts half a gap in. */
        style={{ transform: `rotate(${-90 - gap / 2}deg)` }}
      >
        <title id={titleId}>{label}</title>
        <circle
          cx={R}
          cy={R}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
          strokeLinecap="round"
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
              strokeLinecap="round"
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
