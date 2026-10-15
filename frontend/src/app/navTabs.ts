/*
 * THE TAB TABLE — pure data, on purpose.
 *
 * Two build gates import this file straight into bare Node (`check-nav-active.mjs`,
 * `check-assets.mjs`) and a third reads it as text (`check-nav.mjs`). So it may hold package
 * imports and TYPE-ONLY imports, erasable syntax, and nothing else: no image, no component, no
 * extension-less relative runtime import. The one import below is erased before Node resolves it.
 *
 * A tab names its icon by KEY. The two rasters of a key (idle and lit) are resolved by the bar
 * (`ui/nav/BottomNav.tsx`) through `assets/pulse`; `check:assets` holds every key to a pair on disk.
 */
import type { TabIconKey } from '../assets/pulse/slots.ts';

export type NavRole = 'user' | 'coach' | 'admin';

/**
 * One tab, declared rather than resolved.
 *
 * `labelKey` and not `label` is the whole reason this file exists apart from `AppLayout`: a
 * translation key is a static string a build gate can look up in all three bundles without
 * rendering React, while a resolved label is only knowable at runtime inside a component that
 * needs a provider, a session and a router. `check-nav.mjs` reads this table.
 */
export interface NavTabSpec {
  to: string;
  /** Which raster pair the bar draws: `tab-<key>` and its lit twin in `assets/pulse`. */
  icon: TabIconKey;
  labelKey: string;
  /** Only the index route needs it: without `end`, `/` matches every path below it. */
  end?: boolean;
  /**
   * Other route prefixes this tab OWNS, for the active state only.
   *
   * `NavLink` decides `isActive` from its own `to`, which is right for navigation and wrong for
   * belonging. Two measured consequences:
   *
   *   `/library/:id`  — an exercise detail page lit NO tab at all. Six cells, all idle, on a
   *                     screen the user reached by tapping one of them.
   *   `/compose`      — the coach's marketplace desk lit no tab either, because `/coach` does not
   *                     prefix-match `/compose`.
   *
   * A bar with nothing active is a bar that has stopped answering "where am I", which is the only
   * question it exists to answer. Declared here beside the tab rather than computed in the bar,
   * so the gates can read the ownership as data — the same reason `labelKey` lives here.
   */
  owns?: readonly string[];
}

/**
 * Is this tab the one the user is currently inside?
 *
 * ═══ WHY IT LIVES HERE AND NOT IN THE BAR ══════════════════════════════════════════════════════
 *
 * The same reason `labelKey` does: this file is the pure one, so a gate can import it and assert
 * over it without a DOM. `check-nav-active.mjs` runs a table of routes through this function and
 * checks that exactly one tab lights on each — which is the guard that was missing when the bar
 * lit EDZÉS on `/library` while announcing no current page at all, and again when `/onboarding`
 * lit nothing for a brand-new member.
 *
 * The bar is a renderer. What "active" means is a fact about routes and tabs, and facts belong
 * where they can be checked. The bar reads this ONE result for both the lit raster and
 * `aria-current`.
 *
 * ═══ THE TWO RULES ═════════════════════════════════════════════════════════════════════════════
 *
 * `end` is the index route's flag: without it `/` prefix-matches every path in the app.
 *
 * The prefix test is boundary-aware. `/coin` must not match `/coins` and `/m` must not match
 * `/measurements`, so a prefix counts only where the path ends there or continues with a slash —
 * `startsWith` alone is the bug this exists to avoid.
 */
export function isTabActive(
  /*
   * Only the three fields the rule actually reads, so it serves BOTH shapes: `NavTabSpec` here,
   * which carries a `labelKey`, and `NavTab` in the bar, which carries a resolved `label`. Naming
   * either concrete type would have made the rule refuse the other one — and "active" has never
   * been a question about a label.
   */
  tab: Pick<NavTabSpec, 'to' | 'end' | 'owns'>,
  pathname: string,
): boolean {
  const owns = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  return (tab.end ? pathname === tab.to : owns(tab.to)) || (tab.owns?.some(owns) ?? false);
}

/**
 * THE BOTTOM BAR, PER ROLE.
 *
 * Five tabs for a member, six for a coach, seven for an admin — the counts the Pulse frames draw
 * (`home-1`, `coach-dashboard-1`, `admin-1`) and `check-nav.mjs` asserts. The bar renders whatever
 * it is given: there is no runtime clamp, because a clamp hides the failure it was written to
 * catch.
 *
 * SERIAL POSITION. Recall across an ordered list is U-shaped — the first and last slots are the
 * two people remember. The sequence opens on Home and closes on Profil in all three roles, and
 * the role-specific tabs sit in the middle where a daily-loop destination must not.
 *
 * WHAT IS NOT HERE STILL HAS A DOOR. `/library` is the Edzés tab's idle state and a row on Home
 * (owner decision D2); `/coach/plans` is reached from the coach dashboard. `/notifications` is
 * owned by Kezdőlap (owner answer Q6: the bell lives in Home's header).
 *
 * The public marketplace (`/m…`) is owned by nobody: those routes render in `PublicLayout`, which
 * draws no bar.
 */
export const NAV_TABS: Record<NavRole, readonly NavTabSpec[]> = {
  user: [
    // `end` stops `/` prefix-matching every route below it, which is right — and it also stops
    // onboarding from lighting anything, so the one screen a brand-new member sees first had a bar
    // with nothing on it. `owns` is the exception list `end` cannot express.
    { to: '/', icon: 'home', labelKey: 'nav.home', end: true, owns: ['/onboarding', '/notifications'] },
    { to: '/workout', icon: 'training', labelKey: 'nav.workout', owns: ['/library'] },
    { to: '/nutrition', icon: 'nutrition', labelKey: 'nav.nutritionShort' },
    { to: '/progress', icon: 'progress', labelKey: 'nav.progress' },
    { to: '/settings', icon: 'profile', labelKey: 'nav.profile', owns: ['/coins'] },
  ],
  coach: [
    { to: '/', icon: 'home', labelKey: 'nav.home', end: true, owns: ['/onboarding', '/notifications'] },
    { to: '/workout', icon: 'training', labelKey: 'nav.workout', owns: ['/library'] },
    { to: '/nutrition', icon: 'nutrition', labelKey: 'nav.nutritionShort' },
    { to: '/progress', icon: 'progress', labelKey: 'nav.progress' },
    // The marketplace desk and the plan library are the coach's work, reached from here and
    // belonging here.
    { to: '/coach', icon: 'coach', labelKey: 'nav.coach', owns: ['/compose'] },
    { to: '/settings', icon: 'profile', labelKey: 'nav.profile', owns: ['/coins'] },
  ],
  admin: [
    { to: '/', icon: 'home', labelKey: 'nav.home', end: true, owns: ['/onboarding', '/notifications'] },
    { to: '/workout', icon: 'training', labelKey: 'nav.workout', owns: ['/library'] },
    { to: '/nutrition', icon: 'nutrition', labelKey: 'nav.nutritionShort' },
    { to: '/progress', icon: 'progress', labelKey: 'nav.progress' },
    { to: '/coach', icon: 'coach', labelKey: 'nav.coach', owns: ['/compose'] },
    { to: '/admin', icon: 'admin', labelKey: 'nav.admin' },
    { to: '/settings', icon: 'profile', labelKey: 'nav.profile', owns: ['/coins'] },
  ],
};

/** The nav is a convenience, never a permission — every route and endpoint re-checks the role. */
export function tabsForRole(role: string | undefined): readonly NavTabSpec[] {
  if (role === 'admin') return NAV_TABS.admin;
  if (role === 'coach') return NAV_TABS.coach;
  return NAV_TABS.user;
}
