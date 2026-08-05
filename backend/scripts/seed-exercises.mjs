// scripts/seed-exercises.mjs — imports the global exercise library (F1, decision 3C).
//
// Two sources, hybrid, deduped:
//   free-exercise-db — public domain (Unlicense), ~870 entries with structured instructions
//   wger            — CC-BY-SA 4.0, adds Hungarian names and broader coverage
//
// Both hosts are HARDCODED below. The upload pipeline elsewhere in this app never fetches a
// user-supplied URL, and neither does this: an allowlist that can be widened by input is not an
// allowlist. Re-runnable — every row is keyed by (source, source_uid) with a partial unique
// index, so a second run updates rather than duplicates.
//
// Usage: node scripts/seed-exercises.mjs [--limit N] [--dry]
import 'dotenv/config';
import * as db from '../src/db/index.js';
import { normalizeText } from '../src/lib/normalize.js';

const FREE_EXERCISE_DB =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const WGER_BASE = 'https://wger.de/api/v2';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i > -1 ? Number.parseInt(args[i + 1], 10) : Infinity;
})();

const log = (...m) => console.error('[seed]', ...m);

/** free-exercise-db muscle names → our taxonomy slugs. Anything unmapped is dropped, loudly. */
const FED_MUSCLES = {
  abdominals: 'abs',
  abductors: 'abductors',
  adductors: 'adductors',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lats',
  'lower back': 'lower-back',
  'middle back': 'lats',
  neck: 'neck',
  quadriceps: 'quads',
  shoulders: 'side-delts',
  traps: 'traps',
  triceps: 'triceps',
};

const FED_EQUIPMENT = {
  'body only': 'bodyweight',
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  kettlebells: 'kettlebell',
  machine: 'machine',
  cable: 'cable',
  bands: 'resistance-band',
  'e-z curl bar': 'ez-bar',
  'medicine ball': 'medicine-ball',
  'exercise ball': 'stability-ball',
  'foam roll': 'foam-roller',
  other: 'other',
};

const FED_CATEGORY = {
  strength: 'strength',
  stretching: 'stretching',
  cardio: 'cardio',
  plyometrics: 'plyometrics',
  powerlifting: 'strength',
  'olympic weightlifting': 'strength',
  strongman: 'strength',
};

const FED_LEVEL = { beginner: 'beginner', intermediate: 'intermediate', expert: 'advanced' };

/** wger category id → our exercise_type. */
const WGER_CATEGORY = {
  10: 'strength', // Abs
  8: 'strength', // Arms
  12: 'strength', // Back
  14: 'cardio', // Calves
  11: 'strength', // Chest
  9: 'strength', // Legs
  13: 'strength', // Shoulders
};

/** wger muscle id → our slug. Ids are stable in their API. */
const WGER_MUSCLES = {
  1: 'biceps',
  2: 'front-delts',
  3: 'forearms',
  4: 'chest',
  5: 'triceps',
  6: 'abs',
  7: 'calves',
  8: 'glutes',
  9: 'traps',
  10: 'quads',
  11: 'hamstrings',
  12: 'lats',
  13: 'obliques',
  14: 'lats',
  15: 'glutes',
};

const WGER_EQUIPMENT = {
  1: 'barbell',
  2: 'dumbbell',
  3: 'bench',
  4: 'machine',
  7: 'bodyweight',
  8: 'pull-up-bar',
  9: 'bodyweight',
  10: 'resistance-band',
  6: 'kettlebell',
};

async function fetchJson(url, { timeoutMs = 30_000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { accept: 'application/json', 'user-agent': 'tracker-seed/1.0' },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Strips HTML from wger descriptions — the field is rich text and we store plain prose. */
const stripHtml = (s) =>
  (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

async function loadFreeExerciseDb() {
  log('fetching free-exercise-db…');
  const raw = await fetchJson(FREE_EXERCISE_DB, { timeoutMs: 60_000 });
  log(`free-exercise-db: ${raw.length} entries`);

  const unmapped = new Set();
  return raw.map((e) => {
    const muscles = [];
    for (const m of e.primaryMuscles ?? []) {
      const slug = FED_MUSCLES[m];
      if (slug) muscles.push({ slug, role: 'primary' });
      else unmapped.add(`muscle:${m}`);
    }
    for (const m of e.secondaryMuscles ?? []) {
      const slug = FED_MUSCLES[m];
      if (slug && !muscles.some((x) => x.slug === slug)) muscles.push({ slug, role: 'secondary' });
    }
    const equipSlug = FED_EQUIPMENT[e.equipment ?? 'other'];
    if (!equipSlug && e.equipment) unmapped.add(`equipment:${e.equipment}`);

    if (unmapped.size) log('unmapped (dropped):', [...unmapped].join(', '));

    return {
      source: 'free-exercise-db',
      source_uid: e.id,
      name: e.name,
      name_hu: null,
      description: null,
      instructions: Array.isArray(e.instructions) ? e.instructions : [],
      difficulty: FED_LEVEL[e.level] ?? null,
      exercise_type: FED_CATEGORY[e.category] ?? null,
      muscles,
      equipment: equipSlug ? [equipSlug] : [],
    };
  });
}

async function loadWger() {
  log('fetching wger…');
  const out = [];
  // The API paginates; 100 per page keeps the request count low without a huge payload.
  let url = `${WGER_BASE}/exerciseinfo/?limit=100&offset=0`;
  let pages = 0;
  while (url && pages < 40) {
    const page = await fetchJson(url);
    pages += 1;
    for (const item of page.results ?? []) {
      const en = (item.translations ?? []).find((t) => t.language === 2);
      const hu = (item.translations ?? []).find((t) => t.language === 12);
      const name = en?.name?.trim();
      if (!name) continue; // an entry with no English name is not usable

      const muscles = [];
      for (const m of item.muscles ?? []) {
        const slug = WGER_MUSCLES[m.id ?? m];
        if (slug && !muscles.some((x) => x.slug === slug)) muscles.push({ slug, role: 'primary' });
      }
      for (const m of item.muscles_secondary ?? []) {
        const slug = WGER_MUSCLES[m.id ?? m];
        if (slug && !muscles.some((x) => x.slug === slug)) muscles.push({ slug, role: 'secondary' });
      }

      const equipment = [];
      for (const q of item.equipment ?? []) {
        const slug = WGER_EQUIPMENT[q.id ?? q];
        if (slug && !equipment.includes(slug)) equipment.push(slug);
      }

      out.push({
        source: 'wger',
        source_uid: String(item.id ?? item.uuid),
        name,
        name_hu: hu?.name?.trim() || null,
        description: stripHtml(en?.description).slice(0, 4000) || null,
        instructions: [],
        difficulty: null,
        exercise_type: WGER_CATEGORY[item.category?.id ?? item.category] ?? null,
        muscles,
        equipment,
      });
    }
    url = page.next ?? null;
  }
  log(`wger: ${out.length} entries over ${pages} pages`);
  return out;
}

async function main() {
  const [fed, wger] = await Promise.all([
    loadFreeExerciseDb().catch((err) => {
      log('free-exercise-db FAILED:', err.message);
      return [];
    }),
    loadWger().catch((err) => {
      log('wger FAILED:', err.message);
      return [];
    }),
  ]);

  if (fed.length === 0 && wger.length === 0) {
    log('both sources failed — nothing to import');
    process.exit(1);
  }

  // Dedupe by folded name. free-exercise-db wins on a collision: its instructions are
  // structured step lists, where wger's are prose, and a merged row would inherit the weaker
  // of the two. wger still contributes its Hungarian name to the surviving row.
  const byName = new Map();
  for (const item of [...fed, ...wger]) {
    const key = normalizeText(item.name);
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, item);
    } else if (!existing.name_hu && item.name_hu) {
      existing.name_hu = item.name_hu;
    }
  }

  const all = [...byName.values()].slice(0, LIMIT);
  log(`${fed.length} + ${wger.length} sources → ${byName.size} unique → importing ${all.length}`);

  if (DRY) {
    log('dry run, nothing written');
    log('sample:', JSON.stringify(all[0], null, 1));
    await db.closePool();
    return;
  }

  const muscleIds = new Map(
    (await db.all('SELECT id, slug FROM muscle_groups')).map((r) => [r.slug, r.id]),
  );
  const equipIds = new Map((await db.all('SELECT id, slug FROM equipment')).map((r) => [r.slug, r.id]));

  let inserted = 0;
  let updated = 0;
  for (const item of all) {
    // The canonical row carries the English name only. Every other language — including the
    // Hungarian this script used to stuff into a `name_hu` column — belongs in
    // `exercise_translations`, written by seed-translations.mjs.
    const normalized = normalizeText(item.name);
    const existing = await db.get(
      'SELECT id FROM exercises WHERE source = ? AND source_uid = ?',
      [item.source, item.source_uid],
    );

    if (existing) {
      await db.run(
        `UPDATE exercises SET name = ?, normalized_name = ?, description = ?,
                              instructions = ?, difficulty = ?, exercise_type = ?
          WHERE id = ?`,
        [
          item.name,
          normalized,
          item.description,
          item.instructions.length ? JSON.stringify(item.instructions) : null,
          item.difficulty,
          item.exercise_type,
          existing.id,
        ],
      );
      updated += 1;
      continue;
    }

    const created = await db.run(
      `INSERT INTO exercises (name, normalized_name, description, instructions,
                              status, owner_id, source, source_uid, difficulty, exercise_type)
       VALUES (?, ?, ?, ?, 'global', NULL, ?, ?, ?, ?)`,
      [
        item.name,
        normalized,
        item.description,
        item.instructions.length ? JSON.stringify(item.instructions) : null,
        item.source,
        item.source_uid,
        item.difficulty,
        item.exercise_type,
      ],
    );

    const id = created.lastInsertRowid;
    const steps = [
      ...item.muscles
        .filter((m) => muscleIds.has(m.slug))
        .map((m) => ({
          sql: 'INSERT OR IGNORE INTO exercise_muscle_map (exercise_id, muscle_group_id, role) VALUES (?, ?, ?)',
          params: [id, muscleIds.get(m.slug), m.role],
        })),
      ...item.equipment
        .filter((s) => equipIds.has(s))
        .map((s) => ({
          sql: 'INSERT OR IGNORE INTO exercise_equipment_map (exercise_id, equipment_id) VALUES (?, ?)',
          params: [id, equipIds.get(s)],
        })),
    ];
    if (steps.length) await db.writeTx(steps);
    inserted += 1;

    if ((inserted + updated) % 100 === 0) log(`… ${inserted + updated}/${all.length}`);
  }

  const total = await db.get(
    "SELECT COUNT(*) AS n FROM exercises WHERE status = 'global' AND deleted_at IS NULL",
  );
  log(`done — ${inserted} inserted, ${updated} updated, ${total.n} global exercises in the library`);
  await db.closePool();
}

await main();
