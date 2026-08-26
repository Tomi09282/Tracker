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
 * ═══ IT IS NOW THE CENTRE OF THE RING, NOT A CHIP IN THE HEADER ════════════════════════════════
 *
 * Same component, same rules, different frame. The redesign moved the balance out of the header
 * cluster — the least-looked-at pixel on the screen — and made it the anchor: a coin glyph, the
 * figure in the heaviest type on the page, and a caption slot beneath it. The old inline layout
 * was a status line; this is the thing the user came for.
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
 * ═══ THE DELTA LANDS UNDER THE NUMBER THAT CHANGED ═════════════════════════════════════════════
 *
 * It used to be a chip in the header corner, which is where the old screen put its only feedback
 * that money had moved. Folding it into the caption slot costs the chip its own colour field and
 * buys the confirmation landing directly beneath the figure the user is already looking at.
 *
 * The slot is never EMPTY. At rest it holds the caption `Egyenleged`, which is what says the
 * figure above it is a balance rather than a count of something; for 2.6 s after a change it holds
 * the delta instead. The fixed `h-4` is what makes that swap cost no layout shift — it used to be
 * reserving height for a blank line, so the ring's normal resting state was a bare number over a
 * gap.
 *
 * ═══ REDUCED MOTION IS NOT "NO FEEDBACK" ═══════════════════════════════════════════════════════
 *
 * The Bible's rule: the state change still HAPPENS and is still visible, it just does not travel.
 * So with motion off the number lands immediately and the delta still appears — what is dropped
 * is the roll, the flight and the pulse, never the information.
 */
export function CoinBalance({ balanceMinor }: { balanceMinor: number }) {
  const { t } = useTranslation();
  const variant = useElementVariant('E25');
  const motionSafe = useMotionSafe();

  // The PREVIOUS balance, so a change can be animated as a change. `null` on first render is what
  // distinguishes "arrived at 1450" from "went up by 1450", and only the second deserves a delta.
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
      className="flex flex-col items-center gap-tight"
      // ONE announcement, on the container, so a screen reader hears "1450 coins" rather than the
      // odometer's every intermediate value. `polite` because a balance is never an interruption.
      aria-live="polite"
      aria-label={t('coins.balanceLabel', { count: coins })}
    >
      <Coins
        className={`size-icon-m shrink-0 text-text-2 ${pulses && motionSafe ? 'animate-pulse' : ''}`}
        aria-hidden
      />

      <span className="text-display font-display tabular-nums text-text-1" aria-hidden>
        {rolls && motionSafe ? (
          <CountUp to={coins} from={toCoins(from)} duration={600} />
        ) : (
          coins.toLocaleString()
        )}
      </span>

      {/* The caption slot: `Egyenleged` at rest, the delta for 2.6 s after a change — see the
          docblock. Earning is accent-coloured; spending is deliberately NOT danger, because buying
          something you chose to buy is not an error, and the resting caption takes the same muted
          grey the `delta === null` branch already resolves to. */}
      <span
        className={`text-caption h-4 tabular-nums ${delta !== null && delta > 0 ? 'text-accent' : 'text-text-3'}`}
        aria-hidden
      >
        {delta !== null ? `${delta > 0 ? '+' : ''}${toCoins(delta)}` : t('coins.balanceCaption')}
      </span>
    </span>
  );
}
