import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Check } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING } from '../useMotionSafe';

const PARTICLES = [
  { x: -18, y: -14 },
  { x: 0, y: -22 },
  { x: 18, y: -14 },
  { x: -14, y: 12 },
  { x: 0, y: 20 },
  { x: 14, y: 12 },
];

/**
 * E2 — Copy button, all five variants.
 *
 * This is the element the owner named specifically: copy should turn into an animated green
 * check. It is a small thing that tells the user the clipboard actually received the value,
 * which is otherwise completely invisible.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const variant = useElementVariant('E2');
  const motionSafe = useMotionSafe();
  const [copied, setCopied] = useState(false);
  const [count, setCount] = useState(0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be denied. Still show the confirmation only if it succeeded —
      // lying about a copy is worse than no feedback at all.
      return;
    }
    setCopied(true);
    setCount((c) => c + 1);
    setTimeout(() => setCopied(false), 2000);
  };

  const icon = (
    <AnimatePresence mode="wait" initial={false}>
      {copied ? (
        <motion.span
          key="check"
          initial={motionSafe ? { scale: 0.5, rotate: -20, opacity: 0 } : false}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={motionSafe ? { scale: 0.5, opacity: 0 } : undefined}
          transition={SPRING.tight}
          className="inline-flex"
        >
          <Check size={20} strokeWidth={2.5} aria-hidden />
        </motion.span>
      ) : (
        <motion.span
          key="copy"
          initial={motionSafe ? { scale: 0.5, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          exit={motionSafe ? { scale: 0.5, opacity: 0 } : undefined}
          transition={SPRING.tight}
          className="inline-flex"
        >
          <Copy size={20} strokeWidth={2} aria-hidden />
        </motion.span>
      )}
    </AnimatePresence>
  );

  // The live region is what makes this accessible: a screen-reader user gets the same
  // confirmation the sighted user gets from the colour change.
  const announcement = (
    <span aria-live="polite" className="sr-only">
      {copied ? label : ''}
    </span>
  );

  // D — fill-wipe: the background wipes across rather than switching.
  if (variant === 'D') {
    return (
      <Pressable onClick={copy} aria-label={label} className="relative overflow-hidden">
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-success"
          initial={false}
          animate={{ width: copied ? '100%' : '0%' }}
          transition={motionSafe ? { duration: 0.2, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }}
        />
        <span className={cn('relative', copied && 'text-on-success')}>{icon}</span>
        {announcement}
      </Pressable>
    );
  }

  // C — mini-confetti: six particles, only on success, only when motion is allowed.
  if (variant === 'C') {
    return (
      <Pressable onClick={copy} aria-label={label} className={cn('relative', copied && 'text-success')}>
        {copied && motionSafe
          ? PARTICLES.map((p, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 size-1 rounded-chip bg-success"
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: p.x, y: p.y, opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              />
            ))
          : null}
        <span className="relative">{icon}</span>
        {announcement}
      </Pressable>
    );
  }

  // B — check plus a tooltip that springs in.
  if (variant === 'B') {
    return (
      <span className="relative inline-flex">
        <Pressable onClick={copy} aria-label={label} className={cn(copied && 'text-success')}>
          {icon}
        </Pressable>
        <AnimatePresence>
          {copied ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute -top-9 left-1/2 rounded-field bg-surface-3 px-2 py-1 text-caption text-text-1"
              initial={motionSafe ? { scale: 0.8, opacity: 0, x: '-50%' } : { x: '-50%' }}
              animate={{ scale: 1, opacity: 1, x: '-50%' }}
              exit={motionSafe ? { scale: 0.8, opacity: 0, x: '-50%' } : undefined}
              transition={SPRING.tight}
            >
              {label}
            </motion.span>
          ) : null}
        </AnimatePresence>
        {announcement}
      </span>
    );
  }

  // E — a running count for repeated copies.
  if (variant === 'E') {
    return (
      <span className="relative inline-flex">
        <Pressable onClick={copy} aria-label={label} className={cn(copied && 'text-success')}>
          {icon}
        </Pressable>
        <AnimatePresence>
          {count > 0 ? (
            <motion.span
              key={count}
              aria-hidden
              className="pointer-events-none absolute -right-1 -top-1 rounded-chip bg-accent px-1.5 text-micro tabular-nums text-accent-fg"
              initial={motionSafe ? { scale: 0, y: 4 } : false}
              animate={{ scale: 1, y: 0 }}
              transition={SPRING.tight}
            >
              {count}
            </motion.span>
          ) : null}
        </AnimatePresence>
        {announcement}
      </span>
    );
  }

  // A — the default: icon morph plus a colour shift to success.
  return (
    <Pressable
      onClick={copy}
      aria-label={label}
      className={cn(
        'transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        copied && 'border-[var(--success-border)] bg-[var(--success-subtle)] text-success',
      )}
    >
      {icon}
      {announcement}
    </Pressable>
  );
}
