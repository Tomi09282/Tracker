import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from './AppLayout';
import { RequireAuth } from './RequireAuth';
import { ScreenSkeleton } from '../ui/feedback/ScreenSkeleton';
import { AuthPage } from '../features/auth/AuthPage';
import { HomePage } from '../features/home/HomePage';

// Route-level splitting from day one. The library screen pulls in the muscle-map SVG and the
// search UI, none of which the auth screens or the home screen need.
const LibraryPage = lazy(() =>
  import('../features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const NotificationsPage = lazy(() =>
  import('../features/chat/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const ExerciseDetailPage = lazy(() =>
  import('../features/library/ExerciseDetailPage').then((m) => ({ default: m.ExerciseDetailPage })),
);
const CoachDashboard = lazy(() =>
  import('../features/coaching/CoachDashboard').then((m) => ({ default: m.CoachDashboard })),
);
const OnboardingPage = lazy(() =>
  import('../features/onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
);
const ClientDetailPage = lazy(() =>
  import('../features/coaching/ClientDetailPage').then((m) => ({ default: m.ClientDetailPage })),
);
const WorkoutPlayer = lazy(() =>
  import('../features/workout/WorkoutPlayer').then((m) => ({ default: m.WorkoutPlayer })),
);
const PlanListPage = lazy(() =>
  import('../features/plans/PlanListPage').then((m) => ({ default: m.PlanListPage })),
);
const PlanEditorPage = lazy(() =>
  import('../features/plans/PlanEditorPage').then((m) => ({ default: m.PlanEditorPage })),
);
const AdminPage = lazy(() =>
  import('../features/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
);
const PlaygroundPage = lazy(() =>
  import('../features/playground/PlaygroundPage').then((m) => ({ default: m.PlaygroundPage })),
);
const NutritionPage = lazy(() =>
  import('../features/nutrition/NutritionPage').then((m) => ({ default: m.NutritionPage })),
);
const ProgressPage = lazy(() =>
  import('../features/progress/ProgressPage').then((m) => ({ default: m.ProgressPage })),
);
const CoinsPage = lazy(() =>
  import('../features/coins/CoinsPage').then((m) => ({ default: m.CoinsPage })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

const suspended = (node: React.ReactNode) => <Suspense fallback={<ScreenSkeleton />}>{node}</Suspense>;

export const router = createBrowserRouter([
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/register', element: <AuthPage mode="register" /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'notifications', element: suspended(<NotificationsPage />) },
      { path: 'library', element: suspended(<LibraryPage />) },
      { path: 'library/:id', element: suspended(<ExerciseDetailPage />) },
      { path: 'nutrition', element: suspended(<NutritionPage />) },
      { path: 'progress', element: suspended(<ProgressPage />) },
      { path: 'coins', element: suspended(<CoinsPage />) },
      { path: 'settings', element: suspended(<SettingsPage />) },
      { path: 'playground', element: suspended(<PlaygroundPage />) },
      { path: 'admin', element: suspended(<AdminPage />) },
      { path: 'coach', element: suspended(<CoachDashboard />) },
      { path: 'coach/clients/:id', element: suspended(<ClientDetailPage />) },
      { path: 'coach/plans', element: suspended(<PlanListPage />) },
      { path: 'coach/plans/:id', element: suspended(<PlanEditorPage />) },
      { path: 'onboarding', element: suspended(<OnboardingPage />) },
      { path: 'workout', element: suspended(<WorkoutPlayer />) },
    ],
  },
  // Every unknown path lands somewhere real rather than on a blank screen.
  { path: '*', element: <Navigate to="/" replace /> },
]);
