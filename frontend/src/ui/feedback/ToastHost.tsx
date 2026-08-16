import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { Toast, type ToastData, type ToastKind } from './variants/E12E16';

/**
 * The home the toast never had.
 *
 * ═══ E15 WAS DESIGNED, BUILT, AND UNREACHABLE ══════════════════════════════════════════════════
 *
 * `Toast` has five variants, an auto-dismiss timer that pauses on hover, an Undo affordance, and a
 * polite live region so it never interrupts a screen reader mid-sentence. It was used by exactly
 * one file: the variant playground. No real screen could show one, because nothing mounted a host
 * and nothing exposed a way to raise one.
 *
 * So every mutation in the product finished in silence. A save that works and says nothing is
 * indistinguishable from a save that did nothing — which is the same shape as the cover upload that
 * answered 201 while the editor showed stale data, and it is why that bug was invisible until
 * somebody watched the screen.
 *
 * ═══ WHY A CONTEXT AND NOT A STORE ═════════════════════════════════════════════════════════════
 *
 * Raising a toast is a UI event with no state anybody reads back. A store would invite screens to
 * subscribe to "the current toast" and branch on it, which turns a notification into a state
 * machine two components can disagree about.
 */

interface ToastApi {
  /** Raise a toast. Returns nothing: nobody should be waiting on a notification. */
  toast: (message: string, kind?: ToastKind, onUndo?: () => void) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * `useToast` outside the provider is a no-op rather than a throw.
 *
 * A missing notification must never be the thing that takes a screen down. The provider wraps the
 * whole app, so this only fires in an isolated test render — and there, failing loudly about a
 * toast would obscure whatever the test was actually about.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  return ctx ?? { toast: () => {} };
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastApi['toast']>((message, kind = 'success', onUndo) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((cur) => {
      // THREE AT A TIME. A stack that grows without bound covers the thing the user is looking at,
      // and the fourth notification about the same burst of work tells them nothing the first three
      // did not. The oldest goes, because the newest is the one they caused.
      const next = [...cur, { id, kind, message, onUndo }];
      return next.slice(-3);
    });
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        Fixed to the BOTTOM, above the safe-area inset, and pointer-events-none on the container so
        it never swallows a tap meant for the screen behind it — only the toasts themselves are
        interactive, which matters because one of them carries an Undo.

        `lg:items-end` is the desktop half of the position rule: bottom-RIGHT on a pointer screen,
        never the centre. Centred over a wide viewport a toast lands on top of whatever the user
        was reading, and the wider the screen the further it is from where they were looking. The
        column is `max-w-sm`, so the cross-axis alignment is the whole change — no width, no
        offset, no second layout.
      */}
      {/*
        `--z-toast` and `--content-pad-b` are both declared tokens, and both were nearly re-derived
        here by hand. The first draft used Tailwind's `z-50`, which is the SHEET layer — a toast
        would have sat under one — and computed its own bottom offset, which put it on top of the
        bottom navigation on every authenticated screen. The layer order and the height of the nav
        are decisions this design system already made.
      */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-toast)] flex flex-col items-center px-4 pb-[var(--content-pad-b)] lg:items-end"
        // NOT a live region itself: each Toast already carries role="status", and nesting one live
        // region inside another makes some screen readers announce the whole stack on every change.
      >
        {/*
          THE SIZING WRAPPER SITS OUTSIDE AnimatePresence because `AnimatePresence` tracks its DIRECT
          children: a plain keyed `div` in between hides the `Toast` from presence detection, and the
          exit animation never runs. That is a real reason and it is the only one.

          It is written down because the first draft claimed a different one. Measuring in a browser
          pane whose page is `hidden`, I read `scale(0.96) translateY(24px)` on a settled toast and
          concluded it overlapped the nav and that its buttons were 42px. Both were the frozen
          entrance: a hidden page suspends requestAnimationFrame, Motion animates on rAF, so every
          Motion entrance sits at its initial values forever — and `getBoundingClientRect` reports the
          TRANSFORMED box. Measured with `offsetHeight`, which is layout: the buttons are 44px and the
          80px bottom padding clears the 65px nav. There was nothing wrong.
        */}
        <div className="pointer-events-auto flex w-full max-w-sm flex-col gap-2">
          <AnimatePresence initial={false}>
            {toasts.map((t) => (
              <Toast key={t.id} toast={t} onDismiss={dismiss} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}
