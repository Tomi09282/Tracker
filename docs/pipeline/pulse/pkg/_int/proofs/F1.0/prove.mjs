// prove-f1.0.mjs — the three gates behave the same before and after their exemption lists move to data.
//
//   node prove-f1.0.mjs before   run at the commit BEFORE the change: variants of the original scripts
//   node prove-f1.0.mjs after    run AFTER the change: the same defects planted in the data files
//   node prove-f1.0.mjs compare  byte compare, print the table
import { spawnSync, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TREE = 'C:/Users/Petike/Documents/Cursor/tracker-wt/int';
const FRONTEND = path.join(TREE, 'frontend');
const OUT = path.join(HERE, 'f1.0-proof');
const BEFORE_COMMIT = '1d42ef3';

const GATES = {
  'check:i18n': {
    script: 'scripts/check-i18n.mjs',
    data: 'scripts/data/i18n-untranslated.json',
    map: 'UNTRANSLATED_BY_DESIGN',
    cases: {
      green: [],
      'exemption-removed': [['remove', 'nav.admin']],
      'exemption-for-a-key-that-does-not-exist': [['add', 'nav.doesNotExist', 'planted']],
      'exemption-for-a-translated-key': [['add', 'nav.home', 'planted']],
    },
  },
  'check:elements': {
    script: 'scripts/check-element-roster.mjs',
    data: 'scripts/data/elements-dormant.json',
    map: 'DORMANT',
    cases: {
      green: [],
      'dormant-entry-removed': [['remove', 'E23']],
      'dormant-entry-for-a-live-element': [['add', 'E1', 'planted']],
    },
  },
  'check:safe-area': {
    script: 'scripts/check-safe-area.mjs',
    data: 'scripts/data/safe-area-exempt.json',
    map: 'EXEMPT',
    cases: {
      green: [],
      'exemption-removed-offline-indicator': [['remove', 'ui/shell/OfflineIndicator.tsx:bottom']],
      'exemption-removed-sheet': [['remove', 'ui/feedback/variants/E14E20.tsx:top']],
      'exemption-for-a-file-that-does-not-exist': [['add', 'ui/Nope.tsx:top', 'planted']],
    },
  },
};

const run = (scriptPath) => spawnSync(process.execPath, [scriptPath], { cwd: FRONTEND, encoding: 'buffer' });
const save = (phase, gate, name, r) => {
  const base = path.join(OUT, phase, `${gate.replace(':', '-')}.${name}`);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  fs.writeFileSync(`${base}.out`, r.stdout);
  fs.writeFileSync(`${base}.err`, r.stderr);
  fs.writeFileSync(`${base}.code`, String(r.status));
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const phase = process.argv[2];

if (phase === 'before') {
  for (const [gate, g] of Object.entries(GATES)) {
    const original = execFileSync('git', ['show', `${BEFORE_COMMIT}:frontend/${g.script}`], { cwd: TREE, encoding: 'utf8' });
    for (const [name, edits] of Object.entries(g.cases)) {
      let src = original;
      for (const [op, key, reason] of edits) {
        const open = new RegExp(`const ${g.map} = new Map\\(\\[\\n`);
        if (!open.test(src)) throw new Error(`${gate}: cannot find the ${g.map} literal`);
        if (op === 'remove') {
          const line = new RegExp(`^\\s*\\['${esc(key)}',.*\\],\\n`, 'm');
          if (!line.test(src)) throw new Error(`${gate}: no entry line for ${key}`);
          src = src.replace(line, '');
        } else {
          src = src.replace(open, (m) => `${m}    ['${key}', '${reason}'],\n`);
        }
      }
      // The original scripts import node builtins only, so a variant can live outside the tree.
      const tmp = path.join(OUT, `variant-${gate.replace(':', '-')}-${name}.mjs`);
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(tmp, src);
      const r = run(tmp);
      fs.rmSync(tmp);
      save('before', gate, name, r);
      console.log(`before ${gate.padEnd(16)} ${name.padEnd(44)} exit ${r.status}`);
    }
  }
} else if (phase === 'after') {
  for (const [gate, g] of Object.entries(GATES)) {
    const dataPath = path.join(FRONTEND, g.data);
    const pristine = fs.readFileSync(dataPath);
    try {
      for (const [name, edits] of Object.entries(g.cases)) {
        const doc = JSON.parse(pristine.toString('utf8'));
        for (const [op, key, reason] of edits) {
          if (op === 'remove') {
            if (!(key in doc.entries)) throw new Error(`${gate}: ${key} is not in ${g.data}`);
            delete doc.entries[key];
          } else {
            doc.entries = { [key]: reason, ...doc.entries };
          }
        }
        if (edits.length) fs.writeFileSync(dataPath, `${JSON.stringify(doc, null, 2)}\n`);
        const r = run(g.script);
        fs.writeFileSync(dataPath, pristine);
        save('after', gate, name, r);
        console.log(`after  ${gate.padEnd(16)} ${name.padEnd(44)} exit ${r.status}`);
      }
    } finally {
      fs.writeFileSync(dataPath, pristine);
    }
  }
} else if (phase === 'compare') {
  const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  let bad = 0;
  const rows = [];
  for (const [gate, g] of Object.entries(GATES)) {
    for (const name of Object.keys(g.cases)) {
      const stem = `${gate.replace(':', '-')}.${name}`;
      const b = path.join(OUT, 'before', stem);
      const a = path.join(OUT, 'after', stem);
      const same = ['out', 'err', 'code'].every((ext) => fs.readFileSync(`${b}.${ext}`).equals(fs.readFileSync(`${a}.${ext}`)));
      if (!same) bad += 1;
      rows.push({
        gate,
        case: name,
        exit: Number(fs.readFileSync(`${a}.code`, 'utf8')),
        stdoutBytes: fs.statSync(`${a}.out`).size,
        stderrBytes: fs.statSync(`${a}.err`).size,
        stdoutSha256: sha(`${a}.out`),
        stderrSha256: sha(`${a}.err`),
        identical: same,
      });
    }
  }
  fs.writeFileSync(path.join(OUT, 'result.json'), `${JSON.stringify(rows, null, 2)}\n`);
  for (const r of rows) {
    console.log(
      `${r.identical ? 'IDENTICAL' : 'DIFFERENT'}  ${r.gate.padEnd(16)} ${r.case.padEnd(44)} exit ${r.exit}  out ${String(r.stdoutBytes).padStart(4)} B  err ${String(r.stderrBytes).padStart(4)} B`,
    );
  }
  console.log(bad ? `\n${bad} case(s) differ` : `\nall ${rows.length} cases byte-identical (stdout, stderr and exit code)`);
  process.exit(bad ? 1 : 0);
} else {
  console.error('usage: node prove-f1.0.mjs before|after|compare');
  process.exit(2);
}
