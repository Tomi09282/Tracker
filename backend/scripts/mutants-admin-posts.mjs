// scripts/mutants-admin-posts.mjs — the planted-defect proof for package B-admin-posts.
//
// A test that has never been seen to fail proves nothing. This applies ONE defect at a time to the
// real source, runs the admin-posts smoke section (`node scripts/smoke-run.mjs --only=admin-posts`)
// against it, and demands a RED run that names at least one failing check. A mutant that survives
// (the run is green) means the section does not guard that behaviour; the script exits 1.
//
//   node scripts/mutants-admin-posts.mjs              all mutants (about 20 s each)
//   node scripts/mutants-admin-posts.mjs M01 M07      only these
//
// Not part of `check:all`: it rewrites source files for the duration of a run (and restores them in
// a finally block and on SIGINT), so it must never run alongside anything else in the same checkout.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

/** Each mutant: where, the exact text to find (LF), and what to put there. `all` = every occurrence. */
const MUTANTS = [
  { id: 'M01', what: 'PUBLIC_POST forgets the author standing (the visibility gap itself)',
    file: 'src/public/visibility.js', find: "  AND ${AUTHOR_STANDING('p.author_user_id')}\n", to: '' },
  { id: 'M02', what: 'PUBLIC_PROFILE forgets the author standing (profile page and directory stay public)',
    file: 'src/public/visibility.js', find: "  AND ${AUTHOR_STANDING('c.user_id')}\n", to: '' },
  { id: 'M03', what: 'the standing ignores the ROLE (a demoted coach stays public)',
    file: 'src/public/visibility.js', find: "       AND ua.role IN ('coach','admin')\n", to: '' },
  { id: 'M04', what: 'the standing ignores DISABLED (a disabled coach stays public)',
    file: 'src/public/visibility.js', find: '       AND ua.disabled_at IS NULL\n', to: '' },
  { id: 'M05', what: 'the report lookup keeps its own drifted copy of the predicate (a hidden post can be reported)',
    file: 'src/db/worker.js',
    find: '            WHERE p.public_id = ?\n              AND ${PUBLIC_POST}`,',
    to: '            WHERE p.public_id = ?\n              AND p.published_at IS NOT NULL AND p.deleted_at IS NULL AND p.removed_at IS NULL\n              AND c.published_at IS NOT NULL AND c.removed_at IS NULL`,' },
  { id: 'M06', what: 'a draft body and pictures are shown to the admin',
    file: 'src/db/tx/admin-posts.js', find: 'const everPublished = p.publishedAt !== null;', to: 'const everPublished = true;' },
  { id: 'M07', what: 'the title search is not column-filtered (draft body words are searchable)',
    file: 'src/db/tx/admin-posts.js', find: '{ fts: `title : (${fts})` }', to: '{ fts }' },
  { id: 'M08', what: 'LIKE wildcards in q are not escaped',
    file: 'src/public/admin-posts.js', find: 'const escapeLike = (text) => text.replace(/[\\\\%_]/g, (ch) => `\\\\${ch}`);', to: 'const escapeLike = (text) => text;' },
  { id: 'M09', what: 'a garbage cursor is silently ignored instead of refused',
    file: 'src/public/admin-posts.js', find: '      if (!ok) return sendError(res, 400, ERR.VALIDATION);\n      cursor = parts;', to: '      cursor = ok ? parts : null;' },
  { id: 'M10', what: 'restore has no "must be removed" guard anywhere (not before, not inside the UPDATE)',
    file: 'src/db/tx/admin-posts.js',
    find: "    if (post.removedAt === null) return { outcome: 'not_removed' };\n", to: '',
    also: [{ find: 'WHERE id = ? AND removed_at IS NOT NULL`,\n    ).run(post.id);', to: 'WHERE id = ?`,\n    ).run(post.id);' }] },
  { id: 'M11', what: 'restore trusts the token: no actor re-check under the write lock',
    file: 'src/db/tx/admin-posts.js', find: "    if (!actor) return { outcome: 'not_an_admin' };\n", to: '' },
  { id: 'M12', what: 'the admin reads authorise from the JWT alone (no assertAdmin)',
    file: 'src/public/admin-posts.js', find: '    if (!(await assertAdmin(req, res))) return undefined;\n', to: '', all: true },
  { id: 'M13', what: 'the report list leaks the reporter id',
    file: 'src/db/tx/admin-posts.js', find: 'SELECT r.id, r.reason_key AS reason,', to: 'SELECT r.id, r.reporter_user_id AS reporterId, r.reason_key AS reason,' },
  { id: 'M14', what: 'the admin picture route serves a draft picture',
    file: 'src/public/admin-posts.js', find: '          AND m.deleted_at IS NULL\n          AND p.published_at IS NOT NULL`,', to: '          AND m.deleted_at IS NULL`,' },
  { id: 'M15', what: 'restore leaves the removal reason behind',
    file: 'src/db/tx/admin-posts.js', find: 'SET removed_at = NULL, removed_by = NULL, removal_reason = NULL,', to: 'SET removed_at = NULL, removed_by = NULL,' },
  { id: 'M16', what: 'restore does not bump row_version',
    file: 'src/db/tx/admin-posts.js', find: "              row_version = row_version + 1, updated_at = unixepoch()\n        WHERE id = ? AND removed_at IS NOT NULL", to: "              updated_at = unixepoch()\n        WHERE id = ? AND removed_at IS NOT NULL" },
  { id: 'M17', what: 'restore writes a different audit action',
    file: 'src/db/tx/admin-posts.js', find: "VALUES (?, 'marketplace.moderation.restore', 'coach_post', ?, ?, ?, ?)", to: "VALUES (?, 'marketplace.moderation.restored', 'coach_post', ?, ?, ?, ?)" },
  { id: 'M18', what: 'a moderator-removed draft is listed as a draft (state precedence)',
    file: 'src/db/tx/admin-posts.js', find: "    WHEN p.removed_at IS NOT NULL THEN 'removed'", to: "    WHEN p.removed_at IS NOT NULL AND p.published_at IS NOT NULL THEN 'removed'" },
  { id: 'M19', what: 'the newest-first keyset repeats the boundary row',
    file: 'src/db/tx/admin-posts.js', find: "newest: { order: 'sortAt DESC, rowId DESC', key: '(sortAt, rowId)', cmp: '<', width: 2 }", to: "newest: { order: 'sortAt DESC, rowId DESC', key: '(sortAt, rowId)', cmp: '<=', width: 2 }" },
  { id: 'M20', what: 'the take-down answer loses its state / target',
    file: 'src/public/moderation.js', find: "      state: 'removed',\n    });", to: '    });' },
  { id: 'M21', what: 'the take-down route loses its per-admin limiter',
    file: 'src/public/moderation.js', find: '  adminWriteAccountLimiter,\n  asyncRoute(async (req, res) => {\n    const parsed = removeBody', to: '  asyncRoute(async (req, res) => {\n    const parsed = removeBody' },
  { id: 'M22', what: 'the new list route loses its per-admin limiter',
    file: 'src/public/admin-posts.js', find: "  readIpLimiter,\n  readAdminLimiter,\n  asyncRoute(async (req, res) => {\n    if (!(await assertAdmin(req, res))) return undefined;\n    const parsed = listQuery", to: "  readIpLimiter,\n  asyncRoute(async (req, res) => {\n    if (!(await assertAdmin(req, res))) return undefined;\n    const parsed = listQuery" },
  { id: 'M23', what: 'q accepts control characters',
    file: 'src/public/admin-posts.js', find: ' && !/\\p{Cc}/u.test(v)', to: '' },
  { id: 'M24', what: 'the restore body is not strict',
    file: 'src/public/admin-posts.js', find: 'const restoreBody = z.object({ note: displayText(1, 500).nullable().optional() }).strict();', to: 'const restoreBody = z.object({ note: displayText(1, 500).nullable().optional() });' },
  { id: 'M25', what: 'restore forgets to clear removed_by (the pair trigger refuses the UPDATE)',
    file: 'src/db/tx/admin-posts.js', find: 'SET removed_at = NULL, removed_by = NULL, removal_reason = NULL,', to: 'SET removed_at = NULL, removed_by = removed_by, removal_reason = NULL,' },
  { id: 'M26', what: 'detail 404 becomes a 500-class error for unknown ids (the null view is not handled)',
    file: 'src/public/admin-posts.js', find: "    if (!view) return sendError(res, 404, ERR.NOT_FOUND, 'not found');\n\n    view.post.media", to: "    view.post.media" },
];

const only = process.argv.slice(2);
const chosen = only.length ? MUTANTS.filter((m) => only.includes(m.id)) : MUTANTS;

const originals = new Map();
const eolOf = (raw) => (raw.includes('\r\n') ? '\r\n' : '\n');
const restoreAll = () => {
  for (const [file, raw] of originals) fs.writeFileSync(file, raw);
  originals.clear();
};
process.on('SIGINT', () => { restoreAll(); process.exit(130); });
process.on('exit', restoreAll);

function apply(m) {
  const edits = [{ find: m.find, to: m.to, all: m.all }, ...(m.also ?? []).map((a) => ({ ...a, file: m.file }))];
  const raw = fs.readFileSync(m.file, 'utf8');
  originals.set(m.file, raw);
  const eol = eolOf(raw);
  let s = raw.replace(/\r\n/g, '\n');
  for (const e of edits) {
    if (!s.includes(e.find)) return `the text to mutate is not in ${m.file}: ${e.find.slice(0, 70).replace(/\n/g, '\\n')}`;
    s = e.all ? s.split(e.find).join(e.to) : s.replace(e.find, () => e.to);
  }
  fs.writeFileSync(m.file, eol === '\n' ? s : s.replace(/\n/g, '\r\n'));
  return null;
}

function smoke() {
  // The seed steps can die on teardown with 0xC0000005 on this machine (a known Windows quirk, not
  // the code under test): retry those, but never a run that reached the section.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const r = spawnSync(process.execPath, ['scripts/smoke-run.mjs', '--only=admin-posts'], { encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (r.status !== 0 && /smoke-run: setup step/.test(out)) continue;
    return { status: r.status, out };
  }
  return { status: 2, out: 'setup step kept failing' };
}

let survived = 0;
let broken = 0;
const rows = [];
for (const m of chosen) {
  const err = apply(m);
  if (err) {
    broken += 1;
    rows.push(`${m.id}  BROKEN MUTANT  ${err}`);
    restoreAll();
    continue;
  }
  const { status, out } = smoke();
  restoreAll();
  const fails = out.split(/\r?\n/).filter((l) => l.startsWith('FAIL'));
  const crashed = status !== 0 && fails.length === 0;
  if (status === 0) {
    survived += 1;
    rows.push(`${m.id}  SURVIVED       ${m.what}`);
  } else if (crashed) {
    // A crash (the server refusing to boot, an exception in the section) is red too, but say so.
    rows.push(`${m.id}  killed (crash) ${m.what}  [exit ${status}: ${out.trim().split(/\r?\n/).slice(-1)[0]?.slice(0, 120)}]`);
  } else {
    rows.push(`${m.id}  killed (${String(fails.length).padStart(2)})   ${m.what}  <- ${fails[0].slice(6, 110)}`);
  }
  console.log(rows.at(-1));
}

console.log(`\nmutants-admin-posts: ${chosen.length} mutants, ${chosen.length - survived - broken} killed, ${survived} survived, ${broken} broken`);
process.exit(survived === 0 && broken === 0 ? 0 : 1);
