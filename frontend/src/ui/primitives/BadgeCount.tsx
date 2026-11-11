import { cn } from '../../lib/cn';

export interface BadgeCountProps {
  /** How many. Nothing is rendered at 0 or below — the kit's badge is "hidden at 0". */
  count: number;
  /**
   * The server capped the count (the unread count reports `capped` rather than a bigger number):
   * show "99+" whatever figure `count` holds. Any count above 99 shows "99+" as well; a count of 0
   * renders nothing even when capped.
   */
  capped?: boolean;
  /**
   * `corner` (default): on the top-right corner of a 44 pt icon button — the button is
   * `position: relative` and the badge places itself where the kit puts it (x 26, y 0: its left
   * edge 18 in from the button's right edge, so a wider "99+" grows to the right, as drawn).
   * `inline`: in the flow, for a host that places it itself.
   */
  placement?: 'corner' | 'inline';
  /** Placement only. Never a colour, size or type. */
  className?: string;
}

/**
 * The count badge — the kit's `badgeCount` (figma-build/app-kit.js line 208; `_components.json`,
 * "Badge/count"; drawn on the bell of `home-1`, `home-2` and `coach-dashboard-1`).
 *
 * A lime figure on the bell and nowhere else (Pulse System §4 "Badge / tag"; never on a tab):
 * 18 high, at least 18 wide, fully round, the figure in `tab-on` (Geist SemiBold 11 / 14, +1 %)
 * in the canvas colour, 5 from either edge, and a 2 pt ring of the canvas OUTSIDE the lime so the
 * badge reads as riding the glyph it counts. The ring is an outline: it adds no size, exactly like
 * the kit's outside stroke, and the badge is never focusable, so no focus ring competes with it.
 *
 * `aria-hidden`: the count belongs in the accessible name of the control that holds it
 * (`notifications.withUnread`). A screen reader hearing "3" floating beside "Notifications, 3
 * unread" is reading the same fact twice.
 *
 * Reference: docs/pipeline/pulse/kit/selection.md.
 */
export function BadgeCount({ count, capped = false, placement = 'corner', className }: BadgeCountProps) {
  if (!(count > 0)) return null;
  const figure = capped || count > 99 ? '99+' : String(count);

  return (
    <span
      aria-hidden
      data-kit="badgeCount"
      className={cn(
        'pointer-events-none inline-flex h-[var(--badge-h)] min-w-[var(--badge-h)] items-center justify-center',
        'rounded-chip bg-accent px-[var(--badge-pad-x)] text-tab-on whitespace-nowrap text-accent-fg',
        'outline-2 outline-surface-0',
        placement === 'corner' && 'absolute top-0 left-[calc(100%-var(--badge-h))]',
        className,
      )}
    >
      {figure}
    </span>
  );
}
