import type { ReactNode } from 'react';
import { cn } from '../../../lib/cn';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  /** After the word, inside the mark's width: the sort direction's arrow. */
  trailing?: ReactNode;
}

/**
 * One quiet filter line of the account list (frame `admin-accounts-v2`): a mono label on the
 * left, the options as mono words in a fixed column, the chosen one in ink with a 2 pt ink mark
 * under it. No box, no chip, no fill - the mark carries the state, so the choice survives
 * without colour. Ink, not lime: the list has no lime shape (the frame draws none).
 *
 * The three lines share one label column (`grid-cols-subgrid` of the list's grid): 76 pt at least, as wide as the
 * longest label when a language needs more ("Sortierung"), so the words of every line start on the same x.
 *
 * Every word is a 44 pt target (its box reaches 8 either side of the word and gives the 16 back in
 * a negative margin, as `Chip` does). The group is a set of toggle buttons (`aria-pressed`), the
 * role `ChipRow` uses for a filter you can switch to another value.
 */
export function FilterLine<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('col-span-2 grid min-h-11 grid-cols-subgrid items-center', className)}>
      <span aria-hidden className="pe-2 text-micro uppercase text-text-3">
        {label}
      </span>
      <div className="-ms-2 flex min-w-0 flex-wrap gap-x-1">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button // token-lint-disable: a filter word of frame admin-accounts-v2 (a mono word with a 2 pt ink mark, no box, no chip); Chip draws a filled pill and Pressable's link look has no mark, so the toggle is a bare button with aria-pressed
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={cn(
                'relative inline-flex min-h-11 cursor-pointer items-center gap-1 px-2 text-micro uppercase',
                'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)] active:opacity-[var(--pressed-opacity)]',
                on ? 'text-text-1' : 'text-text-2',
              )}
            >
              {o.label}
              {on ? o.trailing : null}
              {on ? <span aria-hidden className="absolute inset-x-2 bottom-2.5 h-0.5 bg-text-1" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
