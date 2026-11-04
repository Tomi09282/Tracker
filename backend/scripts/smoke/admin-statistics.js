// scripts/smoke/admin-statistics.js — package B-admin-stats against the running server:
// GET /admin/statistics (the Statistics page) and the `panel` on GET /admin/stats (the Moderation
// panel). Imported by scripts/smoke.js after the LifeOS sections and run last before logout.
//
// ═══ HOW THE NUMBERS ARE PROVED ════════════════════════════════════════════════════════════════
//
// The smoke database is shared with every earlier section, so absolute values are unknowable. The
// test therefore plants a FIXTURE with known rows straight into the database (three accounts, a
// handful of workouts and meals on known days, three ledger entries, one coach link, a disabled
// account, a removed post, a wallet that disagrees with its ledger) and compares every figure the
// API returns with an ORACLE: the raw rows read back with plain SELECTs and aggregated here in
// JavaScript, with Sets and Maps, not with the SQL the route uses. Two independent derivations of
// each number have to agree. The fixture's own effect is asserted as a delta of the oracle (before
// and after planting), so a fixture that silently failed to insert fails loudly instead of leaving
// the comparison trivially true.
//
// ═══ THE CACHE ═════════════════════════════════════════════════════════════════════════════════
//
// The route serves from a single-flight TTL cache, so the order of calls is part of the test: the
// first call for a window is the only one guaranteed fresh. The sections below are ordered so that
// each assertion about freshness or staleness is made on a key whose state is known (see the
// numbered steps). One wait (until both TTLs have run out) is unavoidable; it is spent once.

const MS_DAY = 86_400_000;
const PANEL_TTL_S = 30;
const STATS_TTL_S = 45;

export async function adminStatisticsSmoke({ call, check, Jar, seeded, stamp, PASSWORD }) {
  const { default: Database } = await import('better-sqlite3-multiple-ciphers');
  const { deriveDbKeyHex } = await import('../../src/lib/dbkey.js');
  const { createTtlCache } = await import('../../src/lib/ttl-cache.js');
  const conn = new Database(process.env.DB_PATH);
  conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  conn.pragma('busy_timeout = 5000');
  conn.pragma('foreign_keys = ON');
  const run = (sql, ...p) => conn.prepare(sql).run(...p);
  const one = (sql, ...p) => conn.prepare(sql).get(...p);
  const all = (sql, ...p) => conn.prepare(sql).all(...p);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
  const todayKey = dayKey(Date.now());
  const addDays = (k, n) => dayKey(Date.parse(`${k}T00:00:00Z`) + n * MS_DAY);
  const startSec = (k) => Date.parse(`${k}T00:00:00Z`) / 1000;
  const keysOf = (days) => Array.from({ length: days }, (_, i) => addDays(todayKey, i - (days - 1)));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  console.log('\n── admin statistics: GET /admin/statistics and the panel on GET /admin/stats ───────────');

  /* ── 0. the cache itself (pure; no server) ─────────────────────────────────────────────────── */
  {
    let t = 1_000;
    const cache = createTtlCache({ now: () => t });
    let calls = 0;
    const compute = async () => {
      calls += 1;
      await sleep(15);
      return { n: calls };
    };
    const burst = await Promise.all(Array.from({ length: 6 }, () => cache.get('k', 1_000, compute)));
    check('cache: six concurrent first calls run ONE computation (single-flight)', calls === 1 && burst.every((r) => r.value.n === 1), `${calls} computations`);
    check('cache: only the stored copy reports cached:true; the computing callers report false', burst.every((r) => r.cached === false));
    const again = await cache.get('k', 1_000, compute);
    check('cache: a call inside the TTL is served from the store and does not compute', again.cached === true && calls === 1 && again.value.n === 1);
    t += 999;
    check('cache: one millisecond before the TTL it is still the stored value', (await cache.get('k', 1_000, compute)).cached === true && calls === 1);
    t += 1;
    const expired = await cache.get('k', 1_000, compute);
    check('cache: at the TTL the value is recomputed', expired.cached === false && calls === 2 && expired.value.n === 2);
    let boom = true;
    const flaky = async () => {
      if (boom) throw new Error('db down');
      return 'ok';
    };
    let threw = false;
    try {
      await cache.get('f', 1_000, flaky);
    } catch {
      threw = true;
    }
    boom = false;
    const retry = await cache.get('f', 1_000, flaky);
    check('cache: a failed computation is not stored; the next caller retries', threw && retry.value === 'ok' && retry.cached === false);
    const other = await cache.get('other', 1_000, compute);
    check('cache: keys are independent', other.cached === false && calls === 3);
  }

  /* ── 1. accounts: the authorisation matrix and the fixture's people ────────────────────────── */
  const register = async (label) => {
    const jar = new Jar();
    const email = `adminstats-${label}-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
    const id = (await call('/api/v1/auth/me', { jar })).json?.user?.id;
    return { jar, id, email };
  };
  const relogin = async (u) => call('/api/v1/auth/login', { method: 'POST', body: { email: u.email, password: PASSWORD }, jar: u.jar });

  const admin = new Jar();
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.admin.email, password: seeded.admin.password }, jar: admin });
  const coachJar = new Jar();
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachJar });
  const member = await register('member');

  // Two accounts that HOLD the admin token and then lose the right: the token is a fast-path hint,
  // assertAdmin re-reads the role. Promoted straight in the database (there is no self-service path
  // to admin), logged in again so the token says admin, warmed on /auth/me so requireAuth's
  // session-version read is cached (the 30 s window in which only the DB re-check can refuse).
  const demoted = await register('demoted');
  run("UPDATE users SET role = 'admin' WHERE id = ?", demoted.id);
  await relogin(demoted);
  const disabledAdmin = await register('disabled-admin');
  run("UPDATE users SET role = 'admin' WHERE id = ?", disabledAdmin.id);
  await relogin(disabledAdmin);
  await call('/api/v1/auth/me', { jar: demoted.jar });
  await call('/api/v1/auth/me', { jar: disabledAdmin.jar });
  run("UPDATE users SET role = 'user' WHERE id = ?", demoted.id);
  run('UPDATE users SET disabled_at = unixepoch() WHERE id = ?', disabledAdmin.id);

  /* ── 2. the oracle ─────────────────────────────────────────────────────────────────────────── */
  const oracle = (days) => {
    const ks = keysOf(days);
    const from = ks[0];
    const fromSec = startSec(from);
    const toSec = startSec(addDays(todayKey, 1));
    const nowSec = Math.floor(Date.now() / 1000);
    const week = addDays(todayKey, -6);
    const o = { ks, days, from };

    const users = all('SELECT id, role, disabled_at AS d, must_change_credentials AS mc, created_at AS c FROM users');
    o.users = {
      total: users.length,
      byRole: { user: users.filter((u) => u.role === 'user').length, coach: users.filter((u) => u.role === 'coach').length, admin: users.filter((u) => u.role === 'admin').length },
      disabled: users.filter((u) => u.d !== null).length,
      mustChange: users.filter((u) => u.mc === 1).length,
      new7d: users.filter((u) => u.c >= nowSec - 7 * 86400).length,
    };
    const su = new Map(ks.map((k) => [k, 0]));
    for (const u of users) if (u.c >= fromSec && u.c < toSec) su.set(dayKey(u.c * 1000), (su.get(dayKey(u.c * 1000)) ?? 0) + 1);
    o.signups = ks.map((day) => ({ day, n: su.get(day) }));

    const wl = all('SELECT client_user_id AS u, local_date AS d, status AS s FROM workout_logs WHERE local_date >= ? AND local_date <= ?', from, todayKey);
    const nl = all('SELECT client_user_id AS u, local_date AS d FROM nutrition_log_items WHERE local_date >= ? AND local_date <= ?', from, todayKey);
    const people = new Map(ks.map((k) => [k, new Set()]));
    for (const r of [...wl, ...nl]) people.get(r.d)?.add(r.u);
    o.logged = ks.map((day) => ({ day, n: people.get(day).size }));
    o.loggedWindow = new Set([...wl, ...nl].map((r) => r.u)).size;
    const done = wl.filter((r) => r.s === 'completed');
    o.workouts = ks.map((day) => ({ day, n: done.filter((r) => r.d === day).length }));
    o.workoutsToday = done.filter((r) => r.d === todayKey).length;
    o.workoutsWeek = done.filter((r) => r.d >= week).length;
    o.nutrition = ks.map((day) => {
      const rows = nl.filter((r) => r.d === day);
      return { day, people: new Set(rows.map((r) => r.u)).size, entries: rows.length };
    });

    const led = all(
      `SELECT l.created_at AS c, l.amount_minor AS a, r.sign AS sg FROM coin_ledger l
         JOIN coin_reasons r ON r.key = l.reason_key WHERE l.created_at >= ? AND l.created_at < ?`,
      fromSec, toSec,
    );
    o.coins = ks.map((day) => {
      const rows = led.filter((r) => dayKey(r.c * 1000) === day);
      return {
        day,
        mintedMinor: rows.filter((r) => r.sg === 1).reduce((s, r) => s + Math.abs(r.a), 0),
        spentMinor: rows.filter((r) => r.sg === -1).reduce((s, r) => s + Math.abs(r.a), 0),
        entries: rows.length,
      };
    });

    const posts = all('SELECT removed_at AS r, deleted_at AS d, published_at AS p FROM coach_posts');
    const state = (p) => (p.r !== null ? 'removed' : p.d !== null ? 'withdrawn' : p.p === null ? 'draft' : p.p > nowSec ? 'scheduled' : 'live');
    o.posts = { total: posts.length, draft: 0, scheduled: 0, live: 0, withdrawn: 0, removed: 0 };
    for (const p of posts) o.posts[state(p)] += 1;

    const reps = all(
      `SELECT r.status_key AS s, rr.severity_rank AS sev, st.is_terminal AS t, r.resolved_at AS ra
         FROM content_reports r JOIN report_reasons rr ON rr.key = r.reason_key JOIN report_statuses st ON st.key = r.status_key`,
    );
    const open = reps.filter((r) => r.s === 'open');
    o.reports = {
      open: open.length,
      triaged: reps.filter((r) => r.s === 'triaged').length,
      openBySeverity: { high: open.filter((r) => r.sev >= 80).length, medium: open.filter((r) => r.sev >= 50 && r.sev < 80).length, low: open.filter((r) => r.sev < 50).length },
      resolvedInWindow: reps.filter((r) => r.t === 1 && r.ra !== null && r.ra >= fromSec && r.ra < toSec).length,
    };

    const links = all(
      `SELECT c.coach_id AS cid, u.role AS role, u.disabled_at AS d, c.status AS s FROM coach_clients c JOIN users u ON u.id = c.coach_id`,
    ).filter((l) => l.s === 'active' && l.role === 'coach' && l.d === null);
    const perCoach = new Map();
    for (const l of links) perCoach.set(l.cid, (perCoach.get(l.cid) ?? 0) + 1);
    const bucket = (n) => (n === 1 ? '1' : n <= 3 ? '2-3' : n <= 5 ? '4-5' : n <= 10 ? '6-10' : '11+');
    o.coaches = {
      withRole: users.filter((u) => u.role === 'coach' && u.d === null).length,
      withClients: perCoach.size,
      activeLinks: links.length,
      clientsPerCoach: perCoach.size ? Math.round((links.length / perCoach.size) * 10) / 10 : null,
      distribution: ['1', '2-3', '4-5', '6-10', '11+'].map((b) => ({ bucket: b, coaches: [...perCoach.values()].filter((n) => bucket(n) === b).length })),
    };
    o.activeCoaches = o.coaches.withClients;

    const tok = all(
      `SELECT t.user_id AS u, t.family_id AS f FROM refresh_tokens t JOIN users x ON x.id = t.user_id
        WHERE t.revoked = 0 AND t.consumed_at IS NULL AND t.expires_at > ? AND x.disabled_at IS NULL`,
      nowSec,
    );
    o.sessions = { people: new Set(tok.map((t) => t.u)).size, logins: new Set(tok.map((t) => t.f)).size };
    o.audit24h = one('SELECT COUNT(*) AS n FROM audit_log WHERE created_at >= ?', nowSec - 86400).n;
    o.exercises = one("SELECT COUNT(*) AS n FROM exercises WHERE deleted_at IS NULL").n;
    o.pending = one("SELECT COUNT(*) AS n FROM exercises WHERE status = 'pending_review' AND deleted_at IS NULL AND owner_id IS NOT NULL").n;
    return o;
  };

  /* ── 3. wave 1: the fixture ────────────────────────────────────────────────────────────────── */
  const A = await register('fx-a');
  const B = await register('fx-b');
  const C = await register('fx-c');
  const d1 = addDays(todayKey, -1);
  const d2 = addDays(todayKey, -3);
  const dOld = addDays(todayKey, -40);
  const dAncient = addDays(todayKey, -120);
  const before = oracle(90);

  const workout = (uid, date, status) =>
    run(
      `INSERT INTO workout_logs (client_user_id, status, started_at, completed_at, local_date, source)
       VALUES (?, ?, unixepoch() - 7200, ?, ?, 'freestyle')`,
      uid, status, status === 'completed' ? Math.floor(Date.now() / 1000) - 3600 : null, date,
    );
  const meal = (uid, date) =>
    run(
      `INSERT INTO nutrition_log_items (client_user_id, local_date, grams_x10, food_name_snapshot,
         kcal_per_100g_x10_snapshot, protein_mg_per_100g_snapshot, carb_mg_per_100g_snapshot, fat_mg_per_100g_snapshot)
       VALUES (?, ?, 1000, 'fixture', 100, 1, 1, 1)`,
      uid, date,
    );
  let ik = 0;
  const ledger = (uid, minor, reason, atSec) =>
    run(
      `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, idempotency_key, request_id, note, created_at)
       VALUES (?, ?, ?, ?, 'smoke-adminstats', 'fixture', ?)`,
      uid, minor, reason, `adminstats-${stamp}-${(ik += 1)}`, atSec,
    );

  workout(A.id, d1, 'completed');          // 2 completed workouts inside every window...
  workout(B.id, d2, 'completed');
  workout(C.id, d1, 'abandoned');          // ...a third that was only started: a person who logged, not a completed workout
  workout(A.id, dOld, 'completed');        // inside 90 only
  workout(A.id, dAncient, 'completed');    // outside every window
  meal(A.id, d1);
  meal(A.id, d1);                          // one person, two entries, on a day she also trained
  meal(B.id, todayKey);
  ledger(A.id, 7000, 'admin.credit', startSec(d1) + 43_200);
  ledger(A.id, -2000, 'admin.debit', startSec(d2) + 3_600);
  ledger(A.id, 300, 'admin.credit', startSec(dOld) + 3_600);
  run("UPDATE users SET role = 'coach' WHERE id = ?", C.id);
  run("INSERT INTO coach_clients (coach_id, client_id, status) VALUES (?, ?, 'active')", C.id, A.id);
  run('UPDATE users SET disabled_at = unixepoch() WHERE id = ?', B.id);
  run('UPDATE users SET must_change_credentials = 1 WHERE id = ?', A.id);
  const livePost = one('SELECT id FROM coach_posts WHERE removed_at IS NULL AND deleted_at IS NULL AND published_at IS NOT NULL AND published_at <= unixepoch() ORDER BY id LIMIT 1');
  if (livePost) run("UPDATE coach_posts SET removed_at = unixepoch(), removed_by = (SELECT id FROM users WHERE role = 'admin' LIMIT 1), removal_reason = 'fixture' WHERE id = ?", livePost.id);

  // One full second after the last insert, so any cache entry computed BEFORE the fixture carries an
  // epoch-second strictly below this value and any entry computed after it carries one at or above.
  await sleep(1_100);
  const plantedAtSec = Math.floor(Date.now() / 1000);
  const after = oracle(90);
  const dayN = (series, day, f = 'n') => series.find((p) => p.day === day)?.[f];
  check('fixture: three accounts, one disabled, one forced to change password, one coach',
    after.users.total - before.users.total === 0 && after.users.disabled - before.users.disabled === 1 && after.users.mustChange - before.users.mustChange === 1 && after.users.byRole.coach - before.users.byRole.coach === 1,
    `${after.users.total} users`);
  check('fixture: the workouts and meals landed on the planned days',
    dayN(after.workouts, d1) - dayN(before.workouts, d1) === 1 && dayN(after.workouts, d2) - dayN(before.workouts, d2) === 1 && dayN(after.workouts, dOld) - dayN(before.workouts, dOld) === 1 &&
      dayN(after.nutrition, d1, 'entries') - dayN(before.nutrition, d1, 'entries') === 2 && dayN(after.nutrition, d1, 'people') - dayN(before.nutrition, d1, 'people') === 1,
    `d1 workouts ${dayN(after.workouts, d1)}, d1 meals ${dayN(after.nutrition, d1, 'entries')}`);
  check('fixture: one person who trained AND ate on a day counts once; an abandoned start counts as a person, not a workout',
    dayN(after.logged, d1) - dayN(before.logged, d1) === 2, `${dayN(after.logged, d1)} people on ${d1}`);
  check('fixture: ledger entries and the coach link landed',
    dayN(after.coins, d1, 'mintedMinor') - dayN(before.coins, d1, 'mintedMinor') === 7000 && dayN(after.coins, d2, 'spentMinor') - dayN(before.coins, d2, 'spentMinor') === 2000 && after.coaches.activeLinks - before.coaches.activeLinks === 1,
    `links ${after.coaches.activeLinks}`);
  if (livePost) check('fixture: a live post was taken down', after.posts.removed - before.posts.removed === 1 && before.posts.live - after.posts.live === 1);

  /* ── 4. authorisation ──────────────────────────────────────────────────────────────────────── */
  {
    const r = await call('/api/v1/admin/statistics?days=7');
    check('GET /admin/statistics without a session -> 401', r.res.status === 401, `status ${r.res.status}`);
    const m = await call('/api/v1/admin/statistics?days=7', { jar: member.jar });
    check('GET /admin/statistics as a member -> 403', m.res.status === 403 && m.json?.code === 'forbidden', `status ${m.res.status}`);
    const c = await call('/api/v1/admin/statistics?days=7', { jar: coachJar });
    check('GET /admin/statistics as a coach -> 403', c.res.status === 403 && c.json?.code === 'forbidden', `status ${c.res.status}`);
    const dm = await call('/api/v1/admin/statistics?days=7', { jar: demoted.jar });
    check('a demoted admin whose token still says admin -> 403 from the DB re-check', dm.res.status === 403 && dm.json?.code === 'forbidden', `status ${dm.res.status}`);
    const da = await call('/api/v1/admin/statistics?days=7', { jar: disabledAdmin.jar });
    check('a disabled admin whose token still says admin -> 403 from the DB re-check', da.res.status === 403, `status ${da.res.status}`);
    const ps = await call('/api/v1/admin/stats', { jar: demoted.jar });
    check('the panel on GET /admin/stats is refused to the demoted admin too', ps.res.status === 403, `status ${ps.res.status}`);
    const bad = await call('/api/v1/admin/statistics?days=91', { jar: member.jar });
    check('a member with a bad window still gets 403, not a validation hint', bad.res.status === 403, `status ${bad.res.status}`);
    const post = await call('/api/v1/admin/statistics', { method: 'POST', body: {}, jar: admin });
    check('statistics is read-only: POST -> 404', post.res.status === 404, `status ${post.res.status}`);
  }

  /* ── 5. the first call: shape, zero-filling, and every number against the oracle ───────────── */
  const t0 = Date.now();
  const first = await call('/api/v1/admin/statistics?days=90', { jar: admin });
  const s = first.json;
  check('GET /admin/statistics?days=90 as admin -> 200 and not served from the cache (first call for the key)',
    first.res.status === 200 && s?.meta?.cached === false && s?.meta?.cacheTtlSeconds === STATS_TTL_S, `status ${first.res.status}`);
  check('the response is never cached by a browser or proxy', first.res.headers.get('cache-control') === 'no-store');
  const o90 = oracle(90);
  const ks90 = o90.ks;

  const dense = (name, series, ks, fields) =>
    check(`${name}: dense for the window (${ks.length} consecutive days ending today, integers >= 0)`,
      Array.isArray(series) && series.length === ks.length && series.every((p, i) => p.day === ks[i] && fields.every((f) => Number.isInteger(p[f]) && p[f] >= 0)),
      `${series?.length} points`);
  check('window: days, from, to and today (UTC)', same(s.window, { days: 90, from: ks90[0], to: todayKey, today: todayKey, clock: 'utc' }), JSON.stringify(s.window));
  dense('users.signups', s.users.signups.daily, ks90, ['n']);
  dense('activity.loggedPeople', s.activity.loggedPeople.daily, ks90, ['n']);
  dense('activity.completedWorkouts', s.activity.completedWorkouts.daily, ks90, ['n']);
  dense('activity.nutritionLog', s.activity.nutritionLog.daily, ks90, ['people', 'entries']);
  dense('coins', s.coins.daily, ks90, ['mintedMinor', 'spentMinor', 'entries']);
  check('every series names its clock', s.users.signups.clock === 'utc' && s.activity.loggedPeople.clock === 'local_date' && s.activity.completedWorkouts.clock === 'local_date' && s.activity.nutritionLog.clock === 'local_date' && s.coins.clock === 'utc');
  const quiet = ks90.find((k) => ![d1, d2, dOld, todayKey].includes(k) && dayN(o90.logged, k) === 0 && dayN(o90.workouts, k) === 0);
  check('a day with no activity is PRESENT with zeros (not skipped)', quiet !== undefined && dayN(s.activity.loggedPeople.daily, quiet) === 0 && dayN(s.activity.completedWorkouts.daily, quiet) === 0, quiet);

  check('users: total, role split, disabled, must-change, new in 7 days', same({ total: s.users.total, byRole: s.users.byRole, disabled: s.users.disabled, mustChange: s.users.mustChange, new7d: s.users.new7d }, o90.users), JSON.stringify(s.users.byRole));
  check('users.signups: the daily series and the window total equal the oracle', same(s.users.signups.daily, o90.signups) && s.users.signups.total === o90.signups.reduce((a, p) => a + p.n, 0), `total ${s.users.signups.total}`);
  check('activity.loggedPeople: daily series, today and distinct-in-window equal the oracle',
    same(s.activity.loggedPeople.daily, o90.logged) && s.activity.loggedPeople.today === dayN(o90.logged, todayKey) && s.activity.loggedPeople.inWindow === o90.loggedWindow, `window ${s.activity.loggedPeople.inWindow}`);
  check('activity.loggedPeople.inWindow is DISTINCT people, not the sum of the days', s.activity.loggedPeople.inWindow <= s.activity.loggedPeople.daily.reduce((a, p) => a + p.n, 0));
  check('activity.completedWorkouts: daily, window total, today and last 7 days equal the oracle',
    same(s.activity.completedWorkouts.daily, o90.workouts) && s.activity.completedWorkouts.total === o90.workouts.reduce((a, p) => a + p.n, 0) && s.activity.completedWorkouts.today === o90.workoutsToday && s.activity.completedWorkouts.last7d === o90.workoutsWeek,
    `total ${s.activity.completedWorkouts.total}`);
  check('the 90-day window holds the 40-day-old workout and not the 120-day-old one',
    dayN(s.activity.completedWorkouts.daily, dOld) === dayN(o90.workouts, dOld) && !s.activity.completedWorkouts.daily.some((p) => p.day === dAncient));
  check('activity.nutritionLog: people and entries per day equal the oracle', same(s.activity.nutritionLog.daily, o90.nutrition) && s.activity.nutritionLog.totalEntries === o90.nutrition.reduce((a, p) => a + p.entries, 0), `entries ${s.activity.nutritionLog.totalEntries}`);
  const minted = o90.coins.reduce((a, p) => a + p.mintedMinor, 0);
  const spent = o90.coins.reduce((a, p) => a + p.spentMinor, 0);
  check('coins: minted and spent per day come from the reason sign and equal the oracle',
    same(s.coins.daily, o90.coins) && s.coins.mintedMinor === minted && s.coins.spentMinor === spent && s.coins.movedMinor === minted + spent && s.coins.entries === o90.coins.reduce((a, p) => a + p.entries, 0),
    `minted ${minted}, spent ${spent}`);
  check('coins: the debit is counted as spent and positive, the credit as minted', dayN(s.coins.daily, d2, 'spentMinor') >= 2000 && dayN(s.coins.daily, d1, 'mintedMinor') >= 7000);
  const audit0 = await call('/api/v1/admin/coins/audit', { jar: admin });
  check('coins.integrity agrees with GET /admin/coins/audit', audit0.json?.clean === s.coins.integrity.ok && s.coins.integrity.drifting === (audit0.json?.drifting?.length ?? -1),
    `audit.clean ${audit0.json?.clean}, stats.ok ${s.coins.integrity.ok}`);
  const integrityWasClean = audit0.json?.clean === true;
  check('marketplace.posts: state counts (derived from published / withdrawn / removed) equal the oracle', same(s.marketplace.posts, o90.posts), JSON.stringify(s.marketplace.posts));
  check('marketplace.reports: open, triaged, by severity and resolved-in-window equal the oracle', same(s.marketplace.reports, o90.reports), JSON.stringify(s.marketplace.reports));
  check('coaches: with role, with clients, links, average and the roster distribution equal the oracle', same(s.coaches, o90.coaches), JSON.stringify(s.coaches));
  check('coaches: the fixture coach with one client is in the "1" bucket', s.coaches.distribution.find((b) => b.bucket === '1').coaches >= 1);
  check('system: live sessions (distinct people and logins) equal the oracle', same(s.system.liveSessions, o90.sessions), JSON.stringify(s.system.liveSessions));
  check('system: audit events in 24 h and the exercise counts equal the oracle', s.system.auditEvents24h === o90.audit24h && s.system.exercises.total === o90.exercises && s.system.exercises.pendingReview === o90.pending, `${s.system.auditEvents24h} events`);
  check('the response carries counts only: no e-mail, name, id or content anywhere in it',
    !/@|"email"|"displayName"|"userId"|"id":/.test(JSON.stringify(s)), 'scanned the whole payload');

  /* ── 6. the window parameter ───────────────────────────────────────────────────────────────── */
  for (const bad of ['6', '8', '29', '91', '0', '-7', '7.5', '07', '+7', '7%20', '%207', '1e1', '0x7', 'abc', 'NaN', 'Infinity', '', '7&days=30']) {
    const q = `days=${bad}`;
    const r = await call(`/api/v1/admin/statistics?${q}`, { jar: admin });
    check(`window ?${q} -> 400 with the uniform envelope`, r.res.status === 400 && r.json?.code === 'validation_error' && typeof r.json?.requestId === 'string', `status ${r.res.status}`);
  }
  {
    const r = await call('/api/v1/admin/statistics?days=30&x=1', { jar: admin });
    check('an unknown query key -> 400 (strict)', r.res.status === 400, `status ${r.res.status}`);
    const r2 = await call('/api/v1/admin/statistics?days[a]=7', { jar: admin });
    check('an object-shaped window -> 400', r2.res.status === 400, `status ${r2.res.status}`);
  }

  /* ── 7. the panel on GET /admin/stats ──────────────────────────────────────────────────────── */
  const panelOf = async () => (await call('/api/v1/admin/stats', { jar: admin })).json;
  // The scan half of the panel is cached for 30 s PER SERVER, and the suite's first admin section
  // (a long time ago in a slow run, seconds ago in a fast one) may have filled it before the
  // fixture existed. So the first panel assertion waits for a snapshot COMPUTED AFTER the fixture
  // was planted: if the stored one is older than that, it polls until the TTL lets a fresh one in.
  // The wait is zero when the cache is cold or already expired, and at most one panel TTL otherwise.
  let p1 = await panelOf();
  for (let i = 0; i < 60 && p1.panel.activityAsOf < plantedAtSec; i += 1) {
    await sleep(1_000);
    p1 = await panelOf();
  }
  check('panel: a snapshot computed after the fixture was planted is in place', p1.panel.activityAsOf >= plantedAtSec, `asOf ${p1.panel.activityAsOf} >= planted ${plantedAtSec}`);
  const p2 = await panelOf();
  const pn = p2.panel;
  check('GET /admin/stats keeps every old key and adds `panel`',
    ['users', 'exercises', 'media', 'moderation', 'translations', 'sessions', 'audit', 'panel'].every((k) => p2[k] !== undefined) && typeof p2.users.total === 'number' && typeof p2.moderation.pending === 'number');
  const o30 = oracle(30);
  check('panel: users total and new in 7 days', pn.users.total === o30.users.total && pn.users.new7d === o30.users.new7d, `${pn.users.total} / ${pn.users.new7d}`);
  check('panel: active coaches are coaches with at least one active client', pn.activeCoaches === o30.activeCoaches, `${pn.activeCoaches}`);
  check('panel: pending moderation equals what the queue lists, open reports equals the open count',
    pn.moderationPending === o30.pending && pn.openReports === o30.reports.open, `${pn.moderationPending} pending, ${pn.openReports} open`);
  const queue = await call('/api/v1/admin/moderation', { jar: admin });
  check('panel: moderationPending equals the length of the moderation queue (it is capped at 50)', pn.moderationPending === Math.min(queue.json?.queue?.length ?? -1, 50) || pn.moderationPending > 50, `${pn.moderationPending} vs ${queue.json?.queue?.length}`);
  check('panel: workouts today and in 7 days, labelled by their clock', pn.workouts.clock === 'local_date' && pn.workouts.today === o30.workoutsToday && pn.workouts.last7d === o30.workoutsWeek, JSON.stringify(pn.workouts));
  check('panel: the 30-day curve of people who logged something is dense and equals the oracle',
    pn.loggedPeople.daily.length === 30 && same(pn.loggedPeople.daily, o30.logged) && pn.loggedPeople.today === dayN(o30.logged, todayKey) && pn.loggedPeople.inWindow === o30.loggedWindow && pn.loggedPeople.clock === 'local_date',
    `today ${pn.loggedPeople.today}, 30d ${pn.loggedPeople.inWindow}`);
  check('panel: the second call within the TTL serves the scan half from the cache', p2.panel.activityCached === true && p2.panel.activityTtlSeconds === PANEL_TTL_S && p1.panel.activityAsOf === p2.panel.activityAsOf, `asOf ${p2.panel.activityAsOf}`);
  check('panel: the response names no DAU/MAU field', !/dau|mau|lastSeen|last_seen/i.test(JSON.stringify(p2.panel)));

  /* ── 8. wave 2: change the data, then prove what is live and what is cached ────────────────── */
  const late = await register('fx-late');
  workout(late.id, todayKey, 'completed');
  meal(late.id, todayKey);
  ledger(late.id, 500, 'admin.credit', Math.floor(Date.now() / 1000));
  const driftedUser = A.id;
  // A wallet that disagrees with its ledger cannot be written while trg_coin_wallet_truthful stands
  // (that trigger IS the first line of defence), so the guard is lifted for the length of this
  // section and recreated, byte for byte, in the cleanup. The reconciliation exists for the day the
  // guard is gone: a dropped trigger, a restored backup, a hand edit.
  const truthfulDdl = one("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_coin_wallet_truthful'")?.sql;
  check('fixture: the wallet guard trigger exists to be lifted', typeof truthfulDdl === 'string');
  run('DROP TRIGGER trg_coin_wallet_truthful');
  run('UPDATE coin_wallets SET balance_minor = balance_minor + 1 WHERE user_id = ?', driftedUser);
  const o90b = oracle(90);
  check('wave 2: one more person, workout, meal and ledger entry exist in the database',
    o90b.users.total - o90.users.total === 1 && o90b.workoutsToday - o90.workoutsToday === 1 && dayN(o90b.logged, todayKey) - dayN(o90.logged, todayKey) === 1);

  const stale = await call('/api/v1/admin/statistics?days=90', { jar: admin });
  check('the same window again is served from the cache: cached:true and the same generatedAt',
    stale.json?.meta?.cached === true && stale.json?.meta?.generatedAt === s.meta.generatedAt, `generatedAt ${stale.json?.meta?.generatedAt}`);
  check('...and the numbers are the OLD ones (the cache is what bounds the scan cost)', stale.json?.users?.total === s.users.total && same(stale.json?.activity?.loggedPeople?.daily, s.activity.loggedPeople.daily));
  check('...with the integrity verdict still clean though a wallet has drifted since', stale.json?.coins?.integrity?.ok === s.coins.integrity.ok);

  const p3 = await panelOf();
  check('panel (live half): the new account is in users.total at once', p3.panel.users.total === p2.panel.users.total + 1 && p3.users.total === p2.users.total + 1, `${p3.panel.users.total}`);
  check('panel (cached half): workouts.today and the curve are still the old ones inside the TTL',
    p3.panel.activityCached === true && p3.panel.workouts.today === p2.panel.workouts.today && p3.panel.loggedPeople.today === p2.panel.loggedPeople.today);

  const burst = await Promise.all(Array.from({ length: 6 }, () => call('/api/v1/admin/statistics?days=7', { jar: admin })));
  check('six simultaneous first requests for a new window all answer 200 with the same snapshot',
    burst.every((r) => r.res.status === 200) && new Set(burst.map((r) => r.json?.meta?.generatedAt)).size === 1 && new Set(burst.map((r) => JSON.stringify(r.json.users))).size === 1);
  const seven = burst[0].json;
  const o7 = oracle(7);
  check('days=7: a different key computes its own fresh window and sees wave 2 at once', seven.window.days === 7 && seven.users.total === o7.users.total && same(seven.users.signups.daily, o7.signups) && seven.users.signups.daily.length === 7, `${seven.users.total} users`);
  check('days=7: every numeric section equals the oracle for 7 days',
    same(seven.activity.loggedPeople.daily, o7.logged) && same(seven.activity.completedWorkouts.daily, o7.workouts) && same(seven.activity.nutritionLog.daily, o7.nutrition) && same(seven.coins.daily, o7.coins) && same(seven.marketplace.reports, o7.reports) && seven.activity.loggedPeople.inWindow === o7.loggedWindow,
    `logged ${seven.activity.loggedPeople.inWindow}`);
  check('days=7 omits what is older than the window (the 40-day-old workout)', !seven.activity.completedWorkouts.daily.some((p) => p.day === dOld) && seven.activity.completedWorkouts.total === o7.workouts.reduce((a, p) => a + p.n, 0));
  check('days=7: the integrity verdict is the SHARED cached one, not recomputed per window', same(seven.coins.integrity, stale.json.coins.integrity));
  const dflt = await call('/api/v1/admin/statistics', { jar: admin });
  check('no ?days defaults to 30', dflt.res.status === 200 && dflt.json?.window?.days === 30 && dflt.json?.activity?.loggedPeople?.daily?.length === 30);

  /* ── 9. after both TTLs: everything is fresh, and the drift is visible ─────────────────────── */
  const waitMs = Math.max(0, t0 + (STATS_TTL_S + 2) * 1000 - Date.now());
  console.log(`  (waiting ${Math.ceil(waitMs / 1000)} s for the ${STATS_TTL_S} s statistics TTL and the ${PANEL_TTL_S} s panel TTL to run out)`);
  await sleep(waitMs);

  const fresh = await call('/api/v1/admin/statistics?days=90', { jar: admin });
  const f = fresh.json;
  check('after the TTL the same window is recomputed: cached:false and a newer generatedAt', f?.meta?.cached === false && f.meta.generatedAt > s.meta.generatedAt, `${s.meta.generatedAt} -> ${f?.meta?.generatedAt}`);
  check('...and now holds wave 2: the new person and the new workout',
    f.users.total === o90b.users.total && same(f.activity.completedWorkouts.daily, o90b.workouts) && same(f.activity.loggedPeople.daily, o90b.logged) && same(f.coins.daily, o90b.coins));
  const auditNow = await call('/api/v1/admin/coins/audit', { jar: admin });
  check('GET /admin/coins/audit sees the drifted wallet', auditNow.json?.clean === false && auditNow.json?.drifting?.length >= 1);
  if (integrityWasClean) {
    check('coins.integrity flips to ok:false with the drifting wallet counted', f.coins.integrity.ok === false && f.coins.integrity.drifting >= 1 && f.coins.integrity.drifting === auditNow.json.drifting.length, JSON.stringify(f.coins.integrity));
  } else {
    check('coins.integrity agrees with the audit page (the database was not clean to begin with)', f.coins.integrity.ok === auditNow.json?.clean);
  }
  const p4 = await panelOf();
  check('panel: after the TTL the cached half is recomputed and holds the new workout',
    p4.panel.activityCached === false && p4.panel.workouts.today === p3.panel.workouts.today + 1 && p4.panel.activityAsOf > p3.panel.activityAsOf, `today ${p4.panel.workouts.today}`);
  check('panel: the live counters did not need the TTL: users.total is unchanged since wave 2', p4.panel.users.total === p3.panel.users.total);

  // Leave the database as the suite found it, for anything that runs after this section.
  run('UPDATE coin_wallets SET balance_minor = balance_minor - 1 WHERE user_id = ?', driftedUser);
  conn.exec(truthfulDdl);
  check('cleanup: the wallet guard trigger is back', one("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_coin_wallet_truthful'").n === 1);
  if (livePost) run('UPDATE coach_posts SET removed_at = NULL, removed_by = NULL, removal_reason = NULL WHERE id = ?', livePost.id);
  const healed = await call('/api/v1/admin/coins/audit', { jar: admin });
  check('cleanup: the drifted wallet is restored and the audit page is clean again', healed.json?.clean === integrityWasClean, `clean ${healed.json?.clean}`);
  conn.close();
}
