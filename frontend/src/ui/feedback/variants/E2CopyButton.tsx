import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Check, TriangleAlert } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { useMotionSafe, EASE_STANDARD } from '../useMotionSafe';

/*
 * CopyButton — the kit's `iconBtn('copy')` (Pulse System §4 "Icon button"; figma-build/app-kit.js
 * `iconBtn`, line 209; drawn in `coach-dashboard-2`, the sheet that shows a new join code once).
 *
 * ONE LOOK — E2 NO LONGER STEERS IT. This file used to render five mechanisms chosen by the element
 * variant E2 (glyph flip, tooltip bubble, confetti, fill wipe, count badge). Pulse has one look per
 * element (PLAN R11, D1): the letter is not read any more, and E2 is handed in as dormant
 * (`docs/pipeline/pulse/pkg/F8/2/variants.json`).
 *
 * The look: the actions lane's bare icon button (`Pressable variant="link" shape="icon"`) — a 24 pt
 * Lucide glyph, stroke 1.75, in `text-1`, nothing around it, in a 44 × 44 target. The frame draws
 * it at rest; what it does after a tap is the behaviour that was always there, in Pulse grammar:
 *
 *   rest     the copy glyph;
 *   busy     the write is slow (a permission prompt): after 120 ms the three dots of every busy
 *            Pulse control stand in for the glyph — never a spinner;
 *   done     the tick, in `accent` (lime = done), for 2 s;
 *   failed   the warning glyph, in `danger`, for 3.2 s — the button says no in the same place it
 *            would have said yes;
 *
 * and the glyph change is an ignite: the new glyph fades in over `--duration-fast` where the old one
 * was. Nothing turns, flies or shakes (Pulse §2.4: nothing slides). Reduced motion: instant.
 *
 * KEPT, because screen-reader users depend on it: a polite live region says the label when the copy
 * landed, an `alert` says `common.retry` when it was refused, both present from the first render.
 * The confirmation is shown only if the write really succeeded.
 *
 * Reference: docs/pipeline/pulse/kit/selection.md.
 */

type Status = 'idle' | 'busy' | 'done' | 'error';

/** `--duration-fast`, in the seconds Motion wants (a JS tween cannot read a CSS custom property). */
const FAST = 0.15;
/** How long the tick stays up before the button returns to rest. */
const HOLD_MS = 2000;
/** A failure holds longer than a success: the user has to read it and decide to press again. */
const ERROR_HOLD_MS = 3200;
/** A clipboard write normally resolves within a frame; the dots appear only for a slow one. */
const BUSY_AFTER_MS = 120;

export interface CopyButtonProps {
  /** The text that goes to the clipboard. */
  value: string;
  /** The accessible name of the button, and what the polite live region says after a copy. */
  label: string;
  /** For the kit specimen and captures only: hold a state without a clipboard. */
  demo?: 'busy' | 'done' | 'error';
  /** For the kit specimen and captures only: hold the pressed look or the focus ring. */
  'data-force'?: 'pressed' | 'focus';
  /** Unavailable: 40 %. */
  disabled?: boolean;
}

export function CopyButton({ value, label, demo, disabled, 'data-force': force }: CopyButtonProps) {
  const motionSafe = useMotionSafe();
  const { t } = useTranslation();
  const [live, setLive] = useState<Status>('idle');
  /** Bumped every time an attempt settles, so a repeat press lights the tick again. */
  const [pulse, setPulse] = useState(0);
  const timers = useRef<number[]>([]);
  const status: Status = demo ?? live;

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  // A pending "back to rest" after unmount is a state update into nothing, and a stale reset must
  // not cancel a fresh copy.
  useEffect(() => clearTimers, []);

  const copy = async () => {
    clearTimers();
    later(() => setLive('busy'), BUSY_AFTER_MS);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Denied permission, or no `navigator.clipboard` at all on plain HTTP. Never claim a copy that
      // did not happen — and never stay silent either.
      clearTimers();
      setLive('error');
      setPulse((p) => p + 1);
      later(() => setLive('idle'), ERROR_HOLD_MS);
      return;
    }
    clearTimers();
    setLive('done');
    setPulse((p) => p + 1);
    later(() => setLive('idle'), HOLD_MS);
  };

  const done = status === 'done';
  const failed = status === 'error';
  const glyph = done ? <Check aria-hidden /> : failed ? <TriangleAlert aria-hidden /> : <Copy aria-hidden />;

  return (
    <Pressable
      variant="link"
      shape="icon"
      onClick={() => void copy()}
      aria-label={label}
      busy={status === 'busy'}
      disabled={disabled}
      data-force={force}
      className={cn(done && 'text-accent', failed && 'text-danger')}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`${done ? 'done' : failed ? 'error' : 'idle'}:${done || failed ? pulse : 0}`}
          className="inline-flex"
          initial={motionSafe ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={motionSafe ? { opacity: 0 } : undefined}
          transition={{ duration: motionSafe ? FAST : 0, ease: EASE_STANDARD }}
        >
          {glyph}
        </motion.span>
      </AnimatePresence>
      <span aria-live="polite" className="sr-only">
        {done ? label : ''}
      </span>
      <span role="alert" className="sr-only">
        {failed ? t('common.retry') : ''}
      </span>
    </Pressable>
  );
}
