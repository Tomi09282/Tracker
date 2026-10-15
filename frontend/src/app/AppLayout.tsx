import { useMemo } from 'react';
import { Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BottomNav, type NavTab } from '../ui/nav/BottomNav';
import { tabsForRole } from './navTabs';
import { useSession } from '../features/auth/useSession';
import { CommandPalette } from '../ui/shell/CommandPalette';
import { ShellProvider } from '../ui/shell/Screen';

/**
 * The layout of every signed-in screen: the screen and the tab bar.
 *
 * ═══ WHAT IT DRAWS — AND WHAT IT DOES NOT ══════════════════════════════════════════════════════
 *
 * No background, no backdrop, no frame. The canvas is `body`'s own black (Pulse has no aurora and
 * no surface behind a screen), so a wrapper here that painted anything would be the first card.
 *
 *   main     the screen, padded at the bottom by `--content-pad-b` — the bar and its distance from
 *            the edge. A full-height screen subtracts EXACTLY this token, so the page never scrolls
 *            by a few pixels; the extra air a scrolling page needs to bring its last block out of
 *            the fade is the scaffold's (`Screen`), not the layout's
 *   bar      the tab bar and its fade (`BottomNav`), mounted once
 *
 * `ShellProvider tabs` tells `Screen` and `Dock` that a tab bar stands at the bottom — a fact
 * about the layout, never a prop a page has to remember. The top of a screen — its inset and the
 * status-bar mask over it — is the scaffold's (`Screen`): a screen not yet on the scaffold keeps
 * the top it had.
 */
export function AppLayout() {
  const { t } = useTranslation();
  const { data: user } = useSession();

  const tabs: NavTab[] = useMemo(
    () =>
      tabsForRole(user?.role).map((spec) => ({
        to: spec.to,
        icon: spec.icon,
        owns: spec.owns,
        label: t(spec.labelKey),
        end: spec.end,
      })),
    [user?.role, t],
  );

  return (
    <ShellProvider tabs>
      <div className="min-h-dvh">
        <CommandPalette />
        {/* The reserved space is a TOKEN, not an inline calc: a full-height screen has to subtract
            exactly what this reserves, and two hand-written calcs drift. See --content-pad-b. */}
        <main className="pb-[var(--content-pad-b)]">
          <Outlet />
        </main>
        <BottomNav tabs={tabs} />
      </div>
    </ShellProvider>
  );
}
