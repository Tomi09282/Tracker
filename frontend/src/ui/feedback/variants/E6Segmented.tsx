import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  /**
   * Commit the selection.
   *
   * MAY return a promise, and the control reads it: while it is pending the segment becomes a
   * spinner, a resolve turns it into a tick, a reject turns it into a warning glyph and shakes.
   * A caller that changes state synchronously simply returns nothing and gets the tick flash —
   * which is the same grammar, only shorter.
   */
  onChange: (next: T) => void | Promise<unknown>;
  label: string;
  /**
   * The choice is settled and cannot be changed. NOT the same as disabled.
   *
   * A post's kind is frozen after creation, and the editor answered that by deleting the control
   * and printing a sentence instead — so the reader loses the one picture that says "three kinds
   * exist and yours is the middle one". The mockup keeps the control and shows the answer in it.
   *
   * `readOnly` rather than `disabled` because the two say different things to everybody. A
   * disabled control is greyed and skipped by the keyboard, which reads as "broken, or you lack
   * permission"; a read-only one keeps its contrast, keeps its place in the tab order, and is
   * announced as read-only — "this is the answer, and it is final". `aria-disabled` marks it
   * without removing it, which is the ARIA idiom for exactly this distinction.
   */
  readOnly?: boolean;
}

type Phase = 'busy' | 'done' | 'failed';

/** How long the tick holds before the segment goes back to being a label. */
const DONE_MS = 900;
/**
 * A failure holds nearly three times as long. It is the only signal that the selection did NOT
 * take — the value never moved — so it has to survive being glanced at.
 */
const FAILED_MS = 2400;
/** Per-segment stagger of the E cascade, in seconds (Motion's unit, unlike CSS). */
const CASCADE_STEP = 0.07;

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return typeof v === 'object' && v !== null && typeof (v as PromiseLike<unknown>).then === 'function';
}

/**
 * E6 — Segmented control, all five variants.
 *
 * Rendered as a real radiogroup: arrow keys move between options with a roving tabindex (one tab
 * stop for the whole group, which is what a radiogroup is), and a screen reader announces
 * "3 of 5 selected" rather than reading five unrelated buttons.
 *
 * ═══ THE FIVE ARE FIVE DIFFERENT MECHANISMS, NOT FIVE TUNINGS OF ONE ══════════════════════════
 *
 *   A  Sliding-thumb   a filled accent pill TRAVELS between segments (shared `layoutId`), with a
 *                      second, softer-sprung pill behind it that lags and reads as a wake. The
 *                      movement is what tells the eye where the selection went.
 *   B  Underline-sweep no track and no fill: a text bar with a rule under it, and an accent
 *                      underline that sweeps across on a soft spring, overshooting slightly.
 *   C  Scale-elevate   nothing travels. The chosen segment RISES — a surface-3 chip with a border
 *                      and an overlay shadow springs up inside a recessed surface-1 track, the
 *                      segment scales up, and the others recede in opacity.
 *   D  Icon-bounce     no track, no pill, no fill. The glyph carries the whole state: it hops and
 *                      grows on selection. Options with no icon get a dot so the bounce always
 *                      has something to happen to.
 *   E  Fill-cascade    the accent fill GROWS from the edge you came from, and a wash runs outward
 *                      across every neighbouring segment in sequence, so a change reads as one
 *                      gesture across the control rather than five independent flickers.
 *
 * ═══ AND ALL FIVE CHANGE THE GLYPH, NOT ONLY THE COLOUR ═══════════════════════════════════════
 *
 * A colour change says "something is different". A glyph change says WHAT. Every variant shares
 * one status layer: busy → spinner, committed → tick, rejected → warning triangle plus a shake,
 * over the segment's own content. Under reduced motion the glyph still swaps and the segment
 * still elevates/fills — only the travel collapses to zero duration, because the user still has
 * to learn that the thing happened.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  readOnly = false,
}: SegmentedProps<T>) {
  const variant = useElementVariant('E6');
  const motionSafe = useMotionSafe();
  const { t } = useTranslation();
  const groupId = useId();

  const [status, setStatus] = useState<{ value: T; phase: Phase } | null>(null);
  /** `n` re-keys the E wave so it replays; `dir` is which way the fill grows from. */
  const [cascade, setCascade] = useState<{ n: number; dir: 1 | -1 }>({ n: 0, dir: 1 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Which commit is allowed to write a status.
   *
   * Two clicks in a row leave two promises in flight, and the slower one is not necessarily the
   * older one — without this, a stale resolve paints a tick over the segment the user has since
   * moved away from.
   */
  const ticket = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const activeIndex = options.findIndex((o) => o.value === value);
  const fromIndex = activeIndex === -1 ? 0 : activeIndex;

  const hold = (next: T, phase: Phase, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus({ value: next, phase });
    timer.current = setTimeout(() => setStatus(null), ms);
  };

  const select = (next: T) => {
    const mine = (ticket.current += 1);
    if (timer.current) clearTimeout(timer.current);

    const to = options.findIndex((o) => o.value === next);
    setCascade((c) => ({ n: c.n + 1, dir: to >= fromIndex ? 1 : -1 }));

    const result = onChange(next);
    if (!isThenable(result)) {
      // Synchronous commit: it cannot fail, so it gets the short confirmation rather than a
      // spinner that would be gone before it rendered.
      hold(next, 'done', DONE_MS);
      return;
    }

    setStatus({ value: next, phase: 'busy' });
    result.then(
      () => {
        if (ticket.current === mine) hold(next, 'done', DONE_MS);
      },
      () => {
        if (ticket.current === mine) hold(next, 'failed', FAILED_MS);
      },
    );
  };

  const move = (dir: 1 | -1) => {
    if (options.length === 0) return;
    const next = options[(fromIndex + dir + options.length) % options.length];
    if (next) select(next.value);
  };

  const statusText =
    status?.phase === 'busy'
      ? t('common.loading')
      : status?.phase === 'done'
        ? t('home.done')
        : status?.phase === 'failed'
          ? t('common.retry')
          : '';

  return (
    <>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            move(1);
          }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
          }
        }}
        className={cn(
          'relative inline-flex gap-1 rounded-chip p-1',
          variant === 'A' && 'bg-surface-2',
          // B — a rule under the whole control instead of a track around it.
          variant === 'B' && 'gap-4 rounded-none border-b border-[var(--surface-border)] p-0',
          // C — the track is RECESSED (a step darker than the page) so the raised chip has
          // something to be raised out of. Elevation is a relationship, not a shadow.
          variant === 'C' && 'gap-0 bg-surface-1',
          // D — no container at all: the icons are the control.
          variant === 'D' && 'gap-2 bg-transparent p-0',
          // E — the wash runs to the edges of the control, so the fills are clipped by it.
          variant === 'E' && 'overflow-hidden bg-surface-2',
        )}
      >
        {options.map((opt, index) => {
          const active = opt.value === value;
          const phase = status && status.value === opt.value ? status.phase : null;
          /** Is this segment sitting on a solid accent fill? Decides what the glyph is drawn in. */
          const filled = active && (variant === 'A' || variant === 'E');
          const distance = Math.abs(index - fromIndex);
          // D gives an iconless option a dot rather than nothing: a variant whose entire idea is
          // the glyph cannot have segments with no glyph.
          const glyph =
            opt.icon ??
            (variant === 'D' ? <span aria-hidden className="size-2 rounded-chip bg-current" /> : null);

          return (
            <motion.button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-busy={phase === 'busy' || undefined}
              aria-disabled={readOnly || undefined}
              // Roving tabindex: the group is one tab stop and the arrows move inside it.
              tabIndex={active || (activeIndex === -1 && index === 0) ? 0 : -1}
              onClick={() => {
                if (readOnly) return;
                select(opt.value);
              }}
              className={cn(
                // Both axes of the floor, on every variant: D drops the padding to let the glyph
                // lead, and a short label under a 16px icon is exactly how a 44px target becomes
                // a 32px one without anybody noticing.
                'relative inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)]',
                'items-center justify-center gap-2 px-4',
                'text-body-s cursor-pointer outline-none',
                'transition-[color,background-color,opacity] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                'rounded-chip',
                variant === 'B' && 'rounded-none px-2 pb-2',
                variant === 'D' && 'flex-col gap-1 px-3',
                variant === 'D' && active && 'bg-accent-subtle',
                // C — the unchosen segments recede rather than shrink. They keep the full 44px
                // target: dimming is free, scaling down is not.
                variant === 'C' && !active && 'opacity-60 hover:opacity-100',
                // The raised chip is 5% wider than its slot, so it has to paint over its
                // neighbours — DOM order alone would put the first segment underneath the second.
                variant === 'C' && active && 'z-10',
                active ? 'text-accent-fg' : 'text-text-2 hover:text-text-1',
                variant === 'B' && active && 'text-accent',
                variant === 'C' && active && 'text-text-1',
                variant === 'D' && active && 'text-accent',
              )}
              style={
                // E — the colour of each segment turns in sequence, measured from the one that was
                // selected, so the change travels outward instead of landing everywhere at once.
                variant === 'E' && motionSafe ? { transitionDelay: `${distance * CASCADE_STEP}s` } : undefined
              }
              animate={{
                // The failure shake lives here rather than on a wrapper, so the whole segment
                // moves. Reduced motion keeps the warning glyph and drops the travel.
                x: motionSafe && phase === 'failed' ? [0, -6, 6, -4, 4, 0] : 0,
                // C — the chosen segment is physically bigger. Nothing else scales.
                scale: variant === 'C' && active ? 1.05 : 1,
              }}
              transition={{ duration: motionSafe ? 0.35 : 0, ease: EASE_STANDARD }}
              whileTap={motionSafe ? { scale: variant === 'C' && active ? 1.02 : 0.97 } : undefined}
            >
              {/* A — the pill travels, and a softer-sprung twin lags behind it as a wake. Two
                  springs on one journey is what makes a slide legible in a 200px demo box. */}
              {variant === 'A' && active ? (
                <>
                  <motion.span
                    aria-hidden
                    layoutId={`segmented-wake-${groupId}`}
                    className="absolute inset-0 rounded-chip bg-accent-subtle"
                    initial={false}
                    transition={motionSafe ? SPRING.soft : { duration: 0 }}
                  />
                  <motion.span
                    aria-hidden
                    layoutId={`segmented-thumb-${groupId}`}
                    className="absolute inset-0 rounded-chip bg-accent"
                    initial={false}
                    transition={motionSafe ? SPRING.tight : { duration: 0 }}
                  />
                </>
              ) : null}

              {/* B — the underline sweeps across on the soft spring, so it overshoots and settles
                  rather than arriving flat. That overshoot is the difference between "sweep" and
                  "the line is now over here". */}
              {variant === 'B' && active ? (
                <motion.span
                  aria-hidden
                  layoutId={`segmented-underline-${groupId}`}
                  className="absolute inset-x-0 bottom-0 h-0.5 rounded-chip bg-accent"
                  initial={false}
                  transition={motionSafe ? SPRING.soft : { duration: 0 }}
                />
              ) : null}

              {/* C — no layoutId on purpose: this one must NOT travel. It rises in place, one
                  surface step above the recessed track, with the pack's overlay shadow. */}
              {variant === 'C' && active ? (
                <motion.span
                  aria-hidden
                  className={cn(
                    'absolute inset-0 rounded-chip bg-surface-3 shadow-[var(--shadow-overlay)]',
                    'border-[length:var(--border-width)] border-[var(--surface-border)]',
                  )}
                  initial={motionSafe ? { opacity: 0, scale: 0.88 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={motionSafe ? SPRING.tight : { duration: 0 }}
                />
              ) : null}

              {/* E — the fill GROWS from the edge the selection came from. */}
              {variant === 'E' && active ? (
                <motion.span
                  aria-hidden
                  className={cn(
                    'absolute inset-0 rounded-chip bg-accent',
                    cascade.dir === 1 ? 'origin-left' : 'origin-right',
                  )}
                  initial={motionSafe ? { scaleX: 0 } : false}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: motionSafe ? 0.25 : 0, ease: EASE_STANDARD }}
                />
              ) : null}

              {/* E — and a wash crosses every OTHER segment too, delayed by its distance from the
                  selection. Keyed on the change counter so it replays on every pick. */}
              {variant === 'E' && cascade.n > 0 ? (
                <motion.span
                  key={`cascade-${cascade.n}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-chip bg-accent-subtle"
                  initial={{ opacity: 0.85 }}
                  animate={{ opacity: 0 }}
                  transition={{
                    duration: motionSafe ? 0.4 : 0,
                    delay: motionSafe ? distance * CASCADE_STEP : 0,
                    ease: EASE_STANDARD,
                  }}
                />
              ) : null}

              {/* The segment's own content. It steps aside for the status glyph rather than
                  fighting it for the same 44px — and it keeps its width while hidden, so a tick
                  never resizes the control. */}
              <span
                className={cn(
                  'relative inline-flex items-center gap-2',
                  variant === 'D' && 'flex-col gap-1',
                  'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)]',
                  phase && 'opacity-0',
                )}
              >
                {glyph ? (
                  <motion.span
                    className="inline-flex"
                    animate={
                      // D — the hop. Under reduced motion the icon still ends up bigger, because
                      // "which one is selected" must survive the animation being switched off.
                      variant === 'D' && active
                        ? motionSafe
                          ? { y: [0, -6, 0], scale: [1, 1.3, 1.15] }
                          : { y: 0, scale: 1.15 }
                        : { y: 0, scale: 1 }
                    }
                    transition={{ duration: motionSafe ? 0.45 : 0, ease: EASE_STANDARD }}
                  >
                    {glyph}
                  </motion.span>
                ) : null}
                <span>{opt.label}</span>
              </span>

              {/* ═══ THE STATE LAYER, SHARED BY ALL FIVE ═══════════════════════════════════════
                  A tick, a spinner and a warning triangle — three different SHAPES, so the state
                  is readable without relying on colour, and readable in a demo tile the size of a
                  thumbnail. */}
              <AnimatePresence initial={false}>
                {phase ? (
                  <motion.span
                    key={phase}
                    aria-hidden
                    className={cn(
                      'absolute inset-0 inline-flex items-center justify-center',
                      phase === 'failed' && 'text-danger',
                      phase === 'done' && (filled ? 'text-accent-fg' : 'text-success'),
                      phase === 'busy' && (filled ? 'text-accent-fg' : 'text-text-1'),
                    )}
                    initial={motionSafe ? { scale: 0.6, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={motionSafe ? { scale: 0.6, opacity: 0 } : undefined}
                    transition={motionSafe ? SPRING.tight : { duration: 0 }}
                  >
                    {phase === 'busy' ? (
                      <Loader2 className="size-icon-s animate-spin motion-reduce:animate-none" />
                    ) : phase === 'failed' ? (
                      <TriangleAlert className="size-icon-s" strokeWidth={2.5} />
                    ) : (
                      <Check className="size-icon-s" strokeWidth={2.5} />
                    )}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      {/*
        The same three states, for a screen reader. The glyphs are aria-hidden on purpose: an
        aria-label on a child would be absorbed into the radio's accessible NAME, and the option
        would start announcing itself as "Loading" instead of as what it is.
      */}
      <span role="status" className="sr-only">
        {statusText}
      </span>
    </>
  );
}
