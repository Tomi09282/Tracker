import { useId, useState } from 'react';
import { motion } from 'motion/react';
import { Check, X, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING } from '../useMotionSafe';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void | Promise<unknown>;
  label: string;
  disabled?: boolean;
}

/**
 * E4 — Toggle, all five variants.
 *
 * The control is a real `<button role="switch">` with `aria-checked`, not a styled checkbox:
 * screen readers announce it as a switch, and the whole 44px row is the hit area rather than
 * just the visible track.
 */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  const variant = useElementVariant('E4');
  const motionSafe = useMotionSafe();
  const [saving, setSaving] = useState(false);
  const id = useId();

  const toggle = async () => {
    if (disabled || saving) return;
    const result = onChange(!checked);
    // E only: the thumb shows a spinner while the change is being persisted, and the control
    // locks so a double-tap cannot race two writes.
    if (variant === 'E' && result instanceof Promise) {
      setSaving(true);
      try {
        await result;
      } finally {
        setSaving(false);
      }
    }
  };

  const on = checked;
  const glow = variant === 'D' && on;

  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={on}
      aria-label={label}
      disabled={disabled || saving}
      onClick={toggle}
      className={cn(
        'inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] items-center',
        'cursor-pointer outline-none disabled:pointer-events-none disabled:opacity-45',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
      )}
    >
      <span
        className={cn(
          'relative flex h-7 w-12 items-center rounded-chip border px-0.5',
          'transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
          on ? 'border-transparent bg-accent' : 'border-[var(--surface-border)] bg-surface-2',
        )}
        style={glow ? { boxShadow: 'var(--shadow-glow)' } : undefined}
      >
        {/* C — the track carries the state as text, which survives a colour-blind reading. */}
        {variant === 'C' ? (
          <motion.span
            aria-hidden
            className={cn('absolute text-micro uppercase', on ? 'left-2 text-accent-fg' : 'right-2 text-text-3')}
            initial={false}
            animate={{ opacity: 1 }}
          >
            {on ? 'on' : 'off'}
          </motion.span>
        ) : null}

        <motion.span
          aria-hidden
          className="relative z-10 inline-flex size-6 items-center justify-center rounded-chip bg-surface-0"
          initial={false}
          animate={{
            x: on ? 20 : 0,
            // A — squash and stretch: the thumb leans into the direction of travel, which is
            // what makes a 250ms slide read as physical rather than mechanical.
            scaleX: motionSafe && variant === 'A' ? 1.12 : 1,
          }}
          transition={motionSafe ? SPRING.tight : { duration: 0 }}
        >
          {variant === 'E' && saving ? (
            <Loader2 size={14} strokeWidth={2.5} aria-hidden className="animate-spin text-text-2" />
          ) : variant === 'B' ? (
            <motion.span
              key={on ? 'on' : 'off'}
              initial={motionSafe ? { rotate: -90, opacity: 0 } : false}
              animate={{ rotate: 0, opacity: 1 }}
              transition={SPRING.tight}
              className={cn('inline-flex', on ? 'text-accent' : 'text-text-3')}
            >
              {on ? <Check size={14} strokeWidth={3} aria-hidden /> : <X size={14} strokeWidth={3} aria-hidden />}
            </motion.span>
          ) : null}
        </motion.span>
      </span>
    </button>
  );
}
