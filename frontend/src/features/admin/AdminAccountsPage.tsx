import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/shell/Screen';
import { hasRole, useSession } from '../auth/useSession';
import { AdminForbidden, AdminHeader } from './AdminShell';
import { UserSearch } from './UserSearch';

/**
 * Fiókok (`/admin/accounts`) — the admin bar's accounts tab.
 *
 * admin-view-2: the admin header (eyebrow, the style-studio door, "Fiókok"), then the read-only
 * account list exactly as it stood in the old section — the search line, the sort keys and the
 * two-line account rows (`UserSearch`).
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
      <UserSearch enabled={admin} />
    </Screen>
  );
}
