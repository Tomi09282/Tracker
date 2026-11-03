/**
 * The decisions behind `RequireAuth`, kept out of the component so they can be run (not just read)
 * by `scripts/verify-session-cache.mjs` against a real `QueryClient`. No JSX, no React: only the
 * remembered-session helpers and the query client.
 *
 * The guard's contract, in one place (the why is in `sessionCache.ts`):
 *   - the server's answer always wins; a remembered hint is drawn only while `/auth/me` cannot be
 *     reached, and is marked unverified (`HINT_UPDATED_AT`) so nothing ACTS on it;
 *   - while it is a hint the guard keeps asking the server, and any answer that is not "unreachable"
 *     ends the hint: a 401 or 403 or 5xx-with-envelope sends the person to /login.
 */
import type { QueryClient } from '@tanstack/react-query';
import type { SessionUser } from './useSession';
import {
  HINT_UPDATED_AT,
  SESSION_QUERY_KEY,
  forgetSession,
  hintToUser,
  isUnreachable,
  isVerifiedSession,
  recallSession,
  rememberSession,
} from './sessionCache';

/**
 * `dataUpdatedAt` of the last answer this client wrote to the remembered session. TanStack keeps old
 * data through a failed refetch, so "the session is verified" is true of a snapshot that is
 * minutes old; only an answer NEWER than the last one remembered is fresh. Per client, so a guard
 * that remounts (public <-> signed-in layouts) does not re-write what it already wrote.
 */
const rememberedAt = new WeakMap<QueryClient, number>();

/** While the session is only a remembered hint, ask the server again this often (ms). */
export const REVERIFY_MS = 15_000;

export interface SessionSnapshot {
  /** `undefined`: unknown / failed. `null`: the server said signed out. */
  user: SessionUser | null | undefined;
  isPending: boolean;
  error: unknown;
  dataUpdatedAt: number;
}

export type GuardView = 'pending' | 'seeding' | 'draw' | 'login';

/**
 * What the guard renders. `seeding` is the one frame between "unreachable, and a hint exists" and
 * the hint landing in the query: a redirect there would flash the login page.
 */
export function guardView(s: { user: unknown; isPending: boolean; hasHint: boolean }): GuardView {
  if (s.isPending) return 'pending';
  if (s.user) return 'draw';
  if (s.hasHint) return 'seeding';
  return 'login';
}

/** Is there a hint to draw from? Only after an unreachable failure, never otherwise. */
export function hintFor(s: SessionSnapshot): boolean {
  return !s.isPending && !s.user && isUnreachable(s.error) && recallSession() !== null;
}

/**
 * What `RequireAuth` renders for a snapshot of the session query: the whole derivation (is there a
 * hint? which frame?) in one place, so the runtime check covers the wiring the offline start
 * depends on. Called every render, with no memo: a stale memo here would be a stale redirect.
 */
export function guardViewOf(s: SessionSnapshot): GuardView {
  return guardView({ user: s.user, isPending: s.isPending, hasHint: hintFor(s) });
}

/**
 * The side effects the guard owes for the current state of the session query. One function, one
 * place, run from a single effect in `RequireAuth`.
 */
export function reconcileSession(qc: QueryClient, s: SessionSnapshot): void {
  if (s.user && isVerifiedSession(s.user, s.dataUpdatedAt)) {
    // Remember ONLY a fresh successful answer: no failed refetch in the state, and newer than the
    // last one this client remembered. Anything else is the cache replaying an old answer, and
    // writing that would resurrect a hint that a 401 or a logout in another tab had just erased
    // (and renew its age for a session nobody has re-confirmed).
    if (s.error == null && s.dataUpdatedAt > (rememberedAt.get(qc) ?? 0)) {
      rememberSession(s.user);
      rememberedAt.set(qc, s.dataUpdatedAt);
    }
    return;
  }
  if (s.isPending) return;

  // The snapshot is what the last render saw; the cache may have moved on since (an answer landed
  // between the render and this effect). Every write below re-checks the cache and only acts while
  // it still holds the state the snapshot described: a newer answer always wins.
  const now = qc.getQueryState(SESSION_QUERY_KEY);

  if (!s.user) {
    if (isUnreachable(s.error)) {
      if (now?.data !== undefined || !isUnreachable(now?.error)) return; // a newer answer landed
      // Offline cold start: draw from the hint, marked stale so the next online read replaces it.
      const hint = recallSession();
      if (hint) qc.setQueryData(SESSION_QUERY_KEY, hintToUser(hint), { updatedAt: HINT_UPDATED_AT });
      // The render saw a hint that is gone now (erased or expired in between): leave the skeleton
      // frame for /login instead of waiting for a seed that will never come.
      else qc.setQueryData(SESSION_QUERY_KEY, null);
    } else {
      // A 401 (`null`), a 403, a 500 with the app's envelope: this device must not draw a session.
      forgetSession();
    }
    return;
  }

  // A hint is on screen and the re-check failed. TanStack keeps the old data through a failed
  // refetch, so without this a reachable refusal (403, 404, 429, 5xx with the app's envelope) would
  // leave the stale shell up for good. Only "still unreachable" may keep it.
  if (s.error && !isUnreachable(s.error)) {
    forgetSession();
    // Only while the cache still holds the hint this snapshot saw: a verified answer that landed
    // since must not be wiped by a refusal that is already history.
    if (now?.dataUpdatedAt === HINT_UPDATED_AT) qc.setQueryData(SESSION_QUERY_KEY, null);
  }
}

/**
 * Keep asking the server while the session is only a hint (the `online` event can be missing:
 * wifi up, server down). Returns the stop function — call it when the hint is gone.
 */
export function reverifyWhileHint(
  refetch: (options: { cancelRefetch: boolean }) => unknown,
  everyMs: number = REVERIFY_MS,
): () => void {
  // `cancelRefetch: false`: a request still in flight is joined, not abandoned. The default would
  // cancel a slow /auth/me every tick and start another, so on a link slower than the interval no
  // answer would ever be accepted, and requests would pile up at the server.
  const id = setInterval(() => void refetch({ cancelRefetch: false }), everyMs);
  return () => clearInterval(id);
}
