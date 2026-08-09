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

console.log('\n── and nothing was left behind ────────────────────────────────────────────────');

const afterAll = Object.fromEntries(await Promise.all(TOUCHED.map(async (f) => [f, await digest(path.resolve(f))])));
const drifted = TOUCHED.filter((f) => beforeAll[f] !== afterAll[f]);
check(
  'every file this script edited is byte-identical to how it found it',
  drifted.length === 0,
  drifted.join(', '),
);

// And the real suite still passes, which is the other half of "nothing was left behind".
const clean = ['scripts/check-worker-tx.mjs', 'scripts/check-body-writes.mjs', 'scripts/check-routes.mjs']
  .map((g) => [g, runGate(g).rejected]);
check(
  'and all three gates are green again',
  clean.every(([, rejected]) => !rejected),
  clean.filter(([, r]) => r).map(([g]) => g).join(', '),
);

console.log(`\nverify-gates: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
