import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, X } from 'lucide-react';
import { Pressable } from '../../primitives/Pressable';
import { TextLink } from '../../primitives/TextLink';
import { Rule } from '../../data/Rule';
import { NoticeLine, type NoticeTone } from '../NoticeLine';
import { useMotionSafe, EASE_STANDARD } from '../useMotionSafe';

/**
 * The duration tokens, in milliseconds, for the animations Motion drives from JS.
 *
 * `check-tokens` refuses a raw duration in a class, and it cannot see a number passed to Motion —
 * which is exactly how `0.35`, `0.25` and `0.2` ended up scattered across six variant files as
 * hand-typed near-misses of `--duration-*`. This is the same problem `EASE_STANDARD` solves for the
 * bezier, and the same answer: name the token once, use the name.
 *
 * It lives here rather than in `useMotionSafe` beside `EASE_STANDARD` only because that hook is
 * shared and this file is not the place to change it. Values are the tokens verbatim; `secs()`
 * exists because Motion takes seconds and `0.4 * 1000` is not 400.
 */
export const DUR_MS = {
  instant: 100,
  fast: 150,
  base: 250,
  slow: 400,
  ambient: 1200,
  /** How long a confirmation stays readable — the same window a toast gets. */
  toast: 4000,
} as const;
export const secs = (ms: number) => ms / 1000;

/* ══ E15 — Toast ════════════════════════════════════════════════════════════════════════════ */

/**
 * `record` is a fourth KIND, not a fourth colour of success.
 *
 * A personal record and a saved form are both "it worked", but they are not the same news, and the
 * workout frame draws the difference (`workout-2`, layer `Notice/info`): the record line carries a
 * 16 pt trophy in ink where every other line carries its 6 pt dot. A kind rather than a per-toast
 * icon override, because an override is a prop every caller can spell differently.
 */
export type ToastKind = 'success' | 'error' | 'info' | 'record';

export interface ToastData {
  id: number;
  kind: ToastKind;
  message: string;
  /** Renders the Undo link; using it undoes and closes the line. */
  onUndo?: () => void;
}

/** The kind's dot (kit `noticeLine(msg, kind)`): ok, danger, ink. `record` is ink with a trophy. */
const TOAST_TONE: Record<ToastKind, NoticeTone> = {
  success: 'ok',
  error: 'danger',
  info: 'info',
  record: 'info',
};

/** How long a line stays, and the countdown drawn on its rule. The 4 s of the contract (R14). */
const TOAST_MS = DUR_MS.toast;

export interface ToastProps {
  toast: ToastData;
  onDismiss: (id: number) => void;
  /**
   * The line closes the band: its rule is the strong one (white 14 %). A line with another line
   * under it gets the row rule (white 8 %), as rows of one list do. Default `true`, so a line on
   * its own is the band the frames draw.
   */
  last?: boolean;
  /**
   * Kit specimens and captures only: the countdown frozen at this share of the 4 s left (0-1) and
   * no timer running, so the line neither shrinks nor leaves while it is photographed.
   */
  still?: number;
  /** Kit specimens only: hold the Undo link or the close button in a finger / keyboard state. */
  force?: { undo?: 'pressed' | 'focus'; dismiss?: 'pressed' | 'focus' };
}

/**
 * One line of the toast band — kit `showToast(root, msg, kind, action)`, which is `noticeLine` with
 * a rule under it, dropped over the header zone (`style-studio-2`, `workout-2`):
 *
 *     ●  Felszerelés mentve                         Visszavonás   ✕
 *     ────────────────────────── (the countdown, text-2, on the rule) ─────
 *
 * No capsule, no fill of its own, no border, no shadow, no icon disc: the band behind it is the
 * page's own black (`ToastBand`), the colour lives in the dot, the words are `cap-m` in ink. The
 * trailing actions are the kit's own — `TextLink` for Undo, the bare `iconBtn` ✕ for close.
 *
 * ═══ THE COUNTDOWN IS THE UNDO WINDOW ══════════════════════════════════════════════════════════
 *
 * The line is also the undo window, so the time left is drawn: a 1 pt `text-2` line on the rule,
 * from the leading edge, shrinking over the same 4 s the dismiss timer runs (`style-studio-2`
 * layer `Countdown`, 232 of 354 at the moment it was drawn). Hover or keyboard focus pauses both.
 *
 * NOT RENDERED UNDER REDUCED MOTION. A countdown that cannot move would read as permanently full —
 * the one thing it must never say. The line still dismisses on the same timer.
 *
 * ═══ ONE LOOK, THE LETTER'S BEHAVIOUR ══════════════════════════════════════════════════════════
 *
 * E15 no longer reads its style letter (handed in as `live: false`, PLAN R11). The letter the
 * database served at the freeze is C, whose Undo closes the line — so Undo undoes and closes.
 */
export function Toast({ toast, onDismiss, last = true, still, force }: ToastProps) {
  const { t } = useTranslation();
  const motionSafe = useMotionSafe();
  // Paused while the pointer rests on the line OR keyboard focus is inside it: a keyboard user
  // tabbing to Undo must not have the line leave under them (WCAG 2.2.1, timing adjustable).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const frozen = still !== undefined;

  // A PAUSE, NOT A RESTART: the time left is kept while the pointer rests on the line, so the
  // line leaves when its countdown (which pauses with it) reaches the end — the two never disagree.
  const left = useRef<number>(TOAST_MS);
  useEffect(() => {
    if (paused || frozen) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), left.current);
    return () => {
      clearTimeout(timer);
      left.current = Math.max(0, left.current - (Date.now() - startedAt));
    };
  }, [toast.id, onDismiss, paused, frozen]);

  return (
    <motion.div
      layout={motionSafe ? 'position' : false}
      role="status"
      // polite, never assertive: a toast must not interrupt what a screen reader is saying.
      aria-live="polite"
      data-kit="toast"
      data-kind={toast.kind}
      // Drops in from the status zone in `base`, leaves in `fast` (Pulse System 2.6, "Toast").
      initial={motionSafe ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={motionSafe ? { opacity: 0, transition: { duration: secs(DUR_MS.fast), ease: EASE_STANDARD } } : undefined}
      transition={motionSafe ? { duration: secs(DUR_MS.base), ease: EASE_STANDARD } : { duration: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        // Focus moving between Undo and close stays inside the line: still paused.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className="relative w-full"
    >
      <NoticeLine
        tone={TOAST_TONE[toast.kind]}
        lead={toast.kind === 'record' ? <Trophy aria-hidden /> : undefined}
        action={
          <span className="flex items-center gap-2">
            {toast.onUndo ? (
              <TextLink
                data-force={force?.undo}
                onClick={() => {
                  toast.onUndo?.();
                  onDismiss(toast.id);
                }}
              >
                {t('common.undo')}
              </TextLink>
            ) : null}
            <Pressable
              variant="link"
              shape="icon"
              aria-label={t('common.dismiss')}
              data-force={force?.dismiss}
              onClick={() => onDismiss(toast.id)}
            >
              <X aria-hidden />
            </Pressable>
          </span>
        }
      >
        {toast.message}
      </NoticeLine>
      <Rule strong={last} />
      {motionSafe || frozen ? (
        <span
          aria-hidden
          data-kit="toastCountdown"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left bg-text-2"
          style={
            frozen
              ? { transform: `scaleX(${Math.min(Math.max(still, 0), 1)})` }
              : // `infinite`, not `forwards`: the end of the line is the removal of the toast (the timer
                // above fires at the same instant), so the animation needs no end state — and a still
                // capture holds a loop at its first frame instead of letting the clock run 4 s to
                // finish it, which would dismiss every toast before it could be photographed.
                { animation: `toast-timer ${TOAST_MS}ms linear infinite`, animationPlayState: paused ? 'paused' : 'running' }
          }
        />
      ) : null}
    </motion.div>
  );
}
