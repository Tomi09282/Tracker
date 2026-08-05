import { forwardRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Field, type FieldProps } from '../../primitives/Field';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe } from '../useMotionSafe';

export interface FeedbackFieldProps extends FieldProps {
  /** Marks the field as satisfied — variant C slides a tick in when true. */
  valid?: boolean;
}

/**
 * E7 — Text input, all five variants, layered over the `Field` primitive.
 *
 * The primitive owns the parts that are not negotiable: the visible label, the 44px height, the
 * `role="alert"` error wired through `aria-describedby`. The variants only change how the field
 * *reacts* — which is exactly the split the feedback catalog is for.
 */
export const FeedbackField = forwardRef<HTMLInputElement, FeedbackFieldProps>(function FeedbackField(
  { valid, error, className, trailing, ...rest },
  ref,
) {
  const variant = useElementVariant('E7');
  const motionSafe = useMotionSafe();
  const [shakeKey, setShakeKey] = useState(0);

  // B — re-shake whenever a NEW error arrives. Keying on the message rather than on truthiness
  // means a second, different validation failure shakes again instead of sitting still.
  useEffect(() => {
    if (variant === 'B' && error) setShakeKey((k) => k + 1);
  }, [error, variant]);

  const tick =
    variant === 'C' && valid && !error ? (
      <motion.span
        aria-hidden
        className="inline-flex text-success"
        initial={motionSafe ? { x: 8, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: motionSafe ? 0.2 : 0, ease: [0.16, 1, 0.3, 1] }}
      >
        <Check size={20} strokeWidth={2.5} />
      </motion.span>
    ) : null;

  const field = (
    <Field
      ref={ref}
      error={error}
      trailing={tick ?? trailing}
      className={cn(
        // A — the focus ring gains a soft outer glow, so the active field is findable at a
        // glance on a dense form.
        variant === 'A' && 'focus-within:[&_input]:shadow-[0_0_0_4px_var(--accent-subtle)]',
        // E — an animated accent border while focused. Decorative, and deliberately the only
        // variant that is: it exists for a brand moment, not for every form in the product.
        variant === 'E' && 'focus-within:[&_input]:border-accent',
        className,
      )}
      {...rest}
    />
  );

  if (variant !== 'B') return field;

  return (
    <motion.div
      key={shakeKey}
      animate={motionSafe && error ? { x: [0, -8, 8, -6, 0] } : undefined}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {field}
    </motion.div>
  );
});
