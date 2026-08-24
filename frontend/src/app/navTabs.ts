// `UsersRound` and not a whistle: the mockups draw a whistle for the coach tab, but lucide has no
// whistle glyph — the nearest matches are sirens. A round group of people says "my clients" at
// 24 px more plainly than a siren says "coach", and the tab leads to the client roster.
import { Home, Dumbbell, Salad, TrendingUp, UsersRound, Shield, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
  icon: LucideIcon;
  labelKey: string;
  /** Only the index route needs it: without `end`, `/` matches every path below it. */
  end?: boolean;
  /**
   * Other route prefixes this tab OWNS, for the active state only.
   *
   * `NavLink` decides `isActive` from its own `to`, which is right for navigation and wrong for
   * belonging. Two measured consequences, both from the mockups:
   *
   *   `/library/:id`  — an exercise detail page lit NO tab at all. Six cells, all idle, on a
   *                     screen the user reached by tapping one of them.
   *   `/compose`      — the coach's marketplace desk lit no tab either, because `/coach` does not
   *                     prefix-match `/compose`.
   *
   * A bar with nothing active is a bar that has stopped answering "where am I", which is the only
   * question it exists to answer. Declared here beside the tab rather than computed in the bar,
   * so `check-nav` can read the ownership as data — the same reason `labelKey` lives here.
   */
  owns?: readonly string[];
}

/**
 * THE BOTTOM BAR, PER ROLE.
 *
 * Five tabs for a member, six for a coach, seven for an admin — the shape the approved mockups
 * specify (`v4-vegleges/sotet/01-home.png`, `.../06-coach-dashboard.png`, `.../11-admin-attekintes.png`).
 *
 * The previous build declared three for a member and five for staff, and clamped with
 * `slice(0, 5)`. That clamp is gone: with the count declared here and asserted by a gate, a
 * runtime clamp would only hide the failure it was written to catch.
 *
 * SERIAL POSITION, carried forward. Recall across an ordered list is U-shaped — the first and last
 * slots are the two people remember. The sequence opens on Home and closes on Profil in all three
 * roles, and the role-specific tabs sit in the middle where a daily-loop destination must not.
 *
 * WHAT IS NOT HERE, AND WHY IT STILL HAS A DOOR.
 * Two destinations that used to hold a tab lost it to make room, and neither may become
 * unreachable — that is the defect this whole change exists to fix, and re-creating it one route
 * over would be worse than leaving the bar alone:
 *   · `/library` — reached from the workout screen's empty state and from Home's.
 *   · `/coach/plans` — reached from the coach dashboard.
 * `check-nav.mjs` asserts both links exist. If you remove one, the build fails rather than the
 * feature silently disappearing on a phone.
 */
export const NAV_TABS: Record<NavRole, readonly NavTabSpec[]> = {
  user: [
    { to: '/', icon: Home, labelKey: 'nav.home', end: true },
    { to: '/workout', icon: Dumbbell, labelKey: 'nav.workout', owns: ['/library'] },
    { to: '/nutrition', icon: Salad, labelKey: 'nav.nutritionShort' },
    { to: '/progress', icon: TrendingUp, labelKey: 'nav.progress' },
    { to: '/settings', icon: User, labelKey: 'nav.profile', owns: ['/coins'] },
  ],
  coach: [
    { to: '/', icon: Home, labelKey: 'nav.home', end: true },
    { to: '/workout', icon: Dumbbell, labelKey: 'nav.workout', owns: ['/library'] },
    { to: '/nutrition', icon: Salad, labelKey: 'nav.nutritionShort' },
    { to: '/progress', icon: TrendingUp, labelKey: 'nav.progress' },
    // The marketplace desk and the plan library are the coach's work, reached from here and
    // belonging here. `/compose` is the one the mockup names outright.
    { to: '/coach', icon: UsersRound, labelKey: 'nav.coach', owns: ['/compose', '/m'] },
    { to: '/settings', icon: User, labelKey: 'nav.profile', owns: ['/coins'] },
  ],
  admin: [
    { to: '/', icon: Home, labelKey: 'nav.home', end: true },
    { to: '/workout', icon: Dumbbell, labelKey: 'nav.workout', owns: ['/library'] },
    { to: '/nutrition', icon: Salad, labelKey: 'nav.nutritionShort' },
    { to: '/progress', icon: TrendingUp, labelKey: 'nav.progress' },
    { to: '/coach', icon: UsersRound, labelKey: 'nav.coach', owns: ['/compose', '/m'] },
    { to: '/admin', icon: Shield, labelKey: 'nav.admin' },
    { to: '/settings', icon: User, labelKey: 'nav.profile', owns: ['/coins'] },
  ],
};

/**
 * Where the bar stops being a floating pill and becomes a full-width slab.
 *
 * Both approved mockups are right, for different roles: `02-workout-player.png` shows a member's
 * five-tab bar as an inset pill, and `11-admin-attekintes.png` shows an admin's seven-tab bar
 * running edge to edge with its longest labels truncated. Seven pill-shaped cells do not fit a
 * 320 px phone with margins on both sides; seven full-width cells do, at 44 px each with room to
 * spare. So the shape follows the count.
 */
export const PILL_MAX_TABS = 5;

/** The nav is a convenience, never a permission — every route and endpoint re-checks the role. */
export function tabsForRole(role: string | undefined): readonly NavTabSpec[] {
  if (role === 'admin') return NAV_TABS.admin;
  if (role === 'coach') return NAV_TABS.coach;
  return NAV_TABS.user;
}
