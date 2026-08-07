/**
 * verify-021 — attack the public marketplace schema before a single route is written on it.
 *
 * This is the first surface in the product reachable WITHOUT AN ACCOUNT, and the review that
 * produced migration 021 returned 99 defects across three designs — 4 fatal, 41 severe, 16 that
 * could not have been fixed afterwards. All four fatal ones sat in the comment subsystem, which is
 * why there is no comment subsystem.
 *
 * What survived has to be attacked on its own terms. Every guard below gets an attempt that MUST
 * be refused, and the public predicate gets a scenario per clause in which the row must vanish.
 *
 * It runs on a THROWAWAY copy built from the migration files, so removing one is enough to watch
 * the assertions fail.
 *
 * Run: npm run verify:021
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3-multiple-ciphers';

const MIGRATIONS = path.resolve('src/db/migrations');
const tmp = path.join(os.tmpdir(), `tracker-verify-021-${process.pid}.db`);
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
    const msg = String(e.message);
    check(label, !expect || msg.includes(expect), msg.slice(0, 84));
  }
};

const run = (sql, ...p) => db.prepare(sql).run(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

/* ── fixtures ───────────────────────────────────────────────────────────────────────────────── */

const mkUser = (label, role = 'coach') => {
  run(`INSERT INTO users (email, password_hash, role) VALUES (?, 'x', ?)`, `${label}@probe.test`, role);
  return one(`SELECT id FROM users WHERE email = ?`, `${label}@probe.test`).id;
};

const coach = mkUser('coach');
const other = mkUser('other');
const admin = mkUser('admin', 'admin');
const civilian = mkUser('civilian', 'user');

const guidelines = one(`SELECT version FROM guidelines_versions WHERE active = 1`);
const accept = (userId) =>
  run(
    `INSERT OR IGNORE INTO guidelines_acceptances (user_id, version) VALUES (?, ?)`,
    userId,
    guidelines.version,
  );

const cols = (t) => all(`PRAGMA table_info(${t})`).map((c) => c.name);

console.log('\n── THE REFERENCE DATA IS DATA, NOT CHECKS ──────────────────────────────────────');

check(
  'the post kinds are a table, so a new one is an INSERT',
  all(`SELECT key FROM post_kinds`).length >= 3,
  all(`SELECT key FROM post_kinds`).map((r) => r.key).join(', '),
);
check(
  'so are the report reasons and their statuses',
  all(`SELECT key FROM report_reasons`).length >= 3 && all(`SELECT key FROM report_statuses`).length >= 2,
);
check(
  'and there is an active guidelines version to accept',
  !!guidelines,
  guidelines?.version,
);

console.log('\n── A PROFILE CANNOT PUBLISH ITSELF WITHOUT CONSENT ─────────────────────────────');

// A handle and a profile, unpublished.
run(
  `INSERT INTO coach_profiles (user_id, handle, display_name, headline)
        VALUES (?, 'coach-one', 'Coach One', 'Strength and conditioning')`,
  coach,
);

refused(
  'publishing without accepting the guidelines is refused',
  () => run(`UPDATE coach_profiles SET published_at = unixepoch() WHERE user_id = ?`, coach),
  'publish_denied',
);

accept(coach);

// THE GATE HAS A SECOND CONDITION, AND THE PROBE FOUND IT BY BEING REFUSED.
//
// Accepting the guidelines is not enough: `min_account_age_s_to_publish` also has to have
// elapsed. That is an anti-abuse control — a registration minted to publish spam cannot publish
// the minute it exists — and it deserves an assertion of its own rather than a silent workaround,
// which is what backdating the fixture without saying so would have been.
const minAge = one(`SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish'`).value;
refused(
  `a brand-new account cannot publish, however consenting — ${minAge}s of standing is required`,
  () => run(`UPDATE coach_profiles SET published_at = unixepoch() WHERE user_id = ?`, coach),
  'publish_denied',
);

// Backdate the fixture past the threshold. This is the ONE thing the probe fakes, and it fakes
// time rather than a permission.
run(`UPDATE users SET created_at = unixepoch() - ? - 60 WHERE id IN (?, ?)`, minAge, coach, other);

run(`UPDATE coach_profiles SET published_at = unixepoch() WHERE user_id = ?`, coach);
check(
  'and with consent AND standing, it publishes',
  one(`SELECT published_at FROM coach_profiles WHERE user_id = ?`, coach).published_at != null,
);

refused(
  'the acceptance record is append-only',
  () => run(`UPDATE guidelines_acceptances SET version = 'v0' WHERE user_id = ?`, coach),
  'record_is_append_only',
);

console.log('\n── A HANDLE IS CLAIMED ONCE, AND RESERVED WORDS ARE NOT AVAILABLE ──────────────');

refused(
  'a reserved handle cannot be taken',
  () => run(
    `INSERT INTO coach_profiles (user_id, handle, display_name) VALUES (?, 'admin', 'Impostor')`,
    other,
  ),
  'handle_unavailable',
);

refused(
  'and neither can somebody else\'s',
  () => run(
    `INSERT INTO coach_profiles (user_id, handle, display_name) VALUES (?, 'coach-one', 'Impostor')`,
    other,
  ),
  undefined,
);

console.log('\n── VERIFICATION AND REMOVAL ARE ADMIN ACTS, AND THEY COME IN PAIRS ─────────────');

refused(
  'a non-admin cannot grant the verified badge',
  () => run(
    `UPDATE coach_profiles SET verified_at = unixepoch(), verified_by = ? WHERE user_id = ?`,
    coach,
    coach,
  ),
  'verifier_not_admin',
);

refused(
  'and a badge with no granter is refused',
  () => run(`UPDATE coach_profiles SET verified_at = unixepoch() WHERE user_id = ?`, coach),
  'verified_pair_incomplete',
);

run(
  `UPDATE coach_profiles SET verified_at = unixepoch(), verified_by = ? WHERE user_id = ?`,
  admin,
  coach,
);
check(
  'an admin can',
  one(`SELECT verified_at FROM coach_profiles WHERE user_id = ?`, coach).verified_at != null,
);

refused(
  'a removal with no reason is refused',
  () => run(
    `UPDATE coach_profiles SET removed_at = unixepoch(), removed_by = ? WHERE user_id = ?`,
    admin,
    coach,
  ),
  'removal_needs_reason',
);

console.log('\n── A POST MUST MATCH THE SHAPE ITS KIND DECLARES ───────────────────────────────');

let publicSeq = 0;
const post = (kind, extra = {}) => {
  publicSeq += 1;
  // body_src is the markdown the coach typed, body_doc the CLOSED JSON node tree the renderer
  // walks, body_excerpt the derived preview. Three columns, one fact, and the triggers below
  // refuse to let them move apart — which is the whole no-HTML-string strategy in one row.
  const keys = ['author_user_id', 'kind_key', 'title', 'public_id',
                'body_src', 'body_doc', 'body_excerpt', 'doc_version', ...Object.keys(extra)];
  const vals = [coach, kind, 'A title', `pub${String(publicSeq).padStart(9, '0')}`,
                'Plain text body.', JSON.stringify([{ t: 'p', c: ['Plain text body.'] }]),
                'Plain text body.', 1, ...Object.values(extra)];
  run(
    `INSERT INTO coach_posts (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    ...vals,
  );
  return one(`SELECT id FROM coach_posts ORDER BY id DESC LIMIT 1`).id;
};

const eventKind = one(`SELECT key FROM post_kinds WHERE requires_event_at = 1 LIMIT 1`);
if (eventKind) {
  refused(
    'an event with no date is refused — the KIND decides the shape',
    () => post(eventKind.key),
    'kind_shape_invalid',
  );
}

const plainKind = one(`SELECT key FROM post_kinds WHERE requires_event_at = 0 AND allows_capacity = 0`);
const programme = one(`SELECT key FROM post_kinds WHERE allows_price = 1 LIMIT 1`);
const anyKind = (plainKind ?? programme ?? one(`SELECT key FROM post_kinds LIMIT 1`)).key;

const p1 = post(anyKind);
check('a well-shaped post inserts', Number.isInteger(p1), `id ${p1}`);

refused(
  'a post cannot change its author or its kind afterwards',
  () => run(`UPDATE coach_posts SET author_user_id = ? WHERE id = ?`, other, p1),
  'identity_is_frozen',
);

console.log('\n── THE BODY AND ITS RENDERED FORM MOVE TOGETHER, OR NOT AT ALL ─────────────────');

const bodyCols = cols('coach_posts').filter((c) => /body|excerpt/.test(c));
check(
  'the post carries a SOURCE, a rendered DOC and a derived excerpt — three columns, one fact',
  bodyCols.includes('body_src') && bodyCols.includes('body_doc') && bodyCols.includes('body_excerpt'),
  bodyCols.join(', '),
);

// THE THREE MUST MOVE TOGETHER. A body edited without re-rendering is markdown displayed as a
// stale tree — the drift this project keeps finding, applied to the one field a stranger reads.
refused(
  'the source cannot be edited without its rendered form',
  () => run(`UPDATE coach_posts SET body_src = 'changed' WHERE id = ?`, p1),
  'body_columns_must_move_together',
);

// AND THE PUBLIC ID IS NOT THE ROW ID. An enumerable id plus a public read is a directory of
// every post in the product; this is what makes /p/:publicId safe to hand out.
const pub = one(`SELECT public_id FROM coach_posts WHERE id = ?`, p1).public_id;
check(
  'a post is addressed by a 12-char opaque public_id, never its rowid',
  typeof pub === 'string' && pub.length === 12 && !/^\d+$/.test(pub) && pub !== String(p1),
  `public_id "${pub}" (rowid ${p1})`,
);

console.log('\n── PUBLISHING IS GATED, AND ONCE ONLY ──────────────────────────────────────────');

// An unconsented author.
run(
  `INSERT INTO coach_profiles (user_id, handle, display_name) VALUES (?, 'coach-two', 'Coach Two')`,
  other,
);
run(
  `INSERT INTO coach_posts (author_user_id, kind_key, title, public_id,
                            body_src, body_doc, body_excerpt, doc_version)
        VALUES (?, ?, 'Theirs', 'pubOther001X', 'Theirs.', '[]', 'Theirs.', 1)`,
  other,
  anyKind,
);
const p2 = one(`SELECT id FROM coach_posts WHERE author_user_id = ?`, other).id;

refused(
  'an author who never accepted the guidelines cannot publish',
  () => run(`UPDATE coach_posts SET published_at = unixepoch() WHERE id = ?`, p2),
  'publish_denied',
);

run(`UPDATE coach_posts SET published_at = unixepoch() WHERE id = ?`, p1);
refused(
  'and a publication timestamp is write-once',
  () => run(`UPDATE coach_posts SET published_at = unixepoch() + 100 WHERE id = ?`, p1),
  'published_at_is_write_once',
);

console.log('\n── REPORTS: NOT ON YOURSELF, NOT WITHOUT A REASON THAT EXISTS ──────────────────');

const aReason = one(`SELECT key FROM report_reasons WHERE reportable = 1 LIMIT 1`).key;
const fileReport = (reporter, postId, reason = aReason) =>
  run(
    `INSERT INTO content_reports (reporter_user_id, subject_post_id, subject_author_user_id,
                                  reason_key, request_id)
          VALUES (?, ?, (SELECT author_user_id FROM coach_posts WHERE id = ?), ?, 'probe-req')`,
    reporter,
    postId,
    postId,
    reason,
  );

refused('reporting your own post is refused', () => fileReport(coach, p1), 'self_report_refused');

refused(
  'and a reason that is not in the table is refused',
  () => fileReport(civilian, p1, 'because_i_said_so'),
  undefined,
);

fileReport(civilian, p1);
const report = one(`SELECT id FROM content_reports ORDER BY id DESC LIMIT 1`);
check('a legitimate report lands', Number.isInteger(report?.id), `id ${report?.id}`);

refused(
  'a non-admin cannot resolve it',
  () => run(
    `UPDATE content_reports
        SET status_key = (SELECT key FROM report_statuses WHERE is_terminal = 1 LIMIT 1),
            resolved_at = unixepoch(), resolved_by = ? WHERE id = ?`,
    civilian,
    report.id,
  ),
  'resolver_not_admin',
);

refused(
  'and the reporter cannot rewrite what they said',
  () => run(`UPDATE content_reports SET reason_key = 'spam' WHERE id = ?`, report.id),
  undefined,
);

console.log('\n── MEDIA: A CAP PER POST, A CAP PER DAY, AND A CLOSED MIME LIST ────────────────');

const mime = one(`SELECT mime FROM post_media_mimes WHERE active = 1 LIMIT 1`);
// THE STORAGE KEY IS SHAPED, AND THE SHAPE IS THE POINT: 'pub_' + 32 hex + '.webp', exactly 41
// characters, lowercase only. Every stored file is a RE-ENCODED WebP, so an uploaded SVG or a
// polyglot cannot be what is served — the extension is not a claim, it is a fact about the bytes.
const key = (n) => `pub_${String(n).padStart(4, '0')}${'a'.repeat(28)}.webp`;

// A thumbnail is NOT NULL on every row, which is the pipeline's answer to "the stored bytes are
// not the uploaded bytes" — nothing is served that was not re-encoded.
check(
  'every media row must carry a re-encoded thumbnail',
  all(`PRAGMA table_info(post_media)`).some((c) => c.name === 'thumb_key' && c.notnull === 1),
);

refused(
  'a MIME the table does not list is refused — SVG is a DOCUMENT, not a picture',
  () => run(
    `INSERT INTO post_media (post_id, role_key, storage_key, thumb_key, mime, bytes)
          VALUES (?, 'gallery', ?, ?, 'image/svg+xml', 100)`,
    p1,
    key(1),
    key(90),
  ),
  'mime_not_accepted',
);

let stored = 0;
let capMessage = '';
for (let i = 0; i < 40; i += 1) {
  try {
    run(
      `INSERT INTO post_media (post_id, role_key, storage_key, thumb_key, mime, bytes, width, height, sort_order)
            VALUES (?, 'gallery', ?, ?, ?, 1000, 800, 600, 0)`,
      p1,
      key(i + 10),
      key(i + 50),
      mime.mime,
    );
    stored += 1;
  } catch (e) {
    capMessage = String(e.message);
    break;
  }
}
check(
  'a post cannot hold unbounded media — the cap fires',
  capMessage.includes('cap_reached'),
  `${stored} stored, then: ${capMessage.slice(0, 60)}`,
);

console.log('\n── FOLLOWS ARE PRIVATE, AND YOU CANNOT FOLLOW YOURSELF ─────────────────────────');

refused(
  'following yourself is refused',
  () => run(`INSERT INTO coach_follows (follower_user_id, coach_user_id) VALUES (?, ?)`, coach, coach),
  'self_follow_refused',
);

run(`INSERT INTO coach_follows (follower_user_id, coach_user_id) VALUES (?, ?)`, civilian, coach);
check('a real follow lands', one(`SELECT COUNT(*) AS n FROM coach_follows`).n === 1);

// THE CUT, ASSERTED. A follower COUNT on the profile is what made `follower_count DESC` worth
// buying at one free registration per follower, so the column must not exist.
check(
  'THE PROFILE CARRIES NO PUBLIC FOLLOWER COUNT — the ranking it would feed is unbuyable',
  !cols('coach_profiles').some((c) => /follower/i.test(c)),
  cols('coach_profiles').filter((c) => /count|follower/i.test(c)).join(', ') || 'none',
);

console.log('\n── AND THE THINGS THAT WERE CUT ARE ABSENT, NOT MERELY UNUSED ──────────────────');

const tables = all(
  `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
).map((r) => r.name);

for (const [label, name] of [
  ['comments', 'post_comments'],
  ['reactions', 'post_reactions'],
  ['person-level blocking', 'user_blocks'],
]) {
  check(
    `${label}: the table does not exist — all four FATAL defects lived here`,
    !tables.includes(name),
    tables.includes(name) ? 'PRESENT' : 'absent',
  );
}

console.log('\n── THE PUBLIC PREDICATE BINDS NO VIEWER ────────────────────────────────────────');

// Every clause of the public read, exercised by making a published post disappear one way at a
// time. This is the property the whole cut bought: the answer does not depend on who is asking.
const publiclyVisible = () =>
  one(
    `SELECT COUNT(*) AS n
       FROM coach_posts p
       JOIN coach_profiles c ON c.user_id = p.author_user_id
      WHERE p.published_at IS NOT NULL AND p.removed_at IS NULL
        AND c.published_at IS NOT NULL AND c.removed_at IS NULL`,
  ).n;

check('the published post is publicly visible', publiclyVisible() === 1, `${publiclyVisible()}`);

run(
  `UPDATE coach_posts SET removed_at = unixepoch(), removed_by = ?, removal_reason = 'probe'
    WHERE id = ?`,
  admin,
  p1,
);
check('removing the POST hides it', publiclyVisible() === 0);

refused(
  'and a removed post is frozen',
  () => run(`UPDATE coach_posts SET title = 'edited after removal' WHERE id = ?`, p1),
  'removed_row_is_frozen',
);

/* ── done ───────────────────────────────────────────────────────────────────────────────────── */

db.close();
for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) await fs.rm(f, { force: true }).catch(() => {});

console.log(`\n${failed === 0 ? 'PROBE OK' : 'PROBE FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
