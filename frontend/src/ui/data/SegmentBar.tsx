import type { CSSProperties } from 'react';
import { cn } from '../../lib/cn';

/** The light levels (Pulse System 2.1): `on` = done (lime) · `half` = planned (ink at 50 %) · `off` = nothing (track). */
export type SegmentState = 'on' | 'half' | 'off';

export interface Segment {
  state: SegmentState;
  /** A mono label under the segment (a weekday letter). Give it to every segment or to none. */
  label?: string;
  /** Today's segment: its label is ink and a 4 pt dot stands under it. */
  today?: boolean;
  /** What a screen reader says for this segment ("Hétfő: kész"). */
  srText?: string;
}

interface SegmentBarBase {
  /** 4 pt segments 4 apart (the stepper's bar) instead of 6 pt segments 8 apart. */
  thin?: boolean;
  /** The accessible name of the bar ("Heti edzések"). */
  label?: string;
  /** Placement and width only. The bar fills the width it is given. */
  className?: string;
}

/** Either the segments one by one, or a count: `value` of `total` lit from the left. */
export type SegmentBarProps = SegmentBarBase &
  ({ segments: readonly Segment[]; value?: never; total?: never } | { value: number; total: number; segments?: never });

/** The stagger of segments that light up one after the other (Pulse System 2.4: "each with 60 ms stagger"). */
const STAGGER_MS = 60;

/**
 * The segment bar (kit `segBar`, `app-kit.js` `segBar`): equal square-ended segments that share
 * the width, one light level each. Week bar: 6 pt segments 8 apart, each column `segment → 8 →
 * label (data, text-3; today text-1) → 4 → 4 pt dot` — 40 tall. Count bar: segments only.
 *
 * Motion: a level is a layer whose opacity changes in `--duration-fast`, so a segment that lights
 * up fades its lime in (transform / opacity only); when several change at once they go left to
 * right, 60 ms apart. Nothing moves on the first paint — a transition needs a change.
 */
export function SegmentBar(props: SegmentBarProps) {
  const { thin = false, label, className } = props;
  const counted = props.segments === undefined;
  const total = counted ? Math.max(0, Math.floor(props.total)) : 0;
  const segments: readonly Segment[] = counted
    ? Array.from({ length: total }, (_, i) => ({ state: i < props.value ? ('on' as const) : ('off' as const) }))
    : props.segments;
  const labelled = segments.some((segment) => segment.label !== undefined);
  const now = counted ? Math.min(Math.max(Math.round(props.value), 0), segments.length) : undefined;
  return (
    <div
      data-kit="segBar"
      role={counted ? 'progressbar' : 'list'}
      aria-label={label}
      aria-valuemin={counted ? 0 : undefined}
      aria-valuemax={counted ? segments.length : undefined}
      aria-valuenow={now}
      aria-valuetext={counted ? `${now} / ${segments.length}` : undefined}
      className={cn('flex w-full', thin ? 'gap-1' : 'gap-2', className)}
    >
      {segments.map((segment, index) => {
        const delay: CSSProperties = { transitionDelay: `${index * STAGGER_MS}ms` };
        return (
          <div key={index} role={counted ? undefined : 'listitem'} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className={cn('relative w-full overflow-hidden rounded-bar bg-track', thin ? 'h-[var(--bar-h)]' : 'h-[var(--seg-h)]')}>
              <span aria-hidden className={cn('absolute inset-0 bg-text-1/50 transition-opacity duration-[var(--duration-fast)]', segment.state === 'half' ? 'opacity-100' : 'opacity-0')} style={delay} />
              <span aria-hidden className={cn('absolute inset-0 bg-accent transition-opacity duration-[var(--duration-fast)]', segment.state === 'on' ? 'opacity-100' : 'opacity-0')} style={delay} />
            </div>
            {labelled ? (
              <div aria-hidden={segment.srText ? true : undefined} className="flex flex-col items-center gap-1">
                <span className={cn('text-data', segment.today ? 'text-text-1' : 'text-text-3')}>{segment.label}</span>
                <span className={cn('size-1 rounded-full bg-text-1', segment.today ? undefined : 'opacity-0')} />
              </div>
            ) : null}
            {segment.srText ? <span className="sr-only">{segment.srText}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
