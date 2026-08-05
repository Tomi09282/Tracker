import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { useElementVariant } from '../../ui/feedback/ElementStyleProvider';

export interface RestTimerProps {
  remaining: number;
  /** 0 → 1 as the rest elapses. */
  progress: number;
  running: boolean;
  nextUp?: string | null;
  onSkip: () => void;
}

const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * E22 — the rest timer, all five variants.
 *
 *   A · Ring-shrink   — a 56 px ring beside the seconds. The default.
 *   B · Time-chip     — just the number, in the smallest thing that can carry it.
 *   C · Top-bar       — a hairline at the top of the screen; the seconds live in the set list.
 *   D · Next-up       — the ring, plus what is coming. Rides with A rather than replacing it.
 *   E · Auto-advance  — A, and when the rest ends the next pending set takes focus by itself.
 *
 * PINNED ABOVE THE BOTTOM NAV, never over it (A, B, D, E). A lifter mid-session still needs to
 * reach the nav, and a timer that covers it is a timer they dismiss out of frustration rather than
 * because the rest is over.
 *
 * THE SECONDS ARE THE INFORMATION; EVERYTHING ELSE IS DECORATION AROUND THEM. The ring and the bar
 * are CSS transitions, not JS animations, so if no animation frame ever runs — a backgrounded tab,
 * a locked screen, a webview that is not compositing — the NUMBER is still correct, because it is
 * derived from a wall-clock deadline rather than counted down. That is the whole reason this
 * component can be trusted on a phone.
 */
export function RestTimer({ remaining, progress, running, nextUp, onSkip }: RestTimerProps) {
  const { t } = useTranslation();
  const variant = useElementVariant('E22');
  if (!running) return null;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const clock = `${minutes}:${String(seconds).padStart(2, '0')}`;

  /* ── C · Top-bar ──────────────────────────────────────────────────────────────────────────────
   *
   * The whole timer is a hairline under the status bar. Nothing floats over the content, the set
   * list keeps every pixel, and the rest is still legible from across the room — a bar draining is
   * readable peripherally in a way a number is not.
   *
   * It sits BELOW the safe-area inset rather than under the notch, and `pointer-events-none` means
   * it can never eat a tap meant for what is behind it. Skipping is not offered here on purpose:
   * there is nothing to press without reintroducing a floating control, and the rest ends on its
   * own anyway.
   */
  if (variant === 'C') {
    return (
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)]"
        role="status"
        aria-label={t('workout.restRemaining', { time: clock })}
      >
        <div
          className="h-1 bg-accent"
          style={{
            width: `${Math.round(Math.min(1, Math.max(0, 1 - progress)) * 100)}%`,
            transition: 'width var(--duration-base) linear',
          }}
        />
      </div>
    );
  }

  /* ── B · Time-chip ────────────────────────────────────────────────────────────────────────────
   *
   * The smallest thing that can carry the seconds. For a lifter who wants the clock and not the
   * furniture — and it leaves the set rows completely unobscured, which the card does not on a
   * short screen.
   *
   * Centred rather than cornered: a chip in a corner is a notification, a chip in the middle is a
   * timer. It is still a 44 px target because it is the skip control too.
   */
  if (variant === 'B') {
    return (
      <div
        className={cn(
          'fixed inset-x-0 z-30 flex justify-center px-4',
          'bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+0.75rem)]',
        )}
      >
        <Pressable
          shape="chip"
          variant="secondary"
          aria-label={t('workout.skipRest')}
          onClick={onSkip}
          className="shadow-[var(--shadow-overlay)] backdrop-blur"
        >
          <span className="text-title-3 tabular-nums" aria-live="off">
            {clock}
          </span>
          <X className="size-icon-s" aria-hidden />
        </Pressable>
      </div>
    );
  }

  /* ── A / D / E — the card ─────────────────────────────────────────────────────────────────────
   *
   * D adds the next movement; E is A plus the auto-advance the PLAYER performs when the rest ends
   * (this component cannot move focus into a row it does not own). Both are shown here because a
   * ring with nothing beside it wastes the width it already occupies.
   */
  return (
    <div
      // `bottom` clears the nav plus the safe area, so this floats ABOVE the bar rather than on it.
      className={cn(
        'fixed inset-x-0 z-30 px-4',
        'bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+0.75rem)]',
      )}
    >
      <div className="col-mobile flex items-center gap-3 rounded-card border border-[var(--surface-border)] bg-surface-2/95 p-3 shadow-lg backdrop-blur">
        <svg viewBox="0 0 52 52" className="size-14 shrink-0 -rotate-90" aria-hidden>
          <circle cx="26" cy="26" r={RADIUS} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
          <circle
            cx="26"
            cy="26"
            r={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * progress}
            style={{ transition: 'stroke-dashoffset var(--duration-base) linear' }}
          />
        </svg>

        <div className="min-w-0 flex-1">
          {/* `aria-live="off"` on purpose: a countdown that announces every second is unusable with
              a screen reader. The single announcement that matters is "rest over", below. */}
          <p className="text-title-2 tabular-nums" aria-live="off">
            {clock}
          </p>
          {nextUp ? (
            <p className="text-caption truncate text-text-2">
              {t('workout.nextUp')}: {nextUp}
            </p>
          ) : null}
        </div>

        <Pressable shape="icon" variant="ghost" aria-label={t('workout.skipRest')} onClick={onSkip}>
          <X className="size-icon-m" aria-hidden />
        </Pressable>
      </div>
    </div>
  );
}
