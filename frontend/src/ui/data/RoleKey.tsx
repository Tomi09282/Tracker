import { cn } from '../../lib/cn';
import { Dot } from './Dot';

/*
 * RoleKey — words keyed by a lamp dot: which muscles an exercise trains, and the legend of the
 * mannequin (kit gap G-data 1). The frames draw it in two sizes and two arrangements:
 *
 *   size 8   8 pt dot, 10, `body-m` word in text-1, 22 high             exercise-detail-1/2, admin-2
 *   size 6   6 pt dot,  6, `cap` word in text-2, 18 high                workout-1/2 (the legend)
 *
 *   stack    one key per line, 8 apart (pitch 30 at size 8)             exercise-detail-1
 *   inline   keys side by side, 24 apart at 8 and 16 apart at 6; a     admin-2 (8), workout-1 (6)
 *            line that is full wraps, 8 under the first
 *
 * `primary` is the lamp; `secondary` is the lamp at its weaker step (55 % at 8, 50 % at 6, as the
 * frames draw them). The dot is centred on the word's line.
 *
 * A list (`ul`): the keys are read in order, the primary first (the API's order). The dot's colour
 * is the only thing that tells primary from secondary, so `roleLabels` names the two roles for
 * assistive tech (the existing words "Fő célizom" / "Segédizom"); without it the dots are decoration
 * — right for the legend, whose words ARE the role names.
 */

export type MuscleRole = 'primary' | 'secondary';

export interface RoleKeyItem {
  role: MuscleRole;
  /** The word ("Mell", "Fő célizom"). */
  label: string;
}

export interface RoleKeyProps {
  items: readonly RoleKeyItem[];
  /** Default 8. */
  size?: 6 | 8;
  /** Default `stack` at size 8, `inline` at size 6. */
  layout?: 'stack' | 'inline';
  /** The accessible names of the two roles, read as the dot's name. */
  roleLabels?: Readonly<Record<MuscleRole, string>>;
  /** The list's accessible name. */
  label?: string;
  /** Placement only. */
  className?: string;
}

export function RoleKey({ items, size = 8, layout, roleLabels, label, className }: RoleKeyProps) {
  if (items.length === 0) return null;
  const arrangement = layout ?? (size === 8 ? 'stack' : 'inline');
  return (
    <ul
      data-kit="roleKey"
      data-size={size}
      role="list"
      aria-label={label}
      className={cn(
        'flex',
        arrangement === 'stack' ? 'flex-col gap-2' : cn('flex-wrap gap-y-2', size === 8 ? 'gap-x-6' : 'gap-x-4'),
        className,
      )}
    >
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className={cn('flex min-w-0 items-center', size === 8 ? 'gap-2.5' : 'gap-1.5')}>
          <Dot tone={item.role === 'primary' ? 'live' : 'secondary'} size={size} label={roleLabels?.[item.role]} />
          <span className={cn('min-w-0 break-words', size === 8 ? 'text-body-m text-text-1' : 'text-cap text-text-2')}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
