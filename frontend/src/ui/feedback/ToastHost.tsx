import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/cn';
import { EASE_STANDARD, useMotionSafe } from './useMotionSafe';
import { DUR_MS, secs, Toast, type ToastData, type ToastKind } from './variants/E12E16';

/**
 * The home of the toast, and the band it drops in.
 *
 * ═══ WHY A CONTEXT AND NOT A STORE ═════════════════════════════════════════════════════════════
 *
 * Raising a toast is a UI event with no state anybody reads back. A store would invite screens to
 * subscribe to "the current toast" and branch on it, which turns a notification into a state
 * machine two components can disagree about.
 *
 * ═══ ONE BAND, AT THE TOP (Pulse, PLAN R14) ════════════════════════════════════════════════════
 *
 * Pulse draws a toast as the page's own black dropping over the header zone: kit
 * `showToast(root, msg, kind, action)` — a band 402 wide from the top edge, 6 under the status bar
 * (`--band-pad-t`), one `noticeLine` and the strong rule, 7 under it (`style-studio-2`,
 * `workout-2`: band 0-120, line 68-112, rule at 112). No capsule, no corner, no bottom stack.
 *
 * The contract did not move: `toast(message, kind?, options | fn)`, the four kinds, Undo, the 4 s
 * timer with its pause, and the cap of three — now three lines in the one band, the oldest on top,
 * each with its own countdown on its own rule.
 */

/**
 * Which edge the toast came from — kept for the call sites that name it.
 *
 * Pulse has one band, at the top, for every toast; `placement` is accepted and no longer rendered
 * (PLAN R5: a prop Pulse does not render becomes optional and unrendered, and the screen package
 * that owns the call site deletes it). `'top'` is what the workout player asked for, and it is
 * where every toast now lands.
 */
export type ToastPlacement = 'top' | 'bottom';

/** Everything optional about a raise, in one bag so the call site never counts positions. */
export interface ToastOptions {
  onUndo?: () => void;
  /** Not rendered any more: every toast drops in the top band. See `ToastPlacement`. */
  placement?: ToastPlacement;
}

interface ToastApi {
  /**
   * Raise a toast. Returns nothing: nobody should be waiting on a notification.
   *
   * A bare function as the third argument still means "undo" (`useComposeFlow.ts` forwards an
   * undo callback it was handed); the object form is what new callers use.
   */
  toast: (message: string, kind?: ToastKind, options?: ToastOptions | (() => void)) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * `useToast` outside the provider is a no-op rather than a throw.
 *
 * A missing notification must never be the thing that takes a screen down. The provider wraps the
 * whole app, so this only fires in an isolated test render.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  return ctx ?? { toast: () => {} };
}

/** At most this many lines in the band: the oldest goes, because the newest is the one they caused. */
const TOAST_CAP = 3;


export interface ToastBandProps {
  /** The lines, oldest first. The band renders nothing while this is empty. */
  toasts: ToastData[];
  onDismiss: (id: number) => void;
  /**
   * Kit specimens: the band is pinned to the top of its positioned parent instead of the viewport
   * (the parent sets `--band-pad-t` for its device), and does not drop in.
   */
  inline?: boolean;
  /** Kit specimens and captures: every line's countdown frozen at this share (0-1), no timer. */
  still?: number;
}

/**
 * The band — kit `showToast`: the canvas black from the top edge, the lines in the 24 pt gutter
 * (a centred 430 column above 430 pt, as every screen), 7 pt under the closing rule.
 *
 * ═══ IT STANDS UNDER THE OFFLINE LINE, NEVER OVER IT ═══════════════════════════════════════════
 *
 * The offline line is sticky at the top of the page and publishes its height as `--offline-h`
 * (0 while it is closed). The band starts there, and pads only by what of the status zone the
 * offline line has not already covered — so with both up, the offline line and the toast are two
 * lines one under the other, and neither hides the other.
 *
 * ═══ AND IT NEVER SWALLOWS A TAP IT DOES NOT OWN ═══════════════════════════════════════════════
 *
 * The band exists only while a line is in it (an empty band would sit over the header for
 * nothing). It is opaque on purpose — Pulse's toast is "the page's own black dropping over the
 * header zone" — so it takes the taps of what it covers, for at most 4 s, and every line in it can
 * be closed with one tap.
 */
export function ToastBand({ toasts, onDismiss, inline = false, still }: ToastBandProps) {
  const motionSafe = useMotionSafe();
  const drops = motionSafe && !inline;
  return (
    <AnimatePresence initial={false}>
      {toasts.length > 0 ? (
        <motion.div
          key="band"
          data-kit="toastBand"
          initial={drops ? { y: '-100%' } : false}
          animate={{ y: 0 }}
          exit={drops ? { y: '-100%', transition: { duration: secs(DUR_MS.fast), ease: EASE_STANDARD } } : undefined}
          transition={drops ? { duration: secs(DUR_MS.base), ease: EASE_STANDARD } : { duration: 0 }}
          className={cn(
            'inset-x-0 z-[var(--z-toast)] bg-surface-0 pb-1.75',
            inline
              ? 'absolute top-0 pt-[var(--band-pad-t)]'
              : 'fixed top-[var(--offline-h)] pt-[max(calc(var(--band-pad-t)_-_var(--offline-h)),0px)]',
          )}
        >
          <div className="screen-x mx-auto flex w-full max-w-[var(--screen-max)] flex-col">
            <AnimatePresence initial={false}>
              {toasts.map((t, i) => (
                <Toast key={t.id} toast={t} onDismiss={onDismiss} last={i === toasts.length - 1} still={still} />
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastApi['toast']>((message, kind = 'success', options) => {
    const opts: ToastOptions = typeof options === 'function' ? { onUndo: options } : (options ?? {});
    const id = nextId.current;
    nextId.current += 1;
    // THREE AT A TIME. A band that grows without bound covers the screen it is reporting on, and
    // the fourth notice about the same burst of work tells nothing the first three did not.
    setToasts((cur) => [...cur, { id, kind, message, onUndo: opts.onUndo }].slice(-TOAST_CAP));
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* NOT a live region itself: each line carries role="status", and nesting one live region
          inside another makes some screen readers announce the whole band on every change. */}
      <ToastBand toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
