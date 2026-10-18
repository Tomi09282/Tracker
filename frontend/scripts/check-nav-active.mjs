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
import { NAV_TABS, isTabActive, viewForPath, viewsFor } from '../src/app/navTabs.ts';

const ROUTER_FILE = 'src/app/router.tsx';
const ROUTE_META_FILE = 'src/app/routeMeta.ts';
const ROLES = ['user', 'coach', 'admin'];
/** The `roles` `/auth/me` answers for each stored role (the ladder). */
const ROLES_OF = { user: ['user'], coach: ['user', 'coach'], admin: ['user', 'coach', 'admin'] };
const VIEWS = ['user', 'trainer', 'admin'];

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

/** Which cells light in this view's bar on this path (by `to`). */
const lit = (view, pathname) => (NAV_TABS[view] ?? []).filter((t) => isTabActive(t, pathname)).map((t) => t.to);

/*
 * EVERY ROUTE A PERSON CAN LAND ON, PER VIEW, and the tab that must own it.
 *
 * Written out rather than derived from the router, deliberately: derived from the same source, the
 * table would agree with the code by construction and assert nothing. This is the SECOND opinion —
 * somebody's statement of where each screen belongs — and it is supposed to be able to disagree.
 *
 * The view is the URL's (plan decision R2): the trainer's screens live under `/coach` and
 * `/compose`, the admin's under `/admin`, everything else is the member's. `/notifications` is the
 * one screen every view shares: it lights the root tab of the view the user came from (owner
 * answer Q6 for the member's bar: Kezdőlap).
 */
const EXPECT_BY_VIEW = {
  user: [
    ['/', '/'],
    ['/onboarding', '/'],
    ['/notifications', '/'],
    ['/habits', '/'],
    ['/habits/7', '/'],
    ['/workout', '/workout'],
    ['/workout/42', '/workout'],
    ['/library', '/workout'],
    ['/library/1467', '/workout'],
    ['/nutrition', '/nutrition'],
    ['/progress', '/progress'],
    ['/settings', '/settings'],
    ['/coins', '/settings'],
    ['/settings/equipment', '/settings'],
    ['/settings/day', '/settings'],
  ],
  trainer: [
    ['/coach', '/coach'],
    ['/coach/clients/10', '/coach'],
    ['/coach/clients/10/chat', '/coach'],
    ['/coach/plans', '/coach/plans'],
    ['/coach/plans/3', '/coach/plans'],
    ['/compose', '/compose'],
    ['/compose/profile', '/compose'],
    ['/compose/posts/p_4f2a', '/compose'],
    ['/notifications', '/coach'],
  ],
  admin: [
    ['/admin', '/admin'],
    ['/admin/styles', '/admin'],
    ['/admin/rules', '/admin'],
    ['/admin/accounts', '/admin/accounts'],
    ['/admin/marketplace', '/admin/marketplace'],
    ['/notifications', '/admin'],
  ],
};
const EXPECT = Object.entries(EXPECT_BY_VIEW).flatMap(([view, rows]) => rows.map(([pathname, owner]) => [view, pathname, owner]));

for (const [view, pathname, owner] of EXPECT) {
  const active = lit(view, pathname);
  check(
    `${view} view on ${pathname} lights exactly one tab`,
    active.length === 1,
    active.length === 1 ? '' : `lit ${active.length}: ${active.join(', ') || 'nothing'}`,
  );
  check(`${view} view on ${pathname} lights ${owner}`, active[0] === owner, `lit ${active[0] ?? 'nothing'}`);
}

/*
 * A SWITCH NEVER LIGHTS — not on its own `to`, not on any screen of any table above. It is a way
 * back to another view, not a place the user is (frame `bars`, "Váltó cella"); a lit switch would
 * also carry `aria-current`, telling a screen reader the user is somewhere they are not.
 */
const everyPath = [...new Set([...EXPECT.map(([, p]) => p), ...VIEWS.flatMap((v) => (NAV_TABS[v] ?? []).map((t) => t.to))])];
for (const view of VIEWS) {
  for (const tab of (NAV_TABS[view] ?? []).filter((t) => t.kind === 'switch')) {
    const on = everyPath.filter((p) => isTabActive(tab, p));
    check(`${view}: the switch "${tab.key}" never lights`, on.length === 0, `it lights on ${on.join(', ')}`);
  }
}

/*
 * NO TAB MAY OWN ANOTHER TAB'S OWN ROUTE.
 *
 * An `owns` prefix (or a missing `end`) that swallows a sibling is the failure this shape invites —
 * `/coach` without `end` would light Kliensek AND Tervek on `/coach/plans`.
 */
for (const view of VIEWS) {
  for (const tab of (NAV_TABS[view] ?? []).filter((t) => t.kind !== 'switch')) {
    const active = lit(view, tab.to);
    check(
      `${view}: ${tab.to} is owned only by its own tab`,
      active.length === 1 && active[0] === tab.to,
      active.length === 1 ? `lit ${active[0]}` : `lit ${active.length}: ${active.join(', ')}`,
    );
  }
}

/*
 * THE BOUNDARY, which is the whole reason the prefix test is not `startsWith`.
 */
const NEAR_MISSES = [
  ['user', '/coinsomething'],
  ['user', '/librarian'],
  ['user', '/notificationsettings'],
  ['trainer', '/composer'],
  ['trainer', '/coachman'],
  ['admin', '/administrator'],
  ['user', '/measurements'],
];
for (const [view, pathname] of NEAR_MISSES) {
  check(`${view}: ${pathname} lights nothing`, lit(view, pathname).length === 0, `lit ${lit(view, pathname).join(', ')}`);
}

/*
 * THE VIEW MODEL — `viewForPath` decides which bar a screen shows, from the URL and the roles.
 *
 *   * the URL decides: a trainer screen shows the trainer bar, an admin screen the admin bar;
 *   * a view the account does not hold falls back to the member's bar (a member who opens
 *     `/coach` sees their own five tabs and the page's refusal — never a trainer bar);
 *   * `/notifications` keeps the view the user came from, if the account holds it;
 *   * `viewsFor` lists only the views the roles allow.
 */
const VIEW_CASES = [
  ['/coach', 'coach', null, 'trainer'],
  ['/compose/profile', 'admin', null, 'trainer'],
  ['/admin/accounts', 'admin', null, 'admin'],
  ['/coach', 'user', null, 'user'],
  ['/admin', 'coach', null, 'user'],
  ['/settings', 'admin', 'admin', 'user'],
  ['/notifications', 'coach', 'trainer', 'trainer'],
  ['/notifications', 'admin', 'admin', 'admin'],
  ['/notifications', 'user', 'trainer', 'user'],
  ['/notifications', 'coach', 'admin', 'user'],
  ['/notifications', 'admin', null, 'user'],
];
for (const [pathname, role, lastView, expected] of VIEW_CASES) {
  const got = viewForPath(pathname, ROLES_OF[role], lastView);
  check(`${role} on ${pathname} (came from ${lastView ?? 'nowhere'}) shows the ${expected} bar`, got === expected, `shows ${got}`);
}
check('a member holds the user view only', JSON.stringify(viewsFor(ROLES_OF.user)) === '["user"]', JSON.stringify(viewsFor(ROLES_OF.user)));
check('a coach holds user + trainer', JSON.stringify(viewsFor(ROLES_OF.coach)) === '["user","trainer"]', JSON.stringify(viewsFor(ROLES_OF.coach)));
check('an admin holds all three', JSON.stringify(viewsFor(ROLES_OF.admin)) === '["user","trainer","admin"]', JSON.stringify(viewsFor(ROLES_OF.admin)));

/*
 * COMPLETENESS — every screen inside the signed-in layout is in the table, in every view it can
 * show, for every role that may open it.
 */

/** Screens that light no tab ON PURPOSE, each with the reason. An entry that lights a tab is dead. */
const NO_TAB_BY_DESIGN = new Map([
  ['/playground', 'an internal QA page, opened from the desktop command palette; it belongs to no tab'],
]);

/**
 * Screens only some roles can open: the server refuses everybody else, and the bar a refused
 * member sees there is their own five tabs, none of which owns the page. A prefix names the family.
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
/** Every view a route can show for a role: the URL's, or — on a shared screen — any it came from. */
const viewsOn = (route, role) => [...new Set([null, ...VIEWS].map((last) => viewForPath(sample(route), ROLES_OF[role], last)))];

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
      for (const view of VIEWS) {
        const active = lit(view, sample(route));
        check(
          `${view}: ${route} lights nothing, as NO_TAB_BY_DESIGN says`,
          active.length === 0,
          `lit ${active.join(', ')} — delete the entry and give the route a row`,
        );
      }
      continue;
    }
    for (const role of rolesFor(route)) {
      for (const view of viewsOn(route, role)) {
        check(
          `${role} in the ${view} view: ${route} has a row in the table`,
          EXPECT.some(([v, pathname]) => v === view && instanceOf(pathname, route)),
          `a route with no row is a screen nobody chose a tab for — today it lights ${lit(view, sample(route)).join(', ') || 'NOTHING'}. ` +
            'Add the row, or a reason in NO_TAB_BY_DESIGN',
        );
      }
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
 * A PUSHED SCREEN AND ITS PARENT LIGHT THE SAME TAB — in every view the screen can show.
 *
 * `app/routeMeta.ts` names the parent a pushed header goes back to, and for a screen every view
 * shares, a parent per view (`byView`). If the header says "Kliensek" and the bar lights nothing,
 * one of the two is wrong and nothing else would notice.
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
    const shown = new Set(rolesFor(route).flatMap((role) => viewsOn(route, role)));
    for (const view of shown) {
      const parent = (view !== 'user' && meta.byView?.[view]?.parent) || meta.parent;
      const child = lit(view, sample(route));
      const up = lit(view, sample(parent));
      check(
        `${view} view: ${route} lights the tab of its parent ${parent}`,
        child.length === 1 && up.length === 1 && child[0] === up[0],
        `the screen lights ${child.join(', ') || 'nothing'}, its parent lights ${up.join(', ') || 'nothing'}`,
      );
    }
  }
  notes.push(`${rows.length} routeMeta parent(s) held to the bar, per view`);
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
  `check-nav-active: OK — ${passed} assertions, ${signedIn.length} signed-in route(s) in ${VIEWS.length} views, every one lights exactly one tab` +
    ` or says why not (${NO_TAB_BY_DESIGN.size}); no switch ever lights`,
);
for (const note of notes) console.log(`                  ${note}`);
