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
// Run: node scripts/check-nav-active.mjs   (wired into `npm run build`)
import { NAV_TABS, isTabActive, tabsForRole } from '../src/app/navTabs.ts';

let passed = 0;
const failures = [];
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
 */
const EXPECT = [
  ['user', '/', '/'],
  ['user', '/onboarding', '/'],
  ['user', '/workout', '/workout'],
  ['user', '/workout/42', '/workout'],
  ['user', '/library', '/workout'],
  ['user', '/library/1467', '/workout'],
  ['user', '/nutrition', '/nutrition'],
  ['user', '/progress', '/progress'],
  ['user', '/settings', '/settings'],
  ['user', '/coins', '/settings'],

  ['coach', '/coach', '/coach'],
  ['coach', '/coach/clients/10', '/coach'],
  ['coach', '/coach/clients/10/chat', '/coach'],
  ['coach', '/coach/plans', '/coach'],
  ['coach', '/coach/plans/3', '/coach'],
  ['coach', '/compose', '/coach'],
  ['coach', '/compose/profile', '/coach'],
  ['coach', '/library/1467', '/workout'],

  ['admin', '/admin', '/admin'],
  ['admin', '/admin/styles', '/admin'],
  ['admin', '/', '/'],
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
  ['coach', '/composer'],
  ['coach', '/measurements'],
];
for (const [role, pathname] of NEAR_MISSES) {
  check(`${role}: ${pathname} lights nothing`, lit(role, pathname).length === 0, `lit ${lit(role, pathname).join(', ')}`);
}

if (failures.length) {
  console.error(`check-nav-active FAILED — ${passed} passed, ${failures.length} failed` + LF);
  for (const f of failures) console.error(`  ${f}`);
  console.error(LF);
  process.exit(1);
}

console.log(`check-nav-active: OK — ${passed} assertions, every route lights exactly one tab`);
