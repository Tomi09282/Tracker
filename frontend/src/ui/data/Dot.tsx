import { cn } from '../../lib/cn';

/*
 * Dot — the one round mark of Pulse (kit gap G-data 1). Pulse System 2.1: a semantic colour appears
 * "only as a 6 pt dot, as text, as a 2 px underline or as an over-target value", never as a
 * surface. The frames draw that dot as a raw `oval(6, 6)` in seven places; this is the component
 * every one of them composes, so there is ONE round mark and not seven local spans.
 *
 *   live       the lamp (lime): unread, live, active, the primary target muscle
 *   secondary  the lamp at its weaker step: the secondary target muscle. 55 % at 8 pt
 *              (exercise-detail-1, admin-2), 50 % at 6 pt (workout-1) — both as drawn
 *   half       ink at 50 %: a draft, a planned day (the `half` light level of `SegmentBar`)
 *   off        the track level (white 10 %): withdrawn, removed (the `off` light level)
 *   ink        text-1: a neutral notice (`NoticeLine` tone `info`)
 *   ring       an outline, no fill: a thing that is not public yet (a draft post, admin-market-v2)
 *   quiet      text-3: a state that is over without being a fault (a withdrawn post)
 *   ok · warn · danger   the semantic tones (saved, pending / handover, failed)
 *
 * Sizes: 6 (every status mark, legend key, unread mark) and 8 (the role key of a muscle list).
 *
 * The dot is decoration by default (`aria-hidden`): the word beside it says what it means. A dot
 * whose colour alone carries a state gets `label` and becomes `role="img"` with that name.
 *
 * It is smaller than 24 pt, so the boxed-surface probe never counts it; `data-kit="dot"` names it
 * anyway, for the geometry probe and the control inventory. A `TextLink` lead slot sizes a bare
 * Lucide glyph to 16 — a `Dot` is a `span`, not an `svg`, and keeps its own size there.
 */

export type DotTone = 'live' | 'secondary' | 'half' | 'off' | 'ink' | 'ring' | 'quiet' | 'ok' | 'warn' | 'danger';
export type DotSize = 6 | 8;

export interface DotProps {
  /** Default `live`. */
  tone?: DotTone;
  /** Default 6. */
  size?: DotSize;
  /** The dot's accessible name, when its colour carries a state the words beside it do not. */
  label?: string;
  /** Placement only. */
  className?: string;
}

const FILL: Record<DotTone, string> = {
  live: 'bg-accent',
  secondary: 'bg-accent',
  half: 'bg-text-1/50',
  off: 'bg-track',
  ink: 'bg-text-1',
  ring: 'border border-edge',
  quiet: 'bg-text-3',
  ok: 'bg-success',
  warn: 'bg-warning',
  danger: 'bg-danger',
};

/** The weaker step of the lamp, as the frames draw it at each size. */
const SECONDARY_OPACITY: Record<DotSize, string> = { 6: 'opacity-50', 8: 'opacity-55' };

export function Dot({ tone = 'live', size = 6, label, className }: DotProps) {
  return (
    <span
      data-kit="dot"
      data-tone={tone}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block shrink-0 rounded-full',
        size === 8 ? 'size-2' : 'size-1.5',
        FILL[tone],
        tone === 'secondary' && SECONDARY_OPACITY[size],
        className,
      )}
    />
  );
}
