import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  Check,
  Flame,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, EASE_STANDARD, SPRING } from '../useMotionSafe';

/**
 * The duration scale, in the seconds Motion wants.
 *
 * Same problem `EASE_STANDARD` solves for the curve: `--duration-base` is a CSS custom property,
 * Motion takes a number, and a var read at module scope resolves before the theme is applied. The
 * sibling variant files answered that by typing `0.15`, `0.2`, `0.35` and `0.4` inline at nine call
 * sites, which is how a scale drifts — the tenth is where somebody writes `0.3`.
 *
 * So the mapping is written ONCE, here, next to the names it mirrors. If tokens.css moves a value,
 * this is the single line that follows it.
 *
 *   instant 100ms · fast 150ms · base 250ms · slow 400ms · ambient 1200ms
 */
const MOTION_S = { instant: 0.1, fast: 0.15, base: 0.25, slow: 0.4, ambient: 1.2 } as const;

/* ══ E17 — Slider ═══════════════════════════════════════════════════════════════════════════ */

/**
 * What the value readout is saying right now.
 *
 * `committed` and `limit` are the two things a slider can tell you that a number cannot: that the
 * value you let go of was taken, and that the one you asked for was refused. Both replace the
 * GLYPH rather than tinting it, so they survive a colour-blind reader and a greyscale screenshot.
 */
type SliderStatus = 'idle' | 'committed' | 'limit';

/**
 * The two stacked inputs variant D needs.
 *
 * The body of a range input is `pointer-events: none` and only its (invisible) native thumb takes
 * the pointer, which is what lets two of them overlap without the top one swallowing every grab.
 * Keyboard, focus and screen-reader semantics stay native on both handles — the thumbs are sized
 * to the 44px floor so the grab area is a real target rather than the browser's 16px default.
 */
const RANGE_HANDLE = [
  'absolute inset-x-0 top-1/2 h-[var(--target-min)] w-full -translate-y-1/2',
  'cursor-pointer appearance-none bg-transparent opacity-0 pointer-events-none',
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none',
  '[&::-webkit-slider-thumb]:h-[var(--target-min)] [&::-webkit-slider-thumb]:w-5',
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:border-0',
  '[&::-moz-range-thumb]:h-[var(--target-min)] [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:bg-transparent',
].join(' ');

/** One handle. Motion owns the transform, so the centring lives in `x`/`y` and not in a class. */
function SliderThumb({
  pct,
  grown,
  bar,
  glide,
  motionSafe,
}: {
  pct: number;
  grown: boolean;
  /** Variant C swaps the puck for a gradient-filled bar — a different handle, not a tinted one. */
  bar: boolean;
  glide: boolean;
  motionSafe: boolean;
}) {
  return (
    <motion.span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-1/2 rounded-chip border-2 border-[var(--surface-0)]',
        bar ? 'h-6 w-3' : 'size-5',
      )}
      style={{
        left: `${pct}%`,
        x: '-50%',
        y: '-50%',
        background: bar ? 'var(--gradient-brand)' : 'var(--accent)',
        boxShadow: 'var(--shadow-glow)',
        transition: glide ? 'left var(--duration-fast) var(--ease-standard)' : 'none',
      }}
      animate={{ scale: grown ? 1.6 : 1 }}
      transition={motionSafe ? SPRING.tight : { duration: 0 }}
    />
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format = (v: number) => String(v),
  ends,
  lowValue,
  onLowChange,
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
  /**
   * Variant D's second handle.
   *
   * Optional on purpose: `value`/`onChange` is the contract every other variant and every existing
   * call site is written against, and an element whose variant switch could change the PROP SHAPE
   * would be unswitchable from the admin studio. With no consumer for the lower bound the slider
   * keeps it itself, so D is a real two-handle range wherever it is turned on, and a consumer that
   * wants the second number can have it.
   */
  lowValue?: number;
  onLowChange?: (next: number) => void;
}) {
  const { t } = useTranslation();
  const variant = useElementVariant('E17');
  const motionSafe = useMotionSafe();
  const [grabbing, setGrabbing] = useState(false);
  const id = useId();
  const labelId = `${id}-label`;
  const trackRef = useRef<HTMLDivElement | null>(null);

  const span = max - min || 1;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  /* ── The state machine every variant shares ─────────────────────────────────────────────────
   *
   * A slider looks like it cannot fail, so nothing here ever said no. It can: at either end the
   * control refuses a request it was given, and silently ignoring it is indistinguishable from
   * being broken. `limit` is that refusal, and it is the same shape as the success answer —
   * a different glyph in the same place — so the two are learned once.
   */
  const [status, setStatus] = useState<SliderStatus>('idle');
  const [refusals, setRefusals] = useState(0);
  const statusRef = useRef<SliderStatus>('idle');
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const flash = (next: SliderStatus, ms: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    statusRef.current = next;
    setStatus(next);
    timer.current = window.setTimeout(() => {
      statusRef.current = 'idle';
      setStatus('idle');
    }, ms);
  };

  const refuse = () => {
    // A drag held past the end fires pointermove every frame. Without this the shake would restart
    // on each one and never actually play — a refusal that reads as a flicker.
    if (statusRef.current === 'limit') return;
    setRefusals((n) => n + 1);
    flash('limit', 700);
  };

  /* ── B — the stops are real ────────────────────────────────────────────────────────────────
   * The ticks used to be five decorative hairlines over a continuous slider: the name promised a
   * snap and the control gave none. The value now LANDS on them, which is the whole difference
   * between a scale and a set of choices.
   */
  const STOP_COUNT = 4;
  const stops = Array.from({ length: STOP_COUNT + 1 }, (_, i) => min + (span * i) / STOP_COUNT);
  const snap = (v: number) =>
    stops.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), stops[0]);
  const commit = (raw: number) => onChange(variant === 'B' ? snap(clamp(raw)) : clamp(raw));

  const dual = variant === 'D';
  const [innerLow, setInnerLow] = useState(min);
  const low = Math.min(lowValue ?? innerLow, value);
  const setLow = (next: number) => {
    const bounded = Math.min(clamp(next), value);
    if (onLowChange) onLowChange(bounded);
    else setInnerLow(bounded);
  };

  const pct = ((clamp(value) - min) / span) * 100;
  const lowPct = ((low - min) / span) * 100;
  const fillLeft = dual ? lowPct : 0;
  const fillWidth = dual ? Math.max(0, pct - lowPct) : pct;
  // B glides even while grabbing — the travel between stops IS the snap. Everything else tracks the
  // finger exactly, because a transition on a dragged handle reads as lag.
  const glide = motionSafe && (variant === 'B' || !grabbing);

  const nudge = (dir: 1 | -1) => {
    const next = clamp(value + dir * step);
    if (next === value) {
      refuse();
      return;
    }
    commit(next);
  };

  const refuseAtEdge = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    if (value >= max && clientX > r.right + 8) refuse();
    else if (value <= min && clientX < r.left - 8) refuse();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const up = e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'End';
    const down =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'Home';
    if ((up && value >= max) || (down && value <= min)) refuse();
  };

  const onPointerMove = (e: PointerEvent<HTMLInputElement>) => {
    if (grabbing) refuseAtEdge(e.clientX);
  };

  const release = () => {
    if (!grabbing) return;
    setGrabbing(false);
    // The value you let go of was taken. Short, and it replaces the number rather than sitting
    // beside it, so there is nothing new on screen to look at.
    flash('committed', 900);
  };

  const readout =
    status === 'limit' ? (
      <motion.span
        // Keyed on the count so a SECOND refusal shakes again instead of sitting still.
        key={`limit-${refusals}`}
        aria-hidden
        className="inline-flex text-warning"
        animate={motionSafe ? { x: [0, -6, 6, -4, 0] } : { x: 0 }}
        transition={{ duration: motionSafe ? MOTION_S.slow : 0, ease: EASE_STANDARD }}
      >
        <TriangleAlert size={20} strokeWidth={2.5} />
      </motion.span>
    ) : status === 'committed' ? (
      <motion.span
        aria-hidden
        className="inline-flex text-success"
        initial={motionSafe ? { scale: 0.6, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={motionSafe ? SPRING.tight : { duration: 0 }}
      >
        <Check size={20} strokeWidth={2.5} />
      </motion.span>
    ) : dual ? (
      <span className="inline-flex items-center gap-1">
        <span>{format(low)}</span>
        <Minus size={12} strokeWidth={3} aria-hidden className="text-text-3" />
        <span>{format(value)}</span>
      </span>
    ) : (
      <span>{format(value)}</span>
    );

  const endIcons: [ReactNode, ReactNode] = ends ?? [
    <Minus size={20} strokeWidth={2.5} aria-hidden />,
    <Plus size={20} strokeWidth={2.5} aria-hidden />,
  ];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2">
        {dual ? (
          <span id={labelId} className="text-body-s text-text-2">
            {label}
          </span>
        ) : (
          <label htmlFor={id} className="text-body-s text-text-2">
            {label}
          </label>
        )}
        {/* A — the value appears while grabbing and gets out of the way afterwards. Showing it
            permanently would compete with the label for a number the user is already dragging.
            The two STATE answers are exempt: hiding the one moment the control has something of
            its own to say would be hiding the entire point of them. */}
        <span
          className={cn(
            'text-body-s inline-flex min-h-5 items-center tabular-nums text-text-1',
            'transition-opacity duration-[var(--duration-fast)]',
            variant === 'A' && status === 'idle' && !grabbing && 'opacity-0',
          )}
        >
          {readout}
        </span>
      </div>

      <div
        className={cn('relative mt-2 flex items-center gap-2', variant === 'A' && 'pt-7')}
        role={dual ? 'group' : undefined}
        aria-labelledby={dual ? labelId : undefined}
      >
        {/* E — the ends are not decoration, they are the coarse control: a 44px target each, and
            the icon on the side you are heading for gains weight while the other loses it. That is
            also the one place a slider can be told "no" with a tap rather than a drag. */}
        {variant === 'E' ? (
          <Pressable
            shape="icon"
            variant="ghost"
            aria-label={t('common.less')}
            onClick={() => nudge(-1)}
            className="shrink-0"
          >
            <motion.span
              aria-hidden
              className={cn('inline-flex', pct < 35 ? 'text-accent' : 'text-text-3')}
              animate={{ scale: 1.1 - 0.3 * (pct / 100) }}
              transition={motionSafe ? SPRING.tight : { duration: 0 }}
            >
              {endIcons[0]}
            </motion.span>
          </Pressable>
        ) : null}

        <div ref={trackRef} className="relative flex-1">
          {/* The visible track. The real input sits on top at full size and opacity 0, so the
              control keeps native keyboard handling, focus and screen-reader semantics while
              looking like the design system. */}
          <div
            className={cn(
              'relative w-full overflow-hidden rounded-chip',
              variant === 'C' ? 'h-3' : 'h-2 bg-surface-2',
            )}
            style={variant === 'C' ? { background: 'var(--gradient-brand)' } : undefined}
          >
            {variant === 'C' ? (
              /* C — the ramp is painted across the WHOLE track and the unspent part is covered
                 over, so a given colour means the same value at every width. A gradient stretched
                 to the fill would show its hot end at 5% and at 95% alike, which is a decoration
                 rather than a reading. */
              <div
                className="absolute inset-y-0 right-0 bg-surface-2"
                style={{
                  left: `${pct}%`,
                  transition: glide ? 'left var(--duration-fast) var(--ease-standard)' : 'none',
                }}
              />
            ) : (
              <div
                className="absolute inset-y-0 rounded-chip"
                style={{
                  left: `${fillLeft}%`,
                  width: `${fillWidth}%`,
                  background: 'var(--accent)',
                  transition: glide
                    ? 'left var(--duration-fast) var(--ease-standard), width var(--duration-fast) var(--ease-standard)'
                    : 'none',
                }}
              />
            )}
          </div>

          {variant === 'B' ? (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-2">
              {stops.map((s) => {
                const landed = Math.abs(value - s) < 1e-6;
                return (
                  <motion.span
                    key={s}
                    className={cn(
                      'absolute top-0 h-2 w-0.5 rounded-chip',
                      // A passed tick is a notch cut OUT of the fill; an unpassed one sits on the
                      // rail. Same mark, two readings, no legend to learn.
                      value >= s ? 'bg-[var(--surface-0)]' : 'bg-surface-3',
                    )}
                    style={{ left: `${((s - min) / span) * 100}%`, x: '-50%' }}
                    animate={{ scaleY: landed ? 1.9 : 1 }}
                    transition={motionSafe ? SPRING.tight : { duration: 0 }}
                  />
                );
              })}
            </div>
          ) : null}

          {/* A — the handle becomes the readout: it grows into a puck and carries the number with
              it, instead of asking the eye to travel to the corner of the row mid-drag. */}
          {variant === 'A' ? (
            <motion.span
              aria-hidden
              className={cn(
                'text-body-s pointer-events-none absolute bottom-full mb-1 rounded-chip',
                'bg-surface-3 px-2 py-0.5 tabular-nums text-text-1',
              )}
              style={{
                left: `${pct}%`,
                x: '-50%',
                transition: glide ? 'left var(--duration-fast) var(--ease-standard)' : 'none',
              }}
              animate={{ opacity: grabbing ? 1 : 0, scale: grabbing ? 1 : 0.8, y: grabbing ? 0 : 6 }}
              transition={motionSafe ? SPRING.tight : { duration: 0 }}
            >
              {format(value)}
            </motion.span>
          ) : null}

          {dual ? (
            <SliderThumb pct={lowPct} grown={false} bar={false} glide={glide} motionSafe={motionSafe} />
          ) : null}
          <SliderThumb
            pct={pct}
            grown={variant === 'A' && grabbing}
            bar={variant === 'C'}
            glide={glide}
            motionSafe={motionSafe}
          />

          {dual ? (
            <>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={low}
                aria-label={t('common.less')}
                aria-valuetext={format(low)}
                onChange={(e) => setLow(Number(e.target.value))}
                onPointerDown={() => setGrabbing(true)}
                onPointerUp={release}
                onBlur={release}
                className={RANGE_HANDLE}
              />
              <input
                id={id}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                aria-label={t('common.more')}
                aria-valuetext={format(value)}
                onChange={(e) => commit(Math.max(Number(e.target.value), low))}
                onKeyDown={onKeyDown}
                onPointerDown={() => setGrabbing(true)}
                onPointerMove={onPointerMove}
                onPointerUp={release}
                onBlur={release}
                className={RANGE_HANDLE}
              />
            </>
          ) : (
            <input
              id={id}
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              aria-valuetext={format(value)}
              onChange={(e) => commit(Number(e.target.value))}
              onKeyDown={onKeyDown}
              onPointerDown={() => setGrabbing(true)}
              onPointerMove={onPointerMove}
              onPointerUp={release}
              onBlur={release}
              className="absolute inset-0 h-[var(--target-min)] w-full -translate-y-1/3 cursor-pointer opacity-0"
            />
          )}
        </div>

        {variant === 'E' ? (
          <Pressable
            shape="icon"
            variant="ghost"
            aria-label={t('common.more')}
            onClick={() => nudge(1)}
            className="shrink-0"
          >
            <motion.span
              aria-hidden
              className={cn('inline-flex', pct > 65 ? 'text-accent' : 'text-text-3')}
              animate={{ scale: 0.8 + 0.35 * (pct / 100) }}
              transition={motionSafe ? SPRING.tight : { duration: 0 }}
            >
              {endIcons[1]}
            </motion.span>
          </Pressable>
        ) : null}
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
        variant === 'B' && motionSafe && 'animate-[skeleton-pulse_var(--duration-ambient)_ease-in-out_infinite]',
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

/**
 * The gesture, end to end.
 *
 * `idle → pull → armed → refreshing → success | error`. The last two are the reason this type
 * exists: the previous implementation ran the spinner, awaited the promise and then simply put
 * everything back, so a refresh that SUCCEEDED and one that THREW were the same three frames of
 * nothing. A refresh that failed silently is worse than one that never ran — the user walks away
 * believing they are looking at fresh data.
 */
type PullStatus = 'idle' | 'pull' | 'armed' | 'refreshing' | 'success' | 'error';

const THRESHOLD = 72;
const MAX_PULL = 120;
/** How long the outcome stays up. Failure holds longer: it is asking to be read, not glanced at. */
const HOLD_OK = 900;
const HOLD_FAIL = 1600;

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const variant = useElementVariant('E19');
  const motionSafe = useMotionSafe();
  const [pull, setPull] = useState(0);
  const [status, setStatus] = useState<PullStatus>('idle');
  const start = useRef<number | null>(null);
  const captured = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const busy = status === 'refreshing';
  const settled = status === 'success' || status === 'error';
  const armed = status === 'armed';
  const progress = Math.min(1, pull / THRESHOLD);

  // C — a real rubber band. `dy * 0.5` was a flat 50% of the finger, which is a shorter drag, not
  // an elastic one; this one gets stiffer the further it is stretched and asymptotes at MAX_PULL,
  // so the end of the travel can be FELT rather than read off a number.
  const resist = (dy: number) =>
    variant === 'C' ? MAX_PULL * (1 - Math.exp(-dy / MAX_PULL)) : Math.min(MAX_PULL, dy * 0.7);

  const finish = async () => {
    start.current = null;
    captured.current = false;
    if (!armed || busy) {
      setPull(0);
      if (!busy && !settled) setStatus('idle');
      return;
    }
    setStatus('refreshing');
    let outcome: PullStatus = 'success';
    try {
      await onRefresh();
    } catch {
      // The reason belongs in the log, not on a 20px indicator. What the gesture owes the user is
      // the fact that it did not work, and a shape that says "go again".
      outcome = 'error';
    }
    setStatus(outcome);
    setPull(0);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setStatus('idle'),
      outcome === 'error' ? HOLD_FAIL : HOLD_OK,
    );
  };

  /* ── One glyph, five states, in every variant ───────────────────────────────────────────────
   * The icon carries the state and the colour only agrees with it. An arrow that turns green is
   * an arrow; a tick is a tick.
   */
  const glyph = busy ? (
    <Loader2 size={20} strokeWidth={2} aria-hidden className={motionSafe ? 'animate-spin' : ''} />
  ) : status === 'success' ? (
    <Check size={20} strokeWidth={2.5} aria-hidden />
  ) : status === 'error' ? (
    <TriangleAlert size={20} strokeWidth={2.5} aria-hidden />
  ) : armed ? (
    <RefreshCw size={20} strokeWidth={2} aria-hidden />
  ) : (
    <ArrowDown size={20} strokeWidth={2} aria-hidden />
  );

  const tone =
    status === 'success'
      ? 'text-success'
      : status === 'error'
        ? 'text-danger'
        : armed
          ? 'text-accent'
          : 'text-text-2';

  let indicator: ReactNode;

  if (variant === 'A') {
    // A — Spinner-grow: the indicator IS the progress bar. A ring closes as you pull and the whole
    // mark grows into it, so the gesture has a readout before it has an outcome.
    const R = 13;
    const CIRC = 2 * Math.PI * R;
    const done = busy || settled ? 1 : progress;
    indicator = (
      <motion.span
        className={cn('relative inline-grid size-8 place-items-center', tone)}
        animate={{ scale: busy || settled ? 1 : 0.45 + 0.55 * progress }}
        transition={motionSafe ? SPRING.tight : { duration: 0 }}
      >
        <svg viewBox="0 0 32 32" className="absolute inset-0 size-8 -rotate-90" aria-hidden>
          <circle cx="16" cy="16" r={R} fill="none" stroke="var(--surface-2)" strokeWidth={2} />
          <circle
            cx="16"
            cy="16"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC - CIRC * done}
            style={{
              transition: motionSafe
                ? 'stroke-dashoffset var(--duration-fast) var(--ease-standard)'
                : 'none',
            }}
          />
        </svg>
        {glyph}
      </motion.span>
    );
  } else if (variant === 'B') {
    // B — Logo-flip: the mark turns over like a coin, and the pull DRIVES the rotation, so the
    // halfway point of the gesture is the halfway point of the flip. It lands on the state glyph.
    // Flame stands in for the product mark — the one place this file is allowed to be brand.
    const flipped = progress >= 0.5 || busy || settled;
    indicator = (
      <motion.span
        className={cn('inline-flex', tone)}
        style={{ transformStyle: 'preserve-3d' }}
        animate={{
          rotateY: motionSafe ? (busy ? 360 : flipped ? 180 : progress * 180) : flipped ? 180 : 0,
        }}
        transition={
          busy && motionSafe
            ? { duration: MOTION_S.ambient, repeat: Infinity, ease: 'linear' }
            : { duration: motionSafe ? MOTION_S.fast : 0, ease: EASE_STANDARD }
        }
      >
        {/* The back face is counter-rotated so the glyph is readable once it has landed. While it
            is tumbling it is not counter-rotated, because a spinner has no wrong way up. */}
        <span
          className="inline-flex"
          style={{ transform: flipped && !busy ? 'rotateY(180deg)' : undefined }}
        >
          {flipped ? glyph : <Flame size={20} strokeWidth={2} aria-hidden />}
        </span>
      </motion.span>
    );
  } else if (variant === 'C') {
    // C — the band stretches the mark too: squash and stretch is how a physical object shows the
    // force on it, and it is the same force the resistance curve above is applying.
    indicator = (
      <motion.span
        className={cn('inline-flex', tone)}
        animate={{ scaleY: 1 + 0.5 * progress, scaleX: 1 - 0.2 * progress }}
        transition={motionSafe ? SPRING.soft : { duration: 0 }}
      >
        {glyph}
      </motion.span>
    );
  } else if (variant === 'D') {
    // D — Status-morph: a chip that changes SHAPE, colour and content together. It is the only
    // variant that says the outcome in words, and the only one legible without knowing the
    // gesture. The two states with no word of their own keep the glyph and stay narrow.
    const word = busy
      ? t('common.loading')
      : status === 'success'
        ? t('home.done')
        : status === 'error'
          ? t('common.retry')
          : null;
    const skin =
      status === 'success'
        ? 'bg-success-subtle text-success'
        : status === 'error'
          ? 'bg-danger-subtle text-danger'
          : busy
            ? 'bg-info-subtle text-info'
            : armed
              ? 'bg-accent-subtle text-accent'
              : 'bg-surface-2 text-text-2';
    indicator = (
      <motion.span
        layout
        className={cn('inline-flex items-center gap-2 rounded-chip px-3 py-1', skin)}
        transition={motionSafe ? SPRING.base : { duration: 0 }}
      >
        {glyph}
        {word ? <span className="text-caption">{word}</span> : null}
      </motion.span>
    );
  } else {
    // E — Surprise-drop: the mark falls in rather than fading in, hangs tilted while you pull, and
    // straightens as it arms. A success drops three sparks past it — the one moment in the whole
    // catalogue that is allowed to be a reward instead of a report.
    indicator = (
      <span className="relative inline-flex">
        <motion.span
          key={status}
          className={cn('inline-flex', tone)}
          initial={motionSafe ? { y: -20, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1, rotate: busy || settled ? 0 : (1 - progress) * -18 }}
          transition={motionSafe ? SPRING.soft : { duration: 0 }}
        >
          {glyph}
        </motion.span>
        {status === 'success'
          ? [0, 1, 2].map((i) => (
              <motion.span
                key={i}
                aria-hidden
                className="absolute left-1/2 top-0 text-accent"
                initial={{ y: -12, x: (i - 1) * 14, opacity: 0, scale: 0.6 }}
                animate={{ y: 22, opacity: [0, 1, 0], scale: 1 }}
                transition={{
                  duration: motionSafe ? MOTION_S.slow : 0,
                  delay: motionSafe ? i * 0.08 : 0,
                  ease: EASE_STANDARD,
                }}
              >
                <Sparkles size={12} strokeWidth={2.5} />
              </motion.span>
            ))
          : null}
      </span>
    );
  }

  const offset = busy || settled ? THRESHOLD / 2 : pull;
  const dragging = start.current !== null;
  const settle = dragging
    ? { duration: 0 }
    : // C — released, the band overshoots and comes back. Every other variant eases home, because
      // a bounce on a list of data is a distraction rather than a physical fact.
      variant === 'C' && motionSafe
      ? SPRING.soft
      : { duration: motionSafe ? MOTION_S.base : 0, ease: EASE_STANDARD };

  // Words for the states that have them. The visual is aria-hidden — an icon that morphs is a
  // sighted reading of the same three facts, and announcing both says everything twice.
  const announcement = busy
    ? t('common.loading')
    : status === 'success'
      ? t('home.done')
      : status === 'error'
        ? t('common.retry')
        : '';

  return (
    <motion.div
      aria-busy={busy || undefined}
      animate={{ y: offset }}
      transition={settle}
      onPointerDown={(e) => {
        if (busy || settled) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        /*
         * A TOUCH drag competes with native scrolling, so it may only arm at the very top: starting
         * a pull mid-list would fight the scroll. A MOUSE drag competes with nothing — no browser
         * scrolls a document from a left-button drag — so it arms wherever the pointer went down.
         *
         * That split is also what makes this element demonstrable at all: the playground tile sits
         * a long way down a scrolled page, where `window.scrollY <= 0` is false forever and the
         * gesture could never be performed by the person judging it.
         */
        if (e.pointerType === 'touch' && window.scrollY > 0) return;
        start.current = e.clientY;
      }}
      onPointerMove={(e) => {
        if (start.current === null || busy || settled) return;
        const dy = e.clientY - start.current;
        if (dy <= 0) {
          setPull(0);
          setStatus('idle');
          return;
        }
        // Capture only once this is unambiguously a drag. Capturing on pointerdown would retarget
        // the click too, and any button inside `children` would stop working.
        if (!captured.current && dy > 8) {
          e.currentTarget.setPointerCapture(e.pointerId);
          captured.current = true;
        }
        const next = resist(dy);
        setPull(next);
        setStatus(next >= THRESHOLD ? 'armed' : 'pull');
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <div
        className="pointer-events-none flex h-0 items-center justify-center"
        style={{ marginTop: -THRESHOLD / 2 }}
      >
        <span aria-hidden className="text-caption inline-flex items-center">
          {pull > 0 || busy || settled ? indicator : null}
        </span>
        <span className="sr-only" aria-live="polite">
          {announcement}
        </span>
      </div>
      {children}
    </motion.div>
  );
}
