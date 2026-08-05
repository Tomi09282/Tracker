// scripts/check-languages.mjs — the server and the client must agree on which languages exist.
//
// Two independent lists decide what a user can be shown in:
//   - `languages.enabled` in the database, which is what `resolveLang` will hand back for an
//     `?lang=` parameter or an Accept-Language header;
//   - the `LOCALES` registry in the frontend, which is what actually has UI strings.
//
// When the server list is AHEAD, a German-speaking browser gets German exercise names inside a
// Hungarian interface — the worst of both, and nobody chose it: Accept-Language did.
// When the frontend list is ahead, the switch offers a language the API will refuse to serve
// content in.
//
// Neither failure raises an error at runtime. This script is the only thing that catches them.
//
// SCOPE, learned the hard way: this checks the CONFIGURATION, not the running process. `lang.js`
// caches the enabled set for the lifetime of the process, so enabling a language in the database
// does nothing until the server restarts — and this script will happily report agreement while a
// live server still refuses that language and silently falls back. That cache is a deliberate
// trade (documented in `src/lib/lang.js`), not a bug, but it means a green run here is a claim
// about the database and the bundles, never about what a request will actually get.
//
// Usage: node scripts/check-languages.mjs
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as db from '../src/db/index.js';

const REGISTRY = path.resolve('../frontend/src/i18n/index.ts');

const registrySrc = await fs.readFile(REGISTRY, 'utf8');
const shipped = [...registrySrc.matchAll(/^\s{2}([a-z]{2}):\s*\{\s*label:/gm)].map((m) => m[1]);

if (!shipped.length) {
  // A parse that finds nothing would otherwise "prove" agreement by comparing two empty sets.
  console.error(`check-languages: parsed no locales out of ${REGISTRY} — the registry format changed`);
  process.exit(1);
}

const rows = await db.all('SELECT code, enabled, is_default FROM languages ORDER BY code');
const enabled = rows.filter((r) => r.enabled).map((r) => r.code);
const known = new Set(rows.map((r) => r.code));

const problems = [];

for (const code of enabled) {
  if (!shipped.includes(code)) {
    problems.push(
      `${code} is enabled in the database but has no UI bundle — Accept-Language can select it and the interface will be in another language`,
    );
  }
}
for (const code of shipped) {
  if (!known.has(code)) problems.push(`${code} ships a UI bundle but has no row in \`languages\``);
  else if (!enabled.includes(code)) {
    problems.push(`${code} ships a UI bundle but is disabled in the database — the switch offers a language the API will not serve`);
  }
}

const defaults = rows.filter((r) => r.is_default);
if (defaults.length !== 1) problems.push(`expected exactly one default language, found ${defaults.length}`);
else if (!shipped.includes(defaults[0].code)) {
  problems.push(`the default language ${defaults[0].code} has no UI bundle — the fallback itself is untranslated`);
}

await db.closePool();

if (problems.length) {
  console.error(`\ncheck-languages: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(
  `check-languages: OK — ${enabled.length} enabled (${enabled.join(', ')}), default ${defaults[0].code}, ${rows.length - enabled.length} dormant`,
);
