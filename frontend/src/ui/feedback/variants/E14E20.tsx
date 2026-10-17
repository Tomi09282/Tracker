import { useTranslation } from 'react-i18next';
import { useEffect, useId, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { TextLink } from '../../primitives/TextLink';
import { useMotionSafe, EASE_STANDARD } from '../useMotionSafe';

/* ══ The state vocabulary of the sheet ══════════════════════════════════════════════════════ */

/**
 * What an element is currently DOING, not what colour it is.
 *
 * The rule this type exists to enforce: a state change swaps the GLYPH. A green button and a red
 * button are the same shape at a glance, and to a reader with a colour deficiency or a phone in
 * sunlight they are the same button — so `busy` is a spinner, `success` is a tick and `error` is a
 * warning triangle that shakes. Colour rides along; it is never the only carrier.
 *
 * `error` is the half that gets skipped. A sheet whose save was rejected must say so: a failure
 * that closes the surface as if it had worked is the worst outcome available, so the failure path
 * is built here beside the success one.
 */
export type ElementStatus = 'idle' | 'busy' | 'success' | 'error';

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
