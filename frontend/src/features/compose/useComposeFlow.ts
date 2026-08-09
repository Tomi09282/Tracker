import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../ui/feedback/ToastHost';
import { useMotionSafe } from '../../ui/feedback/useMotionSafe';
import { haptic } from '../../lib/haptics';

/**
 * The small things that make the composer feel like one motion instead of a series of forms.
 *
 * Each hook here is a few lines and none of them changes what the server does. They exist because
 * the difference between "this works" and "this is easy" is entirely made of moments where the
 * screen answered you.
 */

/**
 * Save with the keyboard.
 *
 * Somebody writing a long post is already typing; making them reach for a button breaks the line of
 * thought that the post is made of. Ctrl+S on Windows and Linux, Cmd+S on a Mac — the combination
 * every text editor has trained into people, and the browser's own "save page" is not something
 * anybody wanted here.
 *
 * Bound while the editor is mounted and released when it is not, so it cannot fire on a screen that
 * has nothing to save.
 */
export function useSaveShortcut(onSave: () => void, enabled = true) {
  const saved = useRef(onSave);
  saved.current = onSave;

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saved.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/**
 * Warn before leaving with unsaved text.
 *
 * ═══ THIS IS THE COST OF CUTTING AUTOSAVE, PAID HONESTLY ═══════════════════════════════════════
 *
 * Autosave was cut deliberately: an in-flight create plus a blur-triggered second create meant the
 * replay answer could discard the coach's newest keystrokes behind a URL change that looked like
 * success. That was the right cut — and it leaves a real hole, because now a closed tab loses
 * everything typed since the last save.
 *
 * `beforeunload` is the browser's own guard and it is the only one that survives a tab close. It
 * cannot carry a custom message in any modern browser and it must not be armed when there is
 * nothing to lose, or it becomes the dialog people learn to dismiss without reading.
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Assigning returnValue is what actually arms the prompt; the string is ignored everywhere.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}

/**
 * Confirm, congratulate, and buzz — in one call, so no screen forgets one of the three.
 *
 * The haptic is gated on `useMotionSafe`. Somebody who asked for less motion did not ask for a
 * buzzing phone, and that pairing is already the rule everywhere else in this product.
 */
export function useComposeFeedback() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const motionSafe = useMotionSafe();

  return {
    /** Something landed. */
    ok: (key: string, undo?: () => void) => {
      if (motionSafe) haptic('light');
      toast(t(key), 'success', undo);
    },
    /** Something did not, and the reason is already translated by the caller. */
    failed: (message: string) => {
      if (motionSafe) haptic('medium');
      toast(message, 'error');
    },
  };
}

/**
 * How close a counter is to its bound, as three states rather than a number.
 *
 * A number alone is something you have to read and compare. Colour arrives before reading does —
 * and it only arrives near the end, because a counter that is loud from the first character is a
 * counter people stop seeing.
 */
export function counterTone(used: number, max: number): 'calm' | 'near' | 'over' {
  if (used > max) return 'over';
  if (used > max * 0.9) return 'near';
  return 'calm';
}

export const COUNTER_CLASS: Record<ReturnType<typeof counterTone>, string> = {
  calm: 'text-text-3',
  near: 'text-warning',
  over: 'text-danger',
};
