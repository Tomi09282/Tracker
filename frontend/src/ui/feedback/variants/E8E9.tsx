import { useTranslation } from 'react-i18next';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { CalendarDays, Check, ChevronDown, Loader2, Search, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

/* ══ Shared — what the control says back ════════════════════════════════════════════════════ */

/**
 * How long a finished state stays on screen before the control returns to rest.
 *
 * Deliberately NOT one of the `--duration-*` tokens: nothing is moving, so this is not a motion
 * duration — it is a DWELL, the time a glyph has to sit still to be read after the eye has moved
 * on. Same category as `HOLD_MS` in SetRow, and the same reason it lives in JS.
 */
const STATE_HOLD_MS = 1400;

/** E8 variant B holds the panel open just long enough for the check to travel to the picked row. */
const CONFIRM_HOLD_MS = 340;

/**
 * The `--duration-*` tokens this file needs, in the seconds Motion wants.
 *
 * Same argument as `EASE_STANDARD` in `useMotionSafe`: a spring covers most of this file, but the
 * tweens that remain need a number, `check-tokens` cannot see a number, and the alternative is a
 * scatter of `0.25`s that nothing holds to the token file. One table, named after the tokens it
 * mirrors, is the smallest version of that copy.
 */
const DUR = { fast: 0.15, base: 0.25, slow: 0.4, ambient: 1.2 } as const;

/** Past this much travel — or this much flick — a horizontal drag counts as a month change. */
const SWIPE_PX = 48;
const SWIPE_VELOCITY = 320;

/**
 * How far E8 variant D's sheet has to be dragged down before letting go dismisses it.
 *
 * Twice the month-swipe threshold, and deliberately: a month you swiped past comes back with one
 * swipe the other way, while a sheet you dismissed by accident costs you the whole selection. The
 * more expensive the mistake, the further the gesture has to travel to make it.
 */
const SHEET_DISMISS_PX = 96;

type CommitState = 'idle' | 'busy' | 'ok' | 'fail';

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';

/**
 * The state a control reports after you act on it.
 *
 * The owner's requirement, verbatim: the feedback has to change the ICON, not only the colour —
 * a tick that replaces the glyph, a warning glyph that replaces it on failure, a spinner while the
 * commit is in flight. Colour alone is invisible to anyone who cannot see the accent, and it is
 * invisible to everyone when the change is a 1.1:1 step on a dark surface.
 *
 * `onChange` may return a promise. If it does, the control is honest about the wait: spinner until
 * it settles, tick or warning after. If it returns nothing the commit already happened, so the
 * tick is immediate — there is no fake latency here.
 */
function useCommitState() {
  const [state, setState] = useState<CommitState>('idle');
  // Bumped on every failure so a SECOND failure shakes again instead of sitting still — the same
  // defect E7's shake variant had to fix.
  const [failKey, setFailKey] = useState(0);
  const hold = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(hold.current), []);

  const flash = (next: Exclude<CommitState, 'idle'>) => {
    setState(next);
    if (next === 'fail') setFailKey((k) => k + 1);
    window.clearTimeout(hold.current);
    // 'busy' has no dwell: it ends when the promise ends, not when a timer says so.
    if (next !== 'busy') hold.current = window.setTimeout(() => setState('idle'), STATE_HOLD_MS);
  };

  const commit = (run: () => void | Promise<unknown>) => {
    let result: unknown;
    try {
      result = run();
    } catch {
      flash('fail');
      return;
    }
    if (isThenable(result)) {
      flash('busy');
      result.then(
        () => flash('ok'),
        () => flash('fail'),
      );
      return;
    }
    flash('ok');
  };

  /** Fire and forget: used where the control is about to say something louder than the result. */
  const detached = (run: () => void | Promise<unknown>) => {
    try {
      const result: unknown = run();
      if (isThenable(result)) result.then(undefined, () => undefined);
    } catch {
      /* the caller flashes its own state */
    }
  };

  return { state, failKey, commit, flash, detached };
}

/** The i18n key that says out loud what the glyph says visually. Keys that already exist. */
const ANNOUNCEMENT: Record<CommitState, string | null> = {
  idle: null,
  busy: 'common.loading',
  ok: 'home.done',
  fail: 'auth.errors.generic',
};

/**
 * The glyph slot. Idle it shows whatever the control normally shows; the three reported states
 * replace it outright.
 *
 * Under reduced motion the swap still HAPPENS — only the scale-in is dropped. A user who asked for
 * less movement still has to be able to learn that the thing succeeded or failed.
 */
function CommitGlyph({
  state,
  idle,
  size,
  motionSafe,
}: {
  state: CommitState;
  idle: ReactNode;
  size: number;
  motionSafe: boolean;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={state}
        className={cn(
          'inline-flex shrink-0',
          state === 'busy' && 'text-text-2',
          state === 'ok' && 'text-success',
          state === 'fail' && 'text-danger',
        )}
        initial={motionSafe ? { scale: 0.55, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        exit={motionSafe ? { scale: 0.55, opacity: 0 } : undefined}
        transition={motionSafe ? SPRING.tight : { duration: 0 }}
      >
        {state === 'busy' ? (
          // animate-spin is pinned to --duration-ambient in index.css, which is why it is usable
          // here at all — Tailwind ships it with a duration no token declares.
          <Loader2 size={size} strokeWidth={2} aria-hidden className="animate-spin" />
        ) : state === 'ok' ? (
          <Check size={size} strokeWidth={2.5} aria-hidden />
        ) : state === 'fail' ? (
          <TriangleAlert size={size} strokeWidth={2.5} aria-hidden />
        ) : (
          idle
        )}
      </motion.span>
    </AnimatePresence>
  );
}

/** The shake. Reduced motion collapses the travel to nothing; the glyph swap above carries it. */
const shakeAnimate = (failed: boolean, motionSafe: boolean) =>
  failed && motionSafe ? { x: [0, -8, 8, -6, 0] } : { x: 0 };

/* ══ E8 — Select ════════════════════════════════════════════════════════════════════════════ */

export interface SelectOption {
  value: string;
  label: string;
}

/** Marks the part of a label the live search actually matched. Variant E only. */
function Matched({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      {/* Padded, because an unpadded tint behind three letters of body text is a change nobody
          sees at a glance — the point of marking the match is that the eye finds it first. */}
      <span className="rounded-chip bg-accent-subtle px-1 font-semibold text-on-accent-subtle">
        {text.slice(at, at + query.length)}
      </span>
      {text.slice(at + query.length)}
    </>
  );
}

export function Select({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly SelectOption[];
  value: string | null;
  /**
   * Return a promise to get the honest sequence — spinner while it is in flight, tick when it
   * resolves, warning glyph plus a shake when it rejects. Return nothing for an immediate tick.
   */
  onChange: (next: string) => void | Promise<unknown>;
  label: string;
}) {
  const { t } = useTranslation();
  const variant = useElementVariant('E8');
  const motionSafe = useMotionSafe();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  // C — the two rows the pointer left behind, most recent first. The trail is what makes C a
  // different IDEA from "every row has a hover colour": the surface remembers where you came from.
  const [trail, setTrail] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const closing = useRef<number | undefined>(undefined);
  // E — clearing the query has to put the caret back where it was, or the affordance costs the
  // user the tap it just saved them.
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const { state, failKey, commit } = useCommitState();
  // D — the sheet is dragged by its grab bar, not by its body: the list scrolls, and a surface
  // that both scrolls and drags from the same pixels does neither reliably. `dragListener={false}`
  // hands the gesture to the handle below.
  const sheetDrag = useDragControls();

  const selected = options.find((o) => o.value === value) ?? null;

  const visible = useMemo(() => {
    // E — filter as you type. Only this variant searches; the others show the full list, so
    // the behaviour of the control is what changes, not just its look.
    if (variant !== 'E' || !query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, variant]);

  // E's failure path, and it is a real one rather than a staged one: a live search that finds
  // nothing is the way this control fails, and it used to fail by printing an em dash.
  const noMatch = variant === 'E' && query.length > 0 && visible.length === 0;

  // A click outside closes it. Without this the panel survives the next interaction and the
  // user has to press Escape to get rid of something they already moved past.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closing.current), []);

  // D — on a small screen the list rises as a bottom sheet: a dropdown pinned to a trigger near
  // the top of the viewport leaves its options under the thumb's reach.
  const asSheet = variant === 'D';

  const pick = (next: string) => {
    window.clearTimeout(closing.current);
    if (variant === 'B') {
      // B's whole idea is a single check that TRAVELS from the old row to the new one. Closing
      // the panel on the same tick would hide the only thing that makes B B, so the panel holds
      // for exactly as long as that trip takes.
      closing.current = window.setTimeout(() => {
        setOpen(false);
        setQuery('');
      }, motionSafe ? CONFIRM_HOLD_MS : 0);
    } else {
      setOpen(false);
      setQuery('');
    }
    commit(() => onChange(next));
  };

  const markHover = (v: string) => {
    setHover(v);
    if (variant === 'C') setTrail((prev) => [v, ...prev.filter((x) => x !== v)].slice(0, 3));
  };

  /**
   * Opening and closing, with the per-variant setup each one needs.
   *
   * C used to open with `hover === null`, which meant its single travelling highlight did not
   * exist until a POINTER moved over a row — so on touch, on a keyboard, and in a screenshot of
   * the playground the variant whose entire idea is a highlight showed no highlight at all. It now
   * opens with the highlight already parked on the current value, so the first move is a journey
   * from somewhere rather than an appearance from nothing.
   */
  const toggle = () => {
    const next = !open;
    setOpen(next);
    setQuery('');
    if (next && variant === 'C') {
      setHover(value);
      setTrail(value ? [value] : []);
    }
    if (!next) setTrail([]);
  };

  const rowInitial =
    !motionSafe
      ? false
      : variant === 'A'
        ? { opacity: 0, y: -12, scale: 0.92 }
        : asSheet
          ? { opacity: 0, y: 18, scale: 0.98 }
          : false;

  const rowTransition = (i: number) =>
    !motionSafe
      ? { duration: 0 }
      : variant === 'A'
        ? { ...SPRING.tight, delay: Math.min(i, 8) * 0.045 }
        : asSheet
          ? { ...SPRING.base, delay: Math.min(i, 8) * 0.035 }
          : { duration: 0 };

  const announcementKey = ANNOUNCEMENT[state];

  return (
    <div ref={root} className="relative w-full">
      <span className="text-body-s text-text-2">{label}</span>

      <motion.div
        // The shake is keyed so a second, different failure plays again rather than sitting on
        // the settled position of the first.
        key={failKey}
        className="mt-1.5"
        animate={shakeAnimate(state === 'fail', motionSafe)}
        transition={{ duration: motionSafe ? DUR.slow : 0, ease: EASE_STANDARD }}
      >
        <Pressable
          shape="field"
          className="w-full"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={toggle}
        >
          <span className={cn('flex-1 truncate', selected ? 'text-text-1' : 'text-text-3')}>
            {selected?.label ?? '—'}
          </span>
          <CommitGlyph
            state={state}
            size={20}
            motionSafe={motionSafe}
            idle={
              variant === 'A' ? (
                // A — "Spring-open" has to be visible BEFORE the panel exists, or four of the five
                // variants present an identical closed trigger and the difference is a secret until
                // you click. So A's caret is the only one driven by a spring: it whips past 180°
                // and settles back, which is the same physics the panel is about to use.
                <motion.span
                  className="inline-flex shrink-0"
                  animate={{ rotate: open ? 180 : 0 }}
                  transition={motionSafe ? SPRING.soft : { duration: 0 }}
                >
                  <ChevronDown size={20} strokeWidth={2} aria-hidden />
                </motion.span>
              ) : (
                <ChevronDown
                  size={20}
                  strokeWidth={2}
                  aria-hidden
                  className={cn(
                    'shrink-0 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
                    open && 'rotate-180',
                  )}
                />
              )
            }
          />
        </Pressable>
      </motion.div>

      {/* The same news the glyph carries, for anyone who cannot see it. */}
      <span aria-live="polite" className="sr-only">
        {announcementKey ? t(announcementKey) : ''}
      </span>

      <AnimatePresence>
        {open ? (
          <>
            {asSheet ? (
              <motion.div
                aria-hidden
                className="fixed inset-0 z-[var(--z-sheet)] bg-scrim"
                initial={motionSafe ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={motionSafe ? { opacity: 0 } : undefined}
                onClick={() => setOpen(false)}
              />
            ) : null}

            <motion.ul
              id={listId}
              role="listbox"
              aria-label={label}
              className={cn(
                // A dropdown has to WIN against whatever it covers, and the ordinary card border
                // does not: --surface-3 on --surface-0 is a real step but a quiet one, and over a
                // busy card the panel reads as barely there. The strong border and the strong
                // shadow are the pair that says "this floats above everything" — and they are the
                // one place a border AND a shadow together is correct, because an overlay's job is
                // to detach, not to sit.
                'z-[var(--z-sheet)] overflow-auto border-[length:var(--border-width)]',
                'border-[var(--surface-border-strong)] bg-[var(--sheet-bg)]',
                'backdrop-blur-[var(--sheet-blur)]',
                asSheet
                  ? 'fixed inset-x-0 bottom-0 max-h-[60vh] rounded-t-[var(--radius-sheet)] p-2 pb-[calc(--spacing(2)+env(safe-area-inset-bottom))] shadow-[var(--shadow-overlay-strong)]'
                  : 'absolute inset-x-0 top-full mt-1 max-h-64 rounded-card p-1 shadow-[var(--shadow-overlay-strong)]',
              )}
              // A — the panel does not fade in, it OPENS: it unfolds from the trigger's own edge
              // on a soft spring, so the overshoot is the thing you notice rather than the colour.
              style={variant === 'A' ? { transformOrigin: 'top center' } : undefined}
              initial={
                motionSafe
                  ? asSheet
                    ? { y: '100%' }
                    : variant === 'A'
                      ? { opacity: 0, scaleY: 0.45, y: -10 }
                      : { opacity: 0, scale: 0.96, y: -8 }
                  : false
              }
              animate={
                asSheet
                  ? { y: 0 }
                  : variant === 'A'
                    ? { opacity: 1, scaleY: 1, y: 0 }
                    : { opacity: 1, scale: 1, y: 0 }
              }
              exit={
                motionSafe
                  ? asSheet
                    ? { y: '100%' }
                    : variant === 'A'
                      ? { opacity: 0, scaleY: 0.6 }
                      : { opacity: 0, scale: 0.98 }
                  : undefined
              }
              transition={
                motionSafe ? (asSheet || variant === 'A' ? SPRING.soft : SPRING.tight) : { duration: 0 }
              }
              // D — a sheet you can only close with a button is a dropdown wearing a sheet's
              // shape. This one is thrown away downward, which is the gesture the shape promises.
              // `dragElastic` is asymmetric on purpose: it gives downward and refuses upward,
              // because a sheet already sitting on the bottom edge has nowhere up to go.
              drag={asSheet ? 'y' : false}
              dragListener={false}
              dragControls={sheetDrag}
              dragConstraints={asSheet ? { top: 0, bottom: 0 } : undefined}
              dragElastic={asSheet ? { top: 0, bottom: 0.6 } : undefined}
              dragMomentum={false}
              onDragEnd={(_event, info) => {
                if (!asSheet) return;
                if (info.offset.y > SHEET_DISMISS_PX || info.velocity.y > SWIPE_VELOCITY) setOpen(false);
              }}
            >
              {asSheet ? (
                // D is not a dropdown wearing a different animation — it is a modal surface, and
                // it has to carry a modal surface's furniture: a grab bar, its own title, and a
                // way out that is not "guess that the scrim is tappable".
                <li role="presentation" className="mb-2">
                  {/* The grab bar is the drag HANDLE, so it gets a real hit area rather than the
                      4px the stripe itself occupies — and `touch-none` because a handle that also
                      scrolls the list underneath it fights the gesture it exists to receive. */}
                  <div
                    aria-hidden
                    onPointerDown={(e) => sheetDrag.start(e)}
                    className="flex min-h-[var(--target-min)] cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                  >
                    <span className="block h-1 w-10 rounded-chip bg-surface-3" />
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-3">
                    <span className="text-body-strong truncate text-text-1">{label}</span>
                    <Pressable
                      shape="icon"
                      variant="ghost"
                      aria-label={t('common.close')}
                      onClick={() => setOpen(false)}
                    >
                      <X size={20} strokeWidth={2} aria-hidden />
                    </Pressable>
                  </div>
                </li>
              ) : null}

              {variant === 'E' ? (
                <motion.li
                  role="presentation"
                  className={cn(
                    'mb-1 flex items-center gap-2 rounded-field bg-[var(--field-bg)] px-3',
                    'border-[length:var(--border-width)]',
                    noMatch ? 'border-[var(--danger-border)]' : 'border-transparent',
                    'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
                  )}
                  // The search row shakes ONCE, when the query stops matching anything. Not keyed:
                  // remounting here would take the caret out of the field mid-word.
                  animate={shakeAnimate(noMatch, motionSafe)}
                  transition={{ duration: motionSafe ? DUR.slow : 0, ease: EASE_STANDARD }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={noMatch ? 'miss' : 'find'}
                      className={cn('inline-flex shrink-0', noMatch ? 'text-danger' : 'text-text-3')}
                      initial={motionSafe ? { scale: 0.55, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={motionSafe ? { scale: 0.55, opacity: 0 } : undefined}
                      transition={motionSafe ? SPRING.tight : { duration: 0 }}
                    >
                      {noMatch ? (
                        <TriangleAlert size={20} strokeWidth={2.5} aria-hidden />
                      ) : (
                        <Search size={20} strokeWidth={2} aria-hidden />
                      )}
                    </motion.span>
                  </AnimatePresence>
                  <input
                    ref={searchRef}
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('library.search')}
                    aria-invalid={noMatch || undefined}
                    // The option buttons below redraw their ring; this input removed it and
                    // replaced it with nothing. `outline-none` in the utilities layer beats the
                    // `:focus-visible` backstop in index.css, so the ring is restated here.
                    // `min-w-0`: a flex item defaults to `min-width: auto`, and an input's
                    // intrinsic width is roughly twenty characters — so beside the clear button it
                    // refuses to shrink and pushes the row out of a narrow card instead.
                    className="min-h-[var(--target-min)] w-full min-w-0 bg-transparent text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  />
                  {/* A dead end needs a way out of it. Without this, the only escape from a query
                      that matches nothing is to select the text and delete it — and the state the
                      control is IN (no results) is exactly the state where that is most annoying.
                      It appears only once there is something to clear, so the resting row is
                      unchanged. */}
                  <AnimatePresence initial={false}>
                    {query ? (
                      <motion.span
                        className="inline-flex shrink-0"
                        initial={motionSafe ? { scale: 0.55, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={motionSafe ? { scale: 0.55, opacity: 0 } : undefined}
                        transition={motionSafe ? SPRING.tight : { duration: 0 }}
                      >
                        <Pressable
                          shape="icon"
                          variant="ghost"
                          aria-label={t('library.clearFilters')}
                          onClick={() => {
                            setQuery('');
                            searchRef.current?.focus();
                          }}
                        >
                          <X size={20} strokeWidth={2} aria-hidden />
                        </Pressable>
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </motion.li>
              ) : null}

              {visible.map((opt, i) => {
                const active = opt.value === value;
                const trailIndex = variant === 'C' ? trail.indexOf(opt.value) : -1;
                return (
                  <motion.li
                    key={opt.value}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => markHover(opt.value)}
                    // A — options arrive on their own spring in a short cascade, so a long list
                    // reads as one panel unfolding rather than a block appearing from nowhere.
                    // D does the same from below, which is what a sheet rising looks like.
                    initial={rowInitial}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={rowTransition(i)}
                  >
                    <button
                      type="button"
                      onClick={() => pick(opt.value)}
                      onFocus={() => markHover(opt.value)}
                      className={cn(
                        'relative flex min-h-[var(--target-min)] w-full cursor-pointer items-center justify-between gap-2',
                        'rounded-field px-3 text-left text-body outline-none',
                        'transition-colors duration-[var(--duration-instant)]',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                        // D's rows are thumb-sized, not pointer-sized: a sheet exists because the
                        // hand is holding the phone, and a 44px row in a 60vh surface is stingy.
                        asSheet && 'min-h-[calc(var(--target-min)+--spacing(2))]',
                        variant !== 'C' && 'hover:bg-accent-subtle',
                        active ? 'text-accent' : 'text-text-1',
                      )}
                    >
                      {/* B — the check is 20px of glyph moving 44px, which is honest but quiet.
                          The rail is the same journey drawn at full row height, so the SLIDE is
                          legible from across the room and in a playground cell four inches wide.
                          Same layout group, so the two travel together as one object. */}
                      {variant === 'B' && active ? (
                        <motion.span
                          aria-hidden
                          layoutId={`${listId}-rail`}
                          className="absolute inset-y-1 left-1 w-1 rounded-chip bg-accent"
                          transition={motionSafe ? SPRING.tight : { duration: 0 }}
                        />
                      ) : null}

                      {/* C — ONE highlight, which slides between rows, plus the fading marks of
                          the two rows before it. Every other variant lights each row on its own.
                          The live highlight carries a border the ghosts do not: without it the
                          trail is four tints of one colour and the eye cannot tell which end of it
                          is now. */}
                      {variant === 'C' && hover === opt.value ? (
                        <motion.span
                          aria-hidden
                          layoutId={`${listId}-trail`}
                          className="absolute inset-0 rounded-field border-[length:var(--border-width)] border-[var(--accent-border)] bg-accent-subtle"
                          transition={motionSafe ? SPRING.base : { duration: 0 }}
                        />
                      ) : null}
                      {variant === 'C' && trailIndex > 0 ? (
                        // The ghost DECAYS into its resting opacity rather than arriving at it, so
                        // the trail behaves like something the highlight left behind. Reduced
                        // motion keeps the mark and drops the fade: the row you came from is still
                        // marked, it just does not animate there.
                        <motion.span
                          aria-hidden
                          className="absolute inset-0 rounded-field bg-accent-subtle"
                          initial={motionSafe ? { opacity: 0.85 } : false}
                          animate={{ opacity: trailIndex === 1 ? 0.5 : 0.22 }}
                          transition={{ duration: motionSafe ? DUR.slow : 0, ease: EASE_STANDARD }}
                        />
                      ) : null}

                      <span className="relative truncate">
                        {variant === 'E' ? <Matched text={opt.label} query={query} /> : opt.label}
                      </span>
                      {active ? (
                        <motion.span
                          className="relative inline-flex shrink-0"
                          // B — there is exactly one check in the panel and it MOVES to the row
                          // you pick, rather than one blinking off and another blinking on. The
                          // layout id is namespaced per instance so the five demos standing side
                          // by side in the playground do not throw their checks at each other.
                          layoutId={variant === 'B' ? `${listId}-check` : undefined}
                          initial={motionSafe && variant === 'B' ? { x: 12, opacity: 0 } : false}
                          animate={{ x: 0, opacity: 1 }}
                          transition={motionSafe ? SPRING.tight : { duration: 0 }}
                        >
                          <Check size={20} strokeWidth={2.5} aria-hidden />
                        </motion.span>
                      ) : null}
                    </button>
                  </motion.li>
                );
              })}

              {visible.length === 0 ? (
                <li
                  role="presentation"
                  className={cn('text-body-s px-3 py-3', noMatch ? 'text-danger' : 'text-text-3')}
                >
                  {t('library.emptyTitle')}
                </li>
              ) : null}
            </motion.ul>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ══ E9 — Date picker ═══════════════════════════════════════════════════════════════════════ */

const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();

/** E — the grid enters from the side you swiped from, and leaves towards the other one. */
const SLIDE = {
  enter: (dir: number) => ({ x: dir * 36, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -36, opacity: 0 }),
};

export function DatePicker({
  value,
  onChange,
  label,
}: {
  value: Date | null;
  /** Same contract as Select: a promise gets the spinner, a rejection gets the warning glyph. */
  onChange: (next: Date) => void | Promise<unknown>;
  label: string;
}) {
  const { t } = useTranslation();
  const variant = useElementVariant('E9');
  const motionSafe = useMotionSafe();
  const [month, setMonth] = useState(() => startOfDay(value ?? new Date()));
  // B keeps its own range, because the component's contract is one Date and widening it would
  // change every caller. `onChange` still fires with the day you tapped; the band is local.
  const [range, setRange] = useState<{ start: Date; end: Date | null } | null>(null);
  // D — the grid is the fallback, not the default, so it starts folded away.
  const [gridOpen, setGridOpen] = useState(false);
  const [dir, setDir] = useState(0);
  /**
   * A — bumped on every pick, including a pick of the day that was already chosen.
   *
   * The pop used to be keyed on the DATE, which meant tapping the selected day a second time
   * changed no key, remounted nothing and produced no feedback at all — the one press in this
   * control that looks like it did nothing is the one that confirms what you already chose.
   */
  const [popKey, setPopKey] = useState(0);
  const { state, failKey, commit, flash, detached } = useCommitState();
  const today = startOfDay(new Date());

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // Monday-first, which is what a Hungarian calendar looks like.
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month);

  const quick = [
    { key: 'today', date: today },
    { key: 'tomorrow', date: new Date(today.getTime() + DAY_MS) },
    { key: 'nextWeek', date: new Date(today.getTime() + 7 * DAY_MS) },
  ];

  const go = (delta: number) => {
    setDir(delta);
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  };

  /** Where a day sits in B's band: an anchor, a painted middle, or outside it. */
  const rangeRole = (d: Date): 'none' | 'edge' | 'mid' => {
    if (variant !== 'B' || !range) return 'none';
    const from = range.start.getTime();
    const to = range.end ? range.end.getTime() : from;
    const at = d.getTime();
    if (at === from || at === to) return 'edge';
    return at > from && at < to ? 'mid' : 'none';
  };

  const pickDay = (d: Date) => {
    setPopKey((k) => k + 1);
    if (variant !== 'B') {
      commit(() => onChange(d));
      return;
    }
    if (!range || range.end) {
      setRange({ start: d, end: null });
      commit(() => onChange(d));
      return;
    }
    if (d.getTime() < range.start.getTime()) {
      // A range cannot end before it starts. Most pickers re-anchor silently, which leaves the
      // user wondering why their second tap became a first one — so this one SAYS it: the glyph
      // beside the label turns into a warning, the card shakes, and the band restarts here.
      detached(() => onChange(d));
      setRange({ start: d, end: null });
      flash('fail');
      return;
    }
    setRange({ start: range.start, end: d });
    commit(() => onChange(d));
  };

  // C — which arrow leads back to today, when today is not on screen. Zero when it is.
  const towardsToday = monthIndex(today) - monthIndex(month);
  const announcementKey = ANNOUNCEMENT[state];
  const gridVisible = variant !== 'D' || gridOpen;

  const grid = (
    /*
      The 44px floor applies to BOTH axes. Seven columns inside a narrow card squeeze each
      day to ~35px wide — tall enough, too thin to hit reliably. So the cells keep a minimum
      width and the calendar scrolls inside its own box instead: a control that overflows is
      recoverable, a control too small to tap is not. Static linting cannot see this, because
      the width comes out of the layout rather than out of a class.
    */
    <div className="mt-2 overflow-x-auto">
      <div className="grid min-w-[max-content] grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = new Date(month.getFullYear(), month.getMonth(), i + 1);
          const isToday = date.getTime() === today.getTime();
          const role = rangeRole(date);
          const isSelected =
            variant === 'B'
              ? role === 'edge'
              : value
                ? startOfDay(value).getTime() === date.getTime()
                : false;
          // B — the anchor of a range that is still waiting for its other end. Until this existed
          // B's first tap was indistinguishable from A's, C's or E's: one filled day, no hint that
          // the control was mid-sentence and expecting a second word. A dashed edge instead of a
          // fill is the difference between "chosen" and "chosen so far".
          const pendingAnchor = variant === 'B' && isSelected && !!range && !range.end;
          // B paints outward from the start, one day at a time, so the band reads as a stroke
          // rather than as a rectangle that was always there.
          const paintDelay =
            range && role === 'mid'
              ? Math.min((date.getTime() - range.start.getTime()) / DAY_MS, 12) * 0.035
              : 0;
          return (
            <button
              key={date.toISOString()}
              type="button"
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => pickDay(date)}
              className={cn(
                'relative inline-flex size-[var(--target-min)] cursor-pointer items-center justify-center',
                'rounded-chip text-body-s tabular-nums outline-none',
                'transition-[background-color,transform] duration-[var(--duration-instant)]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                isSelected
                  ? pendingAnchor
                    ? 'border-[length:var(--border-width)] border-dashed border-[var(--accent-border)] text-accent'
                    : // A's fill is not a class — it is a spring that LANDS on the day (below), so
                      // the button stays unpainted and the overlay carries the colour. Every other
                      // variant paints it outright, which is why only A's selection has weight.
                      variant === 'A'
                      ? 'text-accent-fg'
                      : 'bg-accent text-accent-fg'
                  : role === 'mid'
                    ? 'text-on-accent-subtle'
                    : 'text-text-2 hover:bg-accent-subtle',
                // A — the chosen day is physically bigger than its neighbours, not merely a
                // different colour. Dropped under reduced motion; the ring below replaces it.
                isSelected && variant === 'A' && motionSafe && 'scale-110',
                // C — today stays legible as today even while another day is selected.
                isToday && variant === 'C' && !isSelected && 'text-accent',
              )}
            >
              {/* A — the POP. The accent fill is thrown at the day on a soft spring, so it
                  overshoots the cell and settles into it; the day does not simply become blue.
                  Keyed on the pick counter rather than on the date, so confirming the day you
                  already had pops again instead of sitting there.

                  Reduced motion keeps the fill and drops the throw: `initial={false}` means it is
                  painted at full size on the frame it appears, which is the state change intact
                  with its duration collapsed to zero — not the state change removed. */}
              {isSelected && variant === 'A' ? (
                <motion.span
                  key={`pop-${popKey}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-chip bg-accent"
                  initial={motionSafe ? { scale: 0.3, opacity: 0.35 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={motionSafe ? SPRING.soft : { duration: 0 }}
                />
              ) : null}

              {/* A — a ring leaves the chosen day and fades outward. Under reduced motion it does
                  not travel: it simply sits there, a permanent halo on the selected day, so the
                  state change survives with its duration collapsed rather than being deleted. */}
              {isSelected && variant === 'A' ? (
                <motion.span
                  key={`ring-${popKey}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-chip border-[length:var(--border-width)] border-[var(--accent-border)]"
                  initial={motionSafe ? { scale: 0.55, opacity: 1 } : false}
                  animate={motionSafe ? { scale: 1.8, opacity: 0 } : { scale: 1.15, opacity: 1 }}
                  transition={{ duration: motionSafe ? DUR.slow : 0, ease: EASE_STANDARD }}
                />
              ) : null}

              {/* B — the band between the two anchors, painted on. */}
              {role === 'mid' ? (
                <motion.span
                  key={`${range?.start.getTime()}-${range?.end?.getTime()}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 origin-left rounded-chip bg-accent-subtle"
                  initial={motionSafe ? { scaleX: 0, opacity: 0.4 } : false}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{
                    duration: motionSafe ? DUR.base : 0,
                    delay: motionSafe ? paintDelay : 0,
                    ease: EASE_STANDARD,
                  }}
                />
              ) : null}

              {/* C — today breathes. An ambient loop, on --duration-ambient, which is the token
                  that exists for exactly this: emphasis that repeats rather than transitions.
                  Reduced motion gets the same ring, standing still. */}
              {isToday && variant === 'C' ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-chip border-[length:var(--border-width)] border-[var(--accent-border)]"
                  animate={
                    motionSafe
                      ? { scale: [1, 1.14, 1], opacity: [0.95, 0.35, 0.95] }
                      : { scale: 1, opacity: 0.95 }
                  }
                  transition={
                    motionSafe
                      ? { duration: DUR.ambient, repeat: Infinity, ease: EASE_STANDARD }
                      : { duration: 0 }
                  }
                />
              ) : null}

              <span className="relative">{i + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const card = (
    /* The canonical card, reading its padding from --card-pad rather than re-deciding it. */
    <div className="rounded-card border border-[var(--surface-border)] bg-surface-1 p-[var(--card-pad)]">
      <div className="flex items-center justify-between gap-2">
        <Pressable
          shape="icon"
          variant="ghost"
          aria-label={t('common.prevMonth')}
          onClick={() => go(-1)}
        >
          <ChevronDown size={20} strokeWidth={2} aria-hidden className="rotate-90" />
          {/* C — when today is off screen, the arrow that leads back to it keeps pulsing. The
              calendar never loses its anchor, even when the anchor is two months away. */}
          {variant === 'C' && towardsToday < 0 ? (
            <motion.span
              aria-hidden
              className="absolute right-1 top-1 size-2 rounded-chip bg-accent"
              animate={motionSafe ? { opacity: [1, 0.25, 1], scale: [1, 0.75, 1] } : { opacity: 1 }}
              transition={
                motionSafe ? { duration: DUR.ambient, repeat: Infinity, ease: EASE_STANDARD } : { duration: 0 }
              }
            />
          ) : null}
        </Pressable>

        {variant === 'E' ? (
          // E — the month is a rail you throw sideways. The arrows stay, because a drag is not a
          // keyboard affordance and this control has to work without a pointer at all.
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.35}
            dragSnapToOrigin
            onDragEnd={(_event, info) => {
              if (info.offset.x <= -SWIPE_PX || info.velocity.x <= -SWIPE_VELOCITY) go(1);
              else if (info.offset.x >= SWIPE_PX || info.velocity.x >= SWIPE_VELOCITY) go(-1);
            }}
            className="flex min-h-[var(--target-min)] flex-1 cursor-grab touch-pan-y select-none items-center justify-center gap-2 active:cursor-grabbing"
          >
            <ChevronDown size={16} strokeWidth={2} aria-hidden className="rotate-90 text-text-3" />
            <span className="text-body-s capitalize text-text-1">{monthLabel}</span>
            <ChevronDown size={16} strokeWidth={2} aria-hidden className="-rotate-90 text-text-3" />
          </motion.div>
        ) : (
          <span className="text-body-s capitalize text-text-1">{monthLabel}</span>
        )}

        <Pressable
          shape="icon"
          variant="ghost"
          aria-label={t('common.nextMonth')}
          onClick={() => go(1)}
        >
          <ChevronDown size={20} strokeWidth={2} aria-hidden className="-rotate-90" />
          {variant === 'C' && towardsToday > 0 ? (
            <motion.span
              aria-hidden
              className="absolute right-1 top-1 size-2 rounded-chip bg-accent"
              animate={motionSafe ? { opacity: [1, 0.25, 1], scale: [1, 0.75, 1] } : { opacity: 1 }}
              transition={
                motionSafe ? { duration: DUR.ambient, repeat: Infinity, ease: EASE_STANDARD } : { duration: 0 }
              }
            />
          ) : null}
        </Pressable>
      </div>

      {variant === 'E' ? (
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={month.getTime()}
            custom={dir}
            variants={SLIDE}
            initial={motionSafe ? 'enter' : false}
            animate="center"
            exit={motionSafe ? 'exit' : undefined}
            transition={{ duration: motionSafe ? DUR.fast : 0, ease: EASE_STANDARD }}
          >
            {grid}
          </motion.div>
        </AnimatePresence>
      ) : (
        grid
      )}
    </div>
  );

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <span className="text-body-s text-text-2">{label}</span>
        <CommitGlyph
          state={state}
          size={16}
          motionSafe={motionSafe}
          idle={<CalendarDays size={16} strokeWidth={2} aria-hidden className="text-text-3" />}
        />
        <span aria-live="polite" className="sr-only">
          {announcementKey ? t(announcementKey) : ''}
        </span>
      </div>

      {/* D — the three dates people actually pick, one tap away, before any calendar grid. */}
      {variant === 'D' ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {quick.map((q, i) => {
            const chosen = value ? startOfDay(value).getTime() === q.date.getTime() : false;
            return (
              <motion.div
                key={q.key}
                initial={motionSafe ? { opacity: 0, y: 10, scale: 0.9 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={motionSafe ? { ...SPRING.tight, delay: i * 0.05 } : { duration: 0 }}
              >
                <Pressable
                  shape="chip"
                  density="compact"
                  variant={chosen ? 'primary' : 'secondary'}
                  // The chosen chip changes its GLYPH, not only its fill — the requirement the
                  // owner named, applied to the one place this variant is actually used.
                  icon={chosen ? <Check size={16} strokeWidth={2.5} aria-hidden /> : undefined}
                  onClick={() => {
                    setMonth(q.date);
                    pickDay(q.date);
                  }}
                >
                  {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(q.date)}
                </Pressable>
              </motion.div>
            );
          })}

          {/* …and the grid only when the chips were not enough. That is the whole idea of D:
              the calendar is the fallback, not the interface. */}
          <Pressable
            density="compact"
            aria-expanded={gridOpen}
            onClick={() => setGridOpen((v) => !v)}
          >
            {t(gridOpen ? 'common.less' : 'common.more')}
            <ChevronDown
              size={16}
              strokeWidth={2}
              aria-hidden
              className={cn(
                'transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
                gridOpen && 'rotate-180',
              )}
            />
          </Pressable>
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {gridVisible ? (
          <motion.div
            key="calendar"
            className="overflow-hidden"
            initial={variant === 'D' && motionSafe ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }}
            transition={{ duration: motionSafe ? DUR.base : 0, ease: EASE_STANDARD }}
          >
            <motion.div
              key={failKey}
              className="mt-2"
              animate={shakeAnimate(state === 'fail', motionSafe)}
              transition={{ duration: motionSafe ? DUR.slow : 0, ease: EASE_STANDARD }}
            >
              {card}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* B — how long the band you painted actually is. */}
      {variant === 'B' && range?.end ? (
        <p className="text-caption mt-2 text-text-2">
          {t('plans.dayCount', {
            count: Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS) + 1,
          })}
        </p>
      ) : null}
    </div>
  );
}
