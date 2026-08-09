import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING } from '../useMotionSafe';

/* ══ E12 — Interactive card ═════════════════════════════════════════════════════════════════ */

export function InteractiveCard({
  children,
  onClick,
  selected,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}) {
  const variant = useElementVariant('E12');
  const motionSafe = useMotionSafe();
  const ref = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // B — a 3D tilt that tracks the pointer. Desktop only: on touch this fires on tap and leaves
  // the card stuck at an angle, so the handlers are gated on a fine pointer.
  const onMove = (e: React.MouseEvent) => {
    if (!motionSafe || variant !== 'B' || !matchMedia('(pointer: fine)').matches) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -6, y: ((e.clientX - r.left) / r.width - 0.5) * 6 });
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      aria-pressed={variant === 'E' ? selected : undefined}
      className={cn(
        'relative block w-full min-h-[var(--target-min)] cursor-pointer overflow-hidden rounded-card',
        'border bg-surface-1 p-4 text-left outline-none',
        'transition-[transform,background-color,border-color,box-shadow]',
        'duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        // A — lift on hover, flatten on press. The press must undo the lift, or the card feels
        // like it floats away from the finger.
        variant === 'A' && 'hover:-translate-y-0.5 hover:shadow-[var(--shadow-overlay)] active:translate-y-0 active:shadow-none',
        variant === 'D' && 'active:scale-[0.98]',
        selected && variant === 'E' ? 'border-accent' : 'border-[var(--surface-border)]',
        className,
      )}
      style={
        variant === 'B'
          ? { transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }
          : undefined
      }
    >
      {/* C — an accent beam runs the border on hover. The Neon pack leans on this. */}
      {variant === 'C' ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-card opacity-0 transition-opacity duration-[var(--duration-base)] hover:opacity-100"
          style={{ boxShadow: 'var(--shadow-glow)', borderColor: 'var(--accent)' }}
        />
      ) : null}

      {/* E — multi-select: a check badge pops into the corner. */}
      {variant === 'E' && selected ? (
        <motion.span
          aria-hidden
          className="absolute right-3 top-3 inline-flex size-6 items-center justify-center rounded-chip bg-accent text-accent-fg"
          initial={motionSafe ? { scale: 0 } : false}
          animate={{ scale: 1 }}
          transition={SPRING.tight}
        >
          <Check size={16} strokeWidth={3} />
        </motion.span>
      ) : null}

      {children}
    </button>
  );
}

/* ══ E15 — Toast ════════════════════════════════════════════════════════════════════════════ */

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastData {
  id: number;
  kind: ToastKind;
  message: string;
  /** Renders an Undo affordance; variant D morphs the toast when it is used. */
  onUndo?: () => void;
}

const TOAST_ICON: Record<ToastKind, typeof Check> = {
  success: Check,
  error: TriangleAlert,
  info: Info,
};

const TOAST_TONE: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-[var(--danger)]',
  info: 'text-info',
};

export function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: number) => void }) {
  const { t } = useTranslation();
  const variant = useElementVariant('E15');
  const motionSafe = useMotionSafe();
  const [undone, setUndone] = useState(false);
  const [paused, setPaused] = useState(false);
  const Icon = TOAST_ICON[toast.kind];

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss, paused]);

  return (
    <motion.div
      layout
      role="status"
      // polite, never assertive: a toast must not interrupt what a screen reader is saying.
      aria-live="polite"
      initial={motionSafe ? { y: 24, opacity: 0, scale: 0.96 } : false}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={motionSafe ? { y: 8, opacity: 0, scale: 0.98 } : undefined}
      transition={motionSafe ? SPRING.base : { duration: 0 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative w-full overflow-hidden rounded-card border border-[var(--surface-border)] bg-[var(--toast-bg)] p-3 shadow-[var(--shadow-overlay)]"
    >
      <div className="flex items-center gap-3">
        <motion.span
          className={cn('inline-flex shrink-0', TOAST_TONE[toast.kind])}
          // C — the icon itself carries the kind: a drawn check, a shaken warning, a popped info.
          animate={
            motionSafe && variant === 'C'
              ? toast.kind === 'error'
                ? { x: [0, -4, 4, -3, 0] }
                : { scale: [0.6, 1.1, 1] }
              : undefined
          }
          transition={{ duration: 0.35 }}
        >
          <Icon size={20} strokeWidth={2.5} aria-hidden />
        </motion.span>

        <span className="text-body-s flex-1 text-text-1">
          {undone ? t('common.undone') : toast.message}
        </span>

        {toast.onUndo && !undone ? (
          <button
            type="button"
            onClick={() => {
              toast.onUndo?.();
              // D — the toast morphs into its own confirmation instead of vanishing and
              // leaving the user unsure the undo landed.
              if (variant === 'D') setUndone(true);
              else onDismiss(toast.id);
            }}
            className="text-body-s min-h-[var(--target-min)] cursor-pointer px-2 text-accent outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            {t('common.undo')}
          </button>
        ) : null}

        <button
          type="button"
          aria-label={t('common.dismiss')}
          onClick={() => onDismiss(toast.id)}
          className="inline-flex size-[var(--target-min)] shrink-0 cursor-pointer items-center justify-center rounded-chip text-text-3 outline-none hover:text-text-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <X size={20} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {/* B — a hairline shows the remaining time, and pauses on hover so a toast cannot vanish
          from under a cursor that is reading it. */}
      {variant === 'B' ? (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent"
          style={{
            animation: motionSafe ? 'toast-timer 4s linear forwards' : 'none',
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      ) : null}
    </motion.div>
  );
}

/* ══ E16 — Progress and ring ════════════════════════════════════════════════════════════════ */

export function Progress({ value, label }: { value: number; label: string }) {
  const variant = useElementVariant('E16');
  const motionSafe = useMotionSafe();
  const pct = Math.max(0, Math.min(100, value));

  // D — the ring with a counted number in the middle. The default, and what the nutrition and
  // rest-timer screens will use.
  if (variant === 'D') {
    const r = 42;
    const c = 2 * Math.PI * r;
    return (
      <div className="relative inline-grid place-items-center">
        <svg viewBox="0 0 100 100" className="size-24 -rotate-90" role="img" aria-label={`${label}: ${pct}%`}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth={8} />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * pct) / 100}
            style={{ transition: motionSafe ? 'stroke-dashoffset var(--duration-slow) var(--ease-standard)' : 'none' }}
          />
        </svg>
        <span className="text-title-2 absolute tabular-nums text-text-1">{pct}%</span>
      </div>
    );
  }

  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-chip bg-surface-2"
      >
        <div
          className={cn(
            'h-full rounded-chip',
            // E — the bar shifts from accent to success as it completes, so "nearly done" and
            // "done" are distinguishable without reading the number.
            variant === 'E' ? '' : 'bg-accent',
            // B — a flowing stripe says "still working" for an indeterminate stretch.
            variant === 'B' && 'bg-[repeating-linear-gradient(45deg,var(--accent),var(--accent)_8px,var(--accent-pressed)_8px,var(--accent-pressed)_16px)]',
          )}
          style={{
            width: `${pct}%`,
            background: variant === 'E' ? `color-mix(in oklab, var(--accent), var(--success) ${pct}%)` : undefined,
            transition: motionSafe ? 'width var(--duration-slow) var(--ease-standard)' : 'none',
            animation: motionSafe && variant === 'B' ? 'stripe-flow 1s linear infinite' : undefined,
            boxShadow: variant === 'A' ? 'var(--shadow-glow)' : undefined,
          }}
        />
      </div>

      {/* C — milestone markers that tick over as they are passed. */}
      {variant === 'C' ? (
        <div className="mt-1 flex justify-between">
          {[25, 50, 75, 100].map((m) => (
            <span key={m} className={cn('text-micro inline-flex tabular-nums', pct >= m ? 'text-accent' : 'text-text-3')}>
              {/* Lucide, not a ✓ character: the Bible bans glyphs standing in for icons, and a
                  dingbat next to Lucide strokes reads as two different icon families. */}
              {pct >= m ? <Check size={14} strokeWidth={3} aria-hidden /> : m}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
