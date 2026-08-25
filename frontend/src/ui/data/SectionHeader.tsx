import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

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
 * ═══ THIS IS NOW THE SHARED ONE ════════════════════════════════════════════════════════════════
 *
 * Lifted from `features/home/SectionHeader.tsx` unchanged — same markup, same classes, so home and
 * nutrition render identically before and after. It moved because nutrition was building its third
 * hand-written copy of the badge, and a fill that three files each decide is a fill nobody owns.
 *
 * Two local copies are still standing and are their owners' to retire: `features/home/
 * SectionHeader.tsx` (identical — delete it and re-point the home imports here) and
 * `features/library/SectionBadge.tsx`, whose docblock makes the same argument for the same reason.
 *
 * The badge reads `bg-accent-subtle` (accent at 20%) because that is what the promoted file read.
 * `--tile-tint` / `--tile-tint-fg` (accent at 14%) is declared in tokens.css for this exact holder
 * and is what SectionBadge uses, so the two disagree by 6 percentage points — one decision for
 * whoever reconciles the badge, not something to settle silently inside a lift-and-shift.
 */
export function SectionHeader({
  icon: Icon,
  title,
  titleId,
  action,
}: {
  icon: LucideIcon;
  title: string;
  /** Set it when a `section` names itself with `aria-labelledby`. */
  titleId?: string;
  /** A trailing link, at most one. */
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-tight">
      <span
        aria-hidden
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-accent-subtle text-accent"
      >
        <Icon className="size-icon-m" strokeWidth={2} />
      </span>
      <h2 id={titleId} className="text-title-2 min-w-0 flex-1 truncate text-text-1">
        {title}
      </h2>
      {action}
    </div>
  );
}
