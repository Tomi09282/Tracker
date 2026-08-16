import { useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../../lib/cn';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

export interface CheckboxProps {
  checked: boolean | 'indeterminate';
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

/**
 * E5 — Checkbox, all five variants.
 *
 * The tick is drawn as an SVG path so variant A can animate its stroke rather than fading a
 * glyph in. A fade says "a check appeared"; a draw says "this got checked", which is the
 * difference between decoration and feedback.
 */
export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  const variant = useElementVariant('E5');
  const motionSafe = useMotionSafe();
  const id = useId();

  const isOn = checked === true;
  const isMixed = checked === 'indeterminate';

  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex min-h-[var(--target-min)] cursor-pointer items-center gap-3',
        disabled && 'pointer-events-none opacity-45',
      )}
    >
      {/*
        The BUTTON is 44×44; the 24px box inside it is only what you see. Sizing the control to
        its own graphic is the mistake that produced nine 32px chips and a 24px search field in
        the previous build — the visual box and the hit area are two different things, and only
        one of them has an accessibility floor.
      */}
      <button
        type="button"
        role="checkbox"
        id={id}
        aria-checked={isMixed ? 'mixed' : isOn}
        disabled={disabled}
        onClick={() => onChange(!isOn)}
        className={cn(
          'relative -m-2.5 inline-flex size-[var(--target-min)] shrink-0 items-center justify-center',
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-[var(--focus-ring)] focus-visible:rounded-field',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'relative inline-flex size-6 items-center justify-center rounded-field border',
            'transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
            isOn || isMixed ? 'border-transparent bg-accent' : 'border-[var(--surface-border)] bg-surface-2',
          )}
        >
        {/* D — a ring pulses outward on confirm, for checks that matter (a completed set). */}
        {variant === 'D' && isOn && motionSafe ? (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-field border-2 border-accent"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE_STANDARD }}
          />
        ) : null}

        <svg viewBox="0 0 24 24" className="size-4 text-accent-fg" aria-hidden fill="none">
          {isMixed ? (
            <motion.line
              x1="6"
              y1="12"
              x2="18"
              y2="12"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              initial={motionSafe && variant === 'E' ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: motionSafe ? 0.2 : 0 }}
            />
          ) : (
            <motion.path
              d="M5 12.5 L10 17.5 L19 7"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={
                motionSafe
                  ? variant === 'B'
                    ? { pathLength: isOn ? 1 : 0, scale: isOn ? [0, 1.2, 1] : 0 }
                    : { pathLength: isOn ? 1 : 0 } // A: the stroke draws itself on
                  : { pathLength: isOn ? 1 : 0 }
              }
              transition={
                motionSafe
                  ? variant === 'B'
                    ? SPRING.tight
                    : { duration: 0.2, ease: EASE_STANDARD }
                  : { duration: 0 }
              }
            />
          )}
        </svg>
        </span>
      </button>

      <span
        className={cn(
          'text-body text-text-1 transition-all duration-[var(--duration-base)]',
          // C — the todo feel: a completed item visibly leaves the active set.
          variant === 'C' && isOn && 'text-text-3 line-through',
        )}
      >
        {label}
      </span>
    </label>
  );
}
