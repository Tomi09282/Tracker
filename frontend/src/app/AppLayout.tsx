import { Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Home, Dumbbell, Settings, Users, ClipboardList } from 'lucide-react';
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
  // ADMIN IS NOT A BOTTOM-NAV DESTINATION, and used to be one by accident.
  //
  // A coach already fills all five slots (home, library, settings, coach, plans). Pushing admin
  // made SIX, and `BottomNav` clamps with `slice(0, 5)` exactly as its own comment promises — so
  // an admin saw five tabs and /admin was not among them. The route worked, the role check
  // worked, and there was no way to reach it. Measured, not theorised.
  //
  // It belongs in Settings regardless: it is the least-used destination in the product and it
  // belongs to a ROLE rather than to the daily loop. Primary navigation and role-specific areas
  // are different things, and mixing them is what filled the bar in the first place.
  //
  // This also leaves the fifth slot free, which is what Phase 3 needed — see
  // [[Messaging and Notifications]] for why chat and notifications take no tab either.

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
