// src/lib/http.js — the uniform API surface: one error envelope, one set of codes, one
// request id. Clients get a stable shape and nothing else; details go to the log.
import { randomUUID } from 'node:crypto';

/**
 * Closed set of machine-readable error codes. Clients branch on `code`, never on `error`,
 * which is prose and may be reworded or translated at any time.
 */
export const ERR = {
  VALIDATION: 'validation_error',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  RATE_LIMITED: 'rate_limited',
  PAYLOAD_TOO_LARGE: 'payload_too_large',
  UNSUPPORTED_MEDIA_TYPE: 'unsupported_media_type',
  INTERNAL: 'internal_error',
};

/**
 * The ONLY way an error leaves the server.
 *
 * Note what is absent: no stack, no SQL, no upstream message. An attacker learns the class of
 * failure and nothing more. `requestId` is the bridge — it correlates the client's report with
 * the full detail sitting in the server log.
 */
export function sendError(res, status, code, message) {
  res.status(status).json({ error: message, code, requestId: res.locals.requestId });
}

/** Attaches a request id and a child logger to every request, before anything can fail. */
export function requestContext(logger) {
  return (req, res, next) => {
    const id = randomUUID();
    res.locals.requestId = id;
    res.setHeader('X-Request-Id', id);
    req.log = logger.child({ requestId: id });
    next();
  };
}

/**
 * Async route wrapper. Express 5 forwards rejected promises to the error handler on its own,
 * but being explicit keeps the intent visible at every call site and survives a downgrade.
 */
export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Central error handler. Every branch below maps a KNOWN failure to a client-safe response;
 * anything unknown becomes a generic 500 and is logged in full.
 */
/**
 * Turn a database constraint violation into the client fault it is.
 *
 * A CHECK or a trigger firing is the schema refusing a request — the same class of thing zod
 * refuses, just enforced a layer down. Letting it fall through to a 500 tells the client the
 * server broke, and files a routine bad request in the log as a server fault. That is how a log
 * stops being read.
 *
 * Detection is on the MESSAGE, not on `err.code`: the worker's `rethrow` sets a code, but the error
 * crosses a Piscina worker boundary on the way here and custom properties do not survive
 * structured cloning. The message prefix does.
 *
 * What gets sent back is deliberately split:
 *
 *   - A `RAISE(ABORT, '…')` message was WRITTEN FOR A HUMAN by whoever added the trigger
 *     ("workout_plan_days.day_index must be inside the plan cycle"). Passing it through means the
 *     API's error text and the schema's rule cannot drift apart, because they are the same string.
 *   - A CHECK expression was not written for anyone to read. `CHECK constraint failed: (scope =
 *     'template' AND author_user_id IS NOT NULL AND …)` helps nobody and dumps schema internals
 *     into a response, so it becomes a generic message and the detail stays in the log.
 *
 * Never returned raw either way: the worker appends `— while running: <sql>` for debugging, and
 * the statement text is not the client's business.
 */
function constraintFault(err) {
  const message = typeof err?.message === 'string' ? err.message : '';
  if (!message.startsWith('SQLITE_CONSTRAINT')) return null;

  // Everything the worker appended for the log, and nothing else.
  const withoutSql = message.split(' — while running:')[0];

  if (withoutSql.startsWith('SQLITE_CONSTRAINT_TRIGGER')) {
    const humanText = withoutSql.replace(/^SQLITE_CONSTRAINT_TRIGGER:\s*/, '').trim();
    if (humanText) return humanText;
  }
  return 'this change is not allowed by the data model';
}

export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
  return (err, req, res, _next) => {
    if (err?.name === 'ZodError') return sendError(res, 400, ERR.VALIDATION, 'invalid input');
    // Malformed JSON and oversized bodies are client faults; logging them as server errors
    // would fill the log with noise anyone could generate on demand.
    if (err?.type === 'entity.parse.failed') return sendError(res, 400, ERR.VALIDATION, 'malformed JSON');
    if (err?.type === 'entity.too.large') return sendError(res, 413, ERR.PAYLOAD_TOO_LARGE, 'payload too large');

    const constraint = constraintFault(err);
    if (constraint) {
      // Logged at `info`, not `error`: it is a request that was correctly refused, not a fault.
      // The full message, SQL and all, is here — it is only the RESPONSE that is trimmed.
      (req.log ?? logger).info({ err, method: req.method, url: req.originalUrl }, 'constraint refused a write');
      return sendError(res, 400, ERR.VALIDATION, constraint);
    }

    (req.log ?? logger).error({ err, method: req.method, url: req.originalUrl }, 'unhandled route error');
    sendError(res, 500, ERR.INTERNAL, 'internal server error');
  };
}
