# Frontend testing & performance

Why this design: [testing.md](testing.md) is the regression net for **backend** invariants; this file mirrors it on the **frontend**. The pieces that break silently in prod fire only on the sad path — the `api()` wrapper's 401→refresh→retry, the Web-Locks single-flight dedup, the `ErrorBoundary` fallback, forms rejecting out-of-bounds fields per the shared zod schema. So we test those against the **real** `api()` wrapper with a mocked *network* ([frontend-conventions.md](frontend-conventions.md)), never a stubbed wrapper. **Vitest** shares `vite.config.ts` for fast unit/component tests; **Playwright** drives the real cookie-auth flow against a real Express so the security surface (HttpOnly cookies, Path-scoped refresh, idempotency) is asserted end-to-end. The rest (a11y gate, Lighthouse budgets, size guardrails, prefetch, images, PWA) keeps the route-split bundle fast and accessible without hand-vigilance.

## Vitest + React Testing Library [must]

Unit-test the cheap-to-break, expensive-in-prod pieces with the real DOM, so a refactor that reopens them fails locally.

```ts
// vitest.config.ts — extends the app's Vite config; jsdom + a setup file.
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom', globals: true, css: false,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'], // Playwright specs run under their own runner
  },
}));
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw/server';
beforeAll(() => server.listen({ onUnhandledRequest: 'error' })); // an un-mocked call is a test bug
afterEach(() => server.resetHandlers());                          // per-test overrides don't leak
afterAll(() => server.close());
```

The load-bearing tests: `api()` must **refresh once on 401 then retry**, and a *concurrent* pair of 401s must trigger exactly **one** refresh (the Web-Locks / in-flight-promise dedup from [frontend-conventions.md](frontend-conventions.md)).

```ts
// src/lib/api.test.ts
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw/server';
import { api, ApiError } from './api';

it('401 → refresh → retry succeeds transparently', async () => {
  let refreshed = false;
  server.use(
    http.post('/api/auth/refresh', () => { refreshed = true; return new HttpResponse(null, { status: 200 }); }),
    http.get('/api/me', () => refreshed ? HttpResponse.json({ id: 'u1' }) : new HttpResponse(null, { status: 401 })),
  );
  await expect(api('/me')).resolves.toEqual({ id: 'u1' });
});

it('concurrent 401s share ONE refresh (single-flight dedup)', async () => {
  let refreshCount = 0, unlocked = false;
  server.use(
    http.post('/api/auth/refresh', () => { refreshCount++; unlocked = true; return new HttpResponse(null, { status: 200 }); }),
    http.get('/api/me', () => unlocked ? HttpResponse.json({ ok: true }) : new HttpResponse(null, { status: 401 })),
  );
  await Promise.all([api('/me'), api('/me'), api('/me')]);
  expect(refreshCount).toBe(1); // three 401s, one rotation — never a refresh storm
});

it('surfaces a non-auth failure as ApiError without refreshing', async () => {
  server.use(http.get('/api/me', () => new HttpResponse(null, { status: 500 })));
  await expect(api('/me')).rejects.toBeInstanceOf(ApiError);
});
```

The `ErrorBoundary` fallback and schema-guarded forms round it out. Forms reuse the **same** `.strict()` schema the backend validates with ([input-validation.md](input-validation.md)) — shared schema, so client and server can't drift.

```tsx
// src/components/ErrorBoundary.test.tsx
it('renders the fallback instead of a white screen', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs the caught error
  render(<ErrorBoundary><Boom /></ErrorBoundary>); // const Boom = () => { throw new Error('x'); };
  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  spy.mockRestore();
});

// src/components/TransferForm.test.tsx — user-event drives real input/submit.
it('blocks submit on a non-positive amount (client mirror of the shared zod schema)', async () => {
  const onSubmit = vi.fn();
  render(<TransferForm onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText(/amount/i), '-5');
  await userEvent.click(screen.getByRole('button', { name: /transfer/i }));
  expect(onSubmit).not.toHaveBeenCalled();          // never reaches api()
  expect(screen.getByRole('alert')).toHaveTextContent(/greater than 0/i);
});
```

## MSW request layer — tests + dev [should]

One set of handlers, typed against the shared response schemas and emitting the backend's **real** failure shapes, powers both Vitest and a backend-less Vite dev mode — so the FE runs without an encrypted-SQLite server, against the exact `{ error, code, requestId }` envelope ([api-conventions.md](api-conventions.md)).

```ts
// src/test/msw/handlers.ts — canonical mock backend, reused in Vitest AND dev mock mode.
import { http, HttpResponse } from 'msw';

// Mirror the closed error envelope exactly: { error, code, requestId }.
const err = (status: number, code: string, error: string, headers?: HeadersInit) =>
  HttpResponse.json({ error, code, requestId: 'mock-req' }, { status, headers });

export const handlers = [
  http.post('/api/auth/login', () => HttpResponse.json({ ok: true })), // 200 { ok: true } like the real endpoint; cookies set server-side, no token in body
  http.get('/api/me', () => HttpResponse.json({ id: 'u1', role: 'user' })),
  http.get('/api/needs-auth', () =>
    err(401, 'UNAUTHORIZED', 'access token expired', { 'WWW-Authenticate': 'Bearer error="invalid_token"' })),
  http.post('/api/transfer', async ({ request }) => {
    const { amount } = (await request.json()) as { amount: number };
    return amount > 100 ? err(409, 'CONFLICT', 'insufficient funds')          // 409 insufficient funds
                        : HttpResponse.json({ transferId: 1 }, { status: 201 }); // real body is { transferId } only (transaction-endpoints.md); `replayed` never leaves the server
  }),
  http.post('/api/orders', () => err(422, 'VALIDATION', 'idempotency key reused with different parameters')), // 422
  http.get('/api/reports', () => err(429, 'RATE_LIMITED', 'too many requests', { 'Retry-After': '30' })),      // 429
];
```

```ts
// src/test/msw/server.ts (Node/Vitest)   +   dev mock mode in main.tsx
export const server = setupServer(...handlers);            // import { setupServer } from 'msw/node'
// main.tsx: start the browser worker only when explicitly opted in.
if (import.meta.env.DEV && import.meta.env.VITE_API_MOCK === '1') {
  const { worker } = await import('./test/msw/browser'); // setupWorker(...handlers) — same handlers
  await worker.start({ onUnhandledRequest: 'bypass' });   // let Vite HMR/assets through
}
```

## Playwright e2e against the real cookie-auth flow [must]

Cookies, Path-scoping, and idempotency can only be proven against a real Express + real browser — assert HttpOnly flags, no token in web storage, refresh cookie sent only to `/api/auth/*`, and a double-clicked transfer producing exactly ONE effect.

```ts
// playwright.config.ts — build the app, serve it with the real Express, run e2e/**.
export default defineConfig({
  testDir: './e2e',
  // extraHTTPHeaders adds X-CSRF:1 to the APIRequestContext used in auth.setup.ts — the backend
  // csrfProtection middleware (auth-blueprint.md) rejects any state-changing call without it. The
  // browser-driven POSTs go through the real api() wrapper, which already sets the header itself.
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry', extraHTTPHeaders: { 'X-CSRF': '1' } },
  webServer: {
    // NODE_ENV=test → cookies use plain names, HttpOnly+SameSite but NOT Secure, so they
    // round-trip over plain-HTTP localhost (same caveat as supertest in testing.md). Pass env
    // via the `env` option (inline VAR=x prefixes are not cross-platform). The access TTL is a
    // fixed module constant (ACCESS_TTL_SEC, auth-blueprint.md), not env-tunable — so the refresh
    // path is forced deterministically by deleting the access cookie in-test, not by a short TTL.
    command: 'npm run build && node dist-server/index.js',   // adjust to your build/serve script
    env: { NODE_ENV: 'test' },
    url: 'http://localhost:3000/',   // the SPA root returns 200; Playwright needs a 2xx/3xx/400–403
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },                                   // login once
    { name: 'e2e', dependencies: ['setup'], use: { storageState: 'e2e/.auth/user.json' } },
  ],
});
```

```ts
// e2e/auth.setup.ts — real login once; persist the cookie jar for authed specs.
setup('authenticate', async ({ request, context }) => {
  await request.post('/api/auth/register', { data: creds });
  expect((await request.post('/api/auth/login', { data: creds })).status()).toBe(200);
  await context.storageState({ path: 'e2e/.auth/user.json' }); // cookies only — no tokens to save
});
```

```ts
// e2e/auth-flow.spec.ts — full lifecycle + the cookie security assertions.
test('lifecycle + cookie security', async ({ page, context }) => {
  await page.goto('/');
  // 1) No token is EVER in web storage — the point of HttpOnly cookies.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toMatch(/eyJ|refresh|access/i);
  // 2) access is HttpOnly; refresh is Path-scoped to /api/auth (not sent to ordinary /api/** calls).
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name.endsWith('access'))!.httpOnly).toBe(true);
  expect(cookies.find((c) => c.name.endsWith('refresh'))!.path).toBe('/api/auth');
  // 3) Refresh actually rotates. Rather than wait out the 15-min access TTL, drop just the access
  // cookie (dev name is 'access', auth-blueprint.md) so the next authed call is a real 401 →
  // api() runs its refresh-once-then-retry path. clearCookies({ name }) needs Playwright ≥1.43.
  await context.clearCookies({ name: 'access' });
  await page.getByRole('button', { name: /reload data/i }).click();
  await expect(page.getByText(/data loaded/i)).toBeVisible();     // survived via silent refresh
  expect((await context.cookies()).find((c) => c.name.endsWith('access'))).toBeDefined(); // reissued
  await page.getByRole('button', { name: /log ?out/i }).click();
  expect((await context.cookies()).length).toBe(0); // logout cleared the jar
});

test('double-clicked transfer → exactly ONE effect (idempotency)', async ({ page }) => {
  await page.goto('/transfer');
  await page.getByLabel(/amount/i).fill('30');
  const btn = page.getByRole('button', { name: /send/i });
  await Promise.all([btn.click(), btn.click()]);   // same Idempotency-Key on both
  await expect(page.getByTestId('balance')).toHaveText('70'); // debited once, not 40
});

test('denied: over-balance transfer shows the 409 message', async ({ page }) => {
  await page.goto('/transfer');
  await page.getByLabel(/amount/i).fill('999999');
  await page.getByRole('button', { name: /send/i }).click();
  await expect(page.getByRole('alert')).toHaveText(/insufficient funds/i); // maps the CONFLICT envelope
});
```

## Accessibility — jsx-a11y (static) + axe (runtime) + CI gate [should]

Static lint catches authoring bugs at write time; a runtime axe scan on every lazy route catches what the DOM actually renders — both hard-fail CI so a11y can't regress unnoticed.

```js
// eslint.config.js (flat) — add jsx-a11y to the existing React config.
import jsxA11y from 'eslint-plugin-jsx-a11y';
export default [ /* ...existing... */ { files: ['**/*.{tsx,jsx}'], ...jsxA11y.flatConfigs.recommended } ];
```

```ts
// e2e/a11y.spec.ts — runtime scan per route; the route set is already lazy-split, so this is natural.
import AxeBuilder from '@axe-core/playwright';
for (const path of ['/', '/transfer', '/settings']) {   // one entry per lazy route chunk
  test(`no serious/critical a11y violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    expect(blocking, JSON.stringify(blocking.map((v) => v.id))).toHaveLength(0); // block merge only on these
  });
}
```

## Performance budgets + Lighthouse CI [should]

Budgets on the real production build turn "the bundle crept up" into a red check — a small initial-JS budget defends the route-splitting; a separate budget lets heavy lazy chunks (charts/editors) exist without polluting first paint.

```json
// lighthouserc.json — run against the built SPA; hard-fail on regression. Script: "lhci autorun".
{ "ci": {
  "collect": { "staticDistDir": "./dist",
    "isSinglePageApplication": true,   // LHCI's static server must fall back to index.html, or /transfer 404s
    "url": ["http://localhost/index.html", "http://localhost/transfer"], "numberOfRuns": 3 },
  "assert": { "assertions": {
    "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
    "total-blocking-time": ["error", { "maxNumericValue": 200 }],
    "resource-summary:script:size": ["error", { "maxNumericValue": 180000 }]   // initial JS budget
  } },
  "upload": { "target": "temporary-public-storage" }
} }
```

## Bundle analysis + dependency-size guardrails [nice]

A treemap makes accidental bloat visible; a byte-budget check fails CI when a heavy dep lands in the initial chunk or a duplicate copy sneaks in (e.g. two `zod` versions) — policing that chart/editor/date libs stay in lazy route chunks.

```ts
// vite.config.ts — treemap on build (open dist/stats.html after `vite build`).
import { visualizer } from 'rollup-plugin-visualizer';
// plugins: [react(), visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true })]
```

```json
// .size-limit.json — per-entry byte budgets; size-limit fails CI when exceeded (size-limit-action
// comments the diff on PRs). Strict JSON — no comments inside the array. `path` accepts a glob.
// If a lazy-only dep leaks into the shell entry, the first line goes red — that's the tripwire.
[
  { "name": "initial app shell", "path": "dist/assets/index-*.js", "limit": "170 KB" },
  { "name": "charts route (lazy)", "path": "dist/assets/charts-*.js", "limit": "320 KB" }
]
```

## Route-based prefetching on intent [nice]

Routes are already `React.lazy` chunks, so warming the `import()` (and optionally its data) on hover/focus/visible makes navigation instant — while `saveData`/slow-connection checks keep it polite on metered links.

```ts
// src/lib/prefetch.ts — one registry so code and data warm TOGETHER, next to the lazy imports.
import type { QueryClient } from '@tanstack/react-query';

// Explicit entry type: with a bare `as const`, routes[key] is a union and TS rejects `.prefetch`
// on the members that lack it. `satisfies` keeps the literal keys for `keyof typeof routes`.
type RouteEntry = { load: () => Promise<unknown>; prefetch?: (qc: QueryClient) => void };

export const routes = {
  dashboard: { load: () => import('../pages/dashboard/Dashboard') },
  settings:  { load: () => import('../pages/settings/Settings'),
               prefetch: (qc: QueryClient) => qc.prefetchQuery({ queryKey: ['settings'], queryFn: fetchSettings }) },
} satisfies Record<string, RouteEntry>;

const slowLink = () => {
  const c = (navigator as any).connection;
  return c && (c.saveData || /^(slow-)?2g$/.test(c.effectiveType)); // respect Data Saver / 2G
};

export function prefetch(key: keyof typeof routes, qc?: QueryClient) {
  if (slowLink()) return;                     // don't burn a metered user's bytes speculatively
  const route: RouteEntry = routes[key];      // widen the per-key union so `.prefetch?.` typechecks
  route.load();                               // warm the JS chunk (import() is idempotently cached)
  if (qc) route.prefetch?.(qc);               // warm its first query, if any
}
```

```tsx
// src/components/NavLink.tsx — prefetch on hover/focus; IntersectionObserver covers scroll-into-view.
export function NavLink({ to, routeKey, children }: { to: string; routeKey: keyof typeof routes; children: React.ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { prefetch(routeKey); io.disconnect(); } });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [routeKey]);
  return (
    <Link ref={ref} to={to} onMouseEnter={() => prefetch(routeKey)} onFocus={() => prefetch(routeKey)}>{children}</Link>
  );
}
```

## Image optimization pipeline [nice]

Build-time AVIF/WebP with responsive `srcset` and explicit dimensions kills CLS and cuts bytes. Assets stay same-origin and inlined thumbnails are `data:` URIs — both already permitted by the stack's `imgSrc: ["'self'", 'data:']` helmet CSP ([server-skeleton.md](server-skeleton.md)), so no CSP change is needed.

```ts
// vite.config.ts — modern formats + srcset; inline tiny assets as data-URIs.
import { imagetools } from 'vite-imagetools';
// plugins: [react(), imagetools()],  build: { assetsInlineLimit: 4096 } // ≤4 KB → data: URI,
// allowed by the stack's `imgSrc: ["'self'", 'data:']` CSP (server-skeleton.md)
```

```tsx
// Usage — MULTIPLE formats need <picture>, not a bare <img srcSet>: one srcset can't hold mixed
// formats, so imagetools' `as=srcset` is width-only. `as=picture` returns { sources, img } — the
// browser picks avif→webp→jpg. width/height on the <img> are MANDATORY to reserve layout (no CLS).
import hero from '../assets/hero.jpg?w=400;800;1200&format=avif;webp;jpg&as=picture';
<picture>
  {Object.entries(hero.sources).map(([type, srcSet]) => (
    <source key={type} type={`image/${type}`} srcSet={srcSet as string}
            sizes="(max-width: 768px) 100vw, 768px" />
  ))}
  <img src={hero.img.src} width={hero.img.w} height={hero.img.h}
       loading="lazy" decoding="async" alt="Account overview dashboard" />
</picture>
```

## PWA / service worker — auth-aware offline strategy [nice]

The worker precaches the static shell but **never** caches authenticated or auth-endpoint responses — a cached cookie-gated `/api/**` reply could serve one user's data to another, and offline replay of a transfer would collide with the backend's idempotency/`sv` guards ([transaction-endpoints.md](transaction-endpoints.md)).

```ts
// vite.config.ts — Workbox via vite-plugin-pwa; runtime rules are deliberately conservative.
import { VitePWA } from 'vite-plugin-pwa';
VitePWA({
  registerType: 'prompt',                    // "new version available" prompt, never silent-swap mid-session
  workbox: {
    // navigateFallback answers EVERY navigation that isn't a precached URL — online or not — so it
    // must be the SPA shell; pointing it at an offline page would hijack deep links like /transfer.
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api\//],  // NEVER serve the app shell for API paths
    runtimeCaching: [
      { // same-origin static assets only; auth-gated data excluded by construction
        urlPattern: ({ url, sameOrigin }) => sameOrigin && !url.pathname.startsWith('/api/'),
        handler: 'StaleWhileRevalidate', options: { cacheName: 'app-shell' } },
      { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }, // nothing sensitive cached
    ],
  },
});
```

Money mutations are **online-only by policy** — no background-sync replay of transfers/orders. An offline replay would fire against idempotency keys and `sv` (session-version) checks after the token state has moved on, producing confusing double-submits and reuse-detection trips. The shell still loads offline; the app detects the offline state (`navigator.onLine` + failed `NetworkOnly` calls) and says so ("transfers are disabled until you reconnect"). The `updateSW` prompt lets the user adopt the new build at a safe moment, not mid-transaction.

## Storybook for the shared component + form library [nice]

Stories for every required state (loading/error/empty/success) plus the mapped backend error codes make presentational + form primitives self-documenting; the a11y addon plus core play functions turn each story into a visual + interaction test — reusing the same MSW handlers, so there's no second mock layer.

```ts
// .storybook/main.ts + preview.ts — Vite builder, a11y addon, shared MSW handlers.
// main.ts:  addons: ['@storybook/addon-a11y'],   // play/interactions are Storybook core since v9 — no addon
//           framework: { name: '@storybook/react-vite', options: {} }
import { initialize, mswLoader } from 'msw-storybook-addon';
import { handlers } from '../src/test/msw/handlers';       // preview.ts — same handlers as tests
initialize({ onUnhandledRequest: 'bypass' });
export const parameters = { msw: { handlers } };
export const loaders = [mswLoader];
```

```tsx
// src/components/TransferForm.stories.tsx — one story per required state + mapped error codes.
export const Empty: Story = {};
export const Loading: Story = { args: { pending: true } };
export const InsufficientFunds: Story = {                  // maps the 409 CONFLICT envelope
  parameters: { msw: { handlers: [http.post('/api/transfer',
    () => HttpResponse.json({ error: 'insufficient funds', code: 'CONFLICT', requestId: 'sb' }, { status: 409 }))] } } };
export const RateLimited: Story = {                        // maps the 429 RATE_LIMITED envelope
  parameters: { msw: { handlers: [http.get('/api/reports',
    () => HttpResponse.json({ error: 'too many requests', code: 'RATE_LIMITED', requestId: 'sb' }, { status: 429 }))] } } };
export const RejectsBadAmount: Story = {                   // play function → CI test via test-storybook
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText(/amount/i), '-1');
    await userEvent.click(c.getByRole('button', { name: /transfer/i }));
    await expect(c.getByRole('alert')).toHaveTextContent(/greater than 0/i);
  } };
```

Run `test-storybook` (interactions + a11y runner) as its own CI job. The three layers divide cleanly: **Vitest** proves logic in jsdom, **Storybook** proves component states in a real browser, **Playwright** proves the cookie-auth + idempotency flows against the real backend — no layer re-tests another's job.