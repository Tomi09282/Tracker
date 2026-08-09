#!/usr/bin/env node
/**
 * check-body-writes.mjs — the four columns that must agree, enforced at build time.
 *
 * `body_src`, `body_doc`, `body_excerpt` and `doc_version` are four representations of one text,
 * and NO TRIGGER CAN CHECK THE ONE THING THAT MATTERS: SQLite has no markdown parser, so nothing in
 * the database ever verifies that `body_doc` is the parse of `body_src`. 022 added a trigger that
 * refuses a doc moving on its own, which is the half a database CAN see; this is the other half.
 *
 * Migration 021 delegated a control to a function nobody wrote and said so in a comment that stayed
 * true for months. This file exists so the same thing cannot happen to the body rule: it does not
 * describe the control, it IS the control, and it reads the REAL source rather than carrying a copy
 * of what it audits.
 *
 * Run: npm run check:body-writes  (and inside check:all)
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve('src');
const problems = [];

/** Files allowed to touch the parser. Everything else must go through `buildBody`. */
const PARSER_OWNERS = new Set([
  path.join(SRC, 'public', 'markdown.js'),
  path.join(SRC, 'public', 'body.js'),
]);

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.name.endsWith('.js')) yield full;
  }
}

/**
 * Blank out comments before matching, keeping the byte offsets so line numbers stay honest.
 *
 * Without this the gate flags the doc-comment that DESCRIBES the rule — `body.js` explains that a
 * route writing `doc_version = 1` mints a second definition, and the sentence saying so was the
 * first thing this file rejected. `check-tokens` learned the same lesson twice this phase. A gate
 * that punishes the note explaining it is a gate people stop writing notes for.
 *
 * Comments are replaced by spaces rather than removed, so `text.slice(0, index).split('\n').length`
 * still counts the right number of lines.
 */
const withoutComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

for await (const file of walk(SRC)) {
  const raw = await fs.readFile(file, 'utf8');
  const text = withoutComments(raw);
  const rel = path.relative(process.cwd(), file);

  /*
   * (1) EVERY STATEMENT THAT MOVES A DOC MOVES ITS WHOLE FAMILY.
   *
   * Template literals are the unit rather than lines, because these statements are written across
   * several lines and a per-line check would see `body_doc` alone in every one of them.
   *
   * A statement that writes the doc without the source is the exact drift 022's trigger refuses at
   * runtime; catching it here means the refusal never has to happen in front of a coach.
   */
  for (const m of text.matchAll(/`([^`]*)`/g)) {
    const sql = m[1];
    if (!/\b(INSERT|UPDATE)\b/i.test(sql)) continue;

    const writesPostDoc = /\bbody_doc\b/.test(sql);
    const writesBioDoc = /\bbio_doc\b/.test(sql);
    if (!writesPostDoc && !writesBioDoc) continue;

    const line = text.slice(0, m.index).split('\n').length;

    if (writesPostDoc) {
      const missing = ['body_src', 'body_excerpt', 'doc_version'].filter((c) => !new RegExp(`\\b${c}\\b`).test(sql));
      if (missing.length) {
        problems.push(
          `${rel}:${line} writes body_doc without ${missing.join(', ')} — the four columns move together or not at all`,
        );
      }
    }
    if (writesBioDoc) {
      // A bio has no excerpt column: three, not four.
      const missing = ['bio_src', 'doc_version'].filter((c) => !new RegExp(`\\b${c}\\b`).test(sql));
      if (missing.length) {
        problems.push(`${rel}:${line} writes bio_doc without ${missing.join(', ')}`);
      }
    }
  }

  /*
   * (2) ONE PRODUCER.
   *
   * The parser is called in `body.js` and nowhere else, so there is exactly one answer to "what is
   * the doc for this source". A second call site — in a route, in a seed, in a worker — is a second
   * producer, and two producers of the same derived value is this project's number-one defect.
   *
   * The worker especially: parsing there would put CPU work on the SQL thread AND make a
   * `MarkdownError` reachable after a write has already committed.
   */
  if (!PARSER_OWNERS.has(file)) {
    for (const fn of ['parseBody', 'excerptOf', 'assertDocShape']) {
      const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
      for (const m of text.matchAll(re)) {
        const line = text.slice(0, m.index).split('\n').length;
        problems.push(`${rel}:${line} calls ${fn}() — the parser has one caller, src/public/body.js`);
      }
    }
  }

  /*
   * (3) THE VERSION IS READ, NEVER TYPED.
   *
   * `version: 1` exists in exactly one place, inside the parser's own return. A route or a worker
   * assigning `doc_version = 1` mints a second definition of the document grammar's version, and
   * the day the grammar moves, that literal is what silently disagrees with it.
   */
  for (const m of text.matchAll(/doc_version\s*(?:=|:)\s*(\d+)/g)) {
    const line = text.slice(0, m.index).split('\n').length;
    problems.push(`${rel}:${line} assigns doc_version = ${m[1]} — read it off the parser's return`);
  }
}

if (problems.length) {
  console.error(`check-body-writes: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nThe four body columns are four views of one text. Nothing in SQLite can check');
  console.error('that the doc is the parse of the source, so this is where that is enforced.');
  process.exit(1);
}

console.log('check-body-writes: OK — one producer, one version, and the columns move together');
