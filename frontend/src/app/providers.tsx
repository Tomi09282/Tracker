import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { ElementStyleProvider } from '../ui/feedback/ElementStyleProvider';
import { LoadingAnnouncer } from '../ui/feedback/LoadingAnnouncer';
import { ToastHost } from '../ui/feedback/ToastHost';
import { OfflineIndicator } from '../ui/shell/OfflineIndicator';

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
  return (
    <QueryClientProvider client={queryClient}>
      <ElementStyleProvider>
        {/* Mounted above every route, public and authenticated alike — the marketplace screens
            sit OUTSIDE AppLayout, so anything hung off the app shell would have missed them. */}
        <LoadingAnnouncer />
        {/* The status zone (PLAN R14): the toast band drops over the header zone from here, for
            every route, public and authenticated alike. */}
        <ToastHost>
          {/* The offline line, and the drain loop of the outbox. Hoisted out of AppLayout so the
              public marketplace routes get it too; for a signed-out visitor the outbox is empty and
              the line only ever reports the connection itself.

              FIRST CHILD, deliberately. The line is `sticky top-0` and takes up space rather
              than overlaying, so it pushes a page header down instead of covering it; the toast
              band reads its height (`--offline-h`) and stands under it. */}
          <OfflineIndicator />
          {children}
        </ToastHost>
      </ElementStyleProvider>
    </QueryClientProvider>
  );
}
