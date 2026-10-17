import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { hasRole, useSession } from '../auth/useSession';
import { MarketplaceQueue } from './MarketplaceQueue';

/**
 * PLACEHOLDER of the admin bar's "marketplace" tab (/admin/marketplace), created by the integrator in the
 * nav commit (P1-nav) so the route and the tab exist. The S-admin package owns this file and
 * rebuilds it to its frame (design round A, admin-view-3); until then it shows the
 * existing section of the admin page under a section header.
 *
 * The server enforces the role on every endpoint behind it; this only explains a refusal.
 */
export function AdminMarketplacePage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const admin = hasRole(user, 'admin');

  if (user && !admin) {
    return (
      <Screen top="root">
        <EmptyState heading="h1" title={t('admin.forbiddenTitle')} body={t('admin.forbiddenBody')} />
      </Screen>
    );
  }

  return (
    <Screen top="push" width="wide">
      <ScreenHeader kind="section" eyebrow={t('admin.eyebrow')} title={t('admin.section.marketplace')} />
      <MarketplaceQueue />
    </Screen>
  );
}
