import { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCheck, Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

export interface CheckboxProps {
  checked: boolean | 'indeterminate';
  /**
   * Commit the new value. Returning a Promise opts the control into the two states a checkbox
   * that talks to a server actually has: BUSY while the write is in flight, and FAILED when it
   * is refused. A `void` return keeps the old, purely local behaviour.
   */
  onChange: (next: boolean) => void | Promise<unknown>;
  label: string;
  disabled?: boolean;
}

type Status = 'idle' | 'busy' | 'error';

/**
 * The `--duration-*` tokens, in the seconds Motion wants.
 *
 * Same reasoning as `EASE_STANDARD` in `useMotionSafe`: the tokens are CSS, Motion drives its
 * springs and tweens from JS, and a `var()` read at module scope resolves before the theme is
 * applied. The keys are the tokens' names, so a drifting value shows up as a disagreement with a
 * named token rather than as an anonymous `0.45` nobody can trace back to a decision.
 */
const DUR = {
  instant: 0.1, // --duration-instant
  fast: 0.15, // --duration-fast
  base: 0.25, // --duration-base
  slow: 0.4, // --duration-slow
  ambient: 1.2, // --duration-ambient — loops only
} as const;

/** The tick, as one stroke. Every variant draws THIS path, so only the behaviour differs. */
const TICK = 'M5 12.5 L10 17.5 L19 7';

/**
 * E5 — Checkbox, all five variants.
 *
 * The tick is an SVG path rather than a glyph so a variant can animate its stroke: a fade says
 * "a check appeared", a draw says "this got checked", and that is the difference between
 * decoration and feedback.
 *
 * ═══ THE FIVE ARE FIVE DIFFERENT IDEAS, NOT FIVE TIMINGS ══════════════════════════════════════
 *
 *   A Draw-on             ink on paper. Pale fill, accent stroke drawn slowly — and the only
 *                         variant that ERASES in reverse when you uncheck it.
 *   B Bounce-in           physical. The box overshoots and squashes, the tick lands rotating.
 *   C Strike-label        the feedback is in the TEXT: a rule wipes across the label and the
 *                         label dims. The box stays quiet on purpose.
 *   D Ring-confirm        ceremony, for checks that matter (a completed set): two rings pulse
 *                         out, the glyph becomes a DOUBLE tick, and a halo stays while checked.
 *   E Indeterminate-sweep the tri-state one. A band sweeps the box, the dash draws first and the
 *                         tick grows out of it; a genuinely mixed box sweeps on a loop.
 *
 * ═══ THE STATES A CHECKBOX HAS BESIDES ON AND OFF ═════════════════════════════════════════════
 *
 * A checkbox that writes to a server can be in flight, and can be refused. Both change the GLYPH,
 * not only the colour — a spinner while saving, a warning triangle plus a shake when the write
 * fails — because colour is the one signal a colour-blind user may not get and the one a glance
 * at a busy screen misses. The failed state persists until the next click, which retries it.
 */
export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  const variant = useElementVariant('E5');
  const motionSafe = useMotionSafe();
  const { t } = useTranslation();
  const id = useId();

  const [status, setStatus] = useState<Status>('idle');
  // Re-shake on a SECOND failure. Keyed on a counter rather than on `status`, so failing twice in
  // a row shakes twice instead of sitting still the second time.
  const [failKey, setFailKey] = useState(0);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const isOn = checked === true;
  const isMixed = checked === 'indeterminate';
  const busy = status === 'busy';
  const failed = status === 'error';

  const commit = () => {
    if (disabled || busy) return;
    setStatus('idle');
    const result = onChange(!isOn);
    // A local `setState` handler is not a write and must not flash a spinner for one frame.
    if (!(result instanceof Promise)) return;
    setStatus('busy');
    void result.then(
      () => {
        if (alive.current) setStatus('idle');
      },
      () => {
        if (!alive.current) return;
        setStatus('error');
        setFailKey((k) => k + 1);
      },
    );
  };

  /*
    The box is 24px; the CONTROL around it is Pressable's 44px floor. Sizing a control to its own
    graphic is the mistake that produced nine 32px chips and a 24px search field in the previous
    build — the visual box and the hit area are two different things, and only one of them has an
    accessibility floor. Pressable owns that floor, the press scale, the focus ring and the busy
    lockout; this file only decides what the 24px square DOES.
  */
  const boxTone = failed
    ? 'border-danger bg-danger-subtle'
    : busy
      ? // A third fill, not a dimmed copy of either end state: "being written" is its own thing.
        'border-accent-border bg-accent-subtle'
      : isOn || isMixed
        ? variant === 'A'
          ? 'border-accent bg-accent-subtle' // A: ink on paper — the STROKE is the event, not a fill
          : 'border-transparent bg-accent'
        : 'border-[var(--surface-border)] bg-surface-2';

  const ink = variant === 'A' ? 'text-accent' : 'text-accent-fg';

  const tick = (
    <svg viewBox="0 0 24 24" className={cn('size-4', ink)} aria-hidden fill="none">
      {isMixed ? (
        <motion.line
          x1="6"
          y1="12"
          x2="18"
          y2="12"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: 1 }}
          transition={{ duration: motionSafe ? DUR.fast : 0, ease: EASE_STANDARD }}
        />
      ) : variant === 'E' ? (
        // E — the relay. The dash draws first, then hands over to the tick growing out of it, so
        // the mixed state is a place this checkbox visibly passes THROUGH rather than one it only
        // reaches when a parent hands it one. Two keyframe tracks with `times` rather than a
        // timer: nothing to clear on unmount, and nothing that can drift out of step.
        <>
          <motion.line
            key={'sweep-' + String(isOn)}
            x1="6"
            y1="12"
            x2="18"
            y2="12"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            initial={false}
            animate={isOn ? { pathLength: [0, 1, 1], opacity: [1, 1, 0] } : { pathLength: 0, opacity: 0 }}
            transition={{ duration: motionSafe ? DUR.slow : 0, times: [0, 0.45, 0.7], ease: EASE_STANDARD }}
          />
          <motion.path
            key={'relay-' + String(isOn)}
            d={TICK}
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={isOn ? { pathLength: [0, 0, 1] } : { pathLength: 0 }}
            transition={{ duration: motionSafe ? DUR.slow : 0, times: [0, 0.55, 1], ease: EASE_STANDARD }}
          />
        </>
      ) : variant === 'C' ? (
        // C — the box is deliberately the quiet half: the tick simply arrives, because the event
        // this variant is about happens to the LABEL.
        <motion.path
          d={TICK}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ opacity: isOn ? 1 : 0 }}
          transition={{ duration: motionSafe ? DUR.fast : 0, ease: EASE_STANDARD }}
        />
      ) : (
        // A draws over --duration-slow and un-draws the same way; B is already carried by the
        // spring below, so its stroke only has to be there.
        <motion.path
          d={TICK}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: isOn ? 1 : 0 }}
          transition={{
            duration: motionSafe ? (variant === 'A' ? DUR.slow : DUR.instant) : 0,
            ease: EASE_STANDARD,
          }}
        />
      )}
    </svg>
  );

  const glyph = busy ? (
    // Reduced motion collapses the spin (index.css caps animation-duration and iteration count)
    // and the spinner is STILL the glyph: the state change survives, only the travel goes.
    <Loader2 size={16} strokeWidth={2.5} aria-hidden className="animate-spin text-text-2" />
  ) : failed ? (
    <TriangleAlert size={16} strokeWidth={2.5} aria-hidden className="text-danger" />
  ) : variant === 'D' && isOn ? (
    // D — a DOUBLE tick: "recorded", not merely "ticked". The one variant whose confirmed state is
    // a different glyph, so it is tellable apart in a still screenshot as well as in motion.
    <motion.span
      aria-hidden
      className="inline-flex text-accent-fg"
      initial={motionSafe ? { scale: 0.3, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={motionSafe ? SPRING.tight : { duration: 0 }}
    >
      <CheckCheck size={16} strokeWidth={3} />
    </motion.span>
  ) : variant === 'B' && isOn ? (
    // B — the tick lands rotating. Wrapped in an HTML span rather than an SVG <g> so the spring
    // has a transform-origin every browser agrees about.
    <motion.span
      aria-hidden
      className="inline-flex"
      initial={motionSafe ? { scale: 0, rotate: -40 } : false}
      animate={{ scale: 1, rotate: 0 }}
      transition={motionSafe ? SPRING.tight : { duration: 0 }}
    >
      {tick}
    </motion.span>
  ) : (
    tick
  );

  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex min-h-[var(--target-min)] cursor-pointer items-center gap-3',
        disabled && 'pointer-events-none opacity-45',
      )}
    >
      <Pressable
        role="checkbox"
        id={id}
        variant="ghost"
        shape="icon"
        aria-checked={isMixed ? 'mixed' : isOn}
        aria-invalid={failed || undefined}
        busy={busy}
        disabled={disabled}
        onClick={commit}
        className="-m-2.5 shrink-0"
      >
        {/* The shake lives outside the box so a refused write moves the graphic, never the row. */}
        <motion.span
          key={failKey}
          aria-hidden
          className="relative inline-flex"
          initial={false}
          animate={failed && motionSafe ? { x: [0, -5, 5, -4, 0] } : { x: 0 }}
          transition={{ duration: motionSafe ? DUR.base : 0, ease: EASE_STANDARD }}
        >
          <motion.span
            className={cn(
              'relative inline-flex size-6 items-center justify-center rounded-field border',
              'transition-colors ease-[var(--ease-standard)]',
              // A takes its time: the fill soaks in behind the stroke instead of snapping.
              variant === 'A' ? 'duration-[var(--duration-slow)]' : 'duration-[var(--duration-base)]',
              // D — the halo is the half of Ring-confirm that does NOT depend on motion. With
              // reduced motion the rings never run, and a checked D box still wears something no
              // other variant has.
              variant === 'D' && isOn && !failed && 'shadow-[0_0_0_4px_var(--accent-subtle)]',
              boxTone,
            )}
            initial={false}
            // B — the box itself overshoots, and squashes on the way out. That is the whole idea
            // of the variant: nothing is drawn, everything is thrown.
            animate={
              variant === 'B' && motionSafe && !busy && !failed
                ? { scale: isOn ? [1, 1.22, 1] : [1, 0.82, 1] }
                : { scale: 1 }
            }
            transition={{ duration: motionSafe ? DUR.base : 0, times: [0, 0.4, 1], ease: EASE_STANDARD }}
          >
            {/* D — two rings, staggered, so the confirmation reads as a pulse and not as a blip. */}
            {variant === 'D' && isOn && !failed && motionSafe
              ? [0, 1].map((i) => (
                  <motion.span
                    key={i}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-field border-2 border-accent"
                    initial={{ scale: 1, opacity: 0.7 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: DUR.slow, ease: EASE_STANDARD, delay: i * DUR.fast }}
                  />
                ))
              : null}

            {/* E — the sweep. One pass on every change; a genuinely mixed box keeps sweeping,
                because "partially selected" is a state that persists and so should its signal.
                Motion-only: with reduced motion the dash glyph carries the state instead, and an
                infinite loop at a collapsed duration would spin the compositor for nothing. */}
            {variant === 'E' && motionSafe && !busy && !failed ? (
              <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-field">
                <motion.span
                  key={'band-' + String(isOn) + String(isMixed)}
                  className={cn(
                    'absolute inset-y-0 w-full',
                    isOn || isMixed
                      ? 'bg-[linear-gradient(90deg,transparent,var(--accent-fg),transparent)] opacity-30'
                      : 'bg-[linear-gradient(90deg,transparent,var(--accent-subtle),transparent)]',
                  )}
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{
                    duration: isMixed ? DUR.ambient : DUR.slow,
                    ease: EASE_STANDARD,
                    repeat: isMixed ? Infinity : 0,
                  }}
                />
              </span>
            ) : null}

            {glyph}
          </motion.span>
        </motion.span>
      </Pressable>

      <span className="relative inline-flex items-center">
        <span
          className={cn(
            'text-body transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
            failed ? 'text-danger' : variant === 'C' && isOn ? 'text-text-3' : 'text-text-1',
          )}
        >
          {label}
        </span>
        {/* C — the todo feel: the rule WIPES across the label from the left, and retracts the same
            way when the item comes back into the active set. `line-through` can only appear and
            disappear; an item leaving the active set deserves to be seen leaving. */}
        {variant === 'C' ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 origin-left rounded-chip bg-text-3"
            initial={false}
            animate={{ scaleX: isOn ? 1 : 0 }}
            transition={{ duration: motionSafe ? DUR.base : 0, ease: EASE_STANDARD }}
          />
        ) : null}
      </span>

      {/* A failure has to be readable, not only visible. `common.retry` is the existing key that
          says the right thing here: the next click retries the write. */}
      {failed ? (
        <span role="status" className="text-body-s text-danger">
          {t('common.retry')}
        </span>
      ) : null}
    </label>
  );
}
