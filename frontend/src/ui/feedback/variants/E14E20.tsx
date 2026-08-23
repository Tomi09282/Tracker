import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Plus, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING } from '../useMotionSafe';

/* ══ E14 — Modal / bottom sheet ═════════════════════════════════════════════════════════════ */

export function Sheet({
  open,
  onClose,
  title,
  children,
  succeeded,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Variant E flashes a confirmation in place of the sheet instead of just closing. */
  succeeded?: boolean;
}) {
  const { t } = useTranslation();
  const variant = useElementVariant('E14');
  const motionSafe = useMotionSafe();
  const panel = useRef<HTMLDivElement>(null);

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

  const isDialog = variant === 'B';

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            aria-hidden
            onClick={onClose}
            className={cn(
              'fixed inset-0 z-[var(--z-sheet)] bg-black/50',
              // Blur signals "the thing behind is dismissable", which is its only legitimate
              // use per the platform guidance — never as decoration.
              'backdrop-blur-[var(--blur-sm)]',
              variant === 'D' && 'bg-black/65',
            )}
            initial={motionSafe ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={motionSafe ? { opacity: 0 } : undefined}
            transition={{ duration: motionSafe ? 0.25 : 0 }}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={cn(
              'fixed z-[var(--z-sheet)] bg-[var(--sheet-bg)] outline-none',
              'shadow-[var(--sheet-shadow)]',
              isDialog
                ? 'left-1/2 top-1/2 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-card p-4'
                : 'inset-x-0 bottom-0 rounded-t-[var(--radius-sheet)] p-4 pb-[calc(--spacing(4)+env(safe-area-inset-bottom))]',
              variant === 'D' && 'inset-x-1 bottom-1',
            )}
            initial={motionSafe ? (isDialog ? { opacity: 0, scale: 0.95 } : { y: '100%' }) : false}
            animate={isDialog ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={motionSafe ? (isDialog ? { opacity: 0, scale: 0.97 } : { y: '100%' }) : undefined}
            // A sheet rides a softer spring than a button: a large surface that snaps looks
            // weightless, and the Bible caps large-surface motion at 400ms.
            transition={motionSafe ? SPRING.soft : { duration: 0 }}
          >
            {!isDialog ? (
              <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-chip bg-surface-3" />
            ) : null}

            {succeeded && variant === 'E' ? (
              <div className="flex flex-col items-center py-8">
                <motion.span
                  className="inline-flex size-12 items-center justify-center rounded-chip bg-success text-on-success"
                  initial={motionSafe ? { scale: 0.5, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={SPRING.tight}
                >
                  <Check size={28} strokeWidth={3} aria-hidden />
                </motion.span>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-title-3 text-text-1">{title}</h2>
                  <Pressable shape="icon" variant="ghost" aria-label={t('common.close')} onClick={onClose}>
                    <X size={20} strokeWidth={2} aria-hidden />
                  </Pressable>
                </div>
                {children}
              </>
            )}
          </motion.div>
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

export function Fab({
  label,
  onPress,
  actions,
}: {
  label: string;
  onPress?: () => void;
  actions?: { label: string; icon: ReactNode; onSelect: () => void }[];
}) {
  const variant = useElementVariant('E20');
  const motionSafe = useMotionSafe();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  // C — collapse while scrolling down, return on scroll up. A FAB that covers content the user
  // is actively reading is worse than one they have to scroll back for.
  useEffect(() => {
    if (variant !== 'C') return;
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > lastY.current && y > 120);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [variant]);

  const speedDial = variant === 'A' && actions && actions.length > 0;

  return (
    <div
      className={cn(
        'fixed right-4 z-[var(--z-nav)] flex flex-col items-end gap-2',
        'bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+--spacing(4))]',
        'transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        hidden && 'translate-y-[calc(100%+--spacing(8))]',
      )}
    >
      <AnimatePresence>
        {speedDial && open
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
                  onClick={() => {
                    a.onSelect();
                    setOpen(false);
                  }}
                >
                  {a.label}
                </Pressable>
              </motion.div>
            ))
          : null}
      </AnimatePresence>

      <Pressable
        shape="icon"
        variant="primary"
        aria-label={label}
        aria-expanded={speedDial ? open : undefined}
        className="size-14 shadow-[var(--shadow-overlay)]"
        onClick={() => (speedDial ? setOpen((v) => !v) : onPress?.())}
      >
        <span
          className={cn(
            'inline-flex transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]',
            speedDial && open && 'rotate-45',
          )}
        >
          <Plus size={24} strokeWidth={2.5} aria-hidden />
        </span>
      </Pressable>
    </div>
  );
}
