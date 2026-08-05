// scripts/seed-smoke-languages.mjs — switch German on for a smoke run.
//
// The suite runs against a throwaway database, which starts with exactly what the migrations put
// there: every language present, only Hungarian and English enabled. Without this, every language
// looks equally untranslated and the fallback chain cannot be told apart from a broken one.
//
// A separate file rather than an inline `node -e` in the harness: the quoting was unreadable, and
// an unreadable setup step is one nobody checks when a language test starts failing.
//
// Usage: node scripts/seed-smoke-languages.mjs
import 'dotenv/config';
import * as db from '../src/db/index.js';

const changed = (await db.run("UPDATE languages SET enabled = 1 WHERE code = 'de'")).changes;
const labels = (await db.get('SELECT COUNT(*) AS n FROM taxonomy_translations')).n;
const enabled = (await db.all('SELECT code FROM languages WHERE enabled = 1 ORDER BY code')).map((r) => r.code);

console.log(`seed-smoke-languages: de +${changed}, ${labels} taxonomy labels, enabled: ${enabled.join(', ')}`);

if (!enabled.includes('de') || labels === 0) {
  // Fail loudly. If this silently no-ops, the language checks fail later with a confusing message
  // about German that has nothing to do with the code under test.
  console.error('seed-smoke-languages: German is not usable — the language checks would be testing nothing');
  process.exit(1);
}

await db.closePool();
