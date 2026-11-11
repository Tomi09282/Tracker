/**
 * The remembered session (offline cold start, review finding O1), exercised.
 *
 * Like `verify-outbox`, it imports the REAL modules under Node — `sessionCache.ts`,
 * `sessionGuard.ts`, `trackerQueryClient.ts`, `lib/api.ts` — with a dumb localStorage shim, so
 * nothing can pass here that the browser would fail. The state logic runs on a REAL `QueryClient` /
 * `QueryObserver` (the component only wires it; see `RequireAuth.tsx`), and the few things that
 * only exist as wiring in a React file or a frozen hook are pinned as source checks at the end.
 *
 * What it pins:
 *   1. what is stored: the minimal profile, no e-mail, no ladder; a forged, malformed, mismatched,
 *      control-character or too-old entry is never drawn from (and is dropped);
 *   2. "unreachable" is a genuine fetch failure or a gateway, never an answer and never a coding bug;
 *   3. the verified / unverified split (`updatedAt: 0` is a hint) and what hangs on it: the outbox
 *      drain must not run under a hint;
 *   4. the guard's state machine on a real query: an unreachable start seeds the hint, a failed
 *      re-check that is still unreachable keeps it, one that is a real refusal erases it and ends on
 *      /login, a verified answer replaces it and is remembered;
 *   5. the re-check timer asks while a hint stands and stops when it is gone;
 *   6. sign-out: logout (`clear()`), a 401 on a query, a 401 on a mutation erase the hint; a wrong
 *      password does not;
 *   7. the wiring that is source only: `useLogout` ends with `qc.clear()`, `useSession` uses the key
 *      the guard seeds, `RequireAuth` / `OfflineIndicator` use the helpers above.
 *
 * Run: npm run verify:session-cache
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

// The app's imports are extensionless (the bundler resolves them); Node needs the `.ts`.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const store = new Map();
let blocked = false;
const guard = () => {
  if (blocked) throw new DOMException('blocked', 'SecurityError');
};
globalThis.localStorage = {
  getItem: (k) => (guard(), store.has(k) ? store.get(k) : null),
  setItem: (k, v) => (guard(), store.set(k, String(v))),
  removeItem: (k) => (guard(), store.delete(k)),
  clear: () => store.clear(),
};

const cache = await import('../src/features/auth/sessionCache.ts');
const guardMod = await import('../src/features/auth/sessionGuard.ts');
const { createTrackerQueryClient } = await import('../src/app/trackerQueryClient.ts');
const { ApiError, apiWithRefresh } = await import('../src/lib/api.ts');
const { QueryObserver, MutationObserver } = await import('@tanstack/react-query');

const {
  rememberSession, recallSession, forgetSession, hintToUser, isUnreachable, forgetOnUnauthorized,
  isVerifiedSession, SESSION_HINT_MAX_AGE_MS, SESSION_QUERY_KEY, HINT_UPDATED_AT,
} = cache;
const { guardView, guardViewOf, hintFor, reconcileSession, reverifyWhileHint, REVERIFY_MS } = guardMod;

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEY = 'tracker.session.hint.v1';
const NOW = 1_800_000_000_000;
const coach = {
  id: 7,
  email: 'secret.person@example.test',
  display_name: 'Nóra',
  role: 'coach',
  roles: ['user', 'coach'],
  created_at: 1_700_000_000,
};
const apiError = (status, error = 'x', requestId = 'req-1') => new ApiError(status, { error, code: 'X', requestId });
const netError = () => new TypeError('Failed to fetch');

/* ═══ 1. what is stored ═══════════════════════════════════════════════════════════════════════ */

rememberSession(coach, NOW);
{
  const raw = store.get(KEY) ?? '';
  check('the profile is remembered', recallSession(NOW + 1000)?.id === 7);
  check('the e-mail is NOT stored', !raw.includes('secret.person') && !raw.includes('email'));
  check('the account creation time is NOT stored', !raw.includes('created_at') && !raw.includes('1700000000'));
  const keys = Object.keys(JSON.parse(raw)).sort().join(',');
  check('exactly id, display_name, role, savedAt — no roles list', keys === 'display_name,id,role,savedAt', keys);
  const user = hintToUser(recallSession(NOW + 1000));
  check('the app-facing user derives the ladder from role, with a blank e-mail', user.role === 'coach' && user.roles.join() === 'user,coach' && user.email === '');
  check('an admin hint derives the full ladder', hintToUser({ id: 1, display_name: null, role: 'admin', savedAt: NOW }).roles.join() === 'user,coach,admin');
  check('a user hint derives only user', hintToUser({ id: 1, display_name: null, role: 'user', savedAt: NOW }).roles.join() === 'user');
}

const planted = (patch) => {
  store.set(KEY, JSON.stringify({ id: 7, display_name: 'x', role: 'user', savedAt: NOW, ...patch }));
  return recallSession(NOW + 1000);
};
check('a well-formed entry reads', planted({}) !== null);
check('an unknown role is refused', planted({ role: 'root' }) === null);
check('a role that disagrees with its roles list is refused (user / [admin])', planted({ role: 'user', roles: ['admin'] }) === null);
check('so is coach / [user, coach, admin]', planted({ role: 'coach', roles: ['user', 'coach', 'admin'] }) === null);
check('and user / [user, coach]', planted({ role: 'user', roles: ['user', 'coach'] }) === null);
check('a roles list that matches the ladder of role is tolerated (an earlier build wrote one)', planted({ role: 'coach', roles: ['user', 'coach'] })?.role === 'coach');
check('and its roles are never read back: the user drawn is derived from role', hintToUser(planted({ role: 'coach', roles: ['user', 'coach'] })).roles.join() === 'user,coach');
check('a non-array roles list is refused', planted({ roles: 'admin' }) === null);
check('a non-integer id is refused', planted({ id: 7.5 }) === null);
check('a string id is refused', planted({ id: '7' }) === null);
check('a zero / negative id is refused', planted({ id: 0 }) === null && planted({ id: -3 }) === null);
check('a non-string name is refused', planted({ display_name: { a: 1 } }) === null);
check('a null name is fine', planted({ display_name: null }) !== null);
check('a name of 120 code points (emoji, 240 UTF-16 units) is fine', planted({ display_name: '🎉'.repeat(120) }) !== null);
check('a name of 121 code points is refused', planted({ display_name: '🎉'.repeat(121) }) === null);
check('a name with a newline is refused', planted({ display_name: 'a\nb' }) === null);
check('a name with NUL is refused', planted({ display_name: 'a\u0000b' }) === null);
check('a name with DEL / a C1 control is refused', planted({ display_name: 'a\u007fb' }) === null && planted({ display_name: 'a\u0085b' }) === null);
check('a name with a bidi override / isolate is refused', planted({ display_name: 'a‮b' }) === null && planted({ display_name: 'a⁦b' }) === null);
check('an empty name is refused', planted({ display_name: '' }) === null);
check('a missing timestamp is refused', planted({ savedAt: undefined }) === null);
store.set(KEY, '{not json');
check('malformed JSON is refused', recallSession(NOW) === null);
check('and the malformed entry is dropped, not kept', !store.has(KEY));
check('an entry from the future (clock back / forged) is refused', planted({ savedAt: NOW + 10 * 60_000 }) === null);
rememberSession(coach, NOW);
check('an entry older than the refresh token life is ignored', recallSession(NOW + SESSION_HINT_MAX_AGE_MS + 1) === null);
check('and dropped', !store.has(KEY));

/* ═══ 2. "unreachable" ════════════════════════════════════════════════════════════════════════ */

check('a fetch TypeError (Chrome) is unreachable', isUnreachable(new TypeError('Failed to fetch')));
check('Firefox / Safari / React Native fetch failures are unreachable', [
  'NetworkError when attempting to fetch resource.', 'Load failed', 'Network request failed',
].every((m) => isUnreachable(new TypeError(m))));
check('a coding-bug TypeError is NOT unreachable', !isUnreachable(new TypeError("Cannot read properties of undefined (reading 'user')")) && !isUnreachable(new TypeError('x is not a function')));
check('a non-TypeError with a fetch-like message is NOT unreachable', !isUnreachable(new Error('Failed to fetch')));
check('502 / 503 / 504 are unreachable', [502, 503, 504].every((s) => isUnreachable(apiError(s))));
check('401 is NOT unreachable', !isUnreachable(apiError(401)));
check('403 is NOT unreachable', !isUnreachable(apiError(403)));
check("404 / 429 and the app's own 500 (it carries a requestId) are NOT unreachable", [404, 429, 500].every((s) => !isUnreachable(apiError(s))));
check('a 500 with no app envelope (a dev proxy to a dead upstream) IS unreachable', isUnreachable(apiError(500, 'x', '')));
check('a 404 with no envelope is still an answer', !isUnreachable(apiError(404, 'x', '')));
check('null / undefined / strings are NOT unreachable', !isUnreachable(null) && !isUnreachable(undefined) && !isUnreachable('offline'));

/* ═══ 3. verified / unverified, and what hangs on it ══════════════════════════════════════════ */

check('a hint (updatedAt 0) is NOT verified', !isVerifiedSession(coach, HINT_UPDATED_AT) && !isVerifiedSession(coach, 0));
check('a server answer (updatedAt > 0) is verified', isVerifiedSession(coach, 1) && isVerifiedSession(coach, Date.now()));
check('no user is never verified', !isVerifiedSession(null, 5) && !isVerifiedSession(undefined, 5));

/* ═══ 4. the guard on a real query ════════════════════════════════════════════════════════════ */

const snapshotOf = (obs) => {
  const r = obs.getCurrentResult();
  return { user: r.data, isPending: r.isPending, error: r.error, dataUpdatedAt: r.dataUpdatedAt };
};
const GOOD = { id: 7, email: 'real@example.test', display_name: 'Nóra', role: 'coach', roles: ['user', 'coach'], created_at: 1_700_000_000 };

{
  forgetSession();
  rememberSession(coach, Date.now());
  const qc = createTrackerQueryClient();
  let answer = () => Promise.reject(netError());
  const obs = new QueryObserver(qc, { queryKey: SESSION_QUERY_KEY, queryFn: () => answer(), retry: false, staleTime: 60_000 });
  const off = obs.subscribe(() => {});
  await obs.refetch();

  // -- an unreachable start with a remembered session
  let s = snapshotOf(obs);
  check('start offline: the query failed with no data', s.user === undefined && !s.isPending && isUnreachable(s.error));
  check('start offline: a hint is available', hintFor(s) === true);
  check('start offline: the guard shows the skeleton frame, not /login', guardViewOf(s) === 'seeding');
  reconcileSession(qc, s);
  s = snapshotOf(obs);
  check('start offline: the hint is seeded as the session', s.user?.id === 7 && s.user?.role === 'coach');
  check('start offline: and it is marked unverified (dataUpdatedAt 0)', s.dataUpdatedAt === 0 && !isVerifiedSession(s.user, s.dataUpdatedAt));
  check('start offline: the shell draws', guardView({ user: s.user, isPending: s.isPending, hasHint: false }) === 'draw');
  check('start offline: a verified-only consumer (the outbox drain) sees NO user', (isVerifiedSession(s.user, s.dataUpdatedAt) ? s.user : null) === null);
  check('start offline: the hint was not re-written as if the server had said it', JSON.parse(store.get(KEY)).savedAt <= Date.now());

  // -- a re-check that is still unreachable keeps the hint
  await obs.refetch();
  s = snapshotOf(obs);
  check('still offline: TanStack keeps the data through the failed re-check', s.user?.id === 7 && s.error !== null && s.dataUpdatedAt === 0);
  reconcileSession(qc, s);
  check('still offline: the hint stays', recallSession() !== null && snapshotOf(obs).user?.id === 7);

  answer = () => Promise.reject(apiError(503));
  await obs.refetch();
  reconcileSession(qc, snapshotOf(obs));
  check('a gateway 503 on the re-check keeps the hint', recallSession() !== null && snapshotOf(obs).user?.id === 7);

  // -- a re-check that is a real refusal ends it
  for (const [label, err] of [
    ['403', apiError(403)],
    ['404', apiError(404)],
    ['429', apiError(429)],
    ['the app\'s own 500', apiError(500)],
  ]) {
    forgetSession();
    rememberSession(coach, Date.now());
    qc.setQueryData(SESSION_QUERY_KEY, hintToUser(recallSession()), { updatedAt: HINT_UPDATED_AT });
    answer = () => Promise.reject(err);
    await obs.refetch();
    s = snapshotOf(obs);
    check(`a re-check failing with ${label} while the hint is on screen: the failure is in the state`, s.user?.id === 7 && s.error !== null);
    reconcileSession(qc, s);
    s = snapshotOf(obs);
    check(`...${label} erases the hint`, recallSession() === null);
    check(`...${label} clears the session data, so the guard redirects to /login`, s.user === null && guardViewOf(s) === 'login');
  }

  // -- a verified answer replaces the hint and is remembered
  forgetSession();
  rememberSession(coach, Date.now() - 1000);
  qc.setQueryData(SESSION_QUERY_KEY, hintToUser(recallSession()), { updatedAt: HINT_UPDATED_AT });
  answer = () => Promise.resolve(GOOD);
  await obs.refetch();
  s = snapshotOf(obs);
  check('back online: the server answer replaces the hint with a verified session', s.user?.email === 'real@example.test' && s.dataUpdatedAt > 0 && isVerifiedSession(s.user, s.dataUpdatedAt));
  const before = JSON.parse(store.get(KEY)).savedAt;
  forgetSession(); // e.g. another tab's wrong password or a swept entry: the verified answer re-writes it
  reconcileSession(qc, s);
  check('back online: it is remembered afresh (written by the verified answer, no e-mail)', recallSession() !== null && JSON.parse(store.get(KEY)).savedAt >= before && !('email' in JSON.parse(store.get(KEY))));
  check('back online: the drain may run (a verified user is visible)', (isVerifiedSession(s.user, s.dataUpdatedAt) ? s.user : null)?.id === 7);

  // -- only a FRESH SUCCESSFUL answer is remembered
  {
    const qc2 = createTrackerQueryClient();
    const verified = { user: GOOD, isPending: false, error: null, dataUpdatedAt: 1000 };
    forgetSession();
    reconcileSession(qc2, verified);
    check('a verified answer is remembered', recallSession() !== null);
    forgetOnUnauthorized(apiError(401, 'unauthorized'));
    check('(a) a data 401 erases the hint', recallSession() === null);
    reconcileSession(qc2, { ...verified, error: netError() });
    check('(a) ...and a later FAILED /auth/me (the offline case) does not rewrite the revoked user', recallSession() === null);
    reconcileSession(qc2, verified);
    check('(a) ...nor does the unchanged verified snapshot', recallSession() === null);
    rememberSession(coach, Date.now());
    forgetSession(); // another tab logged out
    reconcileSession(qc2, verified);
    check('(b) after another tab forgot, an unchanged verified snapshot does not rewrite it', recallSession() === null);
    reconcileSession(qc2, { ...verified, error: apiError(503) });
    check('(b) ...with an error in the snapshot neither', recallSession() === null);
    reconcileSession(qc2, { ...verified, dataUpdatedAt: 2000 });
    check('a genuinely newer successful answer remembers again', recallSession() !== null);
    forgetSession();
    reconcileSession(qc2, { ...verified, dataUpdatedAt: 2000 });
    check('...but only once per answer', recallSession() === null);
    const qc3 = createTrackerQueryClient();
    reconcileSession(qc3, { ...verified, dataUpdatedAt: 2000 });
    check('the bookkeeping is per client (a second client remembers its own first answer)', recallSession() !== null);
    forgetSession();
    reconcileSession(qc3, { ...verified, dataUpdatedAt: 3000, error: netError() });
    check('a snapshot with a failed refetch in it is never remembered, however new its data looks', recallSession() === null);
    qc2.clear();
    qc3.clear();
  }

  // -- a newer answer that landed between the render and the effect always wins
  {
    const qc4 = createTrackerQueryClient();
    const fresh = { ...GOOD, display_name: 'Newer' };
    forgetSession();
    rememberSession(coach, Date.now());
    qc4.setQueryData(SESSION_QUERY_KEY, fresh); // the server answered after the render took its snapshot
    reconcileSession(qc4, { user: undefined, isPending: false, error: netError(), dataUpdatedAt: 0 });
    check('seeding: a newer answer already in the cache is NOT overwritten by the hint', qc4.getQueryData(SESSION_QUERY_KEY)?.display_name === 'Newer');
    qc4.setQueryData(SESSION_QUERY_KEY, hintToUser(recallSession()), { updatedAt: HINT_UPDATED_AT });
    qc4.setQueryData(SESSION_QUERY_KEY, fresh);
    rememberSession(coach, Date.now());
    reconcileSession(qc4, { user: hintToUser(recallSession()), isPending: false, error: apiError(403), dataUpdatedAt: 0 });
    check('a refusal of the hint does NOT wipe a verified answer that has landed since', qc4.getQueryData(SESSION_QUERY_KEY)?.display_name === 'Newer');
    qc4.clear();

    // the render saw a hint, the effect finds it gone: the frame must not stay on the skeleton
    const qc5 = createTrackerQueryClient();
    const o5 = new QueryObserver(qc5, { queryKey: SESSION_QUERY_KEY, queryFn: () => Promise.reject(netError()), retry: false });
    const off5 = o5.subscribe(() => {});
    await o5.refetch();
    rememberSession(coach, Date.now());
    const snap = snapshotOf(o5);
    check('(setup) the render sees a hint and the seeding frame', guardViewOf(snap) === 'seeding');
    forgetSession(); // erased between the render and the effect
    reconcileSession(qc5, snap);
    check('seeding with the hint gone: the cache is forced to a render...', qc5.getQueryData(SESSION_QUERY_KEY) === null);
    check('...and the guard leaves the skeleton for /login', guardViewOf(snapshotOf(o5)) === 'login');
    off5();
    qc5.clear();
  }

  // -- a 401 (the query's own null) erases
  rememberSession(coach, Date.now());
  reconcileSession(qc, { user: null, isPending: false, error: null, dataUpdatedAt: Date.now() });
  check('/auth/me answering "signed out" (null) erases the hint', recallSession() === null);
  rememberSession(coach, Date.now());
  reconcileSession(qc, { user: undefined, isPending: false, error: apiError(403), dataUpdatedAt: 0 });
  check('/auth/me failing with a 403 and no data erases the hint', recallSession() === null);
  rememberSession(coach, Date.now());
  reconcileSession(qc, { user: undefined, isPending: false, error: new TypeError('x is not a function'), dataUpdatedAt: 0 });
  check('/auth/me failing with a coding bug (not the network) erases the hint and draws nothing', recallSession() === null && !hintFor({ user: undefined, isPending: false, error: new TypeError('x is not a function'), dataUpdatedAt: 0 }));
  reconcileSession(qc, { user: undefined, isPending: true, error: null, dataUpdatedAt: 0 });
  rememberSession(coach, Date.now());
  reconcileSession(qc, { user: undefined, isPending: true, error: null, dataUpdatedAt: 0 });
  check('while the first answer is pending nothing is erased or seeded', recallSession() !== null);
  forgetSession();
  check('with no hint, an unreachable start redirects to /login as before', guardViewOf({ user: undefined, isPending: false, error: netError(), dataUpdatedAt: 0 }) === 'login');
  rememberSession(coach, Date.now());
  check('guardViewOf, the whole derivation RequireAuth renders: pending / seeding / draw / login',
    guardViewOf({ user: undefined, isPending: true, error: null, dataUpdatedAt: 0 }) === 'pending'
    && guardViewOf({ user: undefined, isPending: false, error: netError(), dataUpdatedAt: 0 }) === 'seeding'
    && guardViewOf({ user: undefined, isPending: false, error: apiError(403), dataUpdatedAt: 0 }) === 'login'
    && guardViewOf({ user: GOOD, isPending: false, error: null, dataUpdatedAt: 5 }) === 'draw');
  forgetSession();

  off();
  qc.clear();
}

check('guardView: pending / draw / seeding / login', guardView({ user: undefined, isPending: true, hasHint: true }) === 'pending'
  && guardView({ user: { id: 1 }, isPending: false, hasHint: false }) === 'draw'
  && guardView({ user: undefined, isPending: false, hasHint: true }) === 'seeding'
  && guardView({ user: null, isPending: false, hasHint: false }) === 'login');

/* ═══ 5. the re-check timer ═══════════════════════════════════════════════════════════════════ */

{
  check('the re-check interval is a sane 5-60 s', REVERIFY_MS >= 5_000 && REVERIFY_MS <= 60_000, `${REVERIFY_MS} ms`);
  let calls = 0;
  let lastOptions;
  const stop = reverifyWhileHint((o) => { lastOptions = o; calls += 1; }, 15);
  await sleep(80);
  check('while a hint stands it asks the server again, repeatedly', calls >= 2, `${calls} calls in 80 ms`);
  check('and each ask joins an in-flight request instead of cancelling it (cancelRefetch: false)', lastOptions?.cancelRefetch === false);
  stop();
  const atStop = calls;
  await sleep(60);
  check('and stops asking the moment the hint is gone (the cleanup runs)', calls === atStop, `${atStop} -> ${calls}`);
}

{
  // A link slower than the interval: the answer must still be accepted, and requests must not pile up.
  const qc = createTrackerQueryClient();
  let started = 0;
  let finished = 0;
  const obs = new QueryObserver(qc, {
    queryKey: ['slow-session'],
    queryFn: async () => {
      started += 1;
      await sleep(120);
      finished += 1;
      return GOOD;
    },
    retry: false,
  });
  const off = obs.subscribe(() => {});
  const stop = reverifyWhileHint((o) => obs.refetch(o), 15);
  await sleep(260);
  stop();
  off();
  check('a slow /auth/me (8 ticks long) is joined, not abandoned: it finishes and its answer is accepted', finished >= 1 && obs.getCurrentResult().data?.id === 7, `started ${started}, finished ${finished}`);
  check('and the ticks did not pile up requests', started <= 4, `started ${started} in 260 ms`);
  qc.clear();
}

/* ═══ 6. sign-out ═════════════════════════════════════════════════════════════════════════════ */

{
  const qc = createTrackerQueryClient();

  rememberSession(coach, Date.now());
  qc.clear();
  check('logout: the query client erases the hint on clear() (useLogout ends with qc.clear())', recallSession() === null);

  rememberSession(coach, Date.now());
  await qc.fetchQuery({ queryKey: ['x'], queryFn: () => Promise.reject(apiError(401, 'unauthorized')), retry: false }).catch(() => {});
  check('a 401 on a query erases the hint', recallSession() === null);

  rememberSession(coach, Date.now());
  await qc.fetchQuery({ queryKey: ['y'], queryFn: () => Promise.reject(apiError(500)), retry: false }).catch(() => {});
  check('a 500 on a query does not', recallSession() !== null);

  rememberSession(coach, Date.now());
  await qc.fetchQuery({ queryKey: ['z'], queryFn: () => Promise.reject(apiError(403)), retry: false }).catch(() => {});
  check('a 403 on a page query (a role refusal) does not', recallSession() !== null);

  const mutate = (error) => new MutationObserver(qc, { mutationFn: () => Promise.reject(error) }).mutate().catch(() => {});
  rememberSession(coach, Date.now());
  await mutate(apiError(401, 'unauthorized'));
  check('a 401 on a mutation erases the hint', recallSession() === null);

  rememberSession(coach, Date.now());
  await mutate(apiError(401, 'invalid credentials'));
  check('a wrong password (401 "invalid credentials") does NOT erase it', recallSession() !== null);
  check('forgetOnUnauthorized agrees', forgetOnUnauthorized(apiError(401, 'invalid credentials')) === false && recallSession() !== null);

  check('a network error does not erase it', forgetOnUnauthorized(netError()) === false && recallSession() !== null);
  const stepUp = new ApiError(401, { error: 'granting admin requires your password', code: 'UNAUTHORIZED', requestId: 'r' });
  stepUp.body.reason = 'step_up_required';
  check("the admin-grant step-up 401 (reason 'step_up_required') does NOT erase it", forgetOnUnauthorized(stepUp) === false && recallSession() !== null);
  const otherReason = new ApiError(401, { error: 'unauthorized', code: 'UNAUTHORIZED', requestId: 'r' });
  otherReason.body.reason = 'something_new';
  check('an unknown 401 (even with a reason) erases it: the safe direction', forgetOnUnauthorized(otherReason) === true && recallSession() === null);
  rememberSession(coach, Date.now());
  check('a 401 erases it', forgetOnUnauthorized(apiError(401, 'unauthorized')) === true && recallSession() === null);
  check('a 401 with nothing stored is harmless', forgetOnUnauthorized(apiError(401, 'unauthorized')) === true && recallSession() === null);
  rememberSession(coach, NOW);
  forgetSession();
  check('forgetSession clears it', recallSession(NOW) === null && !store.has(KEY));
  qc.clear();
}

{
  // After a real 401 the session is asked again, so the guard learns it; a non-sign-out 401 does not.
  const qc = createTrackerQueryClient();
  let asked = 0;
  const obs = new QueryObserver(qc, { queryKey: SESSION_QUERY_KEY, queryFn: async () => { asked += 1; return GOOD; }, retry: false, staleTime: 60_000 });
  const off = obs.subscribe(() => {});
  await obs.refetch();
  const base = asked;
  await qc.fetchQuery({ queryKey: ['page'], queryFn: () => Promise.reject(apiError(401, 'unauthorized')), retry: false }).catch(() => {});
  await sleep(20);
  check('a real 401 on a page query makes the guard ask /auth/me again', asked > base, `${base} -> ${asked}`);
  const base2 = asked;
  // K simultaneous 401s: the session is asked once more, not K times
  {
    const qcK = createTrackerQueryClient();
    let askedK = 0;
    const obsK = new QueryObserver(qcK, { queryKey: SESSION_QUERY_KEY, queryFn: async () => { askedK += 1; await sleep(60); return GOOD; }, retry: false, staleTime: 60_000 });
    const offK = obsK.subscribe(() => {});
    await obsK.refetch();
    const baseK = askedK;
    await Promise.all([1, 2, 3, 4, 5].map((i) => qcK.fetchQuery({ queryKey: ['burst', i], queryFn: () => Promise.reject(apiError(401, 'unauthorized')), retry: false }).catch(() => {})));
    await sleep(160);
    check('five simultaneous 401s make /auth/me run once more, not five times', askedK === baseK + 1, `${baseK} -> ${askedK}`);
    offK();
    qcK.clear();
  }
  await qc.fetchQuery({ queryKey: ['page2'], queryFn: () => Promise.reject(apiError(401, 'invalid credentials')), retry: false }).catch(() => {});
  await sleep(20);
  check('a wrong password does not', asked === base2);
  off();
  qc.clear();
}

/* ═══ 6a. /auth/me goes through the refresh; the routes where a 401 is the answer do not ═══════════ */

{
  const realFetch = globalThis.fetch;
  const calls = [];
  const respond = (status, body = {}) => new Response(JSON.stringify(body), { status });
  const script = (handler) => {
    calls.length = 0;
    globalThis.fetch = async (url, init) => {
      const path = String(url).replace('/api/v1', '');
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      return handler(path, init?.method ?? 'GET');
    };
  };
  const rejection = (p) => p.then(() => null, (e) => e);

  try {
    // an expired access cookie with a valid refresh cookie: the cold start / reconnect case
    let accessOk = false;
    script((path, method) => {
      if (path === '/auth/me') return accessOk ? respond(200, { user: GOOD }) : respond(401, { error: 'unauthorized', code: 'UNAUTHORIZED', requestId: 'r' });
      if (path === '/auth/refresh' && method === 'POST') { accessOk = true; return respond(200); }
      return respond(404);
    });
    const me = await apiWithRefresh('/auth/me').catch((e) => e);
    check('expired access + valid refresh: /auth/me answers the user', me?.user?.id === 7);
    check('...by refreshing once and asking again', calls.join(' | ') === 'GET /auth/me | POST /auth/refresh | GET /auth/me', calls.join(' | '));

    // a refresh the server refuses: the original 401 comes back (useSession maps it to "signed out")
    script((path) => (path === '/auth/me' ? respond(401, { error: 'unauthorized', code: 'UNAUTHORIZED', requestId: 'r' }) : respond(401)));
    const refused = await rejection(apiWithRefresh('/auth/me'));
    check('failed refresh: /auth/me throws the ORIGINAL 401', refused instanceof ApiError && refused.status === 401 && refused.message === 'unauthorized');
    check('...after exactly one refresh attempt, no loop', calls.join(' | ') === 'GET /auth/me | POST /auth/refresh', calls.join(' | '));

    // the routes where a 401 is the real answer never trigger a refresh
    for (const [path, method] of [
      ['/auth/login', 'POST'], ['/auth/register', 'POST'], ['/auth/refresh', 'POST'],
      ['/auth/logout', 'POST'], ['/auth/logout-all', 'POST'], ['/auth/change-credentials', 'POST'],
    ]) {
      script(() => respond(401, { error: 'invalid credentials', code: 'UNAUTHORIZED', requestId: 'r' }));
      const err = await rejection(apiWithRefresh(path, { method, body: {} }));
      check(`a 401 on ${method} ${path} is the answer: no refresh`, err?.status === 401 && calls.length === 1, calls.join(' | '));
    }

    // the session-bound auth routes and everything else still refresh
    for (const [path, method] of [['/auth/me', 'PATCH'], ['/sets/42/check', 'POST'], ['/workouts/current', 'GET']]) {
      let ok = false;
      script((pth, m) => {
        if (pth === '/auth/refresh' && m === 'POST') { ok = true; return respond(200); }
        return ok ? respond(200, { ok: true }) : respond(401, { error: 'unauthorized', code: 'UNAUTHORIZED', requestId: 'r' });
      });
      const out = await rejection(apiWithRefresh(path, { method, body: method === 'GET' ? undefined : {} }));
      check(`${method} ${path}: an expired access cookie is refreshed and retried`, out === null && calls.length === 3 && calls[1] === 'POST /auth/refresh', calls.join(' | '));
    }
  } finally {
    globalThis.fetch = realFetch;
  }
}

/* ═══ 6b. the online path is exactly what it was ═══════════════════════════════════════════════ */

{
  // The pre-change defaults (commit 8a70da3, providers.tsx). Pinned as values so the check survives a
  // squash that drops the commit; cross-checked against the commit itself when it is reachable.
  const qc = createTrackerQueryClient();
  const d = qc.getDefaultOptions();
  check('the client sets only query defaults', Object.keys(d).join() === 'queries', Object.keys(d).join());
  check('...and exactly refetchOnWindowFocus, retry, staleTime', Object.keys(d.queries ?? {}).sort().join() === 'refetchOnWindowFocus,retry,staleTime');
  check('refetchOnWindowFocus is false', d.queries?.refetchOnWindowFocus === false);
  check('staleTime is 30 s', d.queries?.staleTime === 30_000);
  const retry = d.queries?.retry;
  check('retry: a 4xx is never retried', typeof retry === 'function' && [400, 401, 403, 404, 409, 429].every((st) => retry(0, apiError(st)) === false));
  check('retry: a 5xx and a network error are retried twice', typeof retry === 'function'
    && retry(0, apiError(500)) === true && retry(1, apiError(503)) === true && retry(2, apiError(500)) === false
    && retry(0, netError()) === true && retry(1, netError()) === true && retry(2, netError()) === false);
  let base = null;
  try {
    base = execFileSync('git', ['show', '8a70da3:frontend/src/app/providers.tsx'], { encoding: 'utf8', cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    console.log('NOTE  commit 8a70da3 is not reachable here: the defaults above stand on their pinned values only');
  }
  if (base) {
    const strip = (t) => t.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ');
    const tidy = strip(base);
    const mine = strip(readFileSync(new URL('../src/app/trackerQueryClient.ts', import.meta.url), 'utf8'));
    const block = (t) => t.match(/refetchOnWindowFocus: \w+, staleTime: [\d_]+, retry: \(failureCount, error\) => \{.*?return failureCount < \d; \},/)?.[0];
    check('and they match the original providers.tsx at 8a70da3, text for text', !!block(tidy) && block(tidy) === block(mine));
  }
  qc.clear();
}

blocked = true;
{
  let threw = false;
  try {
    rememberSession(coach, NOW);
    recallSession(NOW);
    forgetSession();
    forgetOnUnauthorized(apiError(401, 'unauthorized'));
  } catch {
    threw = true;
  }
  check('blocked storage costs the offline start its memory and nothing else', !threw && recallSession(NOW) === null);
}
blocked = false;

/* ═══ 7. wiring that exists only in a React file or a frozen hook (source) ════════════════════ */

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\s+/g, ' ');
const requireAuth = read('../src/app/RequireAuth.tsx');
const offline = read('../src/ui/shell/OfflineIndicator.tsx');
const session = read('../src/features/auth/useSession.ts');
const providers = read('../src/app/providers.tsx');
const clientSrc = read('../src/app/trackerQueryClient.ts');

check('useSession reads the key the guard seeds', session.includes("const SESSION_KEY = ['session'] as const;") && SESSION_QUERY_KEY.join() === 'session');
check('useLogout ends with qc.clear() on success (the sign-out signal the hint relies on)', /export function useLogout\(\) \{ const qc = useQueryClient\(\);.*?onSuccess: \(\) => \{ clearOutbox\(\); qc\.clear\(\); \}/.test(session));
check('the app builds its client through createTrackerQueryClient', /const queryClient = createTrackerQueryClient\(\);/.test(providers));
check('the client overrides clear() to erase the hint', /override clear\(\): void \{ forgetSession\(\); super\.clear\(\);/.test(clientSrc));
check('both caches route their errors through the 401 handler', /new QueryCache\(\{ onError: onUnauthorized \}\)/.test(clientSrc) && /new MutationCache\(\{ onError: onUnauthorized \}\)/.test(clientSrc));
check('RequireAuth runs reconcileSession in an effect over the session state', /reconcileSession\(qc, \{ user, isPending, error, dataUpdatedAt \}\)/.test(requireAuth) && /\[qc, user, isPending, error, dataUpdatedAt\]/.test(requireAuth));
check('RequireAuth splits verified from unverified through isVerifiedSession', /const unverified = !!user && !isVerifiedSession\(user, dataUpdatedAt\);/.test(requireAuth));
check('RequireAuth asks again only while unverified, and returns the stop function', /useEffect\(\(\) => \{ if \(!unverified\) return; return reverifyWhileHint\(refetch\); \}, \[unverified, refetch\]\)/.test(requireAuth));
check('RequireAuth shows the skeleton on the seeding frame and /login only on "login"', /view === 'pending' \|\| view === 'seeding'\) return <ScreenSkeleton \/>/.test(requireAuth) && /view === 'login'\) return <Navigate/.test(requireAuth));
check('RequireAuth takes its view from guardViewOf, with no memo of its own', /const view = guardViewOf\(\{ user, isPending, error, dataUpdatedAt \}\);/.test(requireAuth) && !/useMemo/.test(requireAuth));
check('the outbox drain runs only for a verified session', /const verifiedUser = isVerifiedSession\(user, dataUpdatedAt\) \? user : null;/.test(offline)
  && /if \(!verifiedUser\) return;/.test(offline)
  && /flushOutbox\(verifiedUser\.id,/.test(offline)
  && /\[verifiedUser, qc\]\);/.test(offline));
check('and it never reads the unverified user for the drain', !/flushOutbox\(user\./.test(offline));

console.log(`\nsession-cache: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
