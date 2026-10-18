import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatBlock } from '../../ui/data/StatBlock';
import { Numeral } from '../../ui/data/Numeral';
import { Pic } from '../../ui/media/Pic';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { toCoins } from './useCoins';

/**
 * The balance stage of Érmék — coins-1 / -2 / -3, identical in the three views.
 *
 * ═══ WHAT THE FRAME DRAWS ══════════════════════════════════════════════════════════════════════
 *
 * The screen's ONE hero: the "EGYENLEGED" eyebrow, 8 under it the giant ink-tight numeral (ink box
 * 24,206 148 x 102 for "190"), and the graphite coin stack (188 x 188) standing on the numeral's
 * baseline with its right side pinned 20 past the gutter (frame box 210,136; `coins-N.body.js`:
 * x = cw - 0.896 * 188, y = 28 + numH - 0.916 * 188 from the stage top = 186, -42). The coin is
 * pinned to the RIGHT, as the frame pins it, so on a narrower phone it moves with the edge, and it
 * is drawn first so a long figure stays in front of it. The scaffold clips the bleed.
 *
 * ═══ IT ROLLS FROM THE PREVIOUS BALANCE, NOT FROM ZERO ═════════════════════════════════════════
 *
 * `Numeral mode="roll"` arrives as drawn and rolls only the digits that changed when the balance
 * moves while the screen is open (1400 -> 1450 rolls fifty coins, never a sweep from zero, which
 * would read as the balance being recalculated). Reduced motion: it lands at once.
 *
 * ═══ THE DELTA LANDS IN THE EYEBROW ════════════════════════════════════════════════════════════
 *
 * For 2.6 s after a change the eyebrow slot holds the signed delta ("+50", "-250", an ASCII hyphen)
 * instead of "Egyenleged", then the caption returns. Earning is lit; spending stays in the
 * eyebrow's own ink — buying something you chose to buy is not an error, so it is never danger.
 * The eyebrow is one fixed line, so the swap moves nothing. With reduced motion the delta still
 * shows: the state change is still visible, it just does not travel.
 *
 * ═══ A FAILED FETCH RENDERS NO FIGURE ══════════════════════════════════════════════════════════
 *
 * Not a zero. A zero balance and an unknown balance are different facts; a wallet that shows 0
 * when it could not reach the server has told the user something false about their money. The
 * giant is an em dash in the pending tone.
 *
 * ═══ A BALANCE BELOW ZERO IS SAID, NOT HIDDEN (coins-1v2-debt) ═════════════════════════════════
 *
 * Penalties may take the balance below zero (LifeOS L3); spending never can. The display face
 * draws digits only, so the eyebrow changes instead of the figure growing a minus: "TARTOZÁS" over
 * the size of the debt ("35" for a balance of -35), with "Elkölthető: 0 érme" under it — and the
 * page states what the debt means in a warn line. Never clamped to a friendly zero.
 *
 * The caption under the figure is the spendable amount (coins-1v2 "Elkölthető: 190 érme"), drawn
 * only when the server sends it.
 */
export interface CoinBalanceProps {
  /** The wallet's balance in minor units, once it is known. */
  balanceMinor?: number;
  /** What a purchase can use, max(0, balance) — the caption; absent from an older server, then not drawn. */
  spendableMinor?: number;
  state: 'loading' | 'error' | 'ready';
}

/** The coin's box against the stage (frame: 210,136 with the stage at 24,178; right pin -20). */
const COIN = 'pointer-events-none absolute -right-5 -top-[42px]';

export function CoinBalance({ balanceMinor, spendableMinor, state }: CoinBalanceProps) {
  const { t } = useTranslation();
  const value = state === 'ready' ? (balanceMinor ?? 0) : null;

  // The PREVIOUS balance, so a change can be shown as a change. `null` until a balance is known is
  // what distinguishes "arrived at 1450" from "went up by 1450", and only the second gets a delta.
  const previous = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    if (value === null) return undefined;
    const before = previous.current;
    previous.current = value;
    if (before === null || before === value) return undefined;
    setDelta(value - before);
    const timer = setTimeout(() => setDelta(null), 2600);
    return () => clearTimeout(timer);
  }, [value]);

  const debt = value !== null && value < 0;
  // The figure is the SIZE of the balance; its sign is the eyebrow's job (TARTOZÁS).
  const coins = value === null ? null : Math.abs(toCoins(value));
  const signed = delta === null ? null : `${delta > 0 ? '+' : ''}${toCoins(delta)}`;

  return (
    <div
      className="relative"
      // ONE announcement for the region, so a screen reader hears the new balance once rather than
      // every digit of the roll. `polite`: a balance is never an interruption.
      aria-live="polite"
      role={state === 'loading' ? 'status' : undefined}
      aria-label={state === 'loading' ? t('common.loading') : undefined}
    >
      <Pic slot="coin" width={188} priority bleed className={COIN} />
      <StatBlock
        className="relative"
        label={
          signed !== null && delta !== null ? (
            <span className={delta > 0 ? 'text-accent' : undefined}>{signed}</span>
          ) : debt ? (
            t('coins.debtCaption')
          ) : (
            t('coins.balanceCaption')
          )
        }
        caption={state === 'ready' && spendableMinor !== undefined ? t('coins.spendable', { count: toCoins(spendableMinor) }) : undefined}
      >
        {state === 'loading' ? (
          // A numeral is one block at its cap height: the ink box of the drawn "190".
          <Skeleton className="h-[102px] w-[148px]" />
        ) : coins === null ? (
          // The dash's ink is lower than a digit's: the slot keeps the figure's cap height (102 at 402 pt,
          // 0.82 of the fluid giant) so the view below does not move between a known and an unknown balance.
          <span className="flex h-[calc(var(--giant-fluid)*0.82)] items-center">
            <Numeral size="giant" tone="pending" value="—" />
          </span>
        ) : (
          <Numeral size="giant" mode="roll" value={coins} srText={t('coins.balanceLabel', { count: coins })} />
        )}
      </StatBlock>
    </div>
  );
}
