import { useTranslation } from 'react-i18next';
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useDragControls, useMotionValue } from 'motion/react';
import { Check, Loader2, Plus, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { TextLink } from '../../primitives/TextLink';
import { Gauge } from '../Gauge';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

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

/* ══ E14 — the bottom sheet (Pulse: one look) ═══════════════════════════════════════════════ */

/**
 * The panel's own classes — shared by the live `Sheet` and the specimen `SheetStatic`, so the two
 * can never be drawn differently. Kit `bottomSheet` (`app-kit.js` 317-327, `coach-dashboard-2`,
 * `compose-hub-2`): `s2`, the top corners 28, a 1 pt `hairS` edge on the three sides it has (the
 * fourth is the screen's), padding 12 / 24 and 16 + the bottom inset (50 on the frames' 34), the
 * column 8 apart: grabber · header · body. No blur, no shadow — the scrim is the separation.
 */
const SHEET_PANEL = cn(
  'inset-x-0 bottom-0 mx-auto w-full max-w-[var(--screen-max)]',
  'flex max-h-[calc(100dvh-var(--safe-t))] flex-col items-center gap-2 overflow-y-auto overscroll-contain',
  'rounded-t-[var(--radius-sheet)] border-x border-t border-hair-strong bg-[var(--sheet-bg)]',
  'px-6 pt-3 pb-[calc(var(--spacing-group)+var(--safe-b))]',
  'outline-none',
);

/** The scrim: black 60 % (`--scrim`), nothing else — no blur. */
const SHEET_SCRIM = 'inset-0 bg-scrim';

/** Three 6 pt dots in the ink of the words, rippling — the busy mark of every Pulse control. */
function BusyDots() {
  return (
    <span aria-hidden className="flex h-11 items-center gap-1.5 text-text-2">
      <i className="size-1.5 rounded-full bg-current animate-busy-1 motion-reduce:animate-none" />
      <i className="size-1.5 rounded-full bg-current opacity-60 animate-busy-2 motion-reduce:animate-none" />
      <i className="size-1.5 rounded-full bg-current opacity-30 animate-busy-3 motion-reduce:animate-none" />
    </span>
  );
}

/**
 * Grabber, header (title 22 + close), body. The status rides in the header, beside the close:
 * busy = the three dots, error = a 6 pt `danger` dot and — given `onRetry` — the "Újra" link,
 * success = a 6 pt `success` dot. A semantic colour is a dot or words, never a filled surface.
 */
function SheetBody({
  title,
  titleId,
  status,
  onRetry,
  onClose,
  onGrab,
  children,
}: {
  title: string;
  titleId: string;
  status: ElementStatus;
  onRetry?: () => void;
  onClose?: () => void;
  onGrab?: (e: ReactPointerEvent<HTMLSpanElement>) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      {/* The grabber: 36 × 4, white 24 %. A drag on it (and on the 20 pt around it) moves the sheet. */}
      <span
        aria-hidden
        data-kit-part="grabber"
        onPointerDown={onGrab}
        className={cn(
          'relative block h-1 w-[var(--grabber-w)] shrink-0 rounded-full bg-[var(--grabber)]',
          onGrab && 'cursor-grab touch-none after:absolute after:-inset-x-4 after:-inset-y-3 active:cursor-grabbing',
        )}
      />
      <div className="flex h-11 w-full shrink-0 items-center justify-between gap-4">
        <h2 id={titleId} className="min-w-0 truncate text-title text-text-1">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {status === 'busy' ? <BusyDots /> : null}
          {status === 'error' || status === 'success' ? (
            <span aria-hidden className={cn('size-1.5 rounded-full', status === 'error' ? 'bg-danger' : 'bg-success')} />
          ) : null}
          {status === 'error' && onRetry ? <TextLink onClick={onRetry}>{t('common.retry')}</TextLink> : null}
          <Pressable variant="link" shape="icon" aria-label={t('common.close')} onClick={onClose}>
            <X aria-hidden />
          </Pressable>
        </div>
      </div>
      <div className="flex w-full flex-col gap-4">{children}</div>
      <StatusAnnounce status={status} />
    </>
  );
}

/** Every element a Tab can reach inside `root`, in order. */
function tabbables(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
    ),
  ).filter((el) => !el.hasAttribute('inert') && el.getClientRects().length > 0);
}

/** How many sheets hold the page's scroll; the page is released when the last one closes. */
let scrollLocks = 0;
let scrollRestore = '';

/**
 * The bottom sheet — Pulse's ONE surface (Pulse System §4 "Bottom sheet"). Pickers and
 * confirmations are sheets; there are no centred dialogs.
 *
 * Contract unchanged: `open`, `onClose`, `title`, `children`, `status?`, `onRetry?`.
 *
 * Behaviour kept, and completed: `role="dialog"` + `aria-modal` named by its title; focus moves
 * into the sheet when it opens, is held inside it (Tab and Shift+Tab cycle through its controls),
 * and goes back to whatever opened it when it closes; Escape closes; the page under it does not
 * scroll while it is open; a tap on the scrim closes. The grabber can be dragged down to dismiss
 * (the spring-sheet behaviour of E14 letter A, the letter the database serves) — a drag that is
 * released early springs back.
 *
 * Motion (Pulse System §2.4): the sheet rises in `--duration-slow`, the scrim fades in
 * `--duration-base`; both leave in `--duration-base`. Reduced motion: it simply appears.
 *
 * E14's letters B–E (centred dialog, morph, stacked deck, success-close) are not Pulse; every letter
 * renders this one sheet and the element no longer reads its variant (`pkg/F12/variants.json`).
 */
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
  /** What the sheet's work is doing. Shown in the header (see `SheetBody`) and announced. */
  status?: ElementStatus;
  /** Offered beside the error dot. An error with no way forward is a dead end, not feedback. */
  onRetry?: () => void;
}) {
  const motionSafe = useMotionSafe();
  const panel = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Open: remember who opened it, take focus, hold the page, listen for Escape and Tab.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus({ preventScroll: true });

    if (scrollLocks++ === 0) {
      scrollRestore = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = tabbables(panel.current);
      if (items.length === 0) {
        e.preventDefault();
        panel.current.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      const inside = at instanceof Node && panel.current.contains(at);
      if (e.shiftKey && (at === first || at === panel.current || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      if (--scrollLocks === 0) document.documentElement.style.overflow = scrollRestore;
      // Back to the opener — unless the close itself moved focus somewhere on purpose.
      const now = document.activeElement;
      if (opener && opener.isConnected && (!now || now === document.body || panel.current?.contains(now))) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open]);

  const rise = motionSafe ? { duration: 0.4, ease: EASE_STANDARD } : { duration: 0 }; // --duration-slow
  const leave = motionSafe ? { duration: 0.25, ease: EASE_STANDARD } : { duration: 0 }; // --duration-base

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="scrim"
            aria-hidden
            onClick={onClose}
            className={cn('fixed z-[var(--z-sheet)]', SHEET_SCRIM)}
            initial={motionSafe ? { opacity: 0 } : false}
            animate={{ opacity: 1, transition: leave }}
            exit={{ opacity: 0, transition: leave }}
          />
          <motion.div
            key="panel"
            ref={panel}
            role="dialog"
            aria-modal
            aria-labelledby={titleId}
            aria-busy={status === 'busy' || undefined}
            tabIndex={-1}
            data-kit="bottomSheet"
            className={cn('fixed z-[var(--z-sheet)]', SHEET_PANEL)}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            dragMomentum={false}
            onDragEnd={(_event, info) => {
              if (info.offset.y > 96 || info.velocity.y > 600) onClose();
            }}
            initial={motionSafe ? { y: '100%' } : false}
            animate={{ y: 0, transition: rise }}
            exit={motionSafe ? { y: '100%', transition: leave } : { opacity: 0, transition: leave }}
          >
            <SheetBody
              title={title}
              titleId={titleId}
              status={status}
              onRetry={onRetry}
              onClose={onClose}
              onGrab={(e) => dragControls.start(e)}
            >
              {children}
            </SheetBody>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * The sheet as a still drawing, for the kit specimen and captures only: the same scrim, panel and
 * body as `Sheet`, positioned inside the nearest positioned ancestor (a 402 × H phone) instead of
 * the viewport — with no focus move, no scroll lock and no key listener, so a page can show one
 * permanently open. Never in a product screen: a sheet there is `Sheet`.
 */
export function SheetStatic({
  title,
  children,
  status = 'idle',
  onRetry,
  onClose,
}: {
  title: string;
  children: ReactNode;
  status?: ElementStatus;
  onRetry?: () => void;
  onClose?: () => void;
}) {
  const titleId = useId();
  return (
    <>
      <div aria-hidden className={cn('absolute z-[var(--z-sheet)]', SHEET_SCRIM)} />
      <div
        role="dialog"
        aria-labelledby={titleId}
        data-kit="bottomSheet"
        className={cn('absolute z-[var(--z-sheet)]', SHEET_PANEL, 'max-h-full')}
      >
        <SheetBody title={title} titleId={titleId} status={status} onRetry={onRetry} onClose={onClose}>
          {children}
        </SheetBody>
      </div>
    </>
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
