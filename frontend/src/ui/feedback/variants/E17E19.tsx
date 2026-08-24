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

/**
 * How a handle is DRAWN. Three looks, because three variants mean three different things by it.
 *
 *   puck — the default mark: a filled accent dot on the rail.
 *   lens — C. Hollow, so the ramp underneath shows THROUGH the handle. It used to be a bar filled
 *          with `--gradient-brand`, i.e. the whole 135° ramp squeezed into 12px, which is a smear
 *          rather than a reading. An aperture samples the colour AT the value, which is the only
 *          thing a gradient track is for.
 *   ring — D's lower bound. Two identical pucks is a range whose two ends cannot be told apart,
 *          which is the one thing a two-handle slider has to communicate.
 */
type ThumbLook = 'puck' | 'lens' | 'ring';

/** One handle. Motion owns the transform, so the centring lives in `x`/`y` and not in a class. */
function SliderThumb({
  pct,
  grown,
  look,
  halo,
  glide,
  motionSafe,
}: {
  pct: number;
  grown: boolean;
  look: ThumbLook;
  /**
   * A — the 44px target, drawn.
   *
   * "Thumb-grow" used to be a 1.6x scale that existed only between pointerdown and pointerup, so
   * the variant was invisible until you were already dragging it and identical to every other one
   * in a still. The halo is the growth made legible before the gesture: the hit area the control
   * has always had, shown at the moment you reach for it.
   */
  halo: boolean;
  glide: boolean;
  motionSafe: boolean;
}) {
  const travel = {
    left: `${pct}%`,
    x: '-50%',
    y: '-50%',
    transition: glide ? 'left var(--duration-fast) var(--ease-standard)' : 'none',
  };

  return (
    <>
      {halo ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-1/2 size-11 rounded-chip bg-accent-subtle"
          style={travel}
          animate={{ scale: grown ? 1 : 0.35, opacity: grown ? 1 : 0 }}
          transition={motionSafe ? SPRING.tight : { duration: 0 }}
        />
      ) : null}
      <motion.span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 rounded-chip border-2',
          look === 'lens' ? 'h-3 w-5' : 'size-5',
          look === 'ring' ? 'border-[var(--accent)]' : 'border-[var(--surface-0)]',
        )}
        style={{
          ...travel,
          background:
            look === 'lens'
              ? 'transparent'
              : look === 'ring'
                ? 'var(--surface-0)'
                : 'var(--accent)',
          boxShadow: 'var(--shadow-glow)',
        }}
        animate={{ scale: grown ? 1.6 : 1 }}
        transition={motionSafe ? SPRING.tight : { duration: 0 }}
      />
    </>
  );
}

/**
 * E's coarse control — and the one place in this file where a refusal is answered ON the thing
 * that refused.
 *
 * The shared readout says "no" in the corner of the row. That is the right place for a drag, which
 * has no button to point at; it is the wrong place for a tap, where the user's attention is on the
 * end they just pressed. So the pressed end swaps its own glyph for the warning and shakes, and the
 * readout says the same thing at the same time. Same vocabulary, twice, because a tap has an
 * origin and a drag does not.
 */
function SliderEnd({
  label,
  icon,
  weight,
  exhausted,
  denied,
  shakeKey,
  motionSafe,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  /** How much room is left in THIS direction, 0–1. Drives both the weight and the tint. */
  weight: number;
  /** No room left this way. */
  exhausted: boolean;
  denied: boolean;
  shakeKey: number;
  motionSafe: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      shape="icon"
      variant="ghost"
      aria-label={label}
      /*
       * `aria-disabled`, never `disabled`.
       *
       * The whole point of this variant is that the end says NO out loud instead of going quiet,
       * and a truly disabled button cannot be pressed, cannot be focused in some browsers, and
       * therefore cannot refuse anything — it just stops existing. This announces "unavailable" to
       * a screen reader, which is the half of the refusal a glyph and a shake cannot carry, while
       * the press still lands and still answers.
       */
      aria-disabled={exhausted || undefined}
      onClick={onPress}
      className="shrink-0"
    >
      {denied ? (
        <motion.span
          // Keyed on the count so a SECOND press against the same end shakes again.
          key={`deny-${shakeKey}`}
          aria-hidden
          className="inline-flex text-warning"
          animate={motionSafe ? { x: [0, -5, 5, -3, 0] } : { x: 0 }}
          transition={{ duration: motionSafe ? MOTION_S.slow : 0, ease: EASE_STANDARD }}
        >
          <TriangleAlert size={20} strokeWidth={2.5} />
        </motion.span>
      ) : (
        <motion.span
          aria-hidden
          className={cn('inline-flex', weight > 0.65 ? 'text-accent' : 'text-text-3')}
          animate={{ scale: 0.8 + 0.35 * weight }}
          transition={motionSafe ? SPRING.tight : { duration: 0 }}
        >
          {icon}
        </motion.span>
      )}
    </Pressable>
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
  /**
   * A's trigger is REACHING for the control, not only holding it.
   *
   * Hover and keyboard focus count, because a variant that only exists between pointerdown and
   * pointerup cannot be seen in a still, cannot be seen with a keyboard at all, and is the reason
   * "Thumb-grow" read as the plain one in the playground grid.
   */
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const engaged = grabbing || hovering || focused;
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
  /** Which END was refused, when there was one — E draws the answer on that button. */
  const [deniedDir, setDeniedDir] = useState<-1 | 1 | null>(null);
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

  const refuse = (dir: -1 | 1 | null = null) => {
    // A drag held past the end fires pointermove every frame. Without this the shake would restart
    // on each one and never actually play — a refusal that reads as a flicker.
    if (statusRef.current === 'limit') return;
    setDeniedDir(dir);
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

  /** Which stop B is sitting on, or -1 between them. Drives the detent flash. */
  const stopIndex =
    variant === 'B' ? stops.findIndex((s) => Math.abs(value - s) < 1e-6) : -1;

  const dual = variant === 'D';
  const [innerLow, setInnerLow] = useState(min);
  const low = Math.min(lowValue ?? innerLow, value);
  const setLow = (next: number) => {
    const wanted = clamp(next);
    // D's own failure, and the only one the other four cannot have: the lower bound cannot pass
    // the upper one. Clamping it silently is what the previous version did, and a bound that stops
    // moving for no stated reason is indistinguishable from a stuck handle.
    if (wanted > value) refuse();
    const bounded = Math.min(wanted, value);
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
      refuse(dir);
      return;
    }
    setDeniedDir(null);
    commit(next);
  };

  const refuseAtEdge = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    if (value >= max && clientX > r.right + 8) refuse(1);
    else if (value <= min && clientX < r.left - 8) refuse(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const up = e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'End';
    const down =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'Home';
    if (up && value >= max) refuse(1);
    else if (down && value <= min) refuse(-1);
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
        {/* A keeps this corner for the STATE answers ONLY.
            The value lives in the bubble on the handle, and the bubble's whole argument is that
            the eye should not travel to the corner of the row mid-drag — which it was doing
            anyway, because both were shown at once and said the same number twice. So here A
            shows the tick and the warning, and nothing else; every other variant shows the value
            permanently, because none of them has a second place to put it. */}
        <span
          className={cn(
            'text-body-s inline-flex min-h-5 items-center tabular-nums text-text-1',
            'transition-opacity duration-[var(--duration-fast)]',
            variant === 'A' && status === 'idle' && 'opacity-0',
          )}
        >
          {readout}
        </span>
      </div>

      <div
        className={cn(
          'relative mt-2 flex items-center gap-2',
          // A reserves room on BOTH sides of the rail: the bubble above it, and the 44px halo
          // below. Without the lower half the halo bleeds past the bottom of whatever card the
          // slider sits in — visible in the playground grid, where the tiles do not clip.
          variant === 'A' && 'pb-3 pt-7',
        )}
        role={dual ? 'group' : undefined}
        aria-labelledby={dual ? labelId : undefined}
      >
        {/* E — the ends are not decoration, they are the coarse control: a 44px target each, and
            the icon on the side you are heading for gains weight while the other loses it. That is
            also the one place a slider can be told "no" with a tap rather than a drag. */}
        {variant === 'E' ? (
          <SliderEnd
            label={t('common.less')}
            icon={endIcons[0]}
            weight={1 - pct / 100}
            exhausted={value <= min}
            denied={status === 'limit' && deniedDir === -1}
            shakeKey={refusals}
            motionSafe={motionSafe}
            onPress={() => nudge(-1)}
          />
        ) : null}

        <div
          ref={trackRef}
          className="relative flex-1"
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') setHovering(true);
          }}
          onPointerLeave={() => setHovering(false)}
        >
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
              /* C — the ramp is painted across the WHOLE track and the unspent part is VEILED, so
                 a given colour means the same value at every width. A gradient stretched to the
                 fill would show its hot end at 5% and at 95% alike, which is a decoration rather
                 than a reading.

                 The veil is 85% rather than opaque on purpose: the scale you have not reached yet
                 still ghosts through it, so the ramp reads as one continuous quantity with a
                 water-line on it, not as a coloured bar that stops. */
              <div
                className="absolute inset-y-0 right-0 bg-surface-2/85"
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

          {/* B — the detent, made visible. A snap is a thing you FEEL on hardware and this has no
              hardware, so the arrival gets a ring that flashes out of the handle once per stop.
              Keyed on the stop index: crossing four stops in one drag fires four times, staying
              on one fires once. It is gated on motion because a flash with its duration collapsed
              to zero is not a shorter flash, it is no flash — the state change reduced motion has
              to keep is the value LANDING, and that is the tick and the handle, both of which
              still move instantly. */}
          {variant === 'B' && motionSafe && stopIndex >= 0 ? (
            <motion.span
              key={`detent-${stopIndex}`}
              aria-hidden
              className="pointer-events-none absolute top-1/2 size-5 rounded-chip border-2 border-[var(--accent)]"
              style={{ left: `${pct}%`, x: '-50%', y: '-50%' }}
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: MOTION_S.base, ease: EASE_STANDARD }}
            />
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
              animate={{ opacity: engaged ? 1 : 0, scale: engaged ? 1 : 0.8, y: engaged ? 0 : 6 }}
              transition={motionSafe ? SPRING.tight : { duration: 0 }}
            >
              {format(value)}
            </motion.span>
          ) : null}

          {dual ? (
            <SliderThumb
              pct={lowPct}
              grown={false}
              look="ring"
              halo={false}
              glide={glide}
              motionSafe={motionSafe}
            />
          ) : null}
          <SliderThumb
            pct={pct}
            grown={variant === 'A' && engaged}
            look={variant === 'C' ? 'lens' : 'puck'}
            halo={variant === 'A'}
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
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  release();
                }}
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
                onChange={(e) => {
                  const asked = Number(e.target.value);
                  // The mirror of setLow's guard: the upper bound cannot be dragged under the
                  // lower one, and being told so is the difference between a floor and a fault.
                  if (asked < low) refuse();
                  commit(Math.max(asked, low));
                }}
                onKeyDown={onKeyDown}
                onPointerDown={() => setGrabbing(true)}
                onPointerMove={onPointerMove}
                onPointerUp={release}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  release();
                }}
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
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                release();
              }}
              className="absolute inset-0 h-[var(--target-min)] w-full -translate-y-1/3 cursor-pointer opacity-0"
            />
          )}
        </div>

        {variant === 'E' ? (
          <SliderEnd
            label={t('common.more')}
            icon={endIcons[1]}
            weight={pct / 100}
            exhausted={value >= max}
            denied={status === 'limit' && deniedDir === 1}
            shakeKey={refusals}
            motionSafe={motionSafe}
            onPress={() => nudge(1)}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ══ E18 — Skeleton ═════════════════════════════════════════════════════════════════════════ */

export function SkeletonBlock({ className, index = 0 }: { className?: string; index?: number }) {
  const variant = useElementVariant('E18');
  const motionSafe = useMotionSafe();

  /* D — Shape-morph. Measured before this: D and E rendered the base block with nothing added, so
     two of the five names were labels on the same grey slab.

     A sweep and a pulse both say "waiting" by changing BRIGHTNESS. This one says it by refusing to
     settle on a size: the block breathes between widths, which is the honest thing a placeholder
     can say about content whose length it does not know yet. It has to be a transform rather than
     a width, because a width animation relayouts every sibling once per frame, and it has to be
     Motion rather than a keyframe because `index.css` is not this file's to extend.

     Static under reduced motion — falling through to the base block below leaves the slab, which
     is the same placeholder without the movement. */
  if (variant === 'D' && motionSafe) {
    return (
      <motion.div
        aria-hidden
        className={cn('origin-left rounded-field bg-[var(--skeleton-base)]', className)}
        animate={{ scaleX: [1, 0.68, 1], scaleY: [1, 0.86, 1] }}
        transition={{
          duration: MOTION_S.ambient,
          repeat: Infinity,
          ease: 'easeInOut',
          // The same 60ms stagger C uses, so a column of them ripples instead of pumping in unison.
          delay: index * 0.06,
        }}
      />
    );
  }

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
        // E — Exact-ghost: the OUTLINE of what is coming, at exactly its size, and nothing else.
        // A filled slab is a claim that something is there; a dashed frame is a claim that
        // something is reserved. It is the only one of the five with no animation at all, which is
        // the point — on a screen that draws a dozen placeholders, silence is a design choice, and
        // it is the variant that looks identical with reduced motion on.
        variant === 'E' &&
          'border-[length:var(--border-width)] border-dashed border-[var(--surface-border-strong)] bg-transparent',
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
        : busy
          ? // D already said busy in `info`, and the other four said it in nothing at all. One
            // vocabulary: four semantic colours, each meaning the same thing in every variant.
            'text-info'
          : armed
            ? 'text-accent'
            : 'text-text-2';

  let indicator: ReactNode;

  if (variant === 'A') {
    /* A — Spinner-grow: the indicator IS the progress bar. A ring closes as you pull and the whole
       mark grows into it, so the gesture has a readout before it has an outcome.

       ═══ AND THE RING IS WHAT SPINS ═══════════════════════════════════════════════════════════
       It used to fill the ring to 100% while a second, smaller spinner turned inside it — two
       spinners, one of which was not moving, in an 32px mark. The name is Spinner-grow: the ring
       the pull has been drawing is the thing that should come loose and turn. So on `refreshing`
       the arc drops back to a quarter and the whole svg rotates, with nothing in the middle.

       With reduced motion nothing can rotate, so the arc stays CLOSED and the static Loader2 sits
       in the centre — busy is still stated, it just is not stated by movement. */
    const R = 13;
    const CIRC = 2 * Math.PI * R;
    const sweeping = busy && motionSafe;
    const done = settled ? 1 : busy ? (sweeping ? 0.25 : 1) : progress;
    indicator = (
      <motion.span
        className={cn('relative inline-grid size-8 place-items-center', tone)}
        animate={{ scale: busy || settled ? 1 : 0.45 + 0.55 * progress }}
        transition={motionSafe ? SPRING.tight : { duration: 0 }}
      >
        <motion.svg
          viewBox="0 0 32 32"
          className="absolute inset-0 size-8"
          aria-hidden
          animate={{ rotate: sweeping ? 360 : 0 }}
          transition={
            sweeping
              ? { duration: MOTION_S.ambient, repeat: Infinity, ease: 'linear' }
              : { duration: 0 }
          }
        >
          {/* The -90° start lives on a group, not on the element Motion is rotating: an inline
              transform and an animated one are the same property, and the animation wins. */}
          <g transform="rotate(-90 16 16)">
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
          </g>
        </motion.svg>
        {sweeping ? null : glyph}
      </motion.span>
    );
  } else if (variant === 'B') {
    // B — Logo-flip: the mark turns over like a coin, and the pull DRIVES the rotation, so the
    // halfway point of the gesture is the halfway point of the flip. It lands on the state glyph.
    // Flame stands in for the product mark — the one place this file is allowed to be brand.
    const flipped = progress >= 0.5 || busy || settled;
    /*
     * A rotateY with no perspective is not a flip — it is a horizontal squash, because an
     * orthographic projection has no near edge to bring towards you. The coin turned edge-on and
     * came back the same size, which is why "Logo-flip" read as a blink. 600px is the usual
     * shallow-perspective figure for a mark this size: enough parallax to see the turn, not enough
     * to bend the glyph.
     *
     * The outcome gets one MORE half-turn (180 → 540) rather than a cut: the coin lands on the
     * answer, so success and failure arrive by the same motion that started the gesture.
     */
    const turn = busy ? 360 : settled ? 540 : flipped ? 180 : progress * 180;
    indicator = (
      <span className="inline-flex" style={{ perspective: 600 }}>
        <motion.span
          className={cn('inline-flex', tone)}
          style={{ transformStyle: 'preserve-3d' }}
          animate={{ rotateY: motionSafe ? turn : flipped ? 180 : 0 }}
          transition={
            busy && motionSafe
              ? { duration: MOTION_S.ambient, repeat: Infinity, ease: 'linear' }
              : {
                  duration: motionSafe ? (settled ? MOTION_S.slow : MOTION_S.fast) : 0,
                  ease: EASE_STANDARD,
                }
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
      </span>
    );
  } else if (variant === 'C') {
    /* C — the band stretches the mark too: squash and stretch is how a physical object shows the
       force on it, and it is the same force the resistance curve above is applying.

       And there is now something to stretch FROM. The resistance curve and the squash were both
       real, and both were felt rather than seen — in a still, C was the variant with no marks on
       it. The tether is the elastic drawn: it grows out of the anchor the mark left behind, thins
       as it is pulled (a band conserves its volume), and springs back past zero on release. It
       lags the finger by a spring on purpose, which is the one thing in this file that is allowed
       to lag: an elastic that tracked the pointer exactly would be a stick. */
    indicator = (
      <span className="relative inline-flex">
        <motion.span
          aria-hidden
          className="absolute bottom-full left-1/2 w-1 rounded-chip bg-accent-subtle"
          style={{ x: '-50%' }}
          animate={{ height: pull, scaleX: 1 - 0.6 * progress, opacity: pull > 0 ? 1 : 0 }}
          transition={motionSafe ? SPRING.soft : { duration: 0 }}
        />
        <motion.span
          className={cn('inline-flex', tone)}
          animate={{ scaleY: 1 + 0.5 * progress, scaleX: 1 - 0.2 * progress }}
          transition={motionSafe ? SPRING.soft : { duration: 0 }}
        >
          {glyph}
        </motion.span>
      </span>
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
        className={cn(
          'relative inline-flex items-center gap-2 overflow-hidden rounded-chip px-3 py-1',
          skin,
        )}
        transition={motionSafe ? SPRING.base : { duration: 0 }}
      >
        {/* Before there is an outcome the chip is also the METER. Without it D's morph was a
            three-step staircase — grey, accent, coloured — and the two thirds of the gesture
            between the steps had nothing to show. The fill runs to the edge exactly as the chip
            arms, so reaching the threshold and the chip turning accent are one event, not two. */}
        {!busy && !settled ? (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-accent-subtle"
            style={{
              width: `${progress * 100}%`,
              transition: motionSafe ? 'width var(--duration-fast) var(--ease-standard)' : 'none',
            }}
          />
        ) : null}
        <span className="relative inline-flex">{glyph}</span>
        {word ? <span className="text-caption relative">{word}</span> : null}
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
        {/* The failure shake, once, for all five.
            The glyph swap already says a refresh failed and the tone already agrees with it, but
            both are things you have to be LOOKING at the 20px mark to read. A shake is the only
            part of the answer that is visible from the corner of the eye, and it is the same
            gesture the slider above uses for the same meaning — one vocabulary for "no" across the
            file. With reduced motion the duration collapses to zero and the glyph, the colour and
            the longer hold still carry it. */}
        <motion.span
          aria-hidden
          className="text-caption inline-flex items-center"
          animate={status === 'error' && motionSafe ? { x: [0, -6, 6, -4, 0] } : { x: 0 }}
          transition={{
            duration: status === 'error' && motionSafe ? MOTION_S.slow : 0,
            ease: EASE_STANDARD,
          }}
        >
          {pull > 0 || busy || settled ? indicator : null}
        </motion.span>
        <span className="sr-only" aria-live="polite">
          {announcement}
        </span>
      </div>
      {children}
    </motion.div>
  );
}
