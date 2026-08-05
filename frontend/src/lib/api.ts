/**
 * The single HTTP entry point. Every request in the app goes through here so the CSRF header,
 * the cookie policy and the error envelope are handled in exactly one place.
 */

/** The server's uniform error envelope. `code` is stable; `error` is prose and may change. */
export interface ApiErrorBody {
  error: string;
  code: string;
  requestId: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Correlates with the server log — worth surfacing in a support flow, never in a toast. */
  readonly requestId: string;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.error ?? 'request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'unknown';
    this.requestId = body.requestId ?? '';
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/**
 * `credentials: 'include'` is what makes the HttpOnly cookies travel; the tokens are never
 * visible to JavaScript, which is the entire point of storing them in cookies rather than in
 * localStorage.
 *
 * `X-CSRF: 1` is the header half of the server's triple CSRF check. A browser cannot attach a
 * custom header cross-origin without a preflight the server will refuse, so its presence is
 * meaningful — it is not a secret, and it does not need to be.
 */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers(options.headers);

  if (!SAFE_METHODS.has(method)) headers.set('X-CSRF', '1');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');

  const res = await fetch(`/api/v1${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* an empty or non-JSON body is fine on some responses */
  }

  if (!res.ok) throw new ApiError(res.status, (body ?? {}) as Partial<ApiErrorBody>);
  return body as T;
}

/**
 * Single-flight refresh.
 *
 * Without the shared promise, a page that fires several queries at once would send several
 * refresh requests with the same token. The server treats near-simultaneous replays as a benign
 * race and answers 409 — correct, but it means all but one of those queries fail for no good
 * reason. One in-flight refresh, awaited by everyone, avoids the situation entirely.
 */
let refreshInFlight: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= api('/auth/refresh', { method: 'POST' })
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/**
 * Calls the API and, on a 401, transparently refreshes once and retries.
 *
 * Deliberately NOT applied to the auth routes themselves: a failed login must surface as a
 * failed login, not trigger a refresh loop.
 */
export async function apiWithRefresh<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  try {
    return await api<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !path.startsWith('/auth/')) {
      if (await refreshSession()) return api<T>(path, options);
    }
    throw err;
  }
}
