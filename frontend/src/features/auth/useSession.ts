import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiWithRefresh, ApiError } from '../../lib/api';

export interface SessionUser {
  id: number;
  email: string;
  role: 'user' | 'coach' | 'admin';
  created_at: number;
}

const SESSION_KEY = ['session'] as const;

/**
 * The session is a query, not context state, so every consumer shares one cache entry and one
 * in-flight request. `null` means "definitely signed out" — distinct from `undefined`, which
 * means "we do not know yet" and must render a skeleton rather than the login screen.
 */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async (): Promise<SessionUser | null> => {
      try {
        const { user } = await apiWithRefresh<{ user: SessionUser }>('/auth/me');
        return user;
      } catch (err) {
        // A 401 here is an answer, not a failure: the user is signed out. Throwing would put
        // the query in an error state and trigger pointless retries.
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api('/auth/login', { method: 'POST', body }),
    // Refetch rather than write the user in from the response: the server decides what the
    // session is, and /me is the single source of that truth.
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSION_KEY }),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api('/auth/register', { method: 'POST', body }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    // Clear everything, not just the session: cached lists may hold data this user could see
    // and the next one may not.
    onSuccess: () => qc.clear(),
  });
}
