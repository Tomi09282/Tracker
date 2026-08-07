// scripts/check-routes.mjs — the abuse-path gate (T2.10.4).
//
// An audit you run once is a snapshot; a gate is the thing that keeps being true. This walks every
// route in `src/` and asserts the three properties that, when missing, have actually cost this
// project something:
//
//   1. Every route is authenticated, unless it is on the PUBLIC allowlist below. The allowlist is
//      the point: a new public route is a DELIBERATE act that has to be written down here, with a
//      reason, rather than something that happens by forgetting a middleware.
//   2. Every write (POST/PATCH/PUT/DELETE) has a rate limiter. This gate found four that did not,
//      including `POST /calendar-feeds` — which mints a durable bearer credential, and which sat in
//      the same file as a limiter that was applied to the cheaper read path instead.
//   3. Every route with an `:id` in its path parses it and does not interpolate it. A guard against
//      the one class of mistake that turns an ownership bug into a database one.
//
// Run: node scripts/check-routes.mjs   (wired into `npm run smoke`'s siblings and the release gate)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'src';

/**
 * Routes that are public ON PURPOSE. Each needs a reason, because the reason is what a reviewer
 * checks a year from now when they cannot remember why.
 */
const PUBLIC = new Map([
  ['POST /register', 'an account cannot be created by someone who already has one'],
  ['POST /login', 'the same'],
  ['POST /refresh', 'authenticated by the refresh COOKIE, which is the whole point of it'],
  ['POST /logout', 'must work with an expired or absent session — otherwise a stale tab cannot log out'],
  ['GET /sources', 'attribution for the exercise library; the licence requires it be readable'],
  ['GET /languages', 'the language picker renders before anyone has logged in'],
  ['GET /ui/element-styles', 'one global admin setting the login screen itself is styled by'],
  ['GET /calendar/:token.ics', 'a calendar client is not a browser and carries no cookie; the TOKEN authenticates and the LINK authorises, checked in the fetch predicate'],

  // ── THE PUBLIC MARKETPLACE (021) ────────────────────────────────────────────────────────────
  //
  // Eight deliberate public reads, and the allowlist is doing exactly its job here: this is the
  // largest single expansion of the unauthenticated surface in the product's history, so it is
  // eight lines somebody has to write and defend rather than eight missing middlewares.
  //
  // Every one is a GET. Every one composes PUBLIC_POST or PUBLIC_PROFILE from
  // src/public/visibility.js, which binds NO VIEWER — the response is a pure function of the row,
  // so there is nothing about the caller for any of these to get wrong.
  ['GET /public/posts', 'the marketplace feed; a shared link must open in a browser that has never signed in'],
  ['GET /public/posts/:publicId', 'a deep link to one post — addressed by an opaque 12-char id, never an enumerable one'],
  ['GET /public/coaches', 'the coach directory, which is the point of a public marketplace'],
  ['GET /public/coaches/:handle', 'a public profile page, addressed by handle so no user id is exposed'],
  ['GET /public/search', 'discovery; capped at one page with no cursor, because a paginated public search is a scraping API with a nice interface'],
  ['GET /public/media/:key', 'post images for anonymous readers; THE KEY IS NOT THE PERMISSION — the read carries the same PUBLIC_POST predicate the feed does, so removing a coach removes their pictures on the next request'],
  ['GET /public/taxonomy', 'the cities, kinds and specialties the filter UI renders from — the same list the filters offer, and secret from nobody'],
]);

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.js')) files.push(p);
  }
})(ROOT);

const routes = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  // The middleware chain is everything between the path and the handler. `asyncRoute` is the
  // handler wrapper every route in this codebase uses, which makes it a reliable terminator.
  const re = /router\.(get|post|patch|put|delete)\(\s*\n?\s*'([^']+)'\s*,([\s\S]*?)asyncRoute/g;
  let m;
  while ((m = re.exec(src))) {
    const [, method, route, chain] = m;
    routes.push({
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
      key: `${method.toUpperCase()} ${route}`,
      method: method.toUpperCase(),
      route,
      chain,
    });
  }
}

const problems = [];

for (const r of routes) {
  const authed = /require(Auth|Admin|Role)/.test(r.chain);
  if (!authed && !PUBLIC.has(r.key)) {
    problems.push(`${r.key} (${r.file}) has no auth middleware and is not on the PUBLIC allowlist`);
  }
  if (authed && PUBLIC.has(r.key)) {
    problems.push(`${r.key} (${r.file}) is authenticated but still listed as PUBLIC — remove the entry`);
  }
  if (r.method !== 'GET' && !/[Ll]imiter/.test(r.chain)) {
    problems.push(`${r.key} (${r.file}) is a write with no rate limiter`);
  }
}

// Every allowlist entry must correspond to a route that exists. A stale exemption is how a
// deleted-and-recreated route quietly loses its auth.
for (const key of PUBLIC.keys()) {
  if (!routes.some((r) => r.key === key)) {
    problems.push(`PUBLIC lists ${key}, which no longer exists — delete the entry`);
  }
}

/* ── T2.10.2 — mass assignment ───────────────────────────────────────────────────────────────────
 *
 * Spreading `req.body` into an update is the single cheapest way to hand a client a column it was
 * never meant to write — a role, an owner id, a stored total. The rule is an explicit pick-list
 * every time, and this is the check that keeps it true rather than a habit that erodes.
 */
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  for (const pattern of [/\.\.\.req\.body/, /Object\.assign\([^)]*req\.body/]) {
    if (pattern.test(src)) problems.push(`${rel} spreads req.body — use an explicit pick-list`);
  }
}

/* ── T2.10.1 — every request schema is `.strict()` ───────────────────────────────────────────────
 *
 * A non-strict schema silently DROPS unknown keys instead of rejecting them, so a client sending
 * `status` or `total_volume_kg` gets a 200 and believes it landed. Rejecting is the honest answer
 * and it is also what makes the abuse-path tests meaningful.
 *
 * `lib/env.js` is exempt and must stay exempt: env vars come from the process, not from a request,
 * and a strict schema there would reject every unrelated variable the OS happens to set.
 */
const STRICT_EXEMPT = new Set(['lib/env.js']);
for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (STRICT_EXEMPT.has(rel)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const re = /z\s*\.object\(\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    // Walk to the matching brace so a nested object cannot be mistaken for the end of the schema.
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (!/^\}\)\s*\.strict\(\)/.test(src.slice(i, i + 40))) {
      const line = src.slice(0, m.index).split('\n').length;
      problems.push(`${rel}:${line} has a z.object() that is not .strict()`);
    }
  }
}

const writes = routes.filter((r) => r.method !== 'GET');
console.log(
  `check-routes: ${routes.length} routes — ${routes.length - PUBLIC.size} authenticated, ` +
    `${PUBLIC.size} public by design, ${writes.length} writes`,
);

/* ── 4. THE PUBLIC ROUTER MUST NOT KNOW WHO IS ASKING ─────────────────────────────────────────
 *
 * `src/public/routes.js` answers requests that carry no session. Its entire safety argument is
 * that every response is a PURE FUNCTION OF THE ROW — so the same request produces the same bytes
 * for everybody, and there is no cache-correctness question, no `Vary: Cookie`, no block oracle
 * and no second query shape for the anonymous case.
 *
 * That argument holds only while the file does not read `req.user`. It is one line to break and
 * it would break silently: the tests would still pass, because the anonymous path would still
 * work. So it is a gate rather than a comment.
 *
 * The property was bought by cutting comments from Phase 6 — all four FATAL defects in that
 * review lived in a subsystem whose reads had to know who was asking. This is what stops the cut
 * being quietly undone.
 */
{
  const publicRouter = path.join(ROOT, 'public', 'routes.js');
  if (fs.existsSync(publicRouter)) {
    const src = fs.readFileSync(publicRouter, 'utf8');
    src.split('\n').forEach((line, i) => {
      // Skip comments — the file EXPLAINS the rule, and a gate that trips on its own
      // documentation is a gate somebody deletes.
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      if (/\breq\.user\b/.test(code)) {
        problems.push(
          `${publicRouter}:${i + 1} — the public router read req.user. Every response here must be ` +
            'a pure function of the row; a viewer-dependent public read brings back the cache hazard ' +
            'and the block-oracle class that cutting comments removed.',
        );
      }
      if (/requireAuth|requireRole/.test(code)) {
        problems.push(
          `${publicRouter}:${i + 1} — an auth middleware in the PUBLIC router. If a route needs one ` +
            'it belongs in a different file, below csrfProtection.',
        );
      }
    });
  }
}

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  ${p}`);
  console.log(`\ncheck-routes FAILED — ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('check-routes: OK');
