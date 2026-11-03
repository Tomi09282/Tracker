/**
 * The last session this device verified — kept ONLY so an offline cold start can draw the shell.
 *
 * ═══ THE PROBLEM ═══════════════════════════════════════════════════════════════════════════════
 *
 * A signed-in member who opens the app with no network used to land on /login: `/auth/me` fails
 * with a network error, `RequireAuth` read "no answer" as "signed out", and the sign-in form
 * appeared above a perfectly good offline line (review finding O1). The service worker already
 * serves the shell; the session was the only thing missing.
 *
 * ═══ THE THREAT MODEL — READ BEFORE CHANGING ANYTHING HERE ═════════════════════════════════════
 *
 * This record is a HINT FOR DRAWING, never a credential and never a permission.
 *
 *   - It grants nothing. It decides which bar and which page chrome to draw while the server is
 *     unreachable. Every request still carries the real HttpOnly cookies, and the server decides
 *     every read and write. Anyone who edits this entry by hand (devtools) can change which bar
 *     they SEE on their own device and nothing else: the data behind it is not here, and every
 *     endpoint re-checks the role on the server (ADR 0023: the view grants nothing).
 *   - It holds no token, cookie, e-mail or password: only the id, the name other people see, the
 *     stored role, and the time it was written. The ladder of roles is NOT stored: it is derived
 *     from `role` (`hintToUser`), so an entry cannot claim a role its own `role` does not hold.
 *   - Because it is unverified, it must never ACT. Anything that sends something under the
 *     session's identity waits for a server-verified answer (`isVerifiedSession`): the outbox
 *     drain in `OfflineIndicator` is gated on it, so a stale or planted hint cannot make
 *     `flushOutbox` send queued writes under somebody else's cookies and lose them to a 401.
 *   - It lives in localStorage, which is per-ORIGIN and outlives the tab — the same property that
 *     made the outbox dangerous on a shared phone. So it is erased by every event that means
 *     "this person is no longer signed in":
 *       · an explicit logout (`clear()` of the query client in `app/trackerQueryClient.ts`, which
 *         `useLogout` calls on success);
 *       · a 401 from a request, except "invalid credentials" (a wrong password is not a signed-out
 *         signal) — `QueryCache` / `MutationCache` `onError` in the same file;
 *       · `/auth/me` answering anything that is not "signed in" AND not "unreachable" — a 401 is
 *         `null`, a 403 or a 500 is an error that sends the person to /login (`reconcileSession`);
 *         the same for a failed re-check while the hint is on screen;
 *       · age: a record older than the refresh token's life (7 days, sliding) is ignored and
 *         dropped, because the server would no longer honour that session either. (The bound is
 *         the REFRESH cookie's, not the 15-minute access cookie's: `/auth/me` goes through the
 *         refresh, so a session whose access token lapsed hours ago is still resumable.)
 *   - It is read ONLY when `/auth/me` could not be reached (a genuine fetch failure, a gateway
 *     502/503/504, or a 5xx without the app envelope) — never to skip the check while the server
 *     answers. Online, the server's answer replaces it within one round trip (`RequireAuth` keeps
 *     asking while it is a hint).
 *   - Every access is wrapped in try/catch: blocked storage (private mode, a sandboxed frame)
 *     only costs the offline start its memory, and the app behaves exactly as before.
 *
 * Residual risks, stated rather than hidden:
 *   - a logout that FAILS (made offline) leaves this record, and it also leaves the member's
 *     cookies, which are the real exposure; the record adds nothing to it;
 *   - "a hint never acts" has one exception in a FROZEN file: the workout player's set check
 *     (`useWorkout`) queues a write under the hint's user id when the network fails (the outbox
 *     allow-list admits it). It is harmless — the drain waits for a verified session and is scoped
 *     to that user id — but it is not nothing;
 *   - a non-JSON 200 from `/auth/me` (a captive portal) is an error that is not "unreachable":
 *     the hint is erased and the person lands on /login. Accepted: it is the safe direction.
 *
 * The module imports only a TYPE, on purpose (erased at run time): `scripts/verify-session-cache.mjs`
 * runs the real file under Node with a six-line localStorage shim, as `verify-outbox` does for the
 * outbox.
 */
import type { SessionRole, SessionUser } from './useSession';

const KEY = 'tracker.session.hint.v1';

/** The session query's key, as `useSession` writes it (`useSession.ts` is frozen; the verify script pins the two together). */
export const SESSION_QUERY_KEY = ['session'] as const;

/** `dataUpdatedAt` of a session that is only a hint: any real server answer carries a later time. */
export const HINT_UPDATED_AT = 0;

/** The refresh token's sliding life (backend REFRESH_TTL_SEC): past it the server cannot resume the session. */
export const SESSION_HINT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const ROLES: readonly SessionRole[] = ['user', 'coach', 'admin'];

/** The minimal, non-sensitive profile. No e-mail, no tokens, no roles ladder, no account timestamps. */
export interface SessionHint {
  id: number;
  display_name: string | null;
  role: SessionRole;
  /** When this device last heard the server say "signed in" — the age check reads it. */
  savedAt: number;
}

const isRole = (v: unknown): v is SessionRole => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

/** The server's own rules for a name (auth/routes.js): no C0/C1/bidi control characters, at most 120 code points. */
const NAME_CONTROLS = /[\u0000-\u001F\u007F-\u009F‪-‮⁦-⁩]/;
const NAME_MAX_CODE_POINTS = 120;

function isValidName(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0 || v.length > NAME_MAX_CODE_POINTS * 2) return false;
  if (NAME_CONTROLS.test(v)) return false;
  return [...v].length <= NAME_MAX_CODE_POINTS;
}

/** Re-validates everything: the entry is user-editable storage, so it is parsed, not trusted. */
function parse(raw: string | null, now: number): SessionHint | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'number' || !Number.isSafeInteger(r.id) || r.id <= 0) return null;
  if (!isRole(r.role)) return null;
  // An entry written by an earlier build carried a `roles` list. It is never trusted: the ladder is
  // derived from `role`, so one that disagrees with it is a forged or corrupt entry — refused.
  if ('roles' in r) {
    const claimed = r.roles;
    const ladderOfRole = ladder(r.role);
    if (!Array.isArray(claimed) || claimed.length !== ladderOfRole.length || !ladderOfRole.every((x, i) => claimed[i] === x)) {
      return null;
    }
  }
  if (r.display_name !== null && !isValidName(r.display_name)) return null;
  if (typeof r.savedAt !== 'number' || !Number.isFinite(r.savedAt)) return null;
  const age = now - r.savedAt;
  // A negative age is a clock set backwards or a forged entry; neither is worth drawing for.
  if (age < 0 || age > SESSION_HINT_MAX_AGE_MS) return null;
  return { id: r.id, display_name: r.display_name as string | null, role: r.role, savedAt: r.savedAt };
}

/** Remember the verified session. Call it only with an answer the SERVER just gave. */
export function rememberSession(user: SessionUser, now: number = Date.now()): void {
  const hint: SessionHint = { id: user.id, display_name: user.display_name, role: user.role, savedAt: now };
  try {
    localStorage.setItem(KEY, JSON.stringify(hint));
  } catch {
    /* see the header: blocked storage only costs the offline start its memory */
  }
}

/** The remembered session, or `null` (none, malformed, too old — a bad entry is dropped). */
export function recallSession(now: number = Date.now()): SessionHint | null {
  try {
    const raw = localStorage.getItem(KEY);
    const hint = parse(raw, now);
    if (!hint && raw) localStorage.removeItem(KEY);
    return hint;
  } catch {
    return null;
  }
}

/** Erase it. Idempotent and silent — it runs from error paths. */
export function forgetSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to erase if storage is blocked */
  }
}

/** The shape the rest of the app reads. `email` and `created_at` are not remembered: blank / 0. */
export function hintToUser(hint: SessionHint): SessionUser {
  return {
    id: hint.id,
    email: '',
    display_name: hint.display_name,
    role: hint.role,
    roles: [...ladder(hint.role)],
    created_at: 0,
  };
}

function ladder(role: SessionRole): readonly SessionRole[] {
  return role === 'admin' ? ['user', 'coach', 'admin'] : role === 'coach' ? ['user', 'coach'] : ['user'];
}

/**
 * Did the SERVER say this user is signed in (as opposed to a hint seeded at `HINT_UPDATED_AT`)?
 * The one question that gates everything that ACTS under the session — the outbox drain, the
 * remembering itself. Drawing may use a hint; acting may not.
 */
export function isVerifiedSession(user: unknown, dataUpdatedAt: number): boolean {
  return !!user && dataUpdatedAt > HINT_UPDATED_AT;
}

/** What a browser's `fetch` says when no response came back (Chrome / Firefox / Safari / React Native). */
const FETCH_FAILURE = /failed to fetch|networkerror|load failed|network request failed/i;

/**
 * "The server could not be reached" — as opposed to "the server answered".
 *
 *   - a fetch that fails before any response is a TypeError with one of the browsers' own messages
 *     (a bare `TypeError` from a coding bug in the request path is NOT the network and must not
 *     draw a stale shell);
 *   - a gateway in front of a dead upstream answers 502/503/504, or any other 5xx WITHOUT the app's
 *     own error envelope (an empty `requestId`: the app's central error handler always stamps one,
 *     so a 5xx without it came from something in front of the app — a dev proxy, a load balancer).
 *
 * A 401 or 403 is an ANSWER and is never unreachable.
 */
export function isUnreachable(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const e = err as { name?: unknown; message?: unknown; status?: unknown; requestId?: unknown };
  if (typeof e.status === 'number') {
    if (e.status === 502 || e.status === 503 || e.status === 504) return true;
    return e.status >= 500 && e.requestId === '';
  }
  return e.name === 'TypeError' && typeof e.message === 'string' && FETCH_FAILURE.test(e.message);
}

/** A wrong password is a 401 that says nothing about the session (the server's prose, see auth/routes.js). */
const WRONG_PASSWORD = 'invalid credentials';

/** The admin-grant dialog asks for the password first: a 401 with this `reason` (admin/routes.js) is a prompt, not a sign-out. */
const STEP_UP = 'step_up_required';

/**
 * A 401 means this device is not signed in: erase the hint. Returns whether it did.
 * Two 401s are exceptions because they say nothing about the session: "invalid credentials" (a
 * failed login or re-authentication) and `reason: 'step_up_required'` (the admin-grant dialog). An
 * UNKNOWN 401 erases: that is the safe direction.
 */
export function forgetOnUnauthorized(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const e = err as { status?: unknown; message?: unknown; body?: { reason?: unknown } | null };
  if (e.status !== 401 || e.message === WRONG_PASSWORD || e.body?.reason === STEP_UP) return false;
  forgetSession();
  return true;
}
