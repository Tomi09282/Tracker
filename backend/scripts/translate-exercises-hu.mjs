// scripts/translate-exercises-hu.mjs — Hungarian exercise names, composed rather than typed.
//
// The problem this solves is the largest content gap in the product: TRACKER is a Hungarian-first
// app whose exercise library has 1652 names and ZERO of them in Hungarian. wger, the dataset
// source, publishes no Hungarian at all (see decision 0004 — a earlier run mislabelled 582 French
// rows as Hungarian by guessing at a language id, which is why nothing here guesses).
//
// Why compose instead of hand-writing a list: the names are overwhelmingly formulaic. Measured on
// the actual dataset, 300 distinct tokens fully cover 975 of the 1652 names. A curated vocabulary
// therefore reaches far more of the library than any list a person would sit down and type, and
// it keeps reaching further every time a word is added.
//
// Why this is not "machine translation": nothing here is generated. Every Hungarian word below was
// chosen by hand, and the composition rules are Hungarian grammar, written out. What the machine
// does is apply them.
//
// THE RULE THAT KEEPS IT HONEST: a name is translated only if EVERY token in it is known. One
// unrecognised word and the whole name is skipped, so it falls back to English and is flagged as
// untranslated. A half-understood name rendered confidently is worse than an English one the
// reader can see is a fallback — that is the same principle the taxonomy fallback chain follows.
//
// Usage: node scripts/translate-exercises-hu.mjs [--dry]
import 'dotenv/config';
import * as db from '../src/db/index.js';

const DRY = process.argv.includes('--dry');

/* ── equipment ──────────────────────────────────────────────────────────────────────────────
 *
 * Stored WITH its instrumental form rather than computing one. Hungarian's instrumental suffix
 * assimilates to the preceding consonant (rúd → rúddal, kábel → kábellel) and harmonises with the
 * word's vowels (-val / -vel). That is a real algorithm with real exceptions, and the input set is
 * sixteen words. A lookup cannot be wrong; an algorithm applied to loanwords like "kettlebell"
 * very much can.
 */
const EQUIPMENT = {
  barbell: { hu: 'rúd', with: 'rúddal' },
  dumbbell: { hu: 'kézisúlyzó', with: 'kézisúlyzóval' },
  db: { hu: 'kézisúlyzó', with: 'kézisúlyzóval' },
  kettlebell: { hu: 'kettlebell', with: 'kettlebellel' },
  cable: { hu: 'kábel', with: 'kábelen' },
  machine: { hu: 'gép', with: 'gépen' },
  smith: { hu: 'Smith-gép', with: 'Smith-gépen' },
  band: { hu: 'gumiszalag', with: 'gumiszalaggal' },
  bands: { hu: 'gumiszalag', with: 'gumiszalaggal' },
  'ez-bar': { hu: 'EZ-rúd', with: 'EZ-rúddal' },
  bodyweight: { hu: 'saját testsúly', with: 'saját testsúllyal' },
  ball: { hu: 'labda', with: 'labdával' },
  rope: { hu: 'kötél', with: 'kötéllel' },
  trx: { hu: 'TRX', with: 'TRX-szel' },
  box: { hu: 'doboz', with: 'dobozra' },
  bench: { hu: 'pad', with: 'padon' },
  bar: { hu: 'rúd', with: 'rúdon' },
  sled: { hu: 'szán', with: 'szánnal' },
  plate: { hu: 'tárcsa', with: 'tárcsával' },
  pulley: { hu: 'csiga', with: 'csigán' },
  'low-pulley': { hu: 'alsó csiga', with: 'alsó csigán' },
  roller: { hu: 'henger', with: 'hengerrel' },
  treadmill: { hu: 'futópad', with: 'futópadon' },
  bike: { hu: 'kerékpár', with: 'kerékpáron' },
  attachment: { hu: 'adapter', with: 'adapterrel' },
  blocks: { hu: 'blokk', with: 'blokkról' },
};

/* ── movement heads ─────────────────────────────────────────────────────────────────────────
 * The noun the name is built around. Hungarian names a movement, not an action.
 */
const MOVEMENT = {
  press: 'nyomás',
  curl: 'hajlítás',
  curls: 'hajlítás',
  squat: 'guggolás',
  squats: 'guggolás',
  row: 'evezés',
  rows: 'evezés',
  raise: 'emelés',
  raises: 'emelés',
  stretch: 'nyújtás',
  extension: 'nyújtás',
  extensions: 'nyújtás',
  deadlift: 'felhúzás',
  lunge: 'kitörés',
  lunges: 'kitörés',
  crunch: 'hasprés',
  crunches: 'hasprés',
  pulldown: 'lehúzás',
  'pull-up': 'húzódzkodás',
  pullup: 'húzódzkodás',
  pullups: 'húzódzkodás',
  'chin-up': 'húzódzkodás alsó fogással',
  'push-up': 'fekvőtámasz',
  pushup: 'fekvőtámasz',
  pushups: 'fekvőtámasz',
  dip: 'tolódzkodás',
  dips: 'tolódzkodás',
  fly: 'tárogatás',
  flye: 'tárogatás',
  flyes: 'tárogatás',
  rotation: 'forgatás',
  shrug: 'vállvonogatás',
  shrugs: 'vállvonogatás',
  plank: 'plank',
  clean: 'lökés',
  snatch: 'szakítás',
  jump: 'ugrás',
  jumps: 'ugrás',
  pull: 'húzás',
  push: 'tolás',
  thrust: 'tolás',
  bridge: 'híd',
  hold: 'tartás',
  twist: 'csavarás',
  kickback: 'hátralökés',
  pullover: 'pulóver',
  'sit-up': 'felülés',
  situp: 'felülés',
  'sit-ups': 'felülés',
  swing: 'lendítés',
  step: 'fellépés',
  'step-up': 'fellépés',
  walk: 'séta',
  run: 'futás',
  circles: 'körzés',
  circle: 'körzés',

  // Added from the frequency report below rather than from intuition — each of these was blocking
  // at least six names.
  jerk: 'lökés',
  pushdown: 'lenyomás',
  hang: 'függés',
  throw: 'dobás',
  rowing: 'evezés',
  crossover: 'keresztezés',
  drag: 'húzás',
  flexion: 'hajlítás',
  abduction: 'távolítás',
  adduction: 'közelítás',
  raiser: 'emelés',
  kick: 'rúgás',
  kicks: 'rúgás',
  march: 'menetelés',
  hinge: 'csípőhajlítás',
  carry: 'cipelés',
  slam: 'csapás',
  wiper: 'ablaktörlő',
  windmill: 'szélmalom',
  roll: 'gördítés',
  rollout: 'kigördítés',
  'toe-touch': 'lábujjérintés',
  touch: 'érintés',
  bound: 'szökkenés',
  hop: 'szökdelés',
  skip: 'ugrókötelezés',
  climb: 'mászás',
  'flutter-kick': 'ollózás',
  'leg-raise': 'lábemelés',
  lift: 'emelés',
  bend: 'hajlítás',
  sprint: 'sprint',
  sit: 'ülés',
  'l-sit': 'L-tartás',
  balance: 'egyensúlyozás',
  drill: 'gyakorlat',
  slide: 'csúsztatás',
  'pull-in': 'behúzás',
};

/* ── body parts ─────────────────────────────────────────────────────────────────────────────
 * These COMPOUND with the movement into one word — Hungarian writes "vállnyomás", not "váll
 * nyomás". That single rule is why a token-by-token substitution produces something no Hungarian
 * speaker would write.
 */
const BODYPART = {
  shoulder: 'váll',
  chest: 'mell',
  bench: 'fekve',
  leg: 'láb',
  legs: 'láb',
  calf: 'vádli',
  triceps: 'tricepsz',
  tricep: 'tricepsz',
  biceps: 'bicepsz',
  bicep: 'bicepsz',
  lat: 'hát',
  lats: 'hát',
  glute: 'far',
  glutes: 'far',
  hamstring: 'combhajlító',
  hip: 'csípő',
  wrist: 'csukló',
  neck: 'nyak',
  arm: 'kar',
  back: 'hát',
  knee: 'térd',
  quad: 'comb',
  ab: 'has',
  abs: 'has',
  abdominal: 'has',
  deltoid: 'váll',
  delt: 'váll',
  trap: 'csuklyás',
  oblique: 'ferdehas',
  thigh: 'comb',
  forearm: 'alkar',
  ankle: 'boka',
  spine: 'gerinc',
  hack: 'hack',
  flexor: 'hajlító',
  groin: 'ágyék',
  face: 'arc',
  head: 'fej',
  adductor: 'közelítő',
  abductor: 'távolító',
};

/* ── modifiers ──────────────────────────────────────────────────────────────────────────────
 * Adjectives, which in Hungarian precede the noun exactly as they do in English — the one part of
 * the word order that does not have to change.
 */
const MODIFIER = {
  standing: 'álló',
  seated: 'ülő',
  lying: 'fekvő',
  incline: 'ferde',
  decline: 'negatív döntésű',
  reverse: 'fordított',
  alternating: 'váltott',
  alternate: 'váltott',
  'one-arm': 'egykaros',
  'single-arm': 'egykaros',
  'one-leg': 'egylábas',
  'single-leg': 'egylábas',
  single: 'egyoldali',
  overhead: 'fej fölötti',
  front: 'elülső',
  side: 'oldalsó',
  lateral: 'oldalsó',
  rear: 'hátsó',
  bent: 'dőlt',
  'bent-over': 'előredőlt',
  'close-grip': 'szűk fogású',
  'wide-grip': 'széles fogású',
  narrow: 'szűk',
  wide: 'széles',
  high: 'magas',
  low: 'mély',
  split: 'kitöréses',
  bulgarian: 'bolgár',
  romanian: 'román',
  sumo: 'szumó',
  goblet: 'goblet',
  zercher: 'Zercher',
  arnold: 'Arnold',
  spider: 'spider',
  preacher: 'imapad',
  concentration: 'koncentrált',
  hanging: 'függő',
  kneeling: 'térdelő',
  'half-kneeling': 'féltérdelő',
  supine: 'hanyatt fekvő',
  prone: 'hason fekvő',
  isometric: 'izometrikus',
  explosive: 'robbanékony',
  paused: 'megállított',
  tempo: 'tempós',
  weighted: 'súlyozott',
  assisted: 'segített',
  eccentric: 'excentrikus',
  full: 'teljes',
  partial: 'részleges',
  floor: 'padlós',
  air: 'súly nélküli',
  jumping: 'ugró',
  walking: 'sétáló',
  static: 'statikus',
  dynamic: 'dinamikus',
  overhand: 'felső fogású',
  underhand: 'alsó fogású',
  neutral: 'semleges fogású',
  upright: 'álló',
  'good-morning': 'jó reggelt',
  butterfly: 'pillangó',
  hammer: 'kalapácsos',
  pistol: 'pisztoly',
  'v-up': 'V-felülés',
  bird: 'madár',
  dog: 'kutya',
  cat: 'macska',
  wall: 'fali',
  band: 'gumiszalagos',
  cross: 'kereszt',
  scissor: 'olló',
  frog: 'béka',
  butt: 'far',
  toe: 'lábujj',
  heel: 'sarok',
  chair: 'széken',
  stability: 'stabilizáló',
  medicine: 'medicin',
  resistance: 'ellenállásos',
  cable: 'kábeles',
  barbell: 'rudas',
  dumbbell: 'kézisúlyzós',

  // From the frequency report. `grip` is the highest-value entry here: it always follows another
  // modifier ("medium grip", "close grip", "reverse grip") and modifiers keep their order, so
  // "Medium Grip" composes to "közepes fogású" with no special case at all.
  grip: 'fogású',
  medium: 'közepes',
  close: 'szűk',
  one: 'egykaros',
  'two-arm': 'kétkaros',
  'straight-arm': 'nyújtott karú',
  'straight-leg': 'nyújtott lábú',
  external: 'külső',
  internal: 'belső',
  behind: 'hát mögötti',
  up: 'felfelé',
  down: 'lefelé',
  right: 'jobb oldali',
  left: 'bal oldali',
  leverage: 'karos',
  stance: 'állású',
  double: 'kettős',
  power: 'erőemelő',
  good: 'jó',
  foam: 'hab',
  upper: 'felső',
  lower: 'alsó',
  tuck: 'zsugor',
  body: 'testsúlyos',
  chains: 'láncos',
  banded: 'gumiszalagos',
  seated: 'ülő',
  inverted: 'fordított',
  diagonal: 'átlós',
  advanced: 'haladó',
  beginner: 'kezdő',
  modified: 'módosított',
  deficit: 'megemelt',
  elevated: 'megemelt',
  strict: 'szigorú',
  slow: 'lassú',
  fast: 'gyors',
  heavy: 'nehéz',
  light: 'könnyű',
  crossbody: 'testen átnyúló',
  rotational: 'forgatásos',
  unilateral: 'egyoldali',
  bilateral: 'kétoldali',
  'z-press': 'Z-nyomás',
  landmine: 'landmine',
  suitcase: 'bőrönd',
  waiter: 'pincér',
  sissy: 'sissy',
  nordic: 'nordic',
  copenhagen: 'koppenhágai',
  cossack: 'kozák',
  jefferson: 'Jefferson',
  meadows: 'Meadows',
  'zottman': 'Zottman',
  cuban: 'kubai',

  // Third pass from the frequency report. Everything below blocked at least four names; the tail
  // past this point is genuinely long — no remaining word blocks more than three — so this is
  // where adding vocabulary stops paying and the honest English fallback takes over.
  flat: 'sík padon',
  military: 'katonai',
  'palms-up': 'tenyérrel felfelé',
  'palms-down': 'tenyérrel lefelé',
  straight: 'nyújtott',
  suspended: 'függesztett',
  backward: 'hátrafelé',
  forward: 'előre',
  long: 'hosszú',
  linear: 'lineáris',
  stationary: 'helyben',
  iron: 'vas',
  handstand: 'kézállásos',
  't-bar': 'T-rudas',
  pin: 'pines',
  chin: 'áll',
  morning: 'reggeli',
  seated_: 'ülő',
};

/**
 * Names where composition would produce something technically parseable and idiomatically wrong.
 *
 * "Bench Press" composed word-by-word is "pad nyomás". The Hungarian is "fekvenyomás" — one word,
 * and not derived from "bench" at all. Every entry here exists because the compositional route
 * gave an answer a Hungarian lifter would not recognise.
 */
const OVERRIDE = {
  'bench press': 'fekvenyomás',
  'barbell bench press': 'fekvenyomás rúddal',
  'dumbbell bench press': 'fekvenyomás kézisúlyzóval',
  'incline bench press': 'ferde fekvenyomás',
  'decline bench press': 'negatív döntésű fekvenyomás',
  'close-grip bench press': 'szűk fogású fekvenyomás',
  deadlift: 'felhúzás',
  'barbell deadlift': 'felhúzás rúddal',
  'romanian deadlift': 'román felhúzás',
  'sumo deadlift': 'szumó felhúzás',
  'stiff-leg deadlift': 'nyújtott lábas felhúzás',
  squat: 'guggolás',
  'barbell squat': 'guggolás rúddal',
  'front squat': 'elülső guggolás',
  'back squat': 'hátsó guggolás',
  'goblet squat': 'goblet guggolás',
  'overhead press': 'vállból nyomás',
  'military press': 'katonai vállnyomás',
  'push press': 'lökött vállnyomás',
  'lat pulldown': 'hátlehúzás',
  'pull-up': 'húzódzkodás',
  'chin-up': 'húzódzkodás alsó fogással',
  'push-up': 'fekvőtámasz',
  plank: 'plank',
  'side plank': 'oldalsó plank',
  'bicep curl': 'bicepszhajlítás',
  'barbell curl': 'bicepszhajlítás rúddal',
  'hammer curl': 'kalapácsos bicepszhajlítás',
  'leg press': 'lábtolás',
  'leg curl': 'lábhajlítás',
  'leg extension': 'lábnyújtás',
  'calf raise': 'vádliemelés',
  'lateral raise': 'oldalemelés',
  'front raise': 'elülső karemelés',
  'face pull': 'arcig húzás',
  'hip thrust': 'csípőtolás',
  'glute bridge': 'farizomhíd',
  'mountain climber': 'hegymászó',
  burpee: 'burpee',
  'jumping jack': 'terpeszugrás',
  'russian twist': 'orosz csavarás',
  'farmers walk': 'farmerjárás',
  'good morning': 'jó reggelt gyakorlat',
  'tricep dip': 'tolódzkodás',
  'skull crusher': 'homlokra nyomás',
  'upright row': 'álló evezés',
  'bent over row': 'előredőlt evezés',
  'seated row': 'ülő evezés',
  'pendlay row': 'Pendlay-evezés',
  'clean and jerk': 'szakítás és lökés',
  'power clean': 'lökés földről',
  thruster: 'thruster',
  'wall sit': 'fali ülés',
  'leg raise': 'lábemelés',
  crunch: 'hasprés',
  'sit-up': 'felülés',
};

/**
 * Words that carry no meaning of their own in a name and are dropped.
 *
 * The bare hyphen is the single most common one — 48 occurrences, all from wger's
 * "Barbell Bench Press - Medium Grip" style. It blocked more names than any real word did, which
 * is exactly the sort of thing the frequency report below exists to surface.
 */
const NOISE = new Set([
  'with', 'and', 'the', 'on', 'to', 'a', 'an', 'of', 'or', 'in', 'for', 'at', 'hd', 'vs',
  '-', 's', 'exercise', 'from', 'your', 'you', 'style', 'version', 'variation',
]);

/**
 * Look a token up, falling back to its singular.
 *
 * The frequency report made this obvious: after the first vocabulary pass, the top blockers were
 * `dumbbells`, `push-ups`, `ups`, `pull-ups`, `swings`, `pulls`, `presses` — every one of them a
 * plural of a word already in the dictionary. Listing both forms of everything would double the
 * vocabulary and guarantee the two halves drift; one rule covers them all and covers the next ones
 * too.
 *
 * English plural endings only, in the order that avoids false hits: `-es` before `-s`, so
 * "presses" resolves to "press" rather than to "presse".
 */
const lookup = (table, token) =>
  table[token] ??
  (token.endsWith('es') ? table[token.slice(0, -2)] : undefined) ??
  (token.endsWith('s') ? table[token.slice(0, -1)] : undefined);

const normalise = (name) =>
  name
    .toLowerCase()
    .replace(/[（）()]/g, ' ')
    .replace(/[^a-z0-9\-/ °]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Compose one Hungarian name, or return null if any token is unknown.
 *
 * Word order is the whole job. English puts the equipment first and the movement last; Hungarian
 * puts modifiers first, then the body part COMPOUNDED onto the movement, then the equipment in the
 * instrumental case at the end:
 *
 *   "Barbell Shoulder Press"  →  [rúddal] [váll+nyomás]  →  "vállnyomás rúddal"
 *
 * Getting that backwards is what makes a naive substitution produce "rúd váll nyomás".
 */
/**
 * Multi-word phrases glued into one token before anything else looks at them.
 *
 * "Bent Over Barbell Row" tokenised word by word gave "Dőlt átemelt evezés rúddal": `bent` and
 * `over` were each resolved on their own and produced two unrelated adjectives. The phrase means
 * one thing — "előredőlt" — and it has to be recognised before the tokeniser can take it apart.
 *
 * Longest first, so "bent over row" cannot match a shorter phrase inside it.
 */
const PHRASES = [
  ['bent over', 'bent-over'],
  ['bent-over', 'bent-over'],
  ['close grip', 'close-grip'],
  ['wide grip', 'wide-grip'],
  ['medium grip', 'medium grip'],
  ['reverse grip', 'reverse grip'],
  ['one arm', 'one-arm'],
  ['single arm', 'single-arm'],
  ['one leg', 'one-leg'],
  ['single leg', 'single-leg'],
  ['two arm', 'two-arm'],
  ['straight arm', 'straight-arm'],
  ['straight leg', 'straight-leg'],
  ['stiff legged', 'straight-leg'],
  ['stiff-legged', 'straight-leg'],
  ['half kneeling', 'half-kneeling'],
  ['good morning', 'good-morning'],
  ['pull up', 'pull-up'],
  ['pull ups', 'pull-up'],
  ['push up', 'push-up'],
  ['push ups', 'push-up'],
  ['chin up', 'chin-up'],
  ['sit up', 'sit-up'],
  ['step up', 'step-up'],
  ['low pulley', 'low-pulley'],
  ['skull crusher', 'skull crusher'],
  ['palms up', 'palms-up'],
  ['palms down', 'palms-down'],
].sort((a, b) => b[0].length - a[0].length);

const applyPhrases = (norm) => {
  let out = norm;
  for (const [from, to] of PHRASES) {
    out = out.replace(new RegExp(`\\b${from.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'g'), to);
  }
  return out;
};

/** Sentence case, applied in one place so the override path cannot skip it — it used to. */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function compose(rawName) {
  const norm = normalise(rawName);
  if (OVERRIDE[norm]) return { hu: cap(OVERRIDE[norm]), via: 'override' };

  const tokens = applyPhrases(norm).split(' ').filter((t) => t && !NOISE.has(t));
  if (!tokens.length) return null;

  const modifiers = [];
  const parts = [];
  let movement = null;
  let equipment = null;

  for (const token of tokens) {
    // Equipment is checked first: several words (bench, ball, box) are equipment in one name and
    // a body part or modifier in another, and the equipment reading is the more common one.
    const asEquipment = lookup(EQUIPMENT, token);
    const asBodypart = lookup(BODYPART, token);
    const asMovement = lookup(MOVEMENT, token);
    const asModifier = lookup(MODIFIER, token);

    if (asEquipment && !asBodypart) {
      equipment ??= asEquipment;
      continue;
    }
    if (asMovement) {
      // A second movement word means a compound the vocabulary does not model ("clean and press").
      if (movement) return null;
      movement = asMovement;
      continue;
    }
    if (asBodypart) {
      parts.push(asBodypart);
      continue;
    }
    if (asModifier) {
      modifiers.push(asModifier);
      continue;
    }
    if (asEquipment) {
      equipment ??= asEquipment;
      continue;
    }
    // Unknown token: refuse the whole name rather than drop a word and change its meaning.
    return null;
  }

  if (!movement) return null;

  // An unqualified "curl" means the biceps in every gym on earth. Left as the bare "hajlítás" it
  // reads as "a bend", which is not the name of an exercise. A named body part (leg curl, wrist
  // curl) overrides this by being present.
  if (movement === 'hajlítás' && !parts.length) movement = 'bicepszhajlítás';

  // Body parts compound onto the movement, in the order they appeared: "váll" + "nyomás".
  //
  // Unless the movement noun ALREADY names the body part. "has" + "hasprés" composed to
  // "hashasprés" — grammatical, and something no one has ever said. Hungarian movement nouns
  // frequently embed their body part, so the check is not an edge case.
  const meaningful = parts.filter((part) => !movement.includes(part));
  const head = meaningful.length ? `${meaningful.join('')}${movement}` : movement;
  const words = [...modifiers, head];
  if (equipment) words.push(equipment.with);

  return { hu: cap(words.join(' ')), via: 'composed' };
}

/* ── run ────────────────────────────────────────────────────────────────────────────────────── */

const rows = await db.all(
  "SELECT id, name FROM exercises WHERE status = 'global' AND deleted_at IS NULL ORDER BY id",
);

const composed = [];
const skipped = [];
for (const row of rows) {
  const result = compose(row.name);
  if (result) composed.push({ ...row, ...result });
  else skipped.push(row.name);
}

const overrides = composed.filter((c) => c.via === 'override').length;
console.log(
  `translate-exercises-hu: ${composed.length}/${rows.length} names composed ` +
    `(${Math.round((composed.length / rows.length) * 100)}%) — ${overrides} from the override table, ` +
    `${composed.length - overrides} from the grammar. ${skipped.length} skipped as unknown.`,
);
console.log('\n  sample:');
for (const c of composed.slice(0, 12)) console.log(`    ${c.name}  →  ${c.hu}`);
/*
 * Which words are actually blocking coverage.
 *
 * Adding vocabulary by intuition is guesswork: a word that feels essential may appear twice, and a
 * word nobody would think of may appear ninety times. This counts the unknown tokens across every
 * skipped name and ranks them, so the next fifty entries are the fifty that pay — and so the
 * script reports its own next task instead of leaving someone to work it out.
 */
const TABLES = [EQUIPMENT, MOVEMENT, BODYPART, MODIFIER];
// Uses the same `lookup` the composer does, so a token the plural rule already resolves is not
// reported as blocking. Counting raw keys instead would send someone off to add "dumbbells".
const isKnown = (token) => NOISE.has(token) || TABLES.some((t) => lookup(t, token));
const unknownFreq = new Map();
for (const name of skipped) {
  for (const token of normalise(name).split(' ')) {
    if (!token || isKnown(token)) continue;
    unknownFreq.set(token, (unknownFreq.get(token) ?? 0) + 1);
  }
}
const ranked = [...unknownFreq].sort((a, b) => b[1] - a[1]);
console.log(`\n  blocking vocabulary — ${ranked.length} unknown tokens, top 40 by frequency:`);
console.log(`    ${ranked.slice(0, 40).map(([w, n]) => `${w}(${n})`).join(' ')}`);

console.log('\n  skipped (first 10):');
for (const s of skipped.slice(0, 10)) console.log(`    ${s}`);

if (DRY) {
  console.log('\n--dry: nothing written.');
  await db.closePool();
  process.exit(0);
}

// `origin = 'machine'` even though every word was chosen by hand: no native speaker has reviewed
// the OUTPUT, and the flag is what lets one find and correct these later without guessing which
// rows a person wrote. The ON CONFLICT guard means a reviewed row is never overwritten by a rerun.
await db.writeTx(
  composed.map((c) => ({
    sql: `INSERT INTO exercise_translations (exercise_id, lang, name, normalized_name, origin)
          VALUES (?, 'hu', ?, ?, 'machine')
          ON CONFLICT (exercise_id, lang) DO UPDATE
            SET name = excluded.name, normalized_name = excluded.normalized_name
            WHERE exercise_translations.origin = 'machine'`,
    params: [c.id, c.hu, c.hu.toLowerCase()],
  })),
);

/*
 * Remove machine rows this run no longer produces.
 *
 * Caught by the counts disagreeing: 861 composed, 867 in the table. The extra six were written by
 * an earlier run and stranded when a word was REMOVED from the vocabulary — `over` was pulled
 * after it turned out to compose "Dőlt átemelt evezés" out of "bent over", and the six names that
 * depended on it kept their old, wrong Hungarian with nothing to reveal it.
 *
 * So the script owns its output completely: what it composes, it writes; what it no longer
 * composes, it withdraws. Rows a human has reviewed (`origin <> 'machine'`) are never touched.
 */
const keep = new Set(composed.map((c) => c.id));
const stale = (
  await db.all("SELECT exercise_id FROM exercise_translations WHERE lang = 'hu' AND origin = 'machine'")
).filter((r) => !keep.has(r.exercise_id));

if (stale.length) {
  await db.writeTx(
    stale.map((r) => ({
      sql: "DELETE FROM exercise_translations WHERE exercise_id = ? AND lang = 'hu' AND origin = 'machine'",
      params: [r.exercise_id],
    })),
  );
  console.log(`  withdrew ${stale.length} row(s) this run no longer composes`);
}

const total = (await db.get("SELECT COUNT(*) AS n FROM exercise_translations WHERE lang = 'hu'")).n;
const reviewed = (
  await db.get("SELECT COUNT(*) AS n FROM exercise_translations WHERE lang = 'hu' AND origin <> 'machine'")
).n;
console.log(
  `\nwritten. Hungarian exercise translations now: ${total} (${reviewed} human-reviewed, ${total - reviewed} awaiting review)`,
);
await db.closePool();
