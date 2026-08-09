/**
 * verify-023 — handle squatting, and the protection it was hiding behind.
 *
 * This file has to prove TWO things, and proving only the first would be worse than proving
 * neither: the cheap bulk-lock is gone, AND a renamed public handle is still held against
 * impersonation. A fix that deleted the cooldown would pass an "attack no longer works" assertion
 * perfectly.
 *
 * Run: npm run verify:023
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3-multiple-ciphers';

const MIGRATIONS = path.resolve('src/db/migrations');
const tmp = path.join(os.tmpdir(), `tracker-verify-023-${process.pid}.db`);
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
const accepted = (label, fn) => {
  try {
    fn();
    check(label, true);
  } catch (e) {
    check(label, false, `REFUSED: ${String(e.message).slice(0, 80)}`);
  }
};

let seq = 0;
const mkUser = () =>
  db
    .prepare(`INSERT INTO users (email, password_hash, role, created_at)
              VALUES (?, 'x', 'coach', unixepoch() - 999999)`)
    .run(`u${++seq}@v023.local`).lastInsertRowid;

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

const rename = (uid, handle) => db.prepare(`UPDATE coach_profiles SET handle = ? WHERE user_id = ?`).run(handle, uid);
const retired = () => db.prepare(`SELECT handle FROM retired_handles ORDER BY handle`).all().map((r) => r.handle);

console.log('── THE ATTACK, WHICH WORKED BEFORE THIS MIGRATION ──────────────────────────────');

{
  // Six renames of one profile that was NEVER PUBLISHED. Measured against 022 this locked six
  // handles for 365 days, refused to a second account 6/6 and reclaimable by the squatter 6/6.
  const squatter = mkUser();
  mkProfile(squatter, 'seed-handle');
  for (const h of ['peter-kovacs', 'gym-budapest', 'strength-coach', 'fitnesz', 'edzo', 'personal-trainer']) {
    rename(squatter, h);
  }
  check(
    'six renames of an unpublished profile retire NOTHING',
    retired().length === 0,
    `retired: ${JSON.stringify(retired())}`,
  );

  // And the handles are genuinely free, which is the assertion that matters to the person who
  // wanted one. "Nothing was retired" is about a table; this is about the product.
  const victim = mkUser();
  accepted(
    'so somebody else can still take the handle the squatter passed through',
    () => mkProfile(victim, 'peter-kovacs'),
  );
}

console.log('\n── AND THE PROTECTION IT WAS HIDING BEHIND IS INTACT ───────────────────────────');

{
  const coach = mkUser();
  mkProfile(coach, 'live-coach', { published: true });
  rename(coach, 'live-coach-renamed');
  check(
    'renaming a LISTED profile still retires the old handle',
    retired().includes('live-coach'),
    `retired: ${JSON.stringify(retired())}`,
  );

  const stranger = mkUser();
  refused(
    'and a stranger cannot claim it — the stale-link impersonation this exists to stop',
    () => mkProfile(stranger, 'live-coach'),
    'handle_unavailable',
  );

  // The previous owner keeps the claim, because "I renamed by mistake" is the case the exclusive
  // reclaim was written for.
  accepted('while its previous owner can still take it back', () => {
    db.prepare(`UPDATE coach_profiles SET handle_renamed_at = NULL WHERE user_id = ?`).run(coach);
    rename(coach, 'live-coach');
  });
}

console.log('\n── THE COOLDOWN, WHICH IS WHAT STOPS publish-rename-publish-rename ─────────────');

{
  const coach = mkUser();
  mkProfile(coach, 'cycler-one', { published: true });
  accepted('a listed profile may be renamed once', () => rename(coach, 'cycler-two'));

  const stamped = db.prepare(`SELECT handle_renamed_at FROM coach_profiles WHERE user_id = ?`).get(coach);
  check(
    'and the database stamps the rename itself, so no route can forget to',
    typeof stamped.handle_renamed_at === 'number' && stamped.handle_renamed_at > 0,
    `handle_renamed_at = ${stamped.handle_renamed_at}`,
  );

  refused(
    'a second rename inside the window is refused',
    () => rename(coach, 'cycler-three'),
    'handle_rename_too_soon',
  );

  // Past the window it is allowed again — a cooldown that never expires is a ban.
  const window = db.prepare(`SELECT value FROM public_policy WHERE key = 'handle_rename_cooldown_s'`).get().value;
  db.prepare(`UPDATE coach_profiles SET handle_renamed_at = unixepoch() - ? - 60 WHERE user_id = ?`).run(window, coach);
  accepted('and allowed again once the window has passed', () => rename(coach, 'cycler-three'));
}

{
  // The cooldown must NOT apply to a profile nobody can reach. A coach fixing a typo before they
  // publish is the most ordinary thing in this whole feature.
  const drafting = mkUser();
  mkProfile(drafting, 'typo-hanlde');
  accepted('an UNPUBLISHED profile may be renamed repeatedly', () => {
    rename(drafting, 'typo-handle');
    rename(drafting, 'typo-handle-2');
    rename(drafting, 'final-handle');
  });
}

console.log('\n── DELETION FOLLOWS THE SAME RULE ──────────────────────────────────────────────');

{
  const gone = mkUser();
  mkProfile(gone, 'never-seen');
  db.prepare(`DELETE FROM coach_profiles WHERE user_id = ?`).run(gone);
  check('deleting an unpublished profile releases its handle immediately', !retired().includes('never-seen'));

  const wasLive = mkUser();
  mkProfile(wasLive, 'was-public', { published: true });
  db.prepare(`DELETE FROM coach_profiles WHERE user_id = ?`).run(wasLive);
  check('deleting a LISTED profile still retires it', retired().includes('was-public'));
}

db.close();
await fs.rm(tmp, { force: true });
await fs.rm(`${tmp}-wal`, { force: true });
await fs.rm(`${tmp}-shm`, { force: true });

console.log(`\nverify-023: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
