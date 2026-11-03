import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '../features/auth/useSession';
import { isVerifiedSession } from '../features/auth/sessionCache';
import { guardViewOf, reconcileSession, reverifyWhileHint } from '../features/auth/sessionGuard';
import { ScreenSkeleton } from '../ui/feedback/ScreenSkeleton';

/**
 * Route guard.
 *
 * The states are deliberately distinct. While the session is still unknown we render a skeleton —
 * redirecting to /login on `undefined` would bounce every already-signed-in user through the login
 * screen on each cold start, which looks like a bug and feels like one.
 *
 * ═══ AN OFFLINE COLD START (review finding O1) ═════════════════════════════════════════════════
 *
 * "The server could not be reached" is not "signed out". When `/auth/me` fails with a NETWORK
 * error (or a gateway 502/503/504) and this device remembers a session it verified earlier
 * (features/auth/sessionCache.ts), the remembered profile is put into the session query as a
 * STALE, UNVERIFIED value (`updatedAt: 0`) and the shell draws — the tab bar for that role, and each
 * page's own offline state under the offline line. Writes are not queued here: the outbox
 * allow-list is unchanged (ADR L9), and the outbox DRAIN waits for a verified session.
 *
 * That value is for DRAWING only and grants nothing — every request still goes to the server,
 * which enforces roles; the full threat model is in sessionCache.ts. A hint is replaced by the
 * server's answer as soon as one arrives (the browser's `online` event, or this guard asking
 * again every `REVERIFY_MS` while it stands). A real 401 sends the person to /login and erases the
 * hint; so does a 403 or any other non-network failure of `/auth/me`, including a failed re-check
 * while the hint is already on screen (`reconcileSession`).
 *
 * The decisions live in features/auth/sessionGuard.ts, where `verify:session-cache` runs them.
 *
 * "A hint never acts" has one honest exception, in a frozen file: the workout player's set check
 * (`useWorkout`), on a network failure, queues the write under the hint's user id (the outbox
 * allow-list admits it). It is harmless: the drain is gated on a VERIFIED session and is scoped to
 * that id, so the entry only waits until the server has confirmed whose cookies these are. A
 * non-JSON 200 from /auth/me (a captive portal) is read as an error that is not "unreachable": it
 * erases the hint and goes to /login, which is the safe direction.
 *
 * This is a UX guard, not a security boundary: every protected resource is enforced on the
 * server. Nothing here decides who may read what.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data: user, isPending, error, dataUpdatedAt, refetch } = useSession();
  const location = useLocation();

  const unverified = !!user && !isVerifiedSession(user, dataUpdatedAt);

  // Remember what the SERVER said; erase on anything that is not "signed in"; seed the hint on an
  // unreachable start; end a hint that the server refuses on a re-check.
  useEffect(() => {
    reconcileSession(qc, { user, isPending, error, dataUpdatedAt });
  }, [qc, user, isPending, error, dataUpdatedAt]);

  // The `online` event can be missing (wifi up, server down), so a hint keeps asking.
  useEffect(() => {
    if (!unverified) return;
    return reverifyWhileHint(refetch);
  }, [unverified, refetch]);

  const view = guardViewOf({ user, isPending, error, dataUpdatedAt });
  // `seeding` is the one frame before the hint lands in the query: redirecting then would flash
  // the login page.
  if (view === 'pending' || view === 'seeding') return <ScreenSkeleton />;
  if (view === 'login') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
