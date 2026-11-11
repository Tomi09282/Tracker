import { Outlet } from 'react-router';
import { BottomNav, useNavTabs } from '../ui/nav/BottomNav';
import { useView } from './useView';
import { ViewContext } from './viewContext';
import { CommandPalette } from '../ui/shell/CommandPalette';
import { ShellProvider } from '../ui/shell/Screen';
import { useTimezoneBootstrap } from '../features/settings/dayPrefs';

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
 *   bar      the tab bar and its fade (`BottomNav`), mounted once, with the tabs of the current
 *            VIEW (`useView`: derived from the URL; plan decision R2)
 *
 * `ShellProvider tabs` tells `Screen` and `Dock` that a tab bar stands at the bottom — a fact
 * about the layout, never a prop a page has to remember. The top of a screen — its inset and the
 * status-bar mask over it — is the scaffold's (`Screen`): a screen not yet on the scaffold keeps
 * the top it had.
 */
export function AppLayout() {
  // The bar of the view the URL is in (`useView`): the member's, the trainer's or the admin's.
  // A view grants nothing — every route and endpoint re-checks the role on the server.
  const view = useView();
  const tabs = useNavTabs(view);
  // LifeOS starts the first time the server knows the user's zone: when none is stored, the
  // browser's zone is sent once, silently (B-core api.md "The day"; dayPrefs.ts). Mounted here,
  // once, so every signed-in screen - Ma first - has a logical today without a visit to Profil.
  useTimezoneBootstrap();

  return (
    <ViewContext.Provider value={view}>
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
    </ViewContext.Provider>
  );
}
