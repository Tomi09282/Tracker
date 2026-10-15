/*
 * WHERE A PUSHED SCREEN GOES BACK TO — pure data, on purpose.
 *
 * A pushed header shows a chevron and the NAME OF ITS PARENT, and the tab bar keeps the parent's
 * tab lit. The back target, the name over the title and the lit tab are one fact in three places,
 * which is how they drift: a header that says "Profil" over a bar that lights Kezdőlap. So the
 * fact is written once, here, and three readers share it:
 *
 *   ui/shell/ScreenHeader.tsx    draws the back control of `kind="push"` from the row of the
 *                                current route;
 *   scripts/check-nav.mjs        holds every row to the router (the route and its parent are real
 *                                paths) and to the three bundles (the name resolves);
 *   scripts/check-nav-active.mjs holds every signed-in row to the bar (the screen lights the tab
 *                                its parent lights).
 *
 * Both gates import this file straight into bare Node, so it follows the rules of `navTabs.ts`:
 * erasable syntax only, no runtime import, no JSX.
 *
 * WHAT A ROW IS. Route pattern (exactly as the router spells it, made absolute) to its parent.
 * Only pushed screens have a row. A tab root (`/settings`), a category screen (`/coach/plans`,
 * `/admin`, `/admin/styles`: an eyebrow that is not a way back) and a screen with its own header
 * (`/onboarding`, `/workout`, `/compose`) have none, and `routeMetaFor` answers null for them.
 *
 * Every parent and every name below is what the approved frames draw and what the pages already
 * linked to; nothing here is a new door.
 */

/** One pushed screen's way back. */
export interface RouteMeta {
  /** Router path of the screen the back control opens. Never parameterised. */
  parent: string;
  /** i18n key of the parent's name: the eyebrow beside the chevron, and the control's name. */
  parentLabelKey: string;
  /**
   * Draw the chevron alone. The name stays the control's accessible name; it is not printed.
   * The public pages are drawn this way (`post-detail-1`, `coach-profile-1`): their top row also
   * carries the sign-in link, and a visitor has no "Piactér" tab to be reminded of.
   */
  bare?: boolean;
}

export const ROUTE_META = {
  '/library/:id': { parent: '/library', parentLabelKey: 'nav.library' },
  '/coins': { parent: '/settings', parentLabelKey: 'nav.profile' },
  '/notifications': { parent: '/', parentLabelKey: 'nav.home' },
  '/coach/clients/:id': { parent: '/coach', parentLabelKey: 'coaching.title' },
  '/coach/clients/:id/chat': { parent: '/coach', parentLabelKey: 'coaching.title' },
  '/coach/plans/:id': { parent: '/coach/plans', parentLabelKey: 'plans.title' },
  '/compose/profile': { parent: '/compose', parentLabelKey: 'compose.backToDesk' },
  '/compose/posts/:publicId': { parent: '/compose', parentLabelKey: 'compose.backToDesk' },
  '/m/p/:publicId': { parent: '/m', parentLabelKey: 'common.back', bare: true },
  '/m/c/:handle': { parent: '/m', parentLabelKey: 'common.back', bare: true },
} as const satisfies Record<string, RouteMeta>;

/** A route pattern that has a row. */
export type PushedRoute = keyof typeof ROUTE_META;

/** A row together with the pattern it belongs to. */
export interface MatchedRouteMeta extends RouteMeta {
  route: PushedRoute;
}

/** Does a concrete pathname stand for a router pattern? A `:param` matches exactly one segment. */
function matchesPattern(pathname: string, pattern: string): boolean {
  const a = pathname.split('/');
  const b = pattern.split('/');
  return a.length === b.length && b.every((segment, i) => (segment.startsWith(':') ? a[i] !== '' : segment === a[i]));
}

/**
 * The way back from a pathname, or null when that screen is not a pushed one.
 *
 * A trailing slash is ignored, as the router ignores it. Segment counts must agree, so
 * `/coach/clients/7` and `/coach/clients/7/chat` find their own rows and `/library` finds none.
 */
export function routeMetaFor(pathname: string): MatchedRouteMeta | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  for (const route of Object.keys(ROUTE_META) as PushedRoute[]) {
    if (matchesPattern(path, route)) return { route, ...ROUTE_META[route] };
  }
  return null;
}
