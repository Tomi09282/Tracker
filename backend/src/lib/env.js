// src/lib/env.js — imported FIRST in server.js. Fails fast, by name, before anything else runs.
// A misconfigured boot must never reach the point where it opens a database or binds a port.
import 'dotenv/config';
import { z } from 'zod';

// Node's base64url decoder silently drops invalid characters, which could shrink an HS256 key
// below the 256-bit floor — so validate the format AND the decoded length.
const base64url32 = (name) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{43,}$/, `${name} must be 32+ random bytes base64url-encoded`)
    .refine((s) => Buffer.from(s, 'base64url').length >= 32, `${name} decodes to fewer than 32 bytes`);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    // Number of trusted reverse-proxy hops. MUST stay 0 when the server is directly exposed:
    // trusting a proxy that is not there lets any client spoof X-Forwarded-For, rotate req.ip
    // and walk straight through the per-IP rate limits on the auth routes.
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    // Display name comes from config, never from a hardcoded string in the UI.
    APP_NAME: z.string().min(1).default('Tracker'),

    DB_PATH: z.string().min(1),
    DB_MASTER_KEY: z.string().min(32, 'must be at least 32 chars — generate it randomly'),
    DB_KEY_SALT: z.string().min(16, 'must be at least 16 chars'),

    JWT_SECRET: base64url32('JWT_SECRET'),
    JWT_KID: z.string().min(1),
    JWT_SECRET_PREV: base64url32('JWT_SECRET_PREV').optional(),
    JWT_KID_PREV: z.string().min(1).optional(),
    JWT_ISSUER: z.string().min(1).default('tracker'),
    JWT_AUDIENCE: z.string().min(1).default('tracker-app'),

    LOG_LEVEL: z.string().default('info'),
    DB_POOL_THREADS: z.coerce.number().int().min(1).max(64).optional(),

    // Exact-origin allowlist. Empty in dev, where Vite proxies /api and everything is
    // same-origin; a wildcard with credentials is never acceptable.
    CORS_ALLOWED_ORIGINS: z.string().default(''),

    /*
     * The webhook signing secret. OPTIONAL, deliberately: the product runs perfectly well with no
     * payment processor configured — that is most of its history — and requiring this at boot
     * would make every developer machine and every test run need a Stripe account.
     *
     * What must NOT happen is the route quietly accepting anything when it is absent, so
     * `verifyWebhook` returns `no_secret_configured` and the endpoint refuses. Optional to BOOT,
     * mandatory to ACCEPT.
     *
     * `whsec_` is the prefix Stripe uses; checking it turns the commonest configuration mistake —
     * pasting the API key into this variable — into a boot failure instead of a signature that
     * never verifies and a webhook queue that silently backs up for a week.
     */
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .min(16)
      .regex(/^whsec_/, 'STRIPE_WEBHOOK_SECRET must start with whsec_ — this is the SIGNING secret, not an API key')
      .optional(),
  })
  .superRefine((e, ctx) => {
    // The rotation keyring is a Map keyed by kid and only engages when BOTH prev vars are set.
    // Half a pair means tokens signed with the old key silently fail during rotation; a reused
    // kid would overwrite the CURRENT secret. Both are caught here, at boot, not at 3am.
    if (!!e.JWT_SECRET_PREV !== !!e.JWT_KID_PREV) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET_PREV'],
        message: 'JWT_SECRET_PREV and JWT_KID_PREV must be set together',
      });
    }
    if (e.JWT_KID_PREV && e.JWT_KID_PREV === e.JWT_KID) {
      ctx.addIssue({ code: 'custom', path: ['JWT_KID_PREV'], message: 'must differ from JWT_KID' });
    }
  });

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Name the offending variables only — a config error must never print a secret's value.
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  console.error(`FATAL: invalid environment — ${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ALLOWED_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
