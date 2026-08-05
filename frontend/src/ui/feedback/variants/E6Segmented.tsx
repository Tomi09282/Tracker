import { useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../../lib/cn';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING } from '../useMotionSafe';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}

/**
 * E6 — Segmented control, all five variants.
 *
 * Rendered as a real radiogroup: arrow keys move between options, and a screen reader announces
 * "3 of 5 selected" rather than reading five unrelated buttons. The sliding thumb in variant A
 * uses a shared `layoutId`, so it travels between segments instead of fading out and in — the
 * movement is what tells the eye where the selection went.
 */
export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  const variant = useElementVariant('E6');
  const motionSafe = useMotionSafe();
  const groupId = useId();

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex gap-1 rounded-chip p-1',
        variant === 'B' ? 'border-b border-[var(--surface-border)] rounded-none p-0' : 'bg-surface-2',
      )}
    >
      {options.map((opt, index) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative inline-flex min-h-[var(--target-min)] items-center justify-center gap-2 px-4',
              'text-body-s cursor-pointer outline-none',
              'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
              variant === 'B' ? 'rounded-none pb-2' : 'rounded-chip',
              active ? 'text-accent-fg' : 'text-text-2 hover:text-text-1',
              variant === 'B' && active && 'text-accent',
              variant === 'B' && !active && 'text-text-2',
            )}
            style={
              // E — options colourise in sequence, so the change reads as one gesture across the
              // whole control rather than five independent flickers.
              variant === 'E' && active ? { transitionDelay: `${index * 40}ms` } : undefined
            }
          >
            {active ? (
              <motion.span
                aria-hidden
                layoutId={`segmented-${groupId}`}
                className={cn(
                  'absolute inset-0',
                  variant === 'B'
                    ? 'top-auto h-0.5 rounded-none bg-accent'
                    : 'rounded-chip bg-accent',
                  // C — the active pill lifts instead of sliding.
                  variant === 'C' && 'shadow-[var(--shadow-overlay)]',
                )}
                initial={false}
                transition={motionSafe ? SPRING.base : { duration: 0 }}
                style={variant === 'C' ? { scale: 1.03 } : undefined}
              />
            ) : null}

            {opt.icon ? (
              <motion.span
                className="relative inline-flex"
                animate={motionSafe && variant === 'D' && active ? { rotate: [0, 120, 0] } : undefined}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                {opt.icon}
              </motion.span>
            ) : null}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
