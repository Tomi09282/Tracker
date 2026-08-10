#!/usr/bin/env node
/**
 * verify-gates — break what each gate guards, and watch it fail.
 *
 * ═══ WHY THIS FILE EXISTS ══════════════════════════════════════════════════════════════════════
 *
 * A gate that has never been seen to reject is indistinguishable from a gate that does nothing.
 * Every green line in `check:all` is evidence about the codebase only if the check would have gone
 * red on a codebase that deserved it — and the only way to know that is to hand it one.
 *
 * This project has already been bitten by the alternative twice: a probe that reported PASS over a
 * production path that aborted every time, and four assertions that passed while the write under
 * test was being refused by an unrelated rule.
 *
 * Each case below EDITS THE REAL SOURCE, runs the real gate, restores the file, and asserts that
 * the gate objected in between. The restore is in a `finally`, so a crash mid-run cannot leave a
 * planted defect behind — and the last thing this script does is verify every file is byte-identical
 * to how it found it.
 *
 * Run: npm run verify:gates
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (passed += 1) : (failed += 1);
};

/** Run a gate and report whether it rejected, plus what it said. */
function runGate(script) {
  try {
    const out = execFileSync(process.execPath, [script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { rejected: false, output: out };
  } catch (err) {
    return { rejected: true, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const digest = async (p) => crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');

/**
 * Plant one defect, run the gate, restore.
 *
 * `expect` must be a phrase specific to the rule under test. A gate that rejects for a DIFFERENT
 * reason than the one being probed is not evidence about this rule — that is the mistake
 * verify-022 made with a bare 'CHECK' expectation, and it made it four times.
 */
async function mutate({ label, file, from, to, gate, expect }) {
  const full = path.resolve(file);
  const before = await fs.readFile(full, 'utf8');
  if (!before.includes(from)) {
    check(label, false, `the anchor is gone from ${file} — this case no longer tests anything`);
    return;
  }
  try {
    await fs.writeFile(full, before.replace(from, to));
    const { rejected, output } = runGate(gate);
    check(
      label,
      rejected && output.includes(expect),
      rejected ? `said: ${output.split('\n').find((l) => l.includes(expect))?.trim().slice(0, 88) ?? output.slice(0, 60)}` : 'THE GATE STAYED GREEN',
    );
  } finally {
    await fs.writeFile(full, before);
  }
}

const TOUCHED = [
  'src/db/worker.js',
  'src/public/compose.js',
  'src/public/body.js',
  'src/public/routes.js',
  'src/admin/routes.js',
  'src/db/migrations/024_rename_eligibility.sql',
  'src/coaching/routes.js',
];
const beforeAll = Object.fromEntries(await Promise.all(TOUCHED.map(async (f) => [f, await digest(path.resolve(f))])));

console.log('── check-worker-tx: ADR-0005, the rule that commits on return ──────────────────');

// THE FATAL SHAPE: a conditional return after a SECOND write. The first draft of this case put it
// after the FIRST write instead and reported the gate as broken — but a changes === 0 return there
// genuinely commits nothing, so the gate was right to stay green and the TEST was wrong. The
// exemption is only unsound once something else has already been written; that is the distinction
// the gate could not previously make, and it is what the corpus's only FATAL finding turns on.
await mutate({
  label: 'a changes === 0 return after a SECOND write is caught — the exemption does not survive it',
  file: 'src/db/worker.js',
  // `updateCoachProfileTx` ends with four writes behind it: the UPDATE, the DELETE of the old
  // specialties, the INSERTs of the new ones, and the audit row. A `changes === 0` return HERE
  // commits all of them and tells the caller nothing happened — the exact shape the exemption used
  // to wave through, and the shape of the composer review's only FATAL finding.
  from: ".run(userId, userId, JSON.stringify({ city, specialties }), requestId, ip);\n\n    return view(false);",
  to: ".run(userId, userId, JSON.stringify({ city, specialties }), requestId, ip);\n\n    if (updated.changes === 0) return { outcome: 'missing' };\n    return view(false);",
  gate: 'scripts/check-worker-tx.mjs',
  expect: 'conditional return AFTER a write',
});

/*
 * ═══ THE HOLE A COMMENT COULD OPEN ════════════════════════════════════════════════════════════
 *
 * The exemption test reads the current line AND THE LINE ABOVE, and the line above a probe is
 * almost always a comment. Until comments were blanked, a comment mentioning `changes === 0` was
 * enough to satisfy it — so a sentence describing the opposite of what the code does could switch
 * the gate off over a genuine conditional return after a write.
 *
 * This plants exactly that: a return that is NOT a changes === 0 probe, under a comment that says
 * it is. The gate must fire on the code and ignore the prose.
 */
await mutate({
  label: 'a comment mentioning changes === 0 no longer buys a conditional return the exemption',
  file: 'src/db/worker.js',
  // `updateCoachProfileTx`'s guarded UPDATE, which is a legitimate one-write changes === 0 probe.
  // Rewriting it as `!== 1` makes it no longer the exemption's shape, while the comment above CLAIMS
  // it is — which is exactly the sentence that used to switch the gate off.
  from: "    if (updated.changes === 0) return { outcome: 'missing' };",
  to:
    '    // the changes === 0 probe below is the ADR-0005 exemption, so this is fine\n' +
    "    if (updated.changes !== 1) return { outcome: 'missing' };",
  gate: 'scripts/check-worker-tx.mjs',
  expect: 'conditional return AFTER a write',
});

console.log('\n── check-route-tx: the blind spot check-worker-tx cannot see ───────────────────');

/*
 * The defect this gate was built for, restored to the route it was found in.
 *
 * `db.writeTx([guarded, consequence])` followed by a branch on the guard's `changes` is the same
 * mistake ADR-0005 is about, one layer up — and check-worker-tx cannot see it, because it only
 * walks worker.js. Two real instances were live when this gate was written: an audit row committed
 * for a moderation decision that was refused, and an exhausted invite code that linked the client
 * to the coach anyway.
 */
await mutate({
  label: 'a route that refuses after committing the rest of its writeTx is caught',
  file: 'src/admin/routes.js',
  from: '    const result = await db.decideExercise({',
  to:
    '    const [probe] = await db.writeTx([\n' +
    "      { sql: 'UPDATE exercises SET status = ? WHERE id = ? AND status = ?', params: ['global', id, 'pending_review'] },\n" +
    "      { sql: 'INSERT INTO audit_log (actor_id, action, target_type, target_id, request_id) VALUES (?, ?, ?, ?, ?)', params: [req.user.id, 'x.y', 'exercise', id, res.locals.requestId] },\n" +
    '    ]);\n' +
    "    if (probe.changes === 0) return sendError(res, 409, ERR.CONFLICT, 'already decided');\n" +
    '    const result = await db.decideExercise({',
  gate: 'scripts/check-route-tx.mjs',
  expect: 'branches on `probe.changes === 0` after a 2-step db.writeTx',
});

console.log('\n── check-body-writes: the four columns that must agree ─────────────────────────');

await mutate({
  label: 'a statement writing body_doc without its source is caught',
  file: 'src/db/worker.js',
  from: 'SET title = ?, body_src = ?, body_doc = ?, body_excerpt = ?, doc_version = ?,',
  to: 'SET title = ?, body_doc = ?,',
  gate: 'scripts/check-body-writes.mjs',
  expect: 'writes body_doc without',
});

await mutate({
  label: 'a second caller of the parser is caught',
  file: 'src/public/compose.js',
  from: '      body = buildBody(parsed.data.body_src, POST_BODY);',
  to: '      body = parseBody(parsed.data.body_src);',
  gate: 'scripts/check-body-writes.mjs',
  expect: 'the parser has one caller',
});

await mutate({
  label: 'a hand-typed doc_version is caught',
  file: 'src/db/worker.js',
  from: 'const SPECIALTY_SLOTS = 6;',
  to: 'const SPECIALTY_SLOTS = 6;\nconst FALLBACK = { doc_version: 1 };',
  gate: 'scripts/check-body-writes.mjs',
  expect: "assigns doc_version = 1",
});

console.log('\n── check-routes: authentication, strict schemas, and the public file ───────────');

await mutate({
  label: 'a composer route without requireAuth is caught',
  file: 'src/public/compose.js',
  from: "  '/compose/posts',\n  requireAuth,\n  requireCoach,",
  to: "  '/compose/posts',\n  requireCoach,",
  gate: 'scripts/check-routes.mjs',
  expect: 'compose/posts',
});

await mutate({
  label: 'a request schema that is not .strict() is caught',
  file: 'src/public/compose.js',
  from: 'const emptyBody = z.object({}).strict();',
  to: 'const emptyBody = z.object({});',
  gate: 'scripts/check-routes.mjs',
  expect: 'not .strict()',
});

await mutate({
  label: 'req.user appearing in the ANONYMOUS router is caught',
  file: 'src/public/routes.js',
  from: '    const parsed = feedQuery.safeParse(req.query);',
  to: '    const parsed = feedQuery.safeParse(req.query);\n    const who = req.user?.id ?? null;',
  gate: 'scripts/check-routes.mjs',
  expect: 'req.user',
});

console.log('\n── check-admin-audit: the log that has to be there when somebody asks ──────────');

/*
 * The gate follows a route into the transaction it delegates to, so the audit row it looks for is
 * NOT in the file the route lives in — and this case now proves that, because the anchor moved.
 *
 * It used to plant the defect inline in admin/routes.js. Then the moderation decision became a
 * named worker transaction (it was committing an audit row for decisions it refused), the inline
 * INSERT went away, and this case reported "the anchor is gone from src/admin/routes.js — this case
 * no longer tests anything" instead of passing over nothing. That message is the harness earning
 * its keep: a mutation test whose anchor has rotted is a test that always passes.
 */
await mutate({
  label: 'an admin write whose audit row is gone is caught, through the delegation',
  file: 'src/db/worker.js',
  // Unique to decideExerciseTx: no other audit row in this file binds 'exercise' as target_type.
  from: "      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)\n       VALUES (?, ?, 'exercise', ?, ?, ?, ?)`",
  to: "      `INSERT INTO moderation_notes (actor_id, action, target_type, target_id, detail, request_id, ip)\n       VALUES (?, ?, 'exercise', ?, ?, ?, ?)`",
  gate: 'scripts/check-admin-audit.mjs',
  expect: 'reaches no INSERT INTO audit_log',
});

// `requireRole('admin')` still passes here — that is the whole point. The token says admin; the
// question is whether anything asked the DATABASE, and a gate that trusts the middleware cannot
// tell the difference between a re-check and a comment claiming one.
await mutate({
  label: 'an admin route that authorises from the JWT alone is caught',
  file: 'src/admin/routes.js',
  from: '    if (!(await assertAdmin(req, res))) return;\n\n    // One round trip per metric',
  to: '    // One round trip per metric',
  gate: 'scripts/check-admin-audit.mjs',
  expect: 'authorises from the JWT alone',
});

// Two writers sharing one action string. The rule had to be narrowed once already — `/disable` and
// `/enable` reach both of their strings through ONE transaction, and that is one writer, not two —
// so this case exists to show the narrowed rule still fires on the thing it is for.
await mutate({
  label: 'two different writers sharing one audit action string are caught',
  file: 'src/db/worker.js',
  from: "      approve ? 'exercise.moderation.approve' : 'exercise.moderation.reject',",
  to: "      approve ? 'user.disable' : 'exercise.moderation.reject',",
  gate: 'scripts/check-admin-audit.mjs',
  expect: "'user.disable' is written from 2 different places",
});

console.log('\n── verify-024: the view the rename cooldown was moved into ─────────────────────');

/*
 * 024 moved a rule. Moving a rule is the change most likely to relax it silently, because the
 * assertions that survive a relaxation are the ones about things SUCCEEDING — and those are most of
 * them. This plants the exact failure the migration risks: a `too_soon` that is always 0.
 *
 * Both readers go quiet together, which is the design working: the trigger stops aborting AND the
 * route stops refusing, so nothing anywhere holds the cooldown. If verify-024 stayed green here,
 * its central assertion would be measuring nothing.
 */
await mutate({
  label: 'a rename-eligibility view that always says "not too soon" is caught',
  file: 'src/db/migrations/024_rename_eligibility.sql',
  from: `    WHEN p.handle_renamed_at
         > unixepoch() - (SELECT value FROM public_policy WHERE key = 'handle_rename_cooldown_s')
      THEN 1`,
  to: `    WHEN 0 THEN 1`,
  gate: 'scripts/verify-024.mjs',
  expect: 'FAIL  a SECOND rename inside the window',
});

console.log('\n── and a route no gate can see ────────────────────────────────────────────────');

/*
 * THE TRAP THAT WAS REAL, not hypothetical.
 *
 * Four routes in this codebase built their handler with a factory instead of writing it inline, and
 * the old route regex could not parse them. `check-routes` printed "161 routes — all authenticated"
 * for a codebase with 165, and said nothing at all about the other four. They happened to comply.
 *
 * The parser now reads them, and anything it still cannot read is a hard failure. This proves that
 * second half: an unreadable registration must come out RED, because "I could not see this" and
 * "this is fine" must never be spelled the same way.
 */
await mutate({
  label: 'a route the parser cannot read fails the build instead of being skipped',
  file: 'src/admin/routes.js',
  from: "router.get(\n  '/admin/stats',",
  to: 'router.get(\n  `/admin/stats`,',
  gate: 'scripts/check-routes.mjs',
  expect: 'CANNOT PARSE',
});

console.log('\n── and nothing was left behind ────────────────────────────────────────────────');

const afterAll = Object.fromEntries(await Promise.all(TOUCHED.map(async (f) => [f, await digest(path.resolve(f))])));
const drifted = TOUCHED.filter((f) => beforeAll[f] !== afterAll[f]);
check(
  'every file this script edited is byte-identical to how it found it',
  drifted.length === 0,
  drifted.join(', '),
);

// And the real suite still passes, which is the other half of "nothing was left behind".
const clean = [
  'scripts/check-worker-tx.mjs',
  'scripts/check-body-writes.mjs',
  'scripts/check-routes.mjs',
  'scripts/check-admin-audit.mjs',
  'scripts/check-route-tx.mjs',
].map((g) => [g, runGate(g).rejected]);
check(
  'and all five gates are green again',
  clean.every(([, rejected]) => !rejected),
  clean.filter(([, r]) => r).map(([g]) => g).join(', '),
);

console.log(`\nverify-gates: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
