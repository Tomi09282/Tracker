/*
 * THE TAB TABLE AND THE VIEW MODEL — pure data, on purpose.
 *
 * Two build gates import this file straight into bare Node (`check-nav-active.mjs`,
 * `check-assets.mjs`) and a third reads it as text (`check-nav.mjs`). So it may hold package
 * imports and TYPE-ONLY imports, erasable syntax, and nothing else: no image, no component, no
 * extension-less relative runtime import. The imports below are erased before Node resolves them.
 *
 * A tab names its icon by KEY. Which raster draws a key is decided in ONE place,
 * `assets/pulse/navIcons.ts`; the bar (`ui/nav/BottomNav.tsx`) draws it and `check:assets` holds
 * every key to its files on disk.
 */
import type { NavIconKey, SwitchIconKey } from '../assets/pulse/navIcons.ts';

/** The role an account holds, as `/auth/me` answers it in `roles` (the ladder user ⊂ coach ⊂ admin). */
export type NavRole = 'user' | 'coach' | 'admin';

/**
 * Which bar is on screen: the member's own, the trainer's or the admin's.
 *
 * A VIEW GRANTS NOTHING. It is derived from the URL on the client, never sent to the server, and
 * every route and endpoint keeps its own role check (plan decision R3; `check-routes` refuses a
 * server read of a client view). It decides which tabs are drawn — nothing else.
 */
export type NavView = 'user' | 'trainer' | 'admin';

/**
 * One destination tab, declared rather than resolved.
 *
 * `labelKey` and not `label` is the whole reason this file exists apart from `AppLayout`: a
 * translation key is a static string a build gate can look up in all three bundles without
 * rendering React, while a resolved label is only knowable at runtime inside a component that
 * needs a provider, a session and a router. `check-nav.mjs` reads this table.
 */
export interface NavDestinationSpec {
  kind?: 'tab';
  /** Stable React key and the cell's identity in the gates; unique within a bar. */
  key: string;
  to: string;
  /** Which raster draws the cell (`assets/pulse/navIcons.ts`). */
  icon: NavIconKey;
  labelKey: string;
  /** Without `end`, a tab prefix-matches every path below its `to`. */
  end?: boolean;
  /**
   * Other route prefixes this tab OWNS, for the active state only.
   *
   * `NavLink` decides `isActive` from its own `to`, which is right for navigation and wrong for
   * belonging: an exercise detail page lit NO tab at all, and the coach's desk lit nothing either.
   * A bar with nothing active has stopped answering "where am I", which is the only question it
   * exists to answer. Declared beside the tab so the gates can read the ownership as data.
   */
  owns?: readonly string[];
}

/**
 * A SWITCH cell — not a destination but a way back to another view (frame `bars`, "Váltó cella").
 *
 *   never lit         it is not where the user is; `isTabActive` answers false for it, always
 *   never current     so it never carries `aria-current`
 *   full name         its visible label is the destination ROLE ("↩ Tag", "↩ Edző"); its
 *                     accessible name is the whole phrase (`nameKey`: "Vissza: tag nézet")
 *   idle raster only  `icon` is a switch key, which has no lit raster (check:assets 4)
 *   first             the switch cells open the bar, in a fixed 64 pt column, a hairline after them
 */
export interface NavSwitchSpec {
  kind: 'switch';
  key: string;
  to: string;
  /** The view the switch returns to. */
  view: NavView;
  icon: SwitchIconKey;
  /** The short visible label: the destination role. */
  labelKey: string;
  /** The accessible name: the full phrase. */
  nameKey: string;
}

export type NavTabSpec = NavDestinationSpec | NavSwitchSpec;

export const isSwitch = (tab: { kind?: string }): tab is NavSwitchSpec => tab.kind === 'switch';

/**
 * Is this tab the one the user is currently inside?
 *
 * ═══ WHY IT LIVES HERE AND NOT IN THE BAR ══════════════════════════════════════════════════════
 *
 * This file is the pure one, so a gate can import it and assert over it without a DOM.
 * `check-nav-active.mjs` runs a table of routes through this function and checks that exactly one
 * tab lights on each, per view. The bar reads this ONE result for both the lit raster and
 * `aria-current`.
 *
 * ═══ THE THREE RULES ═══════════════════════════════════════════════════════════════════════════
 *
 * A switch never lights — on any path, its own `to` included.
 *
 * `end` is the flag of a tab whose `to` is a prefix of a sibling's (`/` of everything, `/coach`
 * of Tervek's `/coach/plans`, `/admin` of Fiókok's `/admin/accounts`).
 *
 * The prefix test is boundary-aware. `/coin` must not match `/coins` and `/m` must not match
 * `/measurements`, so a prefix counts only where the path ends there or continues with a slash.
 */
export function isTabActive(
  /*
   * Only the fields the rule reads, so it serves BOTH shapes: `NavTabSpec` here, which carries a
   * `labelKey`, and `NavTab` in the bar, which carries a resolved `label`.
   */
  tab: { kind?: string; to: string; end?: boolean; owns?: readonly string[] },
  pathname: string,
): boolean {
  if (isSwitch(tab)) return false;
  const owns = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  return (tab.end ? pathname === tab.to : owns(tab.to)) || (tab.owns?.some(owns) ?? false);
}

/**
 * THE BOTTOM BAR, PER VIEW (design round A, frame `bars`; plan Phase 1 "Tab sets").
 *
 *   user     Kezdőlap · Edzés · Étkezés · Haladás · Profil — the SAME five for every role. The
 *            trainer and admin views are entered from Profil (its NÉZETEK rows), not from a tab.
 *   trainer  ↩ Tag | Kliensek · Tervek · Pult
 *   admin    ↩ Tag · ↩ Edző | Moderáció · Fiókok · Piactér   (Szabályok, /admin/rules, is a door
 *            row on Moderáció — not a tab; Moderáció stays lit under it)
 *
 * The bar renders whatever it is given: there is no runtime clamp, because a clamp hides the
 * failure it was written to catch. `check-nav.mjs` asserts the counts and the switch order.
 *
 * `/notifications` is the one screen every view shares: it lights the tab of the view the user
 * came from (Kezdőlap, Kliensek or Moderáció — owner answer Q6 for the member's bar).
 *
 * The public marketplace (`/m…`) is owned by nobody: those routes render in `PublicLayout`, which
 * draws no bar.
 */
export const NAV_TABS: Record<NavView, readonly NavTabSpec[]> = {
  user: [
    // `end` stops `/` prefix-matching every route below it — and it also stops onboarding from
    // lighting anything. `owns` is the exception list `end` cannot express.
    { key: 'home', to: '/', icon: 'home', labelKey: 'nav.today', end: true, owns: ['/onboarding', '/notifications', '/habits', '/tasks'] },
    { key: 'training', to: '/workout', icon: 'training', labelKey: 'nav.workout', owns: ['/library'] },
    { key: 'nutrition', to: '/nutrition', icon: 'nutrition', labelKey: 'nav.nutritionShort' },
    { key: 'progress', to: '/progress', icon: 'progress', labelKey: 'nav.progress' },
    { key: 'profile', to: '/settings', icon: 'profile', labelKey: 'nav.profile', owns: ['/coins'] },
  ],
  trainer: [
    { kind: 'switch', key: 'switch-user', to: '/', view: 'user', icon: 'switch-user', labelKey: 'nav.switch.user', nameKey: 'nav.switch.userName' },
    // `end`: Tervek's `/coach/plans` sits under `/coach`. The client pages are Kliensek's.
    { key: 'clients', to: '/coach', icon: 'coach', labelKey: 'nav.clients', end: true, owns: ['/coach/clients', '/notifications'] },
    { key: 'plans', to: '/coach/plans', icon: 'plans', labelKey: 'nav.plans' },
    { key: 'desk', to: '/compose', icon: 'desk', labelKey: 'nav.desk' },
  ],
  admin: [
    { kind: 'switch', key: 'switch-user', to: '/', view: 'user', icon: 'switch-user', labelKey: 'nav.switch.user', nameKey: 'nav.switch.userName' },
    { kind: 'switch', key: 'switch-trainer', to: '/coach', view: 'trainer', icon: 'switch-trainer', labelKey: 'nav.switch.trainer', nameKey: 'nav.switch.trainerName' },
    // The style studio's only door is on Moderáció (its header link), and so is the point rules'
    // (its "Szabályok" door row), so both belong here.
    { key: 'moderation', to: '/admin', icon: 'admin', labelKey: 'nav.moderation', end: true, owns: ['/admin/styles', '/admin/rules', '/notifications'] },
    { key: 'accounts', to: '/admin/accounts', icon: 'accounts', labelKey: 'nav.accounts' },
    { key: 'market', to: '/admin/marketplace', icon: 'market', labelKey: 'nav.marketplace' },
  ],
};

/**
 * Where each view's screens live. A path belongs to the FIRST view whose prefix it is under
 * (boundary-aware, as `isTabActive`); a path under none of them is the member's.
 *
 * `/compose` is the trainer's desk (the Pult tab — it reverses Q5 for `/compose` only, owner
 * checkpoint C3); `/m` stays public and URL-only.
 */
export const VIEW_ROUTES: Readonly<Record<Exclude<NavView, 'user'>, readonly string[]>> = {
  trainer: ['/coach', '/compose'],
  admin: ['/admin'],
};

/** The screens every view shares: they show the bar of the view the user came from. */
export const SHARED_ROUTES: readonly string[] = ['/notifications'];

/** The role each view needs. A view the account cannot hold is never drawn. */
const VIEW_ROLE: Readonly<Record<NavView, NavRole>> = { user: 'user', trainer: 'coach', admin: 'admin' };

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The views an account may switch between, in bar order. A member has one. */
export function viewsFor(roles: readonly string[] | undefined): NavView[] {
  const held = new Set(roles ?? []);
  return (Object.keys(VIEW_ROLE) as NavView[]).filter((view) => view === 'user' || held.has(VIEW_ROLE[view]));
}

/**
 * The view a pathname shows.
 *
 *   * a shared screen (`/notifications`) keeps the view the user came from (`lastView`);
 *   * otherwise the URL decides: under `/coach` or `/compose` → trainer, under `/admin` → admin;
 *   * a view the account does not hold falls back to the member's bar — a member who opens
 *     `/coach` by URL sees their own bar and the page's refusal, never a trainer bar.
 *
 * Deep links, refresh and the back button work because nothing but the URL (and, for one shared
 * screen, the tab's own sessionStorage) decides it.
 */
export function viewForPath(pathname: string, roles: readonly string[] | undefined, lastView?: NavView | null): NavView {
  const allowed = viewsFor(roles);
  if (SHARED_ROUTES.some((p) => under(pathname, p))) {
    return lastView && allowed.includes(lastView) ? lastView : 'user';
  }
  for (const view of Object.keys(VIEW_ROUTES) as Exclude<NavView, 'user'>[]) {
    if (VIEW_ROUTES[view].some((p) => under(pathname, p))) return allowed.includes(view) ? view : 'user';
  }
  return 'user';
}

/** The nav is a convenience, never a permission — every route and endpoint re-checks the role. */
export function tabsForView(view: NavView): readonly NavTabSpec[] {
  return NAV_TABS[view];
}
