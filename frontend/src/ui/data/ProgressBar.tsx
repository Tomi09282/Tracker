import { useLayoutEffect, useRef } from 'react';
import { cn } from '../../lib/cn';
import { useMotionSafe } from '../feedback/useMotionSafe';

/** `ink` = a measure · `accent` = the screen's ONE live datum · `warn` = over target. */
export type ProgressTone = 'ink' | 'accent' | 'warn';

export interface ProgressBarProps {
  /** How far, on the scale 0 … `max`. A value over `max` fills the bar and turns it `warn`. */
  value: number;
  /** Default 1, so `value` may be a ratio. */
  max?: number;
  /** Default `ink`. Over target is always `warn`, whatever is asked for. */
  tone?: ProgressTone;
  /** The accessible name ("Kalória"). One of `label` / `labelledBy` is required for a screen reader. */
  label?: string;
  /** The id of the element that names the bar. */
  labelledBy?: string;
  /** What a screen reader says for the value ("1840 / 2600 kcal"). */
  valueText?: string;
  /** Placement and width only. The bar fills the width it is given. */
  className?: string;
}

const FILL: Record<ProgressTone, string> = { ink: 'bg-text-1', accent: 'bg-accent', warn: 'bg-warning' };

/**
 * The 4 pt meter (kit `progressBar`, `app-kit.js` `progressBar`): a `track` line with a
 * square-ended fill of `max(1, w × min(value, 1))` — the kit draws a 1 pt sliver even at zero, so
 * an empty meter still says where it starts.
 *
 * Motion (Pulse System 2.4, "bars grow in `base`"): the fill's width is set at once — the layout is
 * final on the first frame — and a change is SHOWN as a scale from the old width to the new one
 * (transform only, from the left edge). Reduced motion: the width just changes.
 */
export function ProgressBar({ value, max = 1, tone = 'ink', label, labelledBy, valueText, className }: ProgressBarProps) {
  const over = value > max;
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const fill = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const motionSafe = useMotionSafe();

  useLayoutEffect(() => {
    const el = fill.current;
    const before = last.current;
    last.current = el ? el.getBoundingClientRect().width : null;
    if (!el || before === null || !motionSafe || typeof el.animate !== 'function') return;
    const after = el.getBoundingClientRect().width;
    if (after <= 0 || Math.abs(after - before) < 0.5) return;
    const style = getComputedStyle(el);
    const duration = parseFloat(style.getPropertyValue('--duration-base')) || 0;
    if (!duration) return;
    const animation = el.animate([{ transform: `scaleX(${before / after})` }, { transform: 'scaleX(1)' }], {
      duration,
      easing: style.getPropertyValue('--ease-standard').trim() || 'ease-out',
    });
    return () => animation.cancel();
  }, [ratio, motionSafe]);

  return (
    <div
      data-kit="progressBar"
      role="progressbar"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(value, 0), max)}
      aria-valuetext={valueText}
      className={cn('h-[var(--bar-h)] w-full overflow-hidden rounded-bar bg-track', className)}
    >
      <div ref={fill} className={cn('h-full origin-left rounded-bar', FILL[over ? 'warn' : tone])} style={{ width: `max(1px, ${+(ratio * 100).toFixed(3)}%)` }} />
    </div>
  );
}
