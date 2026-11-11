#!/usr/bin/env node
// docs/pipeline/pulse/pkg/F4/selftest.mjs — the self-test of the eight integration tools (package F4).
//
// Every tool is run against the REAL tree and against planted bad input, and the exit code and
// the words of the refusal are asserted. The real tree is not touched: the test clones this
// repository into the OS temp dir (every byte of the tree, the same line-ending settings), copies
// the tools under test over the clone — the working copies, so uncommitted work is tested too —
// and plants its branches, patches and defects there. The clone's own `.pulse/` stands in for the
// main checkout's, so no lock, status file or progress file of the running effort is read or
// written.
//
// Usage (cwd anywhere inside the worktree):
//   node docs/pipeline/pulse/pkg/F4/selftest.mjs                    all tools
//   node docs/pipeline/pulse/pkg/F4/selftest.mjs --only i18n,sync   some of them
//   node docs/pipeline/pulse/pkg/F4/selftest.mjs --keep             leave the clone on disk
//
// GATE EXPORTS (R31). pulse-i18n and pulse-variants ask the gates for their scans
// (`scanKeyConsumers`, `scanElementReads`). Those exports arrive with F2:b. While the tree under
// test does not have them, the test first proves that the tools then stop with exit 3 (BLOCKED)
// instead of guessing, and after that plants a TEST DOUBLE of the two exports in the clone — a
// plain literal scan, written here, in test code — so the rest of the rules can be exercised.
// Once the real gates export their scans the doubles are not planted and the same cases run
// against the real thing. The summary line says which of the two happened.
//
// Exit: 0 every case passed, 1 otherwise. No dependency, no network, no secret.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024, ...opts });
const SOURCE = run('git', ['rev-parse', '--show-toplevel'], { cwd: HERE }).stdout.trim();
const TOOLS = ['pulse-owns-check', 'pulse-merge-check', 'pulse-sync', 'pulse-i18n', 'pulse-variants', 'pulse-fixture-check', 'pulse-progress', 'pulse-ledger'];

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const wants = (name) => !only || only.includes(name);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-f4-selftest-'));
// The clone goes away however the run ends — a crashed test must not leave a repository in %TEMP%.
process.on('exit', () => {
  if (process.argv.includes('--keep')) return;
  try {
    fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* a file still held by a child process: the OS temp dir is cleaned by the system */
  }
});
const REPO = `${TMP.split(path.sep).join('/')}/repo`;
const FRONT = `${REPO}/frontend`;
const CO = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';

/* ── helpers ──────────────────────────────────────────────────────────────────────────────────── */

const results = [];
let section = '';
const check = (label, ok, detail = '') => {
  results.push({ section, label, ok: Boolean(ok) });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : `\n         ${String(detail).trim().split('\n').slice(0, 12).join('\n         ')}`}`);
};
const g = (...args) => {
  const r = run('git', args, { cwd: REPO });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
};
const gTry = (...args) => run('git', args, { cwd: REPO });
const tool = (name, ...args) => {
  const r = run(process.execPath, [`scripts/${name}.mjs`, ...args], { cwd: FRONT });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
};
const read = (rel) => fs.readFileSync(`${REPO}/${rel}`, 'utf8');
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(`${REPO}/${rel}`), { recursive: true });
  fs.writeFileSync(`${REPO}/${rel}`, text);
};
const writeJson = (rel, doc) => write(rel, `${JSON.stringify(doc, null, 2)}\n`);
const sha = (rel) => crypto.createHash('sha256').update(fs.readFileSync(`${REPO}/${rel}`)).digest('hex');
const commit = (message, ...files) => {
  g('add', '--', ...files);
  g('commit', '-q', '-m', `${message}\n\n${CO}`);
};
/** Start a scenario branch from the published line of the clone, with a clean tree. */
const branch = (name, from = 'pulse-redesign') => g('switch', '-q', '-C', name, from);
const dropBranches = (...names) => {
  g('switch', '-q', 'pulse-redesign');
  for (const n of names) gTry('branch', '-D', n);
};
const status = () => g('status', '--porcelain');
const BUNDLES = ['hu', 'en', 'de'].map((l) => `frontend/src/i18n/${l}.json`);
const bundle = (l) => JSON.parse(read(`frontend/src/i18n/${l}.json`));
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const exportsScan = (script, name) => new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`).test(read(`frontend/scripts/${script}`));

/* ── the clone ────────────────────────────────────────────────────────────────────────────────── */

console.log(`pulse F4 self-test — cloning ${SOURCE}`);
const head = run('git', ['rev-parse', 'HEAD'], { cwd: SOURCE }).stdout.trim();
{
  const r = run('git', ['clone', '-q', '--no-checkout', SOURCE, REPO]);
  if (r.status !== 0) throw new Error(`clone failed: ${r.stderr}`);
}
g('config', 'user.name', 'pulse selftest');
g('config', 'user.email', 'selftest@pulse.invalid');
g('checkout', '-q', '-B', 'pulse-redesign', head);
for (const t of TOOLS) {
  const from = `${SOURCE}/frontend/scripts/${t}.mjs`;
  if (fs.existsSync(from)) fs.copyFileSync(from, `${FRONT}/scripts/${t}.mjs`);
}
g('add', '--', 'frontend/scripts');
// Nothing is staged when every tool is committed already (a line-ending difference is not a change).
if (gTry('diff', '--cached', '--quiet').status !== 0) g('commit', '-q', '-m', `selftest: the tools under test (working copies)

${CO}`);
// --with <branch>: merge another lane into the clone first — e.g. `--with pulse/F2b` runs every case
// against the REAL gate exports before that lane is on the published line.
const withRef = argv.includes('--with') ? argv[argv.indexOf('--with') + 1] : null;
if (withRef) {
  const r = gTry('merge', '-q', '--no-edit', '-m', `selftest: with ${withRef}\n\n${CO}`, `origin/${withRef}`);
  if (r.status !== 0) {
    console.error(`  --with ${withRef}: the merge into the clone failed — ${(r.stderr || r.stdout).trim().split('\n')[0]}`);
    process.exit(1);
  }
  console.log(`  merged ${withRef} (${g('rev-parse', '--short', `origin/${withRef}`)}) into the clone`);
}
const present = (t) => fs.existsSync(`${FRONT}/scripts/${t}.mjs`);

/** With --with: the merged lane's own hand-in files, applied by the tools exactly as the integrator does (6.2 step 3). */
function applyHandInsOf(ref) {
  section = 'integrate';
  console.log(`\nthe hand-in files of ${ref}, applied as at a merge`);
  const id = ref.replace(/^pulse\//, '');
  g('branch', '-f', ref, `origin/${ref}`);
  const files = g('ls-tree', '-r', '--name-only', ref, '--', 'docs/pipeline/pulse/pkg').split('\n');
  const has = (name) => files.some((f) => f.endsWith(`/${name}`));
  for (const [script, name] of [['pulse-i18n', 'i18n.patch.json'], ['pulse-variants', 'variants.json']]) {
    if (!has(name) || !present(script)) continue;
    const r = tool(script, 'apply', id, '--merge');
    check(`${script} apply ${id} --merge takes the lane's real ${name}`, r.status === 0 && /apply: written/.test(r.out), r.out);
  }
  // The lane's own patch: the one the tree under test does not have yet (an earlier stage's is merged already).
  const shared = files.find((f) => f.endsWith('/shared.patch') && gTry('cat-file', '-e', `${head}:${f}`).status !== 0);
  if (shared) {
    const r = run('git', ['apply', '--whitespace=nowarn', '-'], { cwd: REPO, input: run('git', ['cat-file', 'blob', `${ref}:${shared}`], { cwd: REPO }).stdout });
    check(`the lane's real shared.patch applies with git apply`, r.status === 0, r.stderr);
  }
  for (const gate of ['check-i18n', 'check-element-roster']) {
    const r = run(process.execPath, [`scripts/${gate}.mjs`], { cwd: FRONT });
    check(`${gate} is green on the result`, r.status === 0, r.stdout + r.stderr);
  }
  if (status()) {
    g('add', '-A');
    g('commit', '-q', '-m', `selftest: the hand-in files of ${ref}, applied\n\n${CO}`);
  }
  gTry('branch', '-D', ref);
}
if (withRef) applyHandInsOf(withRef);
console.log(`  clone at ${head.slice(0, 7)} in ${REPO}; tools present: ${TOOLS.filter(present).map((t) => t.replace('pulse-', '')).join(', ')}`);

/** The tip of the clone's published line that every scenario starts from. */
let baseTip = g('rev-parse', 'HEAD');
const realExports = exportsScan('check-i18n.mjs', 'scanKeyConsumers') && exportsScan('check-element-roster.mjs', 'scanElementReads');

let doublesPlanted = false;
/** The two exports the tools ask the gates for — as a plain literal scan. Test code, see the header. */
function plantScanDoubles() {
  doublesPlanted = true;
  const tail = (real) =>
    `\nimport { pathToFileURL as __url } from 'node:url';\nimport __path from 'node:path';\n` +
    `if (process.argv[1] && __url(__path.resolve(process.argv[1])).href.toLowerCase() === import.meta.url.toLowerCase()) await import('./${real}');\n`;
  const walker =
    `import __fs from 'node:fs';\n` +
    `const __walk = (root, visit) => { const src = __path.resolve(root ?? '.', 'src'); (function go(d) { for (const e of __fs.readdirSync(d, { withFileTypes: true })) { const p = __path.join(d, e.name); if (e.isDirectory()) go(p); else if (/\\.(ts|tsx)$/.test(e.name)) visit('src/' + __path.relative(src, p).split(__path.sep).join('/'), __fs.readFileSync(p, 'utf8')); } })(src); };\n`;
  g('mv', 'frontend/scripts/check-i18n.mjs', 'frontend/scripts/check-i18n.real.mjs');
  write(
    'frontend/scripts/check-i18n.mjs',
    `// TEST DOUBLE planted by pkg/F4/selftest.mjs — the real gate is check-i18n.real.mjs.\n${walker}` +
      `export async function scanKeyConsumers({ root } = {}) {\n  const out = new Map();\n  __walk(root, (rel, text) => { for (const m of text.matchAll(/['"\`]([a-z][A-Za-z0-9]*(?:\\.[A-Za-z0-9_]+)+)['"\`]/g)) { const l = out.get(m[1]) ?? []; if (!l.includes(rel)) l.push(rel); out.set(m[1], l); } });\n  return out;\n}\n${tail('check-i18n.real.mjs')}`,
  );
  g('mv', 'frontend/scripts/check-element-roster.mjs', 'frontend/scripts/check-element-roster.real.mjs');
  write(
    'frontend/scripts/check-element-roster.mjs',
    `// TEST DOUBLE planted by pkg/F4/selftest.mjs — the real gate is check-element-roster.real.mjs.\n${walker}` +
      `const PLAYGROUND_ONLY = ['E1', 'E3', 'E4', 'E5', 'E8', 'E9', 'E10', 'E12', 'E13', 'E16', 'E17', 'E18', 'E19', 'E20'];\n` +
      `export function scanElementReads({ root } = {}) {\n  const reads = [];\n  __walk(root, (rel, text) => { for (const m of text.matchAll(/useElementVariant\\(\\s*'(E\\d+)'/g)) reads.push({ element: m[1], file: rel, component: null, productImporters: [] }); });\n  return { reads, live: new Set(reads.map((r) => r.element)), playgroundOnly: new Set(PLAYGROUND_ONLY) };\n}\n${tail('check-element-roster.real.mjs')}`,
  );
  commit('selftest: test doubles of the two gate exports (F2:b is not in this tree)', 'frontend/scripts');
  baseTip = g('rev-parse', 'HEAD');
}

const wp = () => JSON.parse(read('docs/pipeline/pulse/work-packages.json'));
const plantWp = (name, mutate) => {
  const doc = wp();
  mutate(doc, (id) => [...doc.foundation, ...doc.screens].find((p) => p.id === id));
  const file = `${TMP}/wp-${name}.json`;
  fs.writeFileSync(file, JSON.stringify(doc));
  return file;
};

/* ── pulse-owns-check ─────────────────────────────────────────────────────────────────────────── */

if (wants('owns') && present('pulse-owns-check')) {
  section = 'owns';
  console.log('\npulse-owns-check');
  let r = tool('pulse-owns-check');
  check('passes on work-packages.json as it is', r.status === 0 && /OK — 45 packages, no overlap/.test(r.out), r.out);
  r = tool('pulse-owns-check', '--wp', plantWp('overlap', (d, p) => p('S-auth').owns.push('frontend/src/features/home/HomePage.tsx')));
  check('refuses a file owned twice', r.status === 1 && /HomePage\.tsx is owned by S-home and S-auth/.test(r.out), r.out);
  r = tool('pulse-owns-check', '--wp', plantWp('pattern', (d, p) => p('F9').owns.push('frontend/src/ui/primitives/*.tsx')));
  check('refuses two overlapping patterns for a file that does not exist yet', r.status === 1 && /F9 owns frontend\/src\/ui\/primitives\/\*\.tsx and F12 owns frontend\/src\/ui\/primitives\/FilePick\.tsx/.test(r.out), r.out);
  r = tool('pulse-owns-check', '--wp', plantWp('frozen', (d, p) => p('F1').owns.push('frontend/src/lib/**')));
  check('refuses an owned frozen file (the revision-1 defect)', r.status === 1 && /lib\/outbox\.ts is frozen for everybody, and F1 owns it/.test(r.out), r.out);
  r = tool('pulse-owns-check', '--wp', plantWp('orphan', (d, p) => p('S-coins').owns.splice(0, 1)));
  check('refuses a file under frontend/src with no owner', r.status === 1 && /CoinsPage\.tsx has no owner/.test(r.out), r.out);
  r = tool('pulse-owns-check', '--wp', plantWp('deletes', (d, p) => p('S-admin').deletes.push('frontend/src/features/admin/StyleStudioPage.tsx')));
  check('refuses a deleted file that is not owned', r.status === 1 && /S-admin deletes .*StyleStudioPage\.tsx, which is not in its owns/.test(r.out), r.out);
  r = tool('pulse-owns-check', '--wp', plantWp('preclaim', (d, p) => (p('F16').preClaim[0].laterOwner = 'S-home')));
  check('refuses a pre-claim whose later owner does not own the file', r.status === 1 && /WorkoutPlayer\.tsx is not owned by S-home/.test(r.out), r.out);
  r = tool('pulse-owns-check', '--wp', plantWp('dep', (d, p) => p('S-home').dependsOn.push('F8:9')));
  check('refuses a dependency on an undeclared stage', r.status === 1 && /F8 declares no stage "9"/.test(r.out), r.out);
  r = tool('pulse-owns-check', '--files', 'S-home', '--json');
  check('--files prints the generated list', r.status === 0 && JSON.parse(r.out).existing.length === 4, r.out);
  r = tool('pulse-owns-check', '--owner', 'frontend/src/lib/outbox.ts');
  check('--owner names the owner of a path', /frozen for everybody/.test(r.out), r.out);
}

/* ── pulse-progress ───────────────────────────────────────────────────────────────────────────── */

if (wants('progress') && present('pulse-progress')) {
  section = 'progress';
  console.log('\npulse-progress');
  const LIVE = '.pulse/progress.live.json';
  const live = () => JSON.parse(read(LIVE));
  let r = tool('pulse-progress', 'sync');
  check('a writer refuses outside the integration worktree (one writer)', r.status === 1 && /ONE writer/.test(r.out), r.out);
  branch('pulse-int');
  r = tool('pulse-progress', 'snapshot');
  check('snapshot refuses when there is no live file', r.status === 1 && /does not exist/.test(r.out), r.out);
  r = tool('pulse-progress', 'sync', '--from-snapshot');
  check('sync --from-snapshot rebuilds a lost live file', r.status === 0 && fs.existsSync(`${REPO}/${LIVE}`) && Object.keys(live().packages).length === 45, r.out);
  r = tool('pulse-progress', 'sync', '--from-snapshot');
  check('… and refuses to replace one that exists', r.status === 1 && /exists — nothing is lost/.test(r.out), r.out);
  // The cases below must not depend on how far the real effort has come: start them from a file
  // in which nothing has begun.
  {
    const doc = live();
    for (const e of Object.values(doc.packages)) {
      Object.assign(e, { status: 'todo', owner: null, slot: null, worktree: null, port: null, commit: null });
      for (const s of Object.values(e.stages ?? {})) Object.assign(s, { status: 'todo', commit: null });
      for (const f of Object.keys(e.frames ?? {})) e.frames[f] = 'todo';
    }
    writeJson(LIVE, doc);
  }

  writeJson('.pulse/status/S-home.json', { id: 'S-home', status: 'in_progress', step: 'home-2 built', frames: { 'home-1': 'matched-fixture', 'home-empty': 'baseline-captured' }, budgetNow: 14, head: 'abc1234', updated: '2026-10-13T10:00:00Z' });
  writeJson('.pulse/status/F2b.json', { id: 'F2b', status: 'in_progress', step: 'check-nav', updated: '2026-10-13T10:00:00Z' });
  writeJson('.pulse/status/F1.1+F1.2.json', { id: 'F1.1+F1.2', status: 'in_progress', step: 'fonts' });
  r = tool('pulse-progress', 'sync');
  const a = live();
  check('sync folds a package status file (status, step, frame verdict, extra state, budget)',
    r.status === 0 && a.packages['S-home'].status === 'in_progress' && a.packages['S-home'].lastStep === 'home-2 built' &&
      a.packages['S-home'].frames['home-1'] === 'matched-fixture' && a.packages['S-home'].extraStates['home-empty'] === 'baseline-captured' && a.packages['S-home'].budget.now === 14, r.out);
  check('sync folds a lane-stage status file into its stage (F2b -> F2:b)', a.packages.F2.stages['F2:b'].status === 'in_progress' && a.packages.F2.status === 'in_progress');
  check('a status file that is not one package is listed, not guessed', Boolean(a.statusFilesNotFolded['F1.1+F1.2']) && /not folded: F1\.1\+F1\.2/.test(r.out), r.out);
  const before = sha(LIVE);
  r = tool('pulse-progress', 'sync');
  check('sync is idempotent: the same inputs write the same bytes', r.status === 0 && /no change/.test(r.out) && sha(LIVE) === before, r.out);
  const ownsList = JSON.parse(tool('pulse-owns-check', '--files', 'S-home', '--json').out);
  check('files are generated from work-packages.json through the shared expander', JSON.stringify(a.packages['S-home'].files.existing) === JSON.stringify(ownsList.existing));

  r = tool('pulse-progress', 'claim', 'S-auth', '--owner', 'agent-7', '--slot', '2');
  check('claim refuses a package whose dependencies are not merged', r.status === 1 && /F17 is not merged/.test(r.out), r.out);
  r = tool('pulse-progress', 'claim', 'S-auth', '--owner', 'agent-7', '--slot', '2', '--force');
  const c = live().packages['S-auth'];
  check('claim assigns owner, slot, worktree, port and branch', r.status === 0 && c.status === 'claimed' && c.owner === 'agent-7' && c.slot === 2 && c.port === 5182 && c.worktree.endsWith('-wt/slot-2') && c.branch === 'pulse/S-auth', r.out);
  r = tool('pulse-progress', 'claim', 'S-settings', '--owner', 'agent-8', '--slot', '2', '--force');
  check('claim refuses a slot whose package is not merged', r.status === 1 && /slot 2 holds S-auth/.test(r.out), r.out);

  r = tool('pulse-progress', 'mark', 'S-home', 'merged', '--commit', 'deadbee', '--frame', 'home-3=matched');
  check('mark sets a status, a commit and a frame verdict', r.status === 0 && live().packages['S-home'].status === 'merged' && live().packages['S-home'].commit === 'deadbee' && live().packages['S-home'].frames['home-3'] === 'matched', r.out);
  tool('pulse-progress', 'sync');
  check('a late heartbeat does not move an entry out of "merged"', live().packages['S-home'].status === 'merged');
  r = tool('pulse-progress', 'mark', 'F2:b', 'merged', '--commit', 'cafe123');
  check('mark addresses a lane stage', r.status === 0 && live().packages.F2.stages['F2:b'].status === 'merged' && live().packages.F2.stages['F2:b'].commit === 'cafe123', r.out);

  r = tool('pulse-progress', 'snapshot');
  const snap = JSON.parse(read('docs/pipeline/pulse/progress.json'));
  check('snapshot is the live file without the heartbeat', r.status === 0 && snap.integrator.heartbeat === undefined && live().integrator.heartbeat !== undefined && snap.packages['S-home'].status === 'merged', r.out);
  r = tool('pulse-progress', 'report');
  check('report names the three lists (fixture frames, pending-F15, URL only)', r.status === 0 && /Frames verified on a fixture \(9\)/.test(r.out) && /pending-F15\) \(7\)/.test(r.out) && /URL only \(Q5\) \(5\): S-compose-hub/.test(r.out), r.out);
  g('checkout', '-q', '--', 'docs/pipeline/pulse/progress.json');
  fs.rmSync(`${REPO}/.pulse`, { recursive: true, force: true });
  dropBranches('pulse-int');
}

/* ── pulse-ledger ─────────────────────────────────────────────────────────────────────────────── */

if (wants('ledger') && present('pulse-ledger')) {
  section = 'ledger';
  console.log('\npulse-ledger');
  branch('pulse/S-auth');
  let r = tool('pulse-ledger', 'S-auth', '--strict');
  check('an untouched package has an empty ledger', r.status === 0 && /empty — nothing counted was lost/.test(r.out), r.out);
  const file = 'frontend/src/features/auth/AuthPage.tsx';
  const src = read(file);
  const hook = /\b(use[A-Z]\w*)\(/.exec(src)[1];
  const lines = src.split('\n');
  const ariaLine = lines.findIndex((l) => /aria-[a-z]+=/.test(l));
  const aria = /(aria-[a-z]+)=/.exec(lines[ariaLine])[1];
  lines[ariaLine] = lines[ariaLine].replace(/aria-[a-z]+=/, 'data-was=');
  write(file, lines.join('\n').replace(new RegExp(`\\b${hook}\\(`), `removedHook(`));
  r = tool('pulse-ledger', 'S-auth', '--by-file');
  check(`a removed hook call (${hook}) and a removed ${aria} are printed, from the working tree`, r.status === 0 && r.out.includes(`hook     ${hook}`) && r.out.includes(`aria     ${aria}`) && /line\(s\) to explain/.test(r.out), r.out);
  commit('selftest: a hook and an aria attribute removed', file);
  r = tool('pulse-ledger', 'S-auth', '--ref', 'pulse/S-auth', '--strict', '--json');
  check('the same from a commit (--ref), and --strict exits 1', r.status === 1 && JSON.parse(r.out).missing.some((m) => m.kind === 'hook' && m.what === hook), r.out);
  dropBranches('pulse/S-auth');
}

/* ── pulse-i18n ───────────────────────────────────────────────────────────────────────────────── */

if (wants('i18n') && present('pulse-i18n')) {
  section = 'i18n';
  console.log('\npulse-i18n');
  const base = g('rev-parse', '--short', 'pulse-redesign');
  const PATCH = 'docs/pipeline/pulse/pkg/S-coins/i18n.patch.json';
  const PAGE = 'frontend/src/features/coins/CoinsPage.tsx';
  const patchOf = (extra) => ({ package: 'S-coins', base, namespaces: ['coins', 'achievement'], set: [], change: [], remove: [], copyQuestions: [], ...extra });
  const commitPatch = (doc, ...more) => {
    writeJson(PATCH, doc);
    commit('selftest: i18n patch', PATCH, ...more);
  };
  const reader = (key) => `\nexport const selftestReader_${key.replace(/\W/g, '_')} = (t: (k: string) => string) => t('${key}');\n`;
  const good = { key: 'achievement.pulse.selftest', hu: 'Öntesztelő', en: 'Self-tester', de: 'Selbsttester', copy: 'proposed', visible: true, source: 'selftest' };

  branch('pulse/S-coins');
  commitPatch(patchOf({}));
  const shaBefore = BUNDLES.map(sha).join();
  let r = tool('pulse-i18n', 'apply', 'S-coins');
  check('an empty patch leaves the three bundles byte-identical (git status clean)', r.status === 0 && status() === '' && BUNDLES.map(sha).join() === shaBefore, r.out + status());

  if (!realExports && !doublesPlanted) {
    commitPatch(patchOf({ set: [good] }));
    r = tool('pulse-i18n', 'check', 'S-coins');
    check('without the gate export a patch that needs the scan is BLOCKED (exit 3), not guessed', r.status === 3 && /BLOCKED rules \(a\) and \(b\) need the consumer scan/.test(r.out), r.out);
    dropBranches('pulse/S-coins');
    plantScanDoubles();
    branch('pulse/S-coins');
  }

  // A good patch: a flat achievement.* key, an untranslated unit and a non-visible proposed label.
  write(PAGE, read(PAGE) + reader('achievement.pulse.selftest') + reader('coins.selftestUnit'));
  commitPatch(
    patchOf({
      set: [
        good,
        { key: 'coins.selftestUnit', hu: 'db', en: 'pcs', de: 'db', copy: 'existing-literal', source: 'selftest', untranslated: { reason: 'selftest unit' } },
      ],
      copyQuestions: [{ where: 'heading over the selftest', frame: 'coins-1', note: 'no string is drawn; left out' }],
    }),
    PAGE,
  );
  r = tool('pulse-i18n', 'check');
  check('check accepts a good patch (id read from the branch name; the gate dry run is green)', r.status === 0 && /gate dry run on pulse\/S-coins with the patch applied: check-i18n: OK/.test(r.out), r.out);
  const crlfBefore = BUNDLES.map((f) => read(f).includes('\r\n'));
  const orderBefore = Object.fromEntries(['hu', 'en', 'de'].map((l) => [l, flat(bundle(l))]));
  const pre = [...BUNDLES, 'frontend/scripts/data/i18n-untranslated.json'].map(sha).join();
  r = tool('pulse-i18n', 'apply', 'S-coins');
  const after = Object.fromEntries(['hu', 'en', 'de'].map((l) => [l, bundle(l)]));
  check('apply writes the three bundles', r.status === 0 && after.hu.coins.selftestUnit === 'db' && after.en.coins.selftestUnit === 'pcs', r.out);
  check('a flat dotted top-level key stays flat, in all three', ['hu', 'en', 'de'].every((l) => typeof after[l]['achievement.pulse.selftest'] === 'string' && after[l].achievement === undefined));
  check('… and joins its family (right after achievement.nutrition.logged.7)', ['hu', 'en', 'de'].every((l) => Object.keys(after[l])[Object.keys(after[l]).indexOf('achievement.nutrition.logged.7') + 1] === 'achievement.pulse.selftest'));
  check('line endings are preserved', JSON.stringify(BUNDLES.map((f) => read(f).includes('\r\n'))) === JSON.stringify(crlfBefore) && BUNDLES.every((f) => !/[^\r]\n/.test(read(f)) || !read(f).includes('\r\n')));
  check('key order: the existing keys keep their order, the new ones sit at the same place in the three files',
    ['hu', 'en', 'de'].every((l) => JSON.stringify(flat(after[l]).filter((k) => orderBefore[l].includes(k))) === JSON.stringify(orderBefore[l])) &&
      ['en', 'de'].every((l) => ['achievement.pulse.selftest', 'coins.selftestUnit'].every((k) => flat(after[l])[flat(after[l]).indexOf(k) - 1] === flat(after.hu)[flat(after.hu).indexOf(k) - 1])));
  // Two new keys per bundle; a key appended at the end of an object also gives its predecessor a comma.
  const net = (f) => g('diff', '--numstat', '--', f).split('\t').slice(0, 2).map(Number);
  check('the diff is the new keys and nothing else (net +2 lines per bundle, at most one comma line rewritten)', BUNDLES.every((f) => net(f)[0] - net(f)[1] === 2 && net(f)[1] <= 1), g('diff', '--numstat'));
  check('the untranslated entry is written to scripts/data/i18n-untranslated.json', JSON.parse(read('frontend/scripts/data/i18n-untranslated.json')).entries['coins.selftestUnit'] === 'selftest unit');
  r = run(process.execPath, ['scripts/check-i18n.mjs'], { cwd: FRONT });
  check('check:i18n is green on the applied working tree', r.status === 0, r.stdout + r.stderr);
  r = tool('pulse-i18n', 'apply', 'S-coins');
  check('apply twice is a no-op', r.status === 0 && /already applied/.test(r.out), r.out);
  r = tool('pulse-i18n', 'revert');
  check('revert leaves the bundles and the list byte-identical (git status clean)', r.status === 0 && status() === '' && [...BUNDLES, 'frontend/scripts/data/i18n-untranslated.json'].map(sha).join() === pre, r.out + status());

  // The integrator's apply: the two owner lists grow.
  r = tool('pulse-i18n', 'apply', 'S-coins', '--merge');
  check('apply --merge appends the proposed string to copy-to-approve.md and the copy question to deviations.md',
    r.status === 0 && /\| `achievement\.pulse\.selftest` \| Öntesztelő \| Self-tester \| Selbsttester \| yes \| S-coins \| selftest \| \[ \] \|/.test(read('docs/pipeline/pulse/copy-to-approve.md')) &&
      /## DEV-\d{3} — S-coins: heading over the selftest/.test(read('docs/pipeline/pulse/deviations.md')), r.out);
  g('checkout', '-q', '--', '.');

  // Planted bad patches — each must be refused, in words.
  const refuse = (label, doc, pattern, more = []) => {
    commitPatch(doc, ...more);
    const x = tool('pulse-i18n', 'check', 'S-coins');
    check(label, x.status === 1 && pattern.test(x.out), x.out);
  };
  refuse('refuses a set with no de string', patchOf({ set: [{ ...good, de: undefined }] }), /no de string — every "set" carries hu, en and de/);
  refuse('refuses a duplicate key', patchOf({ set: [good, { ...good }] }), /duplicate key achievement\.pulse\.selftest/);
  refuse('refuses an en = de pair that carries an exemption (FORBIDDEN)', patchOf({ set: [{ ...good, en: 'Coach', de: 'Coach', untranslated: { reason: 'same word' } }] }), /"untranslated" is FORBIDDEN/);
  refuse('refuses hu = en without an exemption (REQUIRED)', patchOf({ set: [{ ...good, en: good.hu }] }), /"untranslated": \{ "reason" \} is REQUIRED/);
  refuse('refuses a key outside the package\'s namespaces', patchOf({ namespaces: ['coins', 'home'], set: [{ ...good, key: 'home.selftest' }] }), /namespace "home": S-coins may add keys in coins, achievement only/);
  refuse('refuses a proposed string that does not say whether it is visible', patchOf({ set: [{ ...good, visible: undefined }] }), /says whether it is "visible"/);
  refuse('refuses a set of a key that exists', patchOf({ set: [{ ...good, key: 'coins.title' }] }), /coins\.title already exists — use "change"/);
  refuse('refuses a change whose "from" is stale', patchOf({ change: [{ key: 'coins.title', hu: { from: 'nem ez', to: 'Valami' }, en: null, de: null, copy: 'fix', source: 'selftest' }] }), /the patch is stale/);
  refuse('refuses different placeholders (the gate says so, in the dry run)', patchOf({ set: [{ ...good, hu: 'Öntesztelő {{count}}', en: 'Self-tester {{n}}', de: 'Selbsttester {{count}}' }] }), /check-i18n is RED[\s\S]*placeholders differ at "achievement\.pulse\.selftest"/);
  g('checkout', '-q', 'pulse-redesign', '--', PAGE);
  refuse('refuses a new key nothing reads (the gate calls it dead)', patchOf({ set: [{ ...good, key: 'coins.selftestDead' }] }), /check-i18n is RED[\s\S]*coins\.selftestDead is in every bundle and referenced by no code/, [PAGE]);

  // (a), second half: the reader of a new key must be a file the package owns.
  const HOME_PAGE = 'frontend/src/features/home/HomePage.tsx';
  write(HOME_PAGE, read(HOME_PAGE) + reader('coins.selftestForeign'));
  refuse('refuses a new key whose only reader is another package\'s file', patchOf({ set: [{ ...good, key: 'coins.selftestForeign' }] }), /coins\.selftestForeign: read by frontend\/src\/features\/home\/HomePage\.tsx — none is a file S-coins owns \(rule a\)/, [HOME_PAGE]);
  g('checkout', '-q', 'pulse-redesign', '--', HOME_PAGE);
  commit('selftest: the foreign reader is gone again', HOME_PAGE);

  // (b): change / remove by consumers, over every branch tip.
  const src =fs.readdirSync(`${FRONT}/src`, { recursive: true }).map(String).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => [f.split(path.sep).join('/'), fs.readFileSync(`${FRONT}/src/${f}`, 'utf8')]);
  const readersOf = (k) => src.filter(([, text]) => text.includes(`'${k}'`)).map(([f]) => f);
  const coinsKeys = flat(bundle('hu').coins, 'coins.');
  const mine = coinsKeys.find((k) => JSON.stringify(readersOf(k)) === JSON.stringify(['features/coins/CoinsPage.tsx']) && read(PAGE).split(`t('${k}')`).length === 2);
  const foreign = flat(bundle('hu').home, 'home.').find((k) => readersOf(k).length === 1 && readersOf(k)[0].startsWith('features/home/'));
  refuse(`refuses the removal of a key another package's file reads (${foreign})`, patchOf({ remove: [{ key: foreign, reason: 'selftest' }] }), new RegExp(`${foreign.replace(/\./g, '\\.')}: also read by frontend/src/features/home/\\S+ \\(S-home\\) on .*pulse-redesign.*rule b`));
  write(PAGE, read(PAGE).replace(`t('${mine}')`, 'String(0)'));
  commitPatch(patchOf({ remove: [{ key: mine, reason: 'its only reader, CoinsPage.tsx, stops reading it' }] }), PAGE);
  r = tool('pulse-i18n', 'check', 'S-coins');
  check(`accepts the removal of a key only an owned file reads (${mine})`, r.status === 0, r.out);
  branch('pulse/S-home');
  const HOME = 'frontend/src/features/home/HomePage.tsx';
  write(HOME, read(HOME) + reader(mine));
  commit('selftest: a new reader of the key on another branch', HOME);
  g('switch', '-q', 'pulse/S-coins');
  r = tool('pulse-i18n', 'check', 'S-coins');
  check('refuses that removal once a NEW reader appears on another branch tip (the race)', r.status === 1 && new RegExp(`also read by ${HOME} \\(S-home\\) on pulse/S-home`).test(r.out), r.out);
  r = tool('pulse-i18n', 'apply', 'S-coins');
  check('… and apply re-validates it: nothing is written', r.status === 1 && status() === '', r.out + status());
  dropBranches('pulse/S-home');

  // (e): one pending patch per key.
  branch('pulse/S-progress');
  writeJson('docs/pipeline/pulse/pkg/S-progress/i18n.patch.json', { package: 'S-progress', base, namespaces: ['progress'], set: [], change: [], remove: [{ key: mine, reason: 'selftest clash' }], copyQuestions: [] });
  commit('selftest: a pending patch on another branch touches the same key', 'docs/pipeline/pulse/pkg/S-progress/i18n.patch.json');
  g('switch', '-q', 'pulse/S-coins');
  r = tool('pulse-i18n', 'check', 'S-coins');
  check('refuses a key that a patch pending on another branch also touches', r.status === 1 && /also touched by docs\/pipeline\/pulse\/pkg\/S-progress\/i18n\.patch\.json on pulse\/S-progress/.test(r.out), r.out);
  dropBranches('pulse/S-progress', 'pulse/S-coins');

  // A change, and the plan's own removal: S-admin deletes AdminMetrics.tsx and its keys — one of
  // them exempted (adminMetrics.clock.utc), whose entry must leave the list with it.
  branch('pulse/S-admin');
  const METRICS = 'frontend/src/features/admin/AdminMetrics.tsx';
  const LIST = 'frontend/scripts/data/i18n-untranslated.json';
  const metricKeys = flat(bundle('hu').adminMetrics ?? {}, 'adminMetrics.');
  const roleKey = 'adminUsers.role.admin';
  if (metricKeys.length && fs.existsSync(`${REPO}/${METRICS}`) && JSON.parse(read(LIST)).entries['adminMetrics.clock.utc']) {
    g('rm', '-q', METRICS);
    writeJson('docs/pipeline/pulse/pkg/S-admin/i18n.patch.json', { package: 'S-admin', base, namespaces: ['admin', 'adminUsers'], remove: metricKeys.map((key) => ({ key, reason: 'its only reader, AdminMetrics.tsx, is deleted by this package' })) });
    // `git rm` staged the deletion already; the commit takes it together with the patch file.
    commit('selftest: S-admin deletes AdminMetrics.tsx and its keys', 'docs/pipeline/pulse/pkg/S-admin/i18n.patch.json');
    const preAdmin = [...BUNDLES, LIST].map(sha).join();
    r = tool('pulse-i18n', 'apply', 'S-admin');
    check(`removes the ${metricKeys.length} keys of a deleted file, the emptied namespace with them, and drops the exempted key's entry from the untranslated list`,
      r.status === 0 && ['hu', 'en', 'de'].every((l) => bundle(l).adminMetrics === undefined) && JSON.parse(read(LIST)).entries['adminMetrics.clock.utc'] === undefined && JSON.parse(read(LIST)).entries[roleKey] !== undefined, r.out);
    r = run(process.execPath, ['scripts/check-i18n.mjs'], { cwd: FRONT });
    check('… and check:i18n is green on the result', r.status === 0, r.stdout + r.stderr);
    r = tool('pulse-i18n', 'revert');
    check('… and revert restores every byte', r.status === 0 && status() === '' && [...BUNDLES, LIST].map(sha).join() === preAdmin, r.out + status());
  } else check('the tree still has AdminMetrics.tsx, its keys and the adminMetrics.clock.utc exemption (the planned S-admin removal)', false, `${metricKeys.length} keys`);
  dropBranches('pulse/S-admin');

  // A lane id is accepted as well as a package id.
  branch('pulse/F8');
  const KIT = 'frontend/src/ui/primitives/Toggle.tsx';
  write(KIT, read(KIT) + reader('common.selftestLane'));
  writeJson('docs/pipeline/pulse/pkg/F8/i18n.patch.json', { package: 'F8', base, namespaces: ['common'], set: [{ key: 'common.selftestLane', hu: 'Sáv', en: 'Lane', de: 'Spur', copy: 'proposed', visible: false, source: 'selftest' }] });
  commit('selftest: a lane patch', 'docs/pipeline/pulse/pkg/F8/i18n.patch.json', KIT);
  r = tool('pulse-i18n', 'check', 'F8:2');
  check('accepts a lane (stage) id as well as a package id', r.status === 0 && /pulse-i18n check: OK/.test(r.out), r.out);
  dropBranches('pulse/F8');
}

/* ── pulse-variants ───────────────────────────────────────────────────────────────────────────── */

if (wants('variants') && present('pulse-variants')) {
  section = 'variants';
  console.log('\npulse-variants');
  const DELTA = 'docs/pipeline/pulse/pkg/S-workout/variants.json';
  const ROW = 'frontend/src/features/workout/SetRow.tsx';
  const CATALOG = 'frontend/src/ui/feedback/catalog.ts';
  const DORMANT = 'frontend/scripts/data/elements-dormant.json';
  const e21 = { element: 'E21', live: false, reason: 'one Pulse look; tap, as the database serves' };
  const commitDelta = (doc, ...more) => {
    writeJson(DELTA, doc);
    commit('selftest: variants delta', DELTA, ...more);
  };
  const stopReading = (file, element) => write(file, read(file).replace(new RegExp(`useElementVariant\\(\\s*'${element}'\\s*\\)`), "('A' as const)"));

  branch('pulse/S-workout');
  stopReading(ROW, 'E21');
  commitDelta([e21], ROW);
  let r;
  if (!realExports && !doublesPlanted) {
    r = tool('pulse-variants', 'check', 'S-workout');
    check('without the gate export a delta is BLOCKED (exit 3), not guessed', r.status === 3 && /BLOCKED the ownership of the read \(R11\) needs the reader scan/.test(r.out), r.out);
    dropBranches('pulse/S-workout');
    plantScanDoubles();
    branch('pulse/S-workout');
    stopReading(ROW, 'E21');
    commitDelta([e21], ROW);
  }
  r = tool('pulse-variants', 'check');
  check('check accepts a delta whose read was in an owned file and is gone (the gate dry run is green)', r.status === 0 && /gate dry run on pulse\/S-workout with the delta applied: check-element-roster/.test(r.out), r.out);
  const pre = [CATALOG, DORMANT].map(sha).join();
  r = tool('pulse-variants', 'apply', 'S-workout');
  check('apply flips exactly one line of catalog.ts', r.status === 0 && g('diff', '--numstat', '--', CATALOG).startsWith('1\t1\t') && /id: 'E21',[^\n]*live: false/.test(read(CATALOG)), r.out + g('diff', '--numstat'));
  check('… and writes the reason to scripts/data/elements-dormant.json', JSON.parse(read(DORMANT)).entries.E21 === e21.reason);
  r = run(process.execPath, ['scripts/check-element-roster.mjs'], { cwd: FRONT });
  check('check:elements is green on the applied working tree', r.status === 0, r.stdout + r.stderr);
  r = tool('pulse-variants', 'revert');
  check('revert leaves catalog.ts and the dormant list byte-identical (git status clean)', r.status === 0 && status() === '' && [CATALOG, DORMANT].map(sha).join() === pre, r.out + status());

  const refuse = (label, doc, pattern, id = 'S-workout') => {
    commitDelta(doc);
    const x = tool('pulse-variants', 'check', id);
    check(label, x.status === 1 && pattern.test(x.out), x.out);
  };
  refuse('refuses an element that belongs to another package', [{ ...e21, element: 'E25' }], /E25: not one of S-workout's variant elements \(E21, E22\) — it belongs to S-coins \(R11\)/);
  refuse('refuses "live": true and a missing reason', [{ element: 'E21', live: true }], /"live" must be false[\s\S]*"reason" is missing/);
  refuse('refuses a delta whose read is still there (the gate says so, in the dry run)', [e21, { element: 'E22', live: false, reason: 'selftest' }], /check-element-roster is RED[\s\S]*E22/);

  // R11: the read must be in a file the unit owns. Plant a declaration that says otherwise.
  const WP = 'docs/pipeline/pulse/work-packages.json';
  const doc = wp();
  doc.screens.find((p) => p.id === 'S-workout').variantElements.push('E11');
  doc.foundation.find((p) => p.id === 'F11').variantElements = [];
  write(WP, JSON.stringify(doc, null, 2));
  commitDelta([{ element: 'E11', live: false, reason: 'selftest' }]);
  r = tool('pulse-variants', 'check', 'S-workout');
  check('refuses a delta whose useElementVariant read is not in a file the package owns', r.status === 1 && /E11: its useElementVariant read is in frontend\/src\/ui\/nav\/BottomNav\.tsx \(F11\) — not a file S-workout owns \(R11\)/.test(r.out), r.out);
  g('checkout', '-q', '--', WP);
  dropBranches('pulse/S-workout');

  // A lane id, and the one written exception: F2, whose gate RULE changes.
  branch('pulse/F2b');
  writeJson('docs/pipeline/pulse/pkg/F2/b/variants.json', [{ element: 'E1', live: false, reason: 'playground only' }]);
  commit('selftest: the lane delta of F2:b', 'docs/pipeline/pulse/pkg/F2/b/variants.json');
  r = tool('pulse-variants', 'check', 'F2:b');
  const waived = /E1: read in frontend\/src\/ui\/feedback\/variants\/E1Button\.tsx — not F2's files; accepted because the gate calls the element playground-only/.test(r.out);
  check('accepts a lane-stage id and reads its hand-in from pkg/F2/b/', /pulse-variants check F2:b @ pulse\/F2b: E1/.test(r.out), r.out);
  if (/id: 'E1',[\s\S]{0,80}?live: false/.test(read(CATALOG))) {
    // --with pulse/F2b: the lane's real delta is on the published line of the clone already.
    check('a delta for an element that is not live any more is refused as stale', r.status === 1 && /E1 is not live any more — the delta is stale/.test(r.out), r.out);
  } else {
    check('the F2 exception (variantNote + playground-only by the gate) passes the ownership rule; the gate dry run then decides',
      waived && !/\(R11\)\n/.test(r.out) && (r.status === 0 || /check-element-roster is RED/.test(r.out)), r.out);
  }
  dropBranches('pulse/F2b');
}

/* ── pulse-fixture-check ──────────────────────────────────────────────────────────────────────── */

if (wants('fixture') && present('pulse-fixture-check')) {
  section = 'fixture';
  console.log('\npulse-fixture-check');
  // The freeze does not exist yet (F3:D), so the recording store here is planted, in the shape the
  // tool documents: one JSON entry per response under .pulse/rec/<account>/.
  const rec = (account, name, entry) => writeJson(`.pulse/rec/${account}/${name}.json`, { recordedAt: '2026-10-12T16:04:11Z', ...entry });
  rec('M', 'today', { method: 'GET', path: '/api/v1/my-plans/today', status: 200, body: { source: 'plan', session: { id: 41, status: 'in_progress', title: 'Felsőtest A', sets: [{ id: 1, reps: 8, weight: 62.5, done: true }], note: 'könnyű nap' } } });
  rec('N', 'today', { method: 'GET', path: '/api/v1/my-plans/today', query: '?tz=1', status: 200, body: { source: 'freestyle', session: { id: 57, status: 'planned', title: 'Szabad edzés', sets: [] } } });
  rec('C', 'client', { method: 'GET', path: '/api/v1/clients/17', status: 200, body: { id: 17, name: 'Kovács Eszter', days: { '2026-10-12': { kcal: 1800 } } } });
  rec('M', 'not-found', { method: 'GET', path: '/api/v1/posts/abc123def456', status: 404, body: { error: 'Not found', code: 'not_found', requestId: 'r-1' } });
  write('.pulse/rec/M/cover.json', '{ "method": "GET", "path": "/api/v1/media/9", "status": 200, "body": "\\u0089PNG not json" }');

  const STATES = 'docs/pipeline/pulse/pkg/S-home/states.json';
  const today = (edits) => ({ method: 'GET', path: '/api/v1/my-plans/today', edits });
  const state = (...fixtures) => ({ package: 'S-home', states: [{ key: 'home-rest-day', account: 'M', route: '/', arrived: { role: 'heading', name: 'Ma' }, fixtures }] });
  branch('pulse/S-home');
  let r = tool('pulse-fixture-check', 'S-home');
  check('a package with no states file passes with 0 fixtures', r.status === 0 && /0 fixture\(s\)/.test(r.out), r.out);

  writeJson(STATES, state(
    today([{ pointer: '/session/status', value: 'planned' }, { pointer: '/session/title', value: 'Lábnap' }, { pointer: '/session/sets/0/reps', value: 12 }, { pointer: '/session/note', remove: true }, { pointer: '/session/sets/-', value: { id: 2, reps: 6, weight: 80, done: false } }]),
    { method: 'GET', path: '/api/v1/clients/99', edits: [{ pointer: '/days/2026-10-13', value: { kcal: 2100 } }] },
    { method: 'POST', path: '/api/v1/sets/7/check', status: 409, body: { error: 'Már rögzítve', code: 'conflict' } },
    { method: 'POST', path: '/api/v1/notifications/read', status: 204 },
  ));
  r = tool('pulse-fixture-check', 'S-home');
  check('accepts edits inside what the recordings show (a recorded enum word, free text, an optional key removed, a list element, another id and date of the same endpoint, an error envelope, a status-only stub)', r.status === 0 && /OK — 4 fixture\(s\).*held against 4 recorded/.test(r.out), r.out);

  const refuse = (label, fixtures, pattern) => {
    writeJson(STATES, state(...fixtures));
    const x = tool('pulse-fixture-check', 'S-home');
    check(label, x.status === 1 && pattern.test(x.out), x.out);
  };
  refuse('refuses a key no recording of the endpoint has', [today([{ pointer: '/session/coachPhoto', value: 'x.png' }])], /key: \/session\/coachPhoto — no recording of this endpoint has it/);
  refuse('refuses an unknown key inside a value', [today([{ pointer: '/session/sets/0', value: { id: 3, reps: 5, rpe: 9 } }])], /key: \/session\/sets\/0\/rpe — no recording/);
  refuse('refuses a type that was never seen', [today([{ pointer: '/session/sets/0/reps', value: '8-10' }])], /type: \/session\/sets\/0\/reps is string "8-10", the recordings have number/);
  refuse('refuses an enum value no recording has', [today([{ pointer: '/session/status', value: 'finished' }])], /enum: \/session\/status = "finished" — the recordings only ever have "in_progress", "planned"/);
  refuse('refuses the removal of a key every recording has', [today([{ pointer: '/session/status', remove: true }])], /remove: \/session\/status — every recording of this endpoint has it/);
  refuse('refuses an edit of an endpoint that was never recorded', [{ method: 'GET', path: '/api/v1/coins/balance', edits: [{ pointer: '/balance', value: 5 }] }], /no recording of this endpoint: a fixture is an edit of a recorded response \(R26\)/);
  refuse('refuses a free-hand body for an unrecorded endpoint', [{ method: 'POST', path: '/api/v1/codes', status: 200, body: { code: 'ABC-123' } }], /a free-hand body for an endpoint that was never recorded cannot be checked/);
  refuse('refuses an error outcome that leaves the error envelope', [{ method: 'POST', path: '/api/v1/codes', status: 500, body: { error: 'x', stack: 'at …' } }], /key: stack — not part of the API's error envelope/);

  writeJson(STATES, state(today([{ pointer: '/session/status', value: 'finished' }])));
  commit('selftest: a states file with a bad fixture', STATES);
  r = tool('pulse-fixture-check', 'S-home', '--ref', 'pulse/S-home', '--json');
  check('reads the committed states file with --ref, and --json', r.status === 1 && JSON.parse(r.out).problems.length === 1, r.out);
  r = tool('pulse-fixture-check', '--all');
  check('--all finds the package states files', r.status === 1 && /pkg\/S-home\/states\.json/.test(r.out), r.out);
  r = tool('pulse-fixture-check', 'S-home', '--rec', `${TMP}/no-such-store`);
  check('fails closed when there is no recording store to hold a fixture against', r.status === 1 && /holds no recording — 1 fixture\(s\) cannot be checked/.test(r.out), r.out);
  fs.rmSync(`${REPO}/.pulse`, { recursive: true, force: true });
  dropBranches('pulse/S-home');
}

/* ── pulse-sync ───────────────────────────────────────────────────────────────────────────────── */

/** The integrator's side of a scenario: a second worktree of the clone, on the published line. */
const INT = `${TMP.split(path.sep).join('/')}/int`;
const gi = (...args) => {
  const r = run('git', args, { cwd: INT });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} (int) failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
};
const intCommit = (message, edits) => {
  for (const [rel, fn] of Object.entries(edits)) fs.writeFileSync(`${INT}/${rel}`, fn(fs.readFileSync(`${INT}/${rel}`, 'utf8')));
  gi('add', '--', ...Object.keys(edits));
  gi('commit', '-q', '-m', `${message}\n\n${CO}`);
};
const editJson = (fn) => (text) => {
  const doc = JSON.parse(text);
  fn(doc);
  return `${JSON.stringify(doc, null, 2)}\n`.replace(/\n/g, text.includes('\r\n') ? '\r\n' : '\n');
};
const ensureDoubles = () => {
  if (realExports || doublesPlanted) return;
  g('switch', '-q', 'pulse-redesign');
  plantScanDoubles();
};

if (wants('sync') && present('pulse-sync')) {
  section = 'sync';
  console.log('\npulse-sync');
  ensureDoubles();
  const base = g('rev-parse', '--short', 'pulse-redesign');
  const PATCH = 'docs/pipeline/pulse/pkg/S-coins/i18n.patch.json';
  const PAGE = 'frontend/src/features/coins/CoinsPage.tsx';
  const HU = 'frontend/src/i18n/hu.json';
  const STATUS = '.pulse/status/S-coins.json';
  let r = tool('pulse-sync', 'no-such-package');
  check('usage error on an unknown id', r.status === 2, r.out);

  branch('pulse/S-coins');
  write(PAGE, `${read(PAGE)}\nexport const selftestSync = (t: (k: string) => string) => t('coins.selftestSync');\n`);
  writeJson(PATCH, { package: 'S-coins', base, namespaces: ['coins'], set: [{ key: 'coins.selftestSync', hu: 'Szinkron', en: 'Sync', de: 'Synchron', copy: 'proposed', visible: false, source: 'selftest' }] });
  commit('selftest: package work and its i18n patch', PAGE, PATCH);
  g('worktree', 'add', '-q', INT, 'pulse-redesign');

  // dead locks: an old heavy lock, a capture lock whose process is gone — and a fresh one that must stay
  for (const n of ['heavy-1', 'heavy-2']) {
    fs.mkdirSync(`${REPO}/.pulse/locks/${n}`, { recursive: true });
    fs.writeFileSync(`${REPO}/.pulse/locks/${n}/owner`, 'S-other\n');
  }
  const old = new Date(Date.now() - 31 * 60 * 1000);
  fs.utimesSync(`${REPO}/.pulse/locks/heavy-1`, old, old);
  writeJson('.pulse/locks/slot-1.json', { pid: 999999, package: 'S-other', port: 5181, heartbeat: old.toISOString() });

  r = tool('pulse-sync', 'S-coins', '--no-install');
  check('the first sync applies the committed hand-in file in the slot — working tree only, nothing staged',
    r.status === 0 && bundle('hu').coins.selftestSync === 'Szinkron' && g('diff', '--cached', '--name-only') === '' && /i18n\.patch\.json: applied/.test(r.out), r.out);
  check('it clears a dead heavy lock and a dead capture lock, and leaves a live one',
    !fs.existsSync(`${REPO}/.pulse/locks/heavy-1`) && !fs.existsSync(`${REPO}/.pulse/locks/slot-1.json`) && fs.existsSync(`${REPO}/.pulse/locks/heavy-2`) && /removed the dead lock heavy-1/.test(r.out), r.out);
  fs.rmSync(`${REPO}/.pulse/locks`, { recursive: true, force: true });

  // The integrator moves the published line in a file the slot has patched locally.
  intCommit('selftest(int): a bundle changes on the published line', { [HU]: editJson((d) => (d.coins.title = `${d.coins.title} (teszt)`)) });
  const plain = gTry('merge', '--no-edit', 'pulse-redesign');
  check('a plain `git merge pulse-redesign` into the slot with an applied patch FAILS', plain.status !== 0 && /would be overwritten by merge/.test(plain.stderr + plain.stdout), plain.stderr + plain.stdout);
  r = tool('pulse-sync', 'S-coins', '--no-install');
  check('the same merge SUCCEEDS through pulse-sync',
    r.status === 0 && gTry('merge-base', '--is-ancestor', 'pulse-redesign', 'HEAD').status === 0 && /merged pulse-redesign: 1 commit/.test(r.out), r.out);
  check('… the slot then holds the new base AND its patch, applied on top (only the three bundles are modified, unstaged)',
    bundle('hu').coins.title.endsWith('(teszt)') && bundle('hu').coins.selftestSync === 'Szinkron' && status().split('\n').map((l) => l.trim()).join() === BUNDLES.map((f) => `M ${f}`).sort().join(), status());
  check('the merge commit ends with the co-author line', g('log', '-1', '--format=%B').trim().endsWith(CO));

  // A change in a path the package does not own stops the sync before anything is merged.
  const MAIN_TSX = 'frontend/src/main.tsx';
  write(MAIN_TSX, `${read(MAIN_TSX)}\n// a stray edit in the integrator's file\n`);
  intCommit('selftest(int): the published line moves again', { [HU]: editJson((d) => (d.coins.title = `${d.coins.title}!`)) });
  const headBefore = g('rev-parse', 'HEAD');
  r = tool('pulse-sync', 'S-coins', '--no-install');
  check('a dirty integrator path stops the sync before the merge, naming the path and its owner',
    r.status === 1 && /paths S-coins does not own — nothing was merged/.test(r.out) && /frontend\/src\/main\.tsx\s+\(the integrator\)/.test(r.out) && g('rev-parse', 'HEAD') === headBefore, r.out);
  check('… and writes status "blocked" for the package', JSON.parse(read(STATUS)).status === 'blocked' && /foreign changes/.test(JSON.parse(read(STATUS)).blockedOn));
  g('checkout', '-q', '--', MAIN_TSX);
  r = tool('pulse-sync', 'S-coins', '--no-install');
  check('once the stray edit is gone the sync goes through and the blocked status is lifted', r.status === 0 && JSON.parse(read(STATUS)).status === 'in_progress' && JSON.parse(read(STATUS)).blockedOn === undefined, r.out);

  // The published line gains the very key the patch sets: the hand-in file no longer applies.
  intCommit('selftest(int): the same key lands on the published line', Object.fromEntries(BUNDLES.map((f) => [f, editJson((d) => (d.coins.selftestSync = 'x'))])));
  r = tool('pulse-sync', 'S-coins', '--no-install');
  check('a hand-in file that no longer applies stops loudly with status "blocked", and the bundles are left clean',
    r.status === 1 && /i18n\.patch\.json no longer applies — re-cut it against pulse-redesign/.test(r.out) && /coins\.selftestSync already exists/.test(r.out) && status() === '' && JSON.parse(read(STATUS)).status === 'blocked', r.out + status());

  // A lane's shared.patch.
  branch('pulse/F9');
  const PKG = 'frontend/package.json';
  const SHARED = 'docs/pipeline/pulse/pkg/F9/shared.patch';
  const original = read(PKG);
  write(PKG, original.replace('"check:tokens": "node scripts/check-tokens.mjs",', '"check:tokens": "node scripts/check-tokens.mjs",\n    "check:selftest": "node scripts/check-selftest.mjs",'.replace(/\n/g, original.includes('\r\n') ? '\r\n' : '\n')));
  const diff = run('git', ['diff', '--', PKG], { cwd: REPO }).stdout;
  g('checkout', '-q', '--', PKG);
  write(SHARED, diff);
  commit('selftest: a lane shared.patch (a package.json script line)', SHARED);
  r = tool('pulse-sync', 'F9', '--no-install');
  check('a lane shared.patch is applied from the committed file — working tree only',
    r.status === 0 && /shared\.patch: applied \(frontend\/package\.json\)/.test(r.out) && read(PKG).includes('check:selftest') && g('diff', '--cached', '--name-only') === '' && status().trim() === `M ${PKG}`, r.out + status());
  const applied1 = sha(PKG);
  r = tool('pulse-sync', 'F9', '--no-install');
  check('syncing again undoes and re-applies it: the same bytes', r.status === 0 && /undid the local applies: frontend\/package\.json/.test(r.out) && sha(PKG) === applied1, r.out);
  intCommit('selftest(int): the line the patch leans on changes', { [PKG]: (t) => t.replace('"check:tokens": "node scripts/check-tokens.mjs",', '"check:tokens": "node scripts/check-tokens.mjs --strict",') });
  r = tool('pulse-sync', 'F9', '--no-install');
  check('a shared.patch that no longer applies stops with status "blocked"; package.json is left as merged',
    r.status === 1 && /shared\.patch no longer applies — re-cut it/.test(r.out) && status() === '' && read(PKG).includes('--strict') && JSON.parse(read('.pulse/status/F9.json')).status === 'blocked', r.out + status());
  write(SHARED, 'diff --git a/frontend/scripts/new-tool.mjs b/frontend/scripts/new-tool.mjs\nnew file mode 100644\nindex 0000000..e69de29\n');
  commit('selftest: a shared.patch that creates a file', SHARED);
  r = tool('pulse-sync', 'F9', '--no-install');
  check('a shared.patch that creates a file is refused (it may only modify existing files)', r.status === 1 && /shared\.patch creates frontend\/scripts\/new-tool\.mjs — it may only modify existing files/.test(r.out), r.out);

  // A conflict in an owned path: the integrator wrote a claimed file.
  branch('pulse/S-auth');
  const AUTH = 'frontend/src/features/auth/AuthPage.tsx';
  const firstLine = (tag) => (t) => t.replace(/^[^\n]*/, (l) => `${l.replace(/\r$/, '')} // ${tag}${l.endsWith('\r') ? '\r' : ''}`);
  write(AUTH, firstLine('package')(read(AUTH)));
  commit('selftest: the package edits its own file', AUTH);
  intCommit('selftest(int): the integrator edits the same line', { [AUTH]: firstLine('integrator') });
  r = tool('pulse-sync', 'S-auth', '--no-install');
  check('a conflict in an owned path aborts the merge and reports it — never resolved',
    r.status === 1 && /conflicts — the merge was aborted/.test(r.out) && /AuthPage\.tsx\s+\(owned by S-auth — the integrator wrote a claimed file\)/.test(r.out) && gTry('rev-parse', '-q', '--verify', 'MERGE_HEAD').status !== 0 && status() === '', r.out + status());

  // Re-use of a slot.
  r = tool('pulse-sync', 'S-library', '--no-install');
  check('a slot whose package is not merged is not re-used', r.status === 1 && /holds pulse\/S-auth, which is not merged/.test(r.out) && g('symbolic-ref', '--short', 'HEAD') === 'pulse/S-auth', r.out);
  branch('pulse/S-notifications');
  const NOTE = 'frontend/src/features/chat/NotificationsPage.tsx';
  write(NOTE, `${read(NOTE)}\n// selftest: the package's work\n`);
  commit('selftest: a finished package', NOTE);
  gi('merge', '-q', '--squash', 'pulse/S-notifications');
  gi('commit', '-q', '-m', `pulse(S-notifications): selftest squash\n\n${CO}`);
  r = tool('pulse-sync', 'S-library', '--no-install');
  check('after the squash merge the slot is re-used: a new branch from the published line',
    r.status === 0 && g('symbolic-ref', '--short', 'HEAD') === 'pulse/S-library' && g('rev-parse', 'HEAD') === g('rev-parse', 'pulse-redesign') && /switched the slot from pulse\/S-notifications to pulse\/S-library/.test(r.out), r.out);

  g('worktree', 'remove', '--force', INT);
  // The published line of the clone moved during this section; put it back for the sections after it.
  g('switch', '-q', '-C', 'pulse-redesign', baseTip);
  for (const b of ['pulse/S-coins', 'pulse/F9', 'pulse/S-auth', 'pulse/S-notifications', 'pulse/S-library']) gTry('branch', '-D', b);
  fs.rmSync(`${REPO}/.pulse`, { recursive: true, force: true });
}

/* ── pulse-merge-check ────────────────────────────────────────────────────────────────────────── */

if (wants('merge') && present('pulse-merge-check')) {
  section = 'merge';
  console.log('\npulse-merge-check');
  ensureDoubles();
  g('switch', '-q', 'pulse-redesign');
  // What the published line needs for these cases: a budget file, and — while F2:b / F2:c are not
  // in the tree — doubles of the gate prober's two flags and of the ratchet's counter.
  const realProber = fs.existsSync(`${FRONT}/scripts/verify-gates.mjs`);
  const realRatchet = fs.existsSync(`${FRONT}/scripts/check-pulse.mjs`);
  const ANCHORED = ['frontend/src/features/coaching/CoachDashboard.tsx', 'frontend/src/features/settings/SettingsPage.tsx', 'frontend/src/features/workout/WorkoutPlayer.tsx'];
  if (!realProber) {
    write('frontend/scripts/verify-gates.mjs',
      `// TEST DOUBLE planted by pkg/F4/selftest.mjs — the two flags pulse-merge-check and pulse-owns-check call.\nimport fs from 'node:fs';\n` +
        `if (process.argv.includes('--list-anchors')) { console.log(${JSON.stringify(ANCHORED)}.join('\\n')); process.exit(0); }\n` +
        `if (process.argv.includes('--fresh')) process.exit(fs.existsSync(new URL('../../.pulse/selftest-gates-green', import.meta.url)) ? 0 : 1);\n`);
  }
  if (!realRatchet) {
    write('frontend/scripts/check-pulse.mjs',
      `// TEST DOUBLE planted by pkg/F4/selftest.mjs — the per-file counter pulse-merge-check imports.\nexport function countRules(source) { return { surface: source.split('<Surface').length - 1 }; }\n`);
  }
  const HOME = 'frontend/src/features/home/HomePage.tsx';
  const BUDGET = 'docs/pipeline/pulse/pkg/S-home/budget.json';
  writeJson(BUDGET, { id: 'S-home', files: { [HOME]: { surface: 3, 'legacy-type': 10 } } });
  commit('selftest: budget, and doubles of the prober and the ratchet counter where the tree has none', 'frontend/scripts', BUDGET);
  writeJson('.pulse/rec/M/today.json', { method: 'GET', path: '/api/v1/my-plans/today', status: 200, body: { source: 'plan', session: { id: 41, status: 'in_progress' } } });
  writeJson('.pulse/rec/N/today.json', { method: 'GET', path: '/api/v1/my-plans/today', status: 200, body: { source: 'freestyle', session: { id: 57, status: 'planned' } } });

  const base = g('rev-parse', '--short', 'pulse-redesign');
  /** A branch with one commit of the given edits, then back to the clean published line. */
  const make = (name, edits) => {
    branch(name);
    for (const [rel, value] of Object.entries(edits)) write(rel, typeof value === 'function' ? value(read(rel)) : typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
    commit(`selftest: ${name}`, ...Object.keys(edits));
    g('switch', '-q', 'pulse-redesign');
  };
  const append = (text) => (t) => `${t}\n${text}\n`;
  const refuse = (label, id, edits, pattern, ...flags) => {
    make(`pulse/${id}`, edits);
    const x = tool('pulse-merge-check', id, ...flags);
    check(label, x.status === 1 && pattern.test(x.out), x.out);
    gTry('branch', '-D', `pulse/${id}`);
  };

  let r = tool('pulse-merge-check', 'no-such-package');
  check('usage error on an unknown id', r.status === 2, r.out);
  r = tool('pulse-merge-check', 'S-home');
  check('refuses a package whose branch does not exist', r.status === 1 && /pulse\/S-home does not exist/.test(r.out), r.out);

  make('pulse/S-home', {
    [HOME]: append('// selftest: the package rewrites its own page'),
    [BUDGET]: { id: 'S-home', files: { [HOME]: { surface: 2, 'legacy-type': 10 } } },
    'docs/pipeline/pulse/pkg/S-home/states.json': { states: [{ key: 'home-rest', fixtures: [{ method: 'GET', path: '/api/v1/my-plans/today', edits: [{ pointer: '/session/status', value: 'planned' }] }] }] },
  });
  r = tool('pulse-merge-check', 'S-home');
  check('lets a branch through that touches only its own files, lowers its budget and carries a fixture that holds',
    r.status === 0 && /all 3 touched path\(s\) are S-home's/.test(r.out) && /no budget is raised/.test(r.out) && /1 fixture\(s\) in .*states\.json hold/.test(r.out) && /pulse-merge-check: may merge/.test(r.out), r.out);
  r = tool('pulse-merge-check', 'S-home', '--json');
  check('--json carries the verdict for the integrator\'s loop', r.status === 0 && JSON.parse(r.out).problems.length === 0 && JSON.parse(r.out).files.length === 3, r.out);
  gTry('branch', '-D', 'pulse/S-home');

  refuse('refuses a branch that touches a bundle (src/i18n)', 'S-home', { [HOME]: append('// x'), 'frontend/src/i18n/hu.json': (t) => t.replace('"coins"', '"coins" ') }, /M frontend\/src\/i18n\/hu\.json — owned by F1, not S-home's/);
  refuse('refuses a branch that touches a frozen hook file', 'S-coins', { 'frontend/src/features/coins/useCoins.ts': append('// x') }, /useCoins\.ts — frozen for everybody, not S-coins's/);
  refuse('refuses a branch that touches another lane\'s file and a file of the integrator', 'S-home', { 'frontend/src/ui/primitives/control.ts': append('// x'), 'frontend/src/main.tsx': append('// x') }, /main\.tsx — the integrator's, not S-home's[\s\S]*control\.ts — owned by F6, not S-home's/);
  refuse('refuses a new file outside the package', 'S-home', { 'frontend/src/features/home/Extra.tsx': 'export const x = 1;\n' }, /A frontend\/src\/features\/home\/Extra\.tsx — owned by nobody/);
  refuse('refuses a raised budget', 'S-home', { [BUDGET]: { id: 'S-home', files: { [HOME]: { surface: 5, 'legacy-type': 10 } } } }, /budget\.json: \/files\/.*HomePage\.tsx\/surface raised 3 -> 5 — a budget may only go down/);
  refuse('refuses a budget file created on the branch', 'S-auth', { 'docs/pipeline/pulse/pkg/S-auth/budget.json': { id: 'S-auth', files: {} } }, /budget\.json is created on the branch — a budget is generated by the integrator/);
  if (!realRatchet) refuse('refuses a raised ratchet count (the gate\'s counter, imported)', 'S-home', { [HOME]: append('const boxed = () => <Surface />;') }, /HomePage\.tsx: surface raised \d+ -> \d+ — a ratchet count may only go down/);
  refuse('refuses a branch that carries a fixture failing pulse-fixture-check', 'S-home', { 'docs/pipeline/pulse/pkg/S-home/states.json': { states: [{ key: 'home-done', fixtures: [{ method: 'GET', path: '/api/v1/my-plans/today', edits: [{ pointer: '/session/status', value: 'finished' }] }] }] } }, /fixture: .*enum: \/session\/status = "finished"/);
  refuse('refuses a branch whose i18n patch does not hold', 'S-home', { 'docs/pipeline/pulse/pkg/S-home/i18n.patch.json': { package: 'S-home', base, namespaces: ['home'], set: [{ key: 'home.selftest', hu: 'Teszt', en: 'Test', copy: 'inventory', source: 'selftest' }] } }, /i18n\.patch\.json: set\[0\] home\.selftest: no de string/);
  refuse('refuses a screen package that hands in a shared.patch', 'S-home', { 'docs/pipeline/pulse/pkg/S-home/shared.patch': 'diff --git a/frontend/package.json b/frontend/package.json\n--- a/frontend/package.json\n+++ b/frontend/package.json\n' }, /a screen package cannot hand in a shared\.patch — only lanes can/);

  // A dirty integrator path BEFORE a merge.
  make('pulse/S-home', { [HOME]: append('// selftest') });
  write('frontend/src/main.tsx', `${read('frontend/src/main.tsx')}\n// left over\n`);
  r = tool('pulse-merge-check', 'S-home');
  check('refuses to start in a dirty tree, naming the path and its owner', r.status === 1 && /this tree is not clean/.test(r.out) && /M frontend\/src\/main\.tsx\s+\(the integrator's\)/.test(r.out), r.out);
  r = tool('pulse-merge-check', 'S-home', '--preflight');
  check('--preflight (an agent in its slot) skips the clean-tree rule and says it is no verdict', r.status === 0 && /not a merge verdict/.test(r.out), r.out);
  g('checkout', '-q', '--', 'frontend/src/main.tsx');
  gTry('branch', '-D', 'pulse/S-home');

  // An anchored file: verify:gates on the squashed tree.
  const anchoredNow = realProber ? run(process.execPath, ['scripts/verify-gates.mjs', '--list-anchors'], { cwd: FRONT }).stdout.split('\n').map((l) => l.trim()).filter(Boolean) : ANCHORED;
  const SETTINGS = 'frontend/src/features/settings/SettingsPage.tsx';
  if (anchoredNow.includes(SETTINGS)) {
    make('pulse/S-settings', { [SETTINGS]: append('// selftest: the page is rewritten') });
    r = tool('pulse-merge-check', 'S-settings');
    check('a branch that touches an anchored file may proceed only with the requirement spelled out', r.status === 0 && /REQUIRES verify:gates — the merge touches frontend\/src\/features\/settings\/SettingsPage\.tsx/.test(r.out), r.out);
    r = tool('pulse-merge-check', 'S-settings', '--squashed');
    check('--squashed refuses it while no green verify:gates run is on record', r.status === 1 && /no green verify:gates run is on record for the squashed tree/.test(r.out), r.out);
    if (!realProber) {
      fs.writeFileSync(`${REPO}/.pulse/selftest-gates-green`, '');
      r = tool('pulse-merge-check', 'S-settings', '--squashed');
      check('--squashed lets it through once verify:gates is green', r.status === 0 && /verify:gates is green for this tree/.test(r.out) && /the squashed tree may be committed/.test(r.out), r.out);
    }
    gTry('branch', '-D', 'pulse/S-settings');
  } else check('the prober of this tree anchors on SettingsPage.tsx', false, anchoredNow.join('\n'));

  // A lane with a shared.patch that applies.
  branch('pulse/F9');
  const PKG = 'frontend/package.json';
  const before = read(PKG);
  write(PKG, before.replace('"check:tokens": "node scripts/check-tokens.mjs",', `"check:tokens": "node scripts/check-tokens.mjs",${before.includes('\r\n') ? '\r\n' : '\n'}    "check:selftest": "node scripts/check-selftest.mjs",`));
  const patch = run('git', ['diff', '--', PKG], { cwd: REPO }).stdout;
  g('checkout', '-q', '--', PKG);
  write('docs/pipeline/pulse/pkg/F9/shared.patch', patch);
  commit('selftest: a lane shared.patch', 'docs/pipeline/pulse/pkg/F9/shared.patch');
  g('switch', '-q', 'pulse-redesign');
  r = tool('pulse-merge-check', 'F9:1');
  check('a lane (by stage id) with a shared.patch that applies passes', r.status === 0 && /shared\.patch applies \(frontend\/package\.json\)/.test(r.out), r.out);
  gTry('branch', '-D', 'pulse/F9');
  fs.rmSync(`${REPO}/.pulse`, { recursive: true, force: true });
}

/* ── summary ──────────────────────────────────────────────────────────────────────────────────── */

const failed = results.filter((x) => !x.ok);
const bySection = [...new Set(results.map((x) => x.section))].map((s) => `${s} ${results.filter((x) => x.section === s && x.ok).length}/${results.filter((x) => x.section === s).length}`);
console.log(`\npulse F4 self-test: ${results.length - failed.length} of ${results.length} passed — ${bySection.join(', ')}`);
console.log(`  gate exports: ${realExports ? 'the REAL scanKeyConsumers / scanElementReads of this tree' : 'TEST DOUBLES (this tree\'s gates do not export their scans yet — F2:b)'}`);
if (failed.length) for (const f of failed) console.log(`  FAILED [${f.section}] ${f.label}`);
if (argv.includes('--keep')) console.log(`  clone kept: ${REPO}`);
process.exit(failed.length ? 1 : 0);
