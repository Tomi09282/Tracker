import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

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
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
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
        className="inline-flex size-[120px] items-center justify-center rounded-chip bg-accent-subtle text-accent"
      >
        <Icon size={48} strokeWidth={1.5} />
      </span>
      <Heading className="text-title-3 mt-5 text-text-1">{title}</Heading>
      {body ? <p className="text-body-s measure mt-1 text-text-2">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
