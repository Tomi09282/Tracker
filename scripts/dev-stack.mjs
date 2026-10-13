#!/usr/bin/env node
/*
 * dev-stack — the TRACKER dev stack with one command (dev-verify note, item V3).
 *
 *   node scripts/dev-stack.mjs             start what is not running: the backend (:3000) and the
 *                                          frontend dev server (:5173); wait until the database answers
 *   node scripts/dev-stack.mjs --backend   the backend only
 *   node scripts/dev-stack.mjs --status    what listens, and what /healthz and /readyz say
 *
 * It only ever runs in the MAIN checkout: a worktree has no `.env`, no database and no storage.
 * It never stops a process it did not start; Ctrl+C stops what THIS run started and nothing else.
 *
 * What it sets, and what it leaves alone:
 *   DB_POOL_THREADS=4   the default pool is one thread per core (23 here), each running the key
 *                       derivation — on a machine with 3 GB free that is the difference between
 *                       a stack and a swap storm. Override by setting the variable yourself.
 *   NODE_ENV            NOT touched. The rate limiters stay ON (PLAN R19): the capture tool logs in
 *                       once per account and caches the cookie. Switching them off is the owner's
 *                       word, not this script's.
 *
 * The backend is started the way the project starts it: `node run-server.js` (the crash
 * supervisor) with cwd = backend/, because `.env`, the database path, the storage root and the
 * log file all resolve from there.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const args = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => console.log(`dev-stack: ${s}`);

async function get(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return { status: res.status, text: (await res.text()).slice(0, 120) };
  } catch (err) {
    return { status: 0, text: err.cause?.code || err.name };
  }
}
const up = async (url) => (await get(url)).status === 200;

async function status() {
  const rows = [
    ['backend  /healthz', 'http://localhost:3000/healthz'],
    ['backend  /readyz ', 'http://localhost:3000/readyz'],
    ['frontend :5173   ', 'http://localhost:5173/'],
    ['through the proxy', 'http://localhost:5173/api/v1/config'],
  ];
  for (const [label, url] of rows) {
    const r = await get(url);
    say(`${label}  ${r.status === 200 ? 'up  ' : 'DOWN'}  ${r.status || r.text}`);
  }
}

function start(label, command, commandArgs, cwd, env) {
  const child = spawn(command, commandArgs, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'inherit', 'inherit'], shell: false });
  child.on('exit', (code) => say(`${label} exited (code ${code})`));
  return child;
}

async function waitFor(label, url, seconds) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await up(url)) return say(`${label} answers on ${url}`);
    await sleep(500);
  }
  throw new Error(`${label} did not answer on ${url} within ${seconds} s`);
}

async function main() {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\n?/, '').replace(/^ \* ?/gm, ''));
    return;
  }
  if (args.includes('--status')) return status();
  if (!fs.existsSync(path.join(BACKEND, '.env'))) {
    throw new Error(`${BACKEND} has no .env — the stack runs in the main checkout only (a worktree has no database)`);
  }
  const started = [];
  const stop = () => {
    for (const child of started) if (child.exitCode === null) child.kill();
  };
  process.once('SIGINT', () => {
    stop();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    stop();
    process.exit(143);
  });
  try {
    if (await up('http://localhost:3000/healthz')) say('the backend is already running on :3000 — left as it is');
    else {
      say(`starting the backend (DB_POOL_THREADS=${process.env.DB_POOL_THREADS || 4}, rate limiters on)`);
      started.push(start('backend', process.execPath, ['run-server.js'], BACKEND, { DB_POOL_THREADS: process.env.DB_POOL_THREADS || '4' }));
    }
    await waitFor('the database', 'http://localhost:3000/readyz', 60);
    if (!args.includes('--backend')) {
      if (await up('http://localhost:5173/')) say('the frontend dev server is already running on :5173 — left as it is');
      else {
        say('starting the frontend dev server');
        started.push(start('frontend', process.execPath, [path.join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js')], FRONTEND, {}));
      }
      await waitFor('the app', 'http://localhost:5173/api/v1/config', 60);
    }
  } catch (err) {
    stop();
    throw err;
  }
  if (!started.length) return say('everything was already up; nothing to keep alive');
  say('up. Ctrl+C stops what this run started.');
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(`dev-stack: ${err.message}`);
  process.exitCode = 1;
});
