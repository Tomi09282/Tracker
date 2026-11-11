#!/usr/bin/env node
// scripts/pulse-merge-check.mjs — what the integrator runs before every merge (PLAN.md 4.4 item 1, 6.2 step 1).
//
// "No two agents write the same file" is the whole collision model of the Pulse effort, and it is
// not held by trust. Before a branch is squashed onto the published line this script refuses it
// when —
//
//   - the tree it runs in is not clean (6.2 step 0: a dirty integrator path is found BEFORE a merge);
//   - work-packages.json itself fails `pulse-owns-check`;
//   - the branch's diff against its merge base touches a path its package does not own —
//     in particular src/i18n, src/ui, src/app, src/lib, frontend/scripts and every frozen use*.ts;
//   - it raises a budget: `pkg/<id>/budget.json` goes up or is created on the branch, or (once the
//     ratchet is in the tree) an owned file counts MORE of a legacy construct than at the merge
//     base — counted by check-pulse.mjs's own counter, imported (R31);
//   - it carries a hand-in file that does not hold: i18n.patch.json (pulse-i18n check),
//     variants.json (pulse-variants check), shared.patch (lanes only; modifies existing files only;
//     applies), a fixture in states.json that fails pulse-fixture-check;
//   - it touches a gate or an anchored file (`verify:gates --list-anchors`) and no green
//     `verify:gates` run is on record for the squashed tree.
//
// The last one needs the squashed tree, which does not exist at step 1. So the script runs twice:
//
//   node scripts/pulse-merge-check.mjs <id>              step 1 — everything above; when a gate or an
//                                                        anchored file is touched it says REQUIRES
//                                                        verify:gates and the merge may proceed to it
//   node scripts/pulse-merge-check.mjs <id> --squashed   after step 7, before the commit — refuses
//                                                        unless `verify-gates.mjs --fresh` is green
//
//   --preflight   an agent's own dry run in its slot: the clean-tree rule is skipped and the result
//                 is labelled as no verdict
//   --ref <ref>   another branch or commit than pulse/<id>      --base <ref>   default pulse-redesign
//   --json
//
// Exit: 0 may merge, 1 refused, 2 usage, 3 a hand-in could not be checked in this tree (a gate
// export is missing). Not in the build chain.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  BASE_BRANCH,
  SCRIPTS_DIR,
  FRONTEND_DIR,
  checkOwnership,
  gateExports,
  git,
  gitTry,
  isFrozen,
  isIntegratorPath,
  isMain,
  listAnchors,
  loadModel,
  matchesAny,
  ownersOf,
  readBlob,
  readHandIn,
  refExists,
  resolveId,
  tree,
} from './pulse-owns-check.mjs';
import { checkFixturesOf } from './pulse-fixture-check.mjs';
import { checkPatch } from './pulse-i18n.mjs';
import { inspectSharedPatch } from './pulse-sync.mjs';
import { checkDeltas } from './pulse-variants.mjs';

const GATE_PATH = /^frontend\/scripts\/(?:(?:check|verify)-[^/]+\.mjs|data\/.+)$/;
const COUNTER_NAMES = ['countRules', 'countFile', 'countSource'];

/** Who a path belongs to, in the words of the ownership table. */
function whose(file, model) {
  if (file.startsWith('backend/')) return "backend/ — nobody's in this effort";
  if (isFrozen(file, model)) return 'frozen for everybody';
  const ids = ownersOf(file, model);
  if (ids.length) return `owned by ${ids.join(', ')}`;
  if (isIntegratorPath(file, model)) return 'the integrator\'s';
  return 'owned by nobody — not in work-packages.json';
}

/** Every numeric leaf of a JSON document, by its path — a budget file's counts whatever its layout. */
function numericLeaves(doc, at = '', out = new Map()) {
  if (typeof doc === 'number') out.set(at, doc);
  else if (doc && typeof doc === 'object') for (const [k, v] of Object.entries(doc)) numericLeaves(v, `${at}/${k}`, out);
  return out;
}

/** A budget may only go down: compare the file at the merge base with the file on the branch. */
function budgetProblems(unit, mergeBase, ref) {
  const problems = [];
  const before = readHandIn(unit, 'budget.json', mergeBase);
  const after = readHandIn(unit, 'budget.json', ref);
  if (!after) return problems; // deleted or never there: every count is zero
  let was;
  let is;
  try {
    was = before ? JSON.parse(before.text) : null;
    is = JSON.parse(after.text);
  } catch (err) {
    return [`${after.path} is not valid JSON — ${err.message}`];
  }
  if (!was) return [`${after.path} is created on the branch — check:pulse has no budgets since the closing cleanup (PLAN.md 7.3 row 5): every rule is a ban`];
  const a = numericLeaves(was);
  for (const [leaf, n] of numericLeaves(is)) {
    if (!a.has(leaf)) {
      if (n > 0) problems.push(`${after.path}: ${leaf} = ${n} is new on the branch — a budget cannot gain an entry`);
    } else if (n > a.get(leaf)) problems.push(`${after.path}: ${leaf} raised ${a.get(leaf)} -> ${n} — a budget may only go down`);
  }
  return problems;
}

/** The ratchet's own counter over the touched owned files, merge base against branch (R31). */
async function ratchetProblems(touched, mergeBase, ref, out) {
  const script = `${SCRIPTS_DIR}/check-pulse.mjs`;
  if (!fs.existsSync(script)) {
    out.pending.push('ratchet: scripts/check-pulse.mjs is not in this tree yet (F2:c) — only the budget file was compared');
    return;
  }
  const name = COUNTER_NAMES.find((n) => gateExports('check-pulse.mjs', n));
  if (!name) {
    out.problems.push(`check-pulse.mjs is in this tree and exports none of ${COUNTER_NAMES.join(' / ')} — pulse-merge-check must import the gate's counter (R31), not repeat it`);
    return;
  }
  const mod = await import(pathToFileURL(script).href);
  const counts = (source, file) => {
    const raw = source === null ? {} : mod[name](source, file.replace(/^frontend\//, ''));
    const entries = raw instanceof Map ? [...raw] : Array.isArray(raw) ? raw.map((r) => [r.rule ?? r.id, r.count ?? r.n]) : Object.entries(raw ?? {});
    return new Map(entries.filter(([, n]) => typeof n === 'number'));
  };
  for (const file of touched.filter((f) => /^frontend\/src\/.+\.(ts|tsx|css)$/.test(f))) {
    const was = counts(readBlob(mergeBase, file), file);
    for (const [rule, n] of counts(readBlob(ref, file), file)) {
      if (n > (was.get(rule) ?? 0)) out.problems.push(`${file}: ${rule} raised ${was.get(rule) ?? 0} -> ${n} — a ratchet count may only go down`);
    }
  }
  out.passed.push(`the ratchet's counter (${name}) finds no raised count`);
}

/**
 * The verdict on one work unit. `{ id, ref, base, mergeBase, files, passed, problems, blocked,
 * pending, notes, requires }` — `requires` lists what must still happen on the squashed tree.
 */
export async function mergeCheck(unit, model, { ref = unit.branch, base = BASE_BRANCH, preflight = false, squashed = false } = {}) {
  const { root } = tree();
  const out = { id: unit.raw, ref, base, mergeBase: null, files: [], passed: [], problems: [], blocked: [], pending: [], notes: [], requires: [] };
  const refuse = (m) => out.problems.push(m);

  // 0 — the tree the merge will be made in
  if (!preflight && !squashed) {
    const dirty = git(['status', '--porcelain', '-uall'], { cwd: root, raw: true }).split('\n').filter(Boolean);
    if (dirty.length) {
      refuse(`this tree is not clean — find out why before merging anything (PLAN.md 6.2 step 0):`);
      for (const l of dirty.slice(0, 20)) refuse(`    ${l.slice(0, 2)} ${l.slice(3)}   (${whose(l.slice(3).split(' -> ').at(-1), model)})`);
    } else out.passed.push('the tree is clean');
  }

  // 1 — the ownership file itself
  const owns = checkOwnership(model);
  out.pending.push(...owns.pending);
  if (owns.problems.length) {
    refuse(`work-packages.json fails pulse-owns-check (${owns.problems.length}):`);
    for (const p of owns.problems.slice(0, 10)) refuse(`    ${p}`);
  } else out.passed.push('pulse-owns-check is clean');

  // 2 — every touched path is owned
  if (!refExists(ref)) {
    refuse(`${ref} does not exist`);
    return out;
  }
  if (!refExists(base)) {
    refuse(`the base ${base} does not exist`);
    return out;
  }
  out.mergeBase = git(['merge-base', base, ref], { cwd: root });
  const diff = git(['diff', '--name-status', '--no-renames', out.mergeBase, ref], { cwd: root, raw: true }).split('\n').filter(Boolean).map((l) => ({ code: l[0], file: l.split('\t').at(-1) }));
  out.files = diff.map((d) => d.file);
  const foreign = diff.filter((d) => !matchesAny(d.file, unit.pkg.owns));
  for (const d of foreign) refuse(`${d.code} ${d.file} — ${whose(d.file, model)}, not ${unit.id}'s. A need there is a hand-in file or a request (PLAN.md 4.4).`);
  if (diff.length === 0) out.notes.push(`${ref} has no change against ${base}`);
  else if (foreign.length === 0) out.passed.push(`all ${diff.length} touched path(s) are ${unit.id}'s`);
  const behind = Number(git(['rev-list', '--count', `${ref}..${base}`], { cwd: root }));
  if (behind) out.notes.push(`${ref} is ${behind} commit(s) behind ${base} — its hand-in files are checked against both`);

  // 6 — gates and anchored files: a green verify:gates run on the squashed tree
  const anchors = listAnchors();
  const declared = model.packages.flatMap((p) => (p.anchoredBy ?? []).map((line) => (p.owns ?? []).find((o) => o.endsWith(`/${/([\w.-]+\.(?:tsx|ts|mjs|css|json|html))/.exec(line)?.[1]}`)))).filter(Boolean);
  const sensitive = out.files.filter((f) => GATE_PATH.test(f) || (anchors ?? declared).includes(f));
  if (sensitive.length) {
    if (anchors === null) {
      out.pending.push(`anchors: ${sensitive.join(', ')} ${sensitive.length === 1 ? 'is' : 'are'} a gate or an anchored file (by anchoredBy), and scripts/verify-gates.mjs is not in this tree yet (F2:b) — run the existing verify:nav-gate by hand`);
    } else if (!squashed) {
      out.requires.push(`verify:gates — the merge touches ${sensitive.join(', ')}; run \`npm run verify:gates\` on the squashed tree, then \`pulse-merge-check ${unit.raw} --squashed\``);
    } else {
      const r = spawnSync(process.execPath, [`${SCRIPTS_DIR}/verify-gates.mjs`, '--fresh'], { cwd: FRONTEND_DIR, encoding: 'utf8', windowsHide: true });
      if (r.status === 0) out.passed.push(`verify:gates is green for this tree (touched: ${sensitive.join(', ')})`);
      else refuse(`the merge touches ${sensitive.join(', ')} and no green verify:gates run is on record for the squashed tree — run \`npm run verify:gates\` first${(r.stdout + r.stderr).trim() ? ` (${(r.stdout + r.stderr).trim().split('\n').at(-1)})` : ''}`);
    }
  } else out.passed.push('no gate and no anchored file is touched');
  if (squashed) return out; // the rest was decided at step 1, on the branch

  // 3 — budgets and the ratchet
  const budget = budgetProblems(unit, out.mergeBase, ref);
  for (const p of budget) refuse(p);
  if (budget.length === 0) out.passed.push('no budget is raised');
  await ratchetProblems(out.files.filter((f) => matchesAny(f, unit.pkg.owns)), out.mergeBase, ref, out);

  // 4 — the hand-in files
  const handIn = async (name, run) => {
    if (!readHandIn(unit, name, ref)) return;
    const r = await run();
    for (const p of r.problems) refuse(`${name}: ${p}`);
    for (const b of r.blocked ?? []) out.blocked.push(`${name}: ${b}`);
    if (r.problems.length === 0 && !(r.blocked ?? []).length) out.passed.push(`${name} holds`);
  };
  await handIn('i18n.patch.json', () => checkPatch(unit, model, { ref }));
  await handIn('variants.json', () => checkDeltas(unit, model, { ref }));
  const shared = readHandIn(unit, 'shared.patch', ref);
  if (shared) {
    if (unit.pkg.kind === 'screen') refuse(`${shared.path}: a screen package cannot hand in a shared.patch — only lanes can (PLAN.md 4.4 item 4); what a screen needs outside its files is a request`);
    const info = inspectSharedPatch(shared.text, unit, model, git(['ls-tree', '-r', '--name-only', base], { cwd: root }).split('\n'));
    for (const p of info.problems) refuse(p);
    if (info.problems.length === 0 && !preflight) {
      // The tree is clean and at the base here, so this is exactly what the integrator will run.
      const r = spawnSync('git', ['apply', '--check', '--whitespace=nowarn', '-'], { cwd: root, input: shared.text, encoding: 'utf8', windowsHide: true });
      if (r.status !== 0) refuse(`shared.patch does not apply on this tree — the lane re-cuts it (${r.stderr.trim().split('\n')[0]})`);
      else out.passed.push(`shared.patch applies (${info.files.join(', ')})`);
    }
  }

  // 5 — fixtures
  const fixtures = checkFixturesOf(unit, { ref });
  for (const p of fixtures.problems) refuse(`fixture: ${p}`);
  if (fixtures.file && fixtures.problems.length === 0) out.passed.push(`${fixtures.fixtures} fixture(s) in ${fixtures.file} hold against ${fixtures.recordings} recording(s)`);
  return out;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const model = loadModel();
  const unit = resolveId(argv.find((a, i) => !a.startsWith('--') && !['--ref', '--base'].includes(argv[i - 1])), model);
  if (!unit) {
    console.error('usage: node scripts/pulse-merge-check.mjs <id> [--squashed] [--preflight] [--ref <ref>] [--base <ref>] [--json]');
    process.exit(2);
  }
  const preflight = argv.includes('--preflight');
  const squashed = argv.includes('--squashed');
  const result = await mergeCheck(unit, model, { ref: opt('--ref') ?? unit.branch, base: opt('--base') ?? BASE_BRANCH, preflight, squashed });
  const code = result.problems.length ? 1 : result.blocked.length ? 3 : 0;

  if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    const short = (r) => (result.mergeBase && gitTry(['rev-parse', '--short', r], { cwd: tree().root }).stdout.trim()) || '?';
    console.log(`pulse-merge-check ${unit.raw}${squashed ? ' --squashed' : ''}${preflight ? ' --preflight' : ''}: ${result.ref} @ ${short(result.ref)} onto ${result.base} @ ${short(result.base)}, ${result.files.length} path(s) touched`);
    for (const p of result.passed) console.log(`  ok       ${p}`);
    for (const n of result.notes) console.log(`  note     ${n}`);
    for (const p of result.pending) console.log(`  PENDING  ${p}`);
    for (const r of result.requires) console.log(`  REQUIRES ${r}`);
    for (const b of result.blocked) console.log(`  BLOCKED  ${b}`);
    for (const p of result.problems) console.error(`  REFUSED  ${p}`);
    const label = preflight ? ' (a preflight in a slot — not a merge verdict)' : '';
    if (code === 1) console.error(`pulse-merge-check: REFUSED — ${result.problems.filter((p) => !p.startsWith('    ')).length} problem(s)${label}`);
    else if (code === 3) console.log(`pulse-merge-check: BLOCKED — a hand-in file could not be checked in this tree${label}`);
    else console.log(`pulse-merge-check: ${squashed ? 'the squashed tree may be committed' : result.requires.length ? 'may proceed to the squash — with the requirement above' : 'may merge'}${label}`);
  }
  process.exit(code);
}
