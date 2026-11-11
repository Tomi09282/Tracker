#!/usr/bin/env node
// docs/pipeline/pulse/pkg/_int/proofs/F1.4/codemod.mjs — the rename of step F1.4 (PLAN.md 3.3, ruling R3).
//
// Three names of the old type ramp are also names of the Pulse ramp, with other metrics:
//
//   text-body      15 / 22 / 400            ->  Pulse body     16 / 22 / 400
//   text-display   34 / 40 / 700            ->  Pulse display  32 / 34 / 700, display face, upper case
//   text-micro     11 / 14 / 600 / +6 %     ->  Pulse micro    11 / 16 / 500 / +10 %, mono face, upper case
//
// So every EXISTING use of the three is renamed to `text-<name>-legacy`, a step that carries the old
// metrics. Nothing on a screen that has not been rebuilt changes size, and the bare names are free for
// the Pulse roles. The legacy steps are counted by the ratchet and deleted in the closing cleanup.
//
// THE RULE, WITH NO EXCEPTION TO REMEMBER
//
//   in every tracked `frontend/src/**/*.ts` and `*.tsx`:
//   `text-body`, `text-display`, `text-micro` as a whole class token — not preceded by a word
//   character or a hyphen (so `--text-body` and `data-text-body` are not it), not followed by one
//   (so `text-body-s`, `text-body-strong`, `text-display-xl` are not it) — gains the suffix `-legacy`.
//
// It is applied to the file's TEXT: class strings, class names inside expressions (`cn(…)`, a
// conditional, a `cva` map, a template string) and the comments that describe them alike. A comment
// that names the class beside it therefore keeps telling the truth, and a plain `grep -c` over the
// tree gives the same number as any gate that counts the legacy names.
//
// What a text rename CANNOT see is a class name assembled from parts (`'text-' + step`,
// `text-${step}`), so the script also searches for those shapes and fails if one exists.
//
// Modes (cwd anywhere inside a worktree of the repository):
//   node codemod.mjs               dry run: what would change, where each hit sits, the built-name search
//   … --sites                      also list every hit that is not a plain className="…" literal
//   node codemod.mjs --write       apply
//   node codemod.mjs --verify [<rev>]   prove the rename against <rev> (default HEAD): for every file
//                                  of the scope that differs from <rev>, undoing the suffix gives back
//                                  the old file byte for byte; nothing un-renamed is left; exit 1 otherwise
//
// No dependency of its own: it borrows the TypeScript parser of `frontend/node_modules` only to say
// whether a hit sits in a string, in JSX text or in a comment (reporting — the rename does not need it).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const git = (args, cwd = HERE, opts = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
const ROOT = git(['rev-parse', '--show-toplevel']).trim();
const FRONT = path.join(ROOT, 'frontend');

const NAMES = ['body', 'display', 'micro'];
const TOKEN = new RegExp(`(?<![\\w-])text-(${NAMES.join('|')})(?![\\w-])`, 'g');
const RENAMED = new RegExp(`(?<![\\w-])text-(${NAMES.join('|')})-legacy(?![\\w-])`, 'g');
const rename = (text) => text.replace(TOKEN, 'text-$1-legacy');
const undo = (text) => text.replace(RENAMED, 'text-$1');

/** Shapes that would BUILD one of the names at run time, where a text rename cannot reach. */
const BUILT = [
  { id: 'template', what: 'a template string that continues `text-` with an expression', re: /text-\$\{/g },
  { id: 'concat', what: 'a string that ends in `text-` and is concatenated', re: /text-['"`]\s*\+/g },
  { id: 'join', what: 'a `text-` prefix joined to a variable', re: /['"`]text-['"`]\s*[,)]/g },
];
/** The bare step names as string literals: the only way a built name could get its second half. */
const BARE = new RegExp(`['"\`](${NAMES.join('|')})['"\`]`, 'g');

const scope = git(['ls-files', '--', 'frontend/src'], ROOT)
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f));

const [mode = 'dry', revArg] = process.argv.slice(2).filter((a) => a !== '--sites');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const lineOf = (text, offset) => text.slice(0, offset).split('\n').length;

/* ── where a hit sits: string, template, JSX text or comment ─────────────────────────────────── */

function classifier() {
  let ts;
  try {
    ts = createRequire(path.join(FRONT, 'package.json'))('typescript');
  } catch {
    return null;
  }
  return (rel, text) => {
    const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const ranges = [];
    const K = ts.SyntaxKind;
    /** The expression a literal is part of — the shapes a reviewer would grep for one by one. */
    const contextOf = (node) => {
      const seen = new Set();
      for (let n = node.parent; n; n = n.parent) {
        if (n.kind === K.CallExpression) {
          const callee = n.expression;
          seen.add(`call:${callee.kind === K.Identifier ? callee.text : callee.kind === K.PropertyAccessExpression ? `[…].${callee.name.text}` : 'a call'}`);
        }
        else if (n.kind === K.ConditionalExpression) seen.add('conditional');
        else if (n.kind === K.BinaryExpression && [K.AmpersandAmpersandToken, K.BarBarToken, K.QuestionQuestionToken].includes(n.operatorToken.kind)) seen.add('conditional');
        else if (n.kind === K.PropertyAssignment) seen.add('map');
        else if (n.kind === K.ArrayLiteralExpression) seen.add('array');
        else if (n.kind === K.JsxAttribute) {
          seen.add(n.initializer === node ? 'attribute' : 'attribute-expression');
          break;
        } else if (n.kind === K.VariableDeclaration || n.kind === K.ReturnStatement || n.kind === K.ArrowFunction || n.kind === K.FunctionDeclaration) {
          seen.add('declaration');
          break;
        }
      }
      const calls = [...seen].filter((s) => s.startsWith('call:')).map((s) => s.slice(5));
      if (calls.includes('cva')) return 'a cva() variant map';
      if (seen.has('map')) return 'an object map of class strings';
      if (seen.has('conditional')) return calls.length ? `a conditional inside ${calls[0]}()` : 'a conditional expression';
      if (calls.length) return `an argument of ${calls[0]}()`;
      if (seen.has('array')) return 'an array of class strings';
      if (seen.has('attribute')) return 'a plain className="…" literal';
      if (seen.has('attribute-expression')) return 'a className={…} expression';
      return 'a string constant';
    };
    const visit = (node) => {
      const k = node.kind;
      if (k === K.StringLiteral) ranges.push([node.getStart(source), node.getEnd(), 'string', contextOf(node)]);
      else if (k === K.NoSubstitutionTemplateLiteral || k === K.TemplateHead || k === K.TemplateMiddle || k === K.TemplateTail)
        ranges.push([node.getStart(source), node.getEnd(), 'template', `a template string (${contextOf(k === K.NoSubstitutionTemplateLiteral ? node : node.parent)})`]);
      else if (k === K.JsxText) ranges.push([node.getFullStart(), node.getEnd(), 'jsx-text', 'JSX text']);
      ts.forEachChild(node, visit);
    };
    visit(source);
    return (offset) => {
      const hit = ranges.find(([from, to]) => offset >= from && offset < to);
      return hit ? { kind: hit[2], context: hit[3] } : { kind: 'comment', context: 'a comment' };
    };
  };
}

/* ── the scan ─────────────────────────────────────────────────────────────────────────────────── */

const classify = classifier();
const perFile = [];
const where = { string: 0, template: 0, 'jsx-text': 0, comment: 0, unknown: 0 };
const perName = Object.fromEntries(NAMES.map((n) => [n, 0]));
const commentHits = [];
const contexts = new Map();
const expressionHits = [];
const builtHits = [];
const bareHits = [];

for (const rel of scope) {
  const text = read(rel);
  for (const shape of BUILT) {
    for (const m of text.matchAll(shape.re)) builtHits.push(`${rel}:${lineOf(text, m.index)} — ${shape.what}`);
  }
  for (const m of text.matchAll(BARE)) bareHits.push(`${rel}:${lineOf(text, m.index)}: ${text.split('\n')[lineOf(text, m.index) - 1].trim().slice(0, 110)}`);
  const hits = [...text.matchAll(mode === 'verify' || mode === '--verify' ? RENAMED : TOKEN)];
  if (hits.length === 0) continue;
  const kindAt = classify ? classify(rel, text) : null;
  for (const m of hits) {
    perName[m[1]] += 1;
    const { kind, context } = kindAt ? kindAt(m.index) : { kind: 'unknown', context: 'unclassified' };
    where[kind] += 1;
    contexts.set(context, (contexts.get(context) ?? 0) + 1);
    if (kind !== 'comment' && context !== 'a plain className="…" literal') expressionHits.push(`${rel}:${lineOf(text, m.index)} — ${context}`);
    if (kind === 'comment') commentHits.push(`${rel}:${lineOf(text, m.index)}: ${text.split('\n')[lineOf(text, m.index) - 1].trim().slice(0, 110)}`);
  }
  perFile.push({ rel, count: hits.length });
}

const total = perFile.reduce((n, f) => n + f.count, 0);
const report = (title) => {
  console.log(`codemod F1.4 — ${title}`);
  console.log(`  scope: ${scope.length} tracked .ts / .tsx files under frontend/src`);
  console.log(`  ${total} class token(s) in ${perFile.length} file(s): ${NAMES.map((n) => `text-${n} ${perName[n]}`).join(' · ')}`);
  console.log(`  where they sit: ${where.string} in a string literal · ${where.template} in a template string · ${where['jsx-text']} in JSX text · ${where.comment} in a comment${where.unknown ? ` · ${where.unknown} unclassified (no TypeScript parser found)` : ''}`);
  for (const line of commentHits) console.log(`    comment  ${line}`);
  console.log(`  by the expression they are part of:`);
  for (const [context, n] of [...contexts].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(3)}  ${context}`);
  if (process.argv.includes('--sites')) for (const line of expressionHits) console.log(`    expr     ${line}`);
  console.log(`  names built at run time: ${builtHits.length === 0 ? 'none (no `text-${…}`, no `\'text-\' + …`, no joined `text-` prefix)' : ''}`);
  for (const line of builtHits) console.log(`    BUILT    ${line}`);
  console.log(`  the bare names ${NAMES.map((n) => `'${n}'`).join(' / ')} as string literals (${bareHits.length}) — each must be unrelated to a class:`);
  for (const line of bareHits) console.log(`    bare     ${line}`);
};

if (mode === 'dry') {
  report('dry run, nothing written');
  for (const f of perFile) console.log(`    ${String(f.count).padStart(3)}  ${f.rel}`);
  process.exit(builtHits.length ? 1 : 0);
}

if (mode === '--write') {
  if (builtHits.length) {
    report('REFUSED — a class name is built at run time; rename it by hand first');
    process.exit(1);
  }
  for (const f of perFile) {
    const abs = path.join(ROOT, f.rel);
    fs.writeFileSync(abs, rename(fs.readFileSync(abs, 'utf8')));
  }
  report('written');
  process.exit(0);
}

if (mode === '--verify') {
  const rev = revArg ?? 'HEAD';
  const problems = [];
  const changed = git(['diff', '--name-only', rev, '--', 'frontend/src'], ROOT).split('\n').filter((f) => /\.(ts|tsx)$/.test(f));
  let mechanical = 0;
  const other = [];
  for (const rel of changed) {
    let before;
    try {
      before = git(['show', `${rev}:${rel}`], ROOT);
    } catch {
      other.push(`${rel} (not in ${rev})`);
      continue;
    }
    // The repository stores LF; a Windows checkout may hold CRLF (core.autocrlf). Compare what git
    // compares: the text with its line ends normalised.
    const lf = (s) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
    const after = lf(read(rel));
    before = lf(before);
    if (undo(after) === before && rename(before) === after) mechanical += 1;
    else other.push(rel);
  }
  for (const rel of scope) {
    const left = [...read(rel).matchAll(TOKEN)];
    for (const m of left) problems.push(`${rel}:${lineOf(read(rel), m.index)} still says text-${m[1]}`);
  }
  for (const line of builtHits) problems.push(`built at run time: ${line}`);
  report(`verify against ${rev} (the counts below are the RENAMED tokens)`);
  console.log(`  ${changed.length} file(s) of the scope differ from ${rev}: ${mechanical} differ by the rename alone (undoing the suffix gives back the old bytes)`);
  for (const rel of other) console.log(`    also edited by hand, not by this script: ${rel}`);
  if (problems.length) {
    for (const p of problems) console.error(`  PROBLEM  ${p}`);
    process.exit(1);
  }
  console.log(`  no un-renamed token is left in the scope`);
  process.exit(0);
}

console.error('usage: node codemod.mjs [--write | --verify [<rev>]]');
process.exit(2);
