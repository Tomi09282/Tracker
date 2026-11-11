// extract-gate-data.mjs — write (or verify) scripts/data/*.json from the Map literals of the ORIGINAL scripts.
//
//   node extract-gate-data.mjs write    evaluate the three literals at the "before" commit, write the JSON files
//   node extract-gate-data.mjs verify   the lists the gates read now equal the original literals, entry by entry, in order
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TREE = 'C:/Users/Petike/Documents/Cursor/tracker-wt/int';
const BEFORE_COMMIT = '1d42ef3';
const DATA = path.join(TREE, 'frontend/scripts/data');

const LISTS = [
  {
    name: 'i18n-untranslated',
    script: 'check-i18n.mjs',
    map: 'UNTRANSLATED_BY_DESIGN',
    about:
      'Keys whose string is deliberately the same in Hungarian and in English or German (a borrowed word, a unit, a product name). ' +
      'Read by scripts/check-i18n.mjs as UNTRANSLATED_BY_DESIGN; written by scripts/pulse-i18n.mjs, never by hand. ' +
      'One reason per key. The gate fails on a key that is identical and not listed here, and on an entry whose key is gone or is translated now.',
  },
  {
    name: 'elements-dormant',
    script: 'check-element-roster.mjs',
    map: 'DORMANT',
    about:
      'Feedback elements that exist in the catalogue and that no component reads. ' +
      'Read by scripts/check-element-roster.mjs as DORMANT; written by scripts/pulse-variants.mjs, never by hand. ' +
      'One reason per element: it tells a reviewer whether the entry is a gap to close or a row to delete, and it is a promise that the studio labels the element as inert. ' +
      'The gate fails on an unread element that is not listed here, and on an entry whose element has a reader.',
  },
  {
    name: 'safe-area-exempt',
    script: 'check-safe-area.mjs',
    map: 'EXEMPT',
    about:
      'Edge-pinned elements that are exempt from the safe-area inset rule, as "<file under src>:<edge>". ' +
      'Read by scripts/check-safe-area.mjs as EXEMPT; changed through a hand-in patch applied by the integrator, never by hand in a slot. ' +
      'One reason per entry: an exemption is a written decision. The gate fails on an entry whose file no longer exists.',
  },
];

const originalMap = ({ script, map }) => {
  const src = execFileSync('git', ['show', `${BEFORE_COMMIT}:frontend/scripts/${script}`], { cwd: TREE, encoding: 'utf8' });
  const m = new RegExp(`const ${map} = new Map\\((\\[[\\s\\S]*?\\n\\s*\\])\\);`).exec(src);
  if (!m) throw new Error(`${script}: cannot find the ${map} literal`);
  // The literal is plain data (string pairs and comments); evaluating it reproduces it exactly,
  // which re-typing could not promise.
  return new Map(new Function(`return ${m[1]};`)());
};

const mode = process.argv[2];
if (mode === 'write') {
  fs.mkdirSync(DATA, { recursive: true });
  for (const list of LISTS) {
    const entries = Object.fromEntries(originalMap(list));
    fs.writeFileSync(path.join(DATA, `${list.name}.json`), `${JSON.stringify({ about: list.about, entries }, null, 2)}\n`);
    console.log(`wrote ${list.name}.json — ${Object.keys(entries).length} entries`);
  }
} else if (mode === 'verify') {
  const { readGateData, writeGateData, gateDataPath } = await import(pathToFileURL(path.join(DATA, 'gate-data.mjs')).href);
  let bad = 0;
  for (const list of LISTS) {
    const before = [...originalMap(list)];
    const after = [...readGateData(list.name)];
    const same = before.length === after.length && before.every(([k, v], i) => after[i][0] === k && after[i][1] === v);
    if (!same) bad += 1;
    console.log(`${same ? 'EQUAL    ' : 'DIFFERENT'} ${list.name}: ${before.length} entries in the original ${list.map} literal, ${after.length} in the data file (keys, reasons and order)`);

    // The writer: writing back what was read must not change a byte — in LF and in CRLF.
    const file = gateDataPath(list.name);
    const pristine = fs.readFileSync(file);
    try {
      for (const eol of ['\n', '\r\n']) {
        const text = pristine.toString('utf8').replace(/\r\n/g, '\n').replace(/\n/g, eol);
        fs.writeFileSync(file, text);
        writeGateData(list.name, readGateData(list.name));
        const roundTrip = fs.readFileSync(file, 'utf8') === text;
        // …and a real change keeps the line endings and the `about` text.
        const plus = new Map([...readGateData(list.name), ['zz.probe', 'round-trip probe']]);
        writeGateData(list.name, plus);
        const grown = fs.readFileSync(file, 'utf8');
        const keptEol = eol === '\r\n' ? !/[^\r]\n/.test(grown) : !grown.includes('\r');
        const keptAbout = JSON.parse(grown).about === JSON.parse(text).about && JSON.parse(grown).entries['zz.probe'] === 'round-trip probe';
        if (!roundTrip || !keptEol || !keptAbout) bad += 1;
        console.log(`  writer ${eol === '\n' ? 'LF  ' : 'CRLF'}: round trip ${roundTrip ? 'byte-identical' : 'CHANGED'}, line endings ${keptEol ? 'kept' : 'LOST'}, about ${keptAbout ? 'kept' : 'LOST'}`);
      }
    } finally {
      fs.writeFileSync(file, pristine);
    }
  }
  // Fail-closed: a list with a reason missing must throw, not read as empty.
  {
    const file = gateDataPath('safe-area-exempt');
    const pristine = fs.readFileSync(file);
    try {
      const doc = JSON.parse(pristine.toString('utf8'));
      doc.entries['ui/x.tsx:top'] = '';
      fs.writeFileSync(file, JSON.stringify(doc));
      let threw = false;
      try {
        readGateData('safe-area-exempt');
      } catch {
        threw = true;
      }
      if (!threw) bad += 1;
      console.log(`reader refuses an entry with an empty reason: ${threw ? 'yes' : 'NO'}`);
    } finally {
      fs.writeFileSync(file, pristine);
    }
  }
  process.exit(bad ? 1 : 0);
} else {
  console.error('usage: node extract-gate-data.mjs write|verify');
  process.exit(2);
}
