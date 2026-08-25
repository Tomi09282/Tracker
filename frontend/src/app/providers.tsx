import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { ThemeProvider } from '../ui/theme/ThemeProvider';
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
  // ThemeProvider sits INSIDE QueryClientProvider: the theme sync hook is a query, and a
  // provider cannot use a client that is mounted below it.
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ElementStyleProvider>
          {/* Mounted above every route, public and authenticated alike — the marketplace screens
              sit OUTSIDE AppLayout, so anything hung off the app shell would have missed them. */}
          <LoadingAnnouncer />
          {/* E15 shipped with five variants, an undo affordance and a polite live region, and the
              only file that ever rendered one was the variant playground. Every mutation in the
              product finished in silence — and a save that works and says nothing is
              indistinguishable from a save that did nothing. */}
          <ToastHost>
            {/* HOISTED OUT OF AppLayout, for the reason two comments up.
                It hung off the app shell, so the three public marketplace routes — the feed, a
                post, a coach's profile — had no offline notice at all. Those are the screens most
                likely to be opened on a phone with one bar, by somebody who has never signed in
                and has no reason to guess that the blank list means the network and not the shop.

                It is also the outbox's drain loop, and that half was already correct here: the
                outbox is per-user and empty for a signed-out visitor, so on a public route the
                strip only ever reports the connection itself.

                FIRST CHILD, deliberately. The strip is `sticky top-0` and takes up space rather
                than overlaying — that is what makes it push a page header down instead of covering
                it — so it has to sit ahead of the routes in the flow, not beside them. */}
            <OfflineIndicator />
            {children}
          </ToastHost>
        </ElementStyleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
