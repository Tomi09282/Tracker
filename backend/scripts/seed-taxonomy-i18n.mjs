// scripts/seed-taxonomy-i18n.mjs — taxonomy labels beyond English and Hungarian.
//
// Migration 007 made a language a row instead of a migration. This is that promise being kept:
// adding German here is data, and the app picks it up on the next request with no deploy.
//
// Scope, stated honestly: these five languages are the ones whose gym and anatomy vocabulary is
// standard enough to write with confidence. The other seventeen enabled languages keep falling
// back to English and keep reporting `translated: false`, which is the truthful state — a wrong
// anatomical term shown as if it were correct is worse than an English one the reader can see is
// a fallback.
//
// Every row is written with `origin = 'machine'` even though a human chose the words, because a
// native speaker has not reviewed them. When one does, they flip to 'manual' and this file loses
// its authority over them.
//
// Usage: node scripts/seed-taxonomy-i18n.mjs
import 'dotenv/config';
import * as db from '../src/db/index.js';

const LANGS = ['de', 'es', 'fr', 'it', 'pl'];

// slug: [de, es, fr, it, pl]
const EQUIPMENT = {
  bodyweight: ['Eigengewicht', 'Peso corporal', 'Poids du corps', 'Corpo libero', 'Masa ciała'],
  barbell: ['Langhantel', 'Barra', 'Barre', 'Bilanciere', 'Sztanga'],
  dumbbell: ['Kurzhantel', 'Mancuerna', 'Haltère', 'Manubrio', 'Hantla'],
  kettlebell: ['Kettlebell', 'Pesa rusa', 'Kettlebell', 'Kettlebell', 'Kettlebell'],
  machine: ['Maschine', 'Máquina', 'Machine', 'Macchina', 'Maszyna'],
  cable: ['Kabelzug', 'Polea', 'Poulie', 'Cavi', 'Wyciąg'],
  'smith-machine': ['Multipresse', 'Máquina Smith', 'Smith machine', 'Multipower', 'Maszyna Smitha'],
  'resistance-band': ['Widerstandsband', 'Banda elástica', 'Élastique', 'Elastico', 'Guma oporowa'],
  'ez-bar': ['SZ-Stange', 'Barra Z', 'Barre EZ', 'Bilanciere EZ', 'Sztanga łamana'],
  'pull-up-bar': ['Klimmzugstange', 'Barra de dominadas', 'Barre de traction', 'Sbarra per trazioni', 'Drążek'],
  bench: ['Bank', 'Banco', 'Banc', 'Panca', 'Ławka'],
  'medicine-ball': ['Medizinball', 'Balón medicinal', 'Médecine-ball', 'Palla medica', 'Piłka lekarska'],
  'stability-ball': ['Gymnastikball', 'Fitball', 'Swiss ball', 'Fitball', 'Piłka gimnastyczna'],
  'foam-roller': ['Faszienrolle', 'Rodillo de espuma', 'Rouleau de massage', 'Foam roller', 'Wałek do masażu'],
  trx: ['Schlingentrainer', 'TRX', 'Sangles TRX', 'TRX', 'Taśmy TRX'],
  other: ['Sonstiges', 'Otro', 'Autre', 'Altro', 'Inne'],
};

const MUSCLES = {
  chest: ['Brust', 'Pecho', 'Pectoraux', 'Petto', 'Klatka piersiowa'],
  'front-delts': ['Vordere Schulter', 'Deltoides anterior', 'Deltoïde antérieur', 'Deltoide anteriore', 'Przedni akton barku'],
  'side-delts': ['Seitliche Schulter', 'Deltoides lateral', 'Deltoïde latéral', 'Deltoide laterale', 'Boczny akton barku'],
  'rear-delts': ['Hintere Schulter', 'Deltoides posterior', 'Deltoïde postérieur', 'Deltoide posteriore', 'Tylny akton barku'],
  biceps: ['Bizeps', 'Bíceps', 'Biceps', 'Bicipiti', 'Biceps'],
  triceps: ['Trizeps', 'Tríceps', 'Triceps', 'Tricipiti', 'Triceps'],
  forearms: ['Unterarme', 'Antebrazos', 'Avant-bras', 'Avambracci', 'Przedramiona'],
  abs: ['Bauchmuskeln', 'Abdominales', 'Abdominaux', 'Addominali', 'Mięśnie brzucha'],
  obliques: ['Schräge Bauchmuskeln', 'Oblicuos', 'Obliques', 'Obliqui', 'Mięśnie skośne'],
  lats: ['Latissimus', 'Dorsal ancho', 'Grand dorsal', 'Gran dorsale', 'Najszerszy grzbietu'],
  traps: ['Trapez', 'Trapecio', 'Trapèzes', 'Trapezio', 'Czworoboczny'],
  'lower-back': ['Unterer Rücken', 'Zona lumbar', 'Bas du dos', 'Zona lombare', 'Dolny odcinek pleców'],
  glutes: ['Gesäß', 'Glúteos', 'Fessiers', 'Glutei', 'Pośladki'],
  quads: ['Quadrizeps', 'Cuádriceps', 'Quadriceps', 'Quadricipiti', 'Czworogłowy uda'],
  hamstrings: ['Beinbeuger', 'Isquiotibiales', 'Ischio-jambiers', 'Femorali', 'Dwugłowy uda'],
  calves: ['Waden', 'Gemelos', 'Mollets', 'Polpacci', 'Łydki'],
  adductors: ['Adduktoren', 'Aductores', 'Adducteurs', 'Adduttori', 'Przywodziciele'],
  abductors: ['Abduktoren', 'Abductores', 'Abducteurs', 'Abduttori', 'Odwodziciele'],
  neck: ['Nacken', 'Cuello', 'Cou', 'Collo', 'Szyja'],
  'full-body': ['Ganzkörper', 'Cuerpo completo', 'Corps entier', 'Corpo intero', 'Całe ciało'],
};

// Gate on the language EXISTING, not on it being enabled. Content is how a language gets ready to
// be switched on — requiring it to be on first is a deadlock, and the foreign key only cares that
// the row is there. Enablement is a separate decision, made in `languages`, once the UI bundle
// exists too.
const known = new Set((await db.all('SELECT code FROM languages')).map((r) => r.code));
const enabled = new Set((await db.all('SELECT code FROM languages WHERE enabled = 1')).map((r) => r.code));
const targets = LANGS.filter((l) => known.has(l));
const skipped = LANGS.filter((l) => !known.has(l));

const statements = [];
let counted = 0;

for (const [kind, table, source] of [
  ['equipment', 'equipment', EQUIPMENT],
  ['muscle_group', 'muscle_groups', MUSCLES],
]) {
  const rows = await db.all(`SELECT id, slug FROM ${table}`);
  const bySlug = new Map(rows.map((r) => [r.slug, r.id]));

  // A slug in this file that no longer exists in the DB is a silent no-op otherwise — the seed
  // would report success while writing nothing for that term.
  const unknown = Object.keys(source).filter((s) => !bySlug.has(s));
  if (unknown.length) {
    console.error(`seed-taxonomy-i18n: ${kind} slugs not in the database: ${unknown.join(', ')}`);
    process.exit(1);
  }
  const uncovered = rows.filter((r) => !source[r.slug]).map((r) => r.slug);
  if (uncovered.length) console.warn(`  note: ${kind} rows with no translations here: ${uncovered.join(', ')}`);

  for (const [slug, names] of Object.entries(source)) {
    targets.forEach((lang) => {
      const name = names[LANGS.indexOf(lang)];
      if (!name) return;
      statements.push({
        // ON CONFLICT rather than INSERT OR IGNORE: re-running this must update a label that was
        // corrected here, but must never overwrite one a human has already reviewed.
        sql: `INSERT INTO taxonomy_translations (kind, ref_id, lang, name, origin)
              VALUES (?, ?, ?, ?, 'machine')
              ON CONFLICT (kind, ref_id, lang) DO UPDATE
                SET name = excluded.name, updated_at = unixepoch()
                WHERE taxonomy_translations.origin = 'machine'`,
        params: [kind, bySlug.get(slug), lang, name],
      });
      counted += 1;
    });
  }
}

await db.writeTx(statements);

const total = (await db.get('SELECT COUNT(*) AS n FROM taxonomy_translations')).n;
const dormant = targets.filter((l) => !enabled.has(l));
console.log(
  `seed-taxonomy-i18n: ${counted} labels written across ${targets.join(', ')} — ${total} taxonomy translations total` +
    (skipped.length ? ` (unknown language codes, skipped: ${skipped.join(', ')})` : ''),
);
if (dormant.length) {
  console.log(
    `  ready but not enabled: ${dormant.join(', ')} — they stay off until a UI bundle exists,\n` +
      '  because a language that translates the exercise list and not the buttons around it is worse\n' +
      '  than one the user never saw offered.',
  );
}
await db.closePool();
