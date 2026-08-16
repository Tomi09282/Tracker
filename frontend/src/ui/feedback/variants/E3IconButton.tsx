import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/cn';
import { Pressable, type PressableProps } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

export interface IconButtonProps extends Omit<PressableProps, 'shape' | 'children' | 'icon'> {
  /** Required — an icon-only control with no accessible name is unusable. */
  'aria-label': string;
  icon: ReactNode;
  /** Variant C swaps to this when `toggled` is true (play → pause, mute → unmute). */
  altIcon?: ReactNode;
  toggled?: boolean;
}

/**
 * E3 — Icon button, all five variants.
 *
 * `aria-label` is a required prop rather than an optional one: an icon-only button without a
 * name is the single most common accessibility failure in a mobile UI, and making it a type
 * error is cheaper than catching it in review.
 */
export function IconButton({
  icon,
  altIcon,
  toggled = false,
  className,
  onClick,
  ...rest
}: IconButtonProps) {
  const variant = useElementVariant('E3');
  const motionSafe = useMotionSafe();
  const [pulses, setPulses] = useState<number[]>([]);
  const pulseId = useRef(0);

  const handle = (e: MouseEvent<HTMLButtonElement>) => {
    if (variant === 'B' || variant === 'D') {
      const id = (pulseId.current += 1);
      setPulses((p) => [...p, id]);
      setTimeout(() => setPulses((p) => p.filter((x) => x !== id)), 600);
    }
    onClick?.(e);
  };

  const body =
    variant === 'C' ? (
      // C — the icon itself changes with state, so the button reports what it will do next.
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={toggled ? 'alt' : 'main'}
          initial={motionSafe ? { scale: 0.6, opacity: 0, rotate: -30 } : false}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={motionSafe ? { scale: 0.6, opacity: 0, rotate: 30 } : undefined}
          transition={SPRING.tight}
          className="inline-flex"
        >
          {toggled ? (altIcon ?? icon) : icon}
        </motion.span>
      </AnimatePresence>
    ) : (
      <motion.span
        className="inline-flex"
        whileHover={motionSafe && variant === 'A' ? { scale: 1.1 } : undefined}
        whileTap={motionSafe && variant === 'A' ? { scale: 0.85 } : undefined}
        transition={SPRING.tight}
      >
        {icon}
      </motion.span>
    );

  return (
    <Pressable
      {...rest}
      shape="icon"
      onClick={handle}
      className={cn(
        'relative overflow-visible',
        // E — the whole container steps up to the accent instead of the icon alone, which reads
        // better for a control that toggles something persistent.
        variant === 'E' && toggled && 'bg-accent text-accent-fg',
        variant === 'E' && !toggled && 'hover:bg-accent-subtle',
        className,
      )}
    >
      {pulses.map((id) => (
        <motion.span
          key={id}
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 rounded-chip',
            // B is a contained ink dot; D is an outgoing ring for actions that matter.
            variant === 'B' ? 'bg-accent-subtle' : 'border-2 border-accent',
          )}
          initial={{ scale: variant === 'B' ? 0 : 1, opacity: 0.7 }}
          animate={motionSafe ? { scale: variant === 'B' ? 1 : 1.9, opacity: 0 } : { opacity: 0 }}
          transition={{ duration: motionSafe ? 0.5 : 0, ease: EASE_STANDARD }}
        />
      ))}
      <span className="relative inline-flex">{body}</span>
    </Pressable>
  );
}
