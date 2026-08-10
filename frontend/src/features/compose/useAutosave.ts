import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';

/**
 * Autosave, with the one race it is famous for closed.
 *
 * ═══ RACE-7, WHICH IS WHY THIS IS A HOOK AND NOT A setTimeout ══════════════════════════════════
 *
 * A coach types, the timer fires, a CREATE goes out carrying an idempotency key. They keep typing.
 * They tab away, and the blur fires a second autosave — the same key, because reusing the key is
 * what makes a retry a retry.
 *
 * The server does exactly what it was built to do: it REPLAYS, and answers with the post as it was
 * created. The client navigates to the new URL, which looks like success, and the editor reloads
 * from the server — over the top of everything typed since the first request left. The URL change
 * is the tell that makes it feel like it worked.
 *
 * Three things close it, and all three are needed:
 *
 *   1. SINGLE FLIGHT. Never two saves at once. The second call does not fire; it sets a flag.
 *   2. COALESCED FOLLOW-UP. If the content moved while a save was in flight, exactly ONE more save
 *      runs when it lands — not one per keystroke, and not none.
 *   3. THE SAVE RESULT NEVER WRITES BACK INTO THE EDITOR. That is the caller's job and the caller
 *      is told so; this hook returns state, never content.
 *
 * ═══ AND IT SAVES ON THE WAY OUT ═══════════════════════════════════════════════════════════════
 *
 * `visibilitychange` rather than `beforeunload`: on mobile a tab is frozen and killed without ever
 * firing unload, and `beforeunload` is unreliable on iOS specifically. Hiding is the last moment
 * anything is guaranteed to run.
 */
export function useAutosave({
  enabled,
  serialise,
  save,
  delay = 1500,
}: {
  /** False while the editor cannot save — loading, read-only, or nothing typed yet. */
  enabled: boolean;
  /** A stable string of everything that would be sent. Changing it is what "dirty" means. */
  serialise: () => string;
  /** Performs one save. Rejecting marks the state failed; the content is never touched. */
  save: () => Promise<void>;
  delay?: number;
}) {
  const [state, setState] = useState<AutosaveState>('idle');

  const inFlight = useRef(false);
  const again = useRef(false);
  // What the last SUCCESSFUL save sent. Compared against `serialise()` to decide whether anything
  // is actually outstanding — a timer that fires with nothing to do should do nothing.
  const savedSnapshot = useRef<string | null>(null);
  const saveRef = useRef(save);
  const serialiseRef = useRef(serialise);
  saveRef.current = save;
  serialiseRef.current = serialise;

  const run = useCallback(async () => {
    // (1) SINGLE FLIGHT. The second caller does not queue a request, it raises a flag — which is
    // the difference between one follow-up and one per keystroke.
    if (inFlight.current) {
      again.current = true;
      return;
    }
    const sending = serialiseRef.current();
    if (sending === savedSnapshot.current) return;

    inFlight.current = true;
    setState('saving');
    try {
      await saveRef.current();
      savedSnapshot.current = sending;
      // Only 'saved' if nothing moved underneath. Saying "saved" while the editor already holds
      // something newer is the same lie the URL change told in RACE-7.
      setState(serialiseRef.current() === sending ? 'saved' : 'dirty');
    } catch {
      setState('failed');
    } finally {
      inFlight.current = false;
      // (2) COALESCED FOLLOW-UP. Exactly one, and only if the content really moved.
      if (again.current) {
        again.current = false;
        if (serialiseRef.current() !== savedSnapshot.current) void run();
      }
    }
  }, []);

  /** Call after the FIRST save of a brand-new document, so the follow-up is an update, not a create. */
  const adopt = useCallback((snapshot: string) => {
    savedSnapshot.current = snapshot;
  }, []);

  /** Save now, if there is anything to save. Used by the shortcut and by the visibility handler. */
  const flush = useCallback(() => {
    if (!enabled) return;
    void run();
  }, [enabled, run]);

  const current = enabled ? serialise() : null;

  useEffect(() => {
    if (!enabled) return undefined;
    if (current === savedSnapshot.current) return undefined;
    setState((s) => (s === 'saving' ? s : 'dirty'));
    const id = setTimeout(() => void run(), delay);
    return () => clearTimeout(id);
  }, [current, enabled, delay, run]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onHide = () => {
      if (document.visibilityState === 'hidden') void run();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [enabled, run]);

  return { state, flush, adopt, hasUnsaved: enabled && current !== savedSnapshot.current };
}
