import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * A section heading with a mark — [[55-Screens/01 Home]], blocks 3 and 6.
 *
 * The tiny uppercase eyebrow this replaces was a LABEL: it named the region and then asked the eye
 * to find the region's edges by itself. A tinted icon tile plus a real heading gives the boundary
 * mass, which is what lets the sections below it be separated by air instead of by rules.
 *
 * The tile is NOT an action and carries no accent text: the accent still means "act here" in
 * exactly one place per screen.
 *
 * ═══ THE FOUR COPIES ARE ONE COMPONENT ═════════════════════════════════════════════════════════
 *
 * `CoachDashboard`'s `SectionHead` and `SettingsPage`'s `SectionHeader` are gone and import this;
 * `features/library/SectionBadge` is a two-line shim over it for the one file that still spells it
 * that way. What made them four was never four opinions — it was three files each having to decide
 * a fill, a radius and a heading, and no two of them deciding the same three.
 *
 * FILL: `--tile-tint` / `--tile-tint-fg`, which is not a new pick. tokens.css declares that pair as
 * "the tinted holder every icon sits in across all 27 screens" — the token layer had already named
 * this exact element — and the file promoted into here simply carried home's `bg-accent-subtle`
 * (accent at 20%) up with it. Obeying the token drops the wash to 14% on the four screens that read
 * this component (home, nutrition, coins, coach dashboard) and, through `SummaryTile`'s puck, on
 * three more that only ever showed the tile form (progress, admin, client detail).
 *
 * RADIUS: `rounded-field`. The badge corner measures 18 of 69px in `05-haladas.webp`, 26% of the
 * side; `rounded-field` is 12/44 = 27%, `rounded-card` 16/44 = 36% and visibly rounder than the
 * image. The coaching copy's `rounded-card` was an argument against `rounded-chip` — a 44px circle
 * is the shape this design reserves for things standing in for a PERSON, the monogram and the bell
 * — and `rounded-field` keeps that distinction just as well.
 */

/**
 * `title` OR `children`, never both.
 *
 * Most call sites want the default heading: an `h2` at `text-title-2`, truncating so a trailing
 * action cannot be pushed off the row. Two do not — settings names its blocks with an 11px caps
 * eyebrow and the library's filter strip does the same — and that is the argument
 * `features/library/SectionBadge` wrote down and was right about. A `size` prop or a boolean would
 * move that decision in here as a list of every heading anyone has needed so far; a slot leaves the
 * heading at the call site and keeps in here the part that is genuinely shared — the holder, the
 * gap, and the trailing slot beside it.
 *
 * `children?: never` on the titled branch is what stops both being passed at once, which would
 * render one and silently drop the other.
 */
type SectionHeaderProps = {
  icon: LucideIcon;
  /** A trailing link, at most one. */
  action?: ReactNode;
  className?: string;
} & (
  | {
      title: string;
      /** Set it when a `section` names itself with `aria-labelledby`. */
      titleId?: string;
      children?: never;
    }
  | { children: ReactNode; title?: never; titleId?: never }
);

export function SectionHeader({
  icon: Icon,
  title,
  titleId,
  action,
  children,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center gap-tight', className)}>
      <span
        aria-hidden
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-[var(--tile-tint)] text-[var(--tile-tint-fg)]"
      >
        <Icon className="size-icon-m" strokeWidth={2} />
      </span>
      {children ?? (
        <h2 id={titleId} className="text-title-2 min-w-0 flex-1 truncate text-text-1">
          {title}
        </h2>
      )}
      {action}
    </div>
  );
}
