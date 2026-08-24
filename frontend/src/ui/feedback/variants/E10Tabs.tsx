import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Check, Circle, CircleDot, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  badge?: number;
  icon?: React.ReactNode;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  /**
   * Selection handler.
   *
   * Returning a PROMISE opts the strip into the state layer: the chosen tab spins while the work
   * is in flight, ticks when it resolves, and swaps in a warning glyph when it rejects. A handler
   * that returns nothing — the ordinary `setState` case — still gets the tick, because a control
   * that answers a tap with nothing but a colour change is the defect this catalogue exists to fix.
   */
  onChange: (next: T) => void | Promise<unknown>;
  label: string;
}

/** A success tick is a confirmation, not a badge: long enough to read, short enough to leave. */
const CONFIRM_MS = 900;

/**
 * `--duration-fast|base|ambient`, in the seconds Motion wants — 150ms, 250ms and 1200ms.
 *
 * Here for the same reason `EASE_STANDARD` sits beside `SPRING`: Motion takes numbers, a CSS var
 * read at module scope resolves before the theme is applied, and the alternative is retyping 0.25
 * at nine call sites until one of them drifts to 0.3.
 *
 * `ambient` is the LOOP token — the one `tokens.css` annotates "skeleton shimmer, breathing
 * emphasis — loops, not transitions". B's in-flight sweep and D's unread breath are the two loops
 * in this file, and neither is allowed to invent its own tempo.
 */
const SEC = { fast: 0.15, base: 0.25, ambient: 1.2 } as const;

/** Which of the three non-idle things a tab can be saying about itself right now. */
type Phase = 'busy' | 'ok' | 'error';

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';

/**
 * E10 — Tabs, all five variants.
 *
 * A real tablist: arrow keys (and Home/End) move between tabs, focus follows the selection,
 * `aria-selected` reports the active one. Tabs built from plain buttons look identical and are
 * unusable without a mouse. The button itself is a `Pressable`, so the 44px floor, the press
 * scale and the focus ring are the primitive's, not five hand-rolled copies of them.
 *
 * ═══ THE FIVE ARE FIVE DIFFERENT IDEAS, NOT ONE IDEA AT FIVE INTENSITIES ═══════════════════════
 *
 *   A  Motion-highlight — ONE accent pill that TRAVELS between tabs (shared `layoutId`) and then
 *                         reports the outcome in its own fill: it lands accent, flashes success,
 *                         holds danger. The marker is the state surface, so there is nothing else
 *                         to look at.
 *   B  Underline-grow   — no fill at all; ONE BAR PER TAB that grows from the centre, runs a short
 *                         segment back and forth while the switch is in flight, and settles into
 *                         success or danger. A moves ONE marker between tabs; B gives every tab a
 *                         line of its own that reports what that tab is doing. Deliberately
 *                         opposite ideas: a shared `layoutId` here would make B a thinner A.
 *   C  Icon-colorize    — no background anywhere; the GLYPH carries the selection, on a disc that
 *                         pops in behind it. A tab given no icon gets a Circle→CircleDot pair, so
 *                         the variant still has something to colourise.
 *   D  Badge-flush      — unread counts are the subject: an unread chip BREATHES until you open its
 *                         tab, then the number rolls out and a tick rolls in behind it. A failed
 *                         switch flushes nothing — the count comes back, because the user has still
 *                         not seen them.
 *   E  Content-swap     — the strip is a reel. Inactive tabs collapse to their glyph, the open one
 *                         expands and its label slides in from the direction the selection moved.
 *
 * ═══ THE STATE LAYER IS THE GLYPH, NOT THE COLOUR ═════════════════════════════════════════════
 *
 * Every variant shares one: the selected tab's icon slot is a state machine — spinner in flight,
 * tick on success, warning glyph plus a shake on failure — because a colour change alone is
 * invisible to the eight percent of men who cannot separate the two colours it usually uses.
 * A tab that has no icon grows the slot for the duration and gives it back afterwards.
 *
 * Under reduced motion the SWAP still happens and the colour still changes; only the travel is
 * dropped (durations collapse to zero). The user still learns that the thing happened. The two
 * loops go the same way: B's in-flight sweep becomes a full bar in the state colour instead of a
 * segment that runs, and D's unread badge simply sits still — it is still the only red chip in
 * the strip, and it still turns into a tick when the tab is opened.
 */
export function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
  const variant = useElementVariant('E10');
  const motionSafe = useMotionSafe();
  const { t } = useTranslation();
  const groupId = useId();

  const [phase, setPhase] = useState<{ value: T; kind: Phase } | null>(null);
  /** Which way the selection last travelled — variant E slides its content in from that side. */
  const [dir, setDir] = useState<1 | -1>(1);
  /** Every selection takes a ticket, so a slow promise cannot overwrite a newer one's outcome. */
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttons = useRef(new Map<T, HTMLButtonElement | null>());

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const settle = (ticket: number, next: T, kind: Phase) => {
    if (attempt.current !== ticket) return; // a newer selection owns the strip now
    setPhase({ value: next, kind });
    // A failure STAYS until the next attempt. Auto-clearing it would turn the one state the user
    // has to act on into a flash they can miss — and the tab is the retry: clicking it runs the
    // handler again.
    if (kind === 'error') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (attempt.current === ticket) setPhase(null);
    }, CONFIRM_MS);
  };

  const select = (next: T) => {
    const from = items.findIndex((tab) => tab.value === value);
    const to = items.findIndex((tab) => tab.value === next);
    setDir(to >= from ? 1 : -1);

    const ticket = (attempt.current += 1);
    if (timer.current) clearTimeout(timer.current);

    let result: unknown;
    try {
      result = onChange(next);
    } catch {
      // A handler that throws synchronously is a failure like any other; swallowing it here would
      // leave the strip claiming a switch that never happened.
      settle(ticket, next, 'error');
      return;
    }

    if (isThenable(result)) {
      setPhase({ value: next, kind: 'busy' });
      Promise.resolve(result).then(
        () => settle(ticket, next, 'ok'),
        () => settle(ticket, next, 'error'),
      );
      return;
    }

    settle(ticket, next, 'ok');
  };

  /** Keyboard selection also MOVES FOCUS — otherwise the ring is left behind on the old tab. */
  const focusAndSelect = (next: T) => {
    select(next);
    buttons.current.get(next)?.focus();
  };

  const move = (step: 1 | -1) => {
    const i = items.findIndex((tab) => tab.value === value);
    const next = items[(i + step + items.length) % items.length];
    if (next) focusAndSelect(next.value);
  };

  const jump = (index: number) => {
    const next = items[index];
    if (next) focusAndSelect(next.value);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
        if (e.key === 'Home') { e.preventDefault(); jump(0); }
        if (e.key === 'End') { e.preventDefault(); jump(items.length - 1); }
      }}
      className={cn(
        'flex',
        // Each variant owns its own container, because half of what tells them apart at rest is
        // what is drawn AROUND the tabs: a track, a rule, or nothing at all.
        variant === 'A' && 'gap-1 rounded-chip bg-surface-2 p-1',
        variant === 'B' && 'gap-1 border-b border-[var(--surface-border)]',
        variant === 'C' && 'gap-2',
        (variant === 'D' || variant === 'E') && 'gap-1',
      )}
    >
      {items.map((tab) => {
        const active = tab.value === value;
        const kind = phase && phase.value === tab.value ? phase.kind : null;
        const badge = tab.badge ?? 0;

        // A is the only variant whose selected tab sits ON A FILLED SURFACE, and that changes
        // which half of every semantic colour pair is correct: a `text-danger` warning glyph on
        // the pill is one dark colour on another. On the fill, the label and the glyph take the
        // `on-*` partner and the PILL carries the semantic colour instead.
        const onFill = variant === 'A' && active;

        /**
         * The fill of whichever object the variant uses to MARK the selection — A's travelling
         * pill, B's bar. Idle accent, success on a switch that landed, danger on one that did not.
         *
         * One const rather than one per variant: they are the same three-way question, and two
         * copies of it is how A ends up flashing success while B has quietly kept accent.
         */
        const markerTone = kind === 'error' ? 'bg-danger' : kind === 'ok' ? 'bg-success' : 'bg-accent';

        // D only. An unread count that sits perfectly still is a static red dot; one that breathes
        // is the reason this variant is called Badge-flush, and it is the one thing in the strip
        // that reads before anybody clicks anything. It stops the moment the tab is opened —
        // an indicator that never rests is noise, not a signal.
        const breathing = variant === 'D' && !active && badge > 0 && motionSafe;

        // Existing keys only — `src/i18n` is shared by every agent on this codebase. Success is
        // deliberately silent for assistive tech: `aria-selected` has already announced it, and
        // there is no generic "done" key to borrow that is not owned by another feature.
        const status = kind === 'busy' ? t('common.loading') : kind === 'error' ? t('common.retry') : null;

        // On the fill the glyph inherits the button's `on-*` colour rather than naming its own:
        // the SHAPE is the message here, and a semantic colour that cannot be seen is not one.
        const stateGlyph =
          kind === 'busy' ? (
            <Loader2 className="size-icon-s animate-spin motion-reduce:animate-none" aria-hidden />
          ) : kind === 'ok' ? (
            <Check className={cn('size-icon-s', !onFill && 'text-success')} aria-hidden />
          ) : kind === 'error' ? (
            <TriangleAlert className={cn('size-icon-s', !onFill && 'text-danger')} aria-hidden />
          ) : null;

        // C and E lead with a glyph, so a tab that was handed none is given one rather than
        // rendering a variant with its subject missing.
        const restGlyph =
          tab.icon ??
          (variant === 'C' || variant === 'E' ? (
            active ? (
              <CircleDot className="size-icon-s" aria-hidden />
            ) : (
              <Circle className="size-icon-s" aria-hidden />
            )
          ) : null);

        const glyph = stateGlyph ?? restGlyph;
        // The key is what makes the swap animate: a changed key is an exit and an enter.
        const glyphKey = kind ?? (active ? 'on' : 'off');

        return (
          <motion.span
            key={tab.value}
            className={cn('relative flex', variant === 'E' && !active ? 'flex-none' : 'flex-1')}
            // The shake is the emphasis; the warning glyph is the message. Two failures in a row on
            // the same tab re-render the same keyframes and may not replay the shake — the glyph is
            // still there, which is why the state does not depend on the motion.
            //
            // `undefined` rather than `{ x: 0 }` in the idle case on purpose: that would leave a
            // transform on every tab wrapper permanently, and A's travelling pill is a layout
            // projection that has to measure through these. The keyframes END at 0, so nothing is
            // left displaced once a shake finishes.
            animate={kind === 'error' && motionSafe ? { x: [0, -6, 6, -4, 0] } : undefined}
            transition={{ duration: motionSafe ? SEC.base : 0, ease: EASE_STANDARD }}
          >
            <Pressable
              ref={(el) => {
                buttons.current.set(tab.value, el);
              }}
              role="tab"
              aria-selected={active}
              // Not Pressable's `busy` prop: that also DISABLES the button, which would drop the
              // tab out of the tab order mid-interaction and strand a keyboard user on it.
              aria-busy={kind === 'busy' || undefined}
              // E collapses the label to zero width, so the accessible name has to be stated.
              aria-label={
                variant === 'E'
                  ? [tab.label, badge > 0 ? String(badge) : null, status].filter(Boolean).join(' ')
                  : undefined
              }
              tabIndex={active ? 0 : -1}
              variant="ghost"
              shape="chip"
              onClick={() => select(tab.value)}
              className={cn(
                variant === 'E' && !active ? 'shrink-0 px-2' : 'w-full',
                // A's label rides the pill, so it tracks the pill's fill through all three states.
                variant === 'A' &&
                  (active
                    ? kind === 'ok'
                      ? 'text-on-success'
                      : kind === 'error'
                        ? 'text-on-danger'
                        : 'text-accent-fg'
                    : 'text-text-2 hover:text-text-1'),
                variant === 'B' && cn('rounded-none pb-2', active ? 'text-accent' : 'text-text-2 hover:text-text-1'),
                variant === 'C' && (active ? 'text-accent' : 'text-text-3 hover:text-text-1'),
                // D marks the open tab with a flat, instant chip: the badge is the moving part of
                // this variant, and two things competing for the eye is how a variant stops reading.
                variant === 'D' && (active ? 'bg-surface-3 text-text-1' : 'text-text-2 hover:text-text-1'),
                // E is the only variant that gives every tab a chip of its own, so it is the only
                // one that can paint a failure into the chip rather than only into the text.
                variant === 'E' &&
                  (kind === 'error'
                    ? 'bg-danger-subtle'
                    : active
                      ? 'bg-accent-subtle text-accent'
                      : 'bg-surface-2 text-text-2'),
                // The failure paints the label too — colour AND glyph, never colour alone. Except
                // on A's fill, where the pill has already gone danger and the label needs its
                // partner colour to stay readable against it.
                kind === 'error' && !onFill && 'text-danger',
              )}
            >
              {/* A — a pill that TRAVELS between tabs. The movement is what tells the eye where the
                  selection went; a fade would leave it to be re-found. It is also where the outcome
                  is reported: the largest coloured object in the variant changing colour is not a
                  detail anyone can miss, and it costs no second element to compete with the travel.
                  The fill transitions on `--duration-base` rather than snapping, so the pill is
                  seen to change rather than found already changed. */}
              {variant === 'A' && active ? (
                <motion.span
                  aria-hidden
                  layoutId={`tabs-${groupId}`}
                  className={cn(
                    'absolute inset-0 rounded-chip',
                    'transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
                    markerTone,
                  )}
                  initial={false}
                  transition={motionSafe ? SPRING.base : { duration: 0 }}
                />
              ) : null}

              {/* B — a bar per tab that GROWS from the centre, shrinks away when it leaves, and
                  spends the wait as an INDETERMINATE sweep: a third-width segment mirroring along
                  the tab's own edge, then landing on success or danger. No shared layoutId on
                  purpose: A already owns "the marker travels", and a second variant doing the same
                  thing 2px thinner is the flattening this file was rebuilt to remove.

                  It shows for a tab that is merely BEING ATTEMPTED as well as the selected one —
                  with an async handler the parent often does not move `value` until the promise
                  resolves, and a strip that shows nothing at all until then is the silent control
                  this catalogue exists to fix. */}
              <AnimatePresence initial={false}>
                {variant === 'B' && (active || kind !== null) ? (
                  <motion.span
                    key="underline"
                    aria-hidden
                    className="absolute inset-x-2 bottom-0 h-1 origin-center overflow-hidden rounded-chip"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    exit={{ scaleX: 0 }}
                    transition={{ duration: motionSafe ? SEC.base : 0, ease: EASE_STANDARD }}
                  >
                    <motion.span
                      className={cn(
                        'block h-full rounded-chip',
                        'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
                        // Reduced motion keeps a FULL bar in the state colour: the segment is the
                        // travel, and travel is the only thing that is dropped. The colour change
                        // and the spinner→tick swap above it still happen.
                        kind === 'busy' && motionSafe ? 'w-1/3' : 'w-full',
                        markerTone,
                      )}
                      initial={false}
                      animate={kind === 'busy' && motionSafe ? { x: ['0%', '200%'] } : { x: 0 }}
                      transition={
                        kind === 'busy' && motionSafe
                          ? {
                              // A loop, not a transition — `--duration-ambient` is the token that
                              // exists for exactly this, mirrored so the segment returns instead
                              // of jumping back to the left edge.
                              duration: SEC.ambient,
                              ease: EASE_STANDARD,
                              repeat: Infinity,
                              repeatType: 'mirror' as const,
                            }
                          : { duration: 0 }
                      }
                    />
                  </motion.span>
                ) : null}
              </AnimatePresence>

              {glyph ? (
                <span
                  className={cn(
                    'relative inline-flex items-center justify-center',
                    variant === 'C' && 'transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]',
                    variant === 'C' && active && 'scale-125',
                  )}
                >
                  {/* C — the disc pops in behind the glyph. The tab keeps no background of its
                      own, so the icon is the entire selected state. It stays under the spinner and
                      the tick — only a failure drops it, because a failed switch has not selected
                      anything and must not look as though it had. */}
                  {variant === 'C' && active && kind !== 'error' ? (
                    <motion.span
                      aria-hidden
                      className="absolute -inset-2 rounded-chip bg-accent-subtle"
                      initial={motionSafe ? { scale: 0.4, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={motionSafe ? SPRING.tight : { duration: 0 }}
                    />
                  ) : null}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={glyphKey}
                      className="relative inline-flex"
                      initial={motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }}
                      transition={motionSafe ? SPRING.tight : { duration: 0 }}
                    >
                      {glyph}
                    </motion.span>
                  </AnimatePresence>
                </span>
              ) : null}

              {/* E — the label is the content that swaps: it is clipped to nothing on the closed
                  tabs and slides in from the side the selection came from on the open one. */}
              {variant === 'E' ? (
                <motion.span
                  aria-hidden
                  className="relative block overflow-hidden whitespace-nowrap"
                  initial={false}
                  animate={{ width: active ? 'auto' : 0, opacity: active ? 1 : 0 }}
                  transition={{ duration: motionSafe ? SEC.base : 0, ease: EASE_STANDARD }}
                >
                  <motion.span
                    className="block px-1"
                    initial={false}
                    animate={{ x: active ? 0 : dir * 12 }}
                    transition={{ duration: motionSafe ? SEC.base : 0, ease: EASE_STANDARD }}
                  >
                    {tab.label}
                  </motion.span>
                </motion.span>
              ) : (
                <span className="relative">{tab.label}</span>
              )}

              {badge > 0 ? (
                <motion.span
                  className={cn(
                    'relative inline-flex min-w-5 items-center justify-center overflow-hidden rounded-chip px-1.5',
                    'text-micro tabular-nums transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
                    // The chip goes quiet only on a switch that WORKED. A failed one keeps the
                    // count hot for the same reason it keeps the warning glyph: nothing was read.
                    variant === 'D' && active && kind !== 'error'
                      ? 'bg-surface-2 text-text-3'
                      : 'bg-danger text-on-danger',
                  )}
                  // D only, and only while the count is still unread. An explicit resting target
                  // rather than `undefined`: the loop is interrupted mid-breath by the very click
                  // it is asking for, and dropping the target there would leave the chip frozen at
                  // whatever scale that frame happened to hold. This snaps it back to 1.
                  animate={breathing ? { scale: [1, 1.14, 1] } : { scale: 1 }}
                  transition={
                    breathing
                      ? {
                          duration: SEC.ambient,
                          ease: EASE_STANDARD,
                          repeat: Infinity,
                          // A beat between breaths. A continuous pulse is an alarm; this is a
                          // reminder, and the gap is what separates the two.
                          repeatDelay: SEC.ambient,
                        }
                      : { duration: 0 }
                  }
                >
                  {/* D — the badge is FLUSHED by opening the tab: the count rolls up out of the
                      chip and a tick rolls in under it, so the number means "unseen" and the tick
                      means "you have now seen them". Every other variant leaves the count alone —
                      it is the caller's data, not this variant's material. */}
                  {variant === 'D' ? (
                    <AnimatePresence mode="wait" initial={false}>
                      {active && kind !== 'error' ? (
                        <motion.span
                          key="flushed"
                          className="inline-flex text-success"
                          initial={motionSafe ? { y: 12, opacity: 0 } : { opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={motionSafe ? { y: -12, opacity: 0 } : { opacity: 0 }}
                          transition={motionSafe ? SPRING.tight : { duration: 0 }}
                        >
                          <Check className="size-icon-s" aria-hidden />
                        </motion.span>
                      ) : (
                        <motion.span
                          key="count"
                          initial={motionSafe ? { y: 12, opacity: 0 } : { opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={motionSafe ? { y: -12, opacity: 0 } : { opacity: 0 }}
                          transition={motionSafe ? SPRING.tight : { duration: 0 }}
                        >
                          {badge}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  ) : (
                    badge
                  )}
                </motion.span>
              ) : null}

              {status && variant !== 'E' ? <span className="sr-only">{status}</span> : null}
            </Pressable>
          </motion.span>
        );
      })}
    </div>
  );
}
