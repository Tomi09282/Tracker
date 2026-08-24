import { useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';
import { useTheme, type ThemeState } from '../../ui/theme/ThemeProvider';

/**
 * What the SERVER stores, which is deliberately less than what `ThemeState` holds.
 *
 * `transparency` is a DEVICE answer, not an identity one. Whether translucent surfaces are
 * readable depends on the screen in front of you and on the OS preference set on that machine —
 * syncing it would take one device's accessibility decision and impose it on another where the
 * honest answer may be different. It lives in localStorage and stays there; `user_theme_prefs`
 * needs no new column and no migration.
 *
 * Written as an explicit Pick rather than left to `ThemeState`, so the next field added to the
 * theme has to state which side of that line it is on instead of being synced by default.
 */
export type SyncedTheme = Pick<ThemeState, 'pack' | 'accent' | 'gradient'>;

interface ThemeResponse {
  theme: SyncedTheme;
}

/**
 * Reconciles the locally-stored theme with the server copy.
 *
 * The direction matters. On first load the SERVER wins, because that is what makes a choice
 * follow the user to a new device — local storage on a fresh browser knows nothing. After that,
 * every local change is pushed up. The `hydrated` ref makes sure the server's answer is applied
 * exactly once, so a later refetch cannot stomp on a change the user just made.
 */
export function useThemeSync() {
  const { setTheme } = useTheme();
  const hydrated = useRef(false);

  const query = useQuery({
    queryKey: ['theme'],
    queryFn: () => apiWithRefresh<ThemeResponse>('/me/theme'),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (hydrated.current || !query.data) return;
    hydrated.current = true;
    setTheme(query.data.theme);
  }, [query.data, setTheme]);

  const save = useMutation({
    mutationFn: (theme: SyncedTheme) =>
      apiWithRefresh('/me/theme', { method: 'PUT', body: theme }),
  });

  return { save, loading: query.isPending };
}
