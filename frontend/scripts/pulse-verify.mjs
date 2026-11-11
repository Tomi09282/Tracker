#!/usr/bin/env node
/*
 * pulse-verify — the only sanctioned way to build and capture in a worktree (PLAN.md 2.1, 6.1).
 *
 *   cookies (live only) -> lock -> free the port -> build -> preview -> captures -> stop -> release
 *
 * Why it exists: a build, a preview and a headless Chrome are the three things on this machine
 * that cost real memory, and six agents share it. At most TWO of these runs happen at once. The
 * wait for a login window and the wait for the lock itself happen BEFORE the lock is held, and
 * the preview and the lock are released in `finally`, whatever went wrong.
 *
 *   node scripts/pulse-verify.mjs --package <id> [--port <slot port>] [capture options of pulse-shot]
 *   node scripts/pulse-verify.mjs --package <id> --baseline      the "before": the BASE build, no build here
 *   node scripts/pulse-verify.mjs --clean                        dead locks and stray previews
 *
 * The lock (two slots):
 *   .pulse/locks/heavy-<n>/      the mutex itself — `mkdir` is atomic, and the same directory is what
 *                                an agent takes by hand around a bare `npm ci` or `npm run build`
 *   .pulse/locks/slot-<n>.json   { pid, package, port, previewPid, heartbeat }, rewritten every 20 s
 * A slot whose pid is dead or whose heartbeat is older than 3 minutes is taken over; a hand-taken
 * directory with no slot file is stale after 25 minutes.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  FRONTEND_DIR, PREVIEW_PORTS, getAccess, killListenerOnPort, listenersOnPort, parseArgs, planRun, pulseDir, run, selfTest, sleep, startPreview, writeFileAtomic,
} from './pulse-shot.mjs';
import { PREVIEW_PORT_RANGES, portForTree } from './lib/pulse-ports.mjs';

const LOCKS = () => path.join(pulseDir(), 'locks');
const HEARTBEAT_MS = 20 * 1000;
const STALE_SLOT_MS = 3 * 60 * 1000;
const STALE_HAND_LOCK_MS = 25 * 60 * 1000;

const slotFile = (n) => path.join(LOCKS(), `slot-${n}.json`);
const heavyDir = (n) => path.join(LOCKS(), `heavy-${n}`);
const readSlot = (n) => {
  try {
    return JSON.parse(fs.readFileSync(slotFile(n), 'utf8'));
  } catch {
    return null;
  }
};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
};
const slotIsLive = (slot) => !!slot && alive(slot.pid) && Date.now() - Date.parse(slot.heartbeat) < STALE_SLOT_MS;

/** Removes what a dead run left in slot `n`. Returns a sentence when it removed something. */
function reapSlot(n) {
  const slot = readSlot(n);
  const dir = heavyDir(n);
  if (slot && !slotIsLive(slot)) {
    fs.rmSync(slotFile(n), { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
    return `slot ${n}: the lock of ${slot.package} (pid ${slot.pid}, heartbeat ${slot.heartbeat}) was dead — removed`;
  }
  if (!slot && fs.existsSync(dir)) {
    const age = Date.now() - fs.statSync(dir).mtimeMs;
    if (age > STALE_HAND_LOCK_MS) {
      fs.rmSync(dir, { recursive: true, force: true });
      return `slot ${n}: a hand-taken lock ${Math.round(age / 60000)} minutes old — removed`;
    }
  }
  return null;
}

function tryAcquire(pkg, port) {
  fs.mkdirSync(LOCKS(), { recursive: true });
  for (const n of [1, 2]) {
    const reaped = reapSlot(n);
    if (reaped) console.log(`pulse-verify: ${reaped}`);
    try {
      fs.mkdirSync(heavyDir(n)); // the atomic step: exactly one caller creates it
    } catch (err) {
      if (err.code === 'EEXIST') continue;
      throw err;
    }
    fs.writeFileSync(path.join(heavyDir(n), 'owner'), `${pkg} pid ${process.pid} ${new Date().toISOString()} (pulse-verify)\n`);
    const state = { pid: process.pid, package: pkg, port, previewPid: null, heartbeat: new Date().toISOString() };
    const write = () => {
      state.heartbeat = new Date().toISOString();
      writeFileAtomic(slotFile(n), JSON.stringify(state, null, 2) + '\n');
    };
    write();
    const timer = setInterval(write, HEARTBEAT_MS);
    timer.unref();
    return {
      n,
      setPreviewPid: (pid) => {
        state.previewPid = pid;
        write();
      },
      release: () => {
        clearInterval(timer);
        fs.rmSync(slotFile(n), { force: true });
        fs.rmSync(heavyDir(n), { recursive: true, force: true });
      },
    };
  }
  return null;
}

async function acquire(pkg, port, waitMs) {
  const t0 = Date.now();
  let told = false;
  for (;;) {
    const lock = tryAcquire(pkg, port);
    if (lock) return lock;
    if (Date.now() - t0 > waitMs) throw new Error(`both lock slots stayed busy for ${Math.round(waitMs / 60000)} minutes`);
    if (!told) {
      const who = [1, 2].map((n) => readSlot(n)?.package || 'a hand-taken lock').join(' and ');
      console.log(`pulse-verify: both slots are busy (${who}) — waiting`);
      told = true;
    }
    await sleep(5000);
  }
}

/** `--clean` (PLAN 8.3 step 1): dead locks, and every preview no live lock stands behind. */
function clean() {
  fs.mkdirSync(LOCKS(), { recursive: true });
  const said = [];
  for (const n of [1, 2]) {
    const r = reapSlot(n);
    if (r) said.push(r);
  }
  const livePorts = new Set([1, 2].map((n) => readSlot(n)).filter(slotIsLive).map((s) => s.port));
  for (const port of PREVIEW_PORTS) {
    if (livePorts.has(port) || !listenersOnPort(port).length) continue;
    const killed = killListenerOnPort(port);
    if (killed.length) said.push(`port ${port}: stray listener (pid ${killed.join(', ')}) stopped`);
  }
  console.log(said.length ? said.map((s) => `pulse-verify --clean: ${s}`).join('\n') : 'pulse-verify --clean: nothing to clean');
}

function build(frontendDir) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn('npm run build', { cwd: frontendDir, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const take = (d) => {
      process.stdout.write(d);
      tail = (tail + d).slice(-6000);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('close', (code) => resolve({ code, seconds: Math.round((Date.now() - t0) / 1000), tail }));
  });
}

/** The base worktree (the "before"): a sibling of the main checkout, detached at the base commit. */
function baseTree() {
  if (process.env.PULSE_BASE_TREE) return path.resolve(process.env.PULSE_BASE_TREE);
  const main = path.dirname(pulseDir());
  return path.join(path.dirname(main), 'tracker-wt', 'base', 'frontend');
}

function slotPort() {
  // slot-3 -> 5183, slot-12 -> 5212 (5180 + n up to 8, 5200 + n from 9); the integration worktree -> 5189;
  // anything else must say --port
  return portForTree(FRONTEND_DIR + path.sep);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--clean')) return clean();
  if (argv.includes('-h') || argv.includes('--help') || !argv.length) {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\n?/, '').replace(/^ \* ?/gm, ''));
    return;
  }

  // our own flags; everything else is pulse-shot's
  const own = { noBuild: false, lockWait: 30 * 60 * 1000 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--no-build') own.noBuild = true;
    else if (argv[i] === '--lock-wait') own.lockWait = Number(argv[++i]) * 60 * 1000;
    else rest.push(argv[i]);
  }
  const opts = parseArgs(rest);
  if (!opts.pkg && !opts.all && !opts.states.length) throw new Error('name what to verify: --package <id>, --all or state keys');
  const label = opts.pkg || (opts.all ? 'all' : opts.states.join('+'));
  opts.port = opts.port || slotPort();
  if (!opts.port) throw new Error(`this tree is not a slot: give --port ${PREVIEW_PORT_RANGES}`);
  if (!PREVIEW_PORTS.includes(opts.port)) throw new Error(`--port must be in ${PREVIEW_PORT_RANGES}`);
  if (opts.serve || opts.base) throw new Error('pulse-verify serves the build itself: --serve and --base belong to pulse-shot');

  const serveDir = opts.baseline ? baseTree() : FRONTEND_DIR;
  if (opts.baseline && !fs.existsSync(path.join(serveDir, 'dist', 'index.html'))) throw new Error(`the base build is missing: ${serveDir}/dist`);

  // A package that owns no state (the capture tool's own: F3) is verified by the tool checking
  // itself on the build: the clock's two controls, and one signed-out capture with the write guard probed.
  let plan = null;
  let toolCheck = false;
  try {
    plan = planRun(opts);
  } catch (err) {
    if (!opts.pkg || opts.states.length || opts.all || !/no state named/.test(err.message)) throw err;
    toolCheck = true;
  }

  // 1. Cookies. A refused login is a reason to WAIT — and nothing is held while we do.
  if (plan && opts.mode !== 'replay') {
    for (const email of plan.emails) await getAccess(email, { api: opts.api, minRemainingMs: 10 * 60 * 1000 });
  }

  // 2. The lock.
  const lock = await acquire(label, opts.port, own.lockWait);
  console.log(`pulse-verify: slot ${lock.n} taken for ${label} (port ${opts.port})`);
  let preview = null;
  let exit = 0;
  let line = '';
  const bail = () => {
    try {
      lock.release();
    } catch {
      /* nothing more to do */
    }
    process.exit(130);
  };
  process.once('SIGINT', bail);
  process.once('SIGTERM', bail);
  try {
    // 3. Whatever still listens on OUR port is a leftover of a run that died.
    const stray = killListenerOnPort(opts.port);
    if (stray.length) console.log(`pulse-verify: stray listener on ${opts.port} stopped (pid ${stray.join(', ')})`);

    // 4. Build — the gates, tsc -b and vite build, in this tree. Not for the baseline (it serves the base build).
    let built = 'not built (--no-build)';
    if (opts.baseline) built = `base build ${serveDir}`;
    else if (!own.noBuild) {
      const b = await build(FRONTEND_DIR);
      if (b.code !== 0) {
        const gate = /npm run (check:[\w-]+|verify:[\w-]+)|> tracker-frontend@[\d.]+ ([\w:-]+)/g;
        let last = null;
        for (let m = gate.exec(b.tail); m; m = gate.exec(b.tail)) last = m[2] || m[1];
        throw new Error(`the build is RED after ${b.seconds} s (exit ${b.code})${last ? ` — the last step that started was "${last}"` : ''}`);
      }
      built = `build green in ${b.seconds} s`;
    }

    // 5. Preview, registered in the lock so --clean can tell it from a stray one.
    preview = await startPreview(serveDir, opts.port);
    lock.setPreviewPid(preview.pid);
    opts.base = preview.base;

    // 6. Captures.
    if (toolCheck) {
      const st = await selfTest(preview.base);
      for (const r of st.results) for (const c of r.checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} clock (${r.kind}): ${c.name}`);
      const smoke = await run({ ...opts, pkg: null, states: ['auth-1'], mode: 'live', probeWrite: true, out: opts.out || path.join(pulseDir(), 'shots', label) });
      const good = st.ok && smoke.results.every((r) => r.ok && r.writeGuard === 'held');
      line = `pulse-verify: ${built} · the capture tool checked itself on ${st.browser}: clock ${st.ok ? 'ok' : 'FAILED'}, signed-out capture ${smoke.results[0]?.ok ? 'ok' : 'FAILED'}, write guard ${smoke.results[0]?.writeGuard || 'not probed'} · ${smoke.outDir}`;
      if (!good) exit = 1;
    } else {
      const { results, outDir, contact } = await run(opts);
      const failed = results.filter((r) => !r.ok);
      line = `pulse-verify: ${built} · ${results.length - failed.length} of ${results.length} captured (${opts.mode}) · ${outDir}`;
      if (contact?.length) line += ` · contact sheet ${path.basename(contact[0])}`;
      if (failed.length) exit = 1;
    }
  } catch (err) {
    line = `pulse-verify: ${err.message}`;
    exit = 2;
  } finally {
    if (preview) await preview.stop();
    lock.release();
  }
  console.log(line);
  process.exitCode = exit;
}

main().catch((err) => {
  console.error(`pulse-verify: ${err.message}`);
  process.exitCode = 2;
});
