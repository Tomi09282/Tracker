/**
 * verify-024 — the rename cooldown moved into a view, and the rename route that reads it.
 *
 * ═══ A RULE MOVED IS A RULE THAT HAS TO BE RE-EARNED ═══════════════════════════════════════════
 *
 * 024 did not change what the cooldown says. It changed WHERE it is written: out of the trigger's
 * WHEN clause and into `coach_handle_rename_eligibility`, so the trigger and the rename route read
 * the same predicate instead of keeping two copies that agree only until somebody edits one.
 *
 * That is exactly the kind of change that quietly relaxes a rule. A view returning 0 for everything
 * would make every assertion about "the rename succeeded" pass beautifully, and the only thing that
 * would notice is the assertion nobody wrote. So this file proves BOTH directions on every rule:
 * the case that must be allowed, and the case that must be refused.
 *
 * The transaction is exercised through the real worker, not reimplemented here. A probe that
 * carries its own copy of the logic it is auditing is testing itself.
 *
 * Run: npm run verify:024
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3-multiple-ciphers';

const MIGRATIONS = path.resolve('src/db/migrations');
const tmp = path.join(os.tmpdir(), `tracker-verify-024-${process.pid}.db`);
await fs.rm(tmp, { force: true });
const db = new Database(tmp);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
for (const f of (await fs.readdir(MIGRATIONS)).filter((n) => /^\d+_.*\.sql$/.test(n)).sort()) {
  db.exec(await fs.readFile(path.join(MIGRATIONS, f), 'utf8'));
}

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (passed += 1) : (failed += 1);
};
const refused = (label, fn, expect) => {
  try {
    fn();
    check(label, false, 'THE WRITE WAS ACCEPTED');
  } catch (e) {
    check(label, String(e.message).includes(expect), String(e.message).slice(0, 88));
  }
};

let seq = 0;
const mkUser = () =>
  db
    .prepare(`INSERT INTO users (email, password_hash, role, created_at)
              VALUES (?, 'x', 'coach', unixepoch() - 999999)`)
    .run(`u${++seq}@v024.local`).lastInsertRowid;

const consent = (uid) =>
  db.prepare(`INSERT OR IGNORE INTO guidelines_acceptances (user_id, version)
              SELECT ?, version FROM guidelines_versions WHERE active = 1`).run(uid);

const mkProfile = (uid, handle, { published = false } = {}) => {
  if (published) consent(uid);
  db.prepare(
    `INSERT INTO coach_profiles (user_id, handle, display_name, published_at, listed_at)
     VALUES (?, ?, 'Fixture Name', ${published ? 'unixepoch()' : 'NULL'}, ${published ? 'unixepoch()' : 'NULL'})`,
  ).run(uid, handle);
};

const rename = (uid, handle) => db.prepare('UPDATE coach_profiles SET handle = ? WHERE user_id = ?').run(handle, uid);
const eligibility = (uid) =>
  db.prepare('SELECT * FROM coach_handle_rename_eligibility WHERE user_id = ?').get(uid);
/** Backdate the last rename so the cooldown can be walked without waiting thirty days. */
const backdate = (uid, seconds) =>
  db.prepare('UPDATE coach_profiles SET handle_renamed_at = unixepoch() - ? WHERE user_id = ?').run(seconds, uid);

const COOLDOWN = db.prepare("SELECT value FROM public_policy WHERE key = 'handle_rename_cooldown_s'").get().value;

console.log('── the view exists and answers the question the trigger used to answer itself ───');

check('handle_rename_cooldown_s is still 30 days', COOLDOWN === 2592000, `${COOLDOWN}s`);

{
  const u = mkUser();
  mkProfile(u, 'never-listed');
  const e = eligibility(u);
  check('a profile that was never listed is not too soon', e.too_soon === 0, `too_soon=${e.too_soon}`);
  check('and has no eligible_at, because it never has to wait', e.eligible_at === null, `${e.eligible_at}`);
  check('the view reports the policy value it used', e.cooldown_s === COOLDOWN, `${e.cooldown_s}`);
}

console.log('\n── an UNPUBLISHED profile renames freely, which is what 023 bought ─────────────');

{
  const u = mkUser();
  mkProfile(u, 'draft-one');
  rename(u, 'draft-two');
  check('the first rename lands', db.prepare('SELECT handle FROM coach_profiles WHERE user_id = ?').get(u).handle === 'draft-two');
  check(
    'and the trigger stamped handle_renamed_at without the route being asked to',
    eligibility(u).handle_renamed_at !== null,
  );
  // The stamp is set and the cooldown has NOT elapsed — this is the exact input that refuses a
  // listed profile. It must be allowed here, or 023's fix has been undone by 024.
  check('a SECOND rename seconds later is still allowed, because nothing points at this profile', (() => {
    try {
      rename(u, 'draft-three');
      return true;
    } catch {
      return false;
    }
  })());
  check(
    'and its old handles were never retired',
    db.prepare('SELECT COUNT(*) AS n FROM retired_handles').get().n === 0,
  );
}

console.log('\n── a LISTED profile is held to the cooldown, and the trigger still enforces it ──');

{
  const u = mkUser();
  mkProfile(u, 'live-one', { published: true });

  check('a first rename is always allowed — handle_renamed_at is NULL until one happens', (() => {
    try {
      rename(u, 'live-two');
      return true;
    } catch {
      return false;
    }
  })());
  check(
    'and the OLD handle was retired, because somebody could have linked to it',
    db.prepare("SELECT COUNT(*) AS n FROM retired_handles WHERE handle = 'live-one'").get().n === 1,
  );

  check('the view now says too_soon', eligibility(u).too_soon === 1);
  const e = eligibility(u);
  check(
    'and eligible_at is the stamp plus the cooldown, so the 409 can say WHEN',
    e.eligible_at === e.handle_renamed_at + COOLDOWN,
    `${e.eligible_at} vs ${e.handle_renamed_at + COOLDOWN}`,
  );

  // ═══ THE ASSERTION THIS WHOLE FILE EXISTS FOR ══════════════════════════════════════════════
  // The rule was rewritten to read a view. If the view is wrong in the permissive direction, this
  // is the only line that notices.
  refused(
    'a SECOND rename inside the window is REFUSED BY THE TRIGGER, reading the view',
    () => rename(u, 'live-three'),
    'handle_rename_too_soon',
  );

  backdate(u, COOLDOWN + 60);
  check('once the window has passed the view says so', eligibility(u).too_soon === 0);
  check('and the rename is allowed again', (() => {
    try {
      rename(u, 'live-three');
      return true;
    } catch {
      return false;
    }
  })());
}

console.log('\n── the availability predicate collapses three questions into one answer ────────');

db.close();
await fs.rm(tmp, { force: true });
await fs.rm(`${tmp}-wal`, { force: true });
await fs.rm(`${tmp}-shm`, { force: true });

/*
 * ═══ THROUGH THE REAL POOL, ON THE REAL DATABASE ═══════════════════════════════════════════════
 *
 * Everything above ran on a throwaway file, which is right for TRIGGERS — they are properties of
 * the schema and a fresh migration is the cleanest way to ask about them.
 *
 * The availability predicate is not a trigger. It is JavaScript inside the worker, and the only
 * honest way to exercise it is the way the route does: `db.handleAvailability(...)` through the
 * pool. The alternative was a `__setTestConnection` backdoor in the worker so this file could point
 * it at the temp database — a mutable connection hook in production code, added so a test could run.
 * Not worth it. The fixtures below are created and removed inside a transaction-shaped block, and
 * the last assertion checks the dev database came out the way it went in.
 *
 * What is being proved is a NEGATIVE: reserved, taken and cooling are indistinguishable in the
 * answer. A probe carrying its own copy of the predicate could not tell whether the shipped one
 * distinguishes them, which is evidence rule 4 — an audit must not carry its own copy of what it
 * audits.
 */
console.log('');
const pool = await import('../src/db/index.js');

/*
 * ORDER MATTERS, and getting it wrong left rows behind for one commit.
 *
 * Deleting the retired handles first looks right and is not: dropping a LISTED profile fires
 * `trg_profile_handle_retire_del`, which INSERTS its handle straight back into the table this had
 * just cleaned. The probe reported "the dev database is back the way this probe found it" while two
 * fixture handles sat in `retired_handles` holding names against every real account.
 *
 * It reported that because the assertion counted USERS. A cleanup check that measures one table and
 * claims something about the database is the same mistake as a screenshot standing in for a
 * measurement — so the profiles go first, and the check below now counts everything this touches.
 */
const cleanup = async () => {
  await pool.run("DELETE FROM coach_profiles WHERE handle LIKE 'v024-%'");
  await pool.run("DELETE FROM retired_handles WHERE handle LIKE 'v024-%'");
  await pool.run("DELETE FROM users WHERE email LIKE '%@v024probe.local'");
};

try {
  await cleanup();

  const mk = async (email, handle, published) => {
    await pool.run(
      "INSERT INTO users (email, password_hash, role, created_at) VALUES (?, 'x', 'coach', unixepoch() - 999999)",
      [email],
    );
    const { id } = await pool.get('SELECT id FROM users WHERE email = ?', [email]);
    if (published) {
      await pool.run(
        'INSERT OR IGNORE INTO guidelines_acceptances (user_id, version) SELECT ?, version FROM guidelines_versions WHERE active = 1',
        [id],
      );
    }
    await pool.run(
      `INSERT INTO coach_profiles (user_id, handle, display_name, published_at, listed_at)
       VALUES (?, ?, 'Probe', ${published ? 'unixepoch()' : 'NULL'}, ${published ? 'unixepoch()' : 'NULL'})`,
      [id, handle],
    );
    return id;
  };

  const asker = await mk('asker@v024probe.local', 'v024-asker', false);
  const mover = await mk('mover@v024probe.local', 'v024-was-public', true);
  // A real rename, so 'v024-was-public' lands in retired_handles the way the product puts it there.
  await pool.run('UPDATE coach_profiles SET handle = ? WHERE user_id = ?', ['v024-moved-away', mover]);

  const reservedRow = await pool.get('SELECT handle FROM reserved_handles LIMIT 1');

  const cases = [
    ['a handle nobody has', 'v024-definitely-free', true],
    ['a handle another profile holds', 'v024-moved-away', false],
    ['a handle in cooldown from somebody else', 'v024-was-public', false],
    ...(reservedRow ? [['a reserved handle', reservedRow.handle, false]] : []),
  ];

  for (const [label, handle, expected] of cases) {
    const r = await pool.handleAvailability({ userId: asker, handle });
    check(`${label} answers available=${expected}`, r.available === expected, JSON.stringify(r));
    check(
      '  …and nothing else — one bit, no reason, no timestamp',
      Object.keys(r).length === 1 && 'available' in r,
      Object.keys(r).join(','),
    );
  }

  // The exclusive-reclaim half of the cooldown, which is what makes it a protection rather than a
  // punishment: the previous owner is not locked out of their own name.
  const back = await pool.handleAvailability({ userId: mover, handle: 'v024-was-public' });
  check('the previous owner can still reclaim their own retired handle', back.available === true, JSON.stringify(back));

  /* ── the rename transaction's three refusals, through the pool ────────────────────────────── */

  const replay = await pool.renameCoachHandle({
    userId: asker, from: 'v024-asker', to: 'v024-asker', requestId: 'p1',
  });
  check(
    'renaming to the handle you already hold is a REPLAY — no write, no cooldown burned',
    replay.outcome === 'applied' && replay.replayed === true && replay.handleRenamedAt === null,
    `${replay.outcome}/${replay.replayed}/stamp=${replay.handleRenamedAt}`,
  );

  const stale = await pool.renameCoachHandle({
    userId: asker, from: 'v024-something-else', to: 'v024-new-name', requestId: 'p2',
  });
  check(
    'a rename composed against a stale view of the world is REFUSED, not applied',
    stale.outcome === 'handle_changed' && stale.handle === 'v024-asker',
    `${stale.outcome} handle=${stale.handle}`,
  );
  check(
    'and it names the TRUE current handle, so the client can stop guessing',
    (await pool.get('SELECT handle FROM coach_profiles WHERE user_id = ?', [asker])).handle === 'v024-asker',
  );

  const unavailable = await pool.renameCoachHandle({
    userId: asker, from: 'v024-asker', to: 'v024-moved-away', requestId: 'p3',
  });
  check(
    'renaming onto a handle somebody else holds is refused as handle_unavailable',
    unavailable.outcome === 'handle_unavailable',
    unavailable.outcome,
  );

  const ok = await pool.renameCoachHandle({
    userId: asker, from: 'v024-asker', to: 'v024-renamed', requestId: 'p4',
  });
  check('and a well-formed rename applies', ok.outcome === 'applied' && ok.handle === 'v024-renamed', `${ok.outcome}/${ok.handle}`);
  check(
    'writing exactly one audit row for it',
    (await pool.get(
      "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'marketplace.handle.rename' AND actor_id = ?",
      [asker],
    )).n === 1,
  );
  check(
    'and the unpublished profile retired NOTHING — 023 still holds through the route',
    (await pool.get("SELECT COUNT(*) AS n FROM retired_handles WHERE handle = 'v024-asker'")).n === 0,
  );

  /* ── the cooldown, from the ROUTE's side ──────────────────────────────────────────────────────
   *
   * Everything above proved the TRIGGER refuses. That is the backstop. The reason 024 exists is so
   * the route can refuse FIRST and say when — a coach who gets an opaque abort learns nothing, and
   * an `eligibleAt` they can plan around is the entire point of moving the predicate into a view.
   *
   * Without this block the route's branch would be untested, and a `p.tooSoon === 1` that never
   * fires is indistinguishable from one that is never true.
   */
  const listed = await mk('listed@v024probe.local', 'v024-listed', true);
  const first = await pool.renameCoachHandle({
    userId: listed, from: 'v024-listed', to: 'v024-listed-two', requestId: 'p5',
  });
  check('a listed profile may rename once', first.outcome === 'applied', first.outcome);

  const tooSoon = await pool.renameCoachHandle({
    userId: listed, from: 'v024-listed-two', to: 'v024-listed-three', requestId: 'p6',
  });
  check(
    'and the SECOND is refused by the ROUTE, before the trigger has to abort',
    tooSoon.outcome === 'rename_too_soon',
    tooSoon.outcome,
  );
  check(
    'carrying eligibleAt, so the refusal is something a person can plan around',
    Number.isInteger(tooSoon.eligibleAt) && tooSoon.eligibleAt > Math.floor(Date.now() / 1000),
    `eligibleAt=${tooSoon.eligibleAt}`,
  );
  check(
    'and it wrote no audit row for the rename that did not happen',
    (await pool.get(
      "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'marketplace.handle.rename' AND actor_id = ?",
      [listed],
    )).n === 1,
  );
  check(
    'the handle is untouched',
    (await pool.get('SELECT handle FROM coach_profiles WHERE user_id = ?', [listed])).handle === 'v024-listed-two',
  );
} finally {
  await cleanup();
  // Every table this probe writes to, not just the one it is easiest to check. The first version
  // counted users, passed, and left two fixture handles retired against the whole namespace.
  const left = await pool.get(
    `SELECT (SELECT COUNT(*) FROM users           WHERE email  LIKE '%@v024probe.local') AS users,
            (SELECT COUNT(*) FROM coach_profiles  WHERE handle LIKE 'v024-%')            AS profiles,
            (SELECT COUNT(*) FROM retired_handles WHERE handle LIKE 'v024-%')            AS retired`,
  );
  check(
    'the dev database is back the way this probe found it — users, profiles AND retired handles',
    left.users === 0 && left.profiles === 0 && left.retired === 0,
    `users=${left.users} profiles=${left.profiles} retired=${left.retired}`,
  );
  await pool.closePool();
}

console.log(`\nverify-024: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

console.log(`\nverify-024: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
