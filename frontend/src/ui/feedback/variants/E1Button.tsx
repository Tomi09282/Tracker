import { useRef, useState, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable, type PressableProps } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING } from '../useMotionSafe';

export interface FeedbackButtonProps extends Omit<PressableProps, 'onClick' | 'busy'> {
  /**
   * An async action. Variant D turns its lifetime into a progress bar, and every other variant
   * uses it to drive the busy state — so a caller never has to manage "is it running" by hand.
   */
  onAction?: () => Promise<unknown> | void;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

/**
 * E1 — Button, all five feedback variants.
 *
 * The variant is a GLOBAL admin setting, so this component asks the registry rather than taking
 * a prop. Changing it in the Element Style Studio changes every button in the product at once,
 * with no redeploy (owner requirement 24).
 *
 * Every variant degrades the same way under reduced motion: the state change still happens and
 * is still visible, it simply does not travel.
 */
export function FeedbackButton({ onAction, onClick, children, className, ...rest }: FeedbackButtonProps) {
  const variant = useElementVariant('E1');
  const motionSafe = useMotionSafe();

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleId = useRef(0);

  const run = async (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (!onAction) return;

    if (variant === 'B') {
      // The wave starts where the finger actually landed, not at the centre — that is the whole
      // point of a ripple, and a centred one reads as a generic flash.
      const r = e.currentTarget.getBoundingClientRect();
      const id = (rippleId.current += 1);
      setRipples((prev) => [...prev, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
      setTimeout(() => setRipples((prev) => prev.filter((p) => p.id !== id)), 500);
    }

    setBusy(true);
    setProgress(0);
    // Real progress is unknowable for an arbitrary promise, so this creeps toward 90% and lets
    // completion carry it home. It never claims 100% before the work is actually done.
    const tick = setInterval(() => setProgress((p) => Math.min(90, p + 7)), 60);
    try {
      await onAction();
      setProgress(100);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } finally {
      clearInterval(tick);
      setBusy(false);
      setTimeout(() => setProgress(0), 400);
    }
  };

  const shared = { ...rest, className: cn('relative overflow-hidden', className), onClick: run };

  // D — morph-to-progress. The default: the button itself becomes the progress indicator, so
  // the feedback appears exactly where the user's attention already is.
  if (variant === 'D') {
    return (
      <Pressable {...shared} busy={busy}>
        {busy || progress > 0 ? (
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-accent-pressed"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={motionSafe ? { duration: 0.25, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }}
          />
        ) : null}
        {done ? (
          <motion.span
            aria-hidden
            className="absolute inset-0 bg-success"
            initial={motionSafe ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
          />
        ) : null}
        <span className="relative inline-flex items-center gap-2">
          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.span
                key="check"
                initial={motionSafe ? { scale: 0.6, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                exit={motionSafe ? { scale: 0.6, opacity: 0 } : undefined}
                transition={SPRING.tight}
                className="inline-flex text-on-success"
              >
                <Check size={20} strokeWidth={2.5} aria-hidden />
              </motion.span>
            ) : (
              <motion.span key="label">{children}</motion.span>
            )}
          </AnimatePresence>
        </span>
      </Pressable>
    );
  }

  // B — ripple from the press point.
  if (variant === 'B') {
    return (
      <Pressable {...shared} busy={busy}>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            aria-hidden
            className="pointer-events-none absolute rounded-chip bg-accent-subtle"
            style={{ left: r.x, top: r.y, translateX: '-50%', translateY: '-50%' }}
            initial={{ width: 0, height: 0, opacity: 0.6 }}
            animate={motionSafe ? { width: 240, height: 240, opacity: 0 } : { opacity: 0 }}
            transition={{ duration: motionSafe ? 0.5 : 0 }}
          />
        ))}
        <span className="relative">{children}</span>
      </Pressable>
    );
  }

  // C — sheen sweep on hover; the sweep pauses while pressed so the press still reads.
  if (variant === 'C') {
    return (
      <Pressable {...shared} busy={busy} className={cn(shared.className, 'group')}>
        {motionSafe ? (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0 -translate-x-full',
              'bg-[linear-gradient(100deg,transparent,var(--accent-subtle),transparent)]',
              'transition-transform duration-[var(--duration-slow)] ease-[var(--ease-standard)]',
              'group-hover:translate-x-full group-active:translate-x-0',
            )}
          />
        ) : null}
        <span className="relative">{children}</span>
      </Pressable>
    );
  }

  // E — icon-slide: the leading icon moves on hover, the label stays put.
  if (variant === 'E') {
    return (
      <Pressable
        {...shared}
        busy={busy}
        className={cn(shared.className, 'group')}
        icon={
          rest.icon ? (
            <span className="inline-flex transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] group-hover:translate-x-1">
              {rest.icon}
            </span>
          ) : undefined
        }
      >
        {children}
      </Pressable>
    );
  }

  // A — press-spring. The Pressable base already scales on :active; the spring rebound on
  // release is what makes it feel physical rather than merely responsive.
  return (
    <motion.span
      className="inline-flex"
      whileTap={motionSafe ? { scale: 0.97 } : undefined}
      transition={SPRING.tight}
    >
      <Pressable {...shared} busy={busy}>
        {children}
      </Pressable>
    </motion.span>
  );
}
