import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useAnimationControls } from 'motion/react';
import { Copy, Check, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

/**
 * What a copy can actually be doing.
 *
 * The previous version had one boolean, `copied`, which could express exactly one of the three
 * things that happen at this button — and not the two that matter most when something goes wrong.
 * A clipboard write can be REFUSED (denied permission, insecure context, no `navigator.clipboard`
 * at all) and it can be SLOW (Firefox and Safari may put a permission prompt in front of it).
 * Neither had any representation on screen: the catch block returned and the button sat there
 * looking untouched, which the user reads as "my press did not register", not as "it failed".
 */
type Status = 'idle' | 'busy' | 'done' | 'error';

/**
 * `--duration-*`, in the seconds Motion wants.
 *
 * Exactly the reason `EASE_STANDARD` lives beside `SPRING`: a JS-driven tween cannot read a CSS
 * custom property, and a number retyped per call site is how a duration drifts away from the scale.
 * Anything expressible as a class still goes through `duration-[var(--duration-*)]`.
 */
const DUR = { fast: 0.15, base: 0.25, slow: 0.4 } as const;

/** How long a finished state stays up before the button returns to idle. */
const HOLD_MS = 2000;
/** A failure holds longer than a success: the user has to read it and decide to press again. */
const ERROR_HOLD_MS = 3200;
/**
 * A clipboard write normally resolves within a frame or two, and a spinner shown for 8ms is a
 * flicker rather than information. So the busy state is not fired on principle every press — it
 * waits to find out whether this is one of the slow cases, and only then takes over the glyph.
 */
const BUSY_AFTER_MS = 120;

/**
 * How a variant swaps one glyph for another.
 *
 * The owner's requirement is that state changes the ICON and not merely the colour, so all five
 * variants swap the glyph — and the swap itself is one of the things that tells them apart. Each
 * preset is a different physical idea, not a different number of pixels.
 */
const SWAP = {
  /** A — the glyph turns over on its own axis, like a coin. This IS variant A's identity. */
  flip: {
    initial: { rotateY: -90, opacity: 0, transformPerspective: 600 },
    animate: { rotateY: 0, opacity: 1, transformPerspective: 600 },
    exit: { rotateY: 90, opacity: 0, transformPerspective: 600 },
  },
  /** B, C, E — a plain pop, because in those variants the glyph is the supporting act. */
  pop: {
    initial: { scale: 0.4, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.4, opacity: 0 },
  },
  /** D — pushed up out of the slot as the fill sweeps underneath it. */
  rise: {
    initial: { y: 12, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -12, opacity: 0 },
  },
} satisfies Record<string, { initial: Record<string, number>; animate: Record<string, number>; exit: Record<string, number> }>;

type Swap = (typeof SWAP)[keyof typeof SWAP];

/**
 * C — the burst. Ten pieces, two tones, each with its own rotation, so it reads as confetti and
 * not as six identical dots leaving on the same vector.
 */
const CONFETTI = [
  { x: -26, y: -18, size: 1.2, spin: -140, tone: 'bg-success' },
  { x: -12, y: -28, size: 0.9, spin: 90, tone: 'bg-accent' },
  { x: 2, y: -32, size: 1.3, spin: 160, tone: 'bg-success' },
  { x: 16, y: -26, size: 0.8, spin: -60, tone: 'bg-accent' },
  { x: 28, y: -14, size: 1.1, spin: 120, tone: 'bg-success' },
  { x: -30, y: 2, size: 0.9, spin: 70, tone: 'bg-accent' },
  { x: 30, y: 4, size: 1.0, spin: -100, tone: 'bg-accent' },
  { x: -18, y: 18, size: 1.2, spin: 150, tone: 'bg-success' },
  { x: 0, y: 24, size: 0.8, spin: -80, tone: 'bg-accent' },
  { x: 18, y: 20, size: 1.1, spin: 110, tone: 'bg-success' },
];

/** C — the failure answer to the burst: three pieces that drop instead of flying. A dud. */
const FIZZLE = [
  { x: -10, size: 1 },
  { x: 0, size: 1.2 },
  { x: 10, size: 0.9 },
];

/**
 * The glyph, and the whole of the owner's "change the icon, not only the colour" requirement.
 *
 * Copy → spinner → tick, or Copy → spinner → warning triangle. The colour follows the glyph rather
 * than carrying the message alone, which also means the state survives a monochrome theme and a
 * colour-blind user.
 *
 * `pulse` is in the key on purpose: pressing a second time while the tick is still up leaves
 * `status` at `done`, and without the counter React would keep the existing node and play nothing.
 * A second press that produces no answer is exactly the failure this element exists to prevent.
 */
function StatusGlyph({
  status,
  pulse,
  swap,
  motionSafe,
}: {
  status: Status;
  pulse: number;
  swap: Swap;
  motionSafe: boolean;
}) {
  const glyph =
    status === 'busy' ? (
      <Loader2 size={20} strokeWidth={2} className="animate-spin" aria-hidden />
    ) : status === 'done' ? (
      <Check size={20} strokeWidth={2.5} aria-hidden />
    ) : status === 'error' ? (
      <TriangleAlert size={20} strokeWidth={2.5} aria-hidden />
    ) : (
      <Copy size={20} strokeWidth={2} aria-hidden />
    );

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={`${status}:${pulse}`}
        className="inline-flex"
        // Reduced motion collapses the TRAVEL, never the swap: the glyph still becomes a tick or a
        // triangle, it simply arrives instead of turning.
        initial={motionSafe ? swap.initial : false}
        animate={swap.animate}
        exit={motionSafe ? swap.exit : undefined}
        transition={SPRING.tight}
      >
        {glyph}
      </motion.span>
    </AnimatePresence>
  );
}

/**
 * E2 — Copy button, all five variants.
 *
 * This is the element the owner named specifically: copy should turn into an animated green
 * check. It is a small thing that tells the user the clipboard actually received the value,
 * which is otherwise completely invisible.
 *
 * ═══ WHAT SEPARATES THE FIVE ═══════════════════════════════════════════════════════════════════
 *
 *   A  the GLYPH is the whole event — it flips over in place, chrome barely moves
 *   B  a tooltip BUBBLE says it, above the button, with a caret and a word
 *   C  the button THROWS something — confetti on success, a dud that falls on failure
 *   D  the SURFACE fills — a colour wipes across the button and, on success, straight out again
 *   E  it COUNTS — a badge that rolls its digit, and refuses to count a copy that did not happen
 *
 * All five swap the glyph and all five shake on failure, because those two are requirements
 * rather than decoration. Everything above that line is the variant's own idea.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const variant = useElementVariant('E2');
  const motionSafe = useMotionSafe();
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('idle');
  const [count, setCount] = useState(0);
  /** Bumped every time an attempt SETTLES, so a repeat press replays its variant's animation. */
  const [pulse, setPulse] = useState(0);
  const shake = useAnimationControls();
  const kick = useAnimationControls();
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  // A pending "back to idle" that fires after the component is gone is a state update into
  // nothing. Cheap to prevent, and it also stops a stale reset from cancelling a fresh copy.
  useEffect(() => clearTimers, []);

  const copy = async () => {
    clearTimers();
    later(() => setStatus('busy'), BUSY_AFTER_MS);

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be denied, and on a page served over plain HTTP `navigator.clipboard`
      // does not exist at all. Still show the confirmation only if it succeeded — lying about a
      // copy is worse than no feedback. What is NEW here is that the failure is no longer silent:
      // the button says no, in the same place it would have said yes.
      clearTimers();
      setStatus('error');
      setPulse((p) => p + 1);
      shake.start(
        motionSafe
          ? { x: [0, -6, 6, -5, 4, 0], transition: { duration: DUR.slow, ease: EASE_STANDARD } }
          : { x: 0, transition: { duration: 0 } },
      );
      later(() => setStatus('idle'), ERROR_HOLD_MS);
      return;
    }

    clearTimers();
    setStatus('done');
    // Only a real write counts. Variant E's badge would otherwise be a tally of presses, which is
    // not what the number claims to be.
    setCount((c) => c + 1);
    setPulse((p) => p + 1);
    // Guarded: `start()` on controls no mounted component has subscribed to is a framer-motion
    // invariant, and only variant C renders the element this drives.
    if (variant === 'C') {
      kick.start(
        motionSafe
          ? { scale: [1, 1.35, 1], transition: { duration: DUR.base, ease: EASE_STANDARD } }
          : { scale: 1, transition: { duration: 0 } },
      );
    }
    later(() => setStatus('idle'), HOLD_MS);
  };

  const done = status === 'done';
  const failed = status === 'error';
  const busy = status === 'busy';

  /**
   * The two live regions.
   *
   * Success is polite — it can wait for a gap in speech. Failure is an `alert`, because a screen
   * reader user who is told nothing will paste an old clipboard value and never find out why.
   * Both regions exist from the first render: a region inserted at the same moment as its text is
   * frequently not announced at all.
   */
  const announcement = (
    <>
      <span aria-live="polite" className="sr-only">
        {done ? label : ''}
      </span>
      <span role="alert" className="sr-only">
        {failed ? t('common.retry') : ''}
      </span>
    </>
  );

  const glyph = (swap: Swap) => (
    <StatusGlyph status={status} pulse={pulse} swap={swap} motionSafe={motionSafe} />
  );

  /**
   * The shake, applied by every variant.
   *
   * Driven by controls rather than by a changing `key`, because remounting the subtree to replay an
   * animation also destroys the button — and a keyboard user who just pressed Enter would lose
   * focus to the body at the exact moment they are told something went wrong.
   */
  const withShake = (node: ReactNode) => (
    <motion.span className="relative inline-flex" animate={shake}>
      {node}
    </motion.span>
  );

  // ── D — fill-wipe ───────────────────────────────────────────────────────────────────────────
  // The surface answers, not the glyph. A solid colour sweeps in from the left; on SUCCESS it
  // carries on out to the right when the hold expires, and on FAILURE it retreats back the way it
  // came. Those two exits are the point — one gesture completes, the other is refused.
  if (variant === 'D') {
    return withShake(
      <Pressable
        onClick={copy}
        aria-label={label}
        busy={busy}
        className="relative overflow-hidden"
      >
        <AnimatePresence initial={false}>
          {done || failed ? (
            <motion.span
              key={`${status}:${pulse}`}
              aria-hidden
              className={cn('absolute inset-0', failed ? 'bg-danger' : 'bg-success')}
              initial={motionSafe ? { x: '-100%' } : false}
              animate={{ x: '0%' }}
              exit={motionSafe ? { x: failed ? '-100%' : '100%' } : undefined}
              transition={{ duration: motionSafe ? DUR.base : 0, ease: EASE_STANDARD }}
            />
          ) : null}
        </AnimatePresence>
        <span
          className={cn(
            'relative',
            done && 'text-on-success',
            failed && 'text-on-danger',
            busy && 'text-text-2',
          )}
        >
          {glyph(SWAP.rise)}
        </span>
        {announcement}
      </Pressable>,
    );
  }

  // ── C — mini-confetti ───────────────────────────────────────────────────────────────────────
  // The only variant that throws something. Ten pieces in two tones fly out and spin on success;
  // on failure three pieces fall straight down and die, which reads as a dud without needing a
  // word for it. The glyph also gets a scale kick that no other variant has.
  if (variant === 'C') {
    return withShake(
      <Pressable
        onClick={copy}
        aria-label={label}
        busy={busy}
        className={cn('relative', done && 'text-success', failed && 'text-danger')}
      >
        {/* Particles are pure travel: with reduced motion on there is nothing left of them to
            collapse, so they are skipped and the glyph swap carries the state change alone. */}
        {motionSafe && done
          ? CONFETTI.map((p, i) => (
              <motion.span
                key={`${pulse}:${i}`}
                aria-hidden
                className={cn('pointer-events-none absolute left-1/2 top-1/2 size-1.5 rounded-chip', p.tone)}
                initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
                animate={{
                  x: p.x,
                  y: p.y,
                  scale: [0, p.size, p.size * 0.5],
                  opacity: [1, 1, 0],
                  rotate: p.spin,
                }}
                transition={{ duration: DUR.slow, ease: EASE_STANDARD, delay: i * 0.02 }}
              />
            ))
          : null}
        {motionSafe && failed
          ? FIZZLE.map((p, i) => (
              <motion.span
                key={`${pulse}:${i}`}
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 size-1.5 rounded-chip bg-danger"
                initial={{ x: p.x, y: -6, scale: p.size, opacity: 1 }}
                animate={{ y: 20, scale: p.size * 0.4, opacity: 0 }}
                transition={{ duration: DUR.base, ease: EASE_STANDARD, delay: i * 0.04 }}
              />
            ))
          : null}
        {/* The kick runs from controls rather than from a changing `key`: remounting this span
            would remount the AnimatePresence inside it, and an AnimatePresence that has just
            mounted plays nothing — the tick would appear without its pop, on every copy. */}
        <motion.span className="relative inline-flex" animate={kick}>
          {glyph(SWAP.pop)}
        </motion.span>
        {announcement}
      </Pressable>,
    );
  }

  // ── B — check + tooltip pop ─────────────────────────────────────────────────────────────────
  // The bubble is the variant. It springs up above the button with a caret, carries its own glyph
  // and a word, and turns danger-coloured with `Try again` when the write is refused — the only
  // variant that puts the failure into language rather than into a colour.
  if (variant === 'B') {
    return withShake(
      <span className="relative inline-flex">
        <Pressable
          onClick={copy}
          aria-label={label}
          busy={busy}
          className={cn(done && 'text-success', failed && 'text-danger')}
        >
          {glyph(SWAP.pop)}
        </Pressable>
        <AnimatePresence>
          {done || failed ? (
            <motion.span
              key={`${status}:${pulse}`}
              aria-hidden
              className={cn(
                'pointer-events-none absolute -top-10 left-1/2 z-10 flex items-center gap-1',
                'whitespace-nowrap rounded-field px-2 py-1 text-caption',
                failed ? 'bg-danger text-on-danger' : 'bg-success text-on-success',
              )}
              initial={motionSafe ? { scale: 0.7, y: 8, opacity: 0, x: '-50%' } : { x: '-50%' }}
              animate={{ scale: 1, y: 0, opacity: 1, x: '-50%' }}
              exit={motionSafe ? { scale: 0.7, y: 8, opacity: 0, x: '-50%' } : undefined}
              transition={SPRING.tight}
            >
              {failed ? (
                <TriangleAlert size={14} strokeWidth={2.5} aria-hidden />
              ) : (
                <Check size={14} strokeWidth={2.5} aria-hidden />
              )}
              {failed ? t('common.retry') : label}
              {/* The caret. A bubble without one floats; with one it points at what it is about. */}
              <span
                aria-hidden
                className={cn(
                  'absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 rounded-chip',
                  failed ? 'bg-danger' : 'bg-success',
                )}
              />
            </motion.span>
          ) : null}
        </AnimatePresence>
        {announcement}
      </span>,
    );
  }

  // ── E — count badge ─────────────────────────────────────────────────────────────────────────
  // The only variant that remembers. The badge rolls like an odometer — the old digit leaves
  // upward while the new one arrives from below — and a refused copy does NOT increment it: the
  // badge shows a warning in its place for the duration of the error, then the old number returns.
  // A counter that counted failures would be a number that means nothing.
  if (variant === 'E') {
    return withShake(
      <span className="relative inline-flex">
        <Pressable
          onClick={copy}
          aria-label={label}
          busy={busy}
          className={cn(done && 'text-success', failed && 'text-danger')}
        >
          {glyph(SWAP.pop)}
        </Pressable>
        <AnimatePresence initial={false}>
          {failed ? (
            <motion.span
              key={`err:${pulse}`}
              aria-hidden
              className={cn(
                'pointer-events-none absolute -right-1 -top-1 inline-flex items-center justify-center',
                'rounded-chip bg-danger px-1 py-0.5 text-on-danger',
              )}
              initial={motionSafe ? { scale: 0, y: 4 } : false}
              animate={{ scale: 1, y: 0 }}
              exit={motionSafe ? { scale: 0, opacity: 0 } : undefined}
              transition={SPRING.tight}
            >
              <TriangleAlert size={12} strokeWidth={2.5} aria-hidden />
            </motion.span>
          ) : count > 0 ? (
            <motion.span
              key={count}
              aria-hidden
              className={cn(
                'pointer-events-none absolute -right-1 -top-1 min-w-4 text-center',
                'rounded-chip bg-accent px-1.5 text-micro tabular-nums text-accent-fg',
              )}
              initial={motionSafe ? { scale: 0.4, y: 10, opacity: 0 } : false}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={motionSafe ? { y: -10, opacity: 0 } : undefined}
              transition={SPRING.tight}
            >
              {count}
            </motion.span>
          ) : null}
        </AnimatePresence>
        {announcement}
      </span>,
    );
  }

  // ── A — copy→check morph ────────────────────────────────────────────────────────────────────
  // The default, and the quietest: no bubble, no particles, no badge, nothing leaves the button's
  // own footprint. The glyph turns over on its axis — genuinely a morph rather than a cross-fade —
  // and the chrome only tints behind it. This is the variant for a screen that is already busy.
  return withShake(
    <Pressable
      onClick={copy}
      aria-label={label}
      busy={busy}
      className={cn(
        'transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        done && 'border-success-border bg-success-subtle text-success',
        failed && 'border-danger-border bg-danger-subtle text-danger',
      )}
    >
      {glyph(SWAP.flip)}
      {announcement}
    </Pressable>,
  );
}
