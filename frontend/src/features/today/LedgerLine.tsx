import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { LifeosWallet } from '../../lib/lifeos-api';
import { ProgressBar } from '../../ui/data/ProgressBar';
import { LEDGER_DASH } from '../../ui/data/LedgerRow';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Pic } from '../../ui/media/Pic';
import { coins, levelProgress } from './model';

/**
 * The ledger line under Ma's header — frames ma-1..ma-4, `coinLedgerLine` of
 * `figma-build/lifeos/ma.common.js`:
 *
 *   [coin 20]  8  190 ÉRME · SZINT 4 ............  [XP bar 56]  8  ›
 *
 * 44 high, the whole line is the door to Érmék (`/coins`). Mono `data`, upper case, `text-2`; the
 * two figures in ink. The bar is how far the XP is from this level's floor to the next level
 * (level = ⌊√(xp / 100)⌋, the server's bounds). A failed read prints the dash for both figures and
 * no bar — never a 0 (Pulse System §4); while it loads, one block stands where the words will be.
 */
export function LedgerLine({ wallet, failed }: { wallet: LifeosWallet | undefined; failed: boolean }) {
  const { t, i18n } = useTranslation();

  if (!wallet && !failed) {
    return (
      <div className="flex h-11 items-center gap-2" aria-hidden>
        <Skeleton className="h-3 w-40" />
      </div>
    );
  }

  const balance = wallet ? coins(wallet.balanceMinor).toLocaleString(i18n.language) : LEDGER_DASH;
  const level = wallet ? wallet.level.toLocaleString(i18n.language) : LEDGER_DASH;

  return (
    <Link
      to="/coins"
      className="flex h-11 items-center gap-2 transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)] active:opacity-[var(--pressed-opacity)]"
    >
      <Pic slot="coin" width={20} />
      <span className="min-w-0 flex-1 truncate text-data uppercase text-text-2">
        <span className="text-text-1">{balance}</span> {t('today.ledger.coins')} · {t('today.ledger.level')}{' '}
        <span className="text-text-1">{level}</span>
      </span>
      {wallet ? (
        <ProgressBar
          className="w-14 shrink-0"
          value={levelProgress(wallet.xp, wallet.bounds.levelFloorXp, wallet.bounds.nextLevelXp)}
          label={t('today.ledger.levelBar')}
        />
      ) : null}
      <ChevronRight aria-hidden className="-me-1.25 size-4 shrink-0 text-text-3" strokeWidth={1.75} />
    </Link>
  );
}
