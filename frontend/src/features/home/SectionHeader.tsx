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
 * ═══ THIS WANTS TO BE SHARED ═══════════════════════════════════════════════════════════════════
 *
 * It lives in `features/home/` only because this pass was not allowed to add a component under
 * `src/ui/`. Two screens already use it (today, nutrition) and the rest of the redesign wants it —
 * promoting it to `src/ui/data/SectionHeader.tsx` is a lift-and-shift, not a rewrite.
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
