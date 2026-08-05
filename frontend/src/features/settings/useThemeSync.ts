import { useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';
import { useTheme, type ThemeState } from '../../ui/theme/ThemeProvider';

interface ThemeResponse {
  theme: ThemeState;
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
    mutationFn: (theme: ThemeState) =>
      apiWithRefresh('/me/theme', { method: 'PUT', body: theme }),
  });

  return { save, loading: query.isPending };
}
