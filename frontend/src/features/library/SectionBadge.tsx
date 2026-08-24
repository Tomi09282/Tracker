import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * The glyph-in-a-tinted-holder that opens a section on both library screens.
 *
 * Local to this feature ON PURPOSE. The approved design uses the same badge on the nutrition and
 * progress screens too, so it wants to be a shared component — but `src/ui/` is being edited by
 * other work in parallel and a second, half-agreeing copy there is worse than one honest local
 * one. It reads `--tile-tint` / `--tile-tint-fg`, the tokens SummaryTile's icon holder already
 * uses, so promoting this file into `src/ui/data/` later changes an import path and nothing else.
 *
 * The heading itself is the CHILD rather than a string prop: `IZOMCSOPORT` is a micro uppercase
 * accent line and `Végrehajtás` is a real title, and a `size` prop covering both would be one
 * more thing to decide per call site.
 */
export function SectionBadge({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-tight', className)}>
      <span
        aria-hidden
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-[var(--tile-tint)] text-[var(--tile-tint-fg)]"
      >
        <Icon className="size-icon-m" strokeWidth={2} />
      </span>
      {children}
    </div>
  );
}
