#!/usr/bin/env node
// scripts/pulse-sync.mjs — the ONLY way a slot is synced, resumed and re-used (PLAN.md 2.1).
//
// A slot keeps the hand-in files of its package APPLIED to the working tree — the bundles, the
// catalogue, a line in package.json — because the fast gates need that state while the agent
// edits. Those are paths the integrator writes, and git refuses to merge into a tree that holds
// local changes of them. So a plain `git merge pulse-redesign` in a slot fails exactly when it
// matters. This tool does the six steps in the one order that works:
//
//   1  clear dead locks and a stray preview on the slot's own port;
//   2  undo every local apply: `git restore --source=HEAD` on a FIXED path list — the three
//      bundles, ui/feedback/catalog.ts, scripts/data/*.json and the files named by the package's
//      own shared.patch (remembered in <slot>/.pulse/applied.json). The one written exception
//      to "never restore a path you do not own", and only this tool does it;
//   3  assert that `git status` now shows owned paths only — otherwise stop and print the others;
//   4  `git merge pulse-redesign` (first use or re-use of the slot: switch to pulse/<id>);
//   5  `npm ci` if package-lock.json changed, under a heavy lock;
//   6  re-apply the package's COMMITTED hand-in files (i18n.patch.json, variants.json,
//      shared.patch) and stop loudly, with status `blocked`, if one no longer applies.
//
// After step 2 the merge cannot meet a local change in a path the integrator writes. A conflict in
// an OWNED path means the integrator wrote a claimed file: the merge is aborted and reported,
// never resolved here.
//
// Usage (cwd anywhere in the slot):
//   node scripts/pulse-sync.mjs <id> [--no-install] [--keep-preview] [--base <branch>]
//
// Exit: 0 synced, 1 stopped (the reason is printed and written to .pulse/status/<id>.json),
// 2 usage, 3 a hand-in could not be checked in this tree yet (a gate export is missing).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import {
  BASE_BRANCH,
  CO_AUTHOR,
  git,
  gitTry,
  globToRegExp,
  isFrozen,
  isMain,
  loadModel,
  lsFiles,
  matchesAny,
  ownersOf,
  readApplied,
  readHandIn,
  readJsonIfExists,
  refExists,
  resolveId,
  sha256,
  tree,
  withHeavyLock,
  writeApplied,
  writeFileAtomic,
} from './pulse-owns-check.mjs';
import { applyPatch } from './pulse-i18n.mjs';
import { portForSlot } from './lib/pulse-ports.mjs';
import { applyDeltas } from './pulse-variants.mjs';

/** Paths a tool patches in a slot and the integrator owns — the fixed half of the restore list. */
const FIXED = ['frontend/src/i18n/hu.json', 'frontend/src/i18n/en.json', 'frontend/src/i18n/de.json', 'frontend/src/ui/feedback/catalog.ts'];
const FIXED_GLOB = 'frontend/scripts/data/*.json';

/* ── shared.patch ─────────────────────────────────────────────────────────────────────────────── */

/**
 * What a `shared.patch` touches, and whether it may (PLAN.md 4.4 item 4): it only MODIFIES
 * existing files, never one of the unit's own, never a frozen file, never the backend.
 * Returns `{ files, problems }`. Also used by pulse-merge-check.
 */
export function inspectSharedPatch(text, unit, model, existing = lsFiles()) {
  const problems = [];
  const files = [];
  const blocks = text.split(/^diff --git /m).slice(1);
  if (blocks.length === 0 && text.trim() !== '') problems.push('shared.patch is not a git-format patch (make it with `git diff`)');
  for (const block of blocks) {
    const header = /^a\/(.+?) b\/(.+)$/m.exec(block.split('\n')[0]);
    if (!header) {
      problems.push(`shared.patch: an unreadable header — ${block.split('\n')[0]}`);
      continue;
    }
    const file = header[2];
    files.push(file);
    if (/^new file mode /m.test(block)) problems.push(`shared.patch creates ${file} — it may only modify existing files (a new file is an owned file or a request)`);
    if (/^deleted file mode /m.test(block)) problems.push(`shared.patch deletes ${file} — it may only modify existing files`);
    if (/^rename (from|to) /m.test(block) || header[1] !== header[2]) problems.push(`shared.patch renames ${header[1]} — it may only modify existing files`);
    if (/^GIT binary patch|^Binary files /m.test(block)) problems.push(`shared.patch carries a binary change of ${file}`);
    if (file.startsWith('backend/')) problems.push(`shared.patch touches ${file} — backend/ is nobody's in this effort`);
    if (isFrozen(file, model)) problems.push(`shared.patch touches ${file}, which is frozen for everybody`);
    if (matchesAny(file, unit.pkg.owns)) problems.push(`shared.patch touches ${file}, which ${unit.id} owns — edit it on the branch instead`);
    if (!existing.includes(file) && !/^new file mode /m.test(block)) problems.push(`shared.patch touches ${file}, which does not exist in this tree`);
  }
  return { files: [...new Set(files)], problems };
}

const gitApply = (args, text) => spawnSync('git', ['apply', '--whitespace=nowarn', ...args, '-'], { cwd: tree().root, input: text, encoding: 'utf8', windowsHide: true });

/* ── the steps ────────────────────────────────────────────────────────────────────────────────── */

const say = (line) => console.log(line);

function clearDeadLocks(unit) {
  const dir = `${tree().pulse}/locks`;
  let holdsOwn = false;
  if (!fs.existsSync(dir)) return holdsOwn;
  for (const name of fs.readdirSync(dir)) {
    const p = `${dir}/${name}`;
    const stat = fs.statSync(p, { throwIfNoEntry: false });
    if (!stat) continue;
    const ageMin = (Date.now() - stat.mtimeMs) / 60000;
    if (stat.isDirectory()) {
      // The heavy lock of this effort: a directory, stale after 25 minutes.
      const owner = fs.existsSync(`${p}/owner`) ? fs.readFileSync(`${p}/owner`, 'utf8').split('\n')[0].trim() : '';
      if (ageMin > 25) {
        fs.rmSync(p, { recursive: true, force: true });
        say(`  1  removed the dead lock ${name} (${Math.round(ageMin)} min old${owner ? `, was ${owner}` : ''})`);
      } else if (owner === unit.raw || owner === unit.id) holdsOwn = true;
    } else if (name.endsWith('.json')) {
      // The capture tool's lock (PLAN.md 2.1): { pid, package, port, heartbeat }.
      const lock = readJsonIfExists(p) ?? {};
      let alive = false;
      try {
        if (lock.pid) alive = process.kill(lock.pid, 0) || true;
      } catch (err) {
        alive = err.code === 'EPERM';
      }
      const beatMin = lock.heartbeat ? (Date.now() - Date.parse(lock.heartbeat)) / 60000 : ageMin;
      if (!alive || beatMin > 3) {
        fs.rmSync(p, { force: true });
        say(`  1  removed the dead lock ${name} (${alive ? `heartbeat ${Math.round(beatMin)} min old` : 'its process is gone'})`);
      } else if (lock.package === unit.raw || lock.package === unit.id) holdsOwn = true;
    }
  }
  return holdsOwn;
}

/** A preview somebody left listening on this slot's own port (lib/pulse-ports.mjs: 5180 + n up to slot-8, 5200 + n from slot-9).
 * Only ever a node process, only this port. */
function clearStrayPreview(holdsOwn) {
  const n = /\/slot-(\d{1,2})$/.exec(tree().root)?.[1];
  if (!n) return say('  1  not a slot-<n> worktree — no preview port to clear');
  const port = portForSlot(n);
  if (!port) return say(`  1  slot-${n} has no preview port — nothing to clear`);
  let pids = [];
  if (process.platform === 'win32') {
    const out = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true }).stdout ?? '';
    pids = out.split('\n').filter((l) => /LISTENING/.test(l) && new RegExp(`[:.]${port}\\s`).test(l)).map((l) => l.trim().split(/\s+/).at(-1));
  } else {
    pids = (spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout ?? '').split('\n');
  }
  pids = [...new Set(pids.filter((p) => /^\d+$/.test(p) && p !== '0'))];
  if (pids.length === 0) return say(`  1  no listener on port ${port}`);
  if (holdsOwn) return say(`  1  port ${port} is in use and a live lock names this package — a run is under way, the preview is left alone`);
  for (const pid of pids) {
    if (process.platform === 'win32') {
      const image = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).stdout ?? '';
      if (!/^"node(\.exe)?"/i.test(image.trim())) {
        say(`  1  port ${port} is held by pid ${pid}, which is not a node process — left alone`);
        continue;
      }
      spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { windowsHide: true });
    } else {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
    say(`  1  stopped the stray preview on port ${port} (pid ${pid})`);
  }
  return undefined;
}

function writeStatus(unit, patch) {
  const file = `${tree().pulse}/status/${unit.raw}.json`;
  const before = readJsonIfExists(file) ?? { id: unit.raw };
  const next = { ...before, ...patch, updated: new Date().toISOString() };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  writeFileAtomic(file, `${JSON.stringify(next, null, 2)}\n`);
}

class Stop extends Error {
  constructor(message, { code = 1, blockedOn } = {}) {
    super(message);
    this.code = code;
    this.blockedOn = blockedOn ?? message.split('\n')[0];
  }
}

async function sync(unit, model, opts) {
  const { root } = tree();
  const base = opts.base;
  if (!refExists(`refs/heads/${base}`)) throw new Stop(`the base branch ${base} does not exist`);
  const owned = (f) => matchesAny(f, unit.pkg.owns);

  // 1 ─ locks and previews
  const holdsOwn = clearDeadLocks(unit);
  if (!opts.keepPreview) clearStrayPreview(holdsOwn);

  // 2 ─ undo every local apply
  const applied = readApplied();
  const sharedNow = readHandIn(unit, 'shared.patch', 'HEAD');
  const tracked = lsFiles();
  const candidates = [
    ...FIXED,
    ...tracked.filter((f) => globToRegExp(FIXED_GLOB).test(f)),
    ...(applied.shared?.files ?? []),
    ...(sharedNow ? inspectSharedPatch(sharedNow.text, unit, model, tracked).files : []),
  ];
  const restore = [...new Set(candidates)].filter((f) => tracked.includes(f) && !owned(f));
  const dirty = restore.length ? git(['status', '--porcelain', '--', ...restore], { cwd: root, raw: true }).split('\n').filter(Boolean) : [];
  if (dirty.length) {
    git(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...restore], { cwd: root });
    say(`  2  undid the local applies: ${dirty.map((l) => l.slice(3)).join(', ')}`);
  } else say('  2  no local apply to undo');
  writeApplied({});
  fs.rmSync(`${tree().local}/applied`, { recursive: true, force: true });

  // 3 ─ the tree holds owned work only
  const status = git(['status', '--porcelain', '-uall'], { cwd: root, raw: true }).split('\n').filter(Boolean);
  const foreign = status.map((l) => ({ code: l.slice(0, 2), file: l.slice(3).replace(/^"|"$/g, '').split(' -> ').at(-1) })).filter((s) => !owned(s.file));
  if (foreign.length) {
    const lines = foreign.map((s) => `       ${s.code} ${s.file}   (${isFrozen(s.file, model) ? 'frozen' : ownersOf(s.file, model).join(', ') || 'the integrator'})`);
    throw new Stop(`  3  the slot holds changes in paths ${unit.id} does not own — nothing was merged:\n${lines.join('\n')}\n     A need in such a file is a hand-in file (shared.patch, i18n.patch.json, variants.json) or a request.`, {
      blockedOn: `pulse-sync: foreign changes in the slot — ${foreign.map((s) => s.file).join(', ')}`,
    });
  }
  say(`  3  git status shows owned paths only (${status.length} uncommitted)`);

  // 4 ─ the branch, then the merge
  const current = gitTry(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: root }).stdout.trim();
  if (current !== unit.branch) {
    if (status.length) throw new Stop(`  4  this slot is on ${current || 'a detached HEAD'} with uncommitted work — it is not ${unit.branch}, and a slot is never re-used with work in it`);
    const previous = current.startsWith('pulse/') ? resolveId(current.slice('pulse/'.length), model) : null;
    if (previous) {
      const live = readJsonIfExists(`${tree().pulse}/progress.live.json`);
      const recorded = ['merged', 'in_review', 'accepted'].includes(live?.packages?.[previous.id]?.status);
      const same = gitTry(['diff', '--quiet', base, current, '--', ...previous.pkg.owns.map((o) => `:(glob)${o}`)], { cwd: root }).ok;
      if (!recorded && !same) throw new Stop(`  4  this slot holds ${current}, which is not merged: its owned files differ from ${base} and the progress file does not say merged. A slot is re-used only after its package is merged.`);
    }
    if (refExists(`refs/heads/${unit.branch}`)) git(['switch', '-q', unit.branch], { cwd: root });
    else git(['switch', '-q', '-c', unit.branch, base], { cwd: root });
    say(`  4  switched the slot from ${current || 'a detached HEAD'} to ${unit.branch}`);
  }
  const before = git(['rev-parse', 'HEAD'], { cwd: root });
  const behind = Number(git(['rev-list', '--count', `HEAD..${base}`], { cwd: root }));
  if (behind === 0) say(`  4  ${unit.branch} already contains ${base} (${git(['rev-parse', '--short', base], { cwd: root })})`);
  else {
    const message = `pulse(${unit.raw}): wip - merge ${base} (${git(['rev-parse', '--short', base], { cwd: root })}) into the slot\n\n${CO_AUTHOR}`;
    const merge = gitTry(['merge', '--no-edit', '-m', message, base], { cwd: root });
    if (!merge.ok) {
      const conflicts = git(['diff', '--name-only', '--diff-filter=U'], { cwd: root }).split('\n').filter(Boolean);
      gitTry(['merge', '--abort'], { cwd: root });
      const lines = conflicts.map((f) => `       ${f}   (${owned(f) ? `owned by ${unit.id} — the integrator wrote a claimed file` : ownersOf(f, model).join(', ') || 'the integrator'})`);
      throw new Stop(`  4  merging ${base} conflicts — the merge was aborted, nothing is resolved here:\n${lines.join('\n') || `       ${merge.stderr.trim() || merge.stdout.trim()}`}`, {
        blockedOn: `pulse-sync: merge conflict with ${base} in ${conflicts.join(', ') || 'the tree'}`,
      });
    }
    say(`  4  merged ${base}: ${behind} commit(s), HEAD ${git(['rev-parse', '--short', 'HEAD'], { cwd: root })}`);
  }

  // 5 ─ npm ci when the lockfile moved
  const lockMoved = !gitTry(['diff', '--quiet', before, 'HEAD', '--', 'frontend/package-lock.json'], { cwd: root }).ok;
  const noModules = !fs.existsSync(`${root}/frontend/node_modules`);
  if (!lockMoved && !noModules) say('  5  package-lock.json did not change');
  else if (opts.noInstall) say(`  5  npm ci is NEEDED (${lockMoved ? 'package-lock.json changed' : 'node_modules is missing'}) and was skipped (--no-install)`);
  else {
    say(`  5  npm ci (${lockMoved ? 'package-lock.json changed' : 'node_modules is missing'}) — taking a heavy lock`);
    const r = await withHeavyLock(unit.raw, () => spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: `${root}/frontend`, stdio: 'inherit', shell: true }));
    if (r.status !== 0) throw new Stop('  5  npm ci failed — see its output above');
  }

  // 6 ─ the committed hand-in files, re-applied. work-packages.json may have moved with the merge.
  const model2 = loadModel();
  const unit2 = resolveId(unit.raw, model2);
  const quiet = { log: () => {} };
  let blockedOnExport = false;
  const reapply = async (name, apply) => {
    if (!readHandIn(unit2, name, 'HEAD')) return;
    const r = await apply();
    if (r.problems.length) {
      throw new Stop(`  6  ${name} no longer applies — re-cut it against ${base}:\n${r.problems.slice(0, 12).map((p) => `       ${p}`).join('\n')}`, { blockedOn: `pulse-sync: ${name} no longer applies after merging ${base}` });
    }
    if (r.blocked.length) {
      blockedOnExport = true;
      say(`  6  ${name}: NOT applied — ${r.blocked[0]}`);
    } else say(`  6  ${name}: ${r.applied ? 'applied' : 'nothing to write'}`);
  };
  await reapply('i18n.patch.json', () => applyPatch(unit2, model2, { ref: 'HEAD', ...quiet }));
  await reapply('variants.json', () => applyDeltas(unit2, model2, { ref: 'HEAD', ...quiet }));
  const shared = readHandIn(unit2, 'shared.patch', 'HEAD');
  if (shared) {
    const info = inspectSharedPatch(shared.text, unit2, model2);
    const check = info.problems.length ? null : gitApply(['--check'], shared.text);
    if (info.problems.length || check.status !== 0) {
      const why = info.problems.length ? info.problems : check.stderr.trim().split('\n').slice(0, 6);
      throw new Stop(`  6  shared.patch no longer applies — re-cut it against ${base} (the integrator never re-types it):\n${why.map((p) => `       ${p}`).join('\n')}`, {
        blockedOn: `pulse-sync: shared.patch no longer applies after merging ${base}`,
      });
    }
    // Working tree only: `--3way` would stage the result, and a slot never stages a path it does not own.
    const r = gitApply([], shared.text);
    if (r.status !== 0) throw new Stop(`  6  shared.patch failed to apply: ${r.stderr.trim()}`);
    writeApplied({ ...readApplied(), shared: { id: unit2.raw, file: shared.path, blob: sha256(shared.text), files: info.files, at: new Date().toISOString() } });
    say(`  6  shared.patch: applied (${info.files.join(', ')})`);
  }
  if (!readHandIn(unit2, 'i18n.patch.json', 'HEAD') && !readHandIn(unit2, 'variants.json', 'HEAD') && !shared) say('  6  no committed hand-in file to re-apply');
  return { blockedOnExport };
}

/* ── command line ─────────────────────────────────────────────────────────────────────────────── */

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const model = loadModel();
  const unit = resolveId(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--base'), model);
  if (!unit) {
    console.error('usage: node scripts/pulse-sync.mjs <id> [--no-install] [--keep-preview] [--base <branch>]');
    process.exit(2);
  }
  const opts = { noInstall: argv.includes('--no-install'), keepPreview: argv.includes('--keep-preview'), base: argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : BASE_BRANCH };
  console.log(`pulse-sync ${unit.raw} — ${tree().root}`);
  try {
    const { blockedOnExport } = await sync(unit, model, opts);
    const status = readJsonIfExists(`${tree().pulse}/status/${unit.raw}.json`);
    if (status?.status === 'blocked' && String(status.blockedOn ?? '').startsWith('pulse-sync:')) writeStatus(unit, { status: 'in_progress', blockedOn: undefined });
    console.log(blockedOnExport ? 'pulse-sync: synced, but a hand-in file is waiting for a gate export (exit 3)' : 'pulse-sync: done — the slot is on the published line with its hand-in files applied');
    process.exit(blockedOnExport ? 3 : 0);
  } catch (err) {
    if (!(err instanceof Stop)) throw err;
    console.error(err.message);
    writeStatus(unit, { status: 'blocked', blockedOn: err.blockedOn });
    console.error(`pulse-sync: STOPPED — status "blocked" written to .pulse/status/${unit.raw}.json`);
    process.exit(err.code);
  }
}
