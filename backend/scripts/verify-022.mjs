/**
 * verify-022 — attack the composer's schema before a single write route is built on it.
 *
 * Migration 022 came out of a thirteen-agent adversarial pass: 60 defects, 1 fatal, 18 severe. The
 * guards it added are only worth having if they are load-bearing, so every one below gets an
 * attempt that MUST be refused — and, just as important, an attempt that MUST be ACCEPTED.
 *
 * That second half is the point of this file. The trigger 022 replaces was refused for being too
 * eager: it aborted ordinary edits and would have frozen the entire published corpus the day the
 * grammar version moved. A rule that only ever says no is not obviously better than the rule it
 * replaced, so the allowed cases are asserted with the same weight as the refusals.
 *
 * Runs on a THROWAWAY database built from the migration files, so deleting a guard is enough to
 * watch the assertions fail.
 *
 * Run: npm run verify:022
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3-multiple-ciphers';

const MIGRATIONS = path.resolve('src/db/migrations');
const tmp = path.join(os.tmpdir(), `tracker-verify-022-${process.pid}.db`);
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
  // A bare 'CHECK' matches every check constraint in the schema. Four assertions in the first
  // draft of this file reported PASS while the write was being refused by an unrelated rule — the
  // fixture had a one-character title against a 3..400 bound, so no mkPost ever reached the guard
  // under test. The expectation has to name something specific to the rule, or it is not evidence
  // about that rule.
  if (!expect || expect === 'CHECK' || expect === 'UNIQUE') {
    throw new Error(`verify-022: "${label}" needs an expectation naming its own guard, not "${expect}"`);
  }
  try {
    fn();
    check(label, false, 'THE WRITE WAS ACCEPTED');
  } catch (e) {
    const msg = String(e.message);
    check(label, msg.includes(expect), msg.slice(0, 90));
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

/* ── fixtures ────────────────────────────────────────────────────────────────────────────────── */

const mkUser = (email, role = 'coach', ageS = 999_999) =>
  db
    .prepare(
      `INSERT INTO users (email, password_hash, role, created_at) VALUES (?, 'x', ?, unixepoch() - ?)`,
    )
    .run(email, role, ageS).lastInsertRowid;

// Consent BEFORE the profile is published, because trg_profile_publish_standing_ins already
// enforces exactly that — the fixture has to obey the gates 021 shipped, or it is testing a
// database the product could never reach.
const acceptGuidelines = (uid) =>
  db
    .prepare(
      `INSERT OR IGNORE INTO guidelines_acceptances (user_id, version)
       SELECT ?, version FROM guidelines_versions WHERE active = 1`,
    )
    .run(uid);

const mkProfile = (uid, handle, published = true) => {
  db.prepare(
    `INSERT INTO coach_profiles (user_id, handle, display_name, bio_src, bio_doc, doc_version, published_at, listed_at)
     VALUES (?, ?, 'Coach Fixture', 'hello', '[]', 1, ${published ? 'unixepoch()' : 'NULL'}, ${published ? 'unixepoch()' : 'NULL'})`,
  ).run(uid, handle);
};

const coach = mkUser('coach@v022.local');
const other = mkUser('other@v022.local');
acceptGuidelines(coach);
acceptGuidelines(other);
mkProfile(coach, 'coach-v022');
mkProfile(other, 'other-v022');

const kind = db.prepare(`SELECT key FROM post_kinds LIMIT 1`).get().key;

let pidSeq = 0;
const mkPost = (uid, { published = false, deleted = false, writeUid = null } = {}) => {
  const publicId = `v022${String(++pidSeq).padStart(8, '0')}`; // exactly 12 chars
  db.prepare(
    `INSERT INTO coach_posts (public_id, author_user_id, kind_key, title, body_src, body_doc,
                              body_excerpt, doc_version, write_uid, published_at, deleted_at)
     VALUES (?, ?, ?, 'Fixture title', 'src', '[]', 'excerpt', 1, ?, ${published ? 'unixepoch()' : 'NULL'}, ${deleted ? 'unixepoch()' : 'NULL'})`,
  ).run(publicId, uid, kind, writeUid);
  return db.prepare(`SELECT id FROM coach_posts WHERE public_id = ?`).get(publicId).id;
};

const HEX32 = 'a'.repeat(32);
let keySeq = 0;
const mediaKeys = () => {
  keySeq += 1;
  const h = (n) => (String(keySeq) + n).padStart(32, '0');
  return { storage: `pub_${h('a')}.webp`, thumb: `pub_${h('b')}.webp` };
};

/* ── 1. write_uid shape and scope ────────────────────────────────────────────────────────────── */

refused('write_uid under 8 chars is refused', () => mkPost(coach, { writeUid: 'short' }), 'write_uid');
refused('write_uid over 96 chars is refused', () => mkPost(coach, { writeUid: 'a'.repeat(97) }), 'write_uid');
refused('write_uid with a space is refused', () => mkPost(coach, { writeUid: 'has space here' }), 'write_uid');
refused('write_uid with a slash is refused', () => mkPost(coach, { writeUid: 'abc/def/ghi' }), 'write_uid');
accepted('write_uid of legal shape is accepted', () => mkPost(coach, { writeUid: 'req:abc_123-XYZ' }));

refused(
  'the SAME author cannot reuse a write_uid',
  () => mkPost(coach, { writeUid: 'req:abc_123-XYZ' }),
  'coach_posts.author_user_id, coach_posts.write_uid',
);
accepted(
  'a DIFFERENT author may use the same write_uid — the key is owner-scoped, not global',
  () => mkPost(other, { writeUid: 'req:abc_123-XYZ' }),
);

/* ── 2. content_sha256 shape ─────────────────────────────────────────────────────────────────── */

const shaPost = mkPost(coach);
const insMedia = (postId, { sha = null, storage, thumb, writeUid = null }) =>
  db
    .prepare(
      `INSERT INTO post_media (post_id, role_key, storage_key, thumb_key, mime, width, height, bytes, content_sha256, write_uid)
       VALUES (?, 'cover', ?, ?, 'image/webp', 10, 10, 100, ?, ?)`,
    )
    .run(postId, storage, thumb, sha, writeUid);

{
  const k = mediaKeys();
  refused('content_sha256 of the wrong length is refused', () => insMedia(shaPost, { ...{ storage: k.storage, thumb: k.thumb }, sha: 'abc' }), 'content_sha256');
}
{
  const k = mediaKeys();
  refused('content_sha256 in UPPERCASE hex is refused', () => insMedia(shaPost, { storage: k.storage, thumb: k.thumb, sha: 'A'.repeat(64) }), 'content_sha256');
}
{
  const k = mediaKeys();
  accepted('content_sha256 of 64 lowercase hex is accepted', () => insMedia(shaPost, { storage: k.storage, thumb: k.thumb, sha: 'f0'.repeat(32) }));
}

/* ── 3. row_version and listed_at ────────────────────────────────────────────────────────────── */

{
  const id = mkPost(coach);
  const rv = db.prepare(`SELECT row_version FROM coach_posts WHERE id = ?`).get(id).row_version;
  check('a new post starts at row_version 1', rv === 1, `row_version=${rv}`);
}
{
  const row = db.prepare(`SELECT listed_at, published_at FROM coach_profiles WHERE user_id = ?`).get(coach);
  check('a published profile carries listed_at', row.listed_at !== null && row.listed_at === row.published_at);
}

/* ── 4. THE BODY RULE — refusals AND the edits that must keep working ────────────────────────── */

check(
  'the old exclusive-or trigger is gone',
  !db.prepare(`SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='trg_post_body_moves_as_one_upd'`).get(),
);

{
  const id = mkPost(coach);
  refused(
    'the doc may NOT move while the source and the grammar stand still',
    () => db.prepare(`UPDATE coach_posts SET body_doc = '[{"k":"p"}]' WHERE id = ?`).run(id),
    'doc_moved_without_source',
  );
}
{
  // THE CASE THE OLD TRIGGER REFUSED. Reflowing a paragraph changes the source and can leave the
  // parsed document byte-identical. Under 021 this was an abort; the author had typed something
  // real and the product said no.
  const id = mkPost(coach);
  accepted(
    'the source may move while the doc stays byte-identical (a reflow)',
    () => db.prepare(`UPDATE coach_posts SET body_src = 'src reflowed' WHERE id = ?`).run(id),
  );
}
{
  // THE OTHER CASE THE OLD TRIGGER REFUSED, and the one that would have frozen the whole corpus:
  // re-parsing under a new grammar moves the doc while the source stands still.
  const id = mkPost(coach);
  accepted(
    'the doc may move when doc_version moves — a grammar bump must not freeze the corpus',
    () =>
      db
        .prepare(`UPDATE coach_posts SET body_doc = '[{"k":"p"}]', doc_version = 2 WHERE id = ?`)
        .run(id),
  );
}
{
  const id = mkPost(coach);
  accepted(
    'source and doc may move together — the ordinary edit',
    () => db.prepare(`UPDATE coach_posts SET body_src = 's2', body_doc = '[{"k":"p"}]' WHERE id = ?`).run(id),
  );
}
{
  const id = mkPost(coach);
  accepted(
    'a title-only edit touches neither and is allowed',
    () => db.prepare(`UPDATE coach_posts SET title = 'renamed' WHERE id = ?`).run(id),
  );
}

/* ── 5. the profile bio, which had no rule at all before 022 ─────────────────────────────────── */

refused(
  'a profile bio_doc may NOT move alone',
  () => db.prepare(`UPDATE coach_profiles SET bio_doc = '[{"k":"p"}]' WHERE user_id = ?`).run(coach),
  'doc_moved_without_source',
);
accepted(
  'a profile bio_src may move alone',
  () => db.prepare(`UPDATE coach_profiles SET bio_src = 'rewritten' WHERE user_id = ?`).run(coach),
);
accepted(
  'a profile bio_doc may move with doc_version',
  () => db.prepare(`UPDATE coach_profiles SET bio_doc = '[{"k":"p"}]', doc_version = 2 WHERE user_id = ?`).run(coach),
);

/* ── 6. post_media identity is frozen ────────────────────────────────────────────────────────── */

const frozenPost = mkPost(coach);
const otherPost = mkPost(other);
const fk = mediaKeys();
insMedia(frozenPost, { storage: fk.storage, thumb: fk.thumb });
const mediaId = db.prepare(`SELECT id FROM post_media WHERE storage_key = ?`).get(fk.storage).id;

refused(
  'a media row may NOT be re-pointed at another post',
  () => db.prepare(`UPDATE post_media SET post_id = ? WHERE id = ?`).run(otherPost, mediaId),
  'identity_is_frozen',
);
refused(
  'storage_key may NOT be rewritten',
  () => db.prepare(`UPDATE post_media SET storage_key = ? WHERE id = ?`).run(`pub_${HEX32}.webp`, mediaId),
  'identity_is_frozen',
);
refused(
  'thumb_key may NOT be rewritten',
  () => db.prepare(`UPDATE post_media SET thumb_key = ? WHERE id = ?`).run(`pub_${'b'.repeat(32)}.webp`, mediaId),
  'identity_is_frozen',
);
refused(
  'created_at may NOT be rewritten',
  () => db.prepare(`UPDATE post_media SET created_at = 1 WHERE id = ?`).run(mediaId),
  'identity_is_frozen',
);
accepted(
  'soft-deleting a media row is still allowed — the freeze is on identity, not on state',
  () => db.prepare(`UPDATE post_media SET deleted_at = unixepoch() WHERE id = ?`).run(mediaId),
);

/* ── 7. the two keys must differ ─────────────────────────────────────────────────────────────── */

{
  const same = `pub_${'c'.repeat(32)}.webp`;
  refused(
    'a media row whose storage_key equals its thumb_key is refused',
    () => insMedia(mkPost(coach), { storage: same, thumb: same }),
    'keys_must_differ',
  );
}

/* ── 8. restore is a publication event ───────────────────────────────────────────────────────── */

{
  const id = mkPost(coach, { published: true, deleted: true });
  accepted(
    'a coach in good standing may restore a withdrawn post',
    () => db.prepare(`UPDATE coach_posts SET deleted_at = NULL WHERE id = ?`).run(id),
  );
}
/*
 * EVERY FIXTURE BELOW REACHES ITS STATE THE WAY THE PRODUCT WOULD.
 *
 * The first draft built them directly — a published profile for a coach who had never accepted the
 * guidelines, a published post under an unpublished profile — and 021's own INSERT triggers refused
 * every one of them. That refusal was the right answer: those states are not reachable, and a
 * refusal asserted against an impossible state says nothing about the guard under test.
 *
 * So each coach is set up in good standing, publishes, withdraws, and THEN loses standing. That is
 * the actual shape of the attack: a back catalogue withdrawn while everything is fine and returned
 * to the anonymous surface after it is not.
 */
{
  // Standing goes stale on its own, with no action by the coach: the guidelines are re-published
  // and yesterday's acceptance no longer matches the version now in force.
  const stale = mkUser('stale@v022.local');
  acceptGuidelines(stale);
  mkProfile(stale, 'stale-v022');
  const id = mkPost(stale, { published: true, deleted: true });

  db.prepare(`UPDATE guidelines_versions SET active = 0 WHERE active = 1`).run();
  db.prepare(`INSERT INTO guidelines_versions (version, i18n_key, active) VALUES ('2.0', 'guidelines.v2', 1)`).run();

  refused(
    'a coach whose acceptance predates the guidelines now in force may NOT restore',
    () => db.prepare(`UPDATE coach_posts SET deleted_at = NULL WHERE id = ?`).run(id),
    'restore_denied',
  );

  // Put the old version back so the remaining fixtures run against the world they were written for.
  db.prepare(`UPDATE guidelines_versions SET active = 0 WHERE version = '2.0'`).run();
  db.prepare(`UPDATE guidelines_versions SET active = 1 WHERE version = '1.0'`).run();
}
{
  const hidden = mkUser('hidden@v022.local');
  acceptGuidelines(hidden);
  mkProfile(hidden, 'hidden-v022');
  const id = mkPost(hidden, { published: true, deleted: true });
  db.prepare(`UPDATE coach_profiles SET published_at = NULL WHERE user_id = ?`).run(hidden);
  refused(
    'a coach who has since unpublished their profile may NOT restore a published post',
    () => db.prepare(`UPDATE coach_posts SET deleted_at = NULL WHERE id = ?`).run(id),
    'restore_denied',
  );
}
{
  const disabled = mkUser('disabled@v022.local');
  acceptGuidelines(disabled);
  mkProfile(disabled, 'disabled-v022');
  const id = mkPost(disabled, { published: true, deleted: true });
  db.prepare(`UPDATE users SET disabled_at = unixepoch() WHERE id = ?`).run(disabled);
  refused(
    'a disabled account may NOT restore a published post',
    () => db.prepare(`UPDATE coach_posts SET deleted_at = NULL WHERE id = ?`).run(id),
    'restore_denied',
  );
}
{
  // A DRAFT that was soft-deleted was never public, so restoring it is not a publication event and
  // must not be gated. Gating it would make a coach's own bin depend on their standing.
  const nostand = mkUser('nostand@v022.local');
  mkProfile(nostand, 'nostand-v022', false);
  const id = mkPost(nostand, { published: false, deleted: true });
  accepted(
    'restoring a never-published draft is NOT gated',
    () => db.prepare(`UPDATE coach_posts SET deleted_at = NULL WHERE id = ?`).run(id),
  );
}

/* ── 9. THE SHORT-TEXT CONTROL 021 PROMISED AND NOBODY WROTE ─────────────────────────────────── */

const { sanitizeDisplayText } = await import('../src/public/text.js');
const { HANDLE_RE } = await import('../src/public/shapes.js');

// EVERY INVISIBLE CHARACTER IN THIS SECTION IS AN ESCAPE, never the character itself.
//
// The first draft of this block pasted literals. One of them — a non-breaking space — arrived as
// an ordinary space, so the assertion written to show that the COLUMN cannot catch a blank name
// reported the opposite, and it reported it convincingly. A file about invisible characters is the
// last place to keep any.
const NBSP = '\u00A0';
const ZWJ = '\u200D';
const IDEOGRAPHIC_SPACE = '\u3000';
const RLO = '\u202E';
const PDF = '\u202C';
const ACUTE = '\u0301';

// THE PROPERTY, stated once: after sanitising, the length JavaScript measures is the length SQLite
// measures. Everything else in text.js exists to make that true.
//
// It is not true of raw input, because SQLite's trim() strips ASCII SPACE AND NOTHING ELSE —
// measured against the real database, not assumed: NBSP, U+3000, TAB and NEWLINE all survive it
// with the length unchanged. So a bound of length(trim(x)) BETWEEN 2 AND 120 is satisfied by two
// non-breaking spaces, and a name JavaScript trims to two characters can fail a CHECK that measured
// it differently, arriving at the composer as an opaque 400 about a length the coach can see is fine.
for (const [raw, label] of [
  ['Kovács Péter', 'ordinary accented text'],
  [ZWJ.repeat(60), 'sixty zero-width joiners'],
  [NBSP + NBSP, 'two non-breaking spaces'],
  [RLO + 'gnitekram' + PDF, 'a right-to-left override'],
  ['a' + ACUTE.repeat(4) + 'b', 'a combining-mark run'],
  ['  spaced' + IDEOGRAPHIC_SPACE + 'out  ', 'mixed unicode whitespace'],
  ['\u0007x', 'a control character'],
]) {
  const clean = sanitizeDisplayText(raw);
  const trimmed = db.prepare('SELECT length(trim(?)) AS n').get(clean).n;
  check(
    'after sanitising, JS and SQLite agree on the length — ' + label,
    clean.length === trimmed,
    'js ' + clean.length + ' vs sqlite ' + trimmed + ' for ' + JSON.stringify(clean),
  );
}

check(
  'a display name of joiners alone sanitises to nothing, so the 2-character floor rejects it',
  sanitizeDisplayText(ZWJ.repeat(60)) === '' && sanitizeDisplayText(NBSP + NBSP) === '',
);

const insName = (handle, name, email) =>
  db
    .prepare('INSERT INTO coach_profiles (user_id, handle, display_name) VALUES (?, ?, ?)')
    .run(mkUser(email), handle, name);

refused(
  'the column catches a blank name made of ASCII spaces',
  () => insName('blank-name', '  ', 'blank@v022.local'),
  'display_name',
);

/*
 * AND HERE IS WHY THE CODE CONTROL HAS TO EXIST AT ALL.
 *
 * The same blank name written with NON-BREAKING spaces is ACCEPTED by the column, because SQLite's
 * trim() leaves them alone: length(trim(x)) sees two characters and the CHECK agrees. The row is
 * legal, the directory renders an entry with no name, and no schema control anywhere refuses it.
 *
 * 021 said exactly this — the strip is "a CODE control, stated as one... and not pretended to be a
 * schema control here" — and then the code was never written. This assertion is the demonstration
 * that the column really cannot do the job, so the next person to find sanitizeDisplayText
 * inconvenient can see what deleting it gives back.
 */
accepted(
  'but the SAME name in non-breaking spaces satisfies that CHECK — the schema cannot catch this',
  () => insName('nbsp-name', NBSP + NBSP, 'nbsp@v022.local'),
);
check(
  'which is what sanitizeDisplayText refuses before it ever reaches the column',
  sanitizeDisplayText(NBSP + NBSP).length === 0,
);

/*
 * HANDLE_RE and the column CHECK are ONE RULE WRITTEN TWICE — once as a JavaScript regex, once as
 * four SQLite GLOB clauses. Two representations that must agree is this project's number-one defect
 * class, and the only honest way to hold them together is to ask both about the same strings rather
 * than to read them side by side and nod.
 */
{
  const alphabet = ['a', 'z', '0', '9', '-', 'A', '_', '.', ' ', 'é', ZWJ];
  const candidates = new Set(['', 'a', 'ab', 'abc', 'a-c', '-ab', 'ab-', 'a'.repeat(32), 'a'.repeat(33)]);
  for (const a of alphabet) {
    for (const b of alphabet) {
      for (const c of alphabet) candidates.add(a + b + c);
    }
  }
  const sql = db.prepare(
    "SELECT (? NOT GLOB '*[^a-z0-9-]*' AND ? GLOB '[a-z0-9]*' AND substr(?, -1, 1) GLOB '[a-z0-9]' AND length(?) BETWEEN 3 AND 32) AS ok",
  );
  const disagreements = [];
  for (const h of candidates) {
    const byRegex = HANDLE_RE.test(h);
    const byColumn = sql.get(h, h, h, h).ok === 1;
    if (byRegex !== byColumn) disagreements.push(JSON.stringify(h) + ': regex ' + byRegex + ' vs column ' + byColumn);
  }
  check(
    'HANDLE_RE and the four-clause column CHECK agree on all ' + candidates.size + ' candidates',
    disagreements.length === 0,
    disagreements.slice(0, 3).join(' | '),
  );
}

/* ── done ────────────────────────────────────────────────────────────────────────────────────── */

db.close();
await fs.rm(tmp, { force: true });
await fs.rm(`${tmp}-wal`, { force: true });
await fs.rm(`${tmp}-shm`, { force: true });

console.log(`\nverify-022: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
