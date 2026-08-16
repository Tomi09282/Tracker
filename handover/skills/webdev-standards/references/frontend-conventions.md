# Frontend conventions — Vite + React + TypeScript + Tailwind

Setup: `npm create vite@latest <name> -- --template react-ts`, then add TailwindCSS per its
current Vite guide. `tsconfig.json` keeps `"strict": true` (never loosen it).

## Project structure

```
src/
  main.tsx            # createRoot + <App />
  App.tsx             # router + <Suspense> + error boundary
  pages/              # one folder per route — ALWAYS lazy-loaded
    dashboard/
      Dashboard.tsx
  components/         # shared presentational components
  hooks/              # shared hooks (useAuth, useApi...)
  lib/
    api.ts            # THE fetch wrapper — no raw fetch anywhere else
  types/              # shared TS types for API payloads
```

## Route-level code splitting (mandatory)

```tsx
// App.tsx — every route is a separate bundle chunk; first paint stays small.
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageSpinner } from './components/PageSpinner';

const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const Settings = lazy(() => import('./pages/settings/Settings'));

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<PageSpinner />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
```

Page components use `export default` — `React.lazy` resolves the module's default export, so a
named-only export fails at runtime, not at compile time.

Also lazy-load heavy, rarely-opened components (chart libraries, editors, modals with big deps).

Minimal implementations the template above imports:

```tsx
// components/ErrorBoundary.tsx — a class component: hooks cannot catch render errors.
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? (
      <div className="p-8 text-center">Something went wrong — please reload the page.</div>
    ) : (
      this.props.children
    );
  }
}
```

```tsx
// components/PageSpinner.tsx
export function PageSpinner() {
  return (
    <div className="flex justify-center p-16" role="status" aria-label="Loading">
      Loading…
    </div>
  );
}
```

## src/lib/api.ts — the single API gateway

Pairs with the backend: sends the HttpOnly cookies, the `X-CSRF: 1` header, and transparently
retries ONCE through `/api/auth/refresh` when the access token has expired.

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Plain-object headers only: the merge below is an object spread, and spreading a Headers
// instance (or the array form RequestInit allows) silently drops every entry.
type ApiOptions = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include', // send the HttpOnly auth cookies
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF': '1', // required by the backend CSRF middleware
      ...options.headers,
    },
  });
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => res.statusText));
  return res.status === 204 ? (undefined as T) : res.json();
}

// Deduplicated refresh: concurrent 401s in this tab share one request, and the Web Locks API
// serializes refreshes ACROSS tabs so the backend never sees a benign rotation race.
let refreshing: Promise<boolean> | null = null;
function tryRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const doRefresh = async () => {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF': '1' },
      });
      // 409 = another tab won the rotation race; the fresh cookies are already in the jar.
      return r.ok || r.status === 409;
    };
    return 'locks' in navigator ? navigator.locks.request('auth-refresh', doRefresh) : doRefresh();
  })()
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  try {
    return await request<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && (await tryRefresh())) {
      return request<T>(path, options); // one retry with the fresh access cookie
    }
    throw err;
  }
}
```

Usage: `const me = await api<User>('/users/me');` — never raw `fetch` in components.

## Conventions

- Tokens never touch `localStorage`/`sessionStorage`; auth state is "the cookie works or it
  doesn't" — keep a lightweight `useAuth` context holding the current user object from
  `/api/users/me`, cleared on 401 after a failed refresh.
- Every data fetch renders explicit loading / error / empty states — no silent failures.
- Tailwind: utilities in JSX; repeated patterns become components, not `@apply` soup. Design
  tokens (colors, spacing) live in the Tailwind theme (`@theme` in the CSS entry on v4,
  `tailwind.config` on v3), not hardcoded hex values.
- Components: single purpose, extract past ~150 lines; props typed with interfaces; no `any`.
- English identifiers and comments everywhere; comment the "why" of non-obvious logic.
- Vite dev proxy: forward `/api` to the backend port in `vite.config.ts` so cookies are
  first-party in development:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
```
