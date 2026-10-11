#!/usr/bin/env node
// docs/pipeline/pulse/pkg/_int/record-baseline.mjs — step F0, item 6 (PLAN.md 3.2).
//
// Two records of the tree BEFORE the redesign touches it, both written to pkg/_int/baseline/:
//
//   1. gates/<name>.txt + gates.json — the stdout, exit code and hash of every gate of the `build`
//      chain, run one at a time. Later steps prove "no rule changed" by diffing against these.
//
//   2. independent-counts.json / .md — how often each legacy construct occurs, counted with plain
//      `git grep` and NOT with the ratchet's own code. `check:pulse` (F2, stage c) must reproduce
//      these totals or explain the difference in writing: a counter is only trusted once a second,
//      differently built counter agrees with it.
//
// What "independent" means here, so the numbers are read correctly:
//   - `lines` is `git grep -c` (matching LINES); `occurrences` is `git grep -o` (every match).
//   - Comments are NOT stripped — the ratchet strips them, so a rule whose construct is named in a
//     comment legitimately differs by those lines.
//   - A row marked `reference: true` is not a ratchet rule: it is a second reading of one (another
//     scope, a sub-set, an upper bound) kept so a difference can be explained from the record.
//   - Constructs that span lines (a JSX opening tag) cannot be seen by a line grep. Those rules are
//     counted by a small tag scan instead and say so in their `method`.
//
// Usage:
//   node docs/pipeline/pulse/pkg/_int/record-baseline.mjs --tree <checkout to measure> [--only gates|counts]
//
// `--tree` is a checkout whose `frontend/node_modules` is installed (the base worktree for the
// baseline). The output directory is always the one beside this script.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'baseline');

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const TREE = flag('--tree');
const ONLY = flag('--only');
if (!TREE || !fs.existsSync(path.join(TREE, 'frontend/package.json'))) {
  console.error('usage: node record-baseline.mjs --tree <checkout with frontend/> [--only gates|counts]');
  process.exit(2);
}
const FRONTEND = path.join(TREE, 'frontend');
const git = (a, opts = {}) =>
  execFileSync('git', a, { cwd: TREE, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
const commit = git(['rev-parse', 'HEAD']).trim();
const dirty = git(['status', '--porcelain']).trim() !== '';
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const writeJson = (file, value) => fs.writeFileSync(path.join(OUT, file), `${JSON.stringify(value, null, 2)}\n`);

fs.mkdirSync(path.join(OUT, 'gates'), { recursive: true });

/* ── 1. the gates of the build chain ──────────────────────────────────────────────────────────── */

if (ONLY !== 'counts') {
  const pkg = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'package.json'), 'utf8'));
  // The chain is read from package.json, never typed: a gate added to `build` is recorded as well.
  const names = pkg.scripts.build
    .split('&&')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('npm run '))
    .map((s) => s.slice('npm run '.length));
  const gates = [];
  for (const name of names) {
    const command = pkg.scripts[name];
    const m = /^node (scripts\/[\w-]+\.mjs)$/.exec(command ?? '');
    if (!m) throw new Error(`build step "${name}" is not a plain "node scripts/x.mjs" gate: ${command}`);
    // Run with node directly: `npm run` prefixes its own banner, which is noise in a byte compare.
    const run = spawnSync(process.execPath, [m[1]], { cwd: FRONTEND, encoding: 'buffer' });
    const file = `gates/${name.replace(':', '-')}.txt`;
    fs.writeFileSync(path.join(OUT, file), run.stdout);
    if (run.stderr.length) fs.writeFileSync(path.join(OUT, file.replace('.txt', '.stderr.txt')), run.stderr);
    const lines = run.stdout.toString('utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    gates.push({
      name,
      command,
      exit: run.status,
      stdout: file,
      stdoutBytes: run.stdout.length,
      stdoutSha256: sha256(run.stdout),
      stderrBytes: run.stderr.length,
      firstLine: lines[0] ?? '',
      summary: lines.at(-1) ?? '',
    });
    console.log(`${run.status === 0 ? 'ok  ' : 'FAIL'} ${name.padEnd(18)} ${lines.at(-1) ?? ''}`);
  }
  writeJson('gates.json', { commit, dirty, chain: pkg.scripts.build, gates });
  if (gates.some((g) => g.exit !== 0)) {
    console.error('record-baseline: a gate is red on the baseline tree — that is a finding, not a baseline');
    process.exit(1);
  }
}

/* ── 2. the independent counts ────────────────────────────────────────────────────────────────── */

if (ONLY !== 'gates') {
  const CODE = ['frontend/src/*.ts', 'frontend/src/*.tsx'];
  const ALL = ['frontend/src'];
  const NO_TOKENS = ['frontend/src', ':(exclude)frontend/src/ui/tokens/tokens.css'];
  const OUTSIDE_UI = ['frontend/src/*.ts', 'frontend/src/*.tsx', ':(exclude)frontend/src/ui'];

  /** `git grep` exits 1 on "no match"; that is a count of zero, not an error. */
  const grep = (flags, pattern, pathspec) => {
    const r = spawnSync('git', ['grep', '-I', ...flags, '-P', '-e', pattern, '--', ...pathspec], {
      cwd: TREE,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (r.status !== 0 && r.status !== 1) throw new Error(`git grep failed for ${pattern}: ${r.stderr}`);
    return r.stdout.split('\n').filter(Boolean);
  };
  const rel = (file) => file.replace(/^frontend\/src\//, '');

  /** One rule counted by `git grep`: lines (-c), occurrences (-o), and occurrences per file. */
  const grepRule = (pattern, pathspec) => {
    const lines = grep(['-c'], pattern, pathspec).reduce((n, l) => n + Number(l.slice(l.lastIndexOf(':') + 1)), 0);
    const perFile = {};
    const perMatch = {};
    for (const hit of grep(['-o'], pattern, pathspec)) {
      const at = hit.indexOf(':');
      const file = rel(hit.slice(0, at));
      perFile[file] = (perFile[file] ?? 0) + 1;
      const text = hit.slice(at + 1);
      perMatch[text] = (perMatch[text] ?? 0) + 1;
    }
    const occurrences = Object.values(perFile).reduce((a, b) => a + b, 0);
    return { method: 'git grep -P', pattern, pathspec, lines, occurrences, files: Object.keys(perFile).length, perFile, perMatch };
  };

  /**
   * JSX opening tags, for the rules a line grep cannot see. The tag ends at the first `>` outside
   * braces and quotes — approximate on purpose, and enough for "does this tag carry attribute X".
   */
  const openingTags = (source, name) => {
    const tags = [];
    const re = new RegExp(`<${name}(?![\\w.])`, 'g');
    for (let m = re.exec(source); m; m = re.exec(source)) {
      let depth = 0;
      let quote = '';
      let i = m.index + m[0].length;
      for (; i < source.length; i += 1) {
        const c = source[i];
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'" || c === '`') quote = c;
        else if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        else if (c === '>' && depth === 0) break;
      }
      tags.push(source.slice(m.index, i + 1));
    }
    return tags;
  };
  const tagRule = (name, predicate, describe, pathspec = CODE) => {
    const perFile = {};
    let total = 0;
    for (const file of grep(['-l'], `<${name}(?![\\w.])`, pathspec)) {
      const tags = openingTags(fs.readFileSync(path.join(TREE, file), 'utf8'), name);
      total += tags.length;
      const n = tags.filter(predicate).length;
      if (n) perFile[rel(file)] = n;
    }
    const occurrences = Object.values(perFile).reduce((a, b) => a + b, 0);
    return { method: `tag scan (not a line grep): ${describe}`, tagsSeen: total, occurrences, files: Object.keys(perFile).length, perFile };
  };

  const B = '(?<![\\w-])'; // a class token starts here
  const E = '(?![\\w-])'; // …and ends here
  const VARIANT_LITERAL = /['"](secondary|ghost|danger)['"]/g;

  const rules = {};

  // Surfaces — the four components with no Pulse heir.
  rules.surface = grepRule('<Surface\\b', CODE);
  rules['summary-tile'] = grepRule('<SummaryTile\\b', CODE);
  rules.gauge = grepRule('<Gauge\\b', CODE);
  rules.aurora = grepRule('<AuroraBackdrop\\b', CODE);

  // The ten legacy type classes (R3). At this commit the three that F1.4 renames to `-legacy`
  // still carry their plain names, so they are counted under the names they have today.
  const TEN = 'title-1|title-2|title-3|body-strong|body-s|caption|timer|body|display|micro';
  rules['legacy-type'] = {
    ...grepRule(`${B}text-(${TEN})${E}`, CODE),
    note: 'class sites in .ts/.tsx. The plan quotes 615 (and 152 for the three renamed steps): those figures include 3 mentions in ui/tokens/tokens.css — see legacy-type-all-src.',
  };
  rules['legacy-type-renamed-three'] = { ...grepRule(`${B}text-(body|display|micro)${E}`, CODE), reference: true };
  rules['legacy-type-all-src'] = { ...grepRule(`${B}text-(${TEN})${E}`, ALL), reference: true };
  rules['legacy-type-renamed-three-all-src'] = { ...grepRule(`${B}text-(body|display|micro)${E}`, ALL), reference: true };

  rules['font-display-class'] = grepRule(`${B}font-display(?![\\w:-])`, CODE);
  rules['legacy-radius'] = grepRule(`${B}rounded(-(card|field|sm|md|lg|xl|2xl|3xl))?${E}`, CODE);
  rules.wash = grepRule(
    `${B}(bg-[a-z]+-subtle|text-on-[a-z]+(-[a-z]+)*|border-[a-z]+-border|(text|bg|border)-info[\\w-]*|bg-\\[var\\(--tile-tint\\)\\])`,
    CODE,
  );

  // Variant literals — in attributes AND in expressions (PLAN.md 3.6).
  rules['legacy-variant-attribute'] = { ...grepRule('variant="(secondary|ghost|danger)"', CODE), reference: true };
  {
    // An expression or a property: any line that names `variant` and then one of the literals,
    // e.g. variant={on ? 'secondary' : 'ghost'} or variant: 'ghost'. The attribute form above
    // is a subset of this.
    const pattern = "variant[^\\n]*['\"](secondary|ghost|danger)['\"]";
    const perFile = {};
    let lines = 0;
    for (const hit of grep([], pattern, CODE)) {
      const at = hit.indexOf(':');
      lines += 1;
      const file = rel(hit.slice(0, at));
      const text = hit.slice(at + 1);
      const tail = text.slice(text.indexOf('variant'));
      perFile[file] = (perFile[file] ?? 0) + [...tail.matchAll(VARIANT_LITERAL)].length;
    }
    rules['legacy-variant'] = {
      method: 'git grep -P for the lines, then the literals counted on each line',
      pattern,
      pathspec: CODE,
      lines,
      occurrences: Object.values(perFile).reduce((a, b) => a + b, 0),
      files: Object.keys(perFile).length,
      perFile,
      note: 'literals on a line that names `variant` (attribute, expression or property). A literal on a LATER line of a multi-line expression is not seen here; legacy-variant-any-quoted-literal is the upper bound.',
    };
  }
  rules['legacy-variant-any-quoted-literal'] = {
    ...grepRule("['\"](secondary|ghost|danger)['\"]", CODE),
    reference: true,
    note: 'every quoted literal anywhere, including type unions and the recipe definitions — an upper bound, not a rule.',
  };
  rules['legacy-chip-call'] = grepRule('\\bchip\\(', CODE);
  rules['pressable-no-variant'] = tagRule('Pressable', (t) => !/\bvariant\s*=/.test(t), '<Pressable …> opening tags with no variant attribute');
  rules['pill-size'] = {
    ...grepRule("variant[^\\n]{0,80}['\"]primary['\"]", CODE),
    note: 'control() has no size axis at this commit, so every primary is "a primary with no size". Lines that name `variant` and the literal.',
  };

  rules['shaped-skeleton'] = tagRule('Skeleton', (t) => /\brounded-/.test(t), '<Skeleton …> opening tags that carry a rounded-* class');
  rules['raw-form'] = { ...grepRule('<(input|textarea|select)\\b', OUTSIDE_UI), note: 'outside frontend/src/ui' };
  rules['raw-form-file-input'] = { ...grepRule('type="file"', OUTSIDE_UI), reference: true };
  rules['blur-shadow'] = grepRule(`${B}(backdrop-blur|blur-|shadow-(?!glow))`, CODE);
  rules['reserved-surface-1'] = grepRule(`${B}bg-surface-1${E}`, CODE);
  rules['reserved-surface-2-3'] = { ...grepRule(`${B}bg-surface-[23]${E}`, CODE), note: 'everywhere; the ratchet subtracts its allow-list (sheet, skeleton, disabled pill, switch track).' };
  rules['black-white'] = grepRule(`${B}(bg|text)-(black|white)${E}`, CODE);
  rules['heading-icon'] = {
    method: 'tag scan (not a line grep): <EmptyState …> / <SectionHeader …> opening tags that carry icon=',
    ...(() => {
      const a = tagRule('EmptyState', (t) => /\bicon\s*=/.test(t), '');
      const b = tagRule('SectionHeader', (t) => /\bicon\s*=/.test(t), '');
      const perFile = { ...a.perFile };
      for (const [f, n] of Object.entries(b.perFile)) perFile[f] = (perFile[f] ?? 0) + n;
      return {
        tagsSeen: { EmptyState: a.tagsSeen, SectionHeader: b.tagsSeen },
        occurrences: a.occurrences + b.occurrences,
        byTag: { EmptyState: a.occurrences, SectionHeader: b.occurrences },
        files: Object.keys(perFile).length,
        perFile,
      };
    })(),
  };

  // Bridged var() names — the legacy names plan-safe.md 2.3 keeps declared, by kind. Every name is
  // counted on its own, so whichever kinds the ratchet ends up calling "bridged" can be summed.
  const BRIDGE = {
    decoration: [
      'glass-1', 'glass-2', 'glass-3', 'glass-rim', 'glass-lip', 'glass-underside', 'glass-sheen',
      'card-bg', 'card-rim', 'card-border', 'card-blur', 'card-saturate', 'tile-tint',
      'aurora', 'noise-overlay', 'gradient-brand', 'shadow-overlay', 'shadow-overlay-strong', 'sheet-shadow',
      'blur-sm', 'blur-md', 'blur-lg', 'blur-xl', 'sheet-blur', 'nav-blur', 'toast-blur',
    ],
    opaque: ['nav-bg', 'toast-bg', 'sheet-bg'],
    state: [
      'accent-subtle', 'accent-border', 'on-accent-subtle',
      'success-subtle', 'warning-subtle', 'danger-subtle', 'info-subtle',
      'success-border', 'warning-border', 'danger-border', 'info-border',
      'on-success', 'on-warning', 'on-danger', 'on-info',
      'info', 'focus-ring', 'accent-hover', 'tile-tint-fg', 'overlay-border', 'scrim-strong',
      'accent-50', 'accent-100', 'accent-200', 'accent-300', 'accent-400', 'accent-500',
      'accent-600', 'accent-700', 'accent-800', 'accent-900', 'accent-950',
    ],
    layout: ['card-pad', 'radius-inset', 'nav-dock-offset', 'content-pad-b-lg'],
    componentRevalued: ['field-bg', 'field-border', 'skeleton-base', 'skeleton-sheen'],
    muscleMap: ['muscle-body', 'muscle-idle', 'muscle-edge', 'muscle-secondary'],
  };
  {
    const usage = {}; // every var(--name) outside tokens.css
    const usageFiles = {};
    for (const hit of grep(['-o'], 'var\\(--[a-z0-9-]+', NO_TOKENS)) {
      const at = hit.indexOf(':');
      const name = hit.slice(at + 1).replace('var(--', '');
      usage[name] = (usage[name] ?? 0) + 1;
      (usageFiles[name] ??= new Set()).add(rel(hit.slice(0, at)));
    }
    const byKind = {};
    const perName = {};
    for (const [kind, names] of Object.entries(BRIDGE)) {
      byKind[kind] = 0;
      for (const n of names) {
        perName[n] = { kind, occurrences: usage[n] ?? 0, files: usageFiles[n]?.size ?? 0 };
        byKind[kind] += usage[n] ?? 0;
      }
    }
    const strict = byKind.decoration + byKind.opaque + byKind.state + byKind.layout;
    rules['legacy-var'] = {
      method: 'git grep -o -P, then grouped by the bridge table of plan-safe.md 2.3',
      pattern: 'var\\(--[a-z0-9-]+',
      pathspec: NO_TOKENS,
      occurrences: strict,
      byKind,
      perName,
      note: 'occurrences = decoration + opaque + state + layout (the names the closing cleanup deletes). componentRevalued and muscleMap names stay declared with new values; they are listed so either reading can be summed. tokens.css itself is excluded, as in check-tokens.',
    };
    rules['var-usage-all-names'] = {
      method: 'git grep -o -P (reference table, not a rule)',
      reference: true,
      pattern: 'var\\(--[a-z0-9-]+',
      pathspec: NO_TOKENS,
      occurrences: Object.values(usage).reduce((a, b) => a + b, 0),
      perName: Object.fromEntries(Object.entries(usage).sort((a, b) => b[1] - a[1])),
    };
  }

  writeJson('independent-counts.json', {
    commit,
    dirty,
    takenWith: 'plain git grep (-c for lines, -o for occurrences, -P patterns); comments are not stripped; two rules are tag scans and say so',
    scope: 'tracked files of the tree, frontend/src',
    rules,
  });

  const row = ([id, r]) => `| \`${id}\`${r.reference ? ' (reference)' : ''} | ${r.occurrences} | ${r.lines ?? '—'} | ${r.files ?? '—'} | ${r.method.startsWith('git grep') ? `\`${r.pattern}\`` : r.method}${r.note ? ` — ${r.note}` : ''} |`;
  const md = [
    '# Independent counts of the legacy constructs — baseline',
    '',
    `Tree: \`${commit}\`${dirty ? ' (DIRTY)' : ''}. Generated by \`record-baseline.mjs\`; do not edit.`,
    '',
    'Counted with plain `git grep`, not with the ratchet (`check:pulse`). At F2 stage c each ratchet rule',
    'total must equal the number here or the difference is explained in writing. `occurrences` is every',
    'match (`git grep -o`), `lines` is matching lines (`git grep -c`). Comments are not stripped. Per-file',
    'numbers are in `independent-counts.json`.',
    '',
    '| Rule | Occurrences | Lines | Files | How |',
    '|---|---|---|---|---|',
    ...Object.entries(rules).filter(([id]) => id !== 'var-usage-all-names').map(row),
    '',
    '## Bridged `var()` names, by kind',
    '',
    '| Kind | Occurrences | Names in use |',
    '|---|---|---|',
    ...Object.entries(rules['legacy-var'].byKind).map(
      ([kind, n]) =>
        `| ${kind} | ${n} | ${Object.entries(rules['legacy-var'].perName)
          .filter(([, v]) => v.kind === kind && v.occurrences)
          .map(([name, v]) => `\`--${name}\` ${v.occurrences}`)
          .join(', ') || '—'} |`,
    ),
    '',
    '## The ten legacy type classes, per class (.ts / .tsx)',
    '',
    '| Class | Occurrences |',
    '|---|---|',
    ...Object.entries(rules['legacy-type'].perMatch).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| \`${k}\` | ${v} |`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'independent-counts.md'), md);
  for (const [id, r] of Object.entries(rules)) console.log(`${id.padEnd(36)} ${String(r.occurrences).padStart(5)}`);
}
