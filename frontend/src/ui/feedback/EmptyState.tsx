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
  badge: Badge,
  title,
  body,
  action,
  heading = 'h2',
  size = 'inline',
}: {
  icon: LucideIcon;
  /**
   * A second, small glyph tucked at the mark's lower-trailing corner — a COMPOSED mark.
   *
   * The mark is usually one icon saying what is missing. Sometimes the meaning is in the pairing:
   * `01b-home-empty.webp` draws a calendar with a crescent moon at its corner, and home-empty.md
   * names the moon as the part that carries the message — "nothing is scheduled, and that is fine".
   * A bare calendar is the mark with its message removed.
   *
   * It sits in the corner square the circle does not fill, so it reads as tucked AGAINST the mark
   * rather than placed inside it, and it is filled rather than outlined: at a third of the main
   * icon's size a 1.5px open stroke is a smudge.
   */
  badge?: LucideIcon;
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
          // `relative` is the badge's positioning context, and it is on the mark rather than on the
          // column so the corner the badge anchors to is the CIRCLE's corner at either size.
          'relative inline-flex items-center justify-center rounded-chip bg-accent-subtle text-accent',
          size === 'anchor' ? 'size-40' : 'size-[120px]',
        )}
      >
        <Icon size={size === 'anchor' ? 72 : 48} strokeWidth={1.5} />
        {Badge ? (
          // Offset in from the box corner rather than pinned to it: a circle inscribed in a square
          // pulls away from the corner by r(1−1/√2) ≈ 29% of the radius, so a badge at inset 0
          // floats in dead space with a visible gap. One spacing step in lands it on the curve,
          // which is where the mockup draws the moon.
          // No `aria-hidden` of its own, same as `Icon` above: the mark span already carries it,
          // and the whole mark is decorative — the title is what says this.
          <Badge
            strokeWidth={1.5}
            size={size === 'anchor' ? 24 : 16}
            className={cn('absolute fill-accent', size === 'anchor' ? 'bottom-3 end-3' : 'bottom-2 end-2')}
          />
        ) : null}
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
      {/* AND IT CENTRES WHAT IT STRETCHES.
          `w-full` alone broke the one action that was not a Pressable: the marketplace's
          "back to the feed" is a plain `<Link className="flex …">`, and a flex box widened to the
          card with no `justify-*` puts its content against the leading edge — so a link that used
          to sit centred under a centred column suddenly hugged the left. `Pressable` centres
          itself through the control recipe, which is why nothing else showed it. */}
      {action ? (
        <div className="mt-5 w-full [&>*]:w-full [&>*]:justify-center [&>*]:text-center">
          {action}
        </div>
      ) : null}
    </div>
  );
}
