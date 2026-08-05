// run-server.js — crash supervisor. Start the app with: node run-server.js
//
// Restarts the server after a crash with exponential backoff and appends a structured dump to
// logs/crash.log. In serious production use systemd or PM2; this stays useful locally.
//
// Note for anyone stopping the app by hand: THIS is the process to kill. Killing only the
// child makes the supervisor faithfully restart it — which, among other things, keeps a lock
// on the database file and blocks anything that needs exclusive access.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';

const CRASH_LOG = './logs/crash.log';
const STDERR_TAIL_BYTES = 8192;
let restarts = 0;
let child = null;
let stopping = false;

// Forward shutdown signals so the child never outlives the supervisor — an orphaned server
// keeps the port bound and the next start dies with EADDRINUSE. If the signal arrives during a
// backoff wait there is no child, so just exit.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopping = true;
    if (child) child.kill(sig);
    else process.exit(0);
  });
}

function start() {
  const startedAt = Date.now();
  child = spawn(process.execPath, ['server.js'], {
    stdio: ['ignore', 'inherit', 'pipe'],
    env: process.env,
  });

  // Echo stderr live, but keep the tail for the crash dump.
  let stderrTail = '';
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_BYTES);
  });

  child.on('exit', (code, signal) => {
    child = null;
    if (code === 0) process.exit(0); // clean shutdown — do not restart
    if (stopping) process.exit(0); // we asked for this — do not restart

    const uptimeMs = Date.now() - startedAt;
    mkdirSync('./logs', { recursive: true });
    appendFileSync(
      CRASH_LOG,
      `${JSON.stringify({
        time: new Date().toISOString(),
        exitCode: code,
        signal,
        uptimeMs,
        restartCount: restarts,
        stderrTail,
      })}\n`,
    );

    if (uptimeMs > 60_000) restarts = 0; // ran fine for a while → reset the backoff
    const delayMs = Math.min(30_000, 1000 * 2 ** restarts);
    restarts += 1;
    console.error(`server exited (code ${code}, signal ${signal}) — restarting in ${delayMs} ms`);
    setTimeout(start, delayMs);
  });
}

start();
