/**
 * verify-gates — prove that every build gate is load-bearing, by breaking what it guards.
 *
 * ═══ WHY ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * A gate that has never been seen to fail is not evidence. It is a green tick whose meaning is
 * unverified, and this project has collected several: a rule whose regex arrived with doubled
 * backslashes and matched nothing, a check whose subject had moved and passed forever, two
 * exemptions that exempted nothing. Every one of them printed OK.
 *
 * So each gate rule has a PROBE: plant exactly the defect the rule exists for, run the gate, see
 * it fail WITH THE MESSAGE THAT NAMES THE DEFECT, and put the file back byte for byte. A gate that
 * stays green on its own defect fails this run.
 *
 * Until now only `check-nav` had probes (`verify-nav-gate.mjs`), one of its six anchors had gone
 * stale without anybody noticing, and the other ten gates had none.
 *
 * ═══ HOW A PROBE FINDS ITS TARGET ══════════════════════════════════════════════════════════════
 *
 * The old probes replaced exact strings — indentation included — and died the day a formatter or
 * a neighbouring edit touched the line. Probes here are written against what the code MEANS:
 *
 *   * a whitespace-insensitive pattern (`/\bto\s*=\s*"\/coins"/`), or
 *   * a function that asks the gate's own scan what to break ("whichever token the bar's bottom
 *     inset comes from", "the first element only the playground reads"), or
 *   * a NEW file planted under `src` and deleted afterwards — no anchor at all, used wherever the
 *     rule is "any file that does X".
 *
 * A probe whose target is gone FAILS ("the anchor is gone — this case tests nothing"). A probe
 * whose subject has not landed yet (the route table, the screen scaffold) or has left (a retired
 * gate) is DORMANT: printed, counted, never silent.
 *
 * ═══ WHAT IT DOES TO THE TREE, AND HOW IT GIVES IT BACK ════════════════════════════════════════
 *
 * It rewrites source files for the seconds a gate runs. Therefore:
 *
 *   * one defect at a time, serially; one run per worktree (a lock in the worktree's git dir);
 *   * before a file is touched, its original bytes go to `.probe-backup` in the worktree's git
 *     dir (never inside the working tree: nothing a gate, the bundler or `git status` can see);
 *   * the file is restored in `finally`, on SIGINT / SIGTERM, and on process exit;
 *   * a run that was KILLED leaves the backup behind: the next start (or `--restore`) puts the
 *     file back before anything else. It writes only over the planted defect — a file that was
 *     changed again since is left alone and reported;
 *   * it refuses a dirty tree. `--allow-dirty` is for the two places where the tree is dirty by
 *     design — an integration with the squash applied but not yet committed, and a lane's slot
 *     with its hand-in files applied. Either way the proof at the end is the same: `git status`
 *     and the hash of every file a probe may touch are identical to what they were at the start;
 *   * never in the owner's checkout: his dev server watches those files.
 *
 * ═══ USAGE (cwd anywhere; the script finds `frontend/` itself) ═════════════════════════════════
 *
 *   node scripts/verify-gates.mjs                 every probe
 *   node scripts/verify-gates.mjs --gate check:nav --gate check:safe-area
 *   node scripts/verify-gates.mjs --only nav/no-door
 *   node scripts/verify-gates.mjs --list          the probes: id, gate, target, armed or dormant
 *   node scripts/verify-gates.mjs --list-anchors  the files armed probes rewrite, repo-relative,
 *                                                 one per line, nothing else on stdout
 *   node scripts/verify-gates.mjs --list-gates    the gate scripts and their data files
 *   node scripts/verify-gates.mjs --fresh         exit 0 when a full green run is on record for
 *                                                 the CURRENT content of the gates, their data
 *                                                 and every anchored file; exit 1 otherwise
 *   node scripts/verify-gates.mjs --restore       put back what a killed run left planted
 *   --allow-dirty                                 see above
 *
 * Exit: 0 every armed probe passed · 1 a probe failed or the tree did not come back · 2 refused.
 *
 * Not in `build`: a build must never rewrite source.
 *
 * ═══ ADDING A PROBE ════════════════════════════════════════════════════════════════════════════
 *
 * One entry in PROBES: `id`, `gate`, `label`, `file` (relative to `frontend/`), `expect` (the
 * words of the failure), and one of
 *
 *   mutate(text, ctx)  → the defective text, or null when the target is gone
 *   create(ctx)        → the content of a file that must not exist yet
 *
 * plus an optional `when(ctx)` → true, or the reason the probe is dormant. Put the target in a
 * file no screen package rewrites wherever there is a choice.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FRONT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LF = String.fromCharCode(10);

/** The gates of the build chain, by their `npm run` name. A script that is absent is reported, not run. */
const GATES = {
  'check:tokens': 'scripts/check-tokens.mjs',
  'check:pulse': 'scripts/check-pulse.mjs',
  'check:i18n': 'scripts/check-i18n.mjs',
  'check:nav': 'scripts/check-nav.mjs',
  'check:nav-active': 'scripts/check-nav-active.mjs',
  'check:interval': 'scripts/check-interval.mjs',
  'check:elements': 'scripts/check-element-roster.mjs',
  'check:autosave': 'scripts/verify-autosave.mjs',
  'check:type-scale': 'scripts/check-type-scale.mjs',
  'check:canvas': 'scripts/check-canvas.mjs',
  'check:aurora': 'scripts/check-aurora.mjs',
  'check:assets': 'scripts/check-assets.mjs',
  'check:safe-area': 'scripts/check-safe-area.mjs',
  'verify:outbox': 'scripts/verify-outbox.mjs',
};
const GATE_DATA_DIR = 'scripts/data';

/** A file planted for the seconds of one probe and deleted again. Never compiled, never committed. */
const PLANT = 'src/verify-gates-probe.tsx';

const abs = (rel) => path.join(FRONT, rel);
const exists = (rel) => fs.existsSync(abs(rel));
const readText = (rel) => fs.readFileSync(abs(rel), 'utf8');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace by pattern; null when the pattern matches nothing — which is "the anchor is gone". */
const swap = (pattern, replacement) => (text) => {
  const next = text.replace(pattern, replacement);
  return next === text ? null : next;
};
/** A JSON file, edited as data. Formatting is not kept: the file is restored from its bytes. */
const editJson = (edit) => (text, ctx) => {
  const doc = JSON.parse(text);
  const changed = edit(doc, ctx);
  return changed === false ? null : `${JSON.stringify(doc, null, 2)}${LF}`;
};
const flipLive = (id, to) =>
  swap(new RegExp(`(id: '${id}',[\\s\\S]{0,160}?live: )${to ? 'false' : 'true'}`), `$1${to}`);

/* ═══ the probes ═══════════════════════════════════════════════════════════════════════════════ */

const ROUTE_META = 'src/app/routeMeta.ts';
const SCAFFOLD = 'src/ui/shell/Screen.tsx';
const NAV_TABS = 'src/app/navTabs.ts';
const BOTTOM_NAV = 'src/ui/nav/BottomNav.tsx';
const TOKENS = 'src/ui/tokens/tokens.css';
const CATALOG = 'src/ui/feedback/catalog.ts';
const SAFE_AREA_EXEMPT = 'scripts/data/safe-area-exempt.json';
const WORKOUT_PLAYER = 'src/features/workout/WorkoutPlayer.tsx';

const noHorizontalInset = (text) => text.replace(/env\(\s*safe-area-inset-(?:left|right)\s*\)/g, '0px');
const firstBottomTokenInUse = (ctx) =>
  ctx.pinned.elements.find((e) => e.edge === 'bottom' && e.satisfiedBy?.startsWith('var('))?.satisfiedBy.slice(4, -1) ?? null;
const pinnedCount = (ctx, file, edge) => ctx.pinned.elements.filter((e) => e.file === file && e.edge === edge).length;
/** An element that accounts for its inset and is alone on its edge in its file: a legal, dead exemption key. */
const soleAccountedElement = (ctx) =>
  ctx.pinned.elements.find((e) => e.satisfiedBy && pinnedCount(ctx, e.file, e.edge) === 1 && !ctx.exempt.has(`${e.file}:${e.edge}`)) ?? null;
const crowdedEdge = (ctx) =>
  ctx.pinned.elements.find((e) => pinnedCount(ctx, e.file, e.edge) > 1 && !ctx.exempt.has(`${e.file}:${e.edge}`)) ?? null;
const bindingHome = () => [TOKENS, 'src/index.css'].find((f) => exists(f) && readText(f).includes('type-binding:start')) ?? null;

const PROBES = [
  /* ── check:nav ─────────────────────────────────────────────────────────────────────────────── */
  {
    id: 'nav/no-door',
    gate: 'check:nav',
    label: 'a screen that loses its only link is caught',
    file: 'src/features/settings/SettingsPage.tsx',
    mutate: swap(/\bto\s*=\s*"\/coins"/, 'to="/settings"'),
    expect: /"\/coins" is a route nobody links to/,
  },
  {
    id: 'nav/way-back-is-not-a-door',
    gate: 'check:nav',
    label: "a child's back-link does not keep its parent reachable",
    file: 'src/features/coaching/CoachDashboard.tsx',
    mutate: swap(/\bto\s*=\s*"\/coach\/plans"/, 'to="/coach"'),
    expect: /"\/coach\/plans" is a route nobody links to[\s\S]*?ways BACK/,
  },
  {
    id: 'nav/open-exemption-outlives-its-reason',
    gate: 'check:nav',
    label: 'an OPEN exemption fails the day its route gets a door',
    file: PLANT,
    create: () => `export const probe = <a to="/compose" />;${LF}`,
    expect: /"\/compose" has a door now/,
  },
  {
    id: 'nav/required-door-entry',
    gate: 'check:nav',
    label: 'a required door that is not in its named file is caught',
    file: 'scripts/check-nav.mjs',
    when: (ctx) => !ctx.requiredDoors.has('/library') || 'REQUIRED_DOORS names /library now — the probe below deletes the real door instead',
    mutate: swap(
      /(export const REQUIRED_DOORS = new Map\(\[)/,
      `$1${LF}  ['/library', { from: 'features/workout/WorkoutPlayer.tsx', reason: 'planted by verify-gates' }],`,
    ),
    expect: /the required door to "\/library" is gone from features\/workout\/WorkoutPlayer\.tsx/,
  },
  {
    id: 'nav/required-door-deleted',
    gate: 'check:nav',
    label: 'deleting the redirect of the idle Edzés tab is caught',
    file: WORKOUT_PLAYER,
    when: (ctx) => ctx.requiredDoors.has('/library') || 'REQUIRED_DOORS is empty until the D2 redirect lands (F16)',
    mutate: swap(/<Navigate\s+to\s*=\s*"\/library"[^>]*\/>/, 'null'),
    expect: /the required door to "\/library" is gone from features\/workout\/WorkoutPlayer\.tsx/,
  },
  {
    id: 'nav/clamp',
    gate: 'check:nav',
    label: 'the clamp coming back is caught',
    file: BOTTOM_NAV,
    mutate: swap(/\btabs\s*\.\s*map\s*\(/, 'tabs.slice(0, 5).map('),
    expect: /clamps its tab list again/,
  },
  {
    id: 'nav/tab-count',
    gate: 'check:nav',
    label: 'a tab count that drifts from the design is caught',
    file: NAV_TABS,
    mutate: swap(/[ \t]*\{\s*to:\s*'\/admin'[^}]*\},?[ \t]*\r?\n/, ''),
    expect: /the approved design has 7/,
  },
  {
    id: 'nav/tab-to-missing-route',
    gate: 'check:nav',
    label: 'a tab pointing at a route that does not exist is caught',
    file: NAV_TABS,
    mutate: swap(/\{\s*to:\s*'\/progress'/, "{ to: '/progres'"),
    expect: /the bar has a tab for "\/progres", and the router has no such path/,
  },
  {
    id: 'nav/label-key',
    gate: 'check:nav',
    label: 'a tab label key missing from a bundle is caught',
    file: NAV_TABS,
    mutate: swap(/labelKey:\s*'nav\.nutritionShort'/, "labelKey: 'nav.nutritionTiny'"),
    expect: /"nav\.nutritionTiny", which is missing from/,
  },
  {
    id: 'nav/horizontal-inset',
    gate: 'check:nav',
    label: 'dropping the horizontal safe area of the bar is caught',
    file: BOTTOM_NAV,
    mutate: (text) => (noHorizontalInset(text) === text ? null : noHorizontalInset(text)),
    expect: /never mentions safe-area-inset-(left|right)/,
  },
  {
    id: 'nav/inset-only-in-a-comment',
    gate: 'check:nav',
    label: 'a comment that names the inset does not stand in for the inset',
    file: BOTTOM_NAV,
    mutate: (text) =>
      noHorizontalInset(text) === text
        ? null
        : `${noHorizontalInset(text)}${LF}// keeps env(safe-area-inset-left) and env(safe-area-inset-right) in mind${LF}`,
    expect: /never mentions safe-area-inset-left/,
  },
  {
    id: 'nav/route-meta-parent-planted',
    gate: 'check:nav',
    label: 'a pushed screen whose parent is not a route is caught',
    file: ROUTE_META,
    when: () => !exists(ROUTE_META) || 'routeMeta.ts is in the tree — the probe below breaks the real table instead',
    create: () => `export const ROUTE_META = { '/coins': { parent: '/nowhere', parentLabelKey: 'nav.profile' } };${LF}`,
    expect: /routeMeta sends "\/coins" back to "\/nowhere", which is not a router path/,
  },
  {
    id: 'nav/route-meta-parent',
    gate: 'check:nav',
    label: 'a pushed screen whose parent is not a route is caught',
    file: ROUTE_META,
    when: () => exists(ROUTE_META) || 'src/app/routeMeta.ts has not landed yet (F11)',
    mutate: swap(/(\bparent:\s*)'\/[^']*'/, "$1'/nowhere'"),
    expect: /back to "\/nowhere", which is not a router path/,
  },

  /* ── check:nav-active ──────────────────────────────────────────────────────────────────────── */
  {
    id: 'nav-active/route-without-row',
    gate: 'check:nav-active',
    label: 'a route added to the signed-in layout with no row is caught',
    file: 'src/app/router.tsx',
    mutate: swap(
      /\{\s*path:\s*'settings'\s*,/,
      `{ path: 'verify-gates-probe', element: suspended(<SettingsPage />) },${LF}      { path: 'settings',`,
    ),
    expect: /\/verify-gates-probe has a row in the table/,
  },
  {
    id: 'nav-active/owner-dropped',
    gate: 'check:nav-active',
    label: 'a screen that stops lighting its tab is caught',
    file: NAV_TABS,
    mutate: swap(/,\s*owns:\s*\[\s*'\/library'\s*\]/, ''),
    expect: /user on \/library lights exactly one tab/,
  },
  {
    id: 'nav-active/notifications-owner',
    gate: 'check:nav-active',
    label: 'Értesítések without its Kezdőlap tab is caught',
    file: NAV_TABS,
    mutate: swap(/,\s*'\/notifications'\s*\]/, ']'),
    expect: /user on \/notifications lights exactly one tab/,
  },
  {
    id: 'nav-active/route-meta-owner-planted',
    gate: 'check:nav-active',
    label: 'a pushed screen that lights another tab than its parent is caught',
    file: ROUTE_META,
    when: () => !exists(ROUTE_META) || 'routeMeta.ts is in the tree — the probe below breaks the real table instead',
    create: () => `export const ROUTE_META = { '/coins': { parent: '/', parentLabelKey: 'nav.home' } };${LF}`,
    expect: /\/coins lights the tab of its parent \//,
  },
  {
    id: 'nav-active/route-meta-owner',
    gate: 'check:nav-active',
    label: 'a pushed screen that lights another tab than its parent is caught',
    file: ROUTE_META,
    when: () => exists(ROUTE_META) || 'src/app/routeMeta.ts has not landed yet (F11)',
    // A parent no tab owns: whatever the screen lights, it is not what `/playground` lights.
    mutate: swap(/(\bparent:\s*)'\/[^']+'/, "$1'/playground'"),
    expect: /lights the tab of its parent \/playground/,
  },

  /* ── check:safe-area ───────────────────────────────────────────────────────────────────────── */
  {
    id: 'safe-area/bar-bottom-inset',
    gate: 'check:safe-area',
    label: 'the bottom inset removed from the bar is caught',
    file: BOTTOM_NAV,
    mutate: (text, ctx) => {
      let next = text.replace(/env\(\s*safe-area-inset-bottom\s*\)/g, '0px');
      for (const token of ctx.insetTokens.bottom) next = next.replace(new RegExp(`var\\(\\s*${escapeRe(token)}\\s*\\)`, 'g'), '0px');
      return next === text ? null : next;
    },
    expect: /ui\/nav\/BottomNav\.tsx:\d+ pins a fixed element to the bottom edge/,
  },
  {
    id: 'safe-area/token-loses-env',
    gate: 'check:safe-area',
    label: 'an inset token whose chain no longer ends in env() is caught',
    file: TOKENS,
    when: (ctx) => Boolean(firstBottomTokenInUse(ctx)) || 'no edge-pinned element takes its bottom inset from a token',
    mutate: swap(/env\(\s*safe-area-inset-bottom\s*\)/g, '0px'),
    expect: /which does not reach env\(safe-area-inset-bottom\)/,
  },
  {
    id: 'safe-area/token-redeclared',
    gate: 'check:safe-area',
    label: 'an inset token re-declared without env() is caught',
    file: TOKENS,
    when: (ctx) => Boolean(firstBottomTokenInUse(ctx)) || 'no edge-pinned element takes its bottom inset from a token',
    mutate: (text, ctx) => `${text}${LF}:root {${LF}  ${firstBottomTokenInUse(ctx)}: 0px;${LF}}${LF}`,
    expect: /which does not reach env\(safe-area-inset-bottom\)/,
  },
  {
    id: 'safe-area/any-token-is-not-an-inset',
    gate: 'check:safe-area',
    label: 'pb-[var(--card-pad)] on a fixed bottom-0 element is caught',
    file: PLANT,
    create: () => `export const probe = 'fixed inset-x-0 bottom-0 pb-[var(--card-pad)]';${LF}`,
    expect: /pins a fixed element to the bottom edge \(bottom-0\)[\s\S]*?var\(--card-pad\), which does not reach/,
  },
  {
    id: 'safe-area/sticky',
    gate: 'check:safe-area',
    label: 'a sticky top-0 element with no inset is caught',
    file: PLANT,
    create: () => `export const probe = <div className="sticky top-0 bg-surface-0" />;${LF}`,
    expect: /pins a sticky element to the top edge \(top-0\)/,
  },
  {
    id: 'safe-area/arbitrary-offset',
    gate: 'check:safe-area',
    label: 'a fixed element on an arbitrary bottom-[…] with no inset is caught',
    file: PLANT,
    create: () => `export const probe = ['fixed right-4', 'bottom-[calc(var(--nav-h)+12px)]'].join(' ');${LF}`,
    expect: /pins a fixed element to the bottom edge \(bottom-\[calc\(var\(--nav-h\)\+12px\)\]\)/,
  },
  {
    id: 'safe-area/dead-exemption',
    gate: 'check:safe-area',
    label: 'an exemption that exempts nothing is caught',
    file: SAFE_AREA_EXEMPT,
    when: (ctx) => Boolean(soleAccountedElement(ctx)) || 'no file pins exactly one accounted element to an edge',
    mutate: editJson((doc, ctx) => {
      const el = soleAccountedElement(ctx);
      doc.entries[`${el.file}:${el.edge}`] = 'planted by verify-gates';
    }),
    expect: /and it exempts nothing/,
  },
  {
    id: 'safe-area/file-wide-exemption',
    gate: 'check:safe-area',
    label: 'a file-wide exemption on a file with several pinned elements is caught',
    file: SAFE_AREA_EXEMPT,
    when: (ctx) => Boolean(crowdedEdge(ctx)) || 'no file pins several elements to one edge',
    mutate: editJson((doc, ctx) => {
      const el = crowdedEdge(ctx);
      doc.entries[`${el.file}:${el.edge}`] = 'planted by verify-gates';
    }),
    expect: /has the file-wide entry/,
  },
  {
    id: 'safe-area/scaffold-planted',
    gate: 'check:safe-area',
    label: 'a scaffold that pads its top with a literal env() is caught',
    file: SCAFFOLD,
    when: () => !exists(SCAFFOLD) || 'Screen.tsx is in the tree — the probe below breaks the real scaffold instead',
    create: () => `export const Screen = () => <div className="pt-[env(safe-area-inset-top)]" />;${LF}`,
    expect: /Screen\.tsx pads the top with a literal env\(safe-area-inset-top\)/,
  },
  {
    id: 'safe-area/scaffold',
    gate: 'check:safe-area',
    label: 'a scaffold that loses its top-inset token is caught',
    file: SCAFFOLD,
    when: () => exists(SCAFFOLD) || 'src/ui/shell/Screen.tsx has not landed yet (F11)',
    mutate: (text, ctx) => {
      let next = text;
      for (const token of ctx.insetTokens.top) next = next.replace(new RegExp(`var\\(\\s*${escapeRe(token)}\\s*\\)`, 'g'), 'var(--card-pad)');
      return next === text ? null : next;
    },
    expect: /Screen\.tsx uses no token that carries the top inset/,
  },
  {
    id: 'safe-area/cover-mode',
    gate: 'check:safe-area',
    label: 'viewport-fit=cover leaving index.html is caught',
    file: 'index.html',
    mutate: swap(/,?\s*viewport-fit\s*=\s*cover/, ''),
    expect: /has no `viewport-fit=cover`/,
  },
  {
    id: 'safe-area/gutter',
    gate: 'check:safe-area',
    label: 'a gutter that forgets the landscape notch is caught',
    file: 'src/index.css',
    mutate: swap(/env\(\s*safe-area-inset-left\s*\)/, '0px'),
    expect: /a \.screen-x rule sets a horizontal gutter with no left\/right inset/,
  },

  /* ── check:elements ────────────────────────────────────────────────────────────────────────── */
  {
    id: 'elements/playground-only-marked-live',
    gate: 'check:elements',
    label: 'an element only the playground renders, marked live, is caught',
    file: CATALOG,
    when: (ctx) => ctx.elements.playgroundOnly.size > 0 || 'no element is read by the playground only (their files are retired)',
    mutate: (text, ctx) => flipLive([...ctx.elements.playgroundOnly][0], true)(text),
    expect: (ctx) => new RegExp(`the catalogue marks ${[...ctx.elements.playgroundOnly][0]} live, and only the playground renders`),
  },
  {
    id: 'elements/product-read-marked-not-live',
    gate: 'check:elements',
    label: 'an element the product reads, marked not live, is caught',
    file: CATALOG,
    when: (ctx) => ctx.elements.live.size > 0 || 'no product component reads a variant any more (one Pulse look per element)',
    mutate: (text, ctx) => flipLive([...ctx.elements.live][0], false)(text),
    expect: (ctx) => new RegExp(`${[...ctx.elements.live][0]} is read by a component the product renders`),
  },
  {
    id: 'elements/unread-marked-live',
    gate: 'check:elements',
    label: 'an element nothing reads, marked live, is caught',
    file: CATALOG,
    mutate: flipLive('E23', true),
    expect: /the catalogue marks E23 live, and no component calls useElementVariant/,
  },
  {
    id: 'elements/undeclared-dormant',
    gate: 'check:elements',
    label: 'an inert element missing from the dormant list is caught',
    file: 'scripts/data/elements-dormant.json',
    mutate: editJson((doc) => {
      const first = Object.keys(doc.entries)[0];
      if (!first) return false;
      delete doc.entries[first];
      return true;
    }),
    expect: /(DORMANT does not list them|NO component reads them)/,
  },
  {
    id: 'elements/product-read-declared-dormant',
    gate: 'check:elements',
    label: 'an element the product reads, listed as dormant, is caught',
    file: 'scripts/data/elements-dormant.json',
    when: (ctx) => ctx.elements.live.size > 0 || 'no product component reads a variant any more (one Pulse look per element)',
    mutate: editJson((doc, ctx) => {
      doc.entries[[...ctx.elements.live][0]] = 'planted by verify-gates';
    }),
    expect: (ctx) => new RegExp(`DORMANT still lists ${[...ctx.elements.live][0]}, which product components read`),
  },
  {
    id: 'elements/previewable-drift',
    gate: 'check:elements',
    label: 'a playground demo missing from PREVIEWABLE is caught',
    file: 'src/features/playground/PlaygroundPage.tsx',
    mutate: swap(/(const PREVIEWABLE = new Set\(\[\s*)'E\d+',?\s*/, '$1'),
    expect: /the Demo switch handles E\d+ but PREVIEWABLE omits them/,
  },

  /* ── gates whose rules did not change: one existing-behaviour probe each ───────────────────── */
  {
    id: 'i18n/key-missing-from-a-bundle',
    gate: 'check:i18n',
    label: 'a key deleted from one bundle is caught',
    file: 'src/i18n/de.json',
    mutate: editJson((doc) => (doc.nav && 'home' in doc.nav ? delete doc.nav.home : false)),
    expect: /de: missing 1 key\(s\) — nav\.home/,
  },
  {
    id: 'i18n/dead-key',
    gate: 'check:i18n',
    label: 'a key no code references is caught (the exported consumer scan)',
    file: 'src/i18n/hu.json',
    mutate: editJson((doc) => {
      if (!doc.nav) return false;
      doc.nav.verifyGatesProbe = 'próba';
      return true;
    }),
    expect: /nav\.verifyGatesProbe is in every bundle and referenced by no code/,
  },
  {
    id: 'i18n/key-without-bundle',
    gate: 'check:i18n',
    label: 'a key the code references and no bundle has is caught',
    file: PLANT,
    create: () => `export const probe = (t: (key: string) => string) => t('nav.verifyGatesProbe');${LF}`,
    expect: /references t\('nav\.verifyGatesProbe'\) and no bundle has it/,
  },
  {
    id: 'tokens/raw-hex',
    gate: 'check:tokens',
    label: 'a raw colour in a component is caught',
    file: PLANT,
    create: () => `export const probe = <div className="bg-[#CBFF2E]" />;${LF}`,
    expect: /\[raw-hex\]\s+#CBFF2E/,
  },
  {
    id: 'tokens/undeclared-token',
    gate: 'check:tokens',
    label: 'a var() that names no token is caught',
    file: PLANT,
    create: () => `export const probe = <div className="h-[var(--verify-gates-probe)]" />;${LF}`,
    expect: /\[undeclared-token\]\s+var\(--verify-gates-probe\)/,
  },
  {
    id: 'interval/segment-boundary',
    gate: 'check:interval',
    label: 'a timer that stops on the wrong segment is caught',
    file: 'src/features/workout/intervalPlan.ts',
    mutate: swap(/else if \(elapsedMs >= s\.endMs\) lo = mid \+ 1;/, 'else if (elapsedMs > s.endMs) lo = mid + 1;'),
    expect: /FAIL\s+a boundary belongs to the NEXT segment/,
  },
  {
    id: 'autosave/mirrored-line',
    gate: 'check:autosave',
    label: 'the autosave hook drifting from its audited transcription is caught',
    file: 'src/features/compose/useAutosave.ts',
    mutate: swap(/if \(inFlight\.current\) \{/, 'if (inFlight.current && again.current) {'),
    expect: /FAIL\s+the hook still single flight raises a flag rather than queueing/,
  },
  {
    id: 'outbox/allowlist',
    gate: 'verify:outbox',
    label: 'a money endpoint added to the offline queue is caught',
    file: 'src/lib/outbox.ts',
    mutate: swap(/const QUEUEABLE = \[/, 'const QUEUEABLE = [/^\\/coins\\/transfer$/, '),
    expect: /FAIL\s+a coin transfer is NOT/,
  },
  {
    id: 'aurora/ancestor-paints',
    gate: 'check:aurora',
    label: 'a wrapper that paints over the backdrop is caught',
    file: 'src/app/AppLayout.tsx',
    when: () =>
      (exists('src/app/AppLayout.tsx') && readText('src/app/AppLayout.tsx').includes('<AuroraBackdrop')) ||
      'AppLayout no longer mounts the backdrop (the gate retires with its last mount, F16)',
    mutate: swap(/className="min-h-dvh/, 'className="bg-surface-1 min-h-dvh'),
    expect: /wraps the AuroraBackdrop[\s\S]*?paints `bg-surface-1`/,
  },

  /* ── stage G-a gates (lane F2:a owns the scripts; their probes live here with the rest) ─────── */
  {
    id: 'type-scale/step-not-listed',
    gate: 'check:type-scale',
    label: 'a type step declared without a cn.ts entry is caught',
    file: TOKENS,
    mutate: swap(/(--text-[a-z0-9-]+:\s*[\d.]+(?:rem|px|em);)/, `$1${LF}  --text-verifygates: 1rem;`),
    expect: /`text-verifygates` is declared in \S+ but not listed/,
  },
  {
    id: 'type-scale/step-not-a-plain-length',
    gate: 'check:type-scale',
    label: 'a type step written as min(…) is caught',
    file: TOKENS,
    mutate: (text) => {
      const giant = /(--text-giant:\s*)([\d.]+(?:rem|px|em))(\s*;)/;
      const any = /(--text-[a-z0-9]+:\s*)([\d.]+(?:rem|px|em))(\s*;)/;
      return swap(giant.test(text) ? giant : any, '$1min($2, 31vw)$3')(text);
    },
    expect: /`--text-[a-z0-9-]+` is `min\([^`]+\)` \([^)]+\) — a type step must be a plain length/,
  },
  {
    id: 'type-scale/entry-not-declared',
    gate: 'check:type-scale',
    label: 'a cn.ts entry with no step behind it is caught',
    file: 'src/lib/cn.ts',
    mutate: swap(/(const TYPE_STEPS = \[)/, "$1'verifygates', "),
    expect: /`verifygates` is listed in \S+ but no --text-verifygates exists/,
  },
  {
    id: 'type-scale/binding-dropped',
    gate: 'check:type-scale',
    label: '.text-eyebrow dropped from the type-binding block is caught',
    file: () => bindingHome() ?? 'src/index.css',
    when: () => Boolean(bindingHome()) || 'no type-binding block yet (it lands with the Pulse ramp, F1.4)',
    mutate: (text) => {
      const from = text.indexOf('type-binding:start');
      const to = text.indexOf('type-binding:end');
      if (from === -1 || to <= from) return null;
      const block = text
        .slice(from, to)
        .replace(/,\s*\.text-eyebrow(?![\w-])/g, '')
        .replace(/\.text-eyebrow(?![\w-])\s*,\s*/g, '')
        .replace(/\.text-eyebrow(?![\w-])/g, '.text-eyebrow-gone');
      return block === text.slice(from, to) ? null : text.slice(0, from) + block + text.slice(to);
    },
    expect: /`text-eyebrow` is [\s\S]{0,120}?type-binding block[\s\S]{0,60}?does not\s+give `\.text-eyebrow`/,
  },
  {
    id: 'type-scale/binding-deleted',
    gate: 'check:type-scale',
    label: 'the type-binding block deleted under a declared Pulse ramp is caught',
    file: () => bindingHome() ?? 'src/index.css',
    when: () => Boolean(bindingHome()) || 'no type-binding block yet (it lands with the Pulse ramp, F1.4)',
    mutate: swap(/\/\*\s*type-binding:start\s*\*\/[\s\S]*?\/\*\s*type-binding:end\s*\*\//, ''),
    expect: /there is no type-binding block/,
  },
  {
    id: 'canvas/manifest-background',
    gate: 'check:canvas',
    label: 'the splash colour of the manifest changed alone is caught',
    file: 'public/manifest.webmanifest',
    mutate: swap(/("background_color"\s*:\s*")#[0-9a-fA-F]{3,8}(")/, '$1#123456$2'),
    expect: /`background_color` is #123456/,
  },
  {
    id: 'canvas/manifest-theme',
    gate: 'check:canvas',
    label: 'the title-bar colour of the manifest changed alone is caught',
    file: 'public/manifest.webmanifest',
    mutate: swap(/("theme_color"\s*:\s*")#[0-9a-fA-F]{3,8}(")/, '$1#123456$2'),
    expect: /`theme_color` is #123456/,
  },
  {
    id: 'canvas/meta',
    gate: 'check:canvas',
    label: 'the theme-color meta tag changed alone is caught',
    file: 'index.html',
    mutate: swap(/(<meta\s+name="theme-color"\s+content=")#[0-9a-fA-F]{3,8}(")/, '$1#123456$2'),
    expect: /`<meta name="theme-color">` is #123456/,
  },
  {
    id: 'canvas/token-alone',
    gate: 'check:canvas',
    label: 'the canvas token changed without its three copies is caught',
    file: TOKENS,
    mutate: swap(/((?<![\w-])--surface-0:\s*)#[0-9a-fA-F]{3,8}/, '$1#123456'),
    expect: /and `--surface-0` is #123456/,
  },
];

/* ═══ the runner ═══════════════════════════════════════════════════════════════════════════════ */

const git = (...args) => execFileSync('git', ['-C', FRONT, ...args], { encoding: 'utf8' }).replace(/\r?\n$/, '');
const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};

const REPO = path.resolve(git('rev-parse', '--show-toplevel'));
const GIT_DIR = path.resolve(FRONT, git('rev-parse', '--absolute-git-dir'));
const COMMON_DIR = path.resolve(FRONT, git('rev-parse', '--git-common-dir'));
const STATE = path.join(GIT_DIR, 'verify-gates');
const BACKUP = path.join(STATE, '.probe-backup');
const LOCK = path.join(STATE, 'lock');
/** `.pulse/` lives in the main checkout only; every worktree reaches it through the common git dir. */
const PULSE = path.join(path.dirname(COMMON_DIR), '.pulse');
const RECORD = path.join(PULSE, 'verify-gates', 'green.json');
const repoRel = (rel) => path.relative(REPO, abs(rel)).split(path.sep).join('/');
const fileOf = (probe) => (typeof probe.file === 'function' ? probe.file() : probe.file);

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

/* ── the backup: what makes a killed run recoverable ──────────────────────────────────────────── */

let pending = null; // { rel, existed, original: Buffer | null, createdDirs: string[] }

function plant(probe, rel, content) {
  const target = abs(rel);
  const existed = fs.existsSync(target);
  const original = existed ? fs.readFileSync(target) : null;
  const planted = Buffer.from(content, 'utf8');
  const createdDirs = [];
  for (let dir = path.dirname(target); !fs.existsSync(dir); dir = path.dirname(dir)) createdDirs.push(dir);

  fs.mkdirSync(BACKUP, { recursive: true });
  if (existed) fs.writeFileSync(path.join(BACKUP, 'original.bin'), original);
  // The manifest is written LAST: a backup without one was never used, a backup with one is whole.
  fs.writeFileSync(
    path.join(BACKUP, 'manifest.json'),
    JSON.stringify(
      { probe: probe.id, file: rel, existed, originalSha: existed ? sha(original) : null, plantedSha: sha(planted), createdDirs, pid: process.pid, at: new Date().toISOString() },
      null,
      2,
    ),
  );
  pending = { rel, existed, original, createdDirs };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, planted);
}

function restorePending() {
  if (!pending) return;
  const { rel, existed, original, createdDirs } = pending;
  const target = abs(rel);
  if (existed) fs.writeFileSync(target, original);
  else {
    fs.rmSync(target, { force: true });
    for (const dir of createdDirs) fs.rmSync(dir, { recursive: true, force: true });
  }
  pending = null;
  fs.rmSync(BACKUP, { recursive: true, force: true });
}

/** Put back what a killed run left planted. Returns a line for the report, or null when there was nothing. */
function recover() {
  const manifestFile = path.join(BACKUP, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    fs.rmSync(BACKUP, { recursive: true, force: true }); // a backup without a manifest was never used
    return null;
  }
  const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const target = abs(m.file);
  const current = fs.existsSync(target) ? sha(fs.readFileSync(target)) : null;
  const drop = () => fs.rmSync(BACKUP, { recursive: true, force: true });
  const what = `${repoRel(m.file)} (probe ${m.probe}, planted ${m.at})`;

  if (current === m.plantedSha) {
    if (m.existed) {
      const original = fs.readFileSync(path.join(BACKUP, 'original.bin'));
      if (sha(original) !== m.originalSha) fail(2, `verify-gates: the backup of ${what} is damaged — restore the file by hand (git diff ${repoRel(m.file)}).`);
      fs.writeFileSync(target, original);
    } else {
      fs.rmSync(target, { force: true });
      for (const dir of m.createdDirs ?? []) fs.rmSync(dir, { recursive: true, force: true });
    }
    drop();
    return `restored ${what} — a killed run had left its defect planted`;
  }
  if (current === m.originalSha) {
    drop();
    return `nothing to restore: ${what} was already back`;
  }
  // Neither the defect nor the original: somebody changed the file since. Writing the backup over
  // it would destroy that work. If the file is simply back at HEAD (a reset), the backup is moot.
  const atHead = current !== null && spawnSync('git', ['-C', FRONT, 'diff', '--quiet', 'HEAD', '--', abs(m.file)]).status === 0;
  if (atHead || (current === null && !m.existed)) {
    drop();
    return `dropped a stale backup: ${what} no longer holds the planted defect`;
  }
  fail(
    2,
    `verify-gates: a killed run left a backup of ${what}, and the file has been changed since.\n` +
      `  It is neither the planted defect nor the original, so nothing was written.\n` +
      `  Look at it (git diff ${repoRel(m.file)}); the original bytes are in\n  ${path.join(BACKUP, 'original.bin')}\n` +
      `  Then delete ${BACKUP} and run again.`,
  );
  return null;
}

/* ── the lock: one run per worktree ───────────────────────────────────────────────────────────── */

let locked = false;
function takeLock() {
  fs.mkdirSync(STATE, { recursive: true });
  const owner = path.join(LOCK, 'owner.json');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(LOCK); // atomic: exactly one process gets it
      fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      locked = true;
      return;
    } catch {
      let holder = null;
      try {
        holder = JSON.parse(fs.readFileSync(owner, 'utf8'));
      } catch {
        /* a lock with no readable owner is a dead one */
      }
      let alive = false;
      if (holder?.pid) {
        try {
          process.kill(holder.pid, 0);
          alive = true;
        } catch {
          alive = false;
        }
      }
      const age = holder?.at ? Date.now() - Date.parse(holder.at) : Infinity;
      if (alive && age < 30 * 60 * 1000) {
        fail(2, `verify-gates: another run holds this worktree (pid ${holder.pid}, since ${holder.at}). Two runs would plant over each other.`);
      }
      fs.rmSync(LOCK, { recursive: true, force: true }); // dead or stale: take it over
    }
  }
  fail(2, `verify-gates: could not take the lock at ${LOCK}`);
}
function releaseLock() {
  if (locked) fs.rmSync(LOCK, { recursive: true, force: true });
  locked = false;
}

const cleanUp = () => {
  try {
    restorePending();
  } finally {
    releaseLock();
  }
};
process.on('exit', cleanUp);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    cleanUp();
    process.exit(130);
  });
}

/* ── what the probes need to know about the tree ──────────────────────────────────────────────── */

async function context() {
  const load = (rel) => import(pathToFileURL(abs(rel)).href);
  const safeArea = await load(GATES['check:safe-area']);
  const elements = await load(GATES['check:elements']);
  const nav = await load(GATES['check:nav']);
  const pinned = safeArea.scanEdgePinned({ root: FRONT });
  return {
    pinned,
    insetTokens: pinned.tokens,
    elements: elements.scanElementReads({ root: FRONT }),
    requiredDoors: nav.REQUIRED_DOORS,
    exempt: new Set(Object.keys(JSON.parse(readText(SAFE_AREA_EXEMPT)).entries)),
  };
}

const dormancy = (probe, ctx) => {
  if (!exists(GATES[probe.gate])) return `${GATES[probe.gate]} is not in this tree`;
  const armed = probe.when ? probe.when(ctx) : true;
  return armed === true ? null : String(armed);
};

/** Files an armed probe rewrites — the ones a merge must not touch without a fresh green run. */
const anchoredFiles = (ctx) =>
  [...new Set(PROBES.filter((p) => !p.create && dormancy(p, ctx) === null).map(fileOf))].filter(exists).sort();
const gateFiles = () => {
  const data = exists(GATE_DATA_DIR) ? fs.readdirSync(abs(GATE_DATA_DIR)).map((f) => `${GATE_DATA_DIR}/${f}`) : [];
  return [...new Set([...Object.values(GATES), 'scripts/verify-gates.mjs', ...data])].filter(exists).sort();
};
/** One hash over everything a green run vouches for. Line endings are folded: a checkout must not change it. */
function digest(ctx) {
  const files = [...new Set([...gateFiles(), ...anchoredFiles(ctx)])].sort();
  const h = crypto.createHash('sha256');
  for (const rel of files) h.update(`${rel}\0${sha(readText(rel).replace(/\r\n/g, LF))}\n`);
  return { digest: h.digest('hex'), files: files.length };
}
const readRecords = () => {
  try {
    return JSON.parse(fs.readFileSync(RECORD, 'utf8')).records ?? [];
  } catch {
    return [];
  }
};

/* ── main ─────────────────────────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const values = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? argv[i + 1].split(',') : []));
const KNOWN = new Set(['--list', '--list-anchors', '--list-gates', '--fresh', '--restore', '--allow-dirty', '--gate', '--only', '--help', '-h']);
{
  const unknown = argv.filter((a, i) => a.startsWith('-') && !KNOWN.has(a) && !['--gate', '--only'].includes(argv[i - 1]));
  if (unknown.length) fail(2, `verify-gates: unknown option ${unknown.join(', ')} — see the header of scripts/verify-gates.mjs`);
}

if (flag('--help') || flag('-h')) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*\n?/, '').replace(/^ \* ?/gm, ''));
  process.exit(0);
}

if (flag('--restore')) {
  takeLock();
  console.log(`verify-gates: ${recover() ?? 'nothing to restore — no run left a defect planted'}`);
  process.exit(0);
}

if (flag('--list-gates')) {
  for (const rel of gateFiles()) console.log(repoRel(rel));
  process.exit(0);
}

if (flag('--list-anchors') || flag('--list') || flag('--fresh')) {
  if (fs.existsSync(path.join(BACKUP, 'manifest.json'))) {
    fail(2, 'verify-gates: a killed run left a defect planted — run `node scripts/verify-gates.mjs --restore` first.');
  }
  const ctx = await context();
  if (flag('--list-anchors')) {
    for (const rel of anchoredFiles(ctx)) console.log(repoRel(rel));
  } else if (flag('--list')) {
    for (const p of PROBES) {
      const why = dormancy(p, ctx);
      console.log(`${(why ? 'dormant' : 'armed').padEnd(8)} ${p.gate.padEnd(17)} ${p.id.padEnd(40)} ${p.create ? `(plants ${fileOf(p)})` : fileOf(p)}${why ? `  — ${why}` : ''}`);
    }
  } else {
    const now = digest(ctx);
    const hit = readRecords().find((r) => r.digest === now.digest);
    if (!hit) fail(1, `verify-gates: NOT fresh — no full green run is on record for the current content of ${now.files} gate and anchored file(s). Run verify:gates.`);
    console.log(`verify-gates: fresh — a full green run of ${hit.passed} probe(s) is on record for this content (${hit.at}, ${hit.head}).`);
  }
  process.exit(0);
}

const onlyGates = values('--gate');
const onlyIds = values('--only');
for (const g of onlyGates) if (!GATES[g]) fail(2, `verify-gates: no gate named "${g}" (known: ${Object.keys(GATES).join(', ')})`);
for (const id of onlyIds) if (!PROBES.some((p) => p.id === id)) fail(2, `verify-gates: no probe named "${id}" (see --list)`);
const selected = PROBES.filter((p) => (!onlyGates.length || onlyGates.includes(p.gate)) && (!onlyIds.length || onlyIds.includes(p.id)));
const fullRun = !onlyGates.length && !onlyIds.length;

takeLock();
const recovered = recover();
if (recovered) console.log(`verify-gates: ${recovered}`);

const statusBefore = git('status', '--porcelain');
if (statusBefore !== '' && !flag('--allow-dirty')) {
  fail(
    2,
    'verify-gates: the tree is dirty, and this run rewrites source files.\n' +
      statusBefore.split(LF).slice(0, 12).map((l) => `    ${l}`).join(LF) +
      '\n  Commit or discard first. If the tree is dirty BY DESIGN — an integration with the squash applied and\n' +
      '  not yet committed, a slot with its hand-in files applied — pass --allow-dirty: every byte is still put\n' +
      '  back, and the run proves it against the state it started from.',
  );
}

const ctx = await context();
const touchable = [...new Set(PROBES.map(fileOf))];
const fingerprint = () => Object.fromEntries(touchable.map((rel) => [rel, exists(rel) ? sha(fs.readFileSync(abs(rel))) : null]));
const hashesBefore = fingerprint();

const runGate = (gate) => {
  const r = spawnSync(process.execPath, [GATES[gate]], { cwd: FRONT, encoding: 'utf8' });
  return { green: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

console.log(`── verify-gates: ${selected.length} probe(s) in ${path.relative(REPO, FRONT) || '.'} (${tryGit('rev-parse', '--short', 'HEAD')}${statusBefore ? ', dirty tree allowed' : ''}) ──\n`);

// A probe proves nothing on a gate that is already red.
const gatesInPlay = [...new Set(selected.map((p) => p.gate))].filter((g) => exists(GATES[g]));
const baseline = new Map(gatesInPlay.map((g) => [g, runGate(g)]));
for (const [gate, r] of baseline) {
  if (!r.green) console.log(`RED   ${gate} fails BEFORE anything is planted — its probes cannot run:\n${r.output.trim().split(LF).slice(-8).map((l) => `        ${l}`).join(LF)}\n`);
}

let passed = 0;
let failed = 0;
let dormant = 0;
const results = [];
const note = (probe, verdict, detail) => {
  results.push({ id: probe.id, gate: probe.gate, verdict, detail });
  console.log(`${verdict.padEnd(5)} [${probe.gate}] ${probe.label}\n        ${detail}`);
};

for (const probe of selected) {
  const why = dormancy(probe, ctx);
  if (why) {
    dormant += 1;
    note(probe, 'SKIP', `dormant — ${why}`);
    continue;
  }
  if (!baseline.get(probe.gate).green) {
    failed += 1;
    note(probe, 'FAIL', 'the gate is red before anything is planted');
    continue;
  }
  const rel = fileOf(probe);
  let content;
  if (probe.create) {
    if (exists(rel)) {
      failed += 1;
      note(probe, 'FAIL', `${rel} already exists — this probe plants that file and will not overwrite one`);
      continue;
    }
    content = probe.create(ctx);
  } else {
    content = exists(rel) ? probe.mutate(readText(rel), ctx) : null;
    if (content === null || content === undefined) {
      failed += 1;
      note(probe, 'FAIL', `the anchor is gone from ${rel} — this case tests nothing; re-anchor the probe`);
      continue;
    }
  }
  const expect = typeof probe.expect === 'function' ? probe.expect(ctx) : probe.expect;
  let run;
  try {
    plant(probe, rel, content);
    run = runGate(probe.gate);
  } finally {
    restorePending();
  }
  const said = run.output.match(expect);
  if (!run.green && said) {
    passed += 1;
    const line = run.output.split(LF).find((l) => expect.test(l)) ?? said[0].split(LF)[0];
    note(probe, 'PASS', `said: ${line.trim().slice(0, 150)}`);
  } else {
    failed += 1;
    note(
      probe,
      'FAIL',
      run.green
        ? `THE GATE STAYED GREEN with the defect planted in ${rel}`
        : `rejected, but not for ${expect} — it said:\n${run.output.trim().split(LF).slice(0, 8).map((l) => `          ${l}`).join(LF)}`,
    );
  }
}

// And the tree must be exactly as it was found.
console.log('');
const stillRed = gatesInPlay.filter((g) => baseline.get(g).green && !runGate(g).green);
const statusAfter = git('status', '--porcelain');
const hashesAfter = fingerprint();
const moved = touchable.filter((rel) => hashesBefore[rel] !== hashesAfter[rel]);
const restored = stillRed.length === 0 && statusAfter === statusBefore && moved.length === 0;
if (restored) {
  console.log(
    `PASS  the tree is back byte for byte: git status is ${statusBefore === '' ? 'clean' : 'identical to the start'}, ` +
      `${touchable.length} file hash(es) identical, ${gatesInPlay.length} gate(s) green again`,
  );
} else {
  failed += 1;
  console.log('FAIL  THE TREE DID NOT COME BACK');
  for (const g of stillRed) console.log(`        ${g} is still red`);
  for (const rel of moved) console.log(`        ${rel} differs from what it was`);
  if (statusAfter !== statusBefore) console.log(`        git status changed:\n${statusAfter.split(LF).map((l) => `          ${l}`).join(LF)}`);
}

console.log(`\nverify-gates: ${passed} passed, ${failed} failed, ${dormant} dormant`);

if (failed === 0 && fullRun) {
  if (fs.existsSync(PULSE)) {
    const now = digest(ctx);
    const records = [
      { digest: now.digest, files: now.files, passed, dormant, at: new Date().toISOString(), head: tryGit('rev-parse', '--short', 'HEAD'), dirty: statusBefore !== '', tree: REPO.split(path.sep).join('/') },
      ...readRecords().filter((r) => r.digest !== now.digest),
    ].slice(0, 50);
    fs.mkdirSync(path.dirname(RECORD), { recursive: true });
    fs.writeFileSync(`${RECORD}.tmp`, `${JSON.stringify({ about: 'full green runs of verify-gates, newest first; --fresh looks the current content up here', records }, null, 2)}${LF}`);
    fs.renameSync(`${RECORD}.tmp`, RECORD);
    console.log(`verify-gates: recorded as green for this content (${now.files} gate and anchored files) — \`--fresh\` now answers yes`);
  } else {
    console.log(`verify-gates: not recorded (${PULSE} does not exist) — \`--fresh\` cannot answer yes from here`);
  }
} else if (failed === 0) {
  console.log('verify-gates: a partial run is not recorded — `--fresh` needs a full one');
}

process.exit(failed ? 1 : 0);
