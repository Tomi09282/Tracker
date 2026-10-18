import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Screen } from '../../ui/shell/Screen';
import { hasRole, useSession } from '../auth/useSession';
import { AdminForbidden, AdminHeader } from './AdminShell';
import { MarketplaceQueue, MarketplaceReport, reportSearch, reportStatusOf } from './MarketplaceQueue';

/** A report id from the address: digits only, bounded — anything else is no report. */
const reportIdOf = (raw: string | null) => (raw && /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null);

/**
 * Piactér (`/admin/marketplace`) — the admin bar's marketplace tab.
 *
 * admin-view-3: the admin header (eyebrow, the style-studio door, "Piactér"), then the report queue
 * as one-line doors. `?report=<id>` is the pushed report page (admin-view-3-report); `?status=` is
 * the chosen filter, kept in the address so the report page reads the list it was opened from and
 * the way back returns to the same filter.
 *
 * The server enforces the role on every endpoint behind it; this only explains a refusal.
 */
export function AdminMarketplacePage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const [params, setParams] = useSearchParams();
  const status = reportStatusOf(params.get('status'));
  const report = reportIdOf(params.get('report'));

  if (user && !hasRole(user, 'admin')) return <AdminForbidden />;

  if (report !== null) return <MarketplaceReport key={report} id={report} status={status} />;

  return (
    <Screen top="push" width="wide">
      <AdminHeader title={t('admin.section.marketplace')} />
      {/* A filter changes the subject, not the place: it replaces the address instead of pushing. */}
      <MarketplaceQueue status={status} onStatus={(s) => setParams(new URLSearchParams(reportSearch(s)), { replace: true })} />
    </Screen>
  );
}
