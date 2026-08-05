// scripts/smoke-run.mjs — boots a throwaway server, runs a suite against it, tears it down.
//
// Hermetic on purpose: a fresh encrypted database per run, in the OS temp directory. The suite
// therefore never pollutes the dev data, never inherits state from a previous run, and starts
// from an empty schema every time — which is the only way "register" can be a meaningful test.
//
//   node scripts/smoke-run.mjs            -> functional suite (NODE_ENV=test, limiters skipped)
//   node scripts/smoke-run.mjs --limits   -> rate-limit suite (NODE_ENV=development, limiters live)
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const limitsMode = process.argv.includes('--limits');
const suite = limitsMode ? 'scripts/smoke-limits.js' : 'scripts/smoke.js';

const dir = mkdtempSync(path.join(tmpdir(), 'tracker-smoke-'));
const port = 3100 + Math.floor(Math.random() * 400);

const childEnv = {
  ...process.env,
  // Test mode skips the rate limiters so one suite from one IP is not throttled into false
  // failures. The limiters get their own run, where the skip is deliberately NOT active.
  NODE_ENV: limitsMode ? 'development' : 'test',
  PORT: String(port),
  DB_PATH: path.join(dir, 'smoke.db'),
  LOG_LEVEL: 'warn',
  SMOKE_BASE: `http://localhost:${port}`,
};

const server = spawn(process.execPath, ['server.js'], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErr = '';
server.stderr.on('data', (c) => {
  serverErr += c.toString();
});

const cleanup = (code) => {
  server.kill('SIGTERM');
  // Give the pool a moment to close its handles before the directory disappears under it.
  setTimeout(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* the OS reclaims the temp dir either way */
    }
    process.exit(code);
  }, 400);
};

// Wait for readiness rather than sleeping a guessed number of seconds: scrypt key derivation
// alone takes a few hundred ms per worker, and that varies by machine.
const deadline = Date.now() + 30_000;
let up = false;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`http://localhost:${port}/readyz`);
    if (res.status === 200) {
      up = true;
      break;
    }
  } catch {
    /* not listening yet */
  }
  await new Promise((r) => setTimeout(r, 250));
}

if (!up) {
  console.error(`smoke-run: server never became ready on :${port}\n${serverErr}`);
  cleanup(1);
} else {
  // Privileged accounts are seeded straight into the database: there is deliberately no
  // self-service path to `coach` or `admin`, so the suite cannot register its way to one.
  const seeded = await new Promise((resolve) => {
    const p = spawn(process.execPath, ['scripts/seed-accounts.mjs'], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    p.stdout.on('data', (c) => {
      out += c.toString();
    });
    p.on('exit', () => resolve(out.trim()));
  });

  // Taxonomy labels beyond English, plus German switched on. This is application DATA in the
  // same sense migrations are: without it the suite cannot tell a working fallback chain from a
  // broken one, because every language would look equally untranslated.
  for (const step of ['scripts/seed-taxonomy-i18n.mjs', 'scripts/seed-smoke-languages.mjs']) {
    const code = await new Promise((resolve) => {
      // stdout is inherited on purpose. A silent setup step that quietly did nothing is how the
      // language checks came to fail with a message about German that had nothing to do with the
      // code under test.
      const p = spawn(process.execPath, [step], { env: childEnv, stdio: ['ignore', 'inherit', 'inherit'] });
      p.on('exit', (c) => resolve(c ?? 1));
    });
    if (code !== 0) {
      console.error(`smoke-run: setup step ${step} failed with code ${code}`);
      cleanup(1);
    }
  }

  const runner = spawn(process.execPath, [suite], {
    env: { ...childEnv, SMOKE_ACCOUNTS: seeded },
    stdio: 'inherit',
  });
  runner.on('exit', (code) => cleanup(code ?? 1));
}
