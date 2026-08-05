import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/**
 * The product's display name comes from the server (`APP_NAME` in the backend env), never from
 * a literal in this bundle — a rename must not require a frontend release.
 *
 * The empty-string fallback is deliberate: rendering a placeholder like "Loading…" in Display
 * type, then swapping it for the real name, produces a visible flash on the very first screen
 * a user ever sees. An empty heading that fills in is quieter.
 */
export function useAppName(): string {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<{ appName: string }>('/config'),
    staleTime: Infinity,
  });
  return data?.appName ?? '';
}
