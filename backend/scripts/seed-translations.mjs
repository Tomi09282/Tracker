// scripts/seed-translations.mjs — imports every language wger publishes.
//
// Written after a real bug: the first import hardcoded `language === 12` as Hungarian. Twelve
// is FRENCH, and wger has no Hungarian at all — so 582 rows of French sat in the database
// labelled `hu`, and the app would have shown French text to Hungarian users.
//
// The fix is not a better guess. This script asks wger for its language table and maps by the
// ISO code the API itself reports, so a renumbering upstream cannot silently mislabel content
// again. Everything wger offers is imported; which languages the PRODUCT serves is a separate
// decision, controlled by the `languages` table.
//
// Usage: node scripts/seed-translations.mjs [--purge-bad]
import 'dotenv/config';
import * as db from '../src/db/index.js';
import { normalizeText } from '../src/lib/normalize.js';

const WGER_BASE = 'https://wger.de/api/v2';
const log = (...m) => console.error('[i18n]', ...m);

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'tracker-seed/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const stripHtml = (s) =>
  (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

// --- 1. the authoritative language map -------------------------------------------------------
const langPage = await fetchJson(`${WGER_BASE}/language/?limit=100`);
const langById = new Map(langPage.results.map((l) => [l.id, l.short_name.toLowerCase()]));
log(`wger publishes ${langById.size} languages: ${[...new Set(langById.values())].sort().join(', ')}`);
if ([...langById.values()].includes('hu')) log('note: wger now HAS Hungarian');
else log('note: wger has NO Hungarian — hu content must come from elsewhere');

// --- 2. drop anything the bad mapping wrote --------------------------------------------------
if (process.argv.includes('--purge-bad')) {
  // Every `hu` row currently in the table came from the mislabelling; wger cannot have produced
  // a genuine one. Deleting by origin='dataset' leaves any human translation untouched.
  const removed = await db.run("DELETE FROM exercise_translations WHERE lang = 'hu' AND origin = 'dataset'");
  log(`purged ${removed.changes} mislabelled 'hu' rows`);
}

// --- 3. import every translation, keyed by the real ISO code ---------------------------------
const bySourceUid = new Map(
  (await db.all("SELECT id, source_uid FROM exercises WHERE source = 'wger' AND source_uid IS NOT NULL")).map(
    (r) => [r.source_uid, r.id],
  ),
);
log(`${bySourceUid.size} wger-sourced exercises in the library`);

let url = `${WGER_BASE}/exerciseinfo/?limit=100&offset=0`;
let pages = 0;
let written = 0;
const perLang = new Map();

while (url && pages < 40) {
  const page = await fetchJson(url);
  pages += 1;

  for (const item of page.results ?? []) {
    const exerciseId = bySourceUid.get(String(item.id ?? item.uuid));
    if (!exerciseId) continue;

    for (const tr of item.translations ?? []) {
      const code = langById.get(tr.language);
      // Only two-letter ISO codes: the column CHECK enforces that shape, and a code we cannot
      // map is better skipped than stored under a guess.
      if (!code || !/^[a-z]{2}$/.test(code)) continue;
      const name = tr.name?.trim();
      if (!name) continue;

      const description = stripHtml(tr.description).slice(0, 4000) || null;
      await db.run(
        `INSERT INTO exercise_translations (exercise_id, lang, name, normalized_name, description, origin)
         VALUES (?, ?, ?, ?, ?, 'dataset')
         ON CONFLICT(exercise_id, lang) DO UPDATE SET
           name = excluded.name,
           normalized_name = excluded.normalized_name,
           description = COALESCE(excluded.description, exercise_translations.description)`,
        [exerciseId, code, name, normalizeText(name), description],
      );
      written += 1;
      perLang.set(code, (perLang.get(code) ?? 0) + 1);
    }
  }
  url = page.next ?? null;
}

log(`${written} translation rows written over ${pages} pages`);
log(
  'per language: ' +
    [...perLang.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}=${n}`).join(', '),
);

// --- 4. register every language that now has content ------------------------------------------
// The row is created disabled: having text is not the same as being ready to ship. Enabling a
// language is a deliberate product decision, made by flipping `enabled`.
for (const code of perLang.keys()) {
  await db.run(
    `INSERT OR IGNORE INTO languages (code, name_en, name_native, is_default, enabled, sort_order)
     VALUES (?, ?, ?, 0, 0, 100)`,
    [code, code, code],
  );
}

const summary = await db.all(
  `SELECT l.code, l.enabled, COUNT(t.id) AS rows
     FROM languages l LEFT JOIN exercise_translations t ON t.lang = l.code
    GROUP BY l.code ORDER BY rows DESC`,
);
log('library languages: ' + summary.map((s) => `${s.code}${s.enabled ? '' : '(off)'}=${s.rows}`).join(', '));

await db.closePool();
