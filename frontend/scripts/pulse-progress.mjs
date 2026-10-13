#!/usr/bin/env node
// scripts/pulse-progress.mjs — the progress record of the Pulse effort (PLAN.md section 8).
//
// Runs on this machine die: sleep, a closed app, the usage limit. What is not on disk does not
// exist, so the state of the effort is two files and a folder:
//
//   <main checkout>/.pulse/progress.live.json   the LIVE file — untracked, written by the integrator
//                                               only, on every loop tick, atomically
//   docs/pipeline/pulse/progress.json           the SNAPSHOT — tracked, generated here, only inside
//                                               an integration commit, never edited by hand
//   <main checkout>/.pulse/status/<id>.json     one heartbeat per package, written by its agent
//
// One writer per file is the whole design: agents never open the live file, so there is no lock
// to get wrong, and because the live file is in no git tree a `git reset --hard` in the
// integration worktree can only ever discard a half-applied squash.
//
// Commands:
//   sync [--heartbeat] [--owner <who>] [--step <id>]   fold the status files into the live file and
//                                                      regenerate every `files` list. Idempotent:
//                                                      the same inputs write the same bytes (nothing
//                                                      is written when nothing changed). --heartbeat
//                                                      is the integrator's loop tick.
//   sync --from-snapshot [--force]                     rebuild a LOST live file from the committed
//                                                      snapshot plus the status files (8.3 step 1)
//   claim <id> --owner <who> --slot <n> [--force]      assign a package to an agent and a slot
//   mark <id[:stage]> <status> [--commit <sha>] [--step <text>] [--note <text>]
//        [--frame <name>=<verdict>]… [--review <path>] [--copy-pending <n>]
//                                                      the integrator's pen: one entry, one status
//   snapshot                                           write the tracked snapshot (the live file
//                                                      without the heartbeat)
//   report [--json]                                    what a person reads: counts, per-package
//                                                      lines, and the three lists every milestone
//                                                      report names (fixture frames, pending-F15
//                                                      frames, URL-only screens)
//
// The `files` list of an entry is GENERATED from work-packages.json through the shared expander —
// never typed (PLAN.md 2.3). The entry shape is the one F0 wrote (PLAN.md 8.1).
//
// Writers run in the integration worktree (branch pulse-int). From anywhere else they refuse,
// unless --force-writer says the caller really is the integrator. `report` runs anywhere.
//
// Exit: 0 done, 1 refused / nothing to read, 2 usage. Not in the build chain.
import fs from 'node:fs';
import path from 'node:path';
import {
  fileList,
  git,
  gitTry,
  isIntegratorPackage,
  isMain,
  loadModel,
  lsFiles,
  readJsonIfExists,
  resolveId,
  tree,
  writeFileAtomic,
} from './pulse-owns-check.mjs';

export const STATUSES = ['todo', 'claimed', 'in_progress', 'handoff', 'integrating', 'merged', 'in_review', 'changes_requested', 'accepted', 'blocked'];
export const VERDICTS = ['todo', 'in_progress', 'structure', 'pending-F15', 'matched-fixture', 'matched'];
/** States only the integrator (or a reviewer through it) sets. A heartbeat never moves an entry out of one. */
const INTEGRATOR_STATES = new Set(['integrating', 'merged', 'in_review', 'accepted']);
const DONE_STATES = new Set(['merged', 'in_review', 'accepted']);
/** What agents actually write, folded onto the vocabulary of PLAN.md 8.1. */
const STATUS_ALIASES = { 'in-progress': 'in_progress', inprogress: 'in_progress', partial: 'in_progress', done: 'handoff', 'hand-off': 'handoff' };

const paths = () => {
  const t = tree();
  return { live: `${t.pulse}/progress.live.json`, statusDir: `${t.pulse}/status`, snapshot: `${t.docs}/progress.json` };
};
const serialize = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

/* ── generated fields ─────────────────────────────────────────────────────────────────────────── */

/**
 * Rewrite everything that is derived from work-packages.json and the tree (kind, wave, dependsOn,
 * branch, files, the frame and stage rosters) and keep everything a running effort wrote.
 */
export function refreshGenerated(previous, model, files, now) {
  const head = git(['rev-parse', '--short', 'HEAD'], { cwd: tree().root });
  const listedOn = git(['diff', '--cached', '--name-only'], { cwd: tree().root }) ? `${head} + staged changes` : head;
  const roster = (names, old = {}) => Object.fromEntries(names.map((n) => [n, old[n] ?? 'todo']));
  const entries = {};
  for (const p of model.packages) {
    const before = previous?.packages?.[p.id] ?? {};
    entries[p.id] = {
      // first, so that a field an agent or the integrator added (head, done, next, blockedOn) survives
      ...before,
      // generated — rewritten on every run
      kind: p.kind,
      // The screen titles came from PLAN.md 4.2 when F0 wrote the file; they are kept, not re-parsed.
      title: before.title ?? p.title ?? (p.screens ?? []).join(', ') ?? p.id,
      wave: p.wave ?? null,
      dependsOn: p.dependsOn ?? [],
      branch: before.branch ?? (isIntegratorPackage(p) ? 'pulse-int' : `pulse/${p.id}`),
      files: { generatedFrom: `work-packages.json@${model.hash}`, listedOn, ...fileList(p, files) },
      ...(p.kind === 'screen' ? { frames: roster(p.frames ?? [], before.frames) } : {}),
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
    updated: previous?.updated ?? now,
    integrator: previous?.integrator ?? { owner: null, heartbeat: now, step: null },
    freeze: previous?.freeze ?? { seededOn: null, recordedAt: null, dbCopy: null, backup: null, sandbox: null, baselineCommit: '0860942', gates: {}, independentCounts: {} },
    ownerQuestions:
      previous?.ownerQuestions ??
      Object.fromEntries(
        (model.wp.ownerDecisions ?? []).map((q) => [q.id, { default: String.fromCharCode(97 + Math.max(0, (q.options ?? []).findIndex((o) => o.recommended))), answer: null }]),
      ),
    burnDown: previous?.burnDown ?? {},
    // always present, so the key order — and with it the bytes — never depends on the run
    statusFilesNotFolded: {},
    packages: entries,
  };
}

/* ── folding the status files ─────────────────────────────────────────────────────────────────── */

/**
 * Fold every `.pulse/status/*.json` into `live`. Pure assignment from the status file, so folding
 * twice gives the same document. A status file whose id is not exactly one package, lane stage or
 * fix round (the integrator's own `F1.1+F1.2.json`, a helper's `F0-geometry.json`) is not guessed
 * at: it is listed under `statusFilesNotFolded`, visible in the report.
 */
export function foldStatusFiles(live, model, statusDir) {
  const notFolded = {};
  const names = fs.existsSync(statusDir) ? fs.readdirSync(statusDir).filter((f) => f.endsWith('.json')).sort() : [];
  for (const name of names) {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(statusDir, name), 'utf8'));
    } catch (err) {
      notFolded[name.replace(/\.json$/, '')] = { reason: `not valid JSON — ${err.message}` };
      continue;
    }
    const rawId = typeof doc.id === 'string' ? doc.id : name.replace(/\.json$/, '');
    const summary = { status: doc.status ?? null, step: doc.lastStep ?? doc.step ?? null, updated: doc.updated ?? null };
    const unit = resolveId(rawId, model);
    if (!unit) {
      notFolded[rawId] = { ...summary, reason: 'the id is not one package, lane stage or fix round' };
      continue;
    }
    const entry = live.packages[unit.id];
    const status = STATUS_ALIASES[doc.status] ?? doc.status;
    if (!STATUSES.includes(status)) {
      notFolded[rawId] = { ...summary, reason: `status "${doc.status}" is not one of ${STATUSES.join(', ')}` };
      continue;
    }
    // An agent cannot claim what only the integrator grants.
    const agentStatus = INTEGRATOR_STATES.has(status) ? 'handoff' : status;
    const lastStep = doc.lastStep ?? doc.step;

    if (unit.stage !== null) {
      const key = `${unit.id}:${unit.stage}`;
      const stage = entry.stages?.[key];
      if (!stage) {
        notFolded[rawId] = { ...summary, reason: `${unit.id} has no stage ${unit.stage} in the live file` };
        continue;
      }
      if (!INTEGRATOR_STATES.has(stage.status)) {
        stage.status = agentStatus;
        if (lastStep !== undefined) stage.lastStep = String(lastStep);
        if (doc.head !== undefined) stage.head = doc.head;
        if (doc.branch !== undefined) stage.branch = doc.branch;
        if (doc.blockedOn !== undefined) stage.blockedOn = doc.blockedOn;
        if (doc.updated !== undefined) stage.updated = doc.updated;
        // The package is under way as soon as one of its stages is.
        if (['todo', 'claimed'].includes(entry.status) && agentStatus !== 'todo') entry.status = 'in_progress';
      }
      continue;
    }

    if (INTEGRATOR_STATES.has(entry.status)) continue; // the integrator has the pen now
    entry.status = agentStatus;
    if (lastStep !== undefined) entry.lastStep = String(lastStep);
    for (const [frame, verdict] of Object.entries(doc.frames ?? {})) {
      if (entry.frames && frame in entry.frames && VERDICTS.includes(verdict)) entry.frames[frame] = verdict;
      else entry.extraStates = { ...entry.extraStates, [frame]: verdict };
    }
    if (doc.extraStates && typeof doc.extraStates === 'object') entry.extraStates = { ...entry.extraStates, ...doc.extraStates };
    if (typeof doc.budgetNow === 'number') entry.budget = { ...entry.budget, now: doc.budgetNow };
    if (doc.blockedOn !== undefined) entry.blockedOn = doc.blockedOn;
    else if (agentStatus !== 'blocked') delete entry.blockedOn;
    if (doc.head !== undefined) entry.head = doc.head;
    if (Array.isArray(doc.done)) entry.done = doc.done;
    if (Array.isArray(doc.next)) entry.next = doc.next;
    if (doc.updated !== undefined) entry.updated = doc.updated;
  }
  live.statusFilesNotFolded = notFolded;
  return live;
}

/* ── commands ─────────────────────────────────────────────────────────────────────────────────── */

const fail = (code, message) => {
  console.error(`pulse-progress: ${message}`);
  process.exit(code);
};

function assertWriter(argv) {
  if (argv.includes('--force-writer')) return;
  const branch = gitTry(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: tree().root }).stdout.trim();
  if (branch !== 'pulse-int') {
    fail(1, `the live progress file has ONE writer, the integrator (PLAN.md 8). This tree is on "${branch || 'a detached HEAD'}", not pulse-int.\n  An agent writes ${paths().statusDir}/<id>.json instead; "report" reads from anywhere.`);
  }
}

/** Load the live file, regenerate its derived fields and fold the status files — what every writer starts from. */
function loadLive(model, { from } = {}) {
  const { live, statusDir } = paths();
  const now = new Date().toISOString();
  const previous = from ?? readJsonIfExists(live);
  const next = refreshGenerated(previous ? structuredClone(previous) : null, model, lsFiles(), now);
  foldStatusFiles(next, model, statusDir);
  return { previous, next, now };
}

/** Write `next` only when it differs from what is on disk; `updated` moves only then. */
function commitLive(previous, next, now, { touch = false } = {}) {
  const { live } = paths();
  const strip = (doc) => JSON.stringify({ ...doc, updated: null });
  if (!touch && previous && strip(previous) === strip(next)) return false;
  next.updated = now;
  writeFileAtomic(live, serialize(next));
  return true;
}

const flagValues = (argv, name) => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const flag = (argv, name) => flagValues(argv, name)[0];

function cmdSync(argv, model) {
  const { live, snapshot } = paths();
  let from;
  if (argv.includes('--from-snapshot')) {
    if (fs.existsSync(live) && !argv.includes('--force')) fail(1, `${live} exists — nothing is lost. --from-snapshot rebuilds a MISSING live file (add --force to replace it).`);
    from = readJsonIfExists(snapshot);
    if (!from) fail(1, `${snapshot} does not exist — there is no snapshot to rebuild from`);
  }
  const { previous, next, now } = loadLive(model, { from });
  const beat = argv.includes('--heartbeat') || from !== undefined;
  if (beat) {
    next.integrator = {
      ...next.integrator,
      owner: flag(argv, '--owner') ?? next.integrator?.owner ?? null,
      heartbeat: now,
      step: flag(argv, '--step') ?? next.integrator?.step ?? null,
    };
  }
  const wrote = commitLive(from ? null : previous, next, now, { touch: beat });
  const folded = Object.values(next.packages).filter((e) => e.status !== 'todo').length;
  const skipped = Object.keys(next.statusFilesNotFolded ?? {});
  console.log(
    `pulse-progress sync: ${wrote ? (from ? 'rebuilt from the snapshot' : 'written') : 'no change'} — ${Object.keys(next.packages).length} entries, ${folded} under way or done` +
      (skipped.length ? `; not folded: ${skipped.join(', ')}` : ''),
  );
}

function dependencyMet(dep, live) {
  if (dep.endsWith('*')) {
    return Object.entries(live.packages).filter(([id]) => id.startsWith(dep.slice(0, -1))).every(([, e]) => DONE_STATES.has(e.status));
  }
  const [id, stage] = dep.split(':');
  const entry = live.packages[id];
  if (!entry) return false;
  if (DONE_STATES.has(entry.status)) return true;
  return stage !== undefined && DONE_STATES.has(entry.stages?.[`${id}:${stage}`]?.status);
}

function cmdClaim(argv, model) {
  const unit = resolveId(argv[0], model);
  const owner = flag(argv, '--owner');
  const slot = Number(flag(argv, '--slot'));
  if (!unit || !owner || !Number.isInteger(slot) || slot < 1 || slot > 9) fail(2, 'usage: claim <id> --owner <who> --slot <1..9> [--force]');
  const { previous, next, now } = loadLive(model);
  const entry = next.packages[unit.id];
  const force = argv.includes('--force');

  if (INTEGRATOR_STATES.has(entry.status)) fail(1, `${unit.id} is ${entry.status} — nothing to claim`);
  const unmet = (unit.pkg.dependsOn ?? []).filter((d) => !dependencyMet(d, next));
  if (unmet.length && !force) fail(1, `${unit.id} cannot start: ${unmet.join(', ')} ${unmet.length === 1 ? 'is' : 'are'} not merged (PLAN.md 4.2). --force overrides, and says so in the notes.`);
  // A slot whose package is not merged is never re-used — its uncommitted files are that package's work.
  const holder = Object.entries(next.packages).find(([id, e]) => id !== unit.id && e.slot === slot && !['todo', ...DONE_STATES].includes(e.status));
  if (holder) fail(1, `slot ${slot} holds ${holder[0]} (${holder[1].status}) — a slot is re-used only after its package is merged (--force does not override this)`);

  const t = tree();
  Object.assign(entry, {
    status: ['todo', 'changes_requested', 'blocked'].includes(entry.status) ? 'claimed' : entry.status,
    owner,
    slot,
    worktree: `${t.main}-wt/slot-${slot}`,
    port: 5180 + slot,
    branch: unit.branch,
    updated: now,
  });
  if (unit.stage !== null) {
    const key = `${unit.id}:${unit.stage}`;
    if (['todo', 'blocked'].includes(entry.stages[key].status)) entry.stages[key].status = 'claimed';
  }
  if (unmet.length) entry.notes = `${entry.notes ? `${entry.notes} ` : ''}[claimed with --force while ${unmet.join(', ')} not merged]`;
  commitLive(previous, next, now, { touch: true });
  console.log(`pulse-progress claim: ${unit.raw} -> ${owner}, slot ${slot} (${entry.worktree}, port ${entry.port}, branch ${entry.branch})`);
}

function cmdMark(argv, model) {
  const [target, status] = argv;
  const unit = resolveId(target ?? '', model);
  if (!unit || !STATUSES.includes(status)) fail(2, `usage: mark <id[:stage]> <${STATUSES.join(' | ')}> [--commit <sha>] [--step <text>] [--note <text>] [--frame <name>=<verdict>] [--review <path>] [--copy-pending <n>]`);
  const { previous, next, now } = loadLive(model);
  const entry = next.packages[unit.id];
  const commit = flag(argv, '--commit');
  if (unit.stage !== null) {
    const key = `${unit.id}:${unit.stage}`;
    entry.stages[key] = { ...entry.stages[key], status, commit: commit ?? entry.stages[key].commit ?? null, updated: now };
    if (['todo', 'claimed'].includes(entry.status)) entry.status = 'in_progress';
  } else {
    entry.status = status;
    if (commit) entry.commit = commit;
  }
  for (const pair of flagValues(argv, '--frame')) {
    const [name, verdict] = pair.split('=');
    if (!VERDICTS.includes(verdict)) fail(2, `--frame ${pair}: the verdict is one of ${VERDICTS.join(', ')}`);
    if (entry.frames && name in entry.frames) entry.frames[name] = verdict;
    else entry.extraStates = { ...entry.extraStates, [name]: verdict };
  }
  if (flag(argv, '--step') !== undefined) entry.lastStep = flag(argv, '--step');
  if (flag(argv, '--note') !== undefined) entry.notes = flag(argv, '--note');
  if (flag(argv, '--review') !== undefined) entry.review = flag(argv, '--review');
  if (flag(argv, '--copy-pending') !== undefined) entry.copyPending = Number(flag(argv, '--copy-pending'));
  if (status !== 'blocked') delete entry.blockedOn;
  entry.updated = now;
  commitLive(previous, next, now, { touch: true });
  console.log(`pulse-progress mark: ${unit.raw} -> ${status}${commit ? ` @ ${commit}` : ''}`);
}

function cmdSnapshot() {
  const { live, snapshot } = paths();
  const doc = readJsonIfExists(live);
  if (!doc) fail(1, `${live} does not exist — run "sync" (or "sync --from-snapshot") first`);
  // The snapshot is the live file without what only means something while a run is alive.
  const { heartbeat: _heartbeat, ...integrator } = doc.integrator ?? {};
  writeFileAtomic(snapshot, serialize({ ...doc, integrator }));
  console.log(`pulse-progress snapshot: wrote docs/pipeline/pulse/progress.json (${Object.keys(doc.packages).length} entries) — commit it inside the integration commit`);
}

/** The report's data: also what `--json` prints. */
export function buildReport(doc, model, source) {
  const entries = Object.entries(doc.packages);
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, entries.filter(([, e]) => e.status === s).map(([id]) => id)]));
  const frames = entries.flatMap(([id, e]) => Object.entries(e.frames ?? {}).map(([frame, verdict]) => ({ id, frame, verdict })));
  const planned = (key) => model.packages.flatMap((p) => (p[key] ?? []).map((frame) => ({ id: p.id, frame })));
  const verdictOf = (frame) => frames.find((f) => f.frame === frame)?.verdict ?? 'todo';
  const q5 = doc.ownerQuestions?.Q5;
  const urlOnly = (q5?.answer ?? q5?.default ?? 'a') === 'a'
    ? model.packages.filter((p) => p.kind === 'screen' && /(^|[\s(,;])\/(compose|m)(\/|\b)/.test(String(p.route ?? ''))).map((p) => ({ id: p.id, route: p.route }))
    : [];
  const ageHours = (iso) => (Date.now() - Date.parse(iso)) / 3600000;
  return {
    source,
    updated: doc.updated,
    integrator: doc.integrator ?? null,
    byStatus,
    frames: Object.fromEntries(VERDICTS.map((v) => [v, frames.filter((f) => f.verdict === v).length])),
    fixtureFrames: planned('fixtureFrames').map((f) => ({ ...f, verdict: verdictOf(f.frame) })).concat(
      frames.filter((f) => f.verdict === 'matched-fixture' && !planned('fixtureFrames').some((p) => p.frame === f.frame)).map((f) => ({ ...f, unplanned: true })),
    ),
    pendingF15: planned('pendingF15Frames').map((f) => ({ ...f, verdict: verdictOf(f.frame) })),
    urlOnly,
    blocked: entries.filter(([, e]) => e.status === 'blocked').map(([id, e]) => ({ id, blockedOn: e.blockedOn ?? e.lastStep })),
    stale: entries.filter(([, e]) => ['claimed', 'in_progress'].includes(e.status) && ageHours(e.updated) > 2).map(([id, e]) => ({ id, hours: Math.round(ageHours(e.updated)) })),
    copyPending: entries.filter(([, e]) => e.copyPending > 0).map(([id, e]) => ({ id, strings: e.copyPending })),
    statusFilesNotFolded: doc.statusFilesNotFolded ?? {},
  };
}

function cmdReport(argv, model) {
  const { live, snapshot } = paths();
  const source = fs.existsSync(live) ? live : snapshot;
  const doc = readJsonIfExists(source);
  if (!doc) fail(1, `neither ${live} nor ${snapshot} exists`);
  const r = buildReport(doc, model, source);
  if (argv.includes('--json')) return console.log(JSON.stringify(r, null, 2));

  const lines = [];
  const beat = r.integrator?.heartbeat ? `, heartbeat ${Math.round((Date.now() - Date.parse(r.integrator.heartbeat)) / 60000)} min ago` : '';
  lines.push(`Pulse progress — ${r.updated} (${source === live ? 'live file' : 'SNAPSHOT — the live file is missing'})`);
  lines.push(`integrator: ${r.integrator?.owner ?? 'nobody'}, step ${r.integrator?.step ?? '—'}${beat}`, '');
  for (const s of STATUSES) if (r.byStatus[s].length) lines.push(`${s.padEnd(18)} ${String(r.byStatus[s].length).padStart(2)}  ${r.byStatus[s].join(' ')}`);
  lines.push('', `frames: ${VERDICTS.map((v) => `${r.frames[v]} ${v}`).join(', ')}`, '');
  for (const kind of ['foundation', 'screen']) {
    lines.push(kind === 'foundation' ? 'Foundation' : 'Screens');
    for (const [id, e] of Object.entries(doc.packages).filter(([, x]) => x.kind === kind)) {
      if (e.status === 'todo') continue;
      const stages = e.stages ? ` [${Object.entries(e.stages).map(([k, s]) => `${k.split(':')[1]}:${s.status}`).join(' ')}]` : '';
      const fr = e.frames ? ` {${Object.entries(e.frames).map(([f, v]) => `${f}:${v}`).join(' ')}}` : '';
      const where = e.slot ? ` slot ${e.slot}` : '';
      lines.push(`  ${id.padEnd(19)} ${e.status.padEnd(17)}${where}${stages}${fr}${e.commit ? ` @${e.commit}` : ''}  ${String(e.lastStep ?? '').slice(0, 90)}`);
    }
    lines.push('');
  }
  const list = (title, items, fmt) => lines.push(`${title} (${items.length})${items.length ? `: ${items.map(fmt).join(', ')}` : ''}`);
  list('Frames verified on a fixture', r.fixtureFrames, (f) => `${f.frame} [${f.verdict}]`);
  list('Frames waiting for the mannequin (pending-F15)', r.pendingF15, (f) => `${f.frame} [${f.verdict}]`);
  list('Screens reachable by URL only (Q5)', r.urlOnly, (p) => `${p.id} (${p.route})`);
  list('Blocked', r.blocked, (b) => `${b.id} — ${b.blockedOn}`);
  list('Under way with no heartbeat for over 2 h', r.stale, (s) => `${s.id} (${s.hours} h)`);
  list('Waiting for the owner to tick copy', r.copyPending, (c) => `${c.id} (${c.strings})`);
  list('Status files not folded', Object.entries(r.statusFilesNotFolded), ([id, v]) => `${id} (${v.status ?? '?'}: ${v.reason})`);
  console.log(lines.join('\n'));
}

if (isMain(import.meta.url)) {
  const [command, ...argv] = process.argv.slice(2);
  const model = loadModel();
  if (command === 'report') cmdReport(argv, model);
  else if (['sync', 'claim', 'mark', 'snapshot'].includes(command)) {
    assertWriter(argv);
    if (command === 'sync') cmdSync(argv, model);
    else if (command === 'claim') cmdClaim(argv, model);
    else if (command === 'mark') cmdMark(argv, model);
    else cmdSnapshot();
  } else {
    fail(2, 'usage: node scripts/pulse-progress.mjs <sync [--heartbeat] [--from-snapshot] | claim <id> --owner <who> --slot <n> | mark <id[:stage]> <status> | snapshot | report [--json]>');
  }
}
