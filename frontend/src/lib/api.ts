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
  /**
   * The WHOLE envelope, kept rather than discarded.
   *
   * This class used to project three fields and throw the rest away, which was fine while every
   * error was a generic failure. It stopped being fine the moment a route started answering with
   * facts the user can act on: the composer's 409s carry `reason` plus which guidelines version to
   * accept, when the account becomes eligible, how many publish slots are left and, on a stale
   * save, the current row itself.
   *
   * All of that was being deleted here, one layer below any screen that could have used it, and the
   * symptom would have been a carefully-designed refusal rendering as "request failed".
   *
   * Read it through a narrow accessor rather than reaching in — see `conflictOf` in the composer.
   */
  readonly body: Readonly<Record<string, unknown>>;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.error ?? 'request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'unknown';
    this.requestId = body.requestId ?? '';
    this.body = body as Record<string, unknown>;
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

  // FormData GOES THROUGH UNTOUCHED, and both halves of that matter.
  //
  // Stringifying it produces the literal "[object FormData]" — a request that looks perfectly
  // healthy and uploads nothing. That exact bug has already been paid for once in this project's
  // smoke harness, which is why the multipart path is handled here rather than in a second helper
  // beside the upload screen.
  //
  // And the Content-Type must NOT be set: the browser writes it itself, with the multipart
  // boundary. Setting it by hand produces a header with no boundary and a body no parser can read.
  const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isMultipart) headers.set('Content-Type', 'application/json');

  const res = await fetch(`/api/v1${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
    body:
      options.body === undefined
        ? undefined
        : isMultipart
          ? (options.body as FormData)
          : JSON.stringify(options.body),
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
 * The auth routes where a 401 IS the answer, so it must never trigger a refresh: a wrong password
 * on login / change-credentials, a refresh token the server has refused (refreshing again would
 * loop), a logout of a session that is already gone, a registration. Everything else under
 * `/auth/` is bound to the session — `GET /auth/me` (who am I) and `PATCH /auth/me` (my name) —
 * and an expired 15-minute access cookie there is exactly what a refresh exists to repair.
 * (Before this list, ALL of `/auth/` was exempt: a cold start or a reconnect more than 15 minutes
 * after the last token read `/auth/me` as "signed out" although the 7-day refresh cookie was valid.)
 */
const NO_REFRESH = /^\/auth\/(?:login|register|refresh|logout|logout-all|change-credentials)(?:[/?]|$)/;

/**
 * A 401 that is about a step-up password, not the session: the admin grant, re-enabling an admin,
 * deleting one's own account. requireAuth already accepted the session, so a refresh repairs
 * nothing - it only replayed the same POST and sent every wrong password twice.
 */
const STEP_UP_REASONS: ReadonlySet<unknown> = new Set(['step_up_required', 'step_up_failed']);

/**
 * Calls the API and, on a 401, transparently refreshes once and retries.
 *
 * Not applied to the routes in `NO_REFRESH`: a failed login must surface as a failed login, not
 * trigger a refresh loop. A refresh that fails throws the ORIGINAL 401, so a caller that maps a 401
 * to "signed out" (`useSession`) still gets it.
 */
export async function apiWithRefresh<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  try {
    return await api<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !NO_REFRESH.test(path) && !STEP_UP_REASONS.has(err.body.reason)) {
      if (await refreshSession()) return api<T>(path, options);
    }
    throw err;
  }
}
