import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import { CountUp } from '../../ui/feedback/CountUp';
import { useElementVariant } from '../../ui/feedback/ElementStyleProvider';
import { useMotionSafe } from '../../ui/feedback/useMotionSafe';
import { toCoins } from './useCoins';

/**
 * E25 — the coin balance. Five variants.
 *
 * ═══ THE NUMBER IS THE SAME IN ALL FIVE ════════════════════════════════════════════════════════
 *
 * Every variant renders `toCoins(balanceMinor)` and differs only in how it ARRIVES there. That is
 * not a stylistic preference: a variant that computed its own figure would be a second arithmetic
 * of somebody's money chosen by an admin dropdown, and the one thing a balance may never do is
 * depend on which animation is switched on.
 *
 * ═══ IT ROLLS FROM THE PREVIOUS BALANCE, NOT FROM ZERO ═════════════════════════════════════════
 *
 * `CountUp` gained a `from` for exactly this. A statistic counts up from nothing because it is
 * being revealed; a wallet going 1400 → 1450 must roll those fifty coins. Sweeping from zero
 * through every number the user has ever had reads as the balance being recalculated, and on a
 * screen about money that is the single impression to avoid.
 *
 * ═══ REDUCED MOTION IS NOT "NO FEEDBACK" ═══════════════════════════════════════════════════════
 *
 * The Bible's rule: the state change still HAPPENS and is still visible, it just does not travel.
 * So with motion off the number lands immediately and the delta chip still appears — what is
 * dropped is the roll, the flight and the pulse, never the information.
 */
export function CoinBalance({
  balanceMinor,
  className,
  showDelta = true,
}: {
  balanceMinor: number;
  className?: string;
  showDelta?: boolean;
}) {
  const { t } = useTranslation();
  const variant = useElementVariant('E25');
  const motionSafe = useMotionSafe();

  // The PREVIOUS balance, so a change can be animated as a change. `null` on first render is what
  // distinguishes "arrived at 1450" from "went up by 1450", and only the second deserves a chip.
  const previous = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = balanceMinor;
    if (before === null || before === balanceMinor) return undefined;
    setDelta(balanceMinor - before);
    const timer = setTimeout(() => setDelta(null), 2600);
    return () => clearTimeout(timer);
  }, [balanceMinor]);

  const from = previous.current ?? balanceMinor;
  const coins = toCoins(balanceMinor);

  // A: Odometer-roll · B: Fly-to-wallet · C: Balance-pulse · D: Breakdown-sheet · E: Milestone
  const rolls = variant === 'A' || variant === 'B';
  const pulses = variant === 'C' && delta !== null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className ?? ''}`}
      // ONE announcement, on the container, so a screen reader hears "1450 coins" rather than the
      // odometer's every intermediate value. `polite` because a balance is never an interruption.
      aria-live="polite"
      aria-label={t('coins.balanceLabel', { count: coins })}
    >
      <Coins
        className={`size-4 shrink-0 text-accent ${pulses && motionSafe ? 'animate-pulse' : ''}`}
        aria-hidden
      />
      <span className="tabular-nums text-text-1" aria-hidden>
        {rolls && motionSafe ? (
          <CountUp to={coins} from={toCoins(from)} duration={600} />
        ) : (
          coins.toLocaleString()
        )}
      </span>

      {/* THE DELTA IS THE FEEDBACK, and it survives reduced motion because it is information
          rather than movement. Earning is accent-coloured; spending is deliberately NOT danger —
          buying something you chose to buy is not an error. */}
      {showDelta && delta !== null ? (
        <span
          className={`text-caption tabular-nums ${delta > 0 ? 'text-accent' : 'text-text-3'}`}
          aria-hidden
        >
          {delta > 0 ? '+' : ''}
          {toCoins(delta)}
        </span>
      ) : null}
    </span>
  );
}
