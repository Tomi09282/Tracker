import { useId, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Loader2, ArrowDown } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe } from '../useMotionSafe';

/* ══ E17 — Slider ═══════════════════════════════════════════════════════════════════════════ */

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format = (v: number) => String(v),
  ends,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  format?: (v: number) => string;
  /** Variant E puts an icon at each end whose weight implies the direction. */
  ends?: [ReactNode, ReactNode];
}) {
  const variant = useElementVariant('E17');
  const motionSafe = useMotionSafe();
  const [grabbing, setGrabbing] = useState(false);
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;

  const marks = variant === 'B' ? [0, 25, 50, 75, 100] : [];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-body-s text-text-2">
          {label}
        </label>
        {/* A — the value appears while grabbing and gets out of the way afterwards. Showing it
            permanently would compete with the label for a number the user is already dragging. */}
        <span
          className={cn(
            'text-body-s tabular-nums text-text-1 transition-opacity duration-[var(--duration-fast)]',
            variant === 'A' && !grabbing && 'opacity-0',
          )}
        >
          {format(value)}
        </span>
      </div>

      <div className="relative mt-2 flex items-center gap-2">
        {variant === 'E' && ends ? <span className="text-text-3">{ends[0]}</span> : null}

        <div className="relative flex-1">
          {/* The visible track. The real input sits on top at full size and opacity 0, so the
              control keeps native keyboard handling, focus and screen-reader semantics while
              looking like the design system. */}
          <div className="h-2 w-full overflow-hidden rounded-chip bg-surface-2">
            <div
              className="h-full rounded-chip"
              style={{
                width: `${pct}%`,
                background: variant === 'C' ? 'var(--gradient-brand)' : 'var(--accent)',
                transition: motionSafe && !grabbing ? 'width var(--duration-fast) var(--ease-standard)' : 'none',
              }}
            />
          </div>

          {marks.length > 0 ? (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex h-2 justify-between">
              {marks.map((m) => (
                <span key={m} className="h-2 w-0.5 rounded-chip bg-surface-3" />
              ))}
            </div>
          ) : null}

          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-chip',
              'border-2 border-[var(--surface-0)] bg-accent',
              'transition-transform duration-[var(--duration-instant)] ease-[var(--ease-standard)]',
              grabbing && variant === 'A' && 'scale-125',
            )}
            style={{ left: `${pct}%`, boxShadow: 'var(--shadow-glow)' }}
          />

          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            onPointerDown={() => setGrabbing(true)}
            onPointerUp={() => setGrabbing(false)}
            onBlur={() => setGrabbing(false)}
            className="absolute inset-0 h-[var(--target-min)] w-full -translate-y-1/3 cursor-pointer opacity-0"
          />
        </div>

        {variant === 'E' && ends ? <span className="text-text-1">{ends[1]}</span> : null}
      </div>
    </div>
  );
}

/* ══ E18 — Skeleton ═════════════════════════════════════════════════════════════════════════ */

export function SkeletonBlock({ className, index = 0 }: { className?: string; index?: number }) {
  const variant = useElementVariant('E18');
  const motionSafe = useMotionSafe();

  return (
    <div
      aria-hidden
      className={cn(
        'rounded-field bg-[var(--skeleton-base)]',
        // A — a light sweep travels across, which reads as "arriving".
        variant === 'A' &&
          motionSafe &&
          'bg-[linear-gradient(90deg,var(--skeleton-base)_25%,var(--skeleton-sheen)_50%,var(--skeleton-base)_75%)] bg-[length:200%_100%] animate-[skeleton-sweep_var(--duration-ambient)_linear_infinite]',
        // B — a slow breath instead. Quieter on a screen full of placeholders, where a dozen
        // sweeps at once turns into noise.
        variant === 'B' && motionSafe && 'animate-[skeleton-pulse_1.6s_ease-in-out_infinite]',
        className,
      )}
      style={
        // C — rows reveal in sequence rather than all at once, so the eye follows the fill
        // instead of being hit by the whole list.
        variant === 'C' && motionSafe ? { animationDelay: `${index * 60}ms` } : undefined
      }
    />
  );
}

/* ══ E19 — Pull to refresh ══════════════════════════════════════════════════════════════════ */

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
}) {
  const variant = useElementVariant('E19');
  const motionSafe = useMotionSafe();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<number | null>(null);

  const THRESHOLD = 72;
  const armed = pull >= THRESHOLD;

  const status = refreshing
    ? 'refreshing'
    : armed
      ? 'release'
      : pull > 0
        ? 'pull'
        : 'idle';

  const finish = async () => {
    start.current = null;
    if (!armed || refreshing) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  };

  return (
    <div
      onPointerDown={(e) => {
        // Only arm at the very top: starting a pull mid-list would fight the scroll.
        if (window.scrollY <= 0) start.current = e.clientY;
      }}
      onPointerMove={(e) => {
        if (start.current === null || refreshing) return;
        const dy = e.clientY - start.current;
        if (dy <= 0) return;
        // C — rubber band: the further you pull, the less it gives.
        setPull(variant === 'C' ? Math.min(120, dy * 0.5) : Math.min(120, dy * 0.7));
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      style={{
        transform: `translateY(${refreshing ? THRESHOLD / 2 : pull}px)`,
        transition: start.current === null && motionSafe ? 'transform var(--duration-base) var(--ease-standard)' : 'none',
      }}
    >
      <div
        className="pointer-events-none flex h-0 items-center justify-center"
        style={{ marginTop: -THRESHOLD / 2 }}
        aria-live="polite"
      >
        {pull > 0 || refreshing ? (
          <span className="inline-flex items-center gap-2 text-caption text-text-2">
            {refreshing ? (
              <Loader2 size={20} strokeWidth={2} aria-hidden className={motionSafe ? 'animate-spin' : ''} />
            ) : (
              <motion.span
                className="inline-flex"
                // A — the indicator grows in as you pull, so the gesture has a progress readout.
                animate={{ scale: variant === 'A' ? Math.min(1, pull / THRESHOLD) : 1, rotate: armed ? 180 : 0 }}
                transition={{ duration: motionSafe ? 0.15 : 0 }}
              >
                <ArrowDown size={20} strokeWidth={2} aria-hidden />
              </motion.span>
            )}
            {/* D — words rather than symbols, which needs no learning at all. */}
            {variant === 'D' ? <span>{status}</span> : null}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
