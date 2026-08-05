// src/lib/logger.js — pino. logs/server.log holds important events only: startup, shutdown,
// auth events, errors, crash-relevant warnings. Full crash context is run-server.js's job.
import pino from 'pino';
import { env } from './env.js';

// Each stream needs its own level — pino.multistream defaults every stream to 'info', which
// silently swallows debug/trace even when LOG_LEVEL asks for them.
//
// sync:true — this log carries the security audit trail (auth events, rate-limit trips, denied
// operations). Those must never be lost in an unflushed buffer when the process dies.
const streams = [
  {
    level: env.LOG_LEVEL,
    stream: pino.destination({ dest: './logs/server.log', mkdir: true, sync: true }),
  },
];
if (env.NODE_ENV === 'development') {
  streams.push({ level: env.LOG_LEVEL, stream: process.stdout });
}

export const logger = pino(
  {
    level: env.LOG_LEVEL,
    base: { name: env.APP_NAME },
    // Defence in depth: even a careless logger.info({ req }) cannot leak a credential.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        '*.password',
        '*.token',
        '*.refreshToken',
        '*.accessToken',
        'password',
        'token',
        // pino matches a path LITERALLY: `*.password` does not cover `temporaryPassword`. Nothing
        // logs these today — checked — but they are the values in this codebase that would do the
        // most damage in a log file, and the cost of listing them before someone adds a debug line
        // is nothing. Defence for the change that has not happened yet.
        '*.temporaryPassword',
        'temporaryPassword',
        '*.password_hash',
        'password_hash',
        '*.token_hash',
        'token_hash',
        // The ICS feed URL carries its bearer token inline and is returned exactly once.
        '*.url',
      ],
      censor: '[redacted]',
    },
  },
  pino.multistream(streams),
);
