// scripts/check-route-tx.mjs — ADR-0005's blind spot, closed.
//
// ═══ THE GATE WRITTEN TO ENFORCE ADR-0005 COULD NOT SEE THIS ═══════════════════════════════════
//
// `check-worker-tx` walks `src/db/worker.js` and forbids a conditional return after a write inside
// a transaction body, because `.transaction()` COMMITS ON RETURN. It has caught real defects.
//
// It cannot see this one, because this one is not in the worker:
//
//     const [updated] = await db.writeTx([
//       { sql: `UPDATE exercises SET status = 'global' WHERE id = ? AND status = 'pending_review'` },
//       { sql: `INSERT INTO audit_log (...) VALUES (?, 'exercise.moderation.approve', ...)` },
//     ]);
//     if (updated.changes === 0) return sendError(res, 409, ERR.CONFLICT, 'already decided');
//
// `writeTx` runs every step and commits before it returns. By the time the route reads `changes`,
// BOTH statements are durable — so a decision that was refused with a 409 still wrote an audit row
// saying an admin approved the thing. Measured on the dev database, not argued:
//
//     first  decide: UPDATE changed 1 row(s) -> 200      audit rows: 1
//     second decide: UPDATE changed 0 row(s) -> 409      audit rows: 2
//
// The log now holds one approval that happened and one that did not, and nothing tells them apart.
// An audit trail that records events which were refused is worse than none, because it is trusted.
//
// THE RULE: if a route destructures a `db.writeTx([...])` result and then branches on that step's
// `changes === 0`, the array must not contain anything after it. A guarded write whose outcome the
// route inspects belongs in a NAMED worker transaction — which is the house rule anyway: business-
// critical writes never use the generic `writeTx`.
//
// A single-step `writeTx` is fine and is not flagged: there is nothing after the guard to commit.
//
// Run: node scripts/check-route-tx.mjs
import fs from 'node:fs';
import { parseRoutes } from './lib/parse-routes.mjs';

const ROOT = 'src';
const { routes, suspects, files } = parseRoutes(ROOT);
const problems = [];

for (const s of suspects) {
  problems.push(`${s.file}:${s.line} — unparseable route registration (${s.why}); it cannot be checked`);
}

/** Walk from an opening bracket to its match so a nested array cannot end the list early. */
function matchBracket(src, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    if (src[i] === open) depth += 1;
    else if (src[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

let inspected = 0;

for (const r of routes) {
  /*
   * ═══ EVERY CALL SITE, NOT EVERY DESTRUCTURE ══════════════════════════════════════════════════
   *
   * The first version matched only `const [x] = await db.writeTx([` — the destructured form, on the
   * reasoning that a route which ignores the result has nothing to branch on. That reasoning is
   * sound and the regex was still wrong, because it made the gate's SUBJECT the shape rather than
   * the call.
   *
   * Measured on HEAD: nine routes call `db.writeTx` and the gate inspected ZERO of them. It printed
   * `0 inspected db.writeTx result(s)` and then `OK` — and that number went past me twice.
   *
   * A clean result is a statement about COVERAGE before it is a statement about the subject. This
   * gate was written to catch a defect of exactly that shape, and it had the same one.
   *
   * So: find every call, capture however it is captured, and flag when the result is branched on.
   */
  const re = /(?:(?:const|let|var)\s*(?:\[\s*(\w+)[^\]]*\]|(\w+))\s*=\s*)?await\s+db\.writeTx\(\s*\[/g;
  let m;
  while ((m = re.exec(r.handler))) {
    inspected += 1;
    const binding = m[1] ?? m[2];
    // Nothing captured the result, so nothing can branch on it. Counted as inspected — that is the
    // difference between "checked and fine" and "never looked at".
    if (!binding) continue;

    // Does anything branch on this binding's changes? Both the destructured (`x.changes`) and the
    // whole-array (`x[0].changes`) forms, because both are ways of reading the guarded write.
    const branch = new RegExp(
      `if\\s*\\(\\s*${binding}(?:\\[\\d+\\])?\\.changes\\s*(?:===\\s*0|!==)`,
    );
    if (!branch.test(r.handler)) continue;

    // How many steps are in the array? One is safe — nothing follows the guard.
    const arrayStart = m.index + m[0].length - 1;
    const arrayEnd = matchBracket(r.handler, arrayStart, '[', ']');
    const body = arrayEnd === -1 ? r.handler.slice(arrayStart) : r.handler.slice(arrayStart, arrayEnd);
    const steps = (body.match(/\bsql\s*:/g) ?? []).length;
    if (steps <= 1) continue;

    problems.push(
      `${r.key} (${r.file}:${r.line}) branches on \`${binding}.changes === 0\` after a ${steps}-step db.writeTx.\n` +
        '      writeTx COMMITS every step before it returns, so the refusal this route is about to\n' +
        `      send arrives with the other ${steps - 1} statement(s) already durable.\n` +
        '      Move it to a NAMED worker transaction with the guard inside — the house rule for any\n' +
        '      business-critical write — or make the writeTx a single statement.',
    );
  }
}

/*
 * ═══ THE GATE CHECKS ITS OWN COVERAGE ══════════════════════════════════════════════════════════
 *
 * Zero inspected sites in a codebase that plainly calls `db.writeTx` does not mean there is nothing
 * wrong — it means nothing was looked at, and printing OK underneath that is the failure this whole
 * file exists to prevent, committed by the file itself. It happened: nine call sites, zero
 * inspected, OK.
 *
 * So the count is asserted against a plain grep of the source. The grep is deliberately crude and
 * independent of the parser above: if the two disagree, the parser is the one that is wrong.
 */
{
  const grepped = files.reduce(
    (n, f) => n + (fs.readFileSync(f, 'utf8').match(/\bdb\.writeTx\s*\(/g) ?? []).length,
    0,
  );
  if (grepped > 0 && inspected === 0) {
    problems.push(
      `${grepped} call(s) to db.writeTx exist in src/ and this gate inspected NONE of them.\n` +
        '      An OK printed under a zero is a statement about coverage wearing the clothes of a\n' +
        '      statement about the code. Fix the matcher — do not adjust this check.',
    );
  }
  if (inspected < grepped) {
    console.log(
      `                (${grepped} db.writeTx call(s) in src/, ${inspected} reachable through a parsed route)`,
    );
  }
}

console.log(
  `check-route-tx: ${routes.length} routes — ${inspected} inspected db.writeTx result(s)`,
);

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  ${p}`);
  console.log(`\ncheck-route-tx FAILED — ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('check-route-tx: OK — no route refuses after committing the rest of its transaction');
