/**
 * Every module under src/ must PARSE and evaluate.
 *
 * ═══ WHY THIS DID NOT EXIST AND SHOULD HAVE ════════════════════════════════════════════════════
 *
 * The backend has no compile step. Nothing type-checks it, nothing bundles it, and every gate in
 * `check:all` reads the source as TEXT — `check-routes` parses route tables with a regex,
 * `check-worker-tx` counts `.run(` calls, `check-gdpr` prepares SQL strings. None of them asks Node
 * whether the file is valid JavaScript.
 *
 * So a syntax error passes the entire suite. Measured, on the commit that added this: a backtick
 * inside an SQL comment inside a template literal closed the string early, `src/admin/routes.js`
 * became unparseable, `check:all` reported 20/20, and the only thing that noticed was the server
 * failing to boot — which is noticed only by whoever happens to start it. On a machine where the
 * server was already running, that is nobody.
 *
 * Importing is a stronger check than parsing, and deliberately so: it also catches a bad import
 * path, a circular import that throws, and a module-level statement that blows up. Those are all
 * "the server will not start" in the same way.
 *
 * NOT in the same breath as a lint rule: this makes no judgements about style. The question is only
 * whether the file can run at all.
 *
 * Run: npm run check:modules
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = path.join(import.meta.dirname, '..', 'src');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.isFile() && e.name.endsWith('.js') ? [full] : [];
  });

const files = walk(SRC);
const broken = [];

for (const file of files) {
  try {
    await import(pathToFileURL(file).href);
  } catch (err) {
    broken.push({ file: path.relative(path.join(SRC, '..'), file), err });
  }
}

if (broken.length === 0) {
  console.log(`check-modules: OK — all ${files.length} module(s) under src/ parse and evaluate`);
  // The worker pool opens a database connection on import, so leaving it up would hang the process.
  process.exit(0);
}

console.error(`\ncheck-modules: ${broken.length} module(s) cannot be loaded\n`);
for (const b of broken) {
  console.error(`  ${b.file}`);
  console.error(`    ${b.err.constructor.name}: ${b.err.message}`);
  // The first frame that names one of OUR files, which is where the operator has to look.
  const frame = String(b.err.stack ?? '')
    .split('\n')
    .find((l) => l.includes('/src/') || l.includes('\\src\\'));
  if (frame) console.error(`    ${frame.trim()}`);
  console.error('');
}
process.exit(1);
