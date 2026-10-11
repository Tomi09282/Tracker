#!/usr/bin/env node
// docs/pipeline/pulse/pkg/_int/pulse-f0.mjs — the generator of step F0 (PLAN.md 3.2, item 5).
//
// It turns the two sources of truth into the files people and agents actually open:
//
//   work-packages.json + PLAN.md 4.2 / 4.3   ->  docs/pipeline/pulse/briefs/<id>.md   (one per package)
//   work-packages.json + the real tree        ->  <main checkout>/.pulse/progress.live.json
//   the live file, minus the heartbeat        ->  docs/pipeline/pulse/progress.json    (the snapshot)
//
// Nothing here is typed by hand: a brief is regenerated, never edited, and the `files` list of a
// progress entry is the package's `owns` expanded against `git ls-files` of the tree the script
// runs in. Where a brief and work-packages.json differ, the JSON wins (PLAN.md, header).
//
// The live file is CREATED on its first run and REFRESHED on every later one: the generated
// fields (kind, title, wave, dependsOn, files, the frame and stage rosters) are rewritten, and
// everything a running effort writes (status, owner, slot, verdicts, requests, commits, notes)
// is kept. So re-running it after work-packages.json changes is safe.
//
// Usage (cwd anywhere inside a worktree of the repository):
//   node docs/pipeline/pulse/pkg/_int/pulse-f0.mjs briefs            write the briefs
//   node docs/pipeline/pulse/pkg/_int/pulse-f0.mjs briefs --check    fail if a brief on disk is stale
//   node docs/pipeline/pulse/pkg/_int/pulse-f0.mjs progress          create / refresh the live file
//   node docs/pipeline/pulse/pkg/_int/pulse-f0.mjs snapshot          write the committed snapshot
//   node docs/pipeline/pulse/pkg/_int/pulse-f0.mjs mark F1:0 merged --commit <sha> --step "…"
//                                                                    set one status in the live file
//   node docs/pipeline/pulse/pkg/_int/pulse-f0.mjs owns              print the ownership expansion and overlaps
//
// `progress`, `snapshot` and `mark` are the integrator's stand-ins until `scripts/pulse-progress.mjs`
// (F4) exists; that tool takes over the live file and keeps this shape (PLAN.md 8.1).
//
// No dependency, no network, no secret: it reads tracked files and writes the paths named above.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const git = (args, cwd = HERE) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

const ROOT = git(['rev-parse', '--show-toplevel']);
// `.pulse/` lives in the MAIN checkout only (PLAN.md 2.1); every worktree shares its git dir.
const MAIN = path.dirname(path.resolve(ROOT, git(['rev-parse', '--git-common-dir'], ROOT)));
const PULSE_DOCS = path.join(ROOT, 'docs/pipeline/pulse');
const WP_PATH = path.join(PULSE_DOCS, 'work-packages.json');
const PLAN_PATH = path.join(PULSE_DOCS, 'PLAN.md');
const BRIEFS_DIR = path.join(PULSE_DOCS, 'briefs');
const LIVE_PATH = path.join(MAIN, '.pulse/progress.live.json');
const SNAPSHOT_PATH = path.join(PULSE_DOCS, 'progress.json');
const BASELINE_DIR = path.join(HERE, 'baseline');

const FRAMES_DIR = 'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x';
const FIGMA_BUILD = 'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/figma-build';
const SHEETS_DIR = 'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/osszesitok';

const readText = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const wp = JSON.parse(readText(WP_PATH));
const plan = readText(PLAN_PATH);
const wpHash = crypto.createHash('sha256').update(JSON.stringify(wp)).digest('hex').slice(0, 12);

const packages = [
  ...wp.foundation.map((p) => ({ ...p, kind: 'foundation' })),
  ...wp.screens.map((p) => ({ ...p, kind: 'screen' })),
];

/* ── ownership: `owns` expanded against the real tree ─────────────────────────────────────────── */

const tracked = git(['ls-files'], ROOT).split('\n').filter(Boolean);

/** `**` crosses directories, `*` stays inside one path segment. No other glob syntax is used. */
const globToRegExp = (glob) =>
  new RegExp(
    `^${glob
      .split('**')
      .map((part) =>
        part
          .split('*')
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^/]*'),
      )
      .join('.*')}$`,
  );

const expand = (patterns = []) => {
  const existing = new Set();
  const toCreate = [];
  for (const pattern of patterns) {
    const re = globToRegExp(pattern);
    const hits = tracked.filter((f) => re.test(f));
    if (hits.length === 0) toCreate.push(pattern);
    for (const h of hits) existing.add(h);
  }
  return { existing: [...existing].sort(), toCreate };
};

const ownership = new Map(packages.map((p) => [p.id, expand(p.owns)]));

/* ── PLAN.md tables: the screen names (4.2) and the musts (4.3) ───────────────────────────────── */

const sectionBetween = (startHeading, endHeading) => {
  const start = plan.indexOf(startHeading);
  const end = plan.indexOf(endHeading, start + 1);
  if (start === -1 || end === -1) {
    throw new Error(`PLAN.md: cannot find the section "${startHeading}" … "${endHeading}"`);
  }
  return plan.slice(start, end);
};
const tableRows = (section) =>
  section
    .split('\n')
    .filter((l) => l.startsWith('| ') && !/^\|\s*-+/.test(l))
    // A literal pipe inside a cell is written `\|` in this file.
    .map((l) =>
      l
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((c) => c.trim().replace(/\\\|/g, '|')),
    );

const screenTitle = new Map(); // id -> "Kezdőlap (`/`)"
for (const row of tableRows(sectionBetween('### 4.2 The packages', '### 4.3 Musts'))) {
  if (/^S-/.test(row[0])) screenTitle.set(row[0], row[1]);
}

const musts = new Map(); // id -> the row text of 4.3, verbatim
for (const row of tableRows(sectionBetween('### 4.3 Musts', '### 4.4 How shared files'))) {
  const [who, text] = row;
  if (!/^S-/.test(who)) continue;
  // One row covers three packages: "S-compose-hub, -post, -profile".
  const names = who.split(',').map((s) => s.trim());
  const stem = names[0].replace(/-[^-]+$/, '');
  for (const n of names) musts.set(n.startsWith('S-') ? n : `${stem}${n}`, text);
}

const problems = [];
for (const p of wp.screens) {
  if (!screenTitle.has(p.id)) problems.push(`${p.id} has no row in PLAN.md 4.2`);
  if (!musts.has(p.id)) problems.push(`${p.id} has no row in PLAN.md 4.3 — its brief would lose its musts`);
}
for (const id of musts.keys()) {
  if (!wp.screens.some((p) => p.id === id)) problems.push(`PLAN.md 4.3 names ${id}, which is not a package`);
}
if (problems.length) {
  console.error(`pulse-f0: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

/** The PLAN.md section that holds the detail of a foundation package. */
const PLAN_SECTION = {
  F0: '3.2 (step 0.0 — prep)',
  F1: '3.3 (the value switch, table F1.0-F1.6); token values: plan-safe.md 2.3',
  F2: '3.3 (lane G) and 3.6 (gates, re-pointed)',
  F3: '3.3 (lane V), 2.5 (the freeze) and 6.0 (the capture tool specification)',
  F4: '3.3 (lane T), 2.1 (pulse-sync), 4.4 (hand-in files) and 8 (resumability)',
  F5: '3.3 (lane E; R7) and understand/assets.md',
  F6: '3.4 (A1 actions — the keystone; R4)',
  F7: '3.4 (KIT host)',
  F8: '3.4 (SEL selection)',
  F9: '3.4 (ST structure)',
  F10: '3.4 (DA data)',
  F11: '3.4 (SH1 shell; R12, R13)',
  F12: '3.4 (IN inputs + sheet)',
  F13: '3.4 (SH2 status zone; R14)',
  F14: '3.4 (CH charts)',
  F15: '3.4 (M1 mannequin; R17, Q1) and 5.2 row 11',
  F16: '3.4 ("INT\'s own commits in step 0.2"; R15, R16)',
  F17: '3.5 and 5.2 (the [S1] rows)',
  F18: '3.5 and 5.2 (all rows except 11)',
  F19: '7.3 (the closing cleanup)',
  F20: '7.3 (F20) and 3.4 (the seven playground-only variant files)',
};

const isIntegratorPackage = (p) => p.kind === 'foundation' && /\bINT\b/.test(p.parallelGroup ?? '');
const branchOf = (p) => (isIntegratorPackage(p) ? 'pulse-int' : `pulse/${p.id}`);
const titleOf = (p) => (p.kind === 'screen' ? screenTitle.get(p.id) : p.title);
const questionsFor = (id) => wp.ownerDecisions.filter((q) => (q.blocks ?? []).includes(id));

/* ── briefs ───────────────────────────────────────────────────────────────────────────────────── */

const bullets = (items, map = (x) => x) => items.map((x) => `- ${map(x)}`).join('\n');
const code = (s) => `\`${s}\``;

const filesBlock = (p) => {
  const { existing, toCreate } = ownership.get(p.id);
  const out = [];
  if (existing.length) {
    out.push(`Files that exist today (${existing.length}):\n`);
    // A long generated list is a count and its patterns, not a wall of paths.
    if (existing.length > 40) {
      out.push(bullets(p.owns.filter((o) => !toCreate.includes(o)), code));
      out.push(`\n(${existing.length} files; the full list is this package's \`files.existing\` in the progress file.)`);
    } else {
      out.push(bullets(existing, code));
    }
  }
  if (toCreate.length) {
    out.push(`\nNot in the tree yet — created by this package (${toCreate.length}):\n`);
    out.push(bullets(toCreate, code));
  }
  return out.join('\n');
};

const questionBlock = (p) => {
  const qs = questionsFor(p.id);
  if (!qs.length) return '';
  return [
    '## Owner questions that touch this package',
    '',
    'An answer in `C:/Users/Petike/Documents/Cursor/tracker/.pulse/owner-answers.md` wins; a question with no',
    'answer there means the default below applies. An answer never silently rewinds finished work.',
    '',
    bullets(qs, (q) => `**${q.id}** — default: ${q.default}`),
    '',
  ].join('\n');
};

const header = (p) =>
  [
    `# Brief — ${p.id} · ${titleOf(p)}`,
    '',
    '> GENERATED by `docs/pipeline/pulse/pkg/_int/pulse-f0.mjs briefs` from `work-packages.json`',
    `> (revision ${wp.revision}) and \`PLAN.md\`. Never edit this file: change the source and regenerate.`,
    '> Where this brief and `work-packages.json` differ, the JSON wins. Owner decisions D1-D4',
    '> (`understand/00-owner-decisions.md`) are final.',
    '',
  ].join('\n');

const screenBrief = (p) => {
  const fixture = new Set(p.fixtureFrames ?? []);
  const pending = new Set(p.pendingF15Frames ?? []);
  const frameLine = (f) => {
    const flags = [fixture.has(f) && 'fixture frame -> verdict `matched-fixture`', pending.has(f) && '`pending-F15` until the mannequin lands']
      .filter(Boolean)
      .join('; ');
    return `${code(f)} — \`${FRAMES_DIR}/${f}@2x.png\`${flags ? ` — ${flags}` : ''}`;
  };
  const parts = [
    header(p),
    '## At a glance',
    '',
    `| | |`,
    `|---|---|`,
    `| Route | ${code(p.route)} |`,
    `| Wave / size | ${p.wave} / ${p.size} |`,
    `| Starts after | ${p.dependsOn.map(code).join(', ')} |`,
    `| Account | ${p.account} |`,
    `| Branch / slot | ${code(branchOf(p))} in \`C:/Users/Petike/Documents/Cursor/tracker-wt/slot-<n>\` (assigned by the integrator) |`,
    `| Inventory note | ${code(p.inventory)} |`,
    `| May ADD i18n keys in | ${(p.i18nNamespaces ?? []).map(code).join(', ') || '—'} (changing or removing a key is decided by its consumers, PLAN.md 4.4 rule b) |`,
    p.partOf ? `| Part of | ${p.partOf} |` : null,
    '',
    '## You own — and write nothing else',
    '',
    filesBlock(p),
    '',
    p.deletes?.length ? `Deleted by this package:\n\n${bullets(p.deletes, code)}\n` : null,
    '## Must not touch',
    '',
    bullets(p.mustNotTouch ?? [], code),
    '',
    'A need outside the owned files is a hand-in file (`i18n.patch.json`, `variants.json`) or a request',
    '(PLAN.md 4.4) — never a local copy of a shared component, a local `text-[…]` size, a',
    '`token-lint-disable` or a raised budget.',
    '',
    '## Frames',
    '',
    bullets(p.frames, frameLine),
    '',
    `Composition: \`${FIGMA_BUILD}/app/<frame>.body.js\`. Measured boxes: \`frontend/scripts/pulse-geometry/<frame>.json\``,
    `(until the integrator commits them: \`C:/Users/Petike/Documents/Cursor/tracker/.pulse/geometry/\`). Sheet: \`${SHEETS_DIR}/\`.`,
    p.maskedAreas ? `\nMasked in every comparison: ${[].concat(p.maskedAreas).join('; ')}` : null,
    '',
    '## Musts that are easy to lose (PLAN.md 4.3 — each is a line of the definition of done)',
    '',
    musts.get(p.id),
    '',
    '## Notes (work-packages.json)',
    '',
    p.notes,
    '',
    p.runs?.length ? `## Planned runs\n\n${bullets(p.runs)}\n` : null,
    p.anchoredBy?.length ? `## Keep this literal (a gate probe anchors on it — PLAN.md 3.6)\n\n${bullets(p.anchoredBy)}\n` : null,
    p.variantElements?.length
      ? `## Variant deltas to hand in (\`variants.json\`)\n\n${p.variantElements.map(code).join(', ')} — \`{ element, live: false, reason }\`, only for a \`useElementVariant\` read in a file this package owns.\n`
      : null,
    `## Live writes this package may make (everything else is a fixture — PLAN.md 4.7, R25)\n\n${
      p.liveWrites?.length ? bullets(p.liveWrites) : 'None. Every mutation outcome is a fixture.'
    }\n`,
    p.liveCheck ? `## Live check\n\n${[].concat(p.liveCheck).join('\n')}\n` : null,
    questionBlock(p) || null,
    '## The first act (PLAN.md 4.1 rule 7) — before a line of JSX changes',
    '',
    `List the undrawn states in \`docs/pipeline/pulse/pkg/${p.id}/states.json\` (account, steps, an \`arrived\``,
    'assertion, the object used, a fixture or a `writes` list), record any GET the freeze lacks',
    '(`--record --only-missing`), capture the baseline + inventory of every state on the still-hybrid screen,',
    'and check the contact sheet: a capture that did not arrive where its name says is fixed first.',
    '',
    '## Rules every package inherits',
    '',
    '- The unit of work: rewrite the render of each owned page against the kit; keep everything above the',
    '  `return`. Routes, hooks, query keys, mutations, zod schemas and existing i18n keys do not change (4.1).',
    '- No visible copy is invented (R22). No finish-workout control (D3). No new door except Home\'s library row',
    '  (D2). No URL state (R20). Nothing of `understand/screens.md` §4 becomes a working path.',
    '- Work in the slot only through `node scripts/pulse-sync.mjs <id>` and `node scripts/pulse-verify.mjs`',
    '  (they hold the lock); commit work in progress on the package branch with `git add` of owned paths only;',
    '  rewrite `C:/Users/Petike/Documents/Cursor/tracker/.pulse/status/<id>.json` after every state (8.2).',
    '- Blocked? Move to the next state or frame and say so in the status file.',
    '',
    '## Inputs',
    '',
    '- `docs/brain/58-Pulse/Pulse System.md` (tokens, type ramp, components, rules), `Product gaps.md`',
    `- \`${FIGMA_BUILD}/app-kit.js\` (the component kit source)`,
    '- `docs/pipeline/pulse/kit/*.md` (the kit reference, one page per lane)',
    '- this screen\'s block in `docs/pipeline/pulse/understand/screens.md`; `understand/dev-verify.md` §3.5',
    '  (differences not to chase) and §7 (account + URL + steps per frame)',
    '',
    '## Done means',
    '',
    'All twelve rows of PLAN.md 5.1, with the evidence each row names, handed off as',
    `\`docs/pipeline/pulse/pkg/${p.id}/handoff.json\` (PLAN.md 4.5): one verdict per frame and state —`,
    '`matched`, `matched-fixture`, `structure` or `pending-F15`.',
    '',
  ];
  return parts.filter((x) => x !== null).join('\n');
};

const foundationBrief = (p) => {
  const parts = [
    header(p),
    '## At a glance',
    '',
    `| | |`,
    `|---|---|`,
    `| Group | ${p.parallelGroup} |`,
    `| Size | ${p.size} |`,
    `| Starts after | ${p.dependsOn.length ? p.dependsOn.map(code).join(', ') : '—'} |`,
    `| Branch | ${code(branchOf(p))}${isIntegratorPackage(p) ? ' (integrator work, in `C:/Users/Petike/Documents/Cursor/tracker-wt/int`)' : ' in a slot worktree'} |`,
    `| Detail | PLAN.md ${PLAN_SECTION[p.id] ?? '—'} |`,
    p.i18nNamespaces?.length ? `| May ADD i18n keys in | ${p.i18nNamespaces.map(code).join(', ')} |` : null,
    '',
    '## Owns',
    '',
    filesBlock(p),
    '',
    p.deletes?.length ? `## Deletes\n\n${bullets(p.deletes, code)}\n` : null,
    p.stages ? `## Stages\n\n${bullets(Object.entries(p.stages), ([k, v]) => `**${p.id}:${k}** — ${v}`)}\n` : null,
    p.mergeConstraints?.length ? `## Merge constraints\n\n${bullets(p.mergeConstraints)}\n` : null,
    p.preClaim?.length
      ? `## Pre-claim edits (files changed here before their later owner starts)\n\n${bullets(
          p.preClaim,
          (c) => `${c.step}: ${code(c.file ?? c.glob)} -> later owner ${code(c.laterOwner)} — ${c.what}`,
        )}\n`
      : null,
    '## Acceptance',
    '',
    bullets(p.acceptance),
    '',
    '## Verify',
    '',
    bullets(p.verify, code),
    '',
    '## Notes (work-packages.json)',
    '',
    p.notes,
    '',
    p.variantElements?.length
      ? `## Variant elements\n\n${p.variantElements.map(code).join(', ')}${p.variantNote ? ` — ${p.variantNote}` : ''}\n`
      : null,
    questionBlock(p) || null,
    isIntegratorPackage(p)
      ? null
      : [
          '## Rules every lane inherits (PLAN.md 3.4, R5, R6, R29)',
          '',
          '- API first: the first commit publishes compiling stubs of every export with final prop types and the',
          '  lane\'s page of the kit reference; prop changes after that are additive only.',
          '- Shared recipes are restyled in place with their public API intact; a new component is a new file.',
          `- An edit in a file this lane does not own travels as a hand-in file in \`docs/pipeline/pulse/pkg/${p.id}/\``,
          '  (`i18n.patch.json`, `variants.json`, `shared.patch`), committed on the branch, applied by the tool in the',
          '  slot and by the integrator at the merge. Never a local literal, never typed twice.',
          '- Every kit component carries `data-kit="<kit function name>"`; specimens show rest, pressed, disabled,',
          '  busy and keyboard focus.',
          '',
        ].join('\n'),
  ];
  return parts.filter((x) => x !== null).join('\n');
};

const renderBrief = (p) => `${(p.kind === 'screen' ? screenBrief(p) : foundationBrief(p)).trimEnd()}\n`;

/* ── the progress file ────────────────────────────────────────────────────────────────────────── */

const readJsonIfExists = (p) => (fs.existsSync(p) ? JSON.parse(readText(p)) : null);
const writeAtomically = (p, text) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p);
};

const buildProgress = (previous) => {
  const now = new Date().toISOString();
  const gates = readJsonIfExists(path.join(BASELINE_DIR, 'gates.json'));
  const counts = readJsonIfExists(path.join(BASELINE_DIR, 'independent-counts.json'));
  const head = git(['rev-parse', '--short', 'HEAD'], ROOT);
  // The list is taken from the index, so inside an integration commit it already holds that commit's files.
  const listedOn = git(['diff', '--cached', '--name-only'], ROOT) ? `${head} + staged changes` : head;

  const entries = {};
  for (const p of packages) {
    const before = previous?.packages?.[p.id] ?? {};
    const own = ownership.get(p.id);
    const roster = (names, old = {}) => Object.fromEntries(names.map((n) => [n, old[n] ?? 'todo']));
    entries[p.id] = {
      // generated — rewritten on every run
      kind: p.kind,
      title: titleOf(p),
      wave: p.wave ?? null,
      dependsOn: p.dependsOn,
      branch: branchOf(p),
      files: { generatedFrom: `work-packages.json@${wpHash}`, listedOn, existing: own.existing, toCreate: own.toCreate },
      ...(p.kind === 'screen' ? { frames: roster(p.frames, before.frames) } : {}),
      ...(p.stages
        ? { stages: Object.fromEntries(Object.keys(p.stages).map((k) => [`${p.id}:${k}`, before.stages?.[`${p.id}:${k}`] ?? { status: 'todo', commit: null }])) }
        : {}),
      // live — kept from the previous file
      status: before.status ?? 'todo',
      owner: before.owner ?? null,
      slot: before.slot ?? null,
      worktree: before.worktree ?? null,
      port: before.port ?? null,
      extraStates: before.extraStates ?? {},
      budget: before.budget ?? { before: null, now: null },
      requests: before.requests ?? {},
      liveWrites: before.liveWrites ?? [],
      copyPending: before.copyPending ?? 0,
      commit: before.commit ?? null,
      review: before.review ?? null,
      lastStep: before.lastStep ?? '',
      notes: before.notes ?? '',
      updated: before.updated ?? now,
    };
  }

  return {
    schema: 2,
    branch: 'pulse-redesign',
    updated: now,
    integrator: previous?.integrator ?? { owner: null, heartbeat: now, step: 'F0' },
    freeze: {
      seededOn: null,
      recordedAt: null,
      dbCopy: null,
      backup: null,
      sandbox: null,
      ...(previous?.freeze ?? {}),
      baselineCommit: '0860942',
      // The 11 gate lines and the independent counts of F0 item 6 (pkg/_int/baseline/).
      gates: gates ? Object.fromEntries(gates.gates.map((g) => [g.name, g.summary])) : (previous?.freeze?.gates ?? {}),
      independentCounts: counts
        ? Object.fromEntries(Object.entries(counts.rules).map(([id, r]) => [id, r.occurrences]))
        : (previous?.freeze?.independentCounts ?? {}),
    },
    ownerQuestions: Object.fromEntries(
      wp.ownerDecisions.map((q) => [
        q.id,
        previous?.ownerQuestions?.[q.id] ?? {
          default: String.fromCharCode(97 + Math.max(0, q.options.findIndex((o) => o.recommended))),
          answer: null,
        },
      ]),
    ),
    burnDown:
      previous?.burnDown ??
      // The burn-down follows the rules only; reference rows are second readings, not targets.
      (counts
        ? Object.fromEntries(Object.entries(counts.rules).filter(([, r]) => !r.reference).map(([id, r]) => [id, r.occurrences]))
        : {}),
    packages: entries,
  };
};

/* ── commands ─────────────────────────────────────────────────────────────────────────────────── */

const [command, ...flags] = process.argv.slice(2);

if (command === 'briefs') {
  const check = flags.includes('--check');
  const stale = [];
  fs.mkdirSync(BRIEFS_DIR, { recursive: true });
  for (const p of packages) {
    const file = path.join(BRIEFS_DIR, `${p.id}.md`);
    const next = renderBrief(p);
    const current = fs.existsSync(file) ? readText(file) : null;
    if (current === next) continue;
    if (check) stale.push(p.id);
    else fs.writeFileSync(file, next);
  }
  const expected = new Set(packages.map((p) => `${p.id}.md`));
  const orphans = fs.readdirSync(BRIEFS_DIR).filter((f) => !expected.has(f));
  if (check && (stale.length || orphans.length)) {
    console.error(`pulse-f0 briefs --check: stale ${stale.join(' ') || 'none'}; orphan files ${orphans.join(' ') || 'none'}`);
    process.exit(1);
  }
  for (const f of orphans) console.warn(`pulse-f0: ${f} belongs to no package of work-packages.json`);
  console.log(`pulse-f0 briefs: ${packages.length} brief(s) ${check ? 'are current' : 'written'} — ${wp.foundation.length} foundation, ${wp.screens.length} screen`);
} else if (command === 'progress') {
  const previous = readJsonIfExists(LIVE_PATH);
  const next = buildProgress(previous);
  writeAtomically(LIVE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`pulse-f0 progress: ${previous ? 'refreshed' : 'created'} ${LIVE_PATH} — ${Object.keys(next.packages).length} package entries`);
} else if (command === 'snapshot') {
  const live = readJsonIfExists(LIVE_PATH);
  if (!live) {
    console.error(`pulse-f0 snapshot: ${LIVE_PATH} does not exist — run "progress" first`);
    process.exit(1);
  }
  // The snapshot is the live file without what only means something while a run is alive.
  const { heartbeat: _heartbeat, ...integrator } = live.integrator ?? {};
  writeAtomically(SNAPSHOT_PATH, `${JSON.stringify({ ...live, integrator }, null, 2)}\n`);
  console.log(`pulse-f0 snapshot: wrote ${path.relative(ROOT, SNAPSHOT_PATH).split(path.sep).join('/')}`);
} else if (command === 'mark') {
  // The integrator's pen until `pulse-progress` (F4) exists: one package or stage, one status.
  //   mark <id | id:stage> <status> [--commit <sha>] [--step "<what just happened>"] [--note "<text>"]
  const [target, status] = flags;
  const opt = (name) => (flags.includes(name) ? flags[flags.indexOf(name) + 1] : undefined);
  const live = readJsonIfExists(LIVE_PATH);
  const [id, stage] = (target ?? '').split(':');
  const entry = live?.packages?.[id];
  const STATUSES = ['todo', 'claimed', 'in_progress', 'handoff', 'integrating', 'merged', 'in_review', 'changes_requested', 'accepted', 'blocked'];
  if (!entry || !STATUSES.includes(status) || (stage !== undefined && !entry.stages?.[target])) {
    console.error(`pulse-f0 mark: unknown package, stage or status — "${target}" "${status}" (statuses: ${STATUSES.join(', ')})`);
    process.exit(2);
  }
  const now = new Date().toISOString();
  const commit = opt('--commit');
  if (stage !== undefined) entry.stages[target] = { status, commit: commit ?? entry.stages[target].commit };
  else {
    entry.status = status;
    if (commit) entry.commit = commit;
  }
  if (opt('--step') !== undefined) entry.lastStep = opt('--step');
  if (opt('--note') !== undefined) entry.notes = opt('--note');
  entry.updated = now;
  live.updated = now;
  live.integrator = { ...live.integrator, heartbeat: now, step: opt('--int-step') ?? live.integrator?.step ?? null, owner: opt('--owner') ?? live.integrator?.owner ?? null };
  writeAtomically(LIVE_PATH, `${JSON.stringify(live, null, 2)}\n`);
  console.log(`pulse-f0 mark: ${target} -> ${status}${commit ? ` @ ${commit}` : ''}`);
} else if (command === 'owns') {
  const owners = new Map();
  for (const p of packages) {
    for (const f of ownership.get(p.id).existing) owners.set(f, [...(owners.get(f) ?? []), p.id]);
  }
  for (const p of packages) {
    const o = ownership.get(p.id);
    console.log(`${p.id.padEnd(18)} ${String(o.existing.length).padStart(4)} existing, ${String(o.toCreate.length).padStart(2)} to create`);
  }
  const shared = [...owners].filter(([, ids]) => ids.length > 1);
  console.log(`\n${shared.length} existing file(s) are named by more than one package:`);
  const byPair = new Map();
  for (const [f, ids] of shared) byPair.set(ids.join(' + '), [...(byPair.get(ids.join(' + ')) ?? []), f]);
  for (const [pair, files] of byPair) console.log(`  ${pair}: ${files.length} — ${files.slice(0, 4).join(', ')}${files.length > 4 ? ' …' : ''}`);
} else {
  console.error('usage: node docs/pipeline/pulse/pkg/_int/pulse-f0.mjs <briefs [--check] | progress | snapshot | mark <id[:stage]> <status> | owns>');
  process.exit(2);
}
