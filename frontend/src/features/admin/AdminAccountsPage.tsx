import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/shell/Screen';
import { hasRole, useSession } from '../auth/useSession';
import { AdminForbidden, AdminHeader } from './AdminShell';
import { AccountList } from './accounts/AccountList';

/**
 * Fiókok (`/admin/accounts`) — the admin bar's accounts tab.
 *
 * admin-accounts-v2: the admin header (eyebrow, the style-studio door, "Fiókok"), then the list
 * with its search, filters, count, tappable rows and "Továbbiak" (`AccountList`). A row opens the
 * account page (`/admin/accounts/:id`).
 *
 * The server enforces the role on every endpoint behind it; this only explains a refusal.
 */
export function AdminAccountsPage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const admin = hasRole(user, 'admin');

  if (user && !admin) return <AdminForbidden />;

  return (
    <Screen top="push" width="wide">
      <AdminHeader title={t('admin.section.accounts')} />
      <AccountList enabled={admin} />
    </Screen>
  );
}
