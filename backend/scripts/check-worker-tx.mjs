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
const src = fs.readFileSync(FILE, 'utf8');
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

    // THE ADR'S OWN EXEMPTION: a changes === 0 probe on a guarded write.
    const window = `${prev}\n${line}`;
    if (/\.changes\s*===\s*0|changes\s*===\s*0/.test(window)) continue;

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
