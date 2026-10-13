// scripts/check-nav-active.mjs — the bar answers "where am I", on every route, exactly once.
//
// ═══ WHY THIS EXISTS ═══════════════════════════════════════════════════════════════════════════
//
// `check-nav.mjs` proves every route has a DOOR. It says nothing about what the bar does once you
// are through it, and that is where two separate defects lived:
//
//   /library/:id    an exercise detail page, reached by tapping a tab, lit NO tab at all. Six
//                   cells, all idle, on a screen the bar itself had sent the user to.
//   /onboarding     the first screen a brand-new member ever sees, with `end: true` on the index
//                   tab stopping `/` from matching, so the bar was blank there too.
//
// Both were found by looking at the screen. Neither breaks a build, throws, or fails a gate.
//
// ═══ AND WHY IT NEEDS NO DOM ═══════════════════════════════════════════════════════════════════
//
// "Which tab is active" is a fact about a pathname and a tab table — arithmetic over strings, not
// a rendering question. So the rule lives in `navTabs.ts` as `isTabActive`, the bar consumes it,
// and this asserts over it directly. Node 24 strips the types on import, so there is no framework
// and no new dependency — the same choice `check-interval.mjs` and `check-tokens.mjs` make.
//
// What it CANNOT check is that the bar renders the answer it computes, or that `aria-current`
// follows. That needs a DOM and this project has no DOM harness; the component carries a comment
// saying the two must move together, and this guards the half that is guardable.
//
// ═══ THE TABLE WAS INCOMPLETE, AND NOTHING SAID SO ═════════════════════════════════════════════
//
// The table below is written by hand, on purpose. It was also the only list of routes this gate
// knew, so a route nobody typed into it was never asked about. Computed with the real function
// when this was found: `/notifications` and `/playground` lit NOTHING, for every role, and the
// gate had been green over both — the same defect it was written for, twice more.
//
// So the router now supplies the LIST of routes, and only the list: every screen inside the
// signed-in layout must have a row for every role whose bar could own it, or a written reason for
// lighting nothing. The ANSWER — which tab — stays a hand-written second opinion.
//
// Run: node scripts/check-nav-active.mjs   (wired into `npm run build`)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NAV_TABS, isTabActive, tabsForRole } from '../src/app/navTabs.ts';

const ROUTER_FILE = 'src/app/router.tsx';
const ROUTE_META_FILE = 'src/app/routeMeta.ts';
const ROLES = ['user', 'coach', 'admin'];

let passed = 0;
const failures = [];
const notes = [];
const LF = String.fromCharCode(10);

const check = (name, ok, detail = '') => {
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? `  (${detail})` : ''}`);
  }
};

/** Which tabs light for this role on this path. */
const lit = (role, pathname) => tabsForRole(role).filter((t) => isTabActive(t, pathname)).map((t) => t.to);

/*
 * EVERY ROUTE A PERSON CAN LAND ON, and the tab that must own it.
 *
 * Written out rather than derived from the router, deliberately: derived from the same source, the
 * table would agree with the code by construction and assert nothing. This is the SECOND opinion —
 * somebody's statement of where each screen belongs — and it is supposed to be able to disagree.
 *
 * Three lists, by who has the tab: every bar, the bars with an Edző tab, the bar with an Admin
 * tab. `/notifications` belongs to Kezdőlap for everyone (owner question Q6: the bell lives in
 * Home's header, and the header of the notifications screen names Kezdőlap as its parent).
 */
const EVERY_BAR = [
  ['/', '/'],
  ['/onboarding', '/'],
  ['/notifications', '/'],
  ['/workout', '/workout'],
  ['/workout/42', '/workout'],
  ['/library', '/workout'],
  ['/library/1467', '/workout'],
  ['/nutrition', '/nutrition'],
  ['/progress', '/progress'],
  ['/settings', '/settings'],
  ['/coins', '/settings'],
];
const COACH_BARS = [
  ['/coach', '/coach'],
  ['/coach/clients/10', '/coach'],
  ['/coach/clients/10/chat', '/coach'],
  ['/coach/plans', '/coach'],
  ['/coach/plans/3', '/coach'],
  ['/compose', '/coach'],
  ['/compose/profile', '/coach'],
  ['/compose/posts/p_4f2a', '/coach'],
];
const ADMIN_BAR = [
  ['/admin', '/admin'],
  ['/admin/styles', '/admin'],
];
const EXPECT = [
  ...EVERY_BAR.map((row) => ['user', ...row]),
  ...[...EVERY_BAR, ...COACH_BARS].map((row) => ['coach', ...row]),
  ...[...EVERY_BAR, ...COACH_BARS, ...ADMIN_BAR].map((row) => ['admin', ...row]),
];

for (const [role, pathname, owner] of EXPECT) {
  const active = lit(role, pathname);
  check(
    `${role} on ${pathname} lights exactly one tab`,
    active.length === 1,
    active.length === 1 ? '' : `lit ${active.length}: ${active.join(', ') || 'nothing'}`,
  );
  check(`${role} on ${pathname} lights ${owner}`, active[0] === owner, `lit ${active[0] ?? 'nothing'}`);
}

/*
 * NO TAB MAY OWN ANOTHER TAB'S OWN ROUTE.
 *
 * An `owns` prefix that swallows a sibling is the failure this shape invites — `/coach` owning
 * `/compose` is intended, `/coach` owning `/coach/plans` would be harmless, but a prefix like `/`
 * or `/c` would quietly light two cells at once and the bar would stop meaning anything.
 */
for (const [role, tabs] of Object.entries(NAV_TABS)) {
  for (const tab of tabs) {
    const active = lit(role, tab.to);
    check(
      `${role}: ${tab.to} is owned only by its own tab`,
      active.length === 1 && active[0] === tab.to,
      active.length === 1 ? `lit ${active[0]}` : `lit ${active.length}: ${active.join(', ')}`,
    );
  }
}

/*
 * THE BOUNDARY, which is the whole reason the prefix test is not `startsWith`.
 *
 * `/coins` is owned by the profile tab. A naive prefix would make `/coinsomething` match it too,
 * and `/m` would swallow `/measurements`. These are the near-misses the rule exists to refuse.
 */
const NEAR_MISSES = [
  ['user', '/coinsomething'],
  ['user', '/librarian'],
  ['user', '/notificationsettings'],
  ['coach', '/composer'],
  ['coach', '/measurements'],
];
for (const [role, pathname] of NEAR_MISSES) {
  check(`${role}: ${pathname} lights nothing`, lit(role, pathname).length === 0, `lit ${lit(role, pathname).join(', ')}`);
}

/*
 * COMPLETENESS — every screen inside the signed-in layout is in the table, for every bar.
 *
 * The router gives the list of screens; the table above gives the answers. A screen the router
 * has and the table lacks is a screen nobody decided a tab for, which is how a bar goes dark.
 */

/** Screens that light no tab ON PURPOSE, each with the reason. An entry that lights a tab is dead. */
const NO_TAB_BY_DESIGN = new Map([
  ['/playground', 'an internal QA page, opened from the desktop command palette; it belongs to no tab'],
]);

/**
 * Screens only some bars can own: the bar of a role without the Edző or the Admin tab has nothing
 * to light there, and the route itself refuses that role. A prefix names the whole family.
 */
const ONLY_FOR = new Map([
  ['/coach', ['coach', 'admin']],
  ['/compose', ['coach', 'admin']],
  ['/admin', ['admin']],
]);

const under = (prefix, route) => route === prefix || route.startsWith(`${prefix}/`);
const rolesFor = (route) => {
  const scoped = [...ONLY_FOR].find(([prefix]) => under(prefix, route));
  return scoped ? scoped[1] : ROLES;
};
/** Does a concrete pathname from the table stand for a router pattern? `:id` matches one segment. */
const instanceOf = (pathname, pattern) => {
  const a = pathname.split('/');
  const b = pattern.split('/');
  return a.length === b.length && b.every((seg, i) => seg.startsWith(':') || seg === a[i]);
};
/** A concrete pathname for a pattern — `/coach/clients/:id/chat` → `/coach/clients/1/chat`. */
const sample = (pattern) => pattern.replace(/:[^/]+/g, '1');

const routerSrc = fs.readFileSync(ROUTER_FILE, 'utf8');
const signedIn = (() => {
  // The children of the route whose element mounts <RequireAuth>: the screens that render the bar.
  const guard = routerSrc.indexOf('<RequireAuth');
  const open = guard === -1 ? -1 : routerSrc.indexOf('children: [', guard);
  if (open === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = routerSrc.indexOf('[', open); i < routerSrc.length; i += 1) {
    if (routerSrc[i] === '[') depth += 1;
    else if (routerSrc[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const block = routerSrc.slice(open, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const routes = [...block.matchAll(/path:\s*'([^']+)'/g)].map(([, p]) => (p.startsWith('/') ? p : `/${p}`));
  if (/index:\s*true/.test(block)) routes.unshift('/');
  return routes;
})();

if (!signedIn || signedIn.length === 0) {
  check(
    'the signed-in screens can be read from router.tsx',
    false,
    'no `children: [` after <RequireAuth> — the completeness leg is blind; teach it the new shape',
  );
} else {
  for (const route of signedIn) {
    if (NO_TAB_BY_DESIGN.has(route)) {
      for (const role of ROLES) {
        const active = lit(role, sample(route));
        check(
          `${role}: ${route} lights nothing, as NO_TAB_BY_DESIGN says`,
          active.length === 0,
          `lit ${active.join(', ')} — delete the entry and give the route a row`,
        );
      }
      continue;
    }
    for (const role of rolesFor(route)) {
      check(
        `${role}: ${route} has a row in the table`,
        EXPECT.some(([r, pathname]) => r === role && instanceOf(pathname, route)),
        `a route with no row is a screen nobody chose a tab for — today it lights ${lit(role, sample(route)).join(', ') || 'NOTHING'}. ` +
          'Add the row, or a reason in NO_TAB_BY_DESIGN',
      );
    }
  }
  for (const route of NO_TAB_BY_DESIGN.keys()) {
    check(`NO_TAB_BY_DESIGN: ${route} is a signed-in route`, signedIn.includes(route), 'the router has no such screen — delete the entry');
  }
  for (const prefix of ONLY_FOR.keys()) {
    check(`ONLY_FOR: ${prefix} is a signed-in route`, signedIn.includes(prefix), 'the router has no such screen — delete the entry');
  }
}

/*
 * A PUSHED SCREEN AND ITS PARENT LIGHT THE SAME TAB.
 *
 * `app/routeMeta.ts` (lane F11) names the parent a pushed header goes back to:
 *
 *   export const ROUTE_META = { '/coins': { parent: '/settings', parentLabelKey: 'nav.profile' }, … }
 *
 * If the header says "Profil" and the bar lights Kezdőlap, one of the two is wrong and nothing
 * else would notice. check-nav holds the parent to the router and its label to the bundles; this
 * holds it to the bar. The table does not exist until the shell lands, and the leg says so.
 */
if (fs.existsSync(ROUTE_META_FILE)) {
  const table = (await import(pathToFileURL(path.resolve(ROUTE_META_FILE)).href)).ROUTE_META;
  const rows = table && typeof table === 'object' ? Object.entries(table) : [];
  check(
    'routeMeta.ts exports a ROUTE_META table',
    rows.length > 0,
    'route → { parent, parentLabelKey } — without it this leg is blind',
  );
  for (const [route, meta] of rows) {
    if (typeof meta?.parent !== 'string') continue; // check-nav reports the malformed row
    if (signedIn && !signedIn.includes(route)) continue; // a public screen renders no bar
    for (const role of rolesFor(route)) {
      const child = lit(role, sample(route));
      const parent = lit(role, sample(meta.parent));
      check(
        `${role}: ${route} lights the tab of its parent ${meta.parent}`,
        child.length === 1 && parent.length === 1 && child[0] === parent[0],
        `the screen lights ${child.join(', ') || 'nothing'}, its parent lights ${parent.join(', ') || 'nothing'}`,
      );
    }
  }
  notes.push(`${rows.length} routeMeta parent(s) held to the bar`);
} else {
  notes.push('routeMeta leg waiting for src/app/routeMeta.ts');
}

if (failures.length) {
  console.error(`check-nav-active FAILED — ${passed} passed, ${failures.length} failed` + LF);
  for (const f of failures) console.error(`  ${f}`);
  console.error(LF);
  process.exit(1);
}

console.log(
  `check-nav-active: OK — ${passed} assertions, ${signedIn.length} signed-in route(s), every one lights exactly one tab` +
    ` or says why not (${NO_TAB_BY_DESIGN.size})`,
);
for (const note of notes) console.log(`                  ${note}`);
