import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionHeader } from '../../ui/data/SectionHeader';

/**
 * The library's name for `ui/data/SectionHeader` — an IMPORT SHIM, not a second component.
 *
 * The argument this file used to make was the right one and it won: the heading belongs to the
 * CALL SITE, because `IZOMCSOPORT` is an 11px caps accent line and `Végrehajtás` is a real title,
 * and a `size` prop covering both would be one more thing to decide per screen. So the shared
 * component grew the children slot rather than a boolean, and the markup that used to live here —
 * `size-11`, `rounded-field`, `--tile-tint` / `--tile-tint-fg` — is now what every screen renders,
 * including the two that were on `bg-accent-subtle`.
 *
 * It stays only because `features/library/ExerciseDetailPage.tsx` still imports the name and that
 * file is outside this change's set. Retiring it is one import line there and deleting this file;
 * `LibraryPage` has already been re-pointed, so there is exactly one caller left.
 */
export function SectionBadge({
  icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SectionHeader icon={icon} className={className}>
      {children}
    </SectionHeader>
  );
}
