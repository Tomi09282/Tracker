// server.js — application entry.
// The env import must come FIRST: configuration is validated before a database is opened or a
// port is bound, so a misconfigured process dies with a named error instead of a half-boot.
import { env, corsOrigins } from './src/lib/env.js';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { logger } from './src/lib/logger.js';
import * as db from './src/db/index.js';
import { ERR, sendError, requestContext, errorHandler, asyncRoute } from './src/lib/http.js';
import { csrfProtection, AUTH_PATH } from './src/auth/middleware.js';
import authRoutes from './src/auth/routes.js';
import themeRoutes from './src/theme/routes.js';
import exerciseRoutes from './src/exercises/routes.js';
import mediaRoutes from './src/exercises/media.js';
import adminRoutes from './src/admin/routes.js';
import privacyRoutes from './src/privacy/routes.js';
import coachingRoutes from './src/coaching/routes.js';
import onboardingRoutes from './src/onboarding/routes.js';
import planRoutes from './src/plans/routes.js';
import logRoutes from './src/logs/routes.js';
import chatRoutes from './src/chat/routes.js';
import notificationRoutes from './src/notifications/routes.js';
import attachmentRoutes from './src/chat/attachments.js';
import icsRoutes from './src/plans/ics.js';
import nutritionRoutes from './src/nutrition/routes.js';
import progressRoutes, { uploadRouter as progressUploadRoutes } from './src/progress/routes.js';
import coinRoutes from './src/coins/routes.js';
import publicRoutes from './src/public/routes.js';
import composeRoutes, { COMPOSE_JSON_LIMIT } from './src/public/compose.js';
import composeUploadRoutes from './src/public/compose-media.js';
import moderationRoutes from './src/public/moderation.js';
import { ensureDirs, sweepQuarantine } from './src/lib/media.js';
import { sweepChatRetention } from './src/chat/retention.js';

// Last-resort handlers: log with a full stack, then exit non-zero so run-server.js restarts us.
// Staying alive after an uncaught exception means running with unknown state.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'unhandledRejection');
  process.exit(1);
});

const migration = await db.migrate();
logger.info({ applied: migration.applied, version: migration.version }, 'schema up to date');

// AN OUT-OF-ORDER MIGRATION IS APPLIED, AND THEN SAID OUT LOUD.
//
// The runner used to gate on `user_version` alone, so a file numbered below the mark was skipped
// forever with no error. The ledger applies it instead — but applying it QUIETLY would trade a
// silent skip for a silent surprise, and a schema that changed without anybody noticing is the
// same failure wearing better clothes. `warn`, not `info`: it is legitimate and it is unusual.
if (migration.outOfOrder?.length) {
  logger.warn(
    { outOfOrder: migration.outOfOrder, version: migration.version },
    'a migration numbered below the current schema version was applied — check it was written against this schema',
  );
}

// Housekeeping at boot: drop refresh tokens that are expired, and revoked ones older than a
// month. The absolute session cap survives this because family_created_at lives on every row
// rather than being derived from the oldest surviving one.
const purged = await db.run(
  'DELETE FROM refresh_tokens WHERE expires_at <= unixepoch() OR (revoked = 1 AND created_at <= unixepoch() - 2592000)',
);
if (purged.changes > 0) logger.info({ removed: purged.changes }, 'purged stale refresh tokens');

await ensureDirs();
// Uploads that crashed between quarantine and ingest would otherwise sit on disk forever.
const sweptAtBoot = await sweepQuarantine();
if (sweptAtBoot > 0) logger.info({ removed: sweptAtBoot }, 'swept stale quarantined uploads');
setInterval(() => {
  sweepQuarantine().catch((err) => logger.warn({ err }, 'quarantine sweep failed'));
  // Retention is already ENFORCED by the read predicate; this only stops the disk growing, so a
  // failure is a warning rather than anything that should stop the server.
  sweepChatRetention()
    .then(({ rows, files }) => { if (rows > 0) logger.info({ rows, files }, 'chat retention swept'); })
    .catch((err) => logger.warn({ err }, 'chat retention sweep failed'));
}, 60 * 60 * 1000).unref();

const app = express();

// TRUST_PROXY is the number of reverse-proxy hops. It MUST stay 0 when the server is directly
// exposed: trusting a proxy that is not in front of us lets any client spoof X-Forwarded-For,
// rotate req.ip at will, and walk straight through the per-IP rate limits.
if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // No 'unsafe-inline' anywhere. The frontend's pre-paint theme script will ship as a
        // sha256 hash added here when it lands — a nonce cannot work for a static index.html.
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'"], // fonts are self-hosted; no third-party font origin is allowed
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Both of these already resolve to 'self' by falling back to default-src, and both are
        // written out anyway: the PWA depends on them, and a future tightening of default-src
        // would otherwise kill the service worker silently — no console error the user sees, just
        // an app that quietly stops starting offline.
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
      },
    },
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }),
);

app.use((req, res, next) => {
  // Deny by default: only capabilities the product actually uses get turned on later.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

// Exact-origin allowlist, never a wildcard with credentials. In dev this list is empty because
// Vite proxies /api and everything is same-origin — which also means the cookie flags behave in
// development exactly as they will in production.
if (corsOrigins.length > 0) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-CSRF');
      return res.sendStatus(204);
    }
    next();
  });
}

app.use(requestContext(logger));
// Global body cap. Individual routes tighten this further; auth and upload routes especially.
// The composer needs a bigger body than the rest of the product, and ONLY the composer does.
// A legal 20 000-character post of accented or CJK text exceeds 64 KB once UTF-8 and JSON
// escaping are paid for, and that request would be a 413 raised by the PARSER — before zod, before
// the route, with an error the composer cannot explain because nothing it sent was out of bounds.
//
// Mounted above the global parser: express.json skips a body that is already parsed, so the 64 KB
// cap stays in force everywhere else. body.js asserts at module load that this number can actually
// admit the body bound it promises, rather than describing the relationship in a comment.
app.use('/api/v1/compose', express.json({ limit: COMPOSE_JSON_LIMIT }));
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

// --- Health -----------------------------------------------------------------------------
// /healthz answers "is the process alive" and must never touch a dependency: if it did, a slow
// database would get the container killed instead of merely marked unready.
app.get('/healthz', (req, res) => res.json({ ok: true }));

// /readyz answers "can this instance serve traffic", which does require the database.
app.get(
  '/readyz',
  asyncRoute(async (req, res) => {
    try {
      await db.ping();
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, 'readyz: database unreachable');
      sendError(res, 503, ERR.INTERNAL, 'not ready');
    }
  }),
);

// Public, non-secret client configuration. The app name comes from here, never from a string
// baked into the frontend bundle.
app.get('/api/v1/config', (req, res) => res.json({ appName: env.APP_NAME }));

// --- API --------------------------------------------------------------------------------
// CSRF guards every state-changing request from here down. It sits BELOW the health and config
// routes (which are GET-only and must answer an unadorned probe) and ABOVE everything else, so
// a future router cannot forget to opt in.
// Media is mounted ABOVE the global CSRF middleware because that middleware requires a JSON
// content type, which a multipart upload cannot have. The media router runs its own CSRF check
// with the same Sec-Fetch-Site and X-CSRF requirements — the rule is narrowed for one route,
// not waived.
app.use('/api/v1', mediaRoutes);
// Chat attachments join media ABOVE the global CSRF middleware for the same reason and with the
// same compensation: a multipart body cannot carry a JSON content type, so the router runs its own
// Sec-Fetch-Site + X-CSRF check. It additionally proves conversation MEMBERSHIP in a middleware
// that runs before multer, so a stranger cannot make the server write 128 MiB to disk.
app.use('/api/v1', attachmentRoutes);

// Progress photo UPLOAD joins media and chat attachments above the global CSRF middleware, for
// the same reason and with the same compensation: a multipart body cannot carry a JSON content
// type, so the router runs its own Sec-Fetch-Site + X-CSRF check. Only the upload moves; every
// other progress route stays below and is fully protected.
app.use('/api/v1', progressUploadRoutes);

// The public marketplace reads. Mounted ABOVE csrfProtection because every route here is a
// GET that must answer with no session, no cookie and no CSRF header — a search engine, a shared
// link opened in a fresh browser, a person who has never signed up. There is NO WRITE in this
// router, which is what makes the placement safe rather than an exception: CSRF protects
// state-changing requests, and there is no state to change.
// The cover UPLOAD joins media, chat attachments and progress photos above the global CSRF
// middleware, for the same reason and with the same compensation: a multipart body cannot carry
// a JSON content type, so it runs multipartCsrf instead. Only the upload moves; the cover DELETE
// has no body at all and stays below with the rest of the composer.
app.use('/api/v1', composeUploadRoutes);

app.use('/api/v1', publicRoutes);

app.use(csrfProtection);
// The coach's side of that same marketplace, and it sits on the OTHER side of this line on
// purpose. `publicRoutes` above is anonymous GETs with nothing to protect; every route here is an
// authenticated write by a named coach, so it takes all three CSRF layers like the rest of the
// product. Two files, one feature, opposite ends of the stack — which is the whole reason the
// composer is not a few more handlers inside `public/routes.js`.
app.use('/api/v1', composeRoutes);
// Reporting and the queue that acts on it. Below csrfProtection like every other write, and split
// by audience rather than by file size: reporting is requireAuth with no role gate, because the
// person who finds something is rarely a coach.
app.use('/api/v1', moderationRoutes);
app.use(AUTH_PATH, authRoutes);
app.use('/api/v1', privacyRoutes);
  app.use('/api/v1', themeRoutes);
app.use('/api/v1', exerciseRoutes);
app.use('/api/v1', adminRoutes);
app.use('/api/v1', coachingRoutes);
app.use('/api/v1', onboardingRoutes);
app.use('/api/v1', planRoutes);
app.use('/api/v1', logRoutes);
app.use('/api/v1', chatRoutes);
app.use('/api/v1', notificationRoutes);
app.use('/api/v1', icsRoutes);
app.use('/api/v1', nutritionRoutes);
app.use('/api/v1', progressRoutes);
app.use('/api/v1', coinRoutes);

app.use((req, res) => sendError(res, 404, ERR.NOT_FOUND, 'not found'));
app.use(errorHandler(logger));

const server = app.listen(env.PORT, () =>
  logger.info({ port: env.PORT, app: env.APP_NAME }, 'server started'),
);

// A bind failure must kill the process. Without this the supervisor sees a live child that
// serves nothing, and the real error scrolls past in the terminal.
server.on('error', (err) => {
  logger.fatal({ err, port: env.PORT }, 'could not bind port');
  process.exit(1);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await db.closePool(); // drain the worker pool so no query is cut off mid-transaction
    process.exit(0);
  });
  // Hard exit if draining hangs — a stuck shutdown holds the port and blocks the next start.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
