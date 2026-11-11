// Writes i18n.patch.json (run: node make-i18n.mjs). Names are USER DATA: they are created in the user's
// language at the click of "Kezdő kihívások hozzáadása" (challenges.starter.<id>), so they live in the bundles.
import fs from 'node:fs';
const src = 'finding O2 (docs/pipeline/pulse/review/lifeos-open.md): opt-in starter list on the empty pool';
const names = {
  s01: ['Ágyazz be reggel', 'Make your bed in the morning', 'Mach morgens dein Bett'],
  s02: ['Tíz perc rendrakás', 'Ten minutes of tidying', 'Zehn Minuten aufräumen'],
  s03: ['Húsz perc séta', 'A twenty-minute walk', 'Zwanzig Minuten spazieren gehen'],
  s04: ['Tíz fekvőtámasz', 'Ten push-ups', 'Zehn Liegestütze'],
  s05: ['Olvass tíz oldalt', 'Read ten pages', 'Lies zehn Seiten'],
  s06: ['Öt perc csendes légzés', 'Five minutes of quiet breathing', 'Fünf Minuten ruhig atmen'],
  s07: ['Hívj fel egy barátot', 'Call a friend', 'Ruf einen Freund an'],
  s08: ['Írj egy kedves üzenetet', 'Send a kind message', 'Schreib eine nette Nachricht'],
  s09: ['Igyál két pohár vizet', 'Drink two glasses of water', 'Trink zwei Gläser Wasser'],
  s10: ['Főzz ma otthon', 'Cook at home today', 'Koch heute zu Hause'],
};
const set = [
  { key: 'challenges.starter.add', hu: 'Kezdő kihívások hozzáadása', en: 'Add starter challenges', de: 'Starter-Challenges hinzufügen', copy: 'proposed', visible: true, source: src + ': the one action, on the empty pool and on Ma\u2019s empty NAPI DOBÁS' },
  ...Object.entries(names).map(([id, [hu, en, de]]) => ({ key: `challenges.starter.${id}`, hu, en, de, copy: 'proposed', visible: true, source: src + ': the name of starter ' + id + ' (user data, written into the pool in the current language)' })),
];
fs.writeFileSync(new URL('./i18n.patch.json', import.meta.url), JSON.stringify({ package: 'F-starter-challenges', base: '8a70da3', namespaces: ['challenges'], set }, null, 2) + '\n');
