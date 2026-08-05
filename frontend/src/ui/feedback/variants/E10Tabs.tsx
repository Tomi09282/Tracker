import { useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../../lib/cn';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING } from '../useMotionSafe';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  badge?: number;
  icon?: React.ReactNode;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}

/**
 * E10 — Tabs, all five variants.
 *
 * A real tablist: arrow keys move between tabs, `aria-selected` reports the active one, and the
 * panel is wired by id. Tabs built from plain buttons look identical and are unusable without a
 * mouse.
 */
export function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
  const variant = useElementVariant('E10');
  const motionSafe = useMotionSafe();
  const groupId = useId();

  const move = (dir: 1 | -1) => {
    const i = items.findIndex((t) => t.value === value);
    const next = items[(i + dir + items.length) % items.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
      }}
      className={cn(
        'flex gap-1',
        variant === 'A' && 'rounded-chip bg-surface-2 p-1',
        variant === 'B' && 'border-b border-[var(--surface-border)]',
      )}
    >
      {items.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative inline-flex min-h-[var(--target-min)] flex-1 items-center justify-center gap-2 px-4',
              'text-body-s cursor-pointer outline-none',
              'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
              variant === 'A' && 'rounded-chip',
              variant === 'B' && 'pb-2',
              active ? (variant === 'A' ? 'text-accent-fg' : 'text-accent') : 'text-text-2 hover:text-text-1',
            )}
            style={variant === 'E' ? { transitionDelay: `${index * 30}ms` } : undefined}
          >
            {active ? (
              <motion.span
                aria-hidden
                layoutId={`tabs-${groupId}`}
                className={cn(
                  'absolute',
                  // A — a pill that travels between tabs. The movement is what tells the eye
                  // where the selection went; a fade would leave it to be re-found.
                  variant === 'A' && 'inset-0 rounded-chip bg-accent',
                  // B — an underline that grows from the centre.
                  variant === 'B' && 'inset-x-2 bottom-0 h-0.5 rounded-chip bg-accent',
                  // C — the active tab lifts instead of sliding.
                  variant === 'C' && 'inset-0 rounded-chip bg-accent-subtle shadow-[var(--shadow-overlay)]',
                )}
                initial={false}
                transition={motionSafe ? SPRING.base : { duration: 0 }}
              />
            ) : null}

            {tab.icon ? (
              <span
                className={cn(
                  'relative inline-flex transition-transform duration-[var(--duration-fast)]',
                  // D — the icon colourises and lifts rather than the background moving.
                  variant === 'D' && active && 'scale-105 text-accent',
                )}
              >
                {tab.icon}
              </span>
            ) : null}
            <span className="relative">{tab.label}</span>

            {typeof tab.badge === 'number' && tab.badge > 0 ? (
              <span
                className={cn(
                  'relative rounded-chip px-1.5 text-micro tabular-nums',
                  // D — the badge is flushed by opening the tab, so the count means "unseen".
                  active && variant === 'D' ? 'bg-surface-2 text-text-3' : 'bg-danger text-on-danger',
                )}
              >
                {active && variant === 'D' ? 0 : tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
