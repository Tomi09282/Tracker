import { useTranslation } from 'react-i18next';
import { LedgerRow } from '../../ui/data/LedgerRow';

/**
 * Profil's JUTALMAK ledger row — design round A `settings-v2-*` (`nezetek.common.js profileTop`:
 * `ledgerRow('Jutalmak', 'elérhető', '2')`): the eyebrow, "elérhető" in the note column, the mono
 * count on the right and the chevron; the row opens /rewards (plan "Profile v2", ledger row 3).
 *
 * `count` is GET /rewards' `redeemableCount` (`useRewards` in rewardsApi.ts) — the server decides
 * what can be redeemed now. The caller draws the row only once that answer exists: a server without
 * the shop (no migration 033) answers 404, and a figure that is not known is never faked. The
 * caller decides, not this row, because a `RowStack` child that renders nothing would still get a
 * rule. Rendered by `settings/SettingsPage.tsx` inside the closed ledger (request R-S-rewards-02).
 */
export function RewardsLedgerRow({ count }: { count: number }) {
  const { t } = useTranslation();
  return <LedgerRow to="/rewards" label={t('rewards.title')} note={t('rewards.available')} value={count} />;
}
