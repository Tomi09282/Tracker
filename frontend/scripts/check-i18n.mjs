// scripts/check-i18n.mjs — every shipped language carries every key, and nothing else.
//
// Why this is a build gate rather than a habit: a missing key does not throw. i18next renders the
// key PATH — a German user sees the literal text `coaching.profileDraft` where a sentence belongs.
// That is a defect no test exercises and no reviewer notices, because reviewers read the language
// they speak.
//
// It also catches the opposite: a key that exists in one bundle only. That is dead weight at best,
// and at worst it is a string someone wrote for a screen they forgot to translate elsewhere.
//
// Three further checks, each earned by a real failure mode:
//   - Interpolation placeholders must match. `{{count}}` translated as `{{Anzahl}}` renders the
//     literal braces to the user.
//   - The native language labels must be IDENTICAL across bundles. "Deutsch" translated to
//     "Német" defeats the entire purpose of a language switch.
//   - A bundle must not be a copy of another. An untranslated file that was duplicated as a
//     placeholder passes every check above while showing English to a German.
//
// Usage: node scripts/check-i18n.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const DIR = path.resolve('src/i18n');
const REFERENCE = 'hu'; // The product's first language, so it is the one that defines the key set.

const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.json'));
if (!files.includes(`${REFERENCE}.json`)) {
  console.error(`check-i18n: the reference bundle ${REFERENCE}.json is missing`);
  process.exit(1);
}

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v, `${prefix}${k}.`)
      : [[`${prefix}${k}`, String(v)]],
  );

const bundles = {};
for (const f of files) {
  const code = path.basename(f, '.json');
  bundles[code] = new Map(flatten(JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8'))));
}

// The registry is the list that matters — a stray JSON file that nothing imports is not a
// language, and failing on it would block the build for a file with no effect.
const registrySrc = await fs.readFile(path.join(DIR, 'index.ts'), 'utf8');
const registered = [...registrySrc.matchAll(/^\s{2}([a-z]{2}):\s*\{\s*label:/gm)].map((m) => m[1]);

const problems = [];

for (const code of registered) {
  if (!bundles[code]) problems.push(`${code} is in the LOCALES registry but has no ${code}.json`);
}
for (const code of Object.keys(bundles)) {
  if (!registered.includes(code)) {
    problems.push(`${code}.json exists but is not in the LOCALES registry — it will never load`);
  }
}

const ref = bundles[REFERENCE];
const placeholders = (s) => [...s.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1]).sort().join(',');
/**
 * The native-label check USED to guard `common.hungarian` / `common.english` / `common.german`.
 * Those keys were deleted on 2026-08-06 — the labels moved into the LOCALES registry in
 * `i18n/index.ts`, where they are plain strings and cannot be translated by anyone.
 *
 * That is a strictly better home, and it also means this loop had been silently guarding nothing:
 * `ref.has(key)` was false for all three, so every iteration was a no-op. **A check whose subject
 * has moved does not fail — it passes, quietly, forever.** The list is kept empty and named rather
 * than deleted, so the next person adding a must-not-translate key has somewhere obvious to put it.
 */
const NATIVE_LABELS = [];

for (const [code, bundle] of Object.entries(bundles)) {
  if (code === REFERENCE) continue;

  const missing = [...ref.keys()].filter((k) => !bundle.has(k));
  const extra = [...bundle.keys()].filter((k) => !ref.has(k));
  if (missing.length) problems.push(`${code}: missing ${missing.length} key(s) — ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`);
  if (extra.length) problems.push(`${code}: has ${extra.length} key(s) ${REFERENCE} does not — ${extra.slice(0, 8).join(', ')}${extra.length > 8 ? ' …' : ''}`);

  for (const [key, value] of bundle) {
    const refValue = ref.get(key);
    if (refValue === undefined) continue;
    if (placeholders(refValue) !== placeholders(value)) {
      problems.push(`${code}: placeholders differ at "${key}" — ${REFERENCE} has {${placeholders(refValue)}}, ${code} has {${placeholders(value)}}`);
    }
  }

  for (const key of NATIVE_LABELS) {
    if (ref.has(key) && bundle.has(key) && ref.get(key) !== bundle.get(key)) {
      problems.push(`${code}: "${key}" must stay in its own language — expected "${ref.get(key)}", found "${bundle.get(key)}"`);
    }
  }

  // A bundle that is byte-identical to another was copied and never translated.
  for (const [other, otherBundle] of Object.entries(bundles)) {
    if (other >= code) continue;
    const same = [...bundle].filter(([k, v]) => otherBundle.get(k) === v).length;
    if (same === bundle.size) problems.push(`${code}.json is identical to ${other}.json — it was copied, not translated`);
  }
}

/* ── keys no code references ─────────────────────────────────────────────────────────────────────
 *
 * A dead key is not merely waste. It is a claim that a feature exists — the next person reads
 * `workout.interval.emomDone` and reasonably assumes there is an EMOM done button. And a key that
 * duplicates one already present is worse: this check found `workout.retry` sitting beside a
 * `common.retry` that said the same thing, which is the same "collapse to one definition" failure
 * this codebase keeps finding in predicates, applied to copy.
 *
 * Template keys — `t(\`workout.record.${kind}\`)` — are resolved by checking whether any PREFIX of
 * the key appears before an interpolation. Without that, every dynamic key would read as dead.
 */
{
  const srcFiles = [];
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) srcFiles.push(full);
    }
  };
  await walk(path.resolve('src'));
  const code = (await Promise.all(srcFiles.map((f) => fs.readFile(f, 'utf8')))).join('\n');

  const reference = bundles[REFERENCE];
  for (const key of reference.keys()) {
    if (code.includes(`'${key}'`) || code.includes(`"${key}"`) || code.includes(`\`${key}\``)) continue;
    // A dynamic key: some prefix of it is built by interpolation.
    const parts = key.split('.');
    let dynamic = false;
    for (let i = parts.length - 1; i > 0 && !dynamic; i -= 1) {
      const prefix = `${parts.slice(0, i).join('.')}.`;
      if (code.includes(`${prefix}\${`) || code.includes(`${prefix}\``)) dynamic = true;
    }
    if (!dynamic) problems.push(`${key} is in every bundle and referenced by no code — delete it or use it`);
  }
}

if (problems.length) {
  console.error(`\ncheck-i18n: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(
  `check-i18n: OK — ${registered.length} language(s) (${registered.join(', ')}), ${ref.size} keys each`,
);
