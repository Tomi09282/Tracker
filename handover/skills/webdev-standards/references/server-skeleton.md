# Server skeleton — server.js, run-server.js, logger

Roles:
- `server.js` — the app itself. Also installs `uncaughtException`/`unhandledRejection` handlers
  so a fatal error is logged with a stack before the process dies.
- `run-server.js` — small supervisor for dev / a single VPS: restarts the server after a crash
  with exponential backoff and appends a structured JSON dump to `logs/crash.log`.
  In serious production use PM2 or systemd instead; run-server.js stays useful locally.
- `src/lib/logger.js` — pino. `logs/server.log` holds important events only (startup, shutdown,
  auth events, errors). Full crash context lives in `logs/crash.log`, written by run-server.js.

## src/lib/logger.js

```js
import pino from 'pino';
import { env } from './env.js';

// Each entry needs its own level — multistream defaults every stream to 'info', which would
// silently swallow debug/trace lines even when LOG_LEVEL asks for them.
// sync:true — this log holds low-volume "important events" incl. the security audit trail
// (denied transfers, auth events); those must never be lost in an unflushed buffer on crash.
const streams = [
  { level: env.LOG_LEVEL, stream: pino.destination({ dest: './logs/server.log', mkdir: true, sync: true }) },
];
// Mirror to the console in development so run-server.js/terminal shows live output.
if (env.NODE_ENV === 'development') streams.push({ level: env.LOG_LEVEL, stream: process.stdout });

export const logger = pino({ level: env.LOG_LEVEL }, pino.multistream(streams));
```

## server.js

```js
// server.js — app entry. The env import validates configuration before anything else runs.
import { env } from './src/lib/env.js';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { logger } from './src/lib/logger.js';
import * as db from './src/db/index.js';
import { csrfProtection } from './src/auth/middleware.js';
import authRoutes from './src/auth/routes.js';

// Last-resort handlers: log with full stack, then exit non-zero so run-server.js restarts us.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'unhandledRejection');
  process.exit(1);
});

await db.migrate(path.resolve('./src/db/schema.sql'));

const app = express();
// TRUST_PROXY = number of reverse-proxy hops (1 behind nginx/caddy). MUST stay 0 when the
// server is directly exposed — trusting a nonexistent proxy lets any client spoof
// X-Forwarded-For and rotate req.ip, bypassing the per-IP rate limits on the auth routes.
if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(csrfProtection);

app.use('/api/auth', authRoutes);
// app.use('/api/<feature>', featureRoutes); — every feature router follows the same pattern

app.use((req, res) => res.status(404).json({ error: 'not found' }));

// Central error handler — clients get generic messages, details go to the log only.
app.use((err, req, res, _next) => {
  if (err?.name === 'ZodError') return res.status(400).json({ error: 'invalid input' });
  // body-parser errors are client faults, not server faults — don't log them as errors.
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'malformed JSON' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'payload too large' });
  logger.error({ err, method: req.method, url: req.originalUrl }, 'unhandled route error');
  res.status(500).json({ error: 'internal server error' });
});

const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'server started'));

function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await db.closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // hard exit if draining hangs
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

## run-server.js

```js
// run-server.js — crash supervisor. Start the app with: node run-server.js
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';

const CRASH_LOG = './logs/crash.log';
const STDERR_TAIL_BYTES = 8192;
let restarts = 0;
let child = null;
let stopping = false;

// Forward shutdown signals to the child so it never outlives the supervisor — an orphaned
// server keeps the port bound and the next start dies with EADDRINUSE. If the signal lands
// during a backoff wait there is no child, so just exit.
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

  // Echo stderr live but keep the last chunk for the crash dump.
  let stderrTail = '';
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_BYTES);
  });

  child.on('exit', (code, signal) => {
    child = null;
    if (code === 0) process.exit(0); // clean shutdown — do not restart
    if (stopping) process.exit(0); // we asked it to stop — do not restart

    const uptimeMs = Date.now() - startedAt;
    mkdirSync('./logs', { recursive: true });
    appendFileSync(CRASH_LOG, JSON.stringify({
      time: new Date().toISOString(),
      exitCode: code,
      signal,
      uptimeMs,
      restartCount: restarts,
      stderrTail,
    }) + '\n');

    if (uptimeMs > 60_000) restarts = 0; // ran fine for a while → reset the backoff
    const delayMs = Math.min(30_000, 1000 * 2 ** restarts);
    restarts += 1;
    console.error(`server exited (code ${code}, signal ${signal}) — restarting in ${delayMs} ms`);
    setTimeout(start, delayMs);
  });
}

start();
```

## Log discipline

- `logger.info` — startup/shutdown, auth events (login, logout, reuse detection), scheduled jobs.
- `logger.warn` — recoverable anomalies worth investigating (rate-limit hits, sv mismatches).
- `logger.error` — request-level failures with the error object.
- `logger.fatal` — process is about to die.
- Never log: passwords, tokens, cookies, the DB key, full request bodies.
