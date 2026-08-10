// scripts/check-element-roster.mjs — five copies of one roster, held to each other.
//
// ═══ WHAT THIS IS ABOUT ════════════════════════════════════════════════════════════════════════
//
// "Which feedback elements exist" is written down in five places:
//
//   1. `element_style_config`            — the rows the server serves         (the source of truth)
//   2. `ui/feedback/catalog.ts`          — labels and variant names
//   3. `ui/feedback/ElementStyleProvider`— the curated fallback map
//   4. `features/playground` IMPLEMENTED — which have a live demo
//   5. `useElementVariant('E..')` calls  — which actually CHANGE anything
//
// They have already drifted, twice, and both times silently:
//
//   * migration 012 added E27. The route's id regex enumerated E1–E26, so **nothing could set it**,
//     and the smoke suite carried the same wrong number in an `Array.from({ length: 26 })`.
//
//   * E21, E22, E25 and E26 ship live consumers and the playground lists them as PENDING. A screen
//     whose entire job is showing what is live was wrong about four of them.
//
// The first copy is the database's and cannot be checked from here — the smoke suite's parity
// assertion does that, against a running server. This gate covers the four that live in the
// frontend, and it covers the question the studio has to answer honestly:
//
//   ═══ DOES CHANGING THIS ELEMENT DO ANYTHING? ════════════════════════════════════════════════
//
// E23, E24 and E27 have rows, labels and a settable endpoint, and NO component reads them. An admin
// can pick a variant, watch it save, see it audited — and nothing anywhere changes. A studio that
// renders all 27 identically is a screen that lies once per dormant element, so the dormant ones
// have to be declared here, by hand, with a reason.
//
// Run: node scripts/check-element-roster.mjs
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const CATALOG = 'src/ui/feedback/catalog.ts';
const PROVIDER = 'src/ui/feedback/ElementStyleProvider.tsx';
const PLAYGROUND = 'src/features/playground/PlaygroundPage.tsx';

/**
 * Elements that exist but nothing reads YET.
 *
 * Each needs a reason, because the reason is what tells a reviewer whether it is a gap to close or
 * a row to delete. An entry here is a promise that the studio will label it as inert.
 */
const DORMANT = new Map([
  ['E23', 'Chart reveal — the charts render their own entrance; no component reads the variant yet'],
  ['E24', 'Streak flame — the streak badge is static; the variant has no consumer'],
  ['E27', 'Interval stage — added by migration 012 for the interval player, which does not read it'],
]);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
})(SRC);

const read = (p) => fs.readFileSync(p, 'utf8');
const ids = (text, re) => new Set([...text.matchAll(re)].map((m) => m[1]));
const order = (set) => [...set].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const list = (set) => (set.size ? order(set).join(' ') : 'none');

const catalog = ids(read(CATALOG), /id: '(E\d+)'/g);
const fallback = ids(read(PROVIDER), /'(E\d+)'/g);
const playgroundSrc = read(PLAYGROUND);
const demos = ids(playgroundSrc, /case '(E\d+)':/g);

// The IMPLEMENTED literal, read as its own set so it can be compared with the switch it describes.
const implementedBlock = /const IMPLEMENTED = new Set\(\[([\s\S]*?)\]\)/.exec(playgroundSrc);
const implemented = implementedBlock ? ids(implementedBlock[1], /'(E\d+)'/g) : new Set();

const consumers = new Set();
for (const f of files) {
  for (const m of read(f).matchAll(/useElementVariant\(\s*'(E\d+)'/g)) consumers.add(m[1]);
}

const problems = [];
const missingFrom = (a, b) => new Set([...a].filter((x) => !b.has(x)));

/*
 * 1 — the fallback map must be DERIVED from the catalogue, not typed out beside it.
 *
 * The first draft of this check compared two lists of ids and reported all 27 as missing, because
 * `ElementStyleProvider` does not contain a single element id: it builds the map with
 * `Object.fromEntries(CATALOG.map(...))`. That is the right answer — the copy that cannot drift is
 * the one that does not exist — and the check was measuring for a defect the file had already
 * designed away.
 *
 * So what is asserted is the derivation. If somebody ever writes the ids out by hand, the ids are
 * compared instead, and any gap is reported. One rule, covering both shapes.
 */
{
  const providerSrc = read(PROVIDER);
  const derived = /CATALOG\.map\(/.test(providerSrc);
  if (!derived) {
    const extra = missingFrom(fallback, catalog);
    const short = missingFrom(catalog, fallback);
    problems.push(
      `${PROVIDER} no longer derives its fallback from CATALOG. A hand-written map is a copy of the\n` +
        '      roster, and it will drift — that is what this whole file is about.',
    );
    if (extra.size) problems.push(`  and it lists elements the catalogue does not: ${list(extra)}`);
    if (short.size) {
      problems.push(
        `  and it is missing ${list(short)}, which render unstyled until the server answers.`,
      );
    }
  }
}

/* 2 — IMPLEMENTED must be exactly the demos that exist. It is a hand-written copy of a switch. */
{
  const claimed = missingFrom(implemented, demos);
  const unclaimed = missingFrom(demos, implemented);
  if (!implementedBlock) problems.push(`${PLAYGROUND} no longer declares IMPLEMENTED — this check is blind`);
  if (claimed.size) {
    problems.push(
      `IMPLEMENTED claims ${list(claimed)} but the Demo switch has no case for them — the playground\n` +
        '      would render an empty preview tile and call it implemented.',
    );
  }
  if (unclaimed.size) {
    problems.push(
      `the Demo switch handles ${list(unclaimed)} but IMPLEMENTED omits them — the playground files\n` +
        '      a working preview under "not yet built".',
    );
  }
}

/*
 * 3 — `catalog.live` must be exactly the measured set of `useElementVariant` call sites.
 *
 * This is the field the studio and the playground both render from, and it is the one that says
 * whether changing an element does anything at all. Held to a measurement rather than to a habit,
 * in BOTH directions: an element marked live with no reader would let the studio promise an effect
 * it cannot deliver, and one marked dead that ships would hide a working control.
 *
 * Note what is NOT checked here. "Live" and "previewable" are different properties, and the first
 * attempt at this gate conflated them — it demanded a demo tile for every shipped element, which
 * pushed E21/E22/E25/E26 into IMPLEMENTED without a switch case behind them and produced four empty
 * boxes labelled implemented. Missing previews are reported below as a count, not as a failure.
 */
{
  const declaredLive = ids(read(CATALOG), /id: '(E\d+)',[\s\S]{0,160}?live: true,/g);
  const overclaimed = missingFrom(declaredLive, consumers);
  const underclaimed = missingFrom(consumers, declaredLive);
  if (overclaimed.size) {
    problems.push(
      `the catalogue marks ${list(overclaimed)} live, and no component calls useElementVariant on them.\n` +
        '      The studio would offer a variant switch that changes nothing while saying it is live.',
    );
  }
  if (underclaimed.size) {
    problems.push(
      `${list(underclaimed)} are read by real components and the catalogue marks them not live.\n` +
        '      A working control is being hidden — set live: true.',
    );
  }
  const ghost = missingFrom(consumers, catalog);
  if (ghost.size) problems.push(`components read ${list(ghost)}, which the catalogue does not list`);
}

/* 4 — an element nothing reads must be DECLARED, so the studio can say so. */
{
  const inert = missingFrom(catalog, consumers);
  const undeclared = missingFrom(inert, new Set(DORMANT.keys()));
  const stale = new Set([...DORMANT.keys()].filter((id) => consumers.has(id)));
  if (undeclared.size) {
    problems.push(
      `${list(undeclared)} exist in the catalogue and NO component reads them.\n` +
        '      An admin can set, save and audit a variant that provably changes nothing. Either give\n' +
        '      them a consumer, or add them to DORMANT with a reason so the studio can label them inert.',
    );
  }
  if (stale.size) {
    problems.push(
      `DORMANT still lists ${list(stale)}, which now HAVE consumers — delete the entries, and let the\n` +
        '      studio stop calling a working element inert.',
    );
  }
}

const noPreview = order(missingFrom(consumers, implemented));
console.log(
  `check-element-roster: ${catalog.size} in the catalogue — ${consumers.size} with live consumers, ` +
    `${implemented.size} previewable, ${DORMANT.size} declared dormant`,
);
// Reported, not enforced: a shipped element with no demo tile is a gap in the QA matrix, not a
// defect in the product. Naming it keeps it from becoming invisible.
if (noPreview.length) {
  console.log(`                      live with no playground demo: ${noPreview.join(' ')}`);
}

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  ${p}`);
  console.log(`\ncheck-element-roster FAILED — ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('check-element-roster: OK — the four frontend copies agree, and nothing inert is undeclared');
