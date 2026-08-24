import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiWithRefresh, ApiError } from '../../lib/api';
import { clearOutbox } from '../../lib/outbox';

export interface SessionUser {
  id: number;
  email: string;
  /** NULL until they set one. Print it through `personLabel` (lib/person.ts), never raw. */
  display_name: string | null;
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

/**
 * Set — or clear — the name other people see.
 *
 * `null` is a real value the caller states explicitly, not an omission: clearing your name is
 * something a person is allowed to do, and the endpoint's schema requires the field so that
 * "clear it" and "I forgot to send it" cannot arrive as the same request.
 *
 * The response carries the fresh user, so the cache is written directly rather than invalidated —
 * this is the one mutation where the server's answer IS the whole session row, and a refetch would
 * make the name flicker back to its old value for a frame on a slow connection.
 */
export function useSetDisplayName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string | null) =>
      apiWithRefresh<{ user: SessionUser }>('/auth/me', {
        method: 'PATCH',
        body: { displayName },
      }),
    onSuccess: ({ user }) => qc.setQueryData(SESSION_KEY, user),
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
    //
    // The OUTBOX goes too, and for a stronger reason than the query cache. That cache lives in
    // memory and dies with the tab; the outbox is in localStorage, which is per-origin and
    // outlives the session by design. Left behind, it is one person's training data sitting in
    // the next person's browser on a shared phone — and it would be REPLAYED under their cookies
    // the moment the network returned. The server refuses those (every write is ownership-scoped)
    // but the payload should never have been there to send.
    onSuccess: () => {
      clearOutbox();
      qc.clear();
    },
    // Also on failure: a logout the server did not confirm still means this person is walking
    // away from the device, and a queue that survives "logout didn't quite work" is the exact
    // case worth defending.
    onError: () => clearOutbox(),
  });
}
