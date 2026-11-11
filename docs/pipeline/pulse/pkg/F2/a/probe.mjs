/**
 * F2 stage a — the proof that `check:canvas` and `check:type-scale` turn red on the defects they guard.
 *
 * A gate that has never been seen failing is a gate nobody knows works. This runner plants one defect
 * at a time, runs the REAL gate script, and expects exit 1 with the message that names the defect.
 *
 * HOW A DEFECT IS PLANTED. Both gates read five files, all relative to the working directory:
 *
 *     src/ui/tokens/tokens.css   src/lib/cn.ts   src/index.css   index.html   public/manifest.webmanifest
 *
 * The runner copies those five into a throwaway directory under the OS temp dir (same relative paths),
 * edits the COPY, and runs `node <frontend>/scripts/check-….mjs` with that directory as the working
 * directory. The gate under test is the file in the tree, byte for byte; only its input is staged. The
 * working tree is never written — a killed run leaves nothing behind — and the runner still hashes the
 * five real files before and after, and says so.
 *
 * TWO STAGES.
 *   `tree`  — the five files exactly as they are in this checkout.
 *   `pulse` — the tree with the Pulse type ramp. Before commit F1.4 that ramp does not exist, and the
 *             family-binding leg of `check:type-scale` is dormant (it says so on every run). So the
 *             runner BUILDS the F1.4 state on the copy: the sixteen Pulse steps of PLAN.md 3.3, the three
 *             homonyms renamed to `-legacy` (R3), `TYPE_STEPS` to match, and the `type-binding` block.
 *             Once the real tree declares `--text-giant`, the stage is the tree itself and nothing is
 *             built — the same probes then run against the integrator's own block.
 *
 * Every edit is anchored: an anchor that matches zero times or more than once stops the run with the
 * probe's name. A probe that cannot be planted is never reported as passed.
 *
 * The permanent home of these probes is `verify:gates` (F2 stage b), which plants in the tree under a
 * lock. This file is the evidence for stage a and stays runnable until that runner covers the cases.
 *
 * Run (cwd `frontend/`):
 *     node ../docs/pipeline/pulse/pkg/F2/a/probe.mjs                  print the table, exit 1 on a miss
 *     node ../docs/pipeline/pulse/pkg/F2/a/probe.mjs --record <file>  also write the record as JSON
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FILES = {
  tokens: 'src/ui/tokens/tokens.css',
  cn: 'src/lib/cn.ts',
  css: 'src/index.css',
  html: 'index.html',
  manifest: 'public/manifest.webmanifest',
};
const GATES = { canvas: 'scripts/check-canvas.mjs', type: 'scripts/check-type-scale.mjs' };

const frontend = process.cwd();
for (const file of [...Object.values(FILES), ...Object.values(GATES)]) {
  if (!fs.existsSync(path.join(frontend, file))) {
    console.error(`probe: ${file} not found — run from frontend/.`);
    process.exit(2);
  }
}

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(frontend, file))).digest('hex');
const hashTree = () => Object.fromEntries(Object.values(FILES).map((file) => [file, sha(file)]));
const readTree = () =>
  Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(path.join(frontend, file), 'utf8')]));

const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace the ONE match of `pattern`; anything else is a broken anchor, and that is an error. */
function once(text, pattern, replacement, what) {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const hits = [...text.matchAll(global)].length;
  if (hits !== 1) throw new Error(`the anchor for "${what}" matched ${hits} time(s), expected exactly 1`);
  return text.replace(pattern, replacement);
}

// ─── running a gate on a staged copy ──────────────────────────────────────────────────────────

function run(gate, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-f2a-probe-'));
  try {
    for (const [key, file] of Object.entries(FILES)) {
      const target = path.join(dir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, files[key]);
    }
    const result = spawnSync(process.execPath, [path.join(frontend, GATES[gate])], { cwd: dir, encoding: 'utf8' });
    return { exit: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ─── the `pulse` stage: the tree as commit F1.4 leaves it ─────────────────────────────────────

/** name, size, line height, weight, tracking — PLAN.md 3.3 "the token block in five lines". */
const PULSE_RAMP = [
  ['giant', '7.75rem', '6.75rem', 900, '-0.01em'],
  ['num', '3rem', '3rem', 900, null],
  ['display-xl', '3rem', '3rem', 700, '0.01em'],
  ['display', '2rem', '2.125rem', 700, '0.01em'],
  ['eyebrow', '1rem', '1.25rem', 700, '0.06em'],
  ['title', '1.375rem', '1.75rem', 600, '-0.01em'],
  ['body', '1rem', '1.375rem', 400, null],
  ['body-m', '1rem', '1.375rem', 500, null],
  ['body-b', '1rem', '1.375rem', 600, null],
  ['cap', '0.8125rem', '1.125rem', 400, null],
  ['cap-m', '0.8125rem', '1.125rem', 500, null],
  ['tab', '0.6875rem', '0.875rem', 500, '0.01em'],
  ['tab-on', '0.6875rem', '0.875rem', 600, '0.01em'],
  ['data-l', '1rem', '1.25rem', 500, '-0.01em'],
  ['data', '0.8125rem', '1.125rem', 500, null],
  ['micro', '0.6875rem', '1rem', 500, '0.10em'],
];
const HOMONYMS = ['display', 'body', 'micro'];
const BINDING = [
  '@layer components {',
  '  /* type-binding:start */',
  '  .text-giant, .text-num, .text-display-xl, .text-display, .text-eyebrow { font-family: var(--font-display); }',
  '  .text-data-l, .text-data, .text-micro { font-family: var(--font-mono); }',
  '  .text-display-xl, .text-display, .text-eyebrow, .text-micro { text-transform: uppercase; }',
  '  /* type-binding:end */',
  '}',
];

function buildPulseStage(tree) {
  const stage = { ...tree };

  // tokens.css: the three old steps that share a name with a Pulse step move to `-legacy` …
  const eol = eolOf(tree.tokens);
  let tokens = tree.tokens.replace(new RegExp(`--text-(${HOMONYMS.join('|')})(?=\\s*:|--)`, 'g'), '--text-$1-legacy');
  // … and the sixteen Pulse steps are declared at the head of the theme block.
  const steps = PULSE_RAMP.flatMap(([name, size, line, weight, tracking]) => [
    `  --text-${name}: ${size};`,
    `  --text-${name}--line-height: ${line};`,
    `  --text-${name}--font-weight: ${weight};`,
    ...(tracking ? [`  --text-${name}--letter-spacing: ${tracking};`] : []),
  ]);
  tokens = once(tokens, /@theme static \{/, (open) => open + eol + steps.join(eol), 'the head of @theme static');
  stage.tokens = tokens;

  // cn.ts: the same names, in the same commit.
  const list = /const TYPE_STEPS = \[([\s\S]*?)\]/.exec(tree.cn);
  if (!list) throw new Error('TYPE_STEPS not found in src/lib/cn.ts');
  const legacy = [...list[1].matchAll(/'([A-Za-z0-9_-]+)'/g)].map((m) => (HOMONYMS.includes(m[1]) ? `${m[1]}-legacy` : m[1]));
  const names = [...PULSE_RAMP.map((step) => step[0]), ...legacy];
  stage.cn = once(
    tree.cn,
    /const TYPE_STEPS = \[[\s\S]*?\]/,
    () => `const TYPE_STEPS = [${names.map((n) => `'${n}'`).join(', ')}]`,
    'TYPE_STEPS',
  );

  // index.css: the binding block, at the end of the file.
  const cssEol = eolOf(tree.css);
  stage.css = tree.css + cssEol + BINDING.join(cssEol) + cssEol;
  return stage;
}

// ─── edits inside the binding block (tolerant of how the block is laid out) ───────────────────

const BLOCK = /(\/\*\s*type-binding:start\s*\*\/)([\s\S]*?)(\/\*\s*type-binding:end\s*\*\/)/;

/** Rewrite the selector list of the one rule that declares `property: value`. */
function editBinding(css, property, value, what, rewrite) {
  let hits = 0;
  const out = once(
    css,
    BLOCK,
    (_all, start, body, end) =>
      start +
      body.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, prelude, declarations) => {
        if (!declarations.replace(/\s+/g, '').includes(`${property}:${value}`)) return rule;
        const next = rewrite(prelude);
        if (next === prelude) return rule;
        hits += 1;
        return `${next}{${declarations}}`;
      }) +
      end,
    'the type-binding block',
  );
  if (hits !== 1) throw new Error(`"${what}" changed ${hits} rule(s) of the type-binding block, expected exactly 1`);
  return out;
}

const dropSelector = (css, step, property, value) =>
  editBinding(css, property, value, `drop .text-${step} from ${property}: ${value}`, (prelude) => {
    const selectors = prelude.split(',');
    const kept = selectors.filter((s) => s.trim() !== `.text-${step}`);
    return kept.length === selectors.length || kept.length === 0 ? prelude : kept.join(',');
  });

const addSelector = (css, step, property, value) =>
  editBinding(css, property, value, `add .text-${step} to ${property}: ${value}`, (prelude) =>
    prelude.replace(/^(\s*)/, (_m, indent) => `${indent}.text-${step}, `),
  );

/** A hex that differs from `value` — the last digit is flipped, so the planted colour is one step off. */
const otherHex = (value) => value.slice(0, -1) + (value.slice(-1).toLowerCase() === 'a' ? '0' : 'A');

function manifestField(text, field) {
  return once(
    text,
    new RegExp(`("${field}"\\s*:\\s*")(#[0-9A-Fa-f]{3,8})(")`),
    (_m, open, value, close) => open + otherHex(value) + close,
    `${field} in the manifest`,
  );
}

const DEFAULT_CANVAS = /((?:^|[\s{;])--surface-0\s*:\s*)(#[0-9A-Fa-f]{3,8})(\s*;)/;
/** The first `--surface-0` of the file is the default (`:root`) one in every layout this repo has had. */
const firstCanvas = (text, replacement) => {
  const m = DEFAULT_CANVAS.exec(text);
  if (!m) throw new Error('no hex --surface-0 declaration found in tokens.css');
  return text.slice(0, m.index) + m[1] + replacement(m[2]) + m[3] + text.slice(m.index + m[0].length);
};

const META = /<meta\b[^>]*\bname\s*=\s*["']theme-color["'][^>]*>/i;

// ─── the probes ───────────────────────────────────────────────────────────────────────────────

/**
 * stage: which copy the defect is planted in. expect: a pattern the gate's output must match once
 * runs of whitespace are folded to one space. `green: true` marks a CONTROL — an edit that is not a
 * defect and must leave the gate green (a gate that fails on everything proves nothing either).
 */
const PROBES = [
  // check:canvas — PLAN.md 3.6: "change one manifest colour"
  {
    id: 'canvas-manifest-background',
    gate: 'canvas',
    stage: 'tree',
    defect: 'background_color of the manifest changed alone',
    plant: (f) => ({ ...f, manifest: manifestField(f.manifest, 'background_color') }),
    expect: /check-canvas: 1 problem\(s\) `background_color` is #[0-9A-F]{6} \(public\/manifest\.webmanifest:\d+\), and `--surface-0` is #[0-9A-F]{6}/,
  },
  {
    id: 'canvas-manifest-theme',
    gate: 'canvas',
    stage: 'tree',
    defect: 'theme_color of the manifest changed alone',
    plant: (f) => ({ ...f, manifest: manifestField(f.manifest, 'theme_color') }),
    expect: /check-canvas: 1 problem\(s\) `theme_color` is #[0-9A-F]{6} \(public\/manifest\.webmanifest:\d+\), and `--surface-0` is #[0-9A-F]{6}/,
  },
  {
    id: 'canvas-meta',
    gate: 'canvas',
    stage: 'tree',
    defect: '<meta name="theme-color"> of index.html changed alone',
    plant: (f) => ({
      ...f,
      html: once(f.html, META, (tag) => tag.replace(/#[0-9A-Fa-f]{3,8}/, (v) => otherHex(v)), 'the theme-color meta tag'),
    }),
    expect: /check-canvas: 1 problem\(s\) `<meta name="theme-color">` is #[0-9A-F]{6} \(index\.html:\d+\), and `--surface-0` is #[0-9A-F]{6}/,
  },
  {
    id: 'canvas-token-alone',
    gate: 'canvas',
    stage: 'tree',
    defect: '--surface-0 changed in :root and none of the three copies followed (the slip commit F1.3 can make)',
    plant: (f) => ({ ...f, tokens: firstCanvas(f.tokens, otherHex) }),
    expect: /check-canvas: 3 problem\(s\) .*theme-color.*`theme_color`.*`background_color`/,
  },
  {
    id: 'canvas-meta-deleted',
    gate: 'canvas',
    stage: 'tree',
    defect: 'the theme-color meta tag deleted',
    plant: (f) => ({ ...f, html: once(f.html, META, () => '', 'the theme-color meta tag') }),
    expect: /index\.html has 0 `<meta name="theme-color">` tag\(s\); there must be exactly one/,
  },
  {
    id: 'canvas-not-hex',
    gate: 'canvas',
    stage: 'tree',
    defect: '--surface-0 written as rgb() instead of a hex literal',
    plant: (f) => ({ ...f, tokens: firstCanvas(f.tokens, () => 'rgb(11 13 10)') }),
    expect: /`--surface-0` is `rgb\(11 13 10\)` \(src\/ui\/tokens\/tokens\.css:\d+\) — the canvas must be a hex literal/,
  },
  {
    id: 'canvas-conditional-root',
    gate: 'canvas',
    stage: 'tree',
    defect: 'every rule of tokens.css wrapped in @media, so no unconditional :root declares the canvas',
    plant: (f) => ({ ...f, tokens: `@media (min-width: 1px) {${eolOf(f.tokens)}${f.tokens}${eolOf(f.tokens)}}` }),
    expect: /declares no `--surface-0` in an unconditional `:root` rule/,
  },
  {
    id: 'canvas-layered-root',
    gate: 'canvas',
    stage: 'tree',
    green: true,
    defect: 'CONTROL — every rule of tokens.css wrapped in @layer: :root is still unconditional',
    plant: (f) => ({ ...f, tokens: `@layer probe {${eolOf(f.tokens)}${f.tokens}${eolOf(f.tokens)}}` }),
    expect: /check-canvas: OK — #[0-9A-F]{6} in all four places/,
  },

  // check:type-scale, legs 1 and 2 — PLAN.md 3.6: "a step declared without a cn.ts entry"
  {
    id: 'type-step-not-listed',
    gate: 'type',
    stage: 'tree',
    defect: 'a step declared in tokens.css without a cn.ts entry',
    plant: (f) => ({
      ...f,
      tokens: once(f.tokens, /@theme static \{/, (open) => `${open}${eolOf(f.tokens)}  --text-probe: 1rem;`, '@theme static'),
    }),
    expect: /`text-probe` is declared in src\/ui\/tokens\/tokens\.css but not listed in src\/lib\/cn\.ts/,
  },
  {
    id: 'type-entry-not-declared',
    gate: 'type',
    stage: 'tree',
    defect: 'a cn.ts entry with no step declared',
    plant: (f) => ({ ...f, cn: once(f.cn, /const TYPE_STEPS = \[/, (open) => `${open} 'probe',`, 'TYPE_STEPS') }),
    expect: /`probe` is listed in src\/lib\/cn\.ts but no --text-probe exists in src\/ui\/tokens\/tokens\.css/,
  },
  {
    id: 'type-fluid-step-unlisted',
    gate: 'type',
    stage: 'tree',
    onlyBeforePulse: true,
    defect: '--text-giant: min(124px, 31vw) declared, cn.ts untouched (the old gate skipped it and stayed green)',
    plant: (f) => ({
      ...f,
      tokens: once(
        f.tokens,
        /@theme static \{/,
        (open) => `${open}${eolOf(f.tokens)}  --text-giant: min(124px, 31vw);`,
        '@theme static',
      ),
    }),
    expect: /`text-giant` is declared in .* but not listed in .*`--text-giant` is `min\(124px, 31vw\)` \(src\/ui\/tokens\/tokens\.css:\d+\) — a type step must be a plain length/,
  },

  // check:type-scale on the Pulse ramp — PLAN.md 3.6: "`--text-giant` written as `min(…)`",
  // "`.text-eyebrow` dropped from the binding"
  {
    id: 'type-giant-as-min',
    gate: 'type',
    stage: 'pulse',
    defect: '--text-giant written as min(7.75rem, 31vw), cn.ts entry present',
    plant: (f) => ({
      ...f,
      tokens: once(f.tokens, /(--text-giant\s*:\s*)[^;]+;/, (_m, head) => `${head}min(7.75rem, 31vw);`, '--text-giant'),
    }),
    expect: /check-type-scale: 1 problem\(s\) `--text-giant` is `min\(7\.75rem, 31vw\)` \(src\/ui\/tokens\/tokens\.css:\d+\) — a type step must be a plain length/,
  },
  {
    id: 'type-eyebrow-not-display',
    gate: 'type',
    stage: 'pulse',
    defect: '.text-eyebrow dropped from the display-face rule of the binding',
    plant: (f) => ({ ...f, css: dropSelector(f.css, 'eyebrow', 'font-family', 'var(--font-display)') }),
    expect: /check-type-scale: 1 problem\(s\) `text-eyebrow` is the display face in the ramp, and the type-binding block \(\S+:\d+\) does not give `\.text-eyebrow` `font-family: var\(--font-display\)`/,
  },
  {
    id: 'type-eyebrow-not-upper',
    gate: 'type',
    stage: 'pulse',
    defect: '.text-eyebrow dropped from the upper-case rule of the binding',
    plant: (f) => ({ ...f, css: dropSelector(f.css, 'eyebrow', 'text-transform', 'uppercase') }),
    expect: /check-type-scale: 1 problem\(s\) `text-eyebrow` is upper case in the ramp, and the type-binding block \(\S+:\d+\) does not give `\.text-eyebrow` `text-transform: uppercase`/,
  },
  {
    id: 'type-micro-not-mono',
    gate: 'type',
    stage: 'pulse',
    defect: '.text-micro dropped from the mono rule of the binding',
    plant: (f) => ({ ...f, css: dropSelector(f.css, 'micro', 'font-family', 'var(--font-mono)') }),
    expect: /check-type-scale: 1 problem\(s\) `text-micro` is the mono face in the ramp, and the type-binding block \(\S+:\d+\) does not give `\.text-micro` `font-family: var\(--font-mono\)`/,
  },
  {
    id: 'type-body-bound-display',
    gate: 'type',
    stage: 'pulse',
    defect: 'a body-face step (.text-body) added to the display-face rule of the binding',
    plant: (f) => ({ ...f, css: addSelector(f.css, 'body', 'font-family', 'var(--font-display)') }),
    expect: /check-type-scale: 1 problem\(s\) The type-binding block \(\S+:\d+\) gives `\.text-body` `font-family: var\(--font-display\)`, and the ramp does not/,
  },
  {
    id: 'type-binding-deleted',
    gate: 'type',
    stage: 'pulse',
    defect: 'the whole type-binding block deleted while the Pulse ramp is declared',
    plant: (f) => ({ ...f, css: once(f.css, BLOCK, () => '', 'the type-binding block') }),
    expect: /check-type-scale: 1 problem\(s\) The Pulse ramp is declared \(.*`text-giant`.*\) and there is no type-binding block/,
  },
  {
    id: 'type-binding-unlayered',
    gate: 'type',
    stage: 'pulse',
    defect: 'the type-binding block moved out of @layer components to the top level',
    plant: (f) => {
      const block = BLOCK.exec(f.css);
      if (!block) throw new Error('the type-binding block was not found');
      const eol = eolOf(f.css);
      return { ...f, css: once(f.css, BLOCK, () => '', 'the type-binding block') + eol + block[0] + eol };
    },
    expect: /check-type-scale: 1 problem\(s\) The type-binding block \(\S+:\d+\) is not directly inside `@layer components` \(found: no layer at all\)/,
  },
  {
    id: 'type-binding-end-marker',
    gate: 'type',
    stage: 'pulse',
    defect: 'the type-binding:end marker deleted',
    plant: (f) => ({ ...f, css: once(f.css, /\/\*\s*type-binding:end\s*\*\//, () => '', 'the end marker') }),
    expect: /check-type-scale: 1 problem\(s\) The type-binding markers are not one pair/,
  },
  {
    id: 'type-pulse-step-not-listed',
    gate: 'type',
    stage: 'pulse',
    defect: "'eyebrow' removed from TYPE_STEPS while --text-eyebrow stays declared and bound",
    plant: (f) => ({ ...f, cn: once(f.cn, /'eyebrow'\s*,?\s*/, () => '', "'eyebrow' in TYPE_STEPS") }),
    expect: /check-type-scale: 1 problem\(s\) `text-eyebrow` is declared in src\/ui\/tokens\/tokens\.css but not listed in src\/lib\/cn\.ts/,
  },
];

// ─── run ──────────────────────────────────────────────────────────────────────────────────────

const recordAt = process.argv.includes('--record') ? process.argv[process.argv.indexOf('--record') + 1] : null;
if (process.argv.includes('--record') && !recordAt) {
  console.error('probe: --record needs a file path.');
  process.exit(2);
}

const before = hashTree();
const tree = readTree();
const pulseInTree = /(?<![\w-])--text-giant\s*:/.test(tree.tokens.replace(/\/\*[\s\S]*?\*\//g, ''));
const stages = { tree, pulse: pulseInTree ? tree : buildPulseStage(tree) };
const fold = (text) => text.replace(/\s+/g, ' ').trim();
const lastLine = (text) => text.trim().split(/\r?\n/).at(-1) ?? '';

const rows = [];
let failed = 0;

// A probe means nothing unless the gate is green before the defect goes in.
const baselines = [
  { gate: 'canvas', stage: 'tree' },
  { gate: 'type', stage: 'tree' },
  { gate: 'type', stage: 'pulse' },
];
for (const { gate, stage } of baselines) {
  const { exit, output } = run(gate, stages[stage]);
  const ok = exit === 0;
  if (!ok) failed += 1;
  rows.push({ id: `baseline-${gate}-${stage}`, gate: GATES[gate], stage, defect: 'none — the stage as it is', expected: 'exit 0', exit, ok, said: lastLine(output) });
}

for (const probe of PROBES) {
  if (probe.onlyBeforePulse && pulseInTree) {
    rows.push({ id: probe.id, gate: GATES[probe.gate], stage: probe.stage, defect: probe.defect, expected: 'skipped', exit: null, ok: true, said: 'skipped — the tree already declares --text-giant; covered by type-giant-as-min' });
    continue;
  }
  let exit = null;
  let said = '';
  let ok = false;
  try {
    const { exit: code, output } = run(probe.gate, probe.plant(stages[probe.stage]));
    exit = code;
    const folded = fold(output);
    const match = probe.expect.exec(folded);
    ok = exit === (probe.green ? 0 : 1) && Boolean(match);
    said = match ? match[0] : folded.slice(0, 300);
  } catch (err) {
    said = `NOT PLANTED — ${err.message}`;
  }
  if (!ok) failed += 1;
  rows.push({ id: probe.id, gate: GATES[probe.gate], stage: probe.stage, defect: probe.defect, expected: probe.green ? 'exit 0 (control)' : 'exit 1', exit, ok, said });
}

const after = hashTree();
const untouched = Object.keys(before).every((file) => before[file] === after[file]);
if (!untouched) failed += 1;

for (const row of rows) {
  console.log(`${row.ok ? 'ok  ' : 'MISS'}  ${row.id}  [${row.stage}]  ${row.expected} -> exit ${row.exit}`);
  console.log(`      defect: ${row.defect}`);
  console.log(`      gate:   ${row.said}`);
}
const planted = rows.filter((r) => !r.id.startsWith('baseline-') && r.expected !== 'skipped');
console.log('');
console.log(
  `probe: pulse stage = ${pulseInTree ? 'the tree itself (the Pulse ramp is declared)' : 'built on a copy (the tree has no Pulse ramp yet)'}`,
);
console.log(`probe: working tree ${untouched ? 'untouched — the five input files are byte-identical before and after' : 'CHANGED — a real file differs'}`);
console.log(
  failed
    ? `probe: ${failed} MISS(ES) of ${rows.length} checks`
    : `probe: OK — ${baselines.length} baseline(s) green, ${planted.filter((r) => r.expected === 'exit 1').length} planted defect(s) red, ` +
        `${planted.filter((r) => r.expected !== 'exit 1').length} control(s) green`,
);

if (recordAt) {
  const record = {
    package: 'F2',
    stage: 'a',
    pulseStage: pulseInTree ? 'tree' : 'built-on-a-copy',
    inputs: before,
    workingTreeUntouched: untouched,
    ok: failed === 0,
    checks: rows,
  };
  fs.writeFileSync(recordAt, `${JSON.stringify(record, null, 2)}\n`);
}

process.exit(failed ? 1 : 0);
