#!/usr/bin/env node
/**
 * check-pulse — the ratchet: what is left of the old look, counted per file, and only ever going down.
 *
 * ═══ WHY ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * The switch to Pulse changed VALUES and kept every legacy NAME declared, so that 140 files written
 * against the old look still build. That bridge hides leftovers by construction: a card whose fill,
 * border and shadow are now transparent is invisible, not gone. It still pads its content, it still
 * sits in the layout, and nothing on screen says so. A screen can be "rebuilt" with half its old
 * boxes still in it and look fine on the day it is reviewed.
 *
 * So the leftovers are counted. Every legacy construct is a RULE with an id; every file's count per
 * rule is held against a BUDGET; a budget may only go down; a file with no budget entry must count
 * zero. A package is finished when its budget file is gone, and the bridge can be deleted when the
 * last budget file is.
 *
 * ═══ THE RULES ═════════════════════════════════════════════════════════════════════════════════
 *
 * `node scripts/check-pulse.mjs --list-rules` prints them; RULES below is the list. Each rule carries
 * the defect it exists for (`probe`), and three things hold a rule to it:
 *
 *   * every run starts by counting each rule's own probe and its controls in memory — a rule that no
 *     longer counts its construct, or that started counting a legal one, fails the build at once;
 *   * `verify:gates` plants each probe as a real file, runs the real gate and expects the failure
 *     that names the rule (one planted defect per rule id);
 *   * at stage G-c the totals were compared with an independent `git grep` count of the same tree
 *     (docs/pipeline/pulse/pkg/F2/c/counts.md explains every difference).
 *
 * What is read: `.ts`, `.tsx` and `.css` under `src`, except `ui/tokens/tokens.css` (it DECLARES the
 * bridge). Comments are blanked first. A class name counts only inside a string or template literal
 * — a variable called `rounded` is not a radius.
 *
 * What a text scan cannot follow, and therefore does not claim: a variant that travels through a
 * prop of ANOTHER file (`<PublicTopBar cta="secondary">`), a class name assembled at run time, a
 * `size` that arrives through a spread. The first is caught where the prop is declared (the alias
 * rule below), the others by the type checker when the legacy variants are deleted.
 *
 * ═══ THE BUDGETS ═══════════════════════════════════════════════════════════════════════════════
 *
 *   docs/pipeline/pulse/pkg/<id>/budget.json     one per lane and package: exactly the files it owns
 *   docs/pipeline/pulse/pkg/_int/budget.json     everything the integrator keeps
 *
 *   { "about": "…", "id": "S-home", "files": { "frontend/src/…/HomePage.tsx": { "surface": 3, … } } }
 *
 * They are GENERATED from docs/pipeline/pulse/work-packages.json (`--init`, the integrator, once,
 * on the merged tree) and after that only lowered (`--fix-down <id>`), by whoever owns the file.
 *
 *   count > budget                     fails — a legacy construct was added
 *   count < budget                     fails until the budget is lowered: that is the done signal
 *   a counted file in no budget file   fails — new code is written without legacy constructs
 *   an entry for a file that is gone, an all-zero entry, an empty budget file
 *                                      fail until deleted (`--fix-down` deletes them)
 *   a file in two budget files, an entry in the budget of an id that does not own the file
 *                                      fail
 *
 * With no budget file left and nothing counted, every rule is simply a ban.
 *
 * Ownership is read through the glob expander of `pulse-owns-check.mjs` (PLAN.md R31: one expander
 * for every tool). In a tree that does not hold that script yet the ownership leg says so and is
 * skipped, and `--init` refuses.
 *
 * ═══ THE KEPT RULES ════════════════════════════════════════════════════════════════════════════
 *
 * Two things the redesign must not lose while it deletes: `src/index.css` still holds the global
 * `:focus-visible` ring and the reduced-motion backstop. Pulse defines no focus state of its own,
 * so the ring is the only one there is.
 *
 * ═══ USAGE (cwd anywhere) ══════════════════════════════════════════════════════════════════════
 *
 *   node scripts/check-pulse.mjs                     the gate (wired into `npm run build`)
 *   node scripts/check-pulse.mjs --report [--json]   totals per rule and per budget; never fails on a budget
 *   node scripts/check-pulse.mjs --where <id|path>   every counted site of a budget id or a file, by line
 *   node scripts/check-pulse.mjs --fix-down <id>     lower the budget of <id> to what is counted (never raises)
 *   node scripts/check-pulse.mjs --init [--force]    generate every budget file from the ownership file
 *   node scripts/check-pulse.mjs --list-rules        the rule ids
 *   node scripts/check-pulse.mjs --self-test         only the in-memory proof of the rules
 *   --root <frontend dir>   count another checkout (with --report / --where)
 *   --budgets <dir>         another folder than docs/pipeline/pulse/pkg (a dry run)
 *
 * Exit: 0 holds · 1 a rule, a budget or a kept rule fails · 2 usage.
 *
 * Exports, for the tools (PLAN.md R31 — a tool imports the gate's counter, it never repeats it):
 *   countRules(source, relPath) -> { ruleId: n }   pure; relPath is relative to `frontend/`
 *   scanSource, scanTree, readBudgets, judge, keptRuleProblems, RULES, verifyGatesProbes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FRONT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.dirname(FRONT);
const DOCS = path.join(REPO, 'docs', 'pipeline', 'pulse');
const WORK_PACKAGES = path.join(DOCS, 'work-packages.json');
const DEFAULT_BUDGETS = path.join(DOCS, 'pkg');
const OWNS_TOOL = path.join(FRONT, 'scripts', 'pulse-owns-check.mjs');
const INT_ID = '_int';
const LF = String.fromCharCode(10);
const TOKEN_FILE = 'src/ui/tokens/tokens.css';
const INDEX_CSS = 'src/index.css';
const posix = (p) => p.split(path.sep).join('/');

/* ═══ the vocabulary of the old look ═══════════════════════════════════════════════════════════ */

/** A class name is always assembled here, never spelled out: Tailwind scans this folder too. */
const tw = (...parts) => parts.join('-');
const arb = (prefix, value) => `${prefix}-[${value}]`;
const alt = (list) => list.join('|');
/** A class token starts here … and ends here. A `:` or `!` before it is a variant, a `/` after it an opacity. */
const B = '(?<![\\w-])';
const E = '(?![\\w-])';

/** The ten steps of the ramp Pulse replaces (PLAN.md R3). Three carry `-legacy`: Pulse re-uses their names. */
const LEGACY_TYPE_STEPS = ['title-1', 'title-2', 'title-3', 'body-strong', 'body-s', 'caption', 'timer', 'body-legacy', 'display-legacy', 'micro-legacy'];

/** Utilities that paint a colour. The same list `check-tokens` holds the stock palette to. */
const COLOR_PREFIXES = ['bg', 'text', 'border', 'ring', 'fill', 'stroke', 'outline', 'decoration', 'divide', 'from', 'via', 'to', 'caret', 'placeholder'];

const RADIUS_SIDES = ['t', 'r', 'b', 'l', 's', 'e', 'tl', 'tr', 'bl', 'br', 'ss', 'se', 'es', 'ee'];
const RADIUS_LEGACY = ['card', 'field', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];

/**
 * Token names the closing cleanup DELETES (tokens.css marks each "BRIDGE"; PLAN.md 7.3 rows 1, 2, 6).
 *
 * Not here, on purpose: `--focus-ring` (the kept rule below needs it), `--sheet-bg`, `--skeleton-*`,
 * `--field-*` and `--muscle-*` — component tokens that STAY and were only re-valued.
 */
const BRIDGED_TOKENS = [
  // decoration, now neutral: glass, rim, sheen, aurora, grain, tile tint, elevation, blur, the card
  'glass-1', 'glass-2', 'glass-3', 'glass-rim', 'glass-lip', 'glass-underside', 'glass-sheen', 'glass-sheen-angle',
  'card-bg', 'card-rim', 'card-border', 'card-blur', 'card-saturate', 'card-radius',
  'tile-tint', 'aurora', 'noise-overlay', 'gradient-brand',
  'shadow-overlay', 'shadow-overlay-strong', 'sheet-shadow',
  ...['sm', 'md', 'lg', 'xl'].map((step) => `blur-${step}`), 'sheet-blur', 'nav-blur', 'toast-blur',
  // the slab of the old bar and the old toast
  'nav-bg', 'nav-fg-active', 'nav-fg-idle', 'toast-bg',
  // state names: still visible, derived from the lamp
  'accent-subtle', 'accent-border', 'on-accent-subtle', 'accent-hover',
  'success-subtle', 'warning-subtle', 'danger-subtle', 'info-subtle',
  'success-border', 'warning-border', 'danger-border', 'info-border',
  'on-success', 'on-warning', 'on-danger', 'on-info', 'info',
  'tile-tint-fg', 'overlay-border', 'scrim-strong',
  ...['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].map((step) => `accent-${step}`),
  // layout of the card and of the detached bar
  'card-pad', 'radius-inset', 'nav-dock-offset', ['content', 'pad', 'b', 'lg'].join('-'),
  // the pill's first-build aliases, consumed by nothing
  'btn-bg', 'btn-fg', 'btn-bg-hover', 'btn-bg-pressed', 'btn-radius',
];

/**
 * Where `surface-2` and `surface-3` are legal as a utility (Pulse System 2.1): the skeleton block,
 * the disabled pill, the switch's off track. The fourth legal use — the bottom sheet — paints
 * through its own token (`--sheet-bg`), as the skeleton may through `--skeleton-base`; a token is
 * not counted by this rule, so those two need no entry.
 */
const SURFACE_ALLOW = [
  { file: 'src/ui/feedback/ScreenSkeleton.tsx', level: '2', what: 'the skeleton block' },
  { file: 'src/ui/primitives/control.ts', level: '2', after: 'disabled:', what: 'the disabled pill' },
  { file: 'src/ui/primitives/Switch.tsx', level: '3', what: "the switch's off track" },
];

const RE = {
  legacyType: new RegExp(`${B}text-(?:${alt(LEGACY_TYPE_STEPS)})${E}`, 'g'),
  // Followed by `:` it is the CSS descriptor of an @font-face, not a class.
  fontDisplay: new RegExp(`${B}font-display(?![\\w:-])`, 'g'),
  legacyRadius: new RegExp(`${B}rounded(?:-(?:${alt(RADIUS_SIDES)}))?(?:-(?:${alt(RADIUS_LEGACY)}))?${E}`, 'g'),
  anyRadius: new RegExp(`${B}rounded(?![\\w])`),
  wash: new RegExp(
    `${B}(?:(?:${alt(COLOR_PREFIXES)})-(?:[a-z]+-subtle|on-[a-z]+(?:-[a-z]+)*|[a-z]+-border|info(?:-[a-z]+)*|accent-hover|scrim-strong)${E}` +
      `|bg-\\[var\\(--tile-tint\\)\\])`,
    'g',
  ),
  // The glow utility and its arbitrary twin are the one shadow Pulse has.
  blurShadowClass: new RegExp(
    `${B}(?:${alt([tw('backdrop', 'blur'), 'blur-', tw('drop', 'shadow')])}|(?:text-|inset-)?shadow-(?!glow${E})(?!\\[var\\(--shadow-glow\\)\\]))`,
    'g',
  ),
  blurShadowStyle: /(?<![\w$.])(?:boxShadow|textShadow|backdropFilter|WebkitBackdropFilter)\s*:/g,
  surface1Class: new RegExp(`${B}(?:${alt(COLOR_PREFIXES)})-surface-1${E}`, 'g'),
  surface1Var: /var\(\s*--surface-1\s*[,)]/g,
  surface23: new RegExp(`${B}bg-surface-([23])${E}`, 'g'),
  blackWhite: new RegExp(`${B}(?:${alt(COLOR_PREFIXES)})-(?:black|white)${E}`, 'g'),
  // The name must be CLOSED, as in check-tokens: `var(--accent-${step})` is assembled at run time.
  legacyVar: new RegExp(
    `var\\(\\s*--(?:${alt(BRIDGED_TOKENS)}|text-(?:${alt(LEGACY_TYPE_STEPS)})(?:--[a-z-]+)?)\\s*[,)]`,
    'g',
  ),
  chipCall: /(?<![\w$.])chip\s*\(/g,
  controlCall: /(?<![\w$.])control\s*\(/g,
  tag: /<([A-Za-z][\w.]*)(?=[\s/>])/g,
  variantLiteral: /(['"`])(primary|secondary|ghost|danger)\1/g,
  bareName: /^[A-Za-z_$][\w$]*$/,
};
const LEGACY_VARIANTS = new Set(['secondary', 'ghost', 'danger']);
const NOT_AN_ALIAS = new Set(['variant', 'undefined', 'null', 'true', 'false']);
/** A value is given to `name`: an attribute, a property, a default, an assignment — never a comparison. */
const givenTo = (name) => new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}\\s*\\??\\s*(?::(?!:)|=(?![=>]))`, 'g');

/* ═══ reading a source file ════════════════════════════════════════════════════════════════════ */

/**
 * The source with its comments blanked (same length, same lines) and a mask of what lies inside a
 * string or template literal.
 *
 * It does not parse JSX text or regular-expression literals. An apostrophe in JSX text opens a
 * "string" that ends with its line; a `//` in a regex ends the line. Both can only leave a comment
 * standing or hide the rest of ONE line — measured against the TypeScript scanner on the whole tree
 * (pkg/F2/c/counts.md): no count differs.
 */
export function lex(source, { css = false } = {}) {
  const n = source.length;
  const out = source.split('');
  const inString = new Uint8Array(n);
  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) if (out[k] !== LF && out[k] !== '\r') out[k] = ' ';
  };
  if (css) {
    for (let i = source.indexOf('/*'); i !== -1; ) {
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      blank(i, end);
      i = source.indexOf('/*', end);
    }
    return { code: out.join(''), inString };
  }
  // `template: true` — inside the text of a template literal; otherwise code, possibly the code of
  // a `${…}` (then `depth` counts its own braces, so the closing one is found).
  const modes = [{ template: false, interpolation: false, depth: 0 }];
  let i = 0;
  while (i < n) {
    const mode = modes[modes.length - 1];
    const c = source[i];
    const d = source[i + 1];
    if (mode.template) {
      if (c === '\\') {
        inString.fill(1, i, Math.min(i + 2, n));
        i += 2;
      } else if (c === '`') {
        modes.pop();
        i += 1;
      } else if (c === '$' && d === '{') {
        modes.push({ template: false, interpolation: true, depth: 0 });
        i += 2;
      } else {
        inString[i] = 1;
        i += 1;
      }
    } else if (c === '/' && d === '/') {
      const eol = source.indexOf(LF, i);
      const end = eol === -1 ? n : eol;
      blank(i, end);
      i = end;
    } else if (c === '/' && d === '*') {
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && source[j] !== c && source[j] !== LF) j += source[j] === '\\' ? 2 : 1;
      inString.fill(1, i + 1, Math.min(j, n));
      i = j + 1;
    } else if (c === '`') {
      modes.push({ template: true });
      i += 1;
    } else {
      if (mode.interpolation) {
        if (c === '{') mode.depth += 1;
        else if (c === '}') {
          if (mode.depth === 0) modes.pop();
          else mode.depth -= 1;
        }
      }
      i += 1;
    }
  }
  return { code: out.join(''), inString };
}

/** `code[i]` is a quote: the index after its closing partner. */
function skipQuoted(code, i) {
  const quote = code[i];
  let j = i + 1;
  if (quote === '`') {
    while (j < code.length && code[j] !== '`') {
      if (code[j] === '\\') j += 2;
      else if (code[j] === '$' && code[j + 1] === '{') j = skipBalanced(code, j + 1);
      else j += 1;
    }
    return j + 1;
  }
  while (j < code.length && code[j] !== quote && code[j] !== LF) j += code[j] === '\\' ? 2 : 1;
  return j + 1;
}

/** `code[i]` is `{`, `(` or `[`: the index after its closing partner. */
function skipBalanced(code, i) {
  let depth = 0;
  let j = i;
  while (j < code.length) {
    const c = code[j];
    if (c === '"' || c === "'" || c === '`') {
      j = skipQuoted(code, j);
      continue;
    }
    if (c === '{' || c === '(' || c === '[') depth += 1;
    else if (c === '}' || c === ')' || c === ']') {
      depth -= 1;
      if (depth <= 0) return j + 1;
    }
    j += 1;
  }
  return code.length;
}

const skipSpace = (code, i) => {
  let j = i;
  while (j < code.length && /\s/.test(code[j])) j += 1;
  return j;
};

/**
 * Every JSX opening tag, with the attributes that are ITS OWN: an attribute of an element nested
 * in one of its expressions belongs to that element. A generic (`useState<string | null>`) is read
 * as a tag with no attribute anyone asks about.
 */
function scanTags(code, inString) {
  const tags = [];
  for (const m of code.matchAll(RE.tag)) {
    if (inString[m.index]) continue;
    const attrs = new Map();
    let j = m.index + m[0].length;
    const limit = Math.min(code.length, j + 20000);
    while (j < limit && code[j] !== '>') {
      const c = code[j];
      if (c === '"' || c === "'" || c === '`') j = skipQuoted(code, j);
      else if (c === '{') j = skipBalanced(code, j);
      else if (/[A-Za-z_$]/.test(c)) {
        const name = /^[\w$:-]+/.exec(code.slice(j, j + 80))[0];
        const afterName = skipSpace(code, j + name.length);
        if (code[afterName] === '=' && code[afterName + 1] !== '>') {
          const from = skipSpace(code, afterName + 1);
          const to = code[from] === '{' ? skipBalanced(code, from) : code[from] === '"' || code[from] === "'" ? skipQuoted(code, from) : from;
          attrs.set(name, { from, to });
          j = Math.max(to, from + 1);
        } else {
          if (!attrs.has(name)) attrs.set(name, null);
          j += name.length;
        }
      } else j += 1;
    }
    tags.push({ name: m[1], from: m.index, to: Math.min(j + 1, code.length), attrs });
  }
  return tags;
}

/** The extent of the expression that starts at `i`: up to the `,` `;` or closing bracket that ends it. */
function valueExtent(code, i) {
  if (code[i] === '{') return skipBalanced(code, i);
  let j = i;
  const limit = Math.min(code.length, i + 1500);
  while (j < limit) {
    const c = code[j];
    if (c === '"' || c === "'" || c === '`') j = skipQuoted(code, j);
    else if (c === '(' || c === '[' || c === '{') j = skipBalanced(code, j);
    else if (c === ',' || c === ';' || c === ')' || c === ']' || c === '}') break;
    else j += 1;
  }
  return j;
}

/** The direct properties of the object literal `code[from..to)` (braces included), as trimmed text. */
function directProperties(code, from, to) {
  const props = [];
  let start = from + 1;
  let j = start;
  while (j < to - 1) {
    const c = code[j];
    if (c === '"' || c === "'" || c === '`') j = skipQuoted(code, j);
    else if (c === '(' || c === '[' || c === '{') j = skipBalanced(code, j);
    else if (c === ',') {
      props.push(code.slice(start, j).trim());
      j += 1;
      start = j;
    } else j += 1;
  }
  props.push(code.slice(start, to - 1).trim());
  return props.filter(Boolean);
}

/* ═══ the rules ════════════════════════════════════════════════════════════════════════════════ */

const jsx = (inner) => `export const Probe = () => ${inner};${LF}`;
const withClass = (...tokens) => jsx(`<div className="${tokens.join(' ')}" />`);
const PLANT_REL = 'src/verify-gates-probe.tsx';

/**
 * One entry per rule id. `what` names the construct in the failure message, `instead` says what
 * Pulse writes. `probe` is the defect `verify:gates` plants: it must be counted `n` times by this
 * rule and by no other. `cases` are further sources with the COMPLETE count they must produce —
 * `{}` is a control: a legal neighbour of the construct, which must stay uncounted.
 */
export const RULES = [
  {
    id: 'surface',
    what: 'a card (<Surface>)',
    instead: 'Pulse has no boxes: content stands on the canvas, grouped by a rule above and space below',
    probe: jsx('<Surface pad="none">x</Surface>'),
    cases: [[jsx('<SurfaceLike />'), {}]],
  },
  {
    id: 'summary-tile',
    what: 'a stat tile (<SummaryTile>)',
    instead: 'a figure is a LedgerRow or a StatBlock',
    probe: jsx('<SummaryTile label="x" value="1" />'),
  },
  {
    id: 'gauge',
    what: 'a ring gauge (<Gauge>)',
    instead: 'progress is a SegmentBar or a ProgressBar',
    probe: jsx('<Gauge value={0.4} />'),
  },
  {
    id: 'aurora',
    what: 'the aurora backdrop (<AuroraBackdrop>)',
    instead: 'the canvas is plain; the mount leaves with the component',
    probe: jsx('<AuroraBackdrop />'),
  },
  {
    id: 'legacy-type',
    what: 'a step of the old type ramp',
    instead: 'a Pulse step (giant, num, display, eyebrow, title, body, cap, tab, data, micro …)',
    probe: withClass(tw('text', 'caption')),
    cases: [
      [withClass(tw('text', 'body', 'legacy'), tw('md:text', 'title', '1')), { 'legacy-type': 2 }],
      [withClass(tw('text', 'body'), tw('text', 'display'), tw('text', 'micro'), tw('text', 'cap'), tw('text', 'title'), tw('text', 'text', '2')), {}],
    ],
  },
  {
    id: 'font-display-class',
    what: 'an explicit display-face class',
    instead: 'the family comes with the role (the type-binding block of index.css)',
    probe: withClass(tw('font', 'display')),
    cases: [
      [`@font-face { ${tw('font', 'display')}: swap; }${LF}`, {}, 'src/ui/tokens/fonts.css'],
      [`export const face = '${tw('font', 'display')}: block';${LF}`, {}],
    ],
  },
  {
    id: 'legacy-radius',
    what: 'a card or field radius, or a bare or sized built-in radius',
    instead: 'only a shape has a radius: the pill, the chip, the sheet, the bar',
    probe: withClass(tw('rounded', 'card')),
    cases: [
      [withClass(tw('rounded', 'field'), 'rounded', tw('rounded', 'lg'), tw('rounded', 't', 'xl'), `hover:${tw('rounded', '2xl')}`), { 'legacy-radius': 5 }],
      [withClass(tw('rounded', 'full'), tw('rounded', 'chip'), tw('rounded', 'button'), tw('rounded', 'none'), tw('rounded', 'bar'), arb(tw('rounded', 't'), 'var(--radius-sheet)')), {}],
      [`export const rounded = Math.round(1.5);${LF}`, {}],
    ],
  },
  {
    id: 'wash',
    what: 'a tinted wash, an ink-on-fill, a tinted edge or the "info" colour',
    instead: 'state is a lime mark, a 6 pt dot or coloured text; there is no fourth semantic colour',
    probe: withClass(tw('bg', 'accent', 'subtle')),
    cases: [
      [withClass(tw('text', 'on', 'danger'), tw('border', 'warning', 'border'), tw('text', 'info'), tw('ring', 'info', 'border'), tw('hover:bg', 'accent', 'hover'), tw('bg', 'scrim', 'strong')), { wash: 6 }],
      [withClass(tw('text', 'on', 'accent', 'subtle'), `${tw('bg', 'success', 'subtle')}/40`), { wash: 2 }],
      [withClass(arb('bg', 'var(--tile-tint)')), { wash: 1, 'legacy-var': 1 }],
      [withClass('bg-accent', 'text-accent-fg', 'bg-scrim', 'text-danger', 'border-border-token', tw('border', 'edge'), tw('divide', 'hair')), {}],
    ],
  },
  {
    id: 'legacy-variant',
    what: 'a legacy button variant (secondary, ghost or danger)',
    instead: 'Pulse has two action looks: the lime pill and the text link',
    n: 2,
    probe: jsx(`<Pressable size="lg" variant={on ? 'secondary' : 'ghost'}>x</Pressable>`),
    cases: [
      [jsx('<Pressable variant="danger">x</Pressable>'), { 'legacy-variant': 1 }],
      // An expression that spans lines: the literal sits two lines under the word `variant`.
      [jsx(`<Pressable${LF}  variant={${LF}    open${LF}      ? 'secondary'${LF}      : 'link'${LF}  }${LF}/>`), { 'legacy-variant': 1 }],
      [`export const cls = control({ size: 'sm', variant: busy ? 'ghost' : 'link' });${LF}`, { 'legacy-variant': 1 }],
      [`export interface P { variant?: 'primary' | 'secondary' | 'ghost' }${LF}`, { 'legacy-variant': 2 }],
      // The alias: a variant that arrives through another name is counted where that name gets its value.
      [`export function Bar({ cta = 'secondary' }: { cta?: 'link' | 'secondary' }) { return <a className={control({ variant: cta, size: 'sm' })} />; }${LF}`, { 'legacy-variant': 2 }],
      [jsx(`<Pressable variant="link" tone="danger">x</Pressable>`), {}],
      [`export const lit = role === 'secondary' ? 1 : variant === 'E' ? 2 : 3;${LF}`, {}],
    ],
  },
  {
    id: 'pressable-no-variant',
    what: 'a <Pressable> or a control() with no variant (there is no default look: it draws bare words)',
    instead: 'name the look: variant="primary" with a size, or variant="link"',
    probe: jsx('<Pressable onClick={go}>x</Pressable>'),
    cases: [
      [`export const cls = control({ shape: 'icon' });${LF}`, { 'pressable-no-variant': 1 }],
      [`export const cls = control();${LF}`, { 'pressable-no-variant': 1 }],
      [`export const cls = control({ variant, shape });${LF}`, {}],
      [jsx('<Pressable variant="link" onClick={() => <b title="x" />}>x</Pressable>'), {}],
      [jsx('<PressableRow onClick={go} />'), {}],
    ],
  },
  {
    id: 'legacy-chip-call',
    what: 'the status-chip recipe (chip())',
    instead: 'a state is a dot and a word, not a pill',
    probe: jsx(`<span className={chip({ tone: 'quiet' })}>x</span>`),
    cases: [[`export const n = microchip(1) + board.chip(2);${LF}`, {}]],
  },
  {
    id: 'shaped-skeleton',
    what: 'a <Skeleton> that carries a radius',
    instead: 'a skeleton is a plain block in place of a text line; its shape is the component’s',
    probe: jsx(`<Skeleton className="h-4 w-24 ${tw('rounded', 'chip')}" />`),
    cases: [
      [jsx(`<Skeleton className={cn('h-10', big && '${tw('rounded', 'full')}')} />`), { 'shaped-skeleton': 1 }],
      [jsx('<Skeleton className="h-4 w-24" />'), {}],
    ],
  },
  {
    id: 'raw-form',
    what: 'a raw <input>, <textarea> or <select> outside src/ui',
    instead: 'Field, SearchField, TextArea, SelectSheet, FilePick',
    probe: jsx('<input type="file" onChange={pick} />'),
    cases: [
      [jsx('<label><textarea rows={3} /><select><option /></select></label>'), { 'raw-form': 2 }],
      [jsx('<input type="file" />'), {}, 'src/ui/primitives/FilePick.tsx'],
      [jsx('<inputMode />'), {}],
    ],
  },
  {
    id: 'blur-shadow',
    what: 'a blur or a shadow other than the glow of the pill',
    instead: 'nothing: Pulse has no elevation',
    probe: withClass(tw('backdrop', 'blur', 'md')),
    cases: [
      [withClass(tw('shadow', 'lg'), tw('blur', 'sm'), tw('drop', 'shadow', 'md'), arb('shadow', '0_0_0_4px_var(--accent)')), { 'blur-shadow': 4 }],
      [jsx('<div style={{ boxShadow: halo }} />'), { 'blur-shadow': 1 }],
      [withClass(arb('shadow', 'var(--shadow-overlay)')), { 'blur-shadow': 1, 'legacy-var': 1 }],
      [withClass(tw('shadow', 'glow'), arb('shadow', 'var(--shadow-glow)'), arb('transition', 'box-shadow,border-color')), {}],
      [jsx('<input2 onBlur={() => el.blur()} />'), {}],
    ],
  },
  {
    id: 'reserved-surface-1',
    what: 'the reserved surface level 1',
    instead: 'the canvas; level 1 is not a colour a screen may use',
    probe: withClass(tw('bg', 'surface', '1')),
    cases: [
      [withClass(tw('text', 'surface', '1'), arb('fill', 'var(--surface-1)')), { 'reserved-surface-1': 2 }],
      [withClass(tw('bg', 'surface', '0')), {}],
    ],
  },
  {
    id: 'reserved-surface-2-3',
    what: 'a surface-2 or surface-3 fill outside the sheet, the skeleton, the disabled pill and the switch track',
    instead: 'the canvas; a track is the track colour, a rule is a hairline',
    probe: withClass(tw('bg', 'surface', '2')),
    cases: [
      [withClass(tw('hover:bg', 'surface', '3'), `${tw('bg', 'surface', '2')}/85`), { 'reserved-surface-2-3': 2 }],
      [`export const off = '${tw('bg', 'surface', '3')}';${LF}`, {}, 'src/ui/primitives/Switch.tsx'],
      [`export const block = '${tw('bg', 'surface', '2')}';${LF}`, {}, 'src/ui/feedback/ScreenSkeleton.tsx'],
      [`export const pill = '${tw('disabled:bg', 'surface', '2')}';${LF}`, {}, 'src/ui/primitives/control.ts'],
      [`export const old = '${tw('hover:bg', 'surface', '2')}';${LF}`, { 'reserved-surface-2-3': 1 }, 'src/ui/primitives/control.ts'],
      [withClass(arb('bg', 'var(--sheet-bg)'), arb('bg', 'var(--skeleton-base)')), {}],
    ],
  },
  {
    id: 'black-white',
    what: 'pure black or white',
    instead: 'the canvas, the ink and the scrim are tokens',
    probe: withClass(`${tw('bg', 'black')}/50`),
    cases: [[withClass(tw('text', 'white'), tw('border', 'black')), { 'black-white': 2 }]],
  },
  {
    id: 'legacy-var',
    what: 'a var() of a bridged token (a name the closing cleanup deletes)',
    instead: 'the Pulse token, or nothing where the name was decoration',
    probe: withClass(arb('p', 'var(--card-pad)')),
    cases: [
      [`.x { color: var(--info); margin: var( --nav-dock-offset ); }${LF}`, { 'legacy-var': 2 }, 'src/extra.css'],
      [`body { font-size: var(--${tw('text', 'body', 'legacy')}); line-height: var(--${tw('text', 'body', 'legacy')}--line-height); }${LF}`, { 'legacy-var': 2 }, 'src/extra.css'],
      [withClass(arb('outline', 'var(--focus-ring)'), arb('bg', 'var(--sheet-bg)'), arb('text', 'var(--accent)'), arb('border', 'var(--field-border)')), {}],
      ['export const step = `var(--accent-${n})`;' + LF, {}],
    ],
  },
  {
    id: 'heading-icon',
    what: 'an icon on an <EmptyState> or a <SectionHeader>',
    instead: 'neither draws an icon any more: delete the prop',
    probe: jsx('<EmptyState icon={Inbox} title="x" />'),
    cases: [
      [jsx('<SectionHeader title="t" icon={Dumbbell} />'), { 'heading-icon': 1 }],
      [jsx('<EmptyState title="x" action={<Pressable variant="link" icon={<Plus />}>y</Pressable>} />'), {}],
    ],
  },
];
const RULE_IDS = RULES.map((r) => r.id);
const RULE = new Map(RULES.map((r) => [r.id, r]));
const TAG_RULES = new Map([['Surface', 'surface'], ['SummaryTile', 'summary-tile'], ['Gauge', 'gauge'], ['AuroraBackdrop', 'aurora']]);
const RAW_FORM_TAGS = new Set(['input', 'textarea', 'select']);
const HEADING_TAGS = new Set(['EmptyState', 'SectionHeader']);

const normalise = (relPath) => posix(String(relPath)).replace(/^\.\//, '').replace(/^frontend\//, '');

/**
 * Every counted site of one file: `[{ rule, index }]`, `index` an offset into `source`.
 * Pure — the same text and path always give the same answer, whatever tree the caller sits in.
 */
export function scanSource(source, relPath) {
  const rel = normalise(relPath);
  const ext = path.posix.extname(rel);
  const hits = [];
  if (rel === TOKEN_FILE || !['.ts', '.tsx', '.css'].includes(ext)) return hits;
  const css = ext === '.css';
  const { code, inString } = lex(source, { css });
  const hit = (rule, index) => hits.push({ rule, index });
  const each = (re, rule, accept) => {
    for (const m of code.matchAll(re)) if (!accept || accept(m)) hit(rule, m.index);
  };

  each(RE.legacyVar, 'legacy-var');
  each(RE.surface1Var, 'reserved-surface-1');
  if (css) return hits;

  const quoted = (m) => inString[m.index] === 1;
  const bare = (m) => inString[m.index] === 0;
  each(RE.legacyType, 'legacy-type', quoted);
  each(RE.fontDisplay, 'font-display-class', quoted);
  each(RE.legacyRadius, 'legacy-radius', quoted);
  each(RE.wash, 'wash', quoted);
  each(RE.blurShadowClass, 'blur-shadow', quoted);
  each(RE.blurShadowStyle, 'blur-shadow', bare);
  each(RE.surface1Class, 'reserved-surface-1', quoted);
  each(RE.blackWhite, 'black-white', quoted);
  each(RE.chipCall, 'legacy-chip-call', bare);
  each(RE.surface23, 'reserved-surface-2-3', (m) => {
    if (!quoted(m)) return false;
    return !SURFACE_ALLOW.some((a) => a.file === rel && a.level === m[1] && (!a.after || code.slice(0, m.index).endsWith(a.after)));
  });

  const tags = scanTags(code, inString);
  const outsideUi = !rel.startsWith('src/ui/');
  for (const tag of tags) {
    if (TAG_RULES.has(tag.name)) hit(TAG_RULES.get(tag.name), tag.from);
    if (tag.name === 'Pressable' && !tag.attrs.has('variant')) hit('pressable-no-variant', tag.from);
    if (tag.name === 'Skeleton' && RE.anyRadius.test(code.slice(tag.from, tag.to))) hit('shaped-skeleton', tag.from);
    if (outsideUi && RAW_FORM_TAGS.has(tag.name)) hit('raw-form', tag.from);
    if (HEADING_TAGS.has(tag.name) && tag.attrs.has('icon')) hit('heading-icon', tag.from);
  }

  /* ── variants: where a value is given to `variant`, and what that value can be ───────────────── */
  const attrEnd = new Map();
  for (const tag of tags) for (const value of tag.attrs.values()) if (value) attrEnd.set(value.from, value.to);
  const regionCache = new Map();
  /** Every place a value is given to `name`: `{ from, to, text, attribute }`. */
  const regionsOf = (name) => {
    if (regionCache.has(name)) return regionCache.get(name);
    const list = [];
    for (const m of code.matchAll(givenTo(name))) {
      if (inString[m.index]) continue;
      const from = skipSpace(code, m.index + m[0].length);
      const attribute = attrEnd.has(from);
      const to = attribute ? attrEnd.get(from) : valueExtent(code, from);
      list.push({ from, to, text: code.slice(from, to), attribute });
    }
    regionCache.set(name, list);
    return list;
  };
  /** `{cta}`, `cta`, `(cta)` → `cta`: the value is handed on from another name. */
  const aliasOf = (text) => {
    const inner = text.trim().replace(/^\{([\s\S]*)\}$/, '$1').trim().replace(/^\(([\s\S]*)\)$/, '$1').trim().replace(/\s+as\s+const$/, '');
    return RE.bareName.test(inner) ? inner : null;
  };
  const literals = (region) => [...region.text.matchAll(RE.variantLiteral)].map((m) => ({ word: m[2], index: region.from + m.index }));

  const direct = regionsOf('variant');
  const aliases = new Set(direct.map((r) => aliasOf(r.text)).filter((name) => name && !NOT_AN_ALIAS.has(name)));
  const legacyAt = new Set();
  for (const region of [...direct, ...[...aliases].flatMap(regionsOf)]) {
    for (const lit of literals(region)) if (LEGACY_VARIANTS.has(lit.word)) legacyAt.add(lit.index);
  }
  for (const index of legacyAt) hit('legacy-variant', index);

  for (const m of code.matchAll(RE.controlCall)) {
    if (inString[m.index]) continue;
    const open = m.index + m[0].length - 1;
    const arg = skipSpace(code, open + 1);
    if (code[arg] !== '{') {
      // `control()` and `control(props)`: no variant is named here.
      if (code[arg] === ')') hit('pressable-no-variant', m.index);
      continue;
    }
    const props = directProperties(code, arg, skipBalanced(code, arg));
    const named = (key) => props.find((p) => new RegExp(`^${key}\\s*(?::|$)`).test(p));
    if (named('variant') === undefined) hit('pressable-no-variant', m.index);
  }

  return hits;
}

/** The counts of one file: `{ ruleId: n }`, rules that count nothing left out. */
export function countRules(source, relPath) {
  const counts = {};
  for (const { rule } of scanSource(source, relPath)) counts[rule] = (counts[rule] ?? 0) + 1;
  return Object.fromEntries(RULE_IDS.filter((id) => counts[id]).map((id) => [id, counts[id]]));
}

/** Every rule against its own probe and controls. Returns the failures as text; `[]` when the rules hold. */
export function selfTest() {
  const failures = [];
  const show = (o) => JSON.stringify(o);
  for (const rule of RULES) {
    const cases = [[rule.probe, { [rule.id]: rule.n ?? 1 }, PLANT_REL], ...(rule.cases ?? [])];
    cases.forEach(([source, expected, rel = PLANT_REL], i) => {
      const got = countRules(source, rel);
      if (show(got) !== show(Object.fromEntries(RULE_IDS.filter((id) => expected[id]).map((id) => [id, expected[id]])))) {
        failures.push(
          `  rule \`${rule.id}\` no longer counts what it exists for (${i === 0 ? 'its probe' : `case ${i}`}, as ${rel}):` +
            LF +
            `      expected ${show(expected)}, counted ${show(got)}` +
            LF +
            `      ${source.trim().split(LF).join(' ').slice(0, 160)}`,
        );
      }
    });
  }
  return failures;
}

/* ═══ the kept rules ═══════════════════════════════════════════════════════════════════════════ */

/** What `src/index.css` must still hold. Returns `[{ id, message }]`; empty when both are there. */
export function keptRuleProblems(cssText) {
  const { code } = lex(cssText, { css: true });
  const leaves = [...code.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim()),
    body: m[2],
    index: m.index,
  }));
  const problems = [];

  const ring = leaves.find(
    (r) =>
      r.selectors.some((s) => s === ':focus-visible' || s === '*:focus-visible') &&
      /(?<![\w-])outline(?:-color)?\s*:[^;]*var\(\s*--focus-ring\s*\)/.test(r.body) &&
      !/(?<![\w-])outline\s*:\s*(?:none|0)\b/.test(r.body),
  );
  if (!ring) {
    problems.push({
      id: 'kept/focus-ring',
      message:
        `${INDEX_CSS} no longer holds the global \`:focus-visible\` ring (an outline on \`var(--focus-ring)\`).` +
        LF +
        `      Pulse defines no focus state of its own, so this rule is the only one a keyboard user gets: focus is redrawn, never removed.`,
    });
  }

  let backstop = false;
  for (const m of code.matchAll(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const close = skipBalanced(code, open);
    backstop ||= leaves.some(
      (r) =>
        r.index > open &&
        r.index < close &&
        r.selectors.includes('*') &&
        /animation-duration\s*:[^;]*!important/.test(r.body) &&
        /transition-duration\s*:[^;]*!important/.test(r.body),
    );
  }
  if (!backstop) {
    problems.push({
      id: 'kept/reduced-motion',
      message:
        `${INDEX_CSS} no longer holds the reduced-motion backstop: \`@media (prefers-reduced-motion: reduce)\` collapsing` +
        LF +
        `      \`animation-duration\` and \`transition-duration\` on \`*\` with \`!important\`. Pulse adds two loops (the pill's pulse, the skeleton's sheen); both must stop.`,
    });
  }
  return problems;
}

/* ═══ the tree ═════════════════════════════════════════════════════════════════════════════════ */

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(?:ts|tsx|css)$/.test(entry.name)) yield full;
  }
}

/**
 * Every file under `<root>/src`, counted. `root` is a frontend directory.
 * `{ files: Map<'src/…', { ruleId: n }> (counted files only), totals: { ruleId: n }, scanned }`.
 */
export function scanTree({ root = FRONT } = {}) {
  const files = new Map();
  const totals = Object.fromEntries(RULE_IDS.map((id) => [id, 0]));
  let scanned = 0;
  for (const full of walk(path.join(root, 'src'))) {
    const rel = posix(path.relative(root, full));
    scanned += 1;
    const counts = countRules(fs.readFileSync(full, 'utf8'), rel);
    if (Object.keys(counts).length === 0) continue;
    files.set(rel, counts);
    for (const [id, n] of Object.entries(counts)) totals[id] += n;
  }
  return { files, totals, scanned };
}

/* ═══ the budgets ══════════════════════════════════════════════════════════════════════════════ */

const budgetName = (id) => `pkg/${id}/budget.json`;
const repoPath = (rel) => `frontend/${rel}`;
const sum = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

/**
 * Every `<dir>/<id>/budget.json`.
 * `{ byId: Map<id, { file, entries: Map<repoPath, { ruleId: n }> }>, where: Map<repoPath, id[]>, problems: string[] }`.
 */
export function readBudgets(dir = DEFAULT_BUDGETS) {
  const byId = new Map();
  const where = new Map();
  const problems = [];
  if (!fs.existsSync(dir)) return { byId, where, problems };
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const file = path.join(dir, entry.name, 'budget.json');
    if (!entry.isDirectory() || !fs.existsSync(file)) continue;
    const id = entry.name;
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      problems.push(`  ${budgetName(id)} is not valid JSON — ${err.message}`);
      continue;
    }
    if (doc.id !== id) problems.push(`  ${budgetName(id)} says it is the budget of "${doc.id}" — a budget file lives in the folder of its own id`);
    const entries = new Map();
    if (!doc.files || typeof doc.files !== 'object' || Array.isArray(doc.files)) {
      problems.push(`  ${budgetName(id)} has no \`files\` object`);
      doc.files = {};
    }
    for (const [name, rules] of Object.entries(doc.files)) {
      const clean = {};
      for (const [rule, n] of Object.entries(rules ?? {})) {
        if (!RULE.has(rule)) problems.push(`  ${budgetName(id)}: ${name} names the rule "${rule}", which does not exist (see --list-rules)`);
        else if (!Number.isInteger(n) || n < 0) problems.push(`  ${budgetName(id)}: ${name} / ${rule} is ${JSON.stringify(n)} — a budget is a whole number of sites`);
        else clean[rule] = n;
      }
      entries.set(name, clean);
      where.set(name, [...(where.get(name) ?? []), id]);
    }
    byId.set(id, { file, entries });
  }
  return { byId, where, problems };
}

/**
 * Who a counted file is budgeted with: the one lane or package that owns it, else the integrator
 * (`_int`) — its own packages, the frozen files, and whatever no package claims.
 * `null` in a tree without `pulse-owns-check.mjs` (the ownership leg is then skipped, and said so).
 */
export async function loadOwnership() {
  if (!fs.existsSync(OWNS_TOOL) || !fs.existsSync(WORK_PACKAGES)) return null;
  const owns = await import(pathToFileURL(OWNS_TOOL).href);
  const model = owns.loadModel({ file: WORK_PACKAGES });
  const lanes = model.packages.filter((p) => !owns.isIntegratorPackage(p));
  return {
    ids: new Set([INT_ID, ...lanes.map((p) => p.id)]),
    /** The budget id of a repo-relative path, or the list of ids when two packages claim it. */
    budgetIdOf(file) {
      const ids = lanes.filter((p) => owns.matchesAny(file, p.owns ?? [])).map((p) => p.id);
      return ids.length === 0 ? INT_ID : ids.length === 1 ? ids[0] : ids;
    },
  };
}

/**
 * The counts against the budgets. `{ problems: string[], lowerable: Set<id> }` — `lowerable` holds
 * the ids whose only fault is a budget above its count (`--fix-down` settles it).
 */
export function judge(tree, budgets, { ownership = null, root = FRONT } = {}) {
  const problems = [...budgets.problems];
  const lowerable = new Set();
  const line = (rule, rel, text) => `  [${rule}] ${rel} — ${text}`;
  const why = (rule) => `      ${RULE.get(rule).what} — ${RULE.get(rule).instead}.`;

  for (const [name, ids] of budgets.where) {
    if (ids.length > 1) problems.push(`  ${name} is listed in ${ids.length} budget files (${ids.map(budgetName).join(', ')}) — a file has one owner and one budget`);
  }

  const counted = new Map([...tree.files].map(([rel, counts]) => [repoPath(rel), { rel, counts }]));
  for (const [name, { rel, counts }] of counted) {
    const ids = budgets.where.get(name);
    if (!ids) {
      for (const [rule, n] of Object.entries(counts)) {
        problems.push(line(rule, rel, `${n} counted, and the file is in no budget file`) + LF + why(rule) + LF + '      New code is written without it; nothing is ever added to a budget.');
      }
      continue;
    }
    const id = ids[0];
    const budget = budgets.byId.get(id).entries.get(name);
    for (const rule of RULE_IDS) {
      const n = counts[rule] ?? 0;
      const allowed = budget[rule] ?? 0;
      if (n > allowed) {
        problems.push(line(rule, rel, `${n} counted, budget ${allowed} (${budgetName(id)}) — ${n - allowed} more than there were`) + LF + why(rule));
      } else if (n < allowed) {
        problems.push(
          line(rule, rel, `${n} counted, budget ${allowed} (${budgetName(id)}) — a budget is never above the count`) +
            LF +
            `      If you removed them, that is your done signal: lower it with \`node scripts/check-pulse.mjs --fix-down ${id}\`. A budget is never raised.`,
        );
        lowerable.add(id);
      }
    }
  }

  for (const [id, { entries }] of budgets.byId) {
    if (entries.size === 0) {
      problems.push(`  ${budgetName(id)} holds no file — delete it (\`--fix-down ${id}\` does): an empty budget is the done signal, and it must not linger`);
      lowerable.add(id);
    }
    for (const [name, budget] of entries) {
      if (counted.has(name)) continue;
      const gone = !fs.existsSync(path.join(root, name.replace(/^frontend\//, '')));
      const left = sum(budget);
      problems.push(
        `  ${budgetName(id)} still lists ${name}, ${gone ? 'which no longer exists' : left ? `which counts nothing any more (budget ${left})` : 'with nothing in it'} — delete the entry (\`--fix-down ${id}\` does)`,
      );
      lowerable.add(id);
    }
  }

  if (ownership) {
    for (const [id, { entries }] of budgets.byId) {
      if (!ownership.ids.has(id)) {
        problems.push(`  ${budgetName(id)} is the budget of "${id}", which is no lane or package of work-packages.json (and not ${INT_ID})`);
        continue;
      }
      for (const name of entries.keys()) {
        const owner = ownership.budgetIdOf(name);
        if (Array.isArray(owner)) problems.push(`  ${name} is owned by ${owner.join(' and ')} in work-packages.json — it cannot be budgeted until it has one owner`);
        else if (owner !== id) problems.push(`  ${budgetName(id)} lists ${name}, which ${owner === INT_ID ? 'the integrator keeps' : `${owner} owns`} — it belongs in ${budgetName(owner)}`);
      }
    }
  }
  return { problems, lowerable };
}

const writeBudget = (dir, id, entries) => {
  const file = path.join(dir, id, 'budget.json');
  if (entries.size === 0) {
    fs.rmSync(file, { force: true });
    return null;
  }
  const doc = {
    about:
      `check:pulse budget of ${id} — the legacy constructs left in its files, per file and rule. Generated by ` +
      `\`node scripts/check-pulse.mjs --init\` (the integrator); lowered with \`--fix-down ${id}\`; never raised, never ` +
      `extended by hand. It is deleted when it is empty: that is the done signal.`,
    id,
    files: Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, counts]) => [name, Object.fromEntries(RULE_IDS.filter((r) => counts[r]).map((r) => [r, counts[r]]))])),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}${LF}`);
  return file;
};

/* ═══ verify:gates ═════════════════════════════════════════════════════════════════════════════ */

/**
 * The probes of this gate, in the vocabulary of `verify-gates.mjs`: one planted defect per rule id,
 * the two kept rules, and the three ways a budget can lie. The runner imports this list — a rule
 * added above arrives there with its probe, and a rule cannot exist without one.
 */
export function verifyGatesProbes({ plant = PLANT_REL } = {}) {
  const intBudget = posix(path.relative(FRONT, path.join(DEFAULT_BUDGETS, INT_ID, 'budget.json')));
  const hasIntBudget = () => fs.existsSync(path.join(FRONT, intBudget)) || `${budgetName(INT_ID)} does not exist (budgets are generated by check-pulse --init; after the closing cleanup there are none)`;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const asJson = (edit) => (text) => {
    const doc = JSON.parse(text);
    return edit(doc) === false ? null : `${JSON.stringify(doc, null, 2)}${LF}`;
  };
  const firstEntry = (doc) => Object.entries(doc.files ?? {}).find(([, rules]) => Object.keys(rules).length > 0);
  return [
    ...RULES.map((rule) => ({
      id: `pulse/rule/${rule.id}`,
      gate: 'check:pulse',
      label: `${rule.what} in a file with no budget is caught (rule ${rule.id})`,
      file: plant,
      create: () => rule.probe,
      expect: new RegExp(`\\[${esc(rule.id)}\\] ${esc(plant)} — ${rule.n ?? 1} counted, and the file is in no budget file`),
    })),
    {
      id: 'pulse/budget-raised',
      gate: 'check:pulse',
      label: 'a budget raised by hand is caught',
      file: intBudget,
      when: hasIntBudget,
      mutate: asJson((doc) => {
        const entry = firstEntry(doc);
        if (!entry) return false;
        const rule = Object.keys(entry[1])[0];
        entry[1][rule] += 1;
        return true;
      }),
      expect: /— \d+ counted, budget \d+ \(pkg\/_int\/budget\.json\) — a budget is never above the count/,
    },
    {
      id: 'pulse/file-out-of-its-budget',
      gate: 'check:pulse',
      label: 'a counted file removed from its budget is caught',
      file: intBudget,
      when: hasIntBudget,
      mutate: asJson((doc) => {
        const entry = firstEntry(doc);
        if (!entry) return false;
        delete doc.files[entry[0]];
        return true;
      }),
      expect: /— \d+ counted, and the file is in no budget file/,
    },
    {
      id: 'pulse/dead-budget-entry',
      gate: 'check:pulse',
      label: 'a budget entry for a file that does not exist is caught',
      file: intBudget,
      when: hasIntBudget,
      mutate: asJson((doc) => {
        doc.files = { ...doc.files, 'frontend/src/verify-gates-gone.tsx': { surface: 1 } };
        return true;
      }),
      expect: /still lists frontend\/src\/verify-gates-gone\.tsx, which no longer exists/,
    },
    {
      id: 'pulse/focus-ring-deleted',
      gate: 'check:pulse',
      label: 'the global focus ring deleted from index.css is caught',
      file: INDEX_CSS,
      mutate: (text) => {
        const next = text.replace(/(?<![\w-]):focus-visible\s*\{[^}]*\}/, '');
        return next === text ? null : next;
      },
      expect: /\[kept\/focus-ring\] src\/index\.css no longer holds the global `:focus-visible` ring/,
    },
    {
      id: 'pulse/reduced-motion-deleted',
      gate: 'check:pulse',
      label: 'the reduced-motion backstop deleted from index.css is caught',
      file: INDEX_CSS,
      mutate: (text) => {
        const at = text.search(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/);
        if (at === -1) return null;
        return text.slice(0, at) + text.slice(skipBalanced(text, text.indexOf('{', at)));
      },
      expect: /\[kept\/reduced-motion\] src\/index\.css no longer holds the reduced-motion backstop/,
    },
  ];
}

/* ═══ the command line ═════════════════════════════════════════════════════════════════════════ */

const isMain = () => {
  if (!process.argv[1]) return false;
  const a = pathToFileURL(path.resolve(process.argv[1])).href;
  return process.platform === 'win32' ? a.toLowerCase() === import.meta.url.toLowerCase() : a === import.meta.url;
};

async function main() {
  const argv = process.argv.slice(2);
  const VALUE_FLAGS = ['--root', '--budgets', '--fix-down', '--where'];
  const KNOWN = new Set([...VALUE_FLAGS, '--report', '--json', '--init', '--force', '--list-rules', '--self-test', '--help', '-h']);
  const flag = (name) => argv.includes(name);
  const value = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const usage = (message) => {
    console.error(`check-pulse: ${message} — see the header of scripts/check-pulse.mjs`);
    process.exit(2);
  };
  const stray = argv.filter((a, i) => !KNOWN.has(a) && !VALUE_FLAGS.includes(argv[i - 1]));
  if (stray.length) usage(`unknown argument ${stray.join(', ')}`);
  for (const name of VALUE_FLAGS) if (flag(name) && (value(name) === undefined || value(name).startsWith('--'))) usage(`${name} needs a value`);

  if (flag('--help') || flag('-h')) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\r?\n/, '').replace(/^\/\*\*\r?\n?/, '').replace(/^ \* ?/gm, ''));
    return 0;
  }
  if (flag('--list-rules')) {
    for (const rule of RULES) console.log(`${rule.id.padEnd(22)} ${rule.what}`);
    console.log(`${'kept/focus-ring'.padEnd(22)} ${INDEX_CSS} holds the global :focus-visible ring`);
    console.log(`${'kept/reduced-motion'.padEnd(22)} ${INDEX_CSS} holds the reduced-motion backstop`);
    return 0;
  }

  // A rule that has stopped counting its own construct would turn every number below into a lie.
  const broken = selfTest();
  if (broken.length) {
    console.error(`check-pulse: ${broken.length} rule(s) fail their own proof — the counts below cannot be trusted` + LF);
    for (const b of broken) console.error(b);
    console.error('');
    return 1;
  }
  if (flag('--self-test')) {
    console.log(`check-pulse: self-test OK — ${RULES.length} rules, ${RULES.reduce((n, r) => n + 1 + (r.cases?.length ?? 0), 0)} sources counted as expected`);
    return 0;
  }

  const root = value('--root') ? path.resolve(value('--root')) : FRONT;
  if (!fs.existsSync(path.join(root, 'src'))) usage(`${root} has no src folder`);
  const budgetDir = value('--budgets') ? path.resolve(value('--budgets')) : DEFAULT_BUDGETS;
  const tree = scanTree({ root });
  const total = sum(tree.totals);
  const totalsLine = RULE_IDS.map((id) => `${id} ${tree.totals[id]}`).join(' · ');

  if (flag('--where')) {
    const target = value('--where');
    const budgets = readBudgets(budgetDir);
    const names = budgets.byId.has(target)
      ? [...budgets.byId.get(target).entries.keys()].map((n) => n.replace(/^frontend\//, ''))
      : [normalise(path.isAbsolute(target) ? path.relative(root, target) : target)].map((n) => (n.startsWith('src/') ? n : `src/${n}`));
    let shown = 0;
    for (const rel of names) {
      const full = path.join(root, rel);
      if (!fs.existsSync(full)) {
        console.log(`${rel}: no such file`);
        continue;
      }
      const source = fs.readFileSync(full, 'utf8');
      for (const h of scanSource(source, rel).sort((a, b) => a.index - b.index)) {
        const lineNo = source.slice(0, h.index).split(LF).length;
        console.log(`${rel}:${lineNo}  [${h.rule}]  ${source.split(LF)[lineNo - 1].trim().slice(0, 110)}`);
        shown += 1;
      }
    }
    console.log(`check-pulse: ${shown} counted site(s) in ${names.length} file(s)`);
    return 0;
  }

  if (flag('--init')) {
    if (root !== FRONT) usage('--init writes the budgets of THIS tree; it takes no --root');
    const ownership = await loadOwnership();
    if (!ownership) {
      console.error(
        'check-pulse: --init needs the ownership file and its glob expander —' +
          LF +
          `  ${posix(path.relative(REPO, WORK_PACKAGES))} ${fs.existsSync(WORK_PACKAGES) ? 'is here' : 'IS MISSING'}, ` +
          `${posix(path.relative(REPO, OWNS_TOOL))} ${fs.existsSync(OWNS_TOOL) ? 'is here' : 'IS MISSING (it arrives with lane F4)'}.` +
          LF +
          '  The budgets are generated on the merged tree, after both are in it.',
      );
      return 1;
    }
    const existing = readBudgets(budgetDir);
    if (existing.byId.size && !flag('--force')) {
      console.error(
        `check-pulse: ${existing.byId.size} budget file(s) exist already (${[...existing.byId.keys()].slice(0, 6).map(budgetName).join(', ')}…).` +
          LF +
          '  --init runs once; after it a budget is only lowered (--fix-down <id>). --force regenerates ALL of them from' +
          LF +
          '  what is counted now — which raises every budget that was beaten. Only the integrator does that, knowingly.',
      );
      return 1;
    }
    const perId = new Map();
    const unowned = [];
    for (const [rel, counts] of tree.files) {
      const owner = ownership.budgetIdOf(repoPath(rel));
      if (Array.isArray(owner)) unowned.push(`  ${repoPath(rel)} is owned by ${owner.join(' and ')}`);
      else perId.set(owner, (perId.get(owner) ?? new Map()).set(repoPath(rel), counts));
    }
    if (unowned.length) {
      console.error(`check-pulse: --init cannot place ${unowned.length} file(s) — work-packages.json gives them two owners:` + LF + unowned.join(LF));
      return 1;
    }
    for (const id of existing.byId.keys()) if (!perId.has(id)) writeBudget(budgetDir, id, new Map());
    const rows = [...perId].sort(([a], [b]) => (a < b ? -1 : 1));
    for (const [id, entries] of rows) writeBudget(budgetDir, id, entries);
    console.log(`check-pulse: --init wrote ${rows.length} budget file(s) for ${total} counted site(s) in ${tree.files.size} file(s)` + LF);
    for (const [id, entries] of rows) console.log(`  ${budgetName(id).padEnd(38)} ${String(entries.size).padStart(3)} file(s)  ${String([...entries.values()].reduce((n, c) => n + sum(c), 0)).padStart(5)} site(s)`);
    console.log(LF + `  ${totalsLine}`);
    return 0;
  }

  if (flag('--fix-down')) {
    if (root !== FRONT) usage('--fix-down lowers the budgets of THIS tree; it takes no --root');
    const id = value('--fix-down');
    const budgets = readBudgets(budgetDir);
    if (!budgets.byId.has(id)) {
      console.log(`check-pulse: ${budgetName(id)} does not exist — there is nothing to lower (a package without a budget file counts zero everywhere)`);
      return 0;
    }
    const before = budgets.byId.get(id).entries;
    const after = new Map();
    const notes = [];
    let raised = 0;
    for (const [name, budget] of before) {
      const counts = tree.files.get(name.replace(/^frontend\//, '')) ?? {};
      const next = {};
      for (const rule of RULE_IDS) {
        const allowed = budget[rule] ?? 0;
        const n = counts[rule] ?? 0;
        if (n > allowed) {
          raised += 1;
          notes.push(`  NOT TOUCHED  ${name} / ${rule}: ${n} counted, budget ${allowed} — a budget is never raised; remove the ${n - allowed} added`);
          if (allowed) next[rule] = allowed;
        } else {
          if (n < allowed) notes.push(`  lowered      ${name} / ${rule}: ${allowed} -> ${n}`);
          if (n) next[rule] = n;
        }
      }
      if (Object.keys(next).length) after.set(name, next);
      else notes.push(`  deleted      ${name}: nothing is left in it`);
    }
    const file = writeBudget(budgetDir, id, after);
    const left = [...after.values()].reduce((n, c) => n + sum(c), 0);
    const was = [...before.values()].reduce((n, c) => n + sum(c), 0);
    for (const note of notes) console.log(note);
    console.log(
      file
        ? `check-pulse: ${budgetName(id)} ${was} -> ${left} site(s) in ${after.size} file(s)${notes.length ? '' : ' — nothing to lower'}`
        : `check-pulse: ${budgetName(id)} is empty and was deleted (${was} -> 0) — that is the done signal`,
    );
    return raised ? 1 : 0;
  }

  const budgets = readBudgets(budgetDir);
  const perBudget = [...budgets.byId].map(([id, { entries }]) => ({
    id,
    files: entries.size,
    budget: [...entries.values()].reduce((n, c) => n + sum(c), 0),
    counted: [...entries.keys()].reduce((n, name) => n + sum(tree.files.get(name.replace(/^frontend\//, '')) ?? {}), 0),
  }));

  if (flag('--report')) {
    if (flag('--json')) {
      console.log(JSON.stringify({ root: posix(root), scanned: tree.scanned, total, totals: tree.totals, budgets: perBudget, files: Object.fromEntries(tree.files) }, null, 2));
      return 0;
    }
    console.log(`check-pulse: ${total} legacy construct(s) in ${tree.files.size} of ${tree.scanned} file(s) under ${posix(path.relative(REPO, root)) || '.'}/src` + LF);
    for (const id of RULE_IDS) console.log(`  ${id.padEnd(22)} ${String(tree.totals[id]).padStart(5)}   ${RULE.get(id).what}`);
    if (perBudget.length) {
      console.log(LF + `  ${'budget'.padEnd(38)} files  budget  counted`);
      for (const b of perBudget) console.log(`  ${budgetName(b.id).padEnd(38)} ${String(b.files).padStart(5)}  ${String(b.budget).padStart(6)}  ${String(b.counted).padStart(7)}`);
    } else console.log(LF + '  no budget file exists (they are generated by --init)');
    return 0;
  }

  if (root !== FRONT) usage('--root counts another checkout: use it with --report or --where (the gate judges this tree)');
  const ownership = await loadOwnership();
  const kept = fs.existsSync(path.join(root, INDEX_CSS))
    ? keptRuleProblems(fs.readFileSync(path.join(root, INDEX_CSS), 'utf8'))
    : [{ id: 'kept/focus-ring', message: `${INDEX_CSS} does not exist` }];
  const verdict = judge(tree, budgets, { ownership, root });
  const problems = [...kept.map((k) => `  [${k.id}] ${k.message}`), ...verdict.problems];

  if (problems.length) {
    // Before --init every counted file is "in no budget file": say that once, not five hundred times.
    const unborn = budgets.byId.size === 0 && total > 0;
    const SHOWN = unborn ? kept.length + 3 : 40;
    console.error(`check-pulse: ${problems.length} problem(s)` + LF);
    for (const p of problems.slice(0, SHOWN)) console.error(p);
    if (problems.length > SHOWN) console.error(LF + `  … and ${problems.length - SHOWN} more.`);
    if (unborn) {
      console.error(
        LF +
          `  No budget file exists, and ${total} legacy construct(s) are counted in ${tree.files.size} file(s):` +
          LF +
          `  ${totalsLine}` +
          LF +
          '  The integrator generates the budgets once, on the merged tree: node scripts/check-pulse.mjs --init',
      );
    } else if (verdict.lowerable.size) {
      console.error(LF + `  Budgets to lower: ${[...verdict.lowerable].map((id) => `--fix-down ${id}`).join(' · ')}`);
    }
    console.error(LF + `  Where exactly: node scripts/check-pulse.mjs --where <file or budget id>` + LF);
    return 1;
  }

  console.log(
    `check-pulse: OK — ${RULES.length} rules hold their budgets: ${total} legacy construct(s) left in ${tree.files.size} file(s), ` +
      `${budgets.byId.size} budget file(s); the focus ring and the reduced-motion backstop are in ${INDEX_CSS}`,
  );
  console.log(`  ${totalsLine}`);
  if (!ownership) console.log(`  note — the ownership leg is skipped: ${posix(path.relative(REPO, OWNS_TOOL))} is not in this tree (it arrives with lane F4)`);
  return 0;
}

if (isMain()) process.exit(await main());
