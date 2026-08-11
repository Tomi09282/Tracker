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

/* ── ONE KEY that was pasted rather than translated ──────────────────────────────────────────────
 *
 * The whole-bundle check above catches a file somebody copied. It does not catch the far more
 * common thing: a single key pasted into another bundle and never translated, which is what happens
 * when somebody adds a feature at the end of a long day.
 *
 * ═══ IT COMPARES AGAINST HUNGARIAN, AND THAT IS THE WHOLE DESIGN ═══════════════════════════════
 *
 * Measured across the 764 keys before choosing the rule:
 *
 *     hu == en:  9 keys        hu == de:  9 keys        en == de: 26 keys
 *
 * English and German share vocabulary — Admin, Import, Playground, Coach — so an en/de comparison
 * is 26 false positives and an allowlist nobody will maintain. Hungarian shares almost nothing with
 * either, so a Hungarian string identical to another language is nearly always one that was never
 * translated. Same nine keys against both, and they are exactly the legitimate ones.
 *
 * The first version of this required a key to be identical in ALL THREE, which is the conservative
 * rule and also the useless one: a key pasted into just one bundle — the common case — slipped
 * straight through. Proved by trying it.
 *
 * `studio.inertShort` was found this way: it read "inert" in Hungarian, which is not a word in
 * Hungarian.
 */
{
  const UNTRANSLATED_BY_DESIGN = new Map([
    ['nav.admin', 'a borrowed word in all three'],
    ['nav.playground', 'the QA page has no product name to translate'],
    ['workout.kg', 'SI unit'],
    ['workout.metres', 'SI unit'],
    ['plans.blockKind.emom', 'a training acronym, said the same in every gym'],
    ['plans.blockKind.amrap', 'the same'],
    ['compose.coverMeta', 'pure format — dimensions and a size, no words'],
    ['adminMetrics.clock.utc', 'a standard, not a word'],
    ['adminUsers.role.admin', 'a borrowed word in all three'],
  ]);

  // The reference bundle is Hungarian — the product's own language, and the one that shares no
  // vocabulary with the other two. See the note above for the measurement behind that choice.
  const PIVOT = 'hu';
  const others = Object.keys(bundles).filter((c) => c !== PIVOT);

  if (bundles[PIVOT] && others.length) {
    const flagged = new Set();
    for (const other of others) {
      for (const [key, value] of bundles[PIVOT]) {
        if (bundles[other].get(key) !== value) continue;
        if (UNTRANSLATED_BY_DESIGN.has(key) || flagged.has(key)) continue;
        flagged.add(key);
        problems.push(
          `"${key}" is the same in ${PIVOT} and ${other}: ${JSON.stringify(value.slice(0, 48))}\n` +
            '      Hungarian shares almost no vocabulary with either other language, so this is very\n' +
            '      likely a string that was pasted rather than translated. Translate it, or add it to\n' +
            '      UNTRANSLATED_BY_DESIGN with the reason it stays.',
        );
      }
    }
    // A stale exemption hides the next regression: the key gets translated, the entry stays, and it
    // waves through whatever takes its place.
    for (const [key, reason] of UNTRANSLATED_BY_DESIGN) {
      if (!bundles[PIVOT].has(key)) {
        problems.push(`UNTRANSLATED_BY_DESIGN names ${key}, which no longer exists — delete the entry`);
      } else if (others.every((c) => bundles[c].get(key) !== bundles[PIVOT].get(key))) {
        problems.push(`UNTRANSLATED_BY_DESIGN lists ${key} (${reason}), and it IS translated now — delete the entry`);
      }
    }
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

/* ── keys the CODE references that no bundle has ─────────────────────────────────────────────────
 *
 * THE MIRROR OF THE CHECK ABOVE, AND IT WAS MISSING FOR FOUR PHASES.
 *
 * This file's own header opens by explaining the exact defect: *"a missing key does not throw.
 * i18next renders the key PATH — a user sees the literal text where a sentence belongs."* Every
 * check under it then compares the bundles to EACH OTHER. Nothing compared the CODE to the
 * bundles, so a key referenced by a component and present in no bundle passed cleanly.
 *
 * Found the way it always is: in a browser. `t('common.add')` rendered as the literal string
 * `common.add` on a button, with this gate green. `common.delete` was the same. Both had been
 * written by hand into new components, in the reasonable belief that a key that basic must exist.
 *
 * **A gate that only checks one direction is a gate with a blind side**, and this is the second one
 * this file has had: `NATIVE_LABELS` guarded three keys that had moved, so it passed forever while
 * checking nothing.
 *
 * `defaultValue` is honoured — `t('x.y', { defaultValue: 'z' })` is a deliberate soft reference and
 * is not a defect.
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

  const seen = new Map(); // key → "file:line"
  for (const file of srcFiles) {
    const rel = path.relative(path.resolve('src'), file).split(path.sep).join('/');
    const lines = (await fs.readFile(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      // Static keys only. A template literal is a dynamic key and is covered by the prefix logic
      // in the dead-key check above; asserting on it here would be guesswork.
      for (const m of line.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) {
        // A soft reference with its own fallback is not a missing string.
        if (line.includes('defaultValue')) continue;
        if (!seen.has(m[1])) seen.set(m[1], `${rel}:${i + 1}`);
      }
    });
  }

  for (const [key, where] of seen) {
    if (ref.has(key)) continue;
    problems.push(`${where} references t('${key}') and no bundle has it — the user sees the key path`);
  }
}

/* ── strings that are ANNOUNCED but never SEEN ───────────────────────────────────────────────────
 *
 * The hardest untranslated string to notice is the one nobody looks at. `ScreenSkeleton` shipped
 * a hardcoded `<span className="sr-only">Loading</span>` — the FIRST thing a Hungarian or German
 * screen-reader user heard on entering the app, in English, for the whole of Phase 1 and 2. No
 * visual review can catch that, and the bundle checks above cannot either: they audit the JSON,
 * not the JSX.
 *
 * So this checks the four places a literal string reaches a user without being visible:
 * `aria-label`, `sr-only` content, `placeholder` and `title`. It found four more in shipped
 * components — a toast dismiss, a sheet close, and two date-picker arrows.
 *
 * The playground and TokenProof are exempt: internal QA pages, deliberately English, never routed.
 */
{
  const EXEMPT = [/^features\/playground\//, /^ui\/TokenProof\.tsx$/];
  const tsxFiles = [];
  const walkTsx = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walkTsx(full);
      else if (entry.name.endsWith('.tsx')) tsxFiles.push(full);
    }
  };
  await walkTsx(path.resolve('src'));

  for (const file of tsxFiles) {
    const rel = path.relative(path.resolve('src'), file).split(path.sep).join('/');
    if (EXEMPT.some((re) => re.test(rel))) continue;
    const lines = (await fs.readFile(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      let m;
      if ((m = line.match(/aria-label="([^"{}]{2,})"/))) {
        problems.push(`${rel}:${i + 1} aria-label="${m[1]}" is a literal — it is announced, so it must be a t() key`);
      }
      if ((m = line.match(/sr-only[^>]*>([^<>{}]{2,})</))) {
        problems.push(`${rel}:${i + 1} sr-only text "${m[1].trim()}" is a literal — it is announced, so it must be a t() key`);
      }
      if ((m = line.match(/(placeholder|title)="([^"{}]{3,})"/))) {
        problems.push(`${rel}:${i + 1} ${m[1]}="${m[2]}" is a literal — it reaches the user, so it must be a t() key`);
      }
    });
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
