// scripts/check-worker-tx.mjs — ADR-0005 enforced instead of remembered.
//
// **better-sqlite3's `.transaction()` COMMITS ON RETURN. Only `throw` rolls back.**
//
// ADR-0005 was written after this cost the project a real bug: a worker function ran its UPDATE,
// then hit a validation failure and did `return { code: 'VALIDATION' }`. The client got a 400 and
// the write silently persisted. The ADR's third clause is a code-review checklist item — "grep the
// tx body for `run(` followed by a conditional `return`" — and a checklist item is exactly the kind
// of thing that holds until the reviewer is tired. This is that grep, in the build.
//
// THE RULE: inside a transaction body, after the first write statement, a conditional `return` is
// forbidden. All validation that can produce an error result runs BEFORE the first write.
//
// THE EXEMPTION, and it is the ADR's own: a `changes === 0` probe. The guard lives in the SQL
// (`UPDATE ... WHERE <ownership>`), the statement wrote nothing, and committing nothing is a no-op.
// That is the codebase's dominant safe pattern and it must not be flagged.
import fs from 'node:fs';
import path from 'node:path';

const FILE = 'src/db/worker.js';
const raw = fs.readFileSync(FILE, 'utf8');

/**
 * ═══ COMMENTS ARE BLANKED BEFORE ANY OF THIS COUNTS ANYTHING ═══════════════════════════════════
 *
 * This gate counts writes and looks for `changes === 0` in a two-line window. Both were reading
 * COMMENTS as code, and it fails in both directions:
 *
 *   * TOO STRICT — a comment above a transaction that mentions `.run(` inflates the write count and
 *     revokes the ADR's own exemption from a probe that deserves it. That happened while fixing the
 *     moderation transaction: a comment explaining this very gate was counted as a second write.
 *
 *   * TOO LOOSE, and this is the one that matters — the window that grants the exemption is the
 *     current line plus THE LINE ABOVE, which is usually a comment. A comment reading "we do not
 *     probe changes === 0 here" sitting above a genuine conditional return after a write would
 *     satisfy the exemption test and wave the defect straight through. The gate would go quiet
 *     because of a sentence describing the opposite of what the code does.
 *
 * So comments are replaced with spaces first. Positions and line numbers are preserved exactly —
 * every offset below still points at the real file — but nothing inside a comment can be mistaken
 * for a statement.
 */
function blankComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      // Newlines are kept so every line number downstream is still the file's own.
      out += text.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) {
        if (text[j] === '\\') j += 1;
        j += 1;
      }
      out += text.slice(i, Math.min(j + 1, text.length));
      i = j + 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const src = blankComments(raw);
const lines = src.split('\n');

/** Walk from an opening brace to its match, so a nested block cannot end the body early. */
function bodyEnd(from) {
  let depth = 0;
  for (let i = from; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return src.length;
}

const problems = [];
let transactions = 0;

const open = /conn\.transaction\(\(\)\s*=>\s*\{/g;
let m;
while ((m = open.exec(src))) {
  transactions += 1;
  const start = m.index + m[0].length - 1;
  const end = bodyEnd(start);
  const body = src.slice(start, end);
  const bodyLineOffset = src.slice(0, start).split('\n').length;

  const firstWrite = body.search(/\)\s*\.run\(|\.run\(/);
  if (firstWrite === -1) continue; // a read-only transaction has nothing to commit wrongly

  // Every `return` after the first write.
  const after = body.slice(firstWrite);
  const ret = /return\b[^\n;]*/g;
  let r;
  while ((r = ret.exec(after))) {
    const absolute = firstWrite + r.index;
    const lineInBody = body.slice(0, absolute).split('\n').length - 1;
    const lineNo = bodyLineOffset + lineInBody;
    const line = lines[lineNo - 1] ?? '';

    // Is this return CONDITIONAL? Either `if (...) return` on one line, or a return sitting inside
    // an `if` block. The cheap and reliable signal is an `if` on the same line or the line above.
    const prev = lines[lineNo - 2] ?? '';
    const conditional = /\bif\s*\(/.test(line) || /\bif\s*\([^)]*\)\s*\{?\s*$/.test(prev);
    if (!conditional) continue;

    /*
     * THE ADR'S OWN EXEMPTION: a `changes === 0` probe on a guarded write.
     *
     * ═══ AND IT IS ONLY SOUND ON THE FIRST WRITE ═══════════════════════════════════════════════
     *
     * The exemption's whole argument is the sentence at the top of this file: "the statement wrote
     * nothing, and committing nothing is a no-op". That holds when the guarded write is the ONLY
     * write so far. It stops holding the moment something else has already run — then the return
     * commits THAT, and the caller is told the operation failed.
     *
     * This gate used to apply the exemption after any write, and a mutation test caught it: planting
     * `if (published.changes === 0) return { outcome: 'missing' };` after an earlier write left the
     * gate GREEN. That is the exact shape of the only FATAL finding in the composer review — a cover
     * soft-deleted, then a guarded write, then a conditional return, which destroys the image and
     * answers 404. The gate written to enforce ADR-0005 could not see the defect ADR-0005 is about.
     *
     * So the exemption now requires that exactly one write precedes this return.
     */
    const writesBefore = (body.slice(0, absolute).match(/\.run\(/g) ?? []).length;
    const window = `${prev}\n${line}`;
    if (writesBefore <= 1 && /\.changes\s*===\s*0|changes\s*===\s*0/.test(window)) continue;

    problems.push(
      `${FILE}:${lineNo} — conditional return AFTER a write inside a transaction.\n` +
        `      ${line.trim()}\n` +
        `      better-sqlite3 COMMITS ON RETURN (ADR-0005). Move the check before the first write,\n` +
        `      or throw so the transaction rolls back.`,
    );
  }
}

console.log(`check-worker-tx: ${transactions} transaction bodies scanned`);
if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  ${p}`);
  console.log(`\ncheck-worker-tx FAILED — ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('check-worker-tx: OK — no conditional return after a write');
