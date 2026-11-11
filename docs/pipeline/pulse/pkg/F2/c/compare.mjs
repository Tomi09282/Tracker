#!/usr/bin/env node
// docs/pipeline/pulse/pkg/F2/c/compare.mjs — the ratchet against a second, differently built counter.
//
// PLAN.md 3.6: "At G-c each rule's total must equal the independent count of F0 step 6, or the
// difference is explained in writing." This script produces the numbers; counts.md is the writing.
//
//   node compare.mjs --tree <checkout> --record <independent-counts.json> [--rename-three] [--rule <id>]
//       the ratchet (frontend/scripts/check-pulse.mjs of THIS checkout) over <checkout>/frontend/src,
//       beside the record. Per rule: the record's total, the same grep with comments blanked, the
//       ratchet's total. Then every LINE on which the two disagree, tagged
//         comment   the grep matched inside a comment (the ratchet blanks comments)
//         rule      the two rules differ on this line — explained per rule in counts.md
//       --rename-three applies the F1.4 codemod to the text in memory first (the base tree still
//       spells the three re-used step names without `-legacy`).
//
//   node compare.mjs --lexer --tree <checkout>
//       the gate's hand-written lexer against the TypeScript parser of <checkout>/frontend:
//       comment ranges and string ranges, file by file, and the ratchet's counts under both.
//
// Reads only. Writes nothing.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../../..');
const gate = await import(pathToFileURL(path.join(REPO, 'frontend/scripts/check-pulse.mjs')).href);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const value = (n) => (flag(n) ? argv[argv.indexOf(n) + 1] : undefined);
const TREE = path.resolve(value('--tree') ?? REPO);
const SRC = path.join(TREE, 'frontend', 'src');
const posix = (p) => p.split(path.sep).join('/');
const LF = '\n';

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|css)$/.test(e.name)) yield full;
  }
}
const renameThree = (text) => text.replace(/(?<![\w-])text-(body|display|micro)(?![\w-])/g, 'text-$1-legacy');
const read = (full) => {
  const text = fs.readFileSync(full, 'utf8');
  return flag('--rename-three') && /\.tsx?$/.test(full) ? renameThree(text) : text;
};
const files = [...walk(SRC)].map((full) => ({ full, rel: posix(path.relative(SRC, full)), text: read(full) }));
const lineOf = (text, index) => text.slice(0, index).split(LF).length;

/* ── the lexer against the TypeScript parser ──────────────────────────────────────────────────── */
if (flag('--lexer')) {
  const ts = createRequire(path.join(TREE, 'frontend', 'package.json'))('typescript');
  let same = 0;
  let commentDiff = 0;
  let stringDiff = 0;
  let countDiff = 0;
  for (const f of files.filter((x) => /\.tsx?$/.test(x.rel))) {
    const sf = ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.Latest, true, f.rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const comments = new Map();
    const strings = new Uint8Array(f.text.length);
    const visit = (node) => {
      const k = node.kind;
      if (k !== ts.SyntaxKind.JsxText) {
        for (const r of ts.getLeadingCommentRanges(f.text, node.getFullStart()) ?? []) comments.set(r.pos, r.end);
        for (const r of ts.getTrailingCommentRanges(f.text, node.getEnd()) ?? []) comments.set(r.pos, r.end);
      }
      if (k === ts.SyntaxKind.StringLiteral || k === ts.SyntaxKind.NoSubstitutionTemplateLiteral) strings.fill(1, node.getStart() + 1, node.getEnd() - 1);
      else if (k === ts.SyntaxKind.TemplateHead || k === ts.SyntaxKind.TemplateMiddle) strings.fill(1, node.getStart() + 1, node.getEnd() - 2);
      else if (k === ts.SyntaxKind.TemplateTail) strings.fill(1, node.getStart() + 1, node.getEnd() - 1);
      for (const child of node.getChildren(sf)) visit(child);
    };
    visit(sf);
    const out = f.text.split('');
    for (const [pos, end] of comments) for (let i = pos; i < end; i += 1) if (out[i] !== LF && out[i] !== '\r') out[i] = ' ';
    const tsCode = out.join('');
    const mine = gate.lex(f.text);
    const ok = mine.code === tsCode;
    let stringOff = 0;
    for (let i = 0; i < strings.length; i += 1) if (strings[i] !== mine.inString[i] && tsCode[i] !== ' ' && tsCode[i] !== LF && tsCode[i] !== '\r') stringOff += 1;
    // What matters: would the ratchet count anything else if it had read with the parser?
    // The comment-blanked text is what every rule reads, so count the parser's text with the gate.
    const a = JSON.stringify(gate.countRules(f.text, `src/${f.rel}`));
    const b = JSON.stringify(gate.countRules(tsCode, `src/${f.rel}`));
    if (ok) same += 1;
    else {
      commentDiff += 1;
      const la = mine.code.split(LF);
      const lb = tsCode.split(LF);
      const lines = la.map((l, i) => (l !== lb[i] ? i + 1 : 0)).filter(Boolean);
      console.log(`comments differ  src/${f.rel}  lines ${lines.slice(0, 8).join(', ')}${lines.length > 8 ? ' …' : ''}`);
      for (const n of lines.slice(0, 3)) console.log(`      gate   ${la[n - 1].trim().slice(0, 120)}\n      parser ${lb[n - 1].trim().slice(0, 120)}`);
    }
    if (stringOff) {
      stringDiff += 1;
      console.log(`strings differ   src/${f.rel}  ${stringOff} character(s) marked differently`);
    }
    if (a !== b) {
      countDiff += 1;
      console.log(`COUNTS DIFFER    src/${f.rel}\n      gate   ${a}\n      parser ${b}`);
    }
  }
  console.log(
    `\nlexer: ${files.filter((x) => /\.tsx?$/.test(x.rel)).length} .ts/.tsx file(s) — ${same} with identical comment blanking, ` +
      `${commentDiff} differing, ${stringDiff} with a different string mask, ${countDiff} where the ratchet's counts change`,
  );
  process.exit(countDiff ? 1 : 0);
}

/* ── the ratchet beside the record ────────────────────────────────────────────────────────────── */
const record = JSON.parse(fs.readFileSync(path.resolve(value('--record')), 'utf8'));
const only = value('--rule');
const perFile = new Map(files.map((f) => [f.rel, gate.countRules(f.text, `src/${f.rel}`)]));
const hitsOf = new Map(files.map((f) => [f.rel, gate.scanSource(f.text, `src/${f.rel}`)]));
const inPathspec = (rel, spec) => {
  const outsideUi = spec.some((s) => s.includes('exclude)frontend/src/ui') && !s.includes('tokens.css'));
  const code = spec.some((s) => s.endsWith('*.ts'));
  if (rel === 'ui/tokens/tokens.css' && spec.some((s) => s.includes('tokens.css'))) return false;
  if (outsideUi && rel.startsWith('ui/')) return false;
  return code ? /\.tsx?$/.test(rel) : true;
};
// The record renamed nothing: at the base commit the three steps carry their plain names.
const grepPattern = (id, r) => (flag('--rename-three') && id === 'legacy-type' ? r.pattern.replace('|body|display|micro)', '|body-legacy|display-legacy|micro-legacy)') : r.pattern);

console.log(`tree ${posix(TREE)}${flag('--rename-three') ? ' (F1.4 codemod applied in memory)' : ''}\nrecord ${record.commit}\n`);
console.log(`${'rule'.padEnd(22)} ${'record'.padStart(7)} ${'grep, no comments'.padStart(18)} ${'ratchet'.padStart(8)} ${'diff'.padStart(6)}`);
const detail = [];
for (const id of gate.RULES.map((r) => r.id)) {
  const r = record.rules[id];
  if (!r) continue;
  const ratchet = [...perFile.values()].reduce((n, c) => n + (c[id] ?? 0), 0);
  let blanked = '—';
  const lines = [];
  if (r.pattern && !['legacy-var', 'legacy-variant', 'pill-size'].includes(id)) {
    const re = new RegExp(grepPattern(id, r), 'g');
    let total = 0;
    for (const f of files) {
      if (!inPathspec(f.rel, r.pathspec)) continue;
      const code = gate.lex(f.text, { css: f.rel.endsWith('.css') }).code;
      const raw = new Map();
      const kept = new Map();
      for (const m of f.text.matchAll(re)) raw.set(lineOf(f.text, m.index), (raw.get(lineOf(f.text, m.index)) ?? 0) + 1);
      for (const m of code.matchAll(re)) kept.set(lineOf(code, m.index), (kept.get(lineOf(code, m.index)) ?? 0) + 1);
      total += [...kept.values()].reduce((a, b) => a + b, 0);
      const mine = new Map();
      for (const h of hitsOf.get(f.rel).filter((x) => x.rule === id)) mine.set(lineOf(f.text, h.index), (mine.get(lineOf(f.text, h.index)) ?? 0) + 1);
      for (const n of new Set([...raw.keys(), ...mine.keys()])) {
        const g = raw.get(n) ?? 0;
        const k = kept.get(n) ?? 0;
        const mn = mine.get(n) ?? 0;
        if (g === mn) continue;
        const why = k === mn ? 'comment' : 'rule';
        lines.push(`  ${why.padEnd(8)} ${f.rel}:${n}  grep ${g} / ratchet ${mn}   ${f.text.split(LF)[n - 1].trim().slice(0, 100)}`);
      }
    }
    blanked = String(total);
  } else {
    // Tag scans and the two rules whose record is not one regex: compare per file.
    const theirs = r.perFile ?? {};
    for (const f of files) {
      const g = theirs[f.rel] ?? 0;
      const mn = perFile.get(f.rel)[id] ?? 0;
      if (r.perFile && g !== mn) lines.push(`  file     ${f.rel}  record ${g} / ratchet ${mn}`);
    }
  }
  console.log(`${id.padEnd(22)} ${String(r.occurrences).padStart(7)} ${blanked.padStart(18)} ${String(ratchet).padStart(8)} ${String(ratchet - r.occurrences).padStart(6)}`);
  if (lines.length && (!only || only === id)) detail.push(`\n── ${id}: ${lines.length} line(s) or file(s) differ`, ...lines);
}
if (record.rules['legacy-var'] && (!only || only === 'legacy-var')) {
  // Per token name: the record counts every var(--name) it listed; the ratchet's hits are re-read by name.
  const mine = {};
  for (const f of files) for (const h of hitsOf.get(f.rel).filter((x) => x.rule === 'legacy-var')) {
    const name = /var\(\s*--([a-z0-9-]+)/.exec(f.text.slice(h.index, h.index + 80))[1];
    mine[name] = (mine[name] ?? 0) + 1;
  }
  const theirs = record.rules['legacy-var'].perName;
  detail.push('\n── legacy-var, per token name (record kind / record / ratchet) — only the names that differ');
  for (const name of [...new Set([...Object.keys(theirs), ...Object.keys(mine)])].sort()) {
    const t = theirs[name];
    const counted = t && ['decoration', 'opaque', 'state', 'layout'].includes(t.kind) ? t.occurrences : 0;
    if (counted !== (mine[name] ?? 0)) detail.push(`  --${name.padEnd(28)} ${String(t?.kind ?? 'not listed').padEnd(18)} ${String(counted).padStart(4)} ${String(mine[name] ?? 0).padStart(4)}${t && counted === 0 && t.occurrences ? `   (listed, not summed: ${t.occurrences})` : ''}`);
  }
}
if (!flag('--totals')) console.log(detail.join(LF));
