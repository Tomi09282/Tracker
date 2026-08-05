import { Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Home, Dumbbell, Settings, ShieldCheck, Users, ClipboardList } from 'lucide-react';
import { BottomNav, type NavTab } from '../ui/nav/BottomNav';
import { useSession } from '../features/auth/useSession';
import { OfflineIndicator } from '../ui/shell/OfflineIndicator';
import { CommandPalette } from '../ui/shell/CommandPalette';

/**
 * The authenticated shell.
 *
 * The bottom padding is not cosmetic: without reserving the bar's height plus the safe-area
 * inset, the last item of every scrolling list ends up underneath a fixed bar and cannot be
 * tapped — one of the most common mobile layout defects there is.
 */
export function AppLayout() {
  const { t } = useTranslation();
  const { data: user } = useSession();

  const tabs: NavTab[] = [
    { to: '/', icon: Home, label: t('nav.home'), end: true },
    { to: '/library', icon: Dumbbell, label: t('nav.library') },
    { to: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  // The nav is a convenience, not a permission: the admin tab only appears for admins, but the
  // route and every endpoint behind it enforce the role on the server regardless.
  if (user?.role === 'coach' || user?.role === 'admin') {
    tabs.push({ to: '/coach', icon: Users, label: t('nav.coach') });
    tabs.push({ to: '/coach/plans', icon: ClipboardList, label: t('nav.plans') });
  }
  if (user?.role === 'admin') {
    tabs.push({ to: '/admin', icon: ShieldCheck, label: t('nav.admin') });
  }

  return (
    <div className="min-h-dvh bg-surface-0">
      <OfflineIndicator />
      <CommandPalette />
      {/* The reserved space is a TOKEN, not an inline calc: a full-height screen has to subtract
          exactly what this reserves, and two hand-written calcs drift. See --content-pad-b. */}
      <main className="pb-[var(--content-pad-b)] lg:pb-[var(--content-pad-b-lg)]">
        <Outlet />
      </main>
      <BottomNav tabs={tabs} />
    </div>
  );
}
