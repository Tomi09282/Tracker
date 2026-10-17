import { isValidElement, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Empty and error state — kit `emptyState(title, body, action)`.
 *
 *     MA NINCS BETERVEZVE EDZÉS          display 32 / 34, upper, text-1
 *                                         8
 *     Ha van aktív terved, a mai napja    body 16 / 22, text-2
 *     itt jelenik meg.
 *                                         20
 *     ( Gyakorlatok böngészése )          the screen's ONE pill — or a text link on the left edge
 *
 * Left-aligned, on the gutter, with no padding of its own: an empty state is content, and content
 * in Pulse starts on the one left edge. There is no icon disc, no illustration and nothing centred
 * (Pulse System 6: "a centred illustration in a dashed box with a grey icon disc" is the first
 * thing listed under Don't). The same component is the error state: a title, one line, "Újra".
 *
 * ═══ THE ACTION: ONLY A PILL IS STRETCHED ═══════════════════════════════════════════════════════
 *
 * The old wrapper stretched and centred whatever it was given, because every action was a button.
 * In Pulse the action is one of two things, and they sit differently:
 *
 *   the primary pill   fills the content width — it is the screen's one lime shape
 *   a text link        keeps its own width, on the left edge, in its 44 pt frame
 *
 * That is the kit's own rule (`fillW: action.name.indexOf('Button') === 0`), read from what the
 * call site already wrote: an action element with `variant="primary"` (a `Pressable`, at any
 * size — the bridged 44 px primary of an unmigrated screen included) or a direct child that
 * carries `data-kit="btnPrimary"` is stretched; everything else keeps its own width.
 *
 * The 20 above the action is also the glow's clearance (Pulse System 2.3: keep >= 20 clear around
 * the pill), so nothing may be drawn closer to it than that.
 *
 * The old `icon`, `badge` and `size` props left with the mark they drew (F19 row 3).
 */
export interface EmptyStateProps {
  /** The display line, in the words of the frame or `hu.json`. */
  title: string;
  /** One line of `body` in `text-2`: why it is empty, or what failed. */
  body?: string;
  /** ONE action: the primary pill if it is the screen's one action, otherwise a text link. */
  action?: ReactNode;
  /**
   * Which heading level the title is. `h2` by default — an empty state usually sits inside a
   * screen that already has its own `h1`. Pass `h1` when this component IS the whole page:
   * a page with no `h1` is a page a screen-reader user cannot navigate into, and several routes
   * render nothing but this.
   */
  heading?: 'h1' | 'h2';
  /**
   * The body's measure. `column` (default): the whole content width. `narrow`: 312 — the kit's
   * body measure where a frame breaks the line earlier than the column would (notifications-2:
   * "itt" opens line 2). Kit gap G-data 13, additive.
   */
  measure?: 'column' | 'narrow';
  /** Placement only. */
  className?: string;
}

/** The kit's `fillW` test: the action is the lime pill. */
const isPill = (node: ReactNode) => isValidElement<{ variant?: unknown }>(node) && node.props.variant === 'primary';

export function EmptyState(props: EmptyStateProps) {
  const { title, body, action, heading: Heading = 'h2', measure = 'column', className } = props;
  return (
    <div data-kit="emptyState" className={cn('flex w-full flex-col items-start gap-5 text-start', className)}>
      <div className="flex w-full flex-col gap-2">
        <Heading className="text-display break-words text-text-1">{title}</Heading>
        {body ? <p className={cn('text-body text-text-2', measure === 'narrow' && 'max-w-78')}>{body}</p> : null}
      </div>
      {action ? (
        <div
          className={cn(
            'flex w-full flex-col items-start [&>[data-kit=btnPrimary]]:w-full',
            isPill(action) && '[&>*]:w-full',
          )}
        >
          {action}
        </div>
      ) : null}
    </div>
  );
}
