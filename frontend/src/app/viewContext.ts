import { createContext, useContext } from 'react';
import type { NavView } from './navTabs';

/**
 * The view the signed-in layout is showing, for the parts of a screen that depend on it — today
 * one: the back control of the shared `/notifications` screen, whose parent is the root of the
 * view the user came from (`routeMeta.ts`, `byView`).
 *
 * `AppLayout` provides it (from `useView`). Outside the signed-in layout — the public pages, the
 * kit specimens — there is no view, and a consumer reads `null` and uses the plain row.
 */
export const ViewContext = createContext<NavView | null>(null);

export const useCurrentView = (): NavView | null => useContext(ViewContext);
