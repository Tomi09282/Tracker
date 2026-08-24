import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Empty state — Bible blueprint 11.
 *
 * Every list gets one. A blank screen or a bare "No data" line is explicitly called out as a
 * defect: the user is told what is missing, why, and what to do about it, with exactly one
 * action to take.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  heading = 'h2',
  size = 'inline',
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  /**
   * How much of the screen the mark is allowed to own.
   *
   * `inline` is the ordinary case — an empty list inside a screen that has other content. `anchor`
   * is for the screens where the empty state IS the screen and the mark has to carry the top third
   * the way a ring or a chart would: the redesigned Home with no plan today, an empty marketplace.
   * A size variant rather than a fork, because everything else about the two is identical and a
   * second component would drift from this one within a month.
   */
  size?: 'inline' | 'anchor';
  /**
   * Which heading level the title is. `h2` by default — an empty state usually sits inside a
   * screen that already has its own `h1`. Pass `h1` when this component IS the whole page:
   * a page with no `h1` is a page a screen-reader user cannot navigate into, and several routes
   * render nothing but this.
   */
  heading?: 'h1' | 'h2';
}) {
  const Heading = heading;
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span
        aria-hidden
        className={cn(
          'inline-flex items-center justify-center rounded-chip bg-accent-subtle text-accent',
          size === 'anchor' ? 'size-40' : 'size-[120px]',
        )}
      >
        <Icon size={size === 'anchor' ? 72 : 48} strokeWidth={1.5} />
      </span>
      <Heading className="text-title-3 mt-5 text-text-1">{title}</Heading>
      {body ? <p className="text-body-s measure mt-1 text-text-2">{body}</p> : null}
      {/* THE ACTION SPANS THE CARD.
          `control.ts` bases every control on `inline-flex`, so a Pressable dropped in here renders
          at its own text width — a short label like "Kész" ended up a stub floating in the middle
          of a wide card. `[&>*]:w-full` stretches whatever the caller passed without the caller
          having to remember `className="w-full"`, which four screens had each been remembering
          separately and one had not. An empty state offers exactly one action; a control that is
          the only thing to do should look like it. */}
      {action ? <div className="mt-5 w-full [&>*]:w-full">{action}</div> : null}
    </div>
  );
}
