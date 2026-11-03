// scripts/import-exercise-translations.mjs — loads the shipped hu / de exercise translations.
//
// WHAT IT READS: backend/data/exercise-translations/<lang>.json (see the README next to them for
// where the text came from). The files are keyed by the exercise's STABLE identity,
//
//     { "<source>": { "<source_uid>": { "name"?, "description"?, "instructions"? } } }
//
// and never by the numeric id, which is a rowid that differs between databases (dev, CI, a
// restored backup). `exercises` carries a partial UNIQUE index on (source, source_uid), so the
// pair identifies a dataset exercise in every database the seeds ever built.
//
// WHAT IT WRITES: `exercise_translations` rows with origin 'machine' — and ONLY:
//   * where the (exercise, lang) row does not exist yet, or
//   * where it exists and is already origin 'machine' (a re-import replaces its own earlier work,
//     including the composed Hungarian names translate-exercises-hu.mjs wrote).
// A 'human' row (a coach or admin typed it) and a 'dataset' row (wger published it) are NEVER
// touched. That rule is enforced twice: the plan below skips them, and every write statement
// repeats it in SQL (`WHERE origin = 'machine'`), so a human edit that lands between the read and
// the write still wins.
//
// IDEMPOTENT. A second run finds every row already equal to the file and writes nothing — not even
// an `updated_at` bump (rows are compared first; only a difference is written).
//
// A PARTIAL ENTRY (no "name") can only refine an existing machine row: description / instructions
// are filled in, the name stays. Without an existing row a nameless entry is skipped, because
// `name` is NOT NULL and inventing one would be worse than the English fallback the API serves.
// Likewise a field that is absent never erases one that is present (COALESCE), so the importer can
// only ADD text to a machine row, never blank it.
//
// The FTS index follows by itself: the exercise_translations_fts_* triggers (migration 004) fire
// on every INSERT / UPDATE here. Nothing in this script touches the FTS tables.
//
// Usage: node scripts/import-exercise-translations.mjs [--dry] [--lang hu|de] [--limit N] [--json]
//                                                      [--dir <folder>]
//   --dry     plan and report; write nothing
//   --lang    one language (default: every <lang>.json in the folder)
//   --limit   only the first N entries of each file (smoke runs)
//   --json    print the report as one JSON document on stdout (for verify scripts)
//   --dir     read the files from another folder (the verify script points this at a fixture)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import * as db from '../src/db/index.js';
import { normalizeText } from '../src/lib/normalize.js';

const log = (...m) => console.error('[i18n-import]', ...m);

/* ── arguments ───────────────────────────────────────────────────────────────────────────────── */

const DEFAULT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/exercise-translations');

function parseArgs(argv) {
  const out = { dry: false, json: false, lang: null, limit: Infinity, dir: DEFAULT_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry') out.dry = true;
    else if (a === '--json') out.json = true;
    else if (a === '--lang' || a === '--limit' || a === '--dir') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      i += 1;
      if (a === '--lang') {
        if (!/^[a-z]{2}$/.test(v)) throw new Error('--lang must be a two-letter code such as hu or de');
        out.lang = v;
      } else if (a === '--limit') {
        if (!/^[1-9][0-9]{0,6}$/.test(v)) throw new Error('--limit must be a positive integer');
        out.limit = Number(v);
      } else out.dir = path.resolve(v);
    } else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

// A usage error is reported by `main` below (exit 2), AFTER the pool has been closed the normal
// way: ending the process with process.exit() while the DB workers are alive is what crashes
// native teardown on Windows (see the block at the top of src/db/index.js).
let args;
let usageError = null;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  usageError = err;
  args = { dry: true, json: false, lang: null, limit: Infinity, dir: DEFAULT_DIR };
}

/* ── the file format ─────────────────────────────────────────────────────────────────────────── */

// The same bounds the API enforces on a hand-typed translation (TranslationBody in
// src/exercises/routes.js), so a shipped row can never be something the PUT route would refuse.
const Entry = z
  .object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().min(1).max(4000).optional(),
    instructions: z.array(z.string().min(1).max(600)).min(1).max(30).optional(),
  })
  .strict()
  .refine((e) => e.name || e.description || e.instructions, 'an entry must carry at least one field');

const SOURCES = ['free-exercise-db', 'wger'];
const SourceUid = z.string().min(1).max(200);

/** Reads and validates one file. All-or-nothing: one bad entry refuses the whole language. */
function loadFile(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${path.basename(file)}: cannot read or parse (${err.message})`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${path.basename(file)}: top level must be an object keyed by source`);
  const entries = [];
  for (const [source, byUid] of Object.entries(raw)) {
    if (!SOURCES.includes(source)) throw new Error(`${path.basename(file)}: unknown source "${source.slice(0, 40)}"`);
    if (byUid === null || typeof byUid !== 'object' || Array.isArray(byUid)) throw new Error(`${path.basename(file)}: "${source}" must be an object keyed by source_uid`);
    for (const [uid, entry] of Object.entries(byUid)) {
      if (!SourceUid.safeParse(uid).success) throw new Error(`${path.basename(file)}: bad source_uid under "${source}"`);
      const parsed = Entry.safeParse(entry);
      if (!parsed.success) {
        throw new Error(`${path.basename(file)}: ${source}/${uid.slice(0, 60)}: ${parsed.error.issues[0].message}`);
      }
      entries.push({ source, uid, ...parsed.data });
    }
  }
  return entries;
}

/* ── refuse an unmigrated schema ─────────────────────────────────────────────────────────────── */

const REQUIRED = [
  ['table', 'exercises'],
  ['table', 'exercise_translations'],
  ['table', 'exercise_translations_fts'],
  ['table', 'languages'],
  ['index', 'exercise_translations_unique'], // the ON CONFLICT target
  ['index', 'exercises_source_uid_unique'], // what makes (source, source_uid) an identity
  ['trigger', 'exercise_translations_fts_insert'], // the FTS index is kept by these, not by us
  ['trigger', 'exercise_translations_fts_update'],
];

async function assertMigrated() {
  const have = new Set(
    (await db.all("SELECT type || ':' || name AS k FROM sqlite_master WHERE type IN ('table','index','trigger')")).map((r) => r.k),
  );
  const missing = REQUIRED.filter(([t, n]) => !have.has(`${t}:${n}`)).map(([t, n]) => `${t} ${n}`);
  if (missing.length) {
    console.error(`import-exercise-translations: the database schema is not migrated (missing: ${missing.join(', ')}). Run \`npm run migrate\` first.`);
    return false;
  }
  return true;
}

/* ── the statements ──────────────────────────────────────────────────────────────────────────── */

// Insert-or-refresh. The DO UPDATE is guarded by the origin: the row is replaced only if it is
// already ours. COALESCE keeps an existing description / instructions when the file has none.
const UPSERT_NAMED = `
  INSERT INTO exercise_translations (exercise_id, lang, name, normalized_name, description, instructions, origin)
  VALUES (?, ?, ?, ?, ?, ?, 'machine')
  ON CONFLICT (exercise_id, lang) DO UPDATE SET
    name            = excluded.name,
    normalized_name = excluded.normalized_name,
    description     = COALESCE(excluded.description, exercise_translations.description),
    instructions    = COALESCE(excluded.instructions, exercise_translations.instructions)
  WHERE exercise_translations.origin = 'machine'`;

// A nameless entry may only refine a machine row that already exists.
const REFINE = `
  UPDATE exercise_translations
     SET description  = COALESCE(?, description),
         instructions = COALESCE(?, instructions)
   WHERE exercise_id = ? AND lang = ? AND origin = 'machine'`;

const CHUNK = 100;

/* ── one language ────────────────────────────────────────────────────────────────────────────── */

async function importLanguage(lang, entries, idByKey) {
  const existing = new Map(
    (
      await db.all(
        'SELECT exercise_id, name, description, instructions, origin FROM exercise_translations WHERE lang = ?',
        [lang],
      )
    ).map((r) => [r.exercise_id, r]),
  );

  const stat = { entries: entries.length, inserted: 0, updated: 0, unchanged: 0, skippedProtected: 0, skippedNoName: 0, unknownExercise: 0 };
  const writes = []; // { kind, sql, params }

  for (const e of entries) {
    const exerciseId = idByKey.get(`${e.source}\u0000${e.uid}`);
    if (exerciseId === undefined) {
      stat.unknownExercise += 1;
      continue;
    }
    const row = existing.get(exerciseId);
    if (row && row.origin !== 'machine') {
      stat.skippedProtected += 1;
      continue;
    }
    const description = e.description ?? null;
    const instructions = e.instructions ? JSON.stringify(e.instructions) : null;

    if (!row) {
      if (!e.name) {
        stat.skippedNoName += 1;
        continue;
      }
      writes.push({ kind: 'inserted', sql: UPSERT_NAMED, params: [exerciseId, lang, e.name, normalizeText(e.name), description, instructions] });
      continue;
    }

    // An existing machine row: write only if the file would change something.
    const nextName = e.name ?? row.name;
    const nextDescription = description ?? row.description;
    const nextInstructions = instructions ?? row.instructions;
    if (nextName === row.name && nextDescription === row.description && nextInstructions === row.instructions) {
      stat.unchanged += 1;
      continue;
    }
    writes.push(
      e.name
        ? { kind: 'updated', sql: UPSERT_NAMED, params: [exerciseId, lang, e.name, normalizeText(e.name), description, instructions] }
        : { kind: 'updated', sql: REFINE, params: [description, instructions, exerciseId, lang] },
    );
  }

  if (!args.dry) {
    for (let i = 0; i < writes.length; i += CHUNK) {
      const chunk = writes.slice(i, i + CHUNK);
      // ONE worker call per chunk = one IMMEDIATE transaction. A chunk is all-or-nothing; the
      // import as a whole is resumable because a rerun skips what is already in place.
      const results = await db.writeTx(chunk.map((w) => ({ sql: w.sql, params: w.params })));
      chunk.forEach((w, j) => {
        if (results[j].changes > 0) stat[w.kind] += 1;
        // The guard in the SQL matched nothing: the row turned human / dataset after we read it.
        else stat.skippedProtected += 1;
      });
    }
  } else {
    for (const w of writes) stat[w.kind] += 1;
  }
  return stat;
}

/* ── coverage ────────────────────────────────────────────────────────────────────────────────── */

const HAS_TEXT = (col) => `${col} IS NOT NULL AND trim(${col}) NOT IN ('', '.')`;
const HAS_STEPS = (col) => `${col} IS NOT NULL AND trim(${col}) NOT IN ('', '[]')`;

/** What fraction of the dataset library now has each field in `lang`. */
async function coverage(lang) {
  const scope = "e.source IN ('free-exercise-db','wger')";
  const one = async (sql, params = []) => Number((await db.get(sql, params)).n);
  const total = await one(`SELECT COUNT(*) AS n FROM exercises e WHERE ${scope}`);
  const withName = await one(`SELECT COUNT(*) AS n FROM exercise_translations t JOIN exercises e ON e.id = t.exercise_id WHERE ${scope} AND t.lang = ?`, [lang]);
  const withDescription = await one(`SELECT COUNT(*) AS n FROM exercise_translations t JOIN exercises e ON e.id = t.exercise_id WHERE ${scope} AND t.lang = ? AND ${HAS_TEXT('t.description')}`, [lang]);
  const withInstructions = await one(`SELECT COUNT(*) AS n FROM exercise_translations t JOIN exercises e ON e.id = t.exercise_id WHERE ${scope} AND t.lang = ? AND ${HAS_STEPS('t.instructions')}`, [lang]);
  // The exercises whose ENGLISH side has that kind of text at all (wger has no structured steps,
  // free-exercise-db no description), and how many of those the language now covers. This is the
  // honest denominator: a Hungarian description cannot exist for an exercise with nothing to say.
  const englishDescription = await one(`SELECT COUNT(*) AS n FROM exercises e WHERE ${scope} AND ${HAS_TEXT('e.description')}`);
  const englishInstructions = await one(`SELECT COUNT(*) AS n FROM exercises e WHERE ${scope} AND ${HAS_STEPS('e.instructions')}`);
  const coveredDescription = await one(`SELECT COUNT(*) AS n FROM exercise_translations t JOIN exercises e ON e.id = t.exercise_id WHERE ${scope} AND t.lang = ? AND ${HAS_TEXT('t.description')} AND ${HAS_TEXT('e.description')}`, [lang]);
  const coveredInstructions = await one(`SELECT COUNT(*) AS n FROM exercise_translations t JOIN exercises e ON e.id = t.exercise_id WHERE ${scope} AND t.lang = ? AND ${HAS_STEPS('t.instructions')} AND ${HAS_STEPS('e.instructions')}`, [lang]);
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
  return {
    totalExercises: total,
    name: { count: withName, pctOfAll: pct(withName, total) },
    description: { count: withDescription, pctOfAll: pct(withDescription, total), englishSourceCount: englishDescription, coveredOfSource: coveredDescription, pctOfSource: pct(coveredDescription, englishDescription) },
    instructions: { count: withInstructions, pctOfAll: pct(withInstructions, total), englishSourceCount: englishInstructions, coveredOfSource: coveredInstructions, pctOfSource: pct(coveredInstructions, englishInstructions) },
  };
}

/* ── main ────────────────────────────────────────────────────────────────────────────────────── */

let exitCode = 0;
try {
  if (usageError) {
    console.error(`import-exercise-translations: ${usageError.message}`);
    exitCode = 2;
    throw usageError;
  }
  // Which files? An explicit --lang must exist; otherwise every <xx>.json in the folder.
  const available = fs.existsSync(args.dir)
    ? fs.readdirSync(args.dir).map((f) => f.match(/^([a-z]{2})\.json$/)?.[1]).filter(Boolean).sort()
    : [];
  const langs = args.lang ? [args.lang] : available;
  if (args.lang && !available.includes(args.lang)) throw new Error(`no ${args.lang}.json in ${args.dir}`);
  if (langs.length === 0) throw new Error(`no <lang>.json files in ${args.dir}`);

  // Validate EVERYTHING before opening the database for writing: a malformed file must fail the
  // run, not half of it.
  const loaded = new Map();
  for (const lang of langs) {
    let entries = loadFile(path.join(args.dir, `${lang}.json`));
    if (Number.isFinite(args.limit)) entries = entries.slice(0, args.limit);
    loaded.set(lang, entries);
  }

  if (!(await assertMigrated())) {
    exitCode = 1;
  } else {
    const idByKey = new Map(
      (
        await db.all("SELECT id, source, source_uid FROM exercises WHERE source IN ('free-exercise-db','wger') AND source_uid IS NOT NULL")
      ).map((r) => [`${r.source}\u0000${r.source_uid}`, r.id]),
    );
    const rostered = new Set((await db.all('SELECT code FROM languages')).map((r) => r.code));
    log(`${idByKey.size} dataset exercises in the library${args.dry ? ' (dry run: nothing is written)' : ''}`);

    const report = { dry: args.dry, languages: {} };
    for (const [lang, entries] of loaded) {
      if (!rostered.has(lang)) log(`note: "${lang}" is not in the languages table; rows are stored but nothing serves them until it is rostered`);
      const counts = await importLanguage(lang, entries, idByKey);
      report.languages[lang] = { ...counts, coverage: await coverage(lang) };
    }

    if (args.json) {
      console.log(JSON.stringify(report));
    } else {
      for (const [lang, r] of Object.entries(report.languages)) {
        console.log(
          `${lang}: ${r.entries} entries -> inserted ${r.inserted}, updated ${r.updated}, unchanged ${r.unchanged}, ` +
            `skipped-protected ${r.skippedProtected}, skipped-no-name ${r.skippedNoName}, unknown-exercise ${r.unknownExercise}`,
        );
        const c = r.coverage;
        console.log(
          `    coverage of ${c.totalExercises} exercises: name ${c.name.count} (${c.name.pctOfAll}%), ` +
            `description ${c.description.count} (${c.description.pctOfAll}%, ${c.description.coveredOfSource}/${c.description.englishSourceCount} = ${c.description.pctOfSource}% of those with English text), ` +
            `instructions ${c.instructions.count} (${c.instructions.pctOfAll}%, ${c.instructions.coveredOfSource}/${c.instructions.englishSourceCount} = ${c.instructions.pctOfSource}% of those with English steps)`,
        );
      }
    }
  }
} catch (err) {
  if (!usageError) {
    console.error(`import-exercise-translations: ${String(err?.message ?? err).slice(0, 400)}`);
    exitCode = 1;
  }
} finally {
  try {
    await db.closePool();
  } catch {
    /* the process is exiting either way */
  }
}
// Natural exit, not process.exit(): let the closed pool wind down on its own.
process.exitCode = exitCode;
