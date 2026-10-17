import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router';
import { rolesOf, useSession } from '../features/auth/useSession';
import { SHARED_ROUTES, viewForPath, type NavView } from './navTabs';

/** sessionStorage, not localStorage: the last view is a fact about THIS tab's trail, not a setting. */
const LAST_VIEW_KEY = 'tracker.lastView';
const VIEWS: readonly NavView[] = ['user', 'trainer', 'admin'];

function readLastView(): NavView | null {
  try {
    const value = window.sessionStorage.getItem(LAST_VIEW_KEY);
    return VIEWS.includes(value as NavView) ? (value as NavView) : null;
  } catch {
    // A blocked storage (private mode, a sandboxed frame) only costs the shared screen its memory.
    return null;
  }
}

function writeLastView(view: NavView) {
  try {
    window.sessionStorage.setItem(LAST_VIEW_KEY, view);
  } catch {
    /* see readLastView */
  }
}

const isShared = (pathname: string) => SHARED_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * The view the current screen shows (plan decision R2): derived from the URL, except on the one
 * screen every view shares (`/notifications`), which keeps the view the user came from.
 *
 * The last view is remembered ONLY for that screen, in this tab's sessionStorage, and only from a
 * screen whose view the URL decided. It is never sent anywhere: a view grants nothing (R3).
 */
export function useView(): NavView {
  const { pathname } = useLocation();
  const { data: user } = useSession();
  const roles = useMemo(() => rolesOf(user), [user]);

  const view = useMemo(
    () => viewForPath(pathname, roles, isShared(pathname) ? readLastView() : null),
    [pathname, roles],
  );

  useEffect(() => {
    if (!isShared(pathname)) writeLastView(view);
  }, [pathname, view]);

  return view;
}
