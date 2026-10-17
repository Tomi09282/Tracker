// scripts/check-element-roster.mjs — five copies of one roster, held to each other.
//
// ═══ WHAT THIS IS ABOUT ════════════════════════════════════════════════════════════════════════
//
// "Which feedback elements exist" is written down in five places:
//
//   1. `element_style_config`            — the rows the server serves         (the source of truth)
//   2. `ui/feedback/catalog.ts`          — labels and variant names
//   3. `ui/feedback/ElementStyleProvider`— the curated fallback map
//   4. `features/playground` PREVIEWABLE — which have a live demo
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
//   ═══ … FOR ANYBODY BUT THE PLAYGROUND? ═════════════════════════════════════════════════════
//
// "Read by a component" turned out to be the wrong measurement. Fourteen elements are read by a
// component that only `/playground` mounts: the read exists, the catalogue said `live: true`, and
// the studio told an admin the change "applies to every user" — for an element no user ever sees.
// The third way for the same screen to lie.
//
// So a read counts as LIVE only when the exported component that holds the `useElementVariant`
// call is imported by a file OUTSIDE `features/playground`. The unit is the EXPORT, not the file:
// `E12E16.tsx` exported `Toast` (the product's toast, E15) beside `InteractiveCard` and `Progress`
// (E12, E16 — playground only), and `E14E20.tsx` does the same with `Sheet`.
//
// How an export is found without a parser: a read belongs to the top-level declaration it sits
// in (declarations start in column 0 here, the formatter sees to that); if that declaration is
// not exported, it belongs to every export of the file that mentions it, transitively. Imports
// are read from `import { … } from`, re-exports are followed, and a dynamic `import()` — the
// router's lazy pages — counts as importing everything the file exports. A type-only import
// mounts nothing and does not count.
//
// Run: node scripts/check-element-roster.mjs              (cwd `frontend/`; in `npm run build`)
//      node scripts/check-element-roster.mjs --explain    every read, its export and its importers
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readGateData } from './data/gate-data.mjs';

const SRC = 'src';
const CATALOG = 'src/ui/feedback/catalog.ts';
const PROVIDER = 'src/ui/feedback/ElementStyleProvider.tsx';
const PLAYGROUND = 'src/features/playground/PlaygroundPage.tsx';
/** Everything under here is the QA page: a component only it mounts reaches no user. */
const PLAYGROUND_DIR = 'src/features/playground/';

const LF = String.fromCharCode(10);
const byNumber = (a, b) => Number(a.slice(1)) - Number(b.slice(1));
const order = (set) => [...set].sort(byNumber);
const list = (set) => (set.size ? order(set).join(' ') : 'none');

/** Comments blanked to spaces — offsets and lines survive, and prose about a call is not a call. */
const codeOf = (text) =>
  text
    .replace(/\r\n/g, LF)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (m) => m.replace(/./g, ' '));

/**
 * Every `useElementVariant('E..')` call under `src`, with the exported component that holds it and
 * the files that import that component.
 *
 * The one implementation of "who reads which element": the gate below judges the catalogue with
 * it, and `pulse-variants` asks it who owns a read. Paths are relative to the frontend root
 * (`src/ui/feedback/variants/E2CopyButton.tsx`).
 *
 * @param {{ root?: string }} [options] `root` is the frontend directory (default: the cwd)
 * @returns {{
 *   reads: Array<{ element: string, file: string, line: number, component: string | null,
 *     exports: string[], productImporters: string[], playgroundImporters: string[] }>,
 *   live: Set<string>,            read by a component the product imports
 *   playgroundOnly: Set<string>,  read, and only the playground imports the component
 *   unmounted: Set<string>,       read by a component nothing imports at all
 * }}
 */
export function scanElementReads({ root = '.' } = {}) {
  const abs = (p) => path.join(root, p);
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(path.relative(root, p).split(path.sep).join('/'));
    }
  })(abs(SRC));
  files.sort();
  const known = new Set(files);
  const code = new Map(files.map((f) => [f, codeOf(fs.readFileSync(abs(f), 'utf8'))]));

  const resolve = (from, spec) => {
    if (!spec.startsWith('.')) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    return [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find((f) => known.has(f)) ?? null;
  };
  /** `{ a, b as c, type D }` → [[imported, local], …] without the type-only specifiers. */
  const specifiers = (block) =>
    block
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !/^type\s/.test(s))
      .map((s) => s.split(/\s+as\s+/).map((x) => x.trim()))
      .map(([name, alias]) => [name, alias ?? name]);

  /** file → [{ from: importing file, names: Set<string> | '*' }] */
  const importers = new Map(files.map((f) => [f, []]));
  /** file → [{ via: re-exporting file, name, as }] */
  const reexports = new Map(files.map((f) => [f, []]));
  for (const file of files) {
    const text = code.get(file);
    for (const m of text.matchAll(/\bimport\s+(type\s+)?([\w$]+\s*,\s*)?(?:\{([^}]*)\}|\*\s*as\s+[\w$]+)?\s*from\s*['"]([^'"]+)['"]/g)) {
      const target = resolve(file, m[4]);
      if (!target || m[1]) continue;
      const names = m[0].includes('* as') ? '*' : new Set(specifiers(m[3] ?? '').map(([name]) => name));
      if (names !== '*' && m[2]) names.add('default');
      importers.get(target).push({ from: file, names });
    }
    for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const target = resolve(file, m[1]);
      if (target) importers.get(target).push({ from: file, names: '*' });
    }
    for (const m of text.matchAll(/\bexport\s+(?:\{([^}]*)\}|\*)\s*from\s*['"]([^'"]+)['"]/g)) {
      const target = resolve(file, m[2]);
      if (!target) continue;
      if (m[1] === undefined) reexports.get(target).push({ via: file, name: '*', as: '*' });
      else for (const [name, as] of specifiers(m[1])) reexports.get(target).push({ via: file, name, as });
    }
  }

  /** Every file that imports `name` from `file`, re-exports followed. */
  const importersOf = (file, name, seen = new Set()) => {
    const key = `${file}#${name}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const direct = importers
      .get(file)
      .filter((i) => i.names === '*' || i.names.has(name))
      .map((i) => i.from);
    const through = reexports
      .get(file)
      .filter((r) => r.name === '*' || r.name === name)
      .flatMap((r) => importersOf(r.via, r.as === '*' ? name : r.as, seen));
    return [...direct, ...through];
  };

  const reads = [];
  for (const file of files) {
    const text = code.get(file);
    const calls = [...text.matchAll(/useElementVariant\(\s*'(E\d+)'/g)];
    if (calls.length === 0) continue;

    // The top-level declarations of the file, in order. Column 0 is what makes one "top-level".
    const declarations = [...text.matchAll(/^(export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/gm)].map(
      (m) => ({ name: m[2], exported: Boolean(m[1]), start: m.index, exportedAs: m[1] ? (/default/.test(m[1]) ? 'default' : m[2]) : null }),
    );
    for (const m of text.matchAll(/^export\s+\{([^}]*)\}\s*;?\s*$/gm)) {
      for (const [name, as] of specifiers(m[1])) {
        const d = declarations.find((x) => x.name === name);
        if (d) Object.assign(d, { exported: true, exportedAs: as });
      }
    }
    for (const m of text.matchAll(/^export\s+default\s+([\w$]+)\s*;/gm)) {
      const d = declarations.find((x) => x.name === m[1]);
      if (d) Object.assign(d, { exported: true, exportedAs: 'default' });
    }
    const bodyOf = (d) => {
      const next = declarations.find((x) => x.start > d.start);
      return text.slice(d.start, next ? next.start : text.length);
    };
    /** The exports through which a declaration reaches the outside: itself, or whoever mentions it. */
    const exportsReaching = (d, seen = new Set()) => {
      if (seen.has(d.name)) return [];
      seen.add(d.name);
      if (d.exported) return [d.exportedAs];
      const word = new RegExp(`(?<![\\w$.])${d.name.replace(/\$/g, '\\$')}(?![\\w$])`);
      return declarations.filter((x) => x !== d && word.test(bodyOf(x))).flatMap((x) => exportsReaching(x, seen));
    };

    for (const call of calls) {
      const holder = declarations.filter((d) => d.start <= call.index).at(-1) ?? null;
      const exports = holder ? [...new Set(exportsReaching(holder))] : [];
      // A read outside every declaration belongs to the module itself: whoever imports the file.
      const from = holder ? exports.flatMap((name) => importersOf(file, name)) : importers.get(file).map((i) => i.from);
      const all = [...new Set(from)].filter((f) => f !== file).sort();
      const inPlayground = file.startsWith(PLAYGROUND_DIR);
      reads.push({
        element: call[1],
        file,
        line: text.slice(0, call.index).split(LF).length,
        component: holder ? holder.name : null,
        exports,
        // A read INSIDE the playground reaches no user whoever imports the page.
        productImporters: inPlayground ? [] : all.filter((f) => !f.startsWith(PLAYGROUND_DIR)),
        playgroundImporters: inPlayground ? [file] : all.filter((f) => f.startsWith(PLAYGROUND_DIR)),
      });
    }
  }
  reads.sort((a, b) => byNumber(a.element, b.element) || a.file.localeCompare(b.file) || a.line - b.line);

  const live = new Set(reads.filter((r) => r.productImporters.length).map((r) => r.element));
  const playgroundOnly = new Set(
    reads.filter((r) => !live.has(r.element) && r.playgroundImporters.length).map((r) => r.element),
  );
  const unmounted = new Set(reads.filter((r) => !live.has(r.element) && !playgroundOnly.has(r.element)).map((r) => r.element));
  return { reads, live, playgroundOnly, unmounted };
}

/* ── the gate ─────────────────────────────────────────────────────────────────────────────────── */

function main(argv) {
  /**
   * Elements that exist and that no product component reads.
   *
   * Each needs a reason, because the reason is what tells a reviewer whether it is a gap to close or
   * a row to delete. An entry here is a promise that the studio will label it as inert.
   *
   * The list is DATA: `scripts/data/elements-dormant.json`, one reason per element, written by the
   * tool that also flips `live` in the catalogue (`pulse-variants`) — the two have to change
   * together, or check 3 and check 4 below disagree. Nobody edits it by hand.
   */
  const DORMANT = readGateData('elements-dormant');

  const read = (p) => fs.readFileSync(p, 'utf8');
  const ids = (text, re) => new Set([...text.matchAll(re)].map((m) => m[1]));

  const catalogSrc = read(CATALOG);
  const catalog = ids(catalogSrc, /id: '(E\d+)'/g);
  const fallback = ids(read(PROVIDER), /'(E\d+)'/g);
  const playgroundSrc = read(PLAYGROUND);
  const demos = ids(playgroundSrc, /case '(E\d+)':/g);

  // The PREVIEWABLE literal, read as its own set so it can be compared with the switch it describes.
  const implementedBlock = /const PREVIEWABLE = new Set\(\[([\s\S]*?)\]\)/.exec(playgroundSrc);
  const implemented = implementedBlock ? ids(implementedBlock[1], /'(E\d+)'/g) : new Set();

  const { reads, live, playgroundOnly, unmounted } = scanElementReads();
  const consumers = new Set(reads.map((r) => r.element));
  const readsOf = (id) => reads.filter((r) => r.element === id);
  const where = (id) =>
    readsOf(id)
      .map((r) => `${r.component ?? 'module scope'} in ${r.file.replace(/^src\//, '')}`)
      .join('; ');

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
        problems.push(`  and it is missing ${list(short)}, which render unstyled until the server answers.`);
      }
    }
  }

  /* 2 — PREVIEWABLE must be exactly the demos that exist. It is a hand-written copy of a switch. */
  {
    const claimed = missingFrom(implemented, demos);
    const unclaimed = missingFrom(demos, implemented);
    if (!implementedBlock) problems.push(`${PLAYGROUND} no longer declares PREVIEWABLE — this check is blind`);
    if (claimed.size) {
      problems.push(
        `PREVIEWABLE claims ${list(claimed)} but the Demo switch has no case for them — the playground\n` +
          '      would render an empty preview tile and call it implemented.',
      );
    }
    if (unclaimed.size) {
      problems.push(
        `the Demo switch handles ${list(unclaimed)} but PREVIEWABLE omits them — the playground files\n` +
          '      a working preview under "not yet built".',
      );
    }
  }

  /*
   * 3 — `catalog.live` must be exactly the elements a PRODUCT component reads.
   *
   * This is the field the studio and the playground both render from, and it is the one that says
   * whether changing an element does anything at all. Held to a measurement rather than to a habit,
   * in BOTH directions: an element marked live with no product reader would let the studio promise
   * an effect it cannot deliver, and one marked dead that ships would hide a working control.
   *
   * Note what is NOT checked here. "Live" and "previewable" are different properties, and the first
   * attempt at this gate conflated them — it demanded a demo tile for every shipped element, which
   * pushed E21/E22/E25/E26 into PREVIEWABLE without a switch case behind them and produced four empty
   * boxes labelled implemented. Missing previews are reported below as a count, not as a failure.
   */
  {
    const declaredLive = ids(catalogSrc, /id: '(E\d+)',[\s\S]{0,160}?live: true,/g);
    const overclaimed = missingFrom(declaredLive, live);
    const underclaimed = missingFrom(live, declaredLive);
    const onlyPlayground = new Set([...overclaimed].filter((id) => consumers.has(id)));
    const nobody = missingFrom(overclaimed, onlyPlayground);
    if (onlyPlayground.size) {
      problems.push(
        `the catalogue marks ${list(onlyPlayground)} live, and only the playground renders what reads them:\n` +
          order(onlyPlayground)
            .map((id) => `        ${id.padEnd(4)} ${where(id)}\n`)
            .join('') +
          '      The studio would promise a change every user gets, for an element no user ever sees.\n' +
          '      Set live: false and declare it dormant ("playground only") — or mount the component.',
      );
    }
    if (nobody.size) {
      problems.push(
        `the catalogue marks ${list(nobody)} live, and no component calls useElementVariant on them.\n` +
          '      The studio would offer a variant switch that changes nothing while saying it is live.',
      );
    }
    for (const id of order(underclaimed)) {
      const by = readsOf(id).flatMap((r) => r.productImporters.map((f) => f.replace(/^src\//, '')));
      problems.push(
        `${id} is read by a component the product renders (${where(id)}; imported by ${[...new Set(by)].slice(0, 3).join(', ')})\n` +
          '      and the catalogue marks it not live. A working control is being hidden — set live: true.',
      );
    }
    const ghost = missingFrom(consumers, catalog);
    if (ghost.size) problems.push(`components read ${list(ghost)}, which the catalogue does not list`);
  }

  /* 4 — an element no product component reads must be DECLARED, so the studio can say so. */
  {
    const inert = missingFrom(catalog, live);
    const undeclared = missingFrom(inert, new Set(DORMANT.keys()));
    const stale = new Set([...DORMANT.keys()].filter((id) => live.has(id)));
    const unknown = missingFrom(new Set(DORMANT.keys()), catalog);
    const unread = missingFrom(undeclared, consumers);
    const playgroundRead = missingFrom(undeclared, unread);
    if (unread.size) {
      problems.push(
        `${list(unread)} exist in the catalogue and NO component reads them.\n` +
          '      An admin can set, save and audit a variant that provably changes nothing. Either give\n' +
          '      them a consumer, or add them to DORMANT with a reason so the studio can label them inert.',
      );
    }
    if (playgroundRead.size) {
      problems.push(
        `${list(playgroundRead)} are read only by components the playground mounts, and DORMANT does not list them.\n` +
          '      An admin can set a variant no user will ever see. Declare them dormant with the reason\n' +
          '      ("playground only"), so the studio labels them inert.',
      );
    }
    if (stale.size) {
      problems.push(
        `DORMANT still lists ${list(stale)}, which product components read — delete the entries, and let the\n` +
          '      studio stop calling a working element inert.',
      );
    }
    if (unknown.size) problems.push(`DORMANT lists ${list(unknown)}, which the catalogue does not have — delete the entries`);
  }

  const unreadCount = missingFrom(catalog, consumers).size;
  const noPreview = order(missingFrom(live, implemented));
  console.log(
    `check-element-roster: ${catalog.size} in the catalogue — ${live.size} live in the product, ` +
      `${playgroundOnly.size} read by the playground only, ${unreadCount} read by nothing, ` +
      `${implemented.size} previewable, ${DORMANT.size} declared dormant`,
  );
  if (unmounted.size) {
    console.log(`                      read by a component nothing imports: ${list(unmounted)}`);
  }
  // Reported, not enforced: a shipped element with no demo tile is a gap in the QA matrix, not a
  // defect in the product. Naming it keeps it from becoming invisible.
  if (noPreview.length) {
    console.log(`                      live with no playground demo: ${noPreview.join(' ')}`);
  }

  if (argv.includes('--explain')) {
    console.log('');
    for (const r of reads) {
      const verdict = r.productImporters.length
        ? `PRODUCT   ${r.productImporters.map((f) => f.replace(/^src\//, '')).join(', ')}`
        : r.playgroundImporters.length
          ? 'PLAYGROUND ONLY'
          : 'UNMOUNTED';
      console.log(`  ${r.element.padEnd(4)} ${`${r.file.replace(/^src\//, '')}:${r.line}`.padEnd(42)} ${(r.component ?? '-').padEnd(16)} ${verdict}`);
    }
  }

  if (problems.length) {
    console.log('');
    for (const p of problems) console.log(`  ${p}`);
    console.log(`\ncheck-element-roster FAILED — ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('check-element-roster: OK — the four frontend copies agree, and nothing inert is undeclared');
}

// Importing this file (`pulse-variants` and `verify-gates` use the scan) must not run the gate.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
