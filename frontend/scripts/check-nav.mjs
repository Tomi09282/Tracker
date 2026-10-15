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
 * ═══ A WAY BACK IS NOT A WAY IN ════════════════════════════════════════════════════════════════
 *
 * The door rule used to count ANY link to a route. Measured on the code it was green on:
 *
 *   /compose   five "doors" — every one of them a back-link in its own children
 *              (PostEditorPage, ProfileEditorPage). Nothing else in the app links to it.
 *   /m         two — the back-links of the post page and the coach profile page.
 *   /library   three — one real door on Home, two back-links from the exercise page.
 *
 * So two of the six screens this gate was written for were still unreachable on a phone, with the
 * gate green. And a link to a CHILD counted as a door to its parent, so `/coach/plans` would have
 * stayed "reachable" with its only real door deleted.
 *
 * The rule now: a door to a route is a link to exactly that route, found OUTSIDE the route's own
 * subtree — outside its own page file and the page file of every route below it. Page files come
 * from the imports of `router.tsx`. A tab is always a door. Only a parameterised route is reached
 * through its family (`/library/1467` reaches `/library/:id`).
 *
 * `/compose` and `/m` are red under that rule, which is the truth. Whether they get a door is a
 * product decision (owner question Q5: no new door for now), so they carry OPEN exemptions — and
 * an open exemption is printed on every run until it is closed. "We will add the link later" is
 * not a reason this gate accepts silently.
 *
 * Run: npm run check:nav
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = 'src';
const NAV_TABS_FILE = path.join(SRC, 'app/navTabs.ts');
const BOTTOM_NAV_FILE = path.join(SRC, 'ui/nav/BottomNav.tsx');
const ROUTER_FILE = path.join(SRC, 'app/router.tsx');
const ROUTE_META_FILE = path.join(SRC, 'app/routeMeta.ts');
const LOCALES = ['hu', 'en', 'de'];

/** How many tabs each role's bar carries. The mockups are the source; this is the assertion. */
const EXPECTED_COUNT = { user: 5, coach: 6, admin: 7 };

/**
 * Routes that are allowed to have no inbound link, each with the reason.
 *
 * A route earns a place here only when a person genuinely arrives at it by a means other than a
 * link — a redirect, an external URL, a deep link from an e-mail. "We will add the link later" is
 * not a reason; that is the defect this file exists to catch.
 *
 * `open: true` marks the one kind of entry that IS a missing door: a product gap waiting for an
 * owner's decision. It is printed on every run, with the question it waits for, and it fails the
 * build the day the route gets a real door — so the entry cannot outlive its reason.
 */
const NO_INBOUND_BY_DESIGN = new Map([
  ['/login', { reason: 'RequireAuth redirects here; it is the destination of being logged out, not a link' }],
  ['/register', { reason: 'reached from /login, and from an invite URL a coach sends out of band' }],
  ['/m/p/:publicId', { reason: 'a public post URL that is shared; also reached from the /m feed' }],
  ['/m/c/:handle', { reason: 'a public coach profile URL that is shared; also reached from a post' }],
  ['/library/:id', { reason: 'a detail route reached by tapping a row in /library' }],
  ['/coach/clients/:id', { reason: 'reached by tapping a client in the /coach roster' }],
  ['/coach/plans/:id', { reason: 'reached by tapping a plan in /coach/plans' }],
  ['/compose/posts/:publicId', { reason: 'reached by tapping a post in the compose desk' }],
  ['/onboarding', { reason: 'sent to a new client by their coach; not a destination anyone browses to' }],
  ['/playground', { reason: 'an internal QA surface, reachable from the command palette on the desktop where QA happens' }],
  [
    '/compose',
    {
      open: true,
      question: 'Q5',
      reason:
        'the coach\'s marketplace desk has no way in on a phone — only the desktop command palette lists it. ' +
        'Owner, 2026-10-12: it stays reachable by URL only for now; no new door is invented',
    },
  ],
  [
    '/m',
    {
      open: true,
      question: 'Q5',
      reason:
        'the public marketplace is linked only from its own post and profile pages (and the desktop command palette). ' +
        'Owner, 2026-10-12: it stays reachable by URL only for now; no new door is invented',
    },
  ],
]);

/**
 * Doors that must exist in a NAMED file, each with the reason.
 *
 * The plain door rule is satisfied by any link from anywhere. Some doors are a decision, and a
 * decision has to survive the refactor that finds "one of two links" redundant:
 *
 *   route → { from: '<file under src>', reason }
 *
 * The idle Edzés tab redirects to the library (owner decision D2, step F16): that redirect is the
 * door the tab bar gives the library, and it must not be refactored away.
 */
export const REQUIRED_DOORS = new Map([
  ['/library', { from: 'features/workout/WorkoutPlayer.tsx', reason: 'the Edzés tab lands here when no session runs (D2)' }],
]);

async function main() {
  const problems = [];
  const notes = [];
  const read = (f) => fs.readFileSync(f, 'utf8');
  /* Only CODE is read where the rule is "the file mentions X": a comment that explains the inset
     is not the inset. (The safe-area test below was satisfied by any comment that named it.) */
  const codeOf = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* ── 1. the table declares the three roles at the three counts ─────────────────────────────── */

  const navSrc = read(NAV_TABS_FILE);
  for (const role of Object.keys(EXPECTED_COUNT)) {
    const m = navSrc.match(new RegExp(`\\b${role}:\\s*\\[([\\s\\S]*?)\\n\\s*\\]`));
    if (!m) {
      problems.push(`navTabs.ts declares no "${role}" tab list`);
      continue;
    }
    const count = [...m[1].matchAll(/\{\s*to:/g)].length;
    if (count !== EXPECTED_COUNT[role]) {
      problems.push(
        `the ${role} bar has ${count} tabs, and the approved design has ${EXPECTED_COUNT[role]}.\n` +
          '      If the design changed, change EXPECTED_COUNT here in the same commit — the count is\n' +
          '      a decision, and a decision that lives in only one of two places drifts.',
      );
    }
  }

  /* ── 2. every tab points at a route that exists ────────────────────────────────────────────── */

  const routerSrc = read(ROUTER_FILE);
  // Router paths appear as `path: '/x'` at the top level and `path: 'x'` for children of '/'.
  const absolute = (p) => (p.startsWith('/') || p === '*' ? p : `/${p}`);
  const routePaths = new Set([...routerSrc.matchAll(/path:\s*'([^']+)'/g)].map(([, p]) => absolute(p)));
  if (routerSrc.includes('index: true')) routePaths.add('/');

  const tabTargets = new Set([...navSrc.matchAll(/\{\s*to:\s*'([^']+)'/g)].map((m) => m[1]));
  for (const to of tabTargets) {
    if (!routePaths.has(to)) {
      problems.push(`the bar has a tab for "${to}", and the router has no such path`);
    }
  }

  /* ── 3. every label key resolves, in every language ────────────────────────────────────────── */

  const bundles = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read(path.join(SRC, `i18n/${l}.json`)))]));
  const resolve = (bundle, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), bundle);
  const missingIn = (key) => LOCALES.filter((l) => typeof resolve(bundles[l], key) !== 'string');

  for (const key of new Set([...navSrc.matchAll(/labelKey:\s*'([^']+)'/g)].map((m) => m[1]))) {
    const missing = missingIn(key);
    if (missing.length) {
      problems.push(`the bar asks for "${key}", which is missing from: ${missing.join(', ')}`);
    }
  }

  /* ── 4. the clamp does not come back ───────────────────────────────────────────────────────── */

  const barSrc = codeOf(read(BOTTOM_NAV_FILE));
  if (/\.slice\(\s*0\s*,\s*\d+\s*\)/.test(barSrc)) {
    problems.push(
      'BottomNav clamps its tab list again.\n' +
        '      A clamp hides the failure it was written to catch: the sixth tab disappears silently\n' +
        '      instead of the build breaking. The count is asserted above; let it render what it gets.',
    );
  }

  /* ── 5. the bar reserves the HORIZONTAL safe area ──────────────────────────────────────────── */

  for (const side of ['left', 'right']) {
    if (!barSrc.includes(`safe-area-inset-${side}`)) {
      problems.push(
        `BottomNav never mentions safe-area-inset-${side} in its code.\n` +
          '      It is edge-to-edge at six and seven tabs, so in landscape on a notched phone the outer\n' +
          '      tab sits under the cutout. check-safe-area inspects the top and the bottom edge only\n' +
          '      and will not see this one. (A comment that names the inset does not count.)',
      );
    }
  }

  /* ── 6. EVERY ROUTE HAS A DOOR ─────────────────────────────────────────────────────────────── */

  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  })(SRC);
  const relOf = (file) => path.relative(SRC, file).split(path.sep).join('/');

  /*
   * ROUTE → PAGE FILE, from the router's own imports.
   *
   * A route names a component (`element: suspended(<PlanEditorPage />)`), and the router imports
   * that component from exactly one file — lazily or statically. That file is the route's page:
   * the place where a link back to the parent lives. A route this cannot map is a failure, not a
   * skip: the subtree rule would be blind for it and count its back-links as doors again.
   */
  const importedFrom = new Map(); // component → file under src
  const resolveImport = (spec) => {
    const base = path.posix.normalize(path.posix.join('app', spec));
    return [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find((f) => fs.existsSync(path.join(SRC, f)));
  };
  for (const m of routerSrc.matchAll(/const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*'([^']+)'\s*\)/g)) {
    importedFrom.set(m[1], resolveImport(m[2]));
  }
  for (const m of routerSrc.matchAll(/import\s*\{([^}]+)\}\s*from\s*'(\.[^']+)'/g)) {
    for (const name of m[1].split(',')) {
      const local = name.trim().split(/\s+as\s+/).pop().replace(/^type\s+/, '');
      if (local && !importedFrom.has(local)) importedFrom.set(local, resolveImport(m[2]));
    }
  }
  const pageOf = new Map(); // route → page file under src
  for (const m of routerSrc.matchAll(/\{\s*(?:path:\s*'([^']+)'|index:\s*true)\s*,\s*element:\s*(?:suspended\(\s*)?<(\w+)/g)) {
    const route = m[1] ? absolute(m[1]) : '/';
    if (importedFrom.get(m[2])) pageOf.set(route, importedFrom.get(m[2]));
  }

  /** The route itself and every route below it. `/` is the root of everything, so it stands alone. */
  const subtreeOf = (route) => {
    const stem = route.replace(/\/:[^/]+/g, '/:param');
    const below = (other) => {
      const o = other.replace(/\/:[^/]+/g, '/:param');
      return o === stem || (route !== '/' && o.startsWith(`${stem}/`));
    };
    return [...routePaths].filter(below);
  };
  const subtreeFiles = (route) => new Set(subtreeOf(route).map((r) => pageOf.get(r)).filter(Boolean));

  // Everything that can carry a person somewhere: a Link/NavLink target, a navigate() call, or a
  // tab — each remembered WITH the file it was found in, because where a link lives decides
  // whether it is a door.
  const links = new Map(); // target → Set<file under src | '(the bar)'>
  const addLink = (to, from) => {
    if (!links.has(to)) links.set(to, new Set());
    links.get(to).add(from);
  };
  for (const to of tabTargets) addLink(to, '(the bar)');
  for (const file of files) {
    if (file.endsWith(path.normalize('app/router.tsx'))) continue; // declaring a route is not a door
    const rel = relOf(file);
    const text = read(file);
    for (const [, to] of text.matchAll(/\bto=["']([^"'`]+)["']/g)) addLink(to, rel);
    for (const [, to] of text.matchAll(/navigate\(\s*['"]([^'"]+)['"]/g)) addLink(to, rel);
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
     * Every interpolation becomes `:param`, which is the shape the route is normalised to, so the
     * two meet in the middle instead of one guessing at the other.
     */
    for (const [, to] of text.matchAll(/\bto=\{`([^`]+)`\}/g)) {
      addLink(to.replace(/\$\{[^}]*\}/g, ':param').replace(/\/$/, ''), rel);
    }
  }

  const norm = (p) => p.replace(/\/:[^/]+/g, '/:param');
  /** Does a link to `target` open `route`? Exactly — or, for a parameterised route, into its family. */
  const opens = (target, route) => {
    if (target === route) return true;
    if (!route.includes('/:')) return false;
    if (norm(target) === norm(route)) return true;
    const stem = route.replace(/\/:[^/]+/g, '');
    return target === stem || target.startsWith(`${stem}/`);
  };
  /** Who links to a route: `outside` are doors, `inside` are its own subtree's ways back. */
  const doorsOf = (route) => {
    const own = subtreeFiles(route);
    const outside = new Set();
    const inside = new Set();
    for (const [target, sources] of links) {
      if (!opens(target, route)) continue;
      for (const from of sources) (own.has(from) ? inside : outside).add(from);
    }
    return { outside: [...outside].sort(), inside: [...inside].sort() };
  };

  for (const route of routePaths) {
    if (route === '*') continue;
    if (!pageOf.has(route)) {
      problems.push(
        `"${route}" is a route this gate cannot map to a page file.\n` +
          `      It reads \`{ path: '…', element: <Page /> }\` (or \`suspended(<Page />)\`) and the import of\n` +
          '      that component in router.tsx. Without the page file the door rule cannot tell this\n' +
          "      route's own back-links from doors. Keep that shape, or teach this gate the new one.",
      );
      continue;
    }
    const exemption = NO_INBOUND_BY_DESIGN.get(route);
    const { outside, inside } = doorsOf(route);
    if (exemption?.open && outside.length) {
      problems.push(
        `"${route}" has a door now (${outside.join(', ')}), and NO_INBOUND_BY_DESIGN still lists it as an OPEN gap.\n` +
          '      Delete the entry — an exemption that has outlived its reason waves through the next removal.',
      );
    }
    if (exemption || outside.length) continue;
    problems.push(
      `"${route}" is a route nobody links to.\n` +
        (inside.length
          ? `      Its only links are ways BACK from its own screens (${inside.join(', ')}) — a way back is not a way in.\n`
          : '') +
        '      It builds, it renders and no test fails — and on a phone there is no way to open it,\n' +
        '      because the command palette that lists it is hidden below 1024px. Give it a link from\n' +
        '      outside its own screens, or add it to NO_INBOUND_BY_DESIGN with the reason a person\n' +
        '      arrives there some other way.',
    );
  }
  for (const route of NO_INBOUND_BY_DESIGN.keys()) {
    if (!routePaths.has(route)) {
      problems.push(`NO_INBOUND_BY_DESIGN names "${route}", and the router has no such path — delete the entry`);
    }
  }

  /* ── 7. the doors that are a decision ──────────────────────────────────────────────────────── */

  for (const [route, { from, reason }] of REQUIRED_DOORS) {
    if (!routePaths.has(route)) {
      problems.push(`REQUIRED_DOORS names "${route}", and the router has no such path`);
      continue;
    }
    const present = [...links].some(([target, sources]) => opens(target, route) && sources.has(from));
    if (!present) {
      problems.push(
        `the required door to "${route}" is gone from ${from}.\n` +
          `      ${reason}.\n` +
          (fs.existsSync(path.join(SRC, from))
            ? '      Another link to the same route does not replace it: this door is a decision, and it\n' +
              '      was written down so a refactor could not quietly undo it.'
            : `      ${from} no longer exists — if the screen moved, move the entry with it.`),
      );
    }
  }

  /* ── 8. a pushed screen's parent is a real screen with a real name ─────────────────────────── */

  /*
   * `app/routeMeta.ts` (lane F11) is the one table a pushed header reads its parent from:
   *
   *   export const ROUTE_META = { '/coins': { parent: '/settings', parentLabelKey: 'nav.profile' }, … }
   *
   * The back target, the eyebrow over the title and the lit tab are one fact in three places. This
   * leg holds two of them to the router and the bundles; check-nav-active holds the third. The
   * table does not exist until the shell lands, and the leg says so on every run.
   */
  if (fs.existsSync(ROUTE_META_FILE)) {
    const table = (await import(pathToFileURL(path.resolve(ROUTE_META_FILE)).href)).ROUTE_META;
    const rows = table && typeof table === 'object' ? Object.entries(table) : [];
    if (rows.length === 0) {
      problems.push(
        'app/routeMeta.ts exports no ROUTE_META table (route → { parent, parentLabelKey }) — this leg is blind.\n' +
          '      If the table changed its name or its shape, this gate and check-nav-active change with it.',
      );
    }
    for (const [route, meta] of rows) {
      if (!routePaths.has(route)) problems.push(`routeMeta has a row for "${route}", and the router has no such path`);
      if (typeof meta?.parent !== 'string' || !routePaths.has(meta.parent)) {
        problems.push(`routeMeta sends "${route}" back to "${meta?.parent}", which is not a router path`);
      }
      if (typeof meta?.parentLabelKey !== 'string') {
        problems.push(`routeMeta names no parentLabelKey for "${route}" — the header would have a back arrow with no name`);
      } else if (missingIn(meta.parentLabelKey).length) {
        problems.push(
          `routeMeta labels the parent of "${route}" with "${meta.parentLabelKey}", which is missing from: ${missingIn(meta.parentLabelKey).join(', ')}`,
        );
      }
    }
    notes.push(`${rows.length} routeMeta parent(s) checked against the router and the bundles`);
  } else {
    notes.push('routeMeta leg waiting for src/app/routeMeta.ts');
  }

  /* ── report ────────────────────────────────────────────────────────────────────────────── */

  const counts = Object.entries(EXPECTED_COUNT).map(([r, n]) => `${r} ${n}`).join(' · ');
  const open = [...NO_INBOUND_BY_DESIGN].filter(([, e]) => e.open);
  console.log(
    `check-nav: ${routePaths.size - 1} routes, ${tabTargets.size} distinct tab targets, ` +
      `${NO_INBOUND_BY_DESIGN.size} exempt from the reachability rule, ${open.length} of them OPEN, ` +
      `${REQUIRED_DOORS.size} required door(s) (${counts})`,
  );
  for (const note of notes) console.log(`           ${note}`);
  // Printed on EVERY run, green or red: an open exemption is a known hole, and a hole that is
  // only written in a script is a hole nobody is looking at.
  for (const [route, e] of open) {
    console.log(`check-nav: OPEN [${e.question}] "${route}" has no door on a phone, URL only — ${e.reason}`);
  }

  if (problems.length) {
    console.error(`\ncheck-nav FAILED — ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ${p}\n`);
    process.exit(1);
  }
  console.log('check-nav: OK — the bar matches the design, and every screen has a door or a written reason');
}

// Importing this file (`verify-gates.mjs` reads REQUIRED_DOORS from it) must not run the gate.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
