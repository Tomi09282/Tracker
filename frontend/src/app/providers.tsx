import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { ThemeProvider } from '../ui/theme/ThemeProvider';
import { ElementStyleProvider } from '../ui/feedback/ElementStyleProvider';
import { LoadingAnnouncer } from '../ui/feedback/LoadingAnnouncer';

const queryClient = new QueryClient({
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

export function Providers({ children }: { children: ReactNode }) {
  // ThemeProvider sits INSIDE QueryClientProvider: the theme sync hook is a query, and a
  // provider cannot use a client that is mounted below it.
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ElementStyleProvider>
          {/* Mounted above every route, public and authenticated alike — the marketplace screens
              sit OUTSIDE AppLayout, so anything hung off the app shell would have missed them. */}
          <LoadingAnnouncer />
          {children}
        </ElementStyleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
