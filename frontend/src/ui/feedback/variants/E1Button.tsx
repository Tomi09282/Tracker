import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, type TargetAndTransition, type Transition } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable, type PressableProps } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

export interface FeedbackButtonProps extends Omit<PressableProps, 'onClick' | 'busy'> {
  /**
   * An async action. Every variant drives its busy / success / failure state from this promise,
   * so a caller never has to manage "is it running" — or "did it fail" — by hand.
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
 * idle → busy → done | error → idle.
 *
 * ALL FIVE variants run this same machine. What separates them is not whether they report the
 * state — the owner's requirement is that every one of them does, with a glyph rather than a tint
 * — but HOW the report arrives: a spring, a wave of ink, a pass of light, a filling bar, or a
 * sliding badge. Same information, five different physics.
 */
type Status = 'idle' | 'busy' | 'done' | 'error';

/**
 * The duration tokens, in the seconds Motion wants.
 *
 * Same reasoning as `EASE_STANDARD` in `useMotionSafe`: `check-tokens` cannot see a number, so
 * `0.25` had been retyped at every call site in this file and would eventually drift from
 * `--duration-base`. One table, named after the tokens it mirrors.
 */
const D = { instant: 0.1, fast: 0.15, base: 0.25, slow: 0.4, ambient: 1.2 };

/** How long a success sits on screen before the button goes back to being a button. */
const DWELL_DONE = 1400;
/**
 * A failure dwells nearly twice as long. Success confirms something the user already expected;
 * a failure asks them to look and decide, and it must not have vanished by the time they do.
 */
const DWELL_ERROR = 2600;

/**
 * The leading slot — the owner's requirement, in one place.
 *
 * Busy, success and failure change the GLYPH, not only the colour: a spinner, a tick, a warning
 * triangle. Colour alone fails for the ~8% of men who cannot separate the success green from the
 * failure red, and it fails for everyone in bright sunlight, which is where a gym app lives.
 *
 * The slot is a fixed 20px box so the swap cannot reflow the label, and the glyphs cross-fade
 * through `mode="wait"` so two are never on screen at once.
 */
function StatusSlot({
  status,
  idleIcon,
  motionSafe,
  enter,
  exit,
  transition,
  className,
}: {
  status: Status;
  idleIcon?: ReactNode;
  motionSafe: boolean;
  enter: TargetAndTransition;
  exit: TargetAndTransition;
  transition: Transition;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex size-5 shrink-0 items-center justify-center', className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={status}
          className="absolute inset-0 flex items-center justify-center"
          // Reduced motion collapses the travel, never the swap: the glyph still changes, it
          // simply arrives instead of flying in.
          initial={motionSafe ? enter : false}
          animate={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
          exit={motionSafe ? exit : { opacity: 0 }}
          transition={transition}
        >
          {status === 'busy' ? (
            <Loader2
              size={20}
              strokeWidth={2.5}
              aria-hidden
              // The spinner is the only glyph whose meaning IS motion. With motion off it stays
              // as a static distinct mark rather than becoming a lie about progress.
              className={motionSafe ? 'animate-spin' : undefined}
            />
          ) : status === 'done' ? (
            <Check size={20} strokeWidth={2.5} aria-hidden />
          ) : status === 'error' ? (
            <TriangleAlert size={20} strokeWidth={2.5} aria-hidden />
          ) : (
            idleIcon
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
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
export function FeedbackButton({ onAction, onClick, children, className, icon, ...rest }: FeedbackButtonProps) {
  const variant = useElementVariant('E1');
  const motionSafe = useMotionSafe();
  const { t } = useTranslation();

  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const rippleId = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A button that unmounts mid-action must not drag its dwell timer along with it.
  useEffect(() => () => clearTimeout(settle.current), []);

  const busy = status === 'busy';

  const run = async (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (!onAction) return;

    // The wave starts where the finger actually landed, not at the centre — that is the whole
    // point of a ripple, and a centred one reads as a generic flash. B needs the point twice:
    // once for the press ink, once for the outcome wave that follows it out of the same spot.
    const r = e.currentTarget.getBoundingClientRect();
    const point = { x: e.clientX - r.left, y: e.clientY - r.top };
    setOrigin(point);
    if (variant === 'B') {
      const id = (rippleId.current += 1);
      setRipples((prev) => [...prev, { id, ...point }]);
      setTimeout(() => setRipples((prev) => prev.filter((p) => p.id !== id)), 500);
    }

    // A second run cancels the previous outcome's dwell, so a quick retry does not inherit the
    // old timer and clear itself early.
    clearTimeout(settle.current);
    setStatus('busy');
    setProgress(0);
    // Real progress is unknowable for an arbitrary promise, so this creeps toward 90% and lets
    // completion carry it home. It never claims 100% before the work is actually done. Only D
    // draws it, so only D pays for a timer that re-renders sixteen times a second.
    const tick =
      variant === 'D' ? setInterval(() => setProgress((p) => Math.min(90, p + 7)), 60) : undefined;

    try {
      await onAction();
      setProgress(100);
      setStatus('done');
      settle.current = setTimeout(() => {
        setStatus('idle');
        setProgress(0);
      }, DWELL_DONE);
    } catch {
      /*
       * The rejection is SWALLOWED on purpose, and this is the one place in the file that needs
       * defending.
       *
       * Before this, `await onAction()` sat in a `try/finally` with no `catch`: a failing action
       * produced an unhandled promise rejection, the button snapped back to idle, and the user
       * was shown a control that had just quietly done nothing. Rethrowing here would restore
       * exactly that — there is no caller to catch it, because the click handler IS the top of
       * the stack.
       *
       * So the button reports the failure itself: warning glyph, failure colour, and a dwell long
       * enough to read. `title` becomes "try again", because at that moment pressing again is the
       * whole of what the user can do.
       */
      setProgress(100);
      setStatus('error');
      settle.current = setTimeout(() => {
        setStatus('idle');
        setProgress(0);
      }, DWELL_ERROR);
    } finally {
      clearInterval(tick);
    }
  };

  /**
   * The state carried as text for anyone not looking at the glyph.
   *
   * `aria-busy` on the primitive already announces the busy phase, so this exists for the two
   * outcomes. There is no `common.done` / `common.failed` in the bundles and this file may not add
   * one, so success is left to the tick and `aria-busy` clearing, and failure — the outcome that
   * changes what the user must do next — borrows the key that names that next step.
   */
  const liveText = status === 'error' ? t('common.retry') : '';

  /** Idle needs no slot unless the caller gave us an icon; a state always needs one. */
  const showSlot = Boolean(icon) || status !== 'idle';

  const base = cn('relative overflow-hidden', className);
  const shared = {
    ...rest,
    onClick: run,
    // A tooltip only while it means something; otherwise the caller's own title survives.
    title: status === 'error' ? t('common.retry') : rest.title,
  };

  /**
   * The whole-surface state colour. A and C use it (they deliver the colour to the surface); B, D
   * and E deliberately do not, because their whole idea is that the colour arrives on something
   * else — a wave, a bar, a badge.
   */
  const surfaceTone =
    status === 'done'
      ? 'border-transparent bg-success text-on-success'
      : status === 'error'
        ? 'border-transparent bg-danger text-on-danger'
        : '';

  let body: ReactNode;

  if (variant === 'B') {
    /*
     * B — Ripple. Ink.
     *
     * The press throws a soft accent wave from the contact point; the OUTCOME throws a second one
     * from the same point, in the state colour, and that one does not fade — it expands until it
     * has flooded the button and holds there for the dwell. The colour is not applied to the
     * button, it travels across it, and it travels from where the user touched.
     */
    body = (
      <Pressable {...shared} busy={busy} className={base}>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            aria-hidden
            className="pointer-events-none absolute rounded-chip bg-accent-subtle"
            style={{ left: r.x, top: r.y, translateX: '-50%', translateY: '-50%' }}
            initial={{ width: 0, height: 0, opacity: 0.6 }}
            animate={motionSafe ? { width: 240, height: 240, opacity: 0 } : { opacity: 0 }}
            transition={{ duration: motionSafe ? D.slow : 0 }}
          />
        ))}

        {status === 'done' || status === 'error' ? (
          <motion.span
            key={status}
            aria-hidden
            className={cn(
              'pointer-events-none absolute rounded-chip',
              status === 'done' ? 'bg-success' : 'bg-danger',
            )}
            style={{ left: origin.x, top: origin.y, translateX: '-50%', translateY: '-50%' }}
            // With motion off the flood is already there: the state change is not lost, only the
            // journey is.
            initial={motionSafe ? { width: 0, height: 0, opacity: 0.9 } : false}
            animate={{ width: 640, height: 640, opacity: 1 }}
            transition={{ duration: motionSafe ? D.slow : 0, ease: EASE_STANDARD }}
          />
        ) : null}

        <span
          className={cn(
            'relative inline-flex items-center gap-2',
            status === 'done' && 'text-on-success',
            status === 'error' && 'text-on-danger',
          )}
        >
          {showSlot ? (
            <StatusSlot
              status={status}
              idleIcon={icon}
              motionSafe={motionSafe}
              enter={{ scale: 0.6, opacity: 0 }}
              exit={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: motionSafe ? D.base : 0, ease: EASE_STANDARD }}
            />
          ) : null}
          {children}
        </span>
      </Pressable>
    );
  } else if (variant === 'C') {
    /*
     * C — Sheen-sweep. Light.
     *
     * Hover sends a band of light across the face, and the sweep pauses while pressed so the
     * press still reads. The state extends that one idea rather than bolting a different one on:
     * BUSY sets the band looping — the only variant in the set that animates continuously, so
     * "still working" is legible from across the room — and an outcome fires a single fast pass in
     * the state colour, which is what paints the surface.
     */
    body = (
      <Pressable {...shared} busy={busy} className={cn(base, 'group', surfaceTone)}>
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

        {motionSafe && busy ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent,var(--accent-subtle),transparent)]"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            // A loop, not a transition — `--duration-ambient` is the token that exists for exactly
            // this, and linear because a repeating sweep with an eased curve visibly stutters at
            // the seam.
            transition={{ duration: D.ambient, ease: 'linear', repeat: Infinity }}
          />
        ) : null}

        {motionSafe && (status === 'done' || status === 'error') ? (
          <motion.span
            key={status}
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0',
              status === 'done'
                ? 'bg-[linear-gradient(100deg,transparent,var(--success),transparent)]'
                : 'bg-[linear-gradient(100deg,transparent,var(--danger),transparent)]',
            )}
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: D.base, ease: EASE_STANDARD }}
          />
        ) : null}

        <span className="relative inline-flex items-center gap-2">
          {showSlot ? (
            <StatusSlot
              status={status}
              idleIcon={icon}
              motionSafe={motionSafe}
              // The glyph is revealed by the light rather than moved by it: it blooms in place.
              enter={{ scale: 1.35, opacity: 0 }}
              exit={{ scale: 0.75, opacity: 0 }}
              transition={{ duration: motionSafe ? D.fast : 0, ease: EASE_STANDARD }}
            />
          ) : null}
          {children}
        </span>
      </Pressable>
    );
  } else if (variant === 'D') {
    /*
     * D — Morph-to-progress. The button becomes the indicator.
     *
     * The feedback appears exactly where the user's attention already is, and the bar reports the
     * ending as well as the middle: it completes green on success and completes RED on failure,
     * which is how a real progress bar says "this attempt is over and it did not work". The glyph
     * rides the bar vertically, like a readout rolling over.
     *
     * The label sits in the same relative wrapper as the glyph. It has to: the fill is absolutely
     * positioned, so anything statically positioned beside it — the icon used to be — paints
     * underneath and disappears the moment the bar reaches it.
     */
    const barTone =
      status === 'done' ? 'bg-success' : status === 'error' ? 'bg-danger' : 'bg-accent-pressed';

    body = (
      <Pressable {...shared} busy={busy} className={base}>
        {status !== 'idle' ? (
          <motion.span
            aria-hidden
            className={cn('absolute inset-y-0 left-0', barTone)}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={motionSafe ? { duration: D.base, ease: EASE_STANDARD } : { duration: 0 }}
          />
        ) : null}

        <span
          className={cn(
            'relative inline-flex items-center gap-2',
            status === 'done' && 'text-on-success',
            status === 'error' && 'text-on-danger',
          )}
        >
          {showSlot ? (
            <StatusSlot
              status={status}
              idleIcon={icon}
              motionSafe={motionSafe}
              enter={{ y: 12, opacity: 0 }}
              exit={{ y: -12, opacity: 0 }}
              transition={SPRING.tight}
            />
          ) : null}
          {children}
        </span>
      </Pressable>
    );
  } else if (variant === 'E') {
    /*
     * E — Icon-slide. Travel.
     *
     * Everything in this variant moves along one axis. Idle: the leading icon leans forward on
     * hover while the label stays put. In a state: the slot becomes a solid badge in the state
     * colour and the glyphs slide THROUGH it — the old one leaves to the right, the new one
     * enters from the left — while the label steps aside to make room.
     *
     * The badge is why E does not tint the whole button: the state arrives as an object that
     * moves into place, not as a surface that changes.
     */
    const badgeTone =
      status === 'done'
        ? 'bg-success text-on-success'
        : status === 'error'
          ? 'bg-danger text-on-danger'
          : status === 'busy'
            ? 'bg-accent-subtle text-on-accent-subtle'
            : '';

    body = (
      <Pressable
        {...shared}
        busy={busy}
        className={cn(base, 'group')}
        icon={
          showSlot ? (
            <StatusSlot
              status={status}
              idleIcon={icon}
              motionSafe={motionSafe}
              enter={{ x: -14, opacity: 0 }}
              exit={{ x: 14, opacity: 0 }}
              transition={{ duration: motionSafe ? D.fast : 0, ease: EASE_STANDARD }}
              className={cn(
                'size-7 rounded-chip',
                'transition-[transform,background-color,color]',
                'duration-[var(--duration-base)] ease-[var(--ease-standard)]',
                badgeTone,
                status === 'idle' && 'group-hover:translate-x-1',
              )}
            />
          ) : undefined
        }
      >
        <motion.span
          className="inline-flex"
          // The label gives the badge its room. 4px: on the grid, and enough to read as a step.
          animate={{ x: motionSafe && status !== 'idle' ? 4 : 0 }}
          transition={{ duration: motionSafe ? D.base : 0, ease: EASE_STANDARD }}
        >
          {children}
        </motion.span>
      </Pressable>
    );
  } else {
    /*
     * A — Press-spring. Physics.
     *
     * The `control` recipe already scales to 0.97 on :active with a 100ms tween. That is a
     * response, not a feel — it goes down and comes back the same way. Here the press is a real
     * under-damped spring (`SPRING.soft`, damping 17), so the release OVERSHOOTS and settles, and
     * the two compose: 0.94 on top of the recipe's 0.97 is a press you can see from a metre away.
     *
     * The states are the same physics. Success pops the button past its own size and back; failure
     * shakes it, which is the one motion in this product that means "no" without a word. The glyph
     * springs in with a twist, so the outcome is legible even standing still.
     */
    const springTween: Transition = { duration: motionSafe ? D.base : 0, ease: EASE_STANDARD };

    body = (
      <motion.span
        className="inline-flex"
        whileTap={motionSafe ? { scale: 0.94, transition: SPRING.soft } : undefined}
        animate={
          motionSafe && status === 'error'
            ? { x: [0, -7, 7, -5, 5, 0], scale: 1, transition: springTween }
            : motionSafe && status === 'done'
              ? { x: 0, scale: [1, 1.07, 1], transition: springTween }
              : { x: 0, scale: 1 }
        }
        // The fallback transition — what the release springs back through.
        transition={motionSafe ? SPRING.soft : { duration: 0 }}
      >
        <Pressable
          {...shared}
          busy={busy}
          className={cn(base, surfaceTone)}
          icon={
            showSlot ? (
              <StatusSlot
                status={status}
                idleIcon={icon}
                motionSafe={motionSafe}
                enter={{ scale: 0.4, rotate: -25, opacity: 0 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={motionSafe ? SPRING.tight : { duration: 0 }}
              />
            ) : undefined
          }
        >
          {children}
        </Pressable>
      </motion.span>
    );
  }

  return (
    <span className="relative inline-flex">
      {body}
      {/*
        Outside the button on purpose. E2 puts its live region inside the Pressable, which appends
        the announcement to the button's own accessible NAME — a screen reader then reads
        "Save try again" as the label. A sibling announces without renaming.
      */}
      <span aria-live="polite" className="sr-only">
        {liveText}
      </span>
    </span>
  );
}
