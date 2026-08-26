/**
 * The bottom bar, and the promise that every screen has a door.
 *
 * ═══ WHY THIS GATE EXISTS ══════════════════════════════════════════════════════════════════════
 *
 * A Phase 8 audit measured six FINISHED features with no way in on a phone: /progress, /coins,
 * /compose, /compose/profile, /m and /playground. Every one had a working route, a working role
 * check and passing tests. Their only in-app link was the command palette, which is `hidden lg:flex`
 * and opens on Cmd+K — so on the device this product is actually used on, they did not exist.
 *
 * Nothing caught it, because nothing could: a route with a rendering component and a passing build
 * is indistinguishable from a reachable one unless something asks who links to it.
 *
 * Fixing the bar once would not stop it happening again. The next tab added, the next screen
 * split out, the next "this belongs in Settings" refactor re-opens it silently. So the reachability
 * rule is a gate, not a commit.
 *
 * Run: npm run check:nav
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const NAV_TABS_FILE = path.join(SRC, 'app/navTabs.ts');
const BOTTOM_NAV_FILE = path.join(SRC, 'ui/nav/BottomNav.tsx');
const ROUTER_FILE = path.join(SRC, 'app/router.tsx');
const LOCALES = ['hu', 'en', 'de'];

/** How many tabs each role's bar carries. The mockups are the source; this is the assertion. */
const EXPECTED_COUNT = { user: 5, coach: 6, admin: 7 };

/**
 * Routes that are allowed to have no inbound link, each with the reason.
 *
 * A route earns a place here only when a person genuinely arrives at it by a means other than a
 * link — a redirect, an external URL, a deep link from an e-mail. "We will add the link later" is
 * not a reason; that is the defect this file exists to catch.
 */
const NO_INBOUND_BY_DESIGN = new Map([
  ['/login', 'RequireAuth redirects here; it is the destination of being logged out, not a link'],
  ['/register', 'reached from /login, and from an invite URL a coach sends out of band'],
  ['/m/p/:publicId', 'a public post URL that is shared; also reached from the /m feed'],
  ['/m/c/:handle', 'a public coach profile URL that is shared; also reached from a post'],
  ['/library/:id', 'a detail route reached by tapping a row in /library'],
  ['/coach/clients/:id', 'reached by tapping a client in the /coach roster'],
  ['/coach/plans/:id', 'reached by tapping a plan in /coach/plans'],
  ['/compose/posts/:publicId', 'reached by tapping a post in the compose desk'],
  ['/onboarding', 'sent to a new client by their coach; not a destination anyone browses to'],
  ['/playground', 'an internal QA surface, reachable from the command palette on the desktop where QA happens'],
]);

const problems = [];
const read = (f) => fs.readFileSync(f, 'utf8');

/* ── 1. the table declares the three roles at the three counts ───────────────────────────────── */

const navSrc = read(NAV_TABS_FILE);
const roleBlocks = {};
for (const role of Object.keys(EXPECTED_COUNT)) {
  const m = navSrc.match(new RegExp(`\\b${role}:\\s*\\[([\\s\\S]*?)\\n\\s*\\]`));
  if (!m) {
    problems.push(`navTabs.ts declares no "${role}" tab list`);
    continue;
  }
  roleBlocks[role] = m[1];
  const count = [...m[1].matchAll(/\{\s*to:/g)].length;
  if (count !== EXPECTED_COUNT[role]) {
    problems.push(
      `the ${role} bar has ${count} tabs, and the approved design has ${EXPECTED_COUNT[role]}.\n` +
        '      If the design changed, change EXPECTED_COUNT here in the same commit — the count is\n' +
        '      a decision, and a decision that lives in only one of two places drifts.',
    );
  }
}

/* ── 2. every tab points at a route that exists ──────────────────────────────────────────────── */

const routerSrc = read(ROUTER_FILE);
// Router paths appear as `path: '/x'` at the top level and `path: 'x'` for children of '/'.
const routePaths = new Set(
  [...routerSrc.matchAll(/path:\s*'([^']+)'/g)].map(([, p]) => (p.startsWith('/') || p === '*' ? p : `/${p}`)),
);
if (routerSrc.includes('index: true')) routePaths.add('/');

const tabTargets = new Set([...navSrc.matchAll(/\{\s*to:\s*'([^']+)'/g)].map((m) => m[1]));
for (const to of tabTargets) {
  if (!routePaths.has(to)) {
    problems.push(`the bar has a tab for "${to}", and the router has no such path`);
  }
}

/* ── 3. every label key resolves, in every language ──────────────────────────────────────────── */

const bundles = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read(path.join(SRC, `i18n/${l}.json`)))]));
const resolve = (bundle, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), bundle);

for (const key of new Set([...navSrc.matchAll(/labelKey:\s*'([^']+)'/g)].map((m) => m[1]))) {
  const missing = LOCALES.filter((l) => typeof resolve(bundles[l], key) !== 'string');
  if (missing.length) {
    problems.push(`the bar asks for "${key}", which is missing from: ${missing.join(', ')}`);
  }
}

/* ── 4. the clamp does not come back ─────────────────────────────────────────────────────────── */

const barSrc = read(BOTTOM_NAV_FILE);
if (/\.slice\(\s*0\s*,\s*\d+\s*\)/.test(barSrc)) {
  problems.push(
    'BottomNav clamps its tab list again.\n' +
      '      A clamp hides the failure it was written to catch: the sixth tab disappears silently\n' +
      '      instead of the build breaking. The count is asserted above; let it render what it gets.',
  );
}

/* ── 5. the bar reserves the HORIZONTAL safe area ────────────────────────────────────────────── */

for (const side of ['left', 'right']) {
  if (!barSrc.includes(`safe-area-inset-${side}`)) {
    problems.push(
      `BottomNav never mentions safe-area-inset-${side}.\n` +
        '      It is edge-to-edge at six and seven tabs, so in landscape on a notched phone the outer\n' +
        '      tab sits under the cutout. check-safe-area inspects top-0 and bottom-0 only and will\n' +
        '      not see this one.',
    );
  }
}

/* ── 6. EVERY ROUTE HAS A DOOR ───────────────────────────────────────────────────────────────── */

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(SRC);

// Everything that can carry a person somewhere: a Link/NavLink target, a navigate() call, or a tab.
const linkTargets = new Set(tabTargets);
for (const file of files) {
  if (file.endsWith(path.normalize('app/router.tsx'))) continue; // declaring a route is not a door
  const text = read(file);
  for (const [, to] of text.matchAll(/\bto=["']([^"'`]+)["']/g)) linkTargets.add(to);
  for (const [, to] of text.matchAll(/navigate\(\s*['"]([^'"]+)['"]/g)) linkTargets.add(to);
  /*
   * `to={`/library/${id}`}` reaches a whole parameterised family.
   *
   * THE WHOLE literal, not the prefix before the first interpolation. The earlier rule captured
   * only what came before it, which is correct exactly when the parameter is LAST — and silently
   * wrong the moment a segment follows it. A link to the standalone conversation screen was read
   * as a link to `/coach/clients/`, so that route was reported unreachable while a link to it sat
   * two files away. A gate that refuses correct code is a gate somebody switches off, which is
   * worse than the blind spot it was written to close.
   *
   * Every interpolation becomes `:param`, which is the shape `reachable` already normalises routes
   * to, so the two meet in the middle instead of one guessing at the other.
   */
  for (const [, to] of text.matchAll(/\bto=\{`([^`]+)`\}/g)) {
    linkTargets.add(to.replace(/\$\{[^}]*\}/g, ':param').replace(/\/$/, ''));
  }
}

const reachable = (route) => {
  if (linkTargets.has(route)) return true;
  // A parameterised route is reachable if anything links into its family.
  // Compare with every parameter reduced to the same placeholder on BOTH sides, so a link whose
  // parameter sits mid-path matches the route whose parameter sits there too.
  const norm = (p) => p.replace(/\/:[^/]+/g, '/:param');
  if ([...linkTargets].some((t) => norm(t) === norm(route))) return true;
  const stem = route.replace(/\/:[^/]+/g, '');
  return [...linkTargets].some((t) => t === stem || t.startsWith(`${stem}/`));
};

for (const route of routePaths) {
  if (route === '*' || NO_INBOUND_BY_DESIGN.has(route)) continue;
  if (!reachable(route)) {
    problems.push(
      `"${route}" is a route nobody links to.\n` +
        '      It builds, it renders and no test fails — and on a phone there is no way to open it,\n' +
        '      because the command palette that lists it is hidden below 1024px. Give it a link, or\n' +
        '      add it to NO_INBOUND_BY_DESIGN with the reason a person arrives there some other way.',
    );
  }
}

/* ── report ──────────────────────────────────────────────────────────────────────────────────── */

const counts = Object.entries(EXPECTED_COUNT).map(([r, n]) => `${r} ${n}`).join(' · ');
console.log(
  `check-nav: ${routePaths.size - 1} routes, ${tabTargets.size} distinct tab targets, ` +
    `${NO_INBOUND_BY_DESIGN.size} exempt from the reachability rule (${counts})`,
);

if (problems.length) {
  console.error(`\ncheck-nav FAILED — ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}
console.log('check-nav: OK — the bar matches the design, and every screen has a door');
