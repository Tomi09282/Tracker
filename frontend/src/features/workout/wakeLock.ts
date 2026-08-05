/**
 * Keep the screen awake for the length of an interval block — best-effort, silent on failure.
 *
 * A Tabata is four minutes of not touching the phone. Every OS screen-lock timeout is shorter than
 * that, and a locked screen is not merely a cosmetic problem: it suspends the JS timer, which is
 * exactly the condition the timer's interruption rule exists to detect. Holding the lock is how we
 * stop needing that rule in the ordinary case.
 *
 * `navigator.wakeLock` does not exist on iOS Safari before 16.4 and is absent in some webviews, so
 * NOTHING here is allowed to throw into a running block. The timer already survives a lock
 * correctly; this only makes it rarer.
 *
 * THE SENTINEL IS RELEASED BY THE BROWSER ON EVERY TAB HIDE, not just on our request — that is
 * specified behaviour, not a bug. So `wanted` is tracked separately from `sentinel`: on returning
 * to the foreground the timer re-acquires, and if it cannot, `onLost` lets the UI say the screen
 * may lock rather than silently letting it happen.
 */

let sentinel: WakeLockSentinel | null = null;
let wanted = false;
let onLost: (() => void) | null = null;

/** The UI's hook for telling the lifter the screen may sleep. Cleared on unmount. */
export function setWakeLockLostHandler(fn: (() => void) | null) {
  onLost = fn;
}

export async function acquireWakeLock(): Promise<boolean> {
  wanted = true;
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return false;
  if (sentinel && !sentinel.released) return true;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    // Fired when the browser takes it back — a tab hide, a system power-save, a call. Only report
    // it as lost if we still WANT it; a release we asked for is not a loss.
    sentinel.addEventListener('release', () => {
      sentinel = null;
      if (wanted) onLost?.();
    });
    return true;
  } catch {
    // NotAllowedError when the document is hidden, or unsupported. Either way the block runs on.
    sentinel = null;
    return false;
  }
}

export function releaseWakeLock() {
  wanted = false;
  const held = sentinel;
  sentinel = null;
  // Not awaited: releasing is fire-and-forget, and a rejected release on an already-released
  // sentinel must not surface as an unhandled rejection during unmount.
  void held?.release().catch(() => {});
}

/** Whether a lock is still wanted — the visibility handler re-acquires only when it is. */
export const wakeLockWanted = () => wanted;

export const wakeLockSupported = () =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator;
