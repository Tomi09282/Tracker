/**
 * import-usda — load a USDA FoodData Central export into `foods`, from a LOCAL FILE.
 *
 * ═══ THERE IS NO NETWORK IN THIS SCRIPT, AND THAT IS THE DESIGN ════════════════════════════════
 *
 * T4.1.4 asked for an SSRF guard on outbound USDA fetches: an allowlisted host, a validated URL,
 * never a user-supplied one. The strongest form of that guard is not to make the request. So this
 * reads a file the operator downloaded themselves, and the product ships with no outbound HTTP
 * client, no API key, and no code path where a URL from anywhere reaches a fetch.
 *
 * What that buys, beyond the obvious:
 *
 *   - **The app works offline.** It is a Capacitor app. A food search that needs the internet is a
 *     food search that fails in a gym basement, which is where it is used.
 *   - **No key to leak.** A key that does not exist cannot appear in a log, a commit or an error.
 *   - **No third party in the request path.** USDA's uptime is not this product's uptime, and a
 *     rate limit on a shared key is not a failure mode anyone can debug from a phone.
 *
 * The starter database (95 curated foods, three languages) is in migration 016 rather than here,
 * because reference data belongs in a migration: a table whose contents depend on whether somebody
 * remembered a command is a table nobody can reason about. This script is for going BIGGER.
 *
 * ═══ USAGE ════════════════════════════════════════════════════════════════════════════════════
 *
 *   1. Download an export from https://fdc.nal.usda.gov/download-datasets — "Foundation Foods"
 *      (~300 rows, highest quality) or "SR Legacy" (~7 800 rows, the classic reference set),
 *      in JSON.
 *   2. Unzip it.
 *   3. node scripts/import-usda.mjs path/to/FoodData_Central_*.json [--limit N] [--dry-run]
 *
 * Upserts on (source, source_ref), so re-running updates rather than duplicating, and never
 * touches the 'system' rows from 016 — those carry 'system' source_refs and these carry 'usda'
 * ones, so the two sets cannot collide.
 *
 * ═══ WHAT IS THROWN AWAY, AND WHY ═════════════════════════════════════════════════════════════
 *
 * A row is SKIPPED rather than guessed at when it has no energy value or no macro breakdown. An
 * imported food with a silent zero for protein is worse than a missing food: the missing one sends
 * the user to the manual-entry path, and the wrong one is trusted.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { all, run, closePool } from '../src/db/index.js';
import { normalizeText } from '../src/lib/normalize.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

if (!file) {
  console.error('usage: node scripts/import-usda.mjs <FoodData_Central_*.json> [--limit=N] [--dry-run]');
  process.exit(1);
}

// The one path check worth making: the argument is an operator-supplied local path, and it must
// resolve to a real readable file. This is not a security boundary — whoever runs this already has
// a shell — it is a clear error instead of a confusing one.
const resolved = path.resolve(file);
const stat = await fs.stat(resolved).catch(() => null);
if (!stat?.isFile()) {
  console.error(`not a readable file: ${resolved}`);
  process.exit(1);
}

console.log(`reading ${resolved} (${(stat.size / 1024 / 1024).toFixed(1)} MB)…`);
const raw = JSON.parse(await fs.readFile(resolved, 'utf8'));

// FDC ships several envelope shapes depending on the dataset. Accept the ones that exist rather
// than assuming one — a downloader who picked a different file should get data, not a stack trace.
const items =
  raw.FoundationFoods ?? raw.SRLegacyFoods ?? raw.SurveyFoods ?? raw.BrandedFoods ?? (Array.isArray(raw) ? raw : null);

if (!items) {
  console.error(`unrecognised FDC envelope; top-level keys: ${Object.keys(raw).join(', ')}`);
  process.exit(1);
}
console.log(`${items.length} rows in the export`);

/**
 * FDC nutrient ids, which are stable across datasets. Named rather than inlined because a bare
 * `1003` in a condition is unreviewable.
 */
const NUTRIENT = { ENERGY_KCAL: 1008, PROTEIN: 1003, FAT: 1004, CARB: 1005, FIBER: 1079 };

/** Grab one nutrient's amount, or null. FDC nests it two different ways; handle both. */
const amountOf = (row, id) => {
  for (const n of row.foodNutrients ?? []) {
    const nid = n.nutrient?.id ?? n.nutrientId;
    if (nid === id) {
      const v = n.amount ?? n.value;
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
  }
  return null;
};

// Counted by DIFFERENCE rather than per row. An upsert reports `changes = 1` whether it inserted
// or updated, so a per-row `if (changes === 1) inserted++` reads as "everything was new" on a
// re-import — a number that is always the flattering one is not a measurement.
const [beforeRow] = await all(`SELECT COUNT(*) AS n FROM foods WHERE source = 'usda'`);
const before = beforeRow.n;

let written = 0;
let skippedNoEnergy = 0;
let skippedNoMacros = 0;
let skippedOutOfRange = 0;
let seen = 0;

for (const row of items) {
  if (seen >= limit) break;
  seen += 1;

  const name = (row.description ?? '').trim();
  const fdcId = row.fdcId;
  if (!name || !fdcId) continue;

  const kcal = amountOf(row, NUTRIENT.ENERGY_KCAL);
  const protein = amountOf(row, NUTRIENT.PROTEIN);
  const carb = amountOf(row, NUTRIENT.CARB);
  const fat = amountOf(row, NUTRIENT.FAT);
  const fiber = amountOf(row, NUTRIENT.FIBER);

  if (kcal == null) {
    skippedNoEnergy += 1;
    continue;
  }
  if (protein == null || carb == null || fat == null) {
    skippedNoMacros += 1;
    continue;
  }

  // The column CHECKs are the authority on what is storable. Filtering here rather than letting
  // the INSERT abort means one bad row does not end a 7 800-row import — and the count is
  // reported, so a large number is visible rather than silent.
  const kcalX10 = Math.round(kcal * 10);
  const pMg = Math.round(protein * 1000);
  const cMg = Math.round(carb * 1000);
  const fMg = Math.round(fat * 1000);
  const fibMg = fiber == null ? null : Math.round(fiber * 1000);
  if (
    kcalX10 < 0 || kcalX10 > 9000 ||
    pMg < 0 || pMg > 100000 ||
    cMg < 0 || cMg > 100000 ||
    fMg < 0 || fMg > 100000 ||
    (fibMg != null && (fibMg < 0 || fibMg > 100000))
  ) {
    skippedOutOfRange += 1;
    continue;
  }

  if (dryRun) {
    written += 1;
    continue;
  }

  // ONE statement, upserting on the unique index. `verified = 1` because this came from a curated
  // government dataset, which is what the flag means and the only place it is ever set.
  await run(
    `INSERT INTO foods (source, source_ref, name, normalized_name, kcal_per_100g_x10,
                        protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g,
                        fiber_mg_per_100g, verified)
          VALUES ('usda', ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL DO UPDATE SET
          name = excluded.name,
          normalized_name = excluded.normalized_name,
          kcal_per_100g_x10 = excluded.kcal_per_100g_x10,
          protein_mg_per_100g = excluded.protein_mg_per_100g,
          carb_mg_per_100g = excluded.carb_mg_per_100g,
          fat_mg_per_100g = excluded.fat_mg_per_100g,
          fiber_mg_per_100g = excluded.fiber_mg_per_100g,
          updated_at = unixepoch()`,
    [String(fdcId), name.slice(0, 160), normalizeText(name).slice(0, 160), kcalX10, pMg, cMg, fMg, fibMg],
  );
  written += 1;
}

const [total] = await all(`SELECT COUNT(*) AS n FROM foods WHERE source = 'usda'`);

console.log(`
${dryRun ? 'DRY RUN — nothing written' : 'import complete'}
  rows written     : ${written}  (${total.n - before} new, ${written - (total.n - before)} updated)
  skipped (no energy value)  : ${skippedNoEnergy}
  skipped (incomplete macros): ${skippedNoMacros}
  skipped (outside column bounds): ${skippedOutOfRange}
  usda rows in the database now : ${total.n}

Skipped rows are SKIPPED, not guessed at. An imported food with a silent zero for protein is worse
than a missing one: the missing one sends the user to manual entry, the wrong one gets trusted.

Note: imported rows carry the English FDC description and NO translations, so they are found
through the canonical arm of the search rather than the translation index. Migration 016's 95
curated foods are the ones that carry hu/de names.`);

await closePool();
