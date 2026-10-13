#!/usr/bin/env node
// scripts/pulse-ledger.mjs — the source ledger: what a rewrite took out (PLAN.md ruling 19, 5.1 row 6).
//
// A screen package rewrites the render of a page and must keep everything the page DOES. The proof
// of that is the runtime control inventory, which needs a build and a capture. This is the free
// half: a regex reading of the owned source files at the merge base and now, printing every
// behaviour-carrying construct that was there and is gone —
//
//   hook calls        useQuery( useClients( useState( …
//   mutation calls    x.mutate( / x.mutateAsync( and direct api.post / put / patch / delete(
//   doors             to="…", navigate(…), <Navigate …>, href="/…"
//   role / aria-*     role="…" by value, aria-* and tabIndex by name
//
// and three counts whose silent loss no capture shows: `focus-visible:`, `useMotionSafe(` and
// `motion-reduce:` (plus `sr-only`, the screen-reader-only text and tables).
//
// It is a LEDGER, not a gate: a line is not a defect, it is a question that needs a reason. A hook
// that moved between two owned files is not lost, so lines are computed over the package as a
// whole; --by-file shows where each one was. The hand-off quotes the lines with their reasons.
//
// Usage (cwd anywhere in the slot):
//   node scripts/pulse-ledger.mjs <id>                 merge base with pulse-redesign  ->  the working tree
//   node scripts/pulse-ledger.mjs <id> --ref <ref>     … -> a commit (the integrator, a reviewer)
//   node scripts/pulse-ledger.mjs <id> --base <ref>    another base branch or commit
//   --by-file   --json   --strict (exit 1 when the ledger is not empty)
//
// Exit: 0 printed, 1 only with --strict, 2 usage. Not in the build chain; no rule of any gate is
// repeated here (R31) — the ledger counts constructs, it never judges them.
import fs from 'node:fs';
import { BASE_BRANCH, expandOwns, git, gitTry, isMain, loadModel, lsFiles, readBlob, resolveId, tree } from './pulse-owns-check.mjs';

/** Comments are prose: `role="tab"` in a sentence about tabs is not a role. Approximate, on purpose. */
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[\s;{}()])\/\/[^\n]*/g, '$1');

const literal = (s) => s.replace(/\s+/g, ' ').trim().slice(0, 60);

/** Every counted construct of one file: `Map<"kind value", count>`. */
export function ledgerFacts(source) {
  const code = stripComments(source);
  const facts = new Map();
  const add = (kind, value) => facts.set(`${kind} ${value}`, (facts.get(`${kind} ${value}`) ?? 0) + 1);

  for (const m of code.matchAll(/\b(use[A-Z][A-Za-z0-9]*)\s*(?:<[^<>()]*>)?\(/g)) add('hook', m[1]);
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\.(mutate|mutateAsync)\s*\(/g)) add('mutation', `${m[1]}.${m[2]}`);
  for (const m of code.matchAll(/\bapi\.(post|put|patch|delete|del)\s*\(/g)) add('mutation', `api.${m[1]}`);

  for (const m of code.matchAll(/\bto=(?:"([^"]*)"|'([^']*)'|\{\s*(['"`])([\s\S]*?)\3\s*\}|\{([^}]*)\})/g)) {
    add('door', `to=${literal(m[1] ?? m[2] ?? m[4] ?? `{${m[5]}}`)}`);
  }
  for (const m of code.matchAll(/\bnavigate\(\s*(?:(['"`])([\s\S]*?)\1|([^,)]*))/g)) add('door', `navigate(${literal(m[2] ?? m[3])})`);
  for (const m of code.matchAll(/\bhref=(?:"(\/[^"]*)"|'(\/[^']*)')/g)) add('door', `href=${m[1] ?? m[2]}`);

  for (const m of code.matchAll(/\brole=(?:"([^"]+)"|'([^']+)'|\{([^}]+)\})/g)) add('role', literal(m[1] ?? m[2] ?? `{${m[3]}}`));
  for (const m of code.matchAll(/\b(aria-[a-z]+)=/g)) add('aria', m[1]);
  for (let n = code.split('tabIndex=').length - 1; n > 0; n -= 1) add('aria', 'tabIndex');

  for (const token of ['focus-visible:', 'useMotionSafe(', 'motion-reduce:', 'sr-only']) {
    const n = code.split(token).length - 1;
    if (n) facts.set(`count ${token}`, n);
  }
  return facts;
}

const isSource = (f) => f.startsWith('frontend/src/') && /\.(ts|tsx)$/.test(f);

/**
 * The ledger of one work unit between two states of its owned files.
 * `now` is a ref, or null for the working tree of this slot.
 */
export function buildLedger(unit, { base = BASE_BRANCH, ref = null } = {}) {
  const { root } = tree();
  const target = ref ?? 'HEAD';
  const mergeBase = gitTry(['merge-base', base, target], { cwd: root }).stdout.trim();
  if (!mergeBase) throw new Error(`no merge base between ${base} and ${target}`);

  const before = expandOwns(unit.pkg.owns, lsFiles(mergeBase)).filter(isSource);
  const worktreeFiles = () =>
    git(['ls-files', '-co', '--exclude-standard'], { cwd: root }).split('\n').filter((f) => f && fs.existsSync(`${root}/${f}`));
  const after = expandOwns(unit.pkg.owns, ref ? lsFiles(ref) : worktreeFiles()).filter(isSource);

  const read = (state, file) => (state === 'before' ? readBlob(mergeBase, file) : ref ? readBlob(ref, file) : fs.readFileSync(`${root}/${file}`, 'utf8'));
  const collect = (state, files) => {
    const total = new Map();
    const where = new Map(); // fact -> [{ file, count }]
    for (const file of files) {
      for (const [fact, count] of ledgerFacts(read(state, file) ?? '')) {
        total.set(fact, (total.get(fact) ?? 0) + count);
        where.set(fact, [...(where.get(fact) ?? []), { file, count }]);
      }
    }
    return { total, where };
  };
  const a = collect('before', before);
  const b = collect('after', after);

  const missing = [];
  const added = [];
  const counts = [];
  for (const fact of new Set([...a.total.keys(), ...b.total.keys()])) {
    const was = a.total.get(fact) ?? 0;
    const is = b.total.get(fact) ?? 0;
    const [kind, ...rest] = fact.split(' ');
    const row = { kind, what: rest.join(' '), base: was, now: is, wasIn: a.where.get(fact) ?? [], isIn: b.where.get(fact) ?? [] };
    if (kind === 'count') counts.push(row);
    else if (is < was) missing.push(row);
    else if (is > was) added.push(row);
  }
  const order = ['hook', 'mutation', 'door', 'role', 'aria'];
  const sort = (rows) => rows.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind) || x.what.localeCompare(y.what));
  return {
    id: unit.raw,
    base: mergeBase.slice(0, 7),
    now: ref ?? 'working tree',
    files: { before, after, deleted: before.filter((f) => !after.includes(f)), created: after.filter((f) => !before.includes(f)) },
    missing: sort(missing),
    added: sort(added),
    counts: counts.sort((x, y) => x.what.localeCompare(y.what)),
  };
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const model = loadModel();
  const unit = resolveId(argv.find((a, i) => !a.startsWith('--') && !['--ref', '--base'].includes(argv[i - 1])), model);
  if (!unit) {
    console.error('usage: node scripts/pulse-ledger.mjs <id> [--ref <ref>] [--base <ref>] [--by-file] [--json] [--strict]');
    process.exit(2);
  }
  const ledger = buildLedger(unit, { base: opt('--base') ?? BASE_BRANCH, ref: opt('--ref') ?? null });
  const lowered = ledger.counts.filter((c) => c.now < c.base);
  const open = ledger.missing.length + lowered.length;

  if (argv.includes('--json')) console.log(JSON.stringify(ledger, null, 2));
  else {
    const short = (f) => f.replace(/^frontend\/src\//, '');
    console.log(`pulse-ledger ${unit.raw}: ${ledger.base} -> ${ledger.now}, ${ledger.files.after.length} owned source file(s)`);
    for (const f of ledger.files.deleted) console.log(`  deleted  ${short(f)}`);
    for (const f of ledger.files.created) console.log(`  created  ${short(f)}`);
    if (ledger.missing.length === 0) console.log('  present at the merge base and missing now: nothing');
    else {
      console.log(`  present at the merge base and missing now (${ledger.missing.length}) — each needs a reason in the hand-off:`);
      for (const m of ledger.missing) {
        console.log(`    - ${m.kind.padEnd(8)} ${m.what}   ${m.base} -> ${m.now}`);
        if (argv.includes('--by-file')) for (const w of m.wasIn) console.log(`        was in ${short(w.file)} x${w.count}`);
      }
    }
    if (argv.includes('--by-file') && ledger.added.length) {
      console.log(`  new since the merge base (${ledger.added.length}):`);
      for (const m of ledger.added) console.log(`    + ${m.kind.padEnd(8)} ${m.what}   ${m.base} -> ${m.now}`);
    }
    console.log('  counts (merge base -> now):');
    const all = ['focus-visible:', 'useMotionSafe(', 'motion-reduce:', 'sr-only'].map((t) => ledger.counts.find((c) => c.what === t) ?? { what: t, base: 0, now: 0 });
    for (const c of all) console.log(`    ${c.what.padEnd(16)} ${String(c.base).padStart(3)} -> ${String(c.now).padStart(3)}${c.now < c.base ? '   LOWER — say why' : ''}`);
    console.log(open ? `pulse-ledger: ${open} line(s) to explain` : 'pulse-ledger: empty — nothing counted was lost');
  }
  process.exit(argv.includes('--strict') && open ? 1 : 0);
}
