import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useDragControls, useMotionValue } from 'motion/react';
import { Check, Loader2, Plus, RotateCw, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { Gauge } from '../Gauge';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING } from '../useMotionSafe';

/* ══ The state vocabulary these two elements share ══════════════════════════════════════════ */

/**
 * What an element is currently DOING, not what colour it is.
 *
 * The rule this type exists to enforce: a state change swaps the GLYPH. A green button and a red
 * button are the same shape at a glance, and to a reader with a colour deficiency or a phone in
 * sunlight they are the same button — so `busy` is a spinner, `success` is a tick and `error` is a
 * warning triangle that shakes. Colour rides along; it is never the only carrier.
 *
 * `error` is the half that gets skipped. Both of these elements can fail — a sheet whose save was
 * rejected, a FAB whose action threw — and a failure that closes the surface as if it had worked
 * is the worst outcome available, so the failure path is built here beside the success one.
 */
export type ElementStatus = 'idle' | 'busy' | 'success' | 'error';

/**
 * A shake, as keyframes rather than a CSS animation.
 *
 * `index.css` is where a keyframe would have to be declared and it is shared by everyone, so this
 * project builds motion in `motion` instead. Six stops rather than a smooth wobble: a shake reads
 * as "no" because it REVERSES, and a sine wave reads as decoration.
 */
const SHAKE: number[] = [0, -8, 8, -6, 6, 0];

/**
 * The axes an outcome is allowed to move on.
 *
 * Deliberately four, and deliberately not colour: colour is how the status BADGE speaks and it
 * already says the same thing in every variant. What a variant owns is its gesture.
 */
type Settle = { x?: number[]; y?: number[]; scale?: number[]; rotate?: number[] };

/** How long the confirmation is HELD. Not an animation — see the note in `Sheet`. */
const CONFIRM_MS = 900;

const STATUS_TONE: Record<Exclude<ElementStatus, 'idle'>, string> = {
  busy: 'bg-surface-2 text-text-2',
  success: 'bg-success text-on-success',
  error: 'bg-danger text-on-danger',
};

/** The glyph itself. One place, so the three call sites cannot disagree about what "error" looks like. */
function StatusIcon({ status, size }: { status: Exclude<ElementStatus, 'idle'>; size: number }) {
  if (status === 'busy') {
    // `animate-spin` is one of the two built-ins index.css has pinned to a token duration.
    return (
      <Loader2 size={size} strokeWidth={2.5} aria-hidden className="animate-spin motion-reduce:animate-none" />
    );
  }
  if (status === 'error') return <TriangleAlert size={size} strokeWidth={2.5} aria-hidden />;
  return <Check size={size} strokeWidth={3} aria-hidden />;
}

/**
 * The badge the glyph sits in.
 *
 * Under reduced motion the badge still APPEARS and the icon still changes — only the spring and
 * the shake collapse to nothing. The user has to be able to learn that something happened; that is
 * the part reduced motion never gets to remove.
 */
function StatusBadge({
  status,
  size,
  box,
  motionSafe,
}: {
  status: Exclude<ElementStatus, 'idle'>;
  size: number;
  box: string;
  motionSafe: boolean;
}) {
  return (
    <motion.span
      className={cn('inline-flex items-center justify-center rounded-chip', box, STATUS_TONE[status])}
      initial={motionSafe ? { scale: 0.5, opacity: 0 } : false}
      animate={
        motionSafe && status === 'error'
          ? { scale: 1, opacity: 1, x: SHAKE }
          : { scale: 1, opacity: 1, x: 0 }
      }
      exit={motionSafe ? { scale: 0.5, opacity: 0 } : undefined}
      transition={motionSafe ? SPRING.tight : { duration: 0 }}
    >
      <StatusIcon status={status} size={size} />
    </motion.span>
  );
}

/**
 * The same state, for a reader who cannot see the glyph.
 *
 * A live region rather than an `aria-label` on the icon: the icon is decoration, the STATE is the
 * news, and news has to be announced without the user going looking for it.
 */
function StatusAnnounce({ status }: { status: ElementStatus }) {
  const { t } = useTranslation();
  const text =
    status === 'busy'
      ? t('common.loading')
      : status === 'success'
        ? t('home.done')
        : status === 'error'
          ? t('common.retry')
          : '';
  return (
    <span role="status" className="sr-only">
      {text}
    </span>
  );
}

/* ══ E14 — Modal / bottom sheet ═════════════════════════════════════════════════════════════ */

export function Sheet({
  open,
  onClose,
  title,
  children,
  status = 'idle',
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * Whatever the sheet's work is currently doing. Every variant shows it — the glyph swaps in the
   * header — and variant E gives the whole panel over to it.
   */
  status?: ElementStatus;
  /** Offered beside the error glyph. An error with no way forward is a dead end, not feedback. */
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const variant = useElementVariant('E14');
  const motionSafe = useMotionSafe();
  const panel = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  /** C — where this sheet was summoned FROM, in viewport pixels, relative to the screen centre. */
  const morph = useRef<{ x: number; y: number } | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  /** E — the confirmation the sheet plays instead of vanishing. */
  const [confirming, setConfirming] = useState(false);
  const closeTimer = useRef<number | null>(null);

  // Escape closes, and focus moves into the sheet on open. A dialog you cannot leave with the
  // keyboard is a trap, and one that never takes focus leaves the reader outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // C — Safari does not focus a button when it is clicked, so `document.activeElement` alone would
  // send half the world's users to the fallback. The last pointer-down covers them.
  useEffect(() => {
    if (variant !== 'C') return;
    const onDown = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [variant]);

  // A closed sheet forgets everything: the next open is a fresh one, not a resumed one.
  useEffect(() => {
    if (open) return;
    setConfirming(false);
    morph.current = null;
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  /*
   * The trigger's rect, read at the render that OPENS the sheet.
   *
   * It has to happen here and not in an effect: `initial` is read by Motion the moment the panel
   * mounts, and an effect runs after that — the morph would start from a value that arrived one
   * frame too late, which is to say it would not morph at all. At this point in the render focus
   * is still on the trigger, because the effect above is what moves it.
   *
   * Writing a ref during render is safe only because it is idempotent: it reads the DOM, writes
   * once per open, and a second invocation (StrictMode) sees the value already there and skips.
   */
  if (open && variant === 'C' && morph.current === null && typeof document !== 'undefined') {
    const el = document.activeElement as HTMLElement | null;
    const r = el && el !== document.body ? el.getBoundingClientRect() : null;
    const cx = r && r.width > 0 ? r.left + r.width / 2 : (pointer.current?.x ?? window.innerWidth / 2);
    const cy = r && r.width > 0 ? r.top + r.height / 2 : (pointer.current?.y ?? window.innerHeight / 2);
    morph.current = { x: cx - window.innerWidth / 2, y: cy - window.innerHeight / 2 };
  }

  /*
   * E — Success-close. The close button does not close: it confirms, then closes.
   *
   * `CONFIRM_MS` does NOT collapse under reduced motion. The dwell is not animation — it is how
   * long the tick is legible — and cutting it to zero would delete the state change rather than
   * shorten its travel, which is exactly the mistake reduced motion is not allowed to make. What
   * collapses is the spring the tick arrives on.
   *
   * Escape still closes instantly. A confirmation is a courtesy; the escape hatch is not.
   */
  const confirms = variant === 'E' && status === 'idle';
  const requestClose = () => {
    if (!confirms) {
      onClose();
      return;
    }
    setConfirming(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      onClose();
    }, CONFIRM_MS);
  };

  const shown: ElementStatus = confirming ? 'success' : status;
  /** E hands the panel over to the state. The others put it in the header and keep the content. */
  const takeover = variant === 'E' && shown !== 'idle';
  const centred = variant === 'B' || variant === 'C';

  /**
   * WHAT EACH SHEET DOES WHEN THE ANSWER LANDS.
   *
   * The header badge was the same badge in all five, which is the whole complaint in one line: the
   * variants differed on the way IN and were identical from then on. A variant is a claim about
   * what kind of object this is, so an object that arrives like a physical panel should answer like
   * one. Each keeps the axis it already established:
   *
   *   A is a thing on a spring    → kicks up and settles on yes, is rebuffed and drops back on no
   *   B only ever grows in place  → swells on yes, flinches sideways on no
   *   C came out of its trigger   → begins folding back toward it on yes, refuses to move on no
   *   D is the top of a deck      → presses down into the stack on yes, the deck jolts on no
   *
   * Nothing for `busy` or `idle`. A sheet that twitches while it waits reads as broken, and the
   * spinner in the header is already saying the only thing there is to say.
   */
  const settle: Settle = (() => {
    if (!motionSafe || shown === 'idle' || shown === 'busy') return {};
    const bad = shown === 'error';
    switch (variant) {
      case 'A':
        return bad ? { y: [0, 18, -6, 0] } : { y: [0, -14, 0] };
      case 'B':
        return bad ? { x: SHAKE, scale: [1, 0.98, 1] } : { scale: [1, 1.045, 1] };
      case 'C':
        return bad ? { rotate: [0, -1.5, 1.5, 0] } : { scale: [1, 0.93, 1] };
      case 'D':
        return bad ? { rotate: [0, -1.2, 1.2, 0], y: [0, -8, 0] } : { y: [0, 10, 0] };
      default:
        return {};
    }
  })();

  const body = takeover ? (
    <div className="flex flex-col items-center gap-4 py-8">
      <StatusBadge status={shown as Exclude<ElementStatus, 'idle'>} size={28} box="size-12" motionSafe={motionSafe} />
      {shown === 'error' && onRetry ? (
        <Pressable
          density="compact"
          icon={<RotateCw size={20} strokeWidth={2} aria-hidden />}
          onClick={onRetry}
        >
          {t('common.retry')}
        </Pressable>
      ) : null}
    </div>
  ) : (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-title-3 text-text-1">{title}</h2>
        <div className="flex items-center gap-2">
          <AnimatePresence initial={false} mode="wait">
            {shown !== 'idle' ? (
              <StatusBadge
                key={shown}
                status={shown}
                size={18}
                box="size-8"
                motionSafe={motionSafe}
              />
            ) : null}
          </AnimatePresence>
          {shown === 'error' && onRetry ? (
            <Pressable shape="icon" variant="ghost" aria-label={t('common.retry')} onClick={onRetry}>
              <RotateCw size={20} strokeWidth={2} aria-hidden />
            </Pressable>
          ) : null}
          <Pressable shape="icon" variant="ghost" aria-label={t('common.close')} onClick={requestClose}>
            <X size={20} strokeWidth={2} aria-hidden />
          </Pressable>
        </div>
      </div>
      {children}
    </>
  );

  const shell = {
    ref: panel,
    role: 'dialog',
    'aria-modal': true,
    'aria-label': title,
    'aria-busy': shown === 'busy' || undefined,
    tabIndex: -1,
  } as const;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            aria-hidden
            onClick={requestClose}
            className={cn(
              // Blur signals "the thing behind is dismissable", which is its only legitimate
              // use per the platform guidance — never as decoration.
              'fixed inset-0 z-[var(--z-sheet)] bg-scrim backdrop-blur-[var(--blur-sm)]',
              // B is a DIALOG: it sits on the page rather than behind glass, so the page stays
              // readable underneath and the two centred variants are told apart before they move.
              variant === 'B' && 'backdrop-blur-none',
              variant === 'D' && 'bg-scrim-strong',
            )}
            initial={motionSafe ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={motionSafe ? { opacity: 0 } : undefined}
            transition={{ duration: motionSafe ? 0.25 : 0 }}
          />

          {centred ? (
            /* The centring lives on a wrapper so the panel's own transform is free for the
               morph. Tailwind's `-translate-x-1/2` and a Motion `x` are the same CSS property,
               and the one that loses is whichever the library did not write. */
            <div className="pointer-events-none fixed inset-0 z-[var(--z-sheet)] grid place-items-center p-4">
              <motion.div
                {...shell}
                className={cn(
                  'pointer-events-auto w-[min(92vw,420px)] rounded-card p-4 outline-none',
                  'bg-[var(--sheet-bg)] shadow-[var(--sheet-shadow)]',
                )}
                initial={
                  motionSafe
                    ? variant === 'C'
                      ? {
                          opacity: 0,
                          scale: 0.2,
                          x: morph.current?.x ?? 0,
                          y: morph.current?.y ?? 0,
                        }
                      : { opacity: 0, scale: 0.9 }
                    : false
                }
                animate={{ opacity: 1, scale: 1, x: 0, y: 0, ...settle }}
                exit={
                  motionSafe
                    ? variant === 'C'
                      ? {
                          opacity: 0,
                          scale: 0.2,
                          x: morph.current?.x ?? 0,
                          y: morph.current?.y ?? 0,
                        }
                      : { opacity: 0, scale: 0.9 }
                    : undefined
                }
                // C travels a long way, so it rides the medium spring; B only grows in place and
                // can afford the snappy one.
                transition={motionSafe ? (variant === 'C' ? SPRING.base : SPRING.tight) : { duration: 0 }}
              >
                {body}
                <StatusAnnounce status={shown} />
              </motion.div>
            </div>
          ) : (
            <motion.div
              {...shell}
              className={cn(
                'fixed z-[var(--z-sheet)] bg-[var(--sheet-bg)] outline-none',
                'shadow-[var(--sheet-shadow)]',
                'inset-x-0 bottom-0 rounded-t-[var(--radius-sheet)] p-4 pb-[calc(--spacing(4)+env(safe-area-inset-bottom))]',
                // D floats clear of the screen edges, because a deck has to have edges to stack.
                variant === 'D' && 'inset-x-1 bottom-1 rounded-[var(--radius-sheet)]',
              )}
              // A — the sheet is a physical object: it follows the finger, resists past its rest
              // position, and either returns on a spring or is thrown away. `dragListener={false}`
              // keeps that gesture on the handle, so a drag never eats a scroll or a text
              // selection inside the content.
              drag={variant === 'A' ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.55 }}
              dragMomentum={false}
              onDragEnd={(_event, info) => {
                if (info.offset.y > 96 || info.velocity.y > 600) onClose();
              }}
              initial={motionSafe ? { y: '100%' } : false}
              animate={{ y: 0, ...settle }}
              exit={motionSafe ? { y: '100%' } : undefined}
              // A sheet rides a softer spring than a button: a large surface that snaps looks
              // weightless, and the Bible caps large-surface motion at 400ms.
              transition={motionSafe ? SPRING.soft : { duration: 0 }}
            >
              {/* D — Stacked-sheets. Two more panels behind this one, peeking above its top edge
                  and fanning up on a stagger, so the surface reads as the top of a deck rather
                  than as the only thing there. Ordered back-to-front: the taller strip is drawn
                  first and the wider one covers its lower half. */}
              {variant === 'D' ? (
                <>
                  <motion.span
                    aria-hidden
                    className="absolute inset-x-4 bottom-full h-6 rounded-t-[var(--radius-sheet)] border-[length:var(--border-width)] border-b-0 border-[var(--surface-border)] bg-surface-2"
                    initial={motionSafe ? { y: 16, opacity: 0 } : false}
                    animate={{ y: 0, opacity: 1 }}
                    transition={motionSafe ? { ...SPRING.soft, delay: 0.08 } : { duration: 0 }}
                  />
                  <motion.span
                    aria-hidden
                    className="absolute inset-x-2 bottom-full h-3 rounded-t-[var(--radius-sheet)] border-[length:var(--border-width)] border-b-0 border-[var(--surface-border)] bg-surface-1"
                    initial={motionSafe ? { y: 12, opacity: 0 } : false}
                    animate={{ y: 0, opacity: 1 }}
                    transition={motionSafe ? { ...SPRING.soft, delay: 0.04 } : { duration: 0 }}
                  />
                </>
              ) : null}

              {variant !== 'D' ? (
                <span
                  aria-hidden
                  onPointerDown={variant === 'A' ? (e) => dragControls.start(e) : undefined}
                  className={cn(
                    'mx-auto mb-3 flex items-center justify-center',
                    // A's handle is the grip, so it is big enough to grab and says so.
                    variant === 'A' ? 'h-6 w-16 cursor-grab touch-none active:cursor-grabbing' : 'h-1',
                  )}
                >
                  <span
                    className={cn(
                      'block rounded-chip bg-surface-3',
                      variant === 'A' ? 'h-1.5 w-12' : 'h-1 w-10',
                    )}
                  />
                </span>
              ) : null}

              {body}
              <StatusAnnounce status={shown} />
            </motion.div>
          )}
        </>
      ) : null}
    </AnimatePresence>
  );
}

/* ══ E13 — Swipeable list item ══════════════════════════════════════════════════════════════ */

export function SwipeItem({
  children,
  onComplete,
  onDelete,
}: {
  children: ReactNode;
  onComplete?: () => void;
  onDelete?: () => void;
}) {
  const variant = useElementVariant('E13');
  const motionSafe = useMotionSafe();
  const [offset, setOffset] = useState(0);
  const start = useRef(0);
  const dragging = useRef(false);

  const THRESHOLD = 96;

  const end = () => {
    dragging.current = false;
    if (offset > THRESHOLD && onComplete) {
      onComplete();
    } else if (offset < -THRESHOLD && onDelete) {
      onDelete();
    }
    setOffset(0);
  };

  return (
    <div className="relative overflow-hidden rounded-card">
      {/* The action beneath is revealed by the swipe, so the gesture explains itself instead of
          having to be known in advance. */}
      <div className="absolute inset-0 flex items-center justify-between px-4">
        <span className="text-body-s inline-flex items-center gap-2 text-success">
          <Check size={20} strokeWidth={2.5} aria-hidden />
        </span>
        <span className="text-body-s inline-flex items-center gap-2 text-danger">
          <X size={20} strokeWidth={2.5} aria-hidden />
        </span>
      </div>

      <div
        className={cn(
          // Card padding comes from --card-pad, which had zero consumers while `p-3` beat `p-4`
          // 121:62 across the product — the one density decision a theme pack cannot reach.
          'relative border border-[var(--surface-border)] bg-surface-1 p-[var(--card-pad)]',
          offset > THRESHOLD && variant === 'B' && 'bg-[var(--success-subtle)]',
        )}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging.current || !motionSafe ? 'none' : 'transform var(--duration-base) var(--ease-standard)',
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          start.current = e.clientX;
          // Capture, so the drag survives the pointer leaving the element — otherwise a fast
          // swipe stops halfway and springs back for no visible reason.
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const dx = e.clientX - start.current;
          // Damping past the threshold: real objects slow before they stop, they do not hit a wall.
          setOffset(Math.abs(dx) > THRESHOLD ? dx * 0.4 + Math.sign(dx) * THRESHOLD * 0.6 : dx);
        }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {children}
      </div>
    </div>
  );
}

/* ══ E20 — Floating action button ═══════════════════════════════════════════════════════════ */

const FAB_STACK = [
  'fixed right-4 z-[var(--z-nav)] flex flex-col items-end gap-2',
  'bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+--spacing(4))]',
].join(' ');

/** D — where the button will land if it is let go on this side. */
const DOCK_HINT = [
  'pointer-events-none fixed z-[var(--z-nav)] size-14 rounded-chip',
  'border-[length:var(--border-width)] border-dashed border-[var(--accent-border)]',
  'bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+--spacing(4))]',
].join(' ');

export function Fab({
  label,
  onPress,
  actions,
  progress,
}: {
  label: string;
  /** May return a promise; if it does, the button spins while it runs and reports how it ended. */
  onPress?: () => unknown;
  /**
   * `onSelect` may return a promise, and if it does the FAB reports how it ended exactly as
   * `onPress` does — spinner, then tick or warning.
   *
   * IT COULD NOT BEFORE, AND THAT LEFT TWO VARIANTS MUTE. `press()` short-circuits to opening the
   * menu whenever a variant is expandable, so for A (speed-dial) and B (morph-sheet) `run()` was
   * unreachable: the two variants whose entire purpose is to LAUNCH one of several actions were
   * the two that could never say whether the action worked. Routing the selection through the same
   * `run()` fixes that without a second state machine — and it is the honest shape anyway, because
   * what the user is waiting on after tapping `Exercise` is the exercise being added, not the menu
   * closing.
   */
  actions?: { label: string; icon: ReactNode; onSelect: () => unknown }[];
  /**
   * E only: 0–100, a REAL fraction of something countable. When it is absent the halo falls back
   * to how far the page is scrolled — also a real measurement. It never invents a number.
   */
  progress?: number;
}) {
  const { t } = useTranslation();
  const variant = useElementVariant('E20');
  const motionSafe = useMotionSafe();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [state, setState] = useState<ElementStatus>('idle');
  const [scrolled, setScrolled] = useState(0);
  const [dragging, setDragging] = useState(false);
  const lastY = useRef(0);
  const dock = useRef<HTMLDivElement>(null);
  const reset = useRef<number | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // C — collapse while scrolling down, return on scroll up. A FAB that covers content the user
  // is actively reading is worse than one they have to scroll back for.
  useEffect(() => {
    if (variant !== 'C') return;
    const onScroll = () => {
      const next = window.scrollY;
      setHidden(next > lastY.current && next > 120);
      lastY.current = next;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [variant]);

  // E — the halo's fallback source. Measured, never simulated: this project's own button already
  // refuses to claim a percentage it cannot see (E1's morph-to-progress stops at 90%).
  useEffect(() => {
    if (variant !== 'E' || progress !== undefined) return;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [variant, progress]);

  useEffect(
    () => () => {
      if (reset.current !== null) window.clearTimeout(reset.current);
    },
    [],
  );

  const hasActions = !!actions && actions.length > 0;
  /** A — the fan. B — the same actions, reached by the button becoming the panel. */
  const speedDial = variant === 'A' && hasActions;
  const morphSheet = variant === 'B' && hasActions;
  const expandable = speedDial || morphSheet;

  const pct = variant === 'E' ? Math.min(100, Math.max(0, progress ?? scrolled)) : 0;
  const complete = variant === 'E' && pct >= 99.5;

  /*
   * The icon state machine.
   *
   * It is deliberately NOT variant-specific: every FAB can fail, so every FAB reports it. What the
   * variants change is the shape of the interaction around this, not whether the user is told.
   */
  const run = async (work: (() => unknown) | undefined = onPress) => {
    if (!work) return;
    if (reset.current !== null) {
      window.clearTimeout(reset.current);
      reset.current = null;
    }
    try {
      const result = work();
      if (result instanceof Promise) {
        setState('busy');
        await result;
      }
      setState('success');
      reset.current = window.setTimeout(() => setState('idle'), 1400);
    } catch {
      // The error lingers longer than the tick. Good news can be missed; bad news cannot.
      setState('error');
      reset.current = window.setTimeout(() => setState('idle'), 2400);
    }
  };

  const press = () => {
    if (expandable) {
      setOpen((v) => !v);
      return;
    }
    void run();
  };

  const glyphKey = state !== 'idle' ? state : complete ? 'complete' : 'add';

  /**
   * And the same for the FAB, whose four non-halo variants all shook identically on failure and
   * did nothing at all on success beyond turning green — a colour change a thumb is covering at
   * the exact moment it happens. Each answers on the axis it already lives on:
   *
   *   A turns a plus into a cross → it keeps turning
   *   B swallows a sheet          → it swallows the answer
   *   C ducks out of the way      → the glyph rolls out of the window and back
   *   D is dragged and docked     → it snaps, the way a docked thing snaps
   *
   * E is the exception on purpose: it has the ring, and a glyph that jumps while a ring is closing
   * gives the eye two things to follow and it follows neither.
   */
  const fabSettle: Settle = (() => {
    if (!motionSafe || state === 'idle' || state === 'busy') return {};
    const bad = state === 'error';
    switch (variant) {
      case 'A':
        return bad ? { rotate: [0, -16, 16, -10, 0] } : { rotate: [0, 360] };
      case 'B':
        return bad ? { scale: [1, 1.14, 0.92, 1] } : { scale: [1, 0.78, 1] };
      case 'C':
        return bad ? { y: [0, -12, 4, 0] } : { y: [0, 20, -20, 0] };
      case 'D':
        return bad ? { x: SHAKE } : { x: [0, -14, 4, 0] };
      default:
        return {};
    }
  })();

  const button = (
    <Pressable
      shape="icon"
      variant="primary"
      aria-label={label}
      aria-expanded={expandable ? open : undefined}
      busy={state === 'busy'}
      className={cn(
        'size-14 shadow-[var(--shadow-overlay)]',
        state === 'success' && 'bg-success text-on-success',
        state === 'error' && 'bg-danger text-on-danger',
      )}
      onClick={press}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={glyphKey}
          className="inline-flex"
          initial={motionSafe ? { scale: 0.6, opacity: 0 } : false}
          animate={
            motionSafe
              ? {
                  scale: 1,
                  opacity: 1,
                  rotate: speedDial && open ? 45 : 0,
                  x: 0,
                  y: 0,
                  ...fabSettle,
                }
              : { scale: 1, opacity: 1, rotate: speedDial && open ? 45 : 0, x: 0 }
          }
          exit={motionSafe ? { scale: 0.6, opacity: 0 } : undefined}
          transition={motionSafe ? SPRING.tight : { duration: 0 }}
        >
          {state === 'idle' ? (
            complete ? (
              <Check size={24} strokeWidth={3} aria-hidden />
            ) : (
              <Plus size={24} strokeWidth={2.5} aria-hidden />
            )
          ) : (
            <StatusIcon status={state} size={24} />
          )}
        </motion.span>
      </AnimatePresence>
    </Pressable>
  );

  /* E — Progress-halo. A ring around the button, from the project's own Gauge rather than a
     second SVG: the same geometry, the same twelve-o'clock start, the same token stroke. When it
     closes, the plus becomes a tick — the ring and the glyph agree, so the state survives being
     glanced at. */
  const core = (
    <div className="relative">
      {variant === 'E' ? (
        <Gauge
          value={pct / 100}
          gap={0}
          thickness={0.12}
          label={t('nav.progress')}
          className="pointer-events-none absolute -inset-2"
        />
      ) : null}
      {button}
    </div>
  );

  const scrim = (
    <motion.div
      key="scrim"
      aria-hidden
      onClick={() => setOpen(false)}
      className="fixed inset-0 -z-10 bg-scrim"
      initial={motionSafe ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={motionSafe ? { opacity: 0 } : undefined}
      transition={{ duration: motionSafe ? 0.2 : 0 }}
    />
  );

  // A — Speed-dial: the actions fan out ABOVE the button and the plus becomes a close cross.
  if (speedDial) {
    return (
      <div className={FAB_STACK}>
        <AnimatePresence>{open ? scrim : null}</AnimatePresence>
        <AnimatePresence>
          {open
            ? actions.map((a, i) => (
                <motion.div
                  key={a.label}
                  initial={motionSafe ? { opacity: 0, y: 8, scale: 0.9 } : false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={motionSafe ? { opacity: 0, y: 8, scale: 0.9 } : undefined}
                  // Staggered by index so the group reads as one gesture fanning out.
                  transition={{ ...SPRING.tight, delay: motionSafe ? i * 0.04 : 0 }}
                >
                  <Pressable
                    density="compact"
                    icon={a.icon}
                    className="shadow-[var(--shadow-overlay)]"
                    onClick={() => {
                      setOpen(false);
                      void run(a.onSelect);
                    }}
                  >
                    {a.label}
                  </Pressable>
                </motion.div>
              ))
            : null}
        </AnimatePresence>
        {core}
        <StatusAnnounce status={state} />
      </div>
    );
  }

  /* B — Morph-sheet: the button does not summon a panel, it BECOMES one. Same surface, growing
     from 56px of circle into a card of full-width rows; `layout` interpolates the box so there is
     never a moment where two separate things are on screen. Under reduced motion the box still
     changes — instantly — because the panel appearing is the information. */
  if (morphSheet) {
    return (
      <div className={FAB_STACK}>
        <AnimatePresence>{open ? scrim : null}</AnimatePresence>
        <motion.div
          layout
          className={cn(
            'overflow-hidden',
            open
              ? 'w-[min(84vw,300px)] rounded-card border-[length:var(--border-width)] border-[var(--surface-border-strong)] bg-[var(--sheet-bg)] p-2 shadow-[var(--shadow-overlay-strong)]'
              : 'rounded-chip',
          )}
          transition={motionSafe ? SPRING.base : { duration: 0 }}
        >
          {open ? (
            <motion.div layout="position" className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 pl-3">
                <span className="text-body-s text-text-2">{label}</span>
                <Pressable
                  shape="icon"
                  variant="ghost"
                  aria-label={t('common.close')}
                  onClick={() => setOpen(false)}
                >
                  <X size={20} strokeWidth={2} aria-hidden />
                </Pressable>
              </div>
              {actions.map((a) => (
                <Pressable
                  key={a.label}
                  shape="field"
                  icon={a.icon}
                  onClick={() => {
                    setOpen(false);
                    void run(a.onSelect);
                  }}
                >
                  {a.label}
                </Pressable>
              ))}
            </motion.div>
          ) : (
            core
          )}
        </motion.div>
        <StatusAnnounce status={state} />
      </div>
    );
  }

  /*
   * D — Drag-dock. The button is furniture: pick it up, and the two corners it can live in are
   * drawn while you hold it. Released, it flies to the nearer one and stays there — the whole
   * point being that a FAB parked over the thing you are reading is the user's problem to solve,
   * and this is the variant that lets them.
   */
  const snap = () => {
    setDragging(false);
    const el = dock.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const goLeft = r.left + r.width / 2 < window.innerWidth / 2;
    // 16px is `right-4` — the resting inset the stack already uses, reached from wherever it was
    // dropped rather than reset to a fresh coordinate system.
    const dx = goLeft ? 16 - r.left : window.innerWidth - 16 - r.right;
    const overTop = 16 - r.top;
    const overBottom = r.bottom - (window.innerHeight - 16);
    const dy = overTop > 0 ? overTop : overBottom > 0 ? -overBottom : 0;
    const spec = motionSafe ? SPRING.base : { duration: 0 };
    animate(x, x.get() + dx, spec);
    animate(y, y.get() + dy, spec);
  };

  return (
    <>
      {variant === 'D' && dragging ? (
        <>
          <span aria-hidden className={cn(DOCK_HINT, 'left-4')} />
          <span aria-hidden className={cn(DOCK_HINT, 'right-4')} />
        </>
      ) : null}
      <motion.div
        ref={dock}
        className={cn(FAB_STACK, variant === 'D' && 'cursor-grab touch-none active:cursor-grabbing')}
        style={variant === 'D' ? { x, y } : undefined}
        drag={variant === 'D'}
        dragMomentum={false}
        onDragStart={() => setDragging(true)}
        onDragEnd={snap}
        // C — it does not merely slide off: it shrinks away and comes back, so the return reads as
        // an arrival rather than as something that was always there.
        animate={
          variant === 'C'
            ? { y: hidden ? 120 : 0, opacity: hidden ? 0 : 1, scale: hidden ? 0.8 : 1 }
            : undefined
        }
        transition={motionSafe ? SPRING.base : { duration: 0 }}
      >
        {core}
        <StatusAnnounce status={state} />
      </motion.div>
    </>
  );
}
