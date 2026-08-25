import { useMemo } from 'react';
import { Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BottomNav, type NavTab } from '../ui/nav/BottomNav';
import { tabsForRole } from './navTabs';
import { useSession } from '../features/auth/useSession';
import { CommandPalette } from '../ui/shell/CommandPalette';
import { AuroraBackdrop } from '../ui/shell/AuroraBackdrop';

/**
 * The authenticated shell.
 *
 * The bottom padding is not cosmetic: without reserving the bar's height plus the safe-area
 * inset, the last item of every scrolling list ends up underneath a fixed bar and cannot be
 * tapped — one of the most common mobile layout defects there is.
 *
 * The tab table itself lives in `./navTabs` rather than here, because a build gate has to be able
 * to read it. This component's only job with it is resolving `labelKey` through `t()`.
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

  /*
   * NO BACKGROUND ON THE WRAPPER BELOW, AND THAT IS LOAD-BEARING.
   *
   * `AuroraBackdrop` is `fixed inset-0 -z-10`, and its own docblock states the precondition: it
   * works "under a transparent body". This div is not the body — it is an opaque wrapper that used
   * to sit between the two. A negative-z child paints AFTER its stacking context's background but
   * BEFORE the background of any non-context ancestor, so `bg-surface-0` here painted straight over
   * the aurora.
   *
   * The effect: the light this entire design floats over was invisible on every authenticated
   * screen. The four public routes mount their own backdrop with no such wrapper, which is why the
   * login screen looked right and nothing behind it did — and is why nobody caught it. Proved by
   * setting this background to `transparent` in the live page and screenshotting: flat black became
   * a warm field with the accent glow top-left and the info glow top-right.
   *
   * The base colour is not lost; `src/index.css` already paints `--surface-0` on `body`.
   */
  return (
    <div className="min-h-dvh">
      {/* The four public screens render OUTSIDE this layout by design (router.tsx), so each of
          them mounts its own — see AuroraBackdrop. Easy to miss, and the symptom is a screen
          that is simply flat while every other one has depth. */}
      <AuroraBackdrop />
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
