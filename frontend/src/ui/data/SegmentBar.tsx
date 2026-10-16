import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Numeral } from './Numeral';

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

/**
 * One slot of the interactive strip (kit gap G-data 13, plan-editor-1/2): a `num` numeral standing
 * on its segment, and the whole slot is ONE button.
 */
export interface SegmentSlot {
  state: SegmentState;
  /** The figure over the segment: a number or a string is a `num` numeral (the day's position); a node is drawn as given (a 24 pt glyph for an empty slot). */
  label: ReactNode;
  /** The numeral's ink. Default: `ink` over a `half` or `on` segment, `pending` (text-3) over `off`. */
  labelTone?: 'ink' | 'pending';
  /** What the slot does when pressed. A slot without it is not a button. */
  onPress?: () => void;
  /** `aria-pressed`: the slot is the open one. Leave it undefined for a slot that is not a toggle (an empty day). */
  pressed?: boolean;
  /** The slot's action is under way: the pressed level, `aria-busy`, refuses the press. */
  busy?: boolean;
  /** 40 %, refuses the press, keeps the focus. */
  disabled?: boolean;
  /** The slot's accessible name ("Felsőtest – húzás · 5. nap"). */
  srText?: string;
  /** Kit specimen and captures only: hold the pressed look or the focus ring. */
  force?: 'pressed' | 'focus';
}

/** Either the segments one by one, or a count: `value` of `total` lit from the left — or interactive slots. */
export type SegmentBarProps = SegmentBarBase &
  (
    | { segments: readonly Segment[]; value?: never; total?: never; slots?: never; perView?: never }
    | { value: number; total: number; segments?: never; slots?: never; perView?: never }
    | {
        /** The interactive strip: one button per slot, the numeral over its segment. */
        slots: readonly SegmentSlot[];
        /** Slots that share the width before the strip scrolls sideways. Default 7 (pitch (354 + 8) / 7 = 51.7). */
        perView?: number;
        segments?: never;
        value?: never;
        total?: never;
      }
  );

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
  if (props.slots !== undefined) return <SegmentSlots slots={props.slots} perView={props.perView} label={props.label} className={props.className} />;
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

/** The slot's states — a row's (pressed 60 %, disabled 40 %, busy at the pressed level), and the focus ring. */
const SLOT_ACTION = [
  'cursor-pointer select-none text-start',
  'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)]',
  'active:opacity-[var(--pressed-opacity)] data-[force=pressed]:opacity-[var(--pressed-opacity)]',
  'aria-busy:pointer-events-none aria-busy:opacity-[var(--pressed-opacity)]',
  'aria-disabled:pointer-events-none aria-disabled:opacity-[var(--disabled-opacity)]',
  'rounded-2 data-[force=focus]:outline-2 data-[force=focus]:outline-offset-2 data-[force=focus]:outline-[var(--focus-ring)]',
].join(' ');

/**
 * THE INTERACTIVE STRIP (plan-editor-1/2, "7 napos ciklus"): seven `num` numerals over ONE 6 pt
 * segment bar. Each slot is 56 high and one pitch wide — the segment (43.7 at 354) plus the 8 pt
 * gap, 4 on each side of it, so the slots tile the strip without a seam and every one is a target
 * far above 44 x 44. The numeral's ink starts on its segment's left edge, its ink top on the slot's
 * top; the segment ends on the slot's bottom (`app-kit.js` `segBar` + `numeral`, the frame's
 * "Cycle strip" 24,252 354 x 56).
 *
 * Levels as everywhere: `half` = a training day (ink 50 %), `off` = a rest day (the track, the
 * numeral in text-3), `on` = the open day — the one lime. More than `perView` slots keep the pitch
 * and scroll sideways; the cut slot at the edge is the cue.
 */
function SegmentSlots({ slots, perView = 7, label, className }: { slots: readonly SegmentSlot[]; perView?: number; label?: string; className?: string }) {
  const n = Math.max(1, Math.floor(perView));
  return (
    <div
      data-kit="segBar"
      data-mode="slots"
      role="group"
      aria-label={label}
      className={cn('-mx-1 w-[calc(100%+0.5rem)] overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      <div className="flex">
        {slots.map((slot, index) => {
          const tone = slot.labelTone ?? (slot.state === 'off' ? 'pending' : 'ink');
          const figure =
            typeof slot.label === 'string' || typeof slot.label === 'number' ? (
              <Numeral value={slot.label} tone={tone} />
            ) : (
              <span className={cn('flex [&>svg]:size-6 [&>svg]:stroke-[1.75]', tone === 'ink' ? 'text-text-1' : 'text-text-3')}>{slot.label}</span>
            );
          const inner = (
            <>
              <span aria-hidden={slot.srText ? true : undefined} className="flex">
                {figure}
              </span>
              <span aria-hidden className="relative mt-auto block h-[var(--seg-h)] w-full overflow-hidden rounded-bar bg-track">
                <span className={cn('absolute inset-0 bg-text-1/50 transition-opacity duration-[var(--duration-fast)]', slot.state === 'half' ? 'opacity-100' : 'opacity-0')} />
                <span className={cn('absolute inset-0 bg-accent transition-opacity duration-[var(--duration-fast)]', slot.state === 'on' ? 'opacity-100' : 'opacity-0')} />
              </span>
            </>
          );
          const box = 'flex h-14 shrink-0 flex-col items-start px-1';
          const width: CSSProperties = { width: `calc(100% / ${n})` };
          if (!slot.onPress) {
            return (
              <div key={index} data-kit="segSlot" className={box} style={width} aria-label={slot.srText} role={slot.srText ? 'img' : undefined}>
                {inner}
              </div>
            );
          }
          const inert = slot.disabled || slot.busy;
          return (
            <button
              key={index}
              type="button"
              data-kit="segSlot"
              data-force={slot.force}
              aria-label={slot.srText}
              aria-pressed={slot.pressed}
              aria-busy={slot.busy || undefined}
              aria-disabled={inert || undefined}
              onClick={inert ? undefined : slot.onPress}
              className={cn(box, SLOT_ACTION)}
              style={width}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface StepperProps {
  /** The steps done or under way, lit from the left (kit `stepper(cur, n)`: the first `cur`). */
  value: number;
  /** All steps. */
  total: number;
  /** The accessible name of the progress ("Kérdőív"). */
  label?: string;
  /** Placement and width only. The stepper fills the width it is given. */
  className?: string;
}

/**
 * THE FLOW STEPPER (kit `stepper`, `app-kit.js` 285; Pulse System 4 "Flow progress"): the thin
 * segment bar — 4 pt segments 4 apart, the first `value` lit — and, 16 after it, the count in mono
 * `data` 13 / 18 `text-2` ("2 / 5"). 18 high, the bar centred on the count's line. On the board:
 * 354 wide, the bar 299, five segments of 56.6.
 *
 * One `progressbar` (the bar's own, with `aria-valuetext` "2 / 5"); the drawn count is its picture.
 */
export function Stepper({ value, total, label, className }: StepperProps) {
  const n = Math.max(0, Math.floor(total));
  const now = Math.min(Math.max(Math.round(value), 0), n);
  return (
    <div data-kit="stepper" className={cn('flex w-full items-center gap-4', className)}>
      <SegmentBar thin value={now} total={n} label={label} className="min-w-0 flex-1" />
      <span aria-hidden className="shrink-0 whitespace-nowrap text-data text-text-2">
        {now} / {n}
      </span>
    </div>
  );
}
