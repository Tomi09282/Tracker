import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable, type PressableProps } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

/**
 * The duration tokens, in the seconds Motion wants.
 *
 * Same reason `EASE_STANDARD` exists next to `SPRING`: `duration-[var(--duration-slow)]` is a CSS
 * class and Motion takes a number, so every variant file that drives motion from JS has to restate
 * the token — and a restated value drifts. These are the five declared durations and nothing else,
 * so a reviewer can check them against `tokens.css` by eye rather than by trust.
 *
 * It is local because `useMotionSafe.ts` is shared by every element file right now; see the report.
 */
const DURATION = {
  instant: 0.1, // --duration-instant, 100ms
  fast: 0.15, // --duration-fast, 150ms
  base: 0.25, // --duration-base, 250ms
  slow: 0.4, // --duration-slow, 400ms
  ambient: 1.2, // --duration-ambient, 1200ms
} as const;

/**
 * What the button is doing right now.
 *
 * The owner's requirement in one type: a state that the user learns from the GLYPH, not from a
 * colour they may not be able to see. Every value below replaces the icon with a different one.
 */
export type IconButtonStatus = 'idle' | 'busy' | 'success' | 'error';

/** One press-born mark. `x`/`y` are pixels from the button's top-left; `null` means "centre". */
interface Splash {
  id: number;
  x: number | null;
  y: number | null;
}

export interface IconButtonProps extends Omit<PressableProps, 'shape' | 'children' | 'icon'> {
  /** Required — an icon-only control with no accessible name is unusable. */
  'aria-label': string;
  icon: ReactNode;
  /** Swapped in when `toggled` is true (play → pause, mute → unmute). */
  altIcon?: ReactNode;
  toggled?: boolean;
  /**
   * Controlled status. Leave it off and hand over `onAction` instead — then the button runs the
   * busy → success / error cycle itself, which is the case almost every caller wants.
   */
  status?: IconButtonStatus;
  /**
   * The work the press starts. A returned promise drives the status: spinner while it is in
   * flight, tick when it resolves, warning glyph plus a shake when it REJECTS.
   *
   * A rejection is not an exception here, it is a state — so it is caught, shown, and released
   * back to idle. Callers that need to react to the failure themselves still get the rejection
   * from their own promise chain.
   */
  onAction?: () => Promise<unknown> | void;
}

/**
 * E3 — Icon button, all five variants.
 *
 * `aria-label` is a required prop rather than an optional one: an icon-only button without a
 * name is the single most common accessibility failure in a mobile UI, and making it a type
 * error is cheaper than catching it in review.
 *
 * ═══ WHAT SEPARATES THE FIVE ═══════════════════════════════════════════════════════════════════
 *
 * The catalogue named five ideas and four of them used to be the same button. Each now owns a
 * different mechanism, a different resting appearance while `toggled`, and a different way of
 * celebrating a success — so the five are told apart in a demo tile with no label:
 *
 *   A Micro-bounce  the whole control squashes and rebounds on every press; icon steps to accent
 *   B Ink-dot       ink drops AT THE POINTER and floods the (clipped) button; a dot marks "on"
 *   C Icon-morph    no marks at all — the glyph itself rotates through the change
 *   D Ring-pulse    two rings travel outward past the edge; a standing ring marks "on"
 *   E Ghost→accent  borderless until it fills, the accent growing from the centre
 *
 * ═══ AND WHAT THEY SHARE ═══════════════════════════════════════════════════════════════════════
 *
 * The status glyph. Busy becomes a spinner, success becomes a tick, failure becomes a warning
 * triangle and the control shakes — in all five, because a user must not have to know which
 * variant an admin picked in order to find out that their action failed.
 */
export function IconButton({
  icon,
  altIcon,
  toggled = false,
  status: statusProp,
  onAction,
  className,
  onClick,
  ...rest
}: IconButtonProps) {
  const variant = useElementVariant('E3');
  const motionSafe = useMotionSafe();
  const { t } = useTranslation();
  const shell = useAnimationControls();

  const [auto, setAuto] = useState<IconButtonStatus>('idle');
  const [splashes, setSplashes] = useState<Splash[]>([]);
  const splashId = useRef(0);
  const timers = useRef<number[]>([]);

  const status = statusProp ?? auto;

  // Every timeout this component starts is owned here, so a button that unmounts mid-flight —
  // a row deleted while its own delete is still running — cannot set state on a dead component.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const emit = (x: number | null, y: number | null) => {
    const id = (splashId.current += 1);
    setSplashes((s) => [...s, { id, x, y }]);
    later(() => setSplashes((s) => s.filter((p) => p.id !== id)), DURATION.slow * 1000 + 100);
  };

  /**
   * The physical half of the feedback.
   *
   * Reduced motion collapses the TRAVEL, not the event. By the time this runs the glyph has
   * already been replaced and the colour has already changed — that is the state change, and it
   * survives. What is dropped is the journey, replaced by one instant blink so the moment it
   * happened is still marked for someone watching the icon rather than the whole screen.
   */
  const jolt = (kind: 'bounce' | 'shake') => {
    if (!motionSafe) {
      void shell.start({ opacity: [1, 0.45, 1] }, { duration: DURATION.instant, ease: EASE_STANDARD });
      return;
    }
    if (kind === 'shake') {
      void shell.start(
        { x: [0, -7, 7, -5, 0] },
        { duration: DURATION.base, ease: EASE_STANDARD, times: [0, 0.2, 0.5, 0.75, 1] },
      );
      return;
    }
    void shell.start(
      { scale: [1, 0.82, 1.14, 1], y: [0, 2, -4, 0] },
      { duration: DURATION.slow, ease: EASE_STANDARD, times: [0, 0.22, 0.55, 1] },
    );
  };

  /*
   * Status reactions, driven from the RESOLVED status rather than from the promise callback.
   *
   * That is deliberate: a caller that controls `status` from its own store gets exactly the same
   * shake and the same celebration as one that hands over `onAction`. Two code paths for one
   * behaviour is how the second one ends up half-built.
   *
   * The ref guard is what makes this fire once per transition. `jolt` and `emit` are rebuilt every
   * render and are therefore not dependencies — they would re-fire the animation on every keystroke
   * elsewhere in the tree, which is the exact bug the guard exists to prevent.
   */
  const prevStatus = useRef<IconButtonStatus>('idle');
  useEffect(() => {
    if (status === prevStatus.current) return;
    prevStatus.current = status;
    if (status === 'error') {
      jolt('shake');
      return;
    }
    if (status !== 'success') return;
    // Each variant celebrates in its own language instead of sharing one generic flash.
    if (variant === 'A') jolt('bounce');
    if (variant === 'B' || variant === 'D') emit(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the note above the ref guard
  }, [status, variant]);

  const hold = (next: 'success' | 'error') => {
    setAuto(next);
    later(() => setAuto('idle'), DURATION.ambient * 1000);
  };

  const handle = (e: MouseEvent<HTMLButtonElement>) => {
    if (variant === 'A') jolt('bounce');
    if (variant === 'B') {
      // The ink lands where the finger did. A centred drop is a flash, not ink.
      const r = e.currentTarget.getBoundingClientRect();
      emit(e.clientX - r.left, e.clientY - r.top);
    }
    if (variant === 'D') emit(null, null);

    onClick?.(e);

    if (!onAction) return;
    const result = onAction();
    if (!(result instanceof Promise)) return;
    setAuto('busy');
    void result.then(
      () => hold('success'),
      () => hold('error'),
    );
  };

  // ── The glyph ────────────────────────────────────────────────────────────────────────────────
  // Status outranks the toggle: while an action is in flight or has just failed, what the button
  // is doing matters more than what it is set to.
  const statusGlyph =
    status === 'busy' ? (
      <Loader2 size={20} strokeWidth={2.5} aria-hidden className="animate-spin" />
    ) : status === 'success' ? (
      <Check size={20} strokeWidth={2.75} aria-hidden />
    ) : status === 'error' ? (
      <TriangleAlert size={20} strokeWidth={2.5} aria-hidden />
    ) : null;

  const glyph = statusGlyph ?? (toggled ? (altIcon ?? icon) : icon);
  const glyphKey = status === 'idle' ? (toggled ? 'alt' : 'main') : status;

  /*
   * The announcement. `home.done` is reached across its namespace on purpose — there is no generic
   * "done" in `common`, the i18n bundles are shared by thirteen agents and cannot take a new key
   * here, and a success that only sighted users are told about is exactly the half-built feedback
   * this element is being rebuilt to fix. `common.done` is filed in the report.
   */
  const announcement =
    status === 'busy'
      ? t('common.loading')
      : status === 'success'
        ? t('home.done')
        : status === 'error'
          ? t('common.retry')
          : '';

  // Marks born from a press are accent; once the action has an outcome they carry the outcome.
  const inkClass = status === 'success' ? 'bg-success' : status === 'error' ? 'bg-danger' : 'bg-accent';
  const ringClass =
    status === 'success' ? 'border-success' : status === 'error' ? 'border-danger' : 'border-accent';

  // E fills for the toggle AND for an outcome, so the one variant with no room for a separate mark
  // still reports success and failure.
  const eFilled = variant === 'E' && (toggled || status === 'success' || status === 'error');
  const eFill = status === 'success' ? 'bg-success' : status === 'error' ? 'bg-danger' : 'bg-accent';
  const eFg =
    status === 'success' ? 'text-on-success' : status === 'error' ? 'text-on-danger' : 'text-accent-fg';

  return (
    <motion.span className="relative inline-flex" animate={shell}>
      <Pressable
        {...rest}
        shape="icon"
        // E is a GHOST until it fills — that is the whole variant, and it cannot be read off a
        // control that already carries a border and a surface.
        variant={variant === 'E' ? (rest.variant ?? 'ghost') : rest.variant}
        busy={status === 'busy' || rest.busy}
        onClick={handle}
        className={cn(
          'relative',
          // B is the only variant whose mark is CONTAINED; the rest need to draw past the edge.
          variant === 'B' ? 'overflow-hidden' : 'overflow-visible',
          // A carries "on" in the glyph colour, because its mechanism is motion and motion is gone
          // the moment it finishes — a resting state needs something that stays.
          variant === 'A' && toggled && status === 'idle' && 'text-accent',
          variant === 'E' && !eFilled && 'hover:bg-accent-subtle',
          variant === 'E' && eFilled && eFg,
          variant !== 'E' && status === 'success' && 'text-success',
          variant !== 'E' && status === 'error' && 'text-danger',
          className,
        )}
      >
        {/* E — the accent grows from the centre rather than switching on, so turning it on reads
            as something taking effect rather than as a repaint. */}
        {variant === 'E' ? (
          <motion.span
            aria-hidden
            className={cn('pointer-events-none absolute inset-0 origin-center rounded-chip', eFill)}
            initial={false}
            animate={{ scale: eFilled ? 1 : 0, opacity: eFilled ? 1 : 0 }}
            transition={motionSafe ? SPRING.tight : { duration: 0 }}
          />
        ) : null}

        {/* D — the standing ring: what "on" looks like when nothing is moving. */}
        {variant === 'D' && toggled ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-1 rounded-chip border-2 border-accent"
            initial={motionSafe ? { scale: 0.7, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={motionSafe ? SPRING.tight : { duration: 0 }}
          />
        ) : null}

        {/* B — the dot the ink leaves behind. */}
        {variant === 'B' && toggled ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute bottom-1 size-1.5 rounded-chip bg-accent"
            style={{ left: '50%', translateX: '-50%' }}
            initial={motionSafe ? { scale: 0, y: 4 } : false}
            animate={{ scale: 1, y: 0 }}
            transition={motionSafe ? SPRING.tight : { duration: 0 }}
          />
        ) : null}

        {splashes.map((s) =>
          variant === 'B' ? (
            // B — one drop, from the pointer, spreading until it has flooded the button.
            <motion.span
              key={s.id}
              aria-hidden
              className={cn('pointer-events-none absolute size-2 rounded-chip', inkClass)}
              style={{ left: s.x ?? '50%', top: s.y ?? '50%', translateX: '-50%', translateY: '-50%' }}
              initial={{ scale: 0, opacity: 0.32 }}
              // The flood happens either way — reduced motion only collapses the time it takes.
              animate={{ scale: 16, opacity: 0 }}
              transition={{ duration: motionSafe ? DURATION.slow : 0, ease: EASE_STANDARD }}
            />
          ) : (
            // D — two rings, staggered. One ring is a flash; two read as a pulse, which is the
            // difference between "noticed" and "acknowledged" on an action that matters.
            [0, 0.12].map((delay) => (
              <motion.span
                key={`${s.id}-${delay}`}
                aria-hidden
                className={cn('pointer-events-none absolute inset-0 rounded-chip border-2', ringClass)}
                initial={{ scale: 1, opacity: 0.8 }}
                animate={motionSafe ? { scale: 2.1, opacity: 0 } : { opacity: 0 }}
                transition={{
                  duration: motionSafe ? DURATION.slow : 0,
                  ease: EASE_STANDARD,
                  delay: motionSafe ? delay : 0,
                }}
              />
            ))
          ),
        )}

        <span className="relative inline-flex">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={glyphKey}
              className="inline-flex"
              // C — the glyph is the ENTIRE message, so it turns rather than fades: the button
              // reports what it will do next, and it is the only variant that says so with nothing
              // but the icon. Everywhere else the swap is a plain crossfade, which keeps C's
              // rotation legible as a variant rather than as everyone's default.
              initial={
                motionSafe
                  ? variant === 'C'
                    ? { scale: 0.5, opacity: 0, rotate: -70 }
                    : { opacity: 0 }
                  : false
              }
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={
                motionSafe
                  ? variant === 'C'
                    ? { scale: 0.5, opacity: 0, rotate: 70 }
                    : { opacity: 0 }
                  : undefined
              }
              transition={
                variant === 'C' ? SPRING.tight : { duration: motionSafe ? DURATION.fast : 0, ease: EASE_STANDARD }
              }
            >
              {glyph}
            </motion.span>
          </AnimatePresence>
        </span>
      </Pressable>

      {/* Outside the button on purpose: a live region inside a control that goes `disabled` while
          busy is announced unreliably, and this is the only channel a screen-reader user has for a
          state the sighted user reads off the glyph. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </motion.span>
  );
}
