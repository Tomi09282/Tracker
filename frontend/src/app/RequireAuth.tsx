import { Navigate, useLocation } from 'react-router';
import { useSession } from '../features/auth/useSession';
import { ScreenSkeleton } from '../ui/feedback/ScreenSkeleton';

/**
 * Route guard.
 *
 * The three states are deliberately distinct. While the session is still unknown we render a
 * skeleton — redirecting to /login on `undefined` would bounce every already-signed-in user
 * through the login screen on each cold start, which looks like a bug and feels like one.
 *
 * This is a UX guard, not a security boundary: every protected resource is enforced on the
 * server. Nothing here decides who may read what.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: user, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <ScreenSkeleton />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
