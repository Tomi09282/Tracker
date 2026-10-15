import { Outlet } from 'react-router';
import { ShellProvider } from '../ui/shell/Screen';

/**
 * The layout of the screens a visitor reaches without an account: sign-in, registration and the
 * public marketplace (`/login`, `/register`, `/m…`).
 *
 * ═══ WHY A LAYOUT ROUTE AND NOT NOTHING ════════════════════════════════════════════════════════
 *
 * These screens used to render with no layout at all, so every one of them mounted its own shell
 * pieces by hand — which is how one decoration ended up mounted nine times, and how a defect in
 * one copy survived review in the other eight. What those screens share is written here once:
 * `ShellProvider` WITHOUT tabs, so `Screen` pads to the home indicator instead of the bar and a
 * `Dock` stands 16 above the inset instead of 12 above the bar. (The top inset and the status-bar
 * mask come with `Screen`, as on every other screen.)
 *
 * ═══ WHAT IT MUST NOT DO ═══════════════════════════════════════════════════════════════════════
 *
 * Read the session. A public screen draws the same chrome for a visitor and for a member: no tab
 * bar, no avatar, nothing that waits for `/auth/me` before the page can paint. And it draws no
 * landmark — each public page is its own `<main>` (`Screen as="main"`).
 */
export function PublicLayout() {
  return (
    <ShellProvider tabs={false}>
      <Outlet />
    </ShellProvider>
  );
}
