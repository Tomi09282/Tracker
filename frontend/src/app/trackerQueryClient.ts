import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api';
import { SESSION_QUERY_KEY, forgetOnUnauthorized, forgetSession } from '../features/auth/sessionCache';

/**
 * The query client, with the sign-out signals for the remembered session
 * (features/auth/sessionCache.ts). Its own module, with no JSX, so the verify script can build the
 * real one and watch it erase the hint.
 *
 * `useLogout` ends with `qc.clear()` - that call IS "this person signed out" in this app, and it
 * is the one place every logout passes through, so the override erases the hint there rather than
 * asking the (frozen) hook to know about it. Any other `clear()` erasing the hint too is the safe
 * direction.
 */
class TrackerQueryClient extends QueryClient {
  override clear(): void {
    forgetSession();
    super.clear();
  }
}

export function createTrackerQueryClient(): QueryClient {
  // A 401 that reaches a screen means the refresh already failed: this device is not signed in,
  // so the remembered session must not outlive it (threat model: sessionCache.ts) - and the
  // session itself is asked again, so the guard learns it and sends the person to /login instead
  // of leaving a dead shell up. `forgetOnUnauthorized` skips the 401s that are not a sign-out (a
  // wrong password, the admin-grant step-up).
  const onUnauthorized = (error: unknown) => {
    // `cancelRefetch: false`: a page that fires K queries at once and gets K 401s asks /auth/me once.
    if (forgetOnUnauthorized(error)) void client.invalidateQueries({ queryKey: SESSION_QUERY_KEY }, { cancelRefetch: false });
  };
  const client: QueryClient = new TrackerQueryClient({
    queryCache: new QueryCache({ onError: onUnauthorized }),
    mutationCache: new MutationCache({ onError: onUnauthorized }),
    defaultOptions: {
      queries: {
        // Refetching every time the window regains focus is a mobile battery and data tax for
        // data that changes on the order of minutes. Screens that need freshness ask for it.
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // Retrying a 4xx just repeats a request the server already refused — and on a 429 it
          // actively makes the rate limiting worse.
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  });
  return client;
}
