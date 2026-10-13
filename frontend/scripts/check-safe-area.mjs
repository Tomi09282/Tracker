// scripts/check-safe-area.mjs — every element that touches a screen edge accounts for the inset.
//
// ═══ THE RULE, AND WHY IT IS A GATE ════════════════════════════════════════════════════════════
//
// `index.html` sets `viewport-fit=cover`. That is what makes `env(safe-area-inset-*)` report
// anything — and it is also what lets the layout extend UNDER the notch, the home indicator and the
// rounded corners. Cover mode without insets is strictly worse than not having it.
//
// So: an element pinned to the top or the bottom edge of the screen must account for that edge's
// inset. Nothing enforces that except somebody remembering, on a laptop, where every inset is zero
// and every mistake looks perfect.
//
// ═══ WHAT THIS FOUND ═══════════════════════════════════════════════════════════════════════════
//
// Every use of `env(safe-area-inset-*)` in the codebase was VERTICAL — top and bottom. `.screen-x`,
// the horizontal gutter every screen in the product uses, was a flat 16px. Turn a notched phone
// sideways and the inset moves to the left or right edge, where 16px puts the first character of
// every line under the cutout. A fitness app is used sideways: a phone propped against a rack is
// not an edge case, it is how somebody reads their next set.
//
// ═══ WHAT CHANGED FOR PULSE, AND WHY ═══════════════════════════════════════════════════════════
//
// The rule used to be a FILE rule with a typed-in token name: a file with `fixed` near `top-0` or
// `bottom-0` passed when it mentioned the inset anywhere, or `--content-pad-b`, or ANY
// `pt-[var(--…)]` / `pb-[var(--…)]`. Measured before it was changed, on the old look:
//
//   * `sticky` was outside the rule. The offline strip is sticky and was compliant only by its
//     own care. Pulse puts more furniture at the top (a toast band, a status-bar mask).
//   * `inset-0` and an arbitrary `bottom-[…]` were outside it too — the rest timer and the FAB
//     float on `bottom-[calc(var(--nav-h)+env(…))]` and were never examined.
//   * `pb-[var(--card-pad)]` on a bar passed: the escape accepted any token.
//   * The token escape knew ONE name. Pulse derives its shell distances from each other
//     (`--content-pad-b` → `--tabbar-offset` → `--safe-b` → `env()`), so the name the rule knew
//     stops containing `env()` the day the bar lands — and a renamed token leaves a dead branch
//     nobody notices.
//   * Both exemptions exempted nothing, and the stale check could not tell: it only asked whether
//     the file still existed.
//
// So the rule is now about an ELEMENT and reads the tokens instead of knowing their names:
//
//   1. An element is EDGE-PINNED when its classes hold `fixed` or `sticky` together with `top-0`,
//      `bottom-0`, `inset-0` (`inset-y-0`) or an arbitrary `top-[…]` / `bottom-[…]`.
//   2. A token is INSET-CARRYING for an edge when its value reaches `env(safe-area-inset-<edge>)`,
//      directly or through `var()`, in `tokens.css` — in EVERY declaration of it, because a
//      re-declaration without the inset is exactly the defect.
//   3. An edge-pinned element accounts for its edge when its classes hold the literal inset, or a
//      carrying token anywhere (`pt-[…]`, `pb-[…]`, `top-[…]`, `bottom-[…]`, inside `calc()`), or a
//      utility of `index.css` that carries it (`.safe-top`, `.safe-bottom`).
//   4. Everything else needs a written exemption — and an exemption that exempts nothing fails.
//   5. The screen scaffold pads its top with a carrying TOKEN, never a literal `env()`: the token
//      is where the zero-inset floor lives (a desktop browser reports 0 and the header would sit
//      on the window edge).
//
// ═══ "THE ELEMENT'S CLASSES", WITHOUT A PARSER ═════════════════════════════════════════════════
//
// The unit is a CLASS GROUP: every string literal inside one `className={…}` attribute, or inside
// one `const X = …;` initialiser, or one `return …;` — the innermost of those that contains the
// literal. That is how class lists are really written here: split across `cn()` arguments, held
// in an array constant, chosen by a ternary. A literal in none of the three is a group on its own.
//
// What that cannot see, stated rather than hidden:
//   * an inset on a CHILD element does not count for its pinned parent (the offline strip pads an
//     inner row — that is a written exemption, with the reason);
//   * two branches of one ternary are one group: an inset in either branch satisfies both;
//   * offsets on the spacing scale (`bottom-1`, `top-4`) are not edge-pinned by this definition.
//
// Run: node scripts/check-safe-area.mjs            (cwd `frontend/`; wired into `npm run build`)
//      node scripts/check-safe-area.mjs --explain  every edge-pinned element and what satisfies it
//      node scripts/check-safe-area.mjs --tokens <file>
//                                                  judge the tree against ANOTHER token file — the
//                                                  dry run for a planned token change
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readGateData } from './data/gate-data.mjs';

const SRC = 'src';
const INDEX_HTML = 'index.html';
const GLOBAL_CSS = 'src/index.css';
const TOKENS_CSS = 'src/ui/tokens/tokens.css';
const EXEMPT_FILE = 'scripts/data/safe-area-exempt.json';

/**
 * The shared screen scaffold (lane F11). It does not exist until the shell lands; the leg that
 * guards it says so on every run instead of passing silently, and its siblings are the tripwire:
 * the shell kit cannot arrive without the scaffold this leg is waiting for.
 */
const SCAFFOLD = 'src/ui/shell/Screen.tsx';
const SCAFFOLD_SIBLINGS = ['src/ui/shell/ScreenHeader.tsx', 'src/ui/shell/Dock.tsx'];

const EDGES = ['top', 'bottom'];
const LF = String.fromCharCode(10);

const unix = (s) => s.replace(/\r\n/g, LF);
const lineOf = (text, offset) => text.slice(0, offset).split(LF).length;

/* ── tokens: which custom properties carry which inset ────────────────────────────────────────── */

/**
 * The inset-carrying tokens of a token file, per edge.
 *
 * A token carries an edge when EVERY declaration of it reaches `env(safe-area-inset-<edge>)`,
 * directly or through another carrying token. "Every" is the point: `--safe-b` declared once with
 * the inset and once more without it (a second block, a media query) is a token that sometimes
 * carries nothing, and the element that trusts it sits under the home indicator on that device.
 *
 * @param {string} css the text of tokens.css
 * @returns {{ top: Set<string>, bottom: Set<string> }}
 */
export function insetCarryingTokens(css) {
  const code = unix(css).replace(/\/\*[\s\S]*?\*\//g, ' ');
  /** @type {Map<string, string[]>} */
  const declarations = new Map();
  for (const m of code.matchAll(/(?<![\w-])(--[\w-]+)\s*:\s*([^;{}]+)/g)) {
    if (!declarations.has(m[1])) declarations.set(m[1], []);
    declarations.get(m[1]).push(m[2]);
  }
  const result = {};
  for (const edge of EDGES) {
    const direct = `safe-area-inset-${edge}`;
    const carrying = new Set();
    // Least fixed point: a token joins once all of its declarations reach the inset through what
    // is already in the set. Monotone, so the loop ends.
    for (let grew = true; grew; ) {
      grew = false;
      for (const [name, values] of declarations) {
        if (carrying.has(name)) continue;
        const reaches = (value) =>
          value.includes(direct) || [...value.matchAll(/var\(\s*(--[\w-]+)/g)].some((v) => carrying.has(v[1]));
        if (values.every(reaches)) {
          carrying.add(name);
          grew = true;
        }
      }
    }
    result[edge] = carrying;
  }
  return result;
}

/** Utilities of the global stylesheet that carry an inset themselves (`.safe-top`, `.safe-bottom`). */
function insetCarryingUtilities(css, tokens) {
  const code = unix(css).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const result = { top: new Set(), bottom: new Set() };
  for (const m of code.matchAll(/\.([A-Za-z][\w-]*)\s*\{([^{}]*)\}/g)) {
    for (const edge of EDGES) {
      const body = m[2];
      if (
        body.includes(`safe-area-inset-${edge}`) ||
        [...body.matchAll(/var\(\s*(--[\w-]+)/g)].some((v) => tokens[edge].has(v[1]))
      ) {
        result[edge].add(m[1]);
      }
    }
  }
  return result;
}

/* ── source: comments out, string literals in ─────────────────────────────────────────────────── */

/**
 * A source file as this rule needs it: every string literal with its offset, and a SKELETON — the
 * same text with comments and string contents blanked to spaces, so brackets can be matched
 * without a comment or a class name getting in the way. Offsets and lines survive.
 *
 * Only CODE is read. A comment explaining the rule must not be read as an instance of breaking it
 * — the same trap that made two backend gates report the routes they had just been fixed on.
 *
 * It is a lexer for strings and comments, not for JSX or regular expressions: an apostrophe in JSX
 * text or a quote inside a regex literal opens a "string". A quoted string cannot cross a line, so
 * the damage ends at the line break.
 */
function lex(text) {
  const out = text.split('');
  const literals = [];
  const n = text.length;
  const blank = (a, b) => {
    for (let k = a; k < b; k += 1) if (out[k] !== LF) out[k] = ' ';
  };
  const literal = (a, b) => {
    if (b > a) literals.push({ start: a, end: b, text: text.slice(a, b) });
    blank(a, b);
  };

  function template(start) {
    let j = start + 1;
    let chunk = j;
    while (j < n) {
      const c = text[j];
      if (c === '\\') {
        j += 2;
      } else if (c === '`') {
        literal(chunk, j);
        return j + 1;
      } else if (c === '$' && text[j + 1] === '{') {
        literal(chunk, j);
        j = code(j + 2, true);
        chunk = j;
      } else {
        j += 1;
      }
    }
    literal(chunk, n);
    return n;
  }

  function code(start, untilBrace) {
    let j = start;
    let depth = 0;
    while (j < n) {
      const c = text[j];
      const d = text[j + 1];
      if (c === '/' && d === '/') {
        const eol = text.indexOf(LF, j);
        const end = eol === -1 ? n : eol;
        blank(j, end);
        j = end;
      } else if (c === '/' && d === '*') {
        const close = text.indexOf('*/', j + 2);
        const end = close === -1 ? n : close + 2;
        blank(j, end);
        j = end;
      } else if (c === "'" || c === '"') {
        let k = j + 1;
        while (k < n && text[k] !== c && text[k] !== LF) k += text[k] === '\\' ? 2 : 1;
        k = Math.min(k, n);
        literal(j + 1, k);
        j = text[k] === c ? k + 1 : k;
      } else if (c === '`') {
        j = template(j);
      } else if (untilBrace && c === '{') {
        depth += 1;
        j += 1;
      } else if (untilBrace && c === '}') {
        if (depth === 0) return j + 1;
        depth -= 1;
        j += 1;
      } else {
        j += 1;
      }
    }
    return n;
  }

  code(0, false);
  return { skeleton: out.join(''), literals };
}

const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = new Set([')', ']', '}']);

/** The end of a bracketed expression that opens at `at` (exclusive), on the skeleton. */
function matchBracket(skeleton, at) {
  let depth = 0;
  for (let i = at; i < skeleton.length; i += 1) {
    const c = skeleton[i];
    if (OPEN[c]) depth += 1;
    else if (CLOSE.has(c)) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return skeleton.length;
}

/** The end of a statement that starts at `at`: its `;` at depth 0, or the bracket that closes its scope. */
function statementEnd(skeleton, at) {
  let depth = 0;
  for (let i = at; i < skeleton.length; i += 1) {
    const c = skeleton[i];
    if (OPEN[c]) depth += 1;
    else if (CLOSE.has(c)) {
      if (depth === 0) return i;
      depth -= 1;
    } else if (c === ';' && depth === 0) return i;
  }
  return skeleton.length;
}

/** Spans that hold ONE element's classes — see "THE ELEMENT'S CLASSES" in the header. */
function containers(skeleton) {
  const spans = [];
  for (const m of skeleton.matchAll(/\b[A-Za-z]*[cC]lassName\s*=\s*/g)) {
    const at = m.index + m[0].length;
    const c = skeleton[at];
    if (c === '{') spans.push([at, matchBracket(skeleton, at)]);
    else if (c === '"' || c === "'") {
      const close = skeleton.indexOf(c, at + 1);
      spans.push([at, close === -1 ? skeleton.length : close + 1]);
    }
  }
  for (const m of skeleton.matchAll(/\b(?:const|let|var)\s+[\w$]+\s*(?::[^=;]+)?=(?![=>])/g)) {
    const at = m.index + m[0].length;
    spans.push([at, statementEnd(skeleton, at)]);
  }
  for (const m of skeleton.matchAll(/\breturn\b/g)) {
    const at = m.index + m[0].length;
    spans.push([at, statementEnd(skeleton, at)]);
  }
  return spans;
}

/** `lg:hover:pb-0` → `pb-0`. Variants are cut at a colon outside brackets. */
function baseUtility(token) {
  let depth = 0;
  let cut = 0;
  for (let i = 0; i < token.length; i += 1) {
    const c = token[i];
    if (c === '[' || c === '(') depth += 1;
    else if (c === ']' || c === ')') depth -= 1;
    else if (c === ':' && depth === 0) cut = i + 1;
  }
  return token.slice(cut).replace(/^!/, '');
}

const PINS = new Set(['fixed', 'sticky']);
const SPACING_UTILITY = /^(?:p[tby]?|m[tby]?|top|bottom|inset(?:-y)?)-\[/;
const varsOf = (s) => [...s.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
const EDGE_UTILITY = {
  top: (u) => u === 'top-0' || u === 'inset-0' || u === 'inset-y-0' || /^top-\[.+\]$/.test(u),
  bottom: (u) => u === 'bottom-0' || u === 'inset-0' || u === 'inset-y-0' || /^bottom-\[.+\]$/.test(u),
};

/**
 * Every edge-pinned element under `src`, with what (if anything) accounts for its inset.
 *
 * @param {{ root?: string, tokensFile?: string }} [options] `root` is the frontend directory
 * @returns {{ elements: Array<{ file: string, line: number, edge: 'top'|'bottom', pin: string,
 *   via: string, classes: Set<string>, satisfiedBy: string | null, deadTokens: string[] }>,
 *   tokens: { top: Set<string>, bottom: Set<string> }, files: string[] }}
 */
export function scanEdgePinned({ root = '.', tokensFile } = {}) {
  const at = (p) => path.join(root, p);
  const tokens = insetCarryingTokens(fs.readFileSync(tokensFile ?? at(TOKENS_CSS), 'utf8'));
  const utilities = insetCarryingUtilities(fs.readFileSync(at(GLOBAL_CSS), 'utf8'), tokens);

  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(e.name)) files.push(p);
    }
  })(at(SRC));
  files.sort();

  const elements = [];
  for (const file of files) {
    const rel = path.relative(at(SRC), file).split(path.sep).join('/');
    const text = unix(fs.readFileSync(file, 'utf8'));
    if (!/\b(fixed|sticky)\b/.test(text)) continue;
    const { skeleton, literals } = lex(text);
    const spans = containers(skeleton);

    /** @type {Map<string, Array<{ start: number, text: string }>>} */
    const groups = new Map();
    for (const lit of literals) {
      let best = null;
      for (const span of spans) {
        if (span[0] <= lit.start && lit.end <= span[1] && (!best || span[1] - span[0] < best[1] - best[0])) best = span;
      }
      const key = best ? `${best[0]}:${best[1]}` : `lit:${lit.start}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(lit);
    }

    for (const group of groups.values()) {
      const words = group.flatMap((lit) =>
        lit.text.split(/\s+/).filter(Boolean).map((token) => ({ token, base: baseUtility(token), start: lit.start })),
      );
      const pin = words.find((w) => PINS.has(w.base));
      if (!pin) continue;
      const classes = new Set(words.map((w) => w.base));
      const joined = words.map((w) => w.token).join(' ');
      for (const edge of EDGES) {
        const via = words.find((w) => EDGE_UTILITY[edge](w.base));
        if (!via) continue;
        const used = varsOf(joined);
        const carrying = used.find((name) => tokens[edge].has(name));
        // Named in the failure: only the tokens somebody plausibly MEANT as the inset — the ones
        // inside a padding or an offset. `z-[var(--z-sheet)]` is not an attempt at one.
        const spacing = words.filter((w) => SPACING_UTILITY.test(w.base)).flatMap((w) => varsOf(w.token));
        const utility = [...classes].find((c) => utilities[edge].has(c));
        const satisfiedBy = joined.includes(`safe-area-inset-${edge}`)
          ? `env(safe-area-inset-${edge})`
          : carrying
            ? `var(${carrying})`
            : utility
              ? `.${utility}`
              : null;
        elements.push({
          file: rel,
          line: lineOf(text, pin.start),
          edge,
          pin: pin.base,
          via: via.base,
          classes,
          satisfiedBy,
          deadTokens: satisfiedBy ? [] : [...new Set(spacing)],
        });
      }
    }
  }
  return { elements, tokens, files };
}

/* ── the gate ─────────────────────────────────────────────────────────────────────────────────── */

function main(argv) {
  const explain = argv.includes('--explain');
  const tokensArg = argv.indexOf('--tokens');
  const tokensFile = tokensArg === -1 ? undefined : argv[tokensArg + 1];
  if (tokensArg !== -1 && (!tokensFile || !fs.existsSync(tokensFile))) {
    console.error('check-safe-area: --tokens needs the path of an existing token file');
    process.exit(2);
  }

  const read = (p) => fs.readFileSync(p, 'utf8');
  const problems = [];

  /* ── 1. cover mode is on, because none of the rest means anything without it ────────────────── */
  let coverMode = false;
  {
    const html = read(INDEX_HTML);
    const ok = /viewport-fit\s*=\s*cover/.test(html);
    coverMode = ok;
    if (!ok) {
      problems.push(
        `${INDEX_HTML} has no \`viewport-fit=cover\` — every env(safe-area-inset-*) in this codebase\n` +
          '      reports 0 without it, so every inset below is dead code and the layout stops at the\n' +
          '      safe area anyway.',
      );
    }
  }

  /* ── 2. the horizontal gutter accounts for a landscape notch ────────────────────────────────── */
  {
    const css = read(GLOBAL_CSS);
    const block = /\.screen-x\s*\{[^}]*\}/g;
    const blocks = css.match(block) ?? [];
    if (blocks.length === 0) {
      problems.push(`${GLOBAL_CSS} no longer defines .screen-x — this check is blind`);
    }
    for (const b of blocks) {
      if (!/safe-area-inset-left/.test(b) || !/safe-area-inset-right/.test(b)) {
        problems.push(
          `${GLOBAL_CSS}: a .screen-x rule sets a horizontal gutter with no left/right inset.\n` +
            `      ${b.replace(/\s+/g, ' ').slice(0, 88)}\n` +
            '      In landscape the notch moves to a side edge and this padding puts text under it.',
        );
      }
      // `max()`, not addition: 16px stacked on a 44px cutout is 60px of gutter on one side only.
      if (/env\(safe-area-inset-(left|right)\)\s*\+/.test(b) || /\+\s*env\(safe-area-inset-(left|right)\)/.test(b)) {
        problems.push(
          `${GLOBAL_CSS}: .screen-x ADDS the horizontal inset to the gutter instead of max()-ing it.\n` +
            '      That stacks the design gutter on top of the cutout and makes one side visibly wider.',
        );
      }
    }
  }

  /* ── 3. edge-pinned elements account for their edge ─────────────────────────────────────────── */

  const { elements, tokens, files } = scanEdgePinned({ tokensFile });

  if (tokens.top.size === 0 && tokens.bottom.size === 0 && !files.some((f) => read(f).includes('safe-area-inset'))) {
    problems.push(
      `nothing under ${SRC} and no token in ${tokensFile ?? TOKENS_CSS} mentions safe-area-inset — this check is blind`,
    );
  }

  /**
   * Elements exempt from the rule, each with the reason.
   *
   * An exemption is a written decision. "It looked fine on my laptop" is exactly the reasoning this
   * gate exists to replace, and on a laptop every inset is zero.
   *
   * The list is DATA: `scripts/data/safe-area-exempt.json`, one reason per entry. A component lane
   * that changes what an element pins to hands the entry in with its code; nobody edits the list
   * by hand. Two key forms:
   *
   *   <file under src>:<edge>            the ONE element that file pins to that edge
   *   <file under src>:<edge>@<class>    the element(s) pinned to that edge that carry <class>
   *
   * The second form exists because the first one is a hole in a file with several pinned
   * elements: `E14E20.tsx:bottom`, written for the scrim, would also wave the bottom SHEET through
   * the day somebody deletes its padding. So a file-wide key is refused there.
   */
  const EXEMPT = readGateData('safe-area-exempt');
  const exemptions = [];
  for (const [key, reason] of EXEMPT) {
    const m = /^(.+?):(top|bottom)(?:@(\S+))?$/.exec(key);
    if (!m) {
      problems.push(
        `${EXEMPT_FILE} has the entry "${key}", which is not "<file under src>:<top|bottom>" or\n` +
          '      "<file under src>:<top|bottom>@<class>" — an entry this gate cannot read exempts nothing.',
      );
      continue;
    }
    exemptions.push({ key, reason, file: m[1], edge: m[2], marker: m[3] ?? null, used: 0 });
  }

  const pinnedOn = (file, edge) => elements.filter((e) => e.file === file && e.edge === edge);
  const edgeName = { top: 'notch', bottom: 'home indicator' };

  for (const el of elements) {
    if (el.satisfiedBy) continue;
    const covering = exemptions.filter(
      (x) => x.file === el.file && x.edge === el.edge && (x.marker === null || el.classes.has(x.marker)),
    );
    if (covering.length) {
      for (const x of covering) x.used += 1;
      el.exemptBy = covering[0].key;
      continue;
    }
    const carriers = [...tokens[el.edge]].sort();
    const several = pinnedOn(el.file, el.edge).length > 1;
    problems.push(
      `${el.file}:${el.line} pins a ${el.pin} element to the ${el.edge} edge (${el.via}) and never accounts for the ${el.edge} inset.\n` +
        (el.deadTokens.length
          ? `      It uses ${el.deadTokens.map((t) => `var(${t})`).join(', ')}, which does not reach env(safe-area-inset-${el.edge}) in ${TOKENS_CSS}.\n`
          : '') +
        `      On a notched device that edge is under the ${edgeName[el.edge]}.\n` +
        `      Give the element the inset — a token that carries it (${carriers.length ? carriers.join(', ') : 'none is declared yet'}) or the\n` +
        `      literal env(safe-area-inset-${el.edge}) — or hand in "${el.file}:${el.edge}${several ? '@<a class only this element carries>' : ''}"\n` +
        `      for ${EXEMPT_FILE}, with the reason this element never reaches the edge.`,
    );
  }

  // A stale exemption hides a regression: the file changed, the reason no longer applies, and the
  // entry keeps waving it through. "Stale" used to mean "the file is gone"; it now means "the rule
  // would not have flagged anything this entry names".
  for (const x of exemptions) {
    if (!fs.existsSync(path.join(SRC, x.file))) {
      problems.push(`EXEMPT names ${x.file}, which no longer exists — delete the entry "${x.key}"`);
      continue;
    }
    const pinned = pinnedOn(x.file, x.edge);
    if (x.marker === null && pinned.length > 1) {
      problems.push(
        `EXEMPT has the file-wide entry "${x.key}", and ${x.file} pins ${pinned.length} elements to the ${x.edge} edge\n` +
          `      (lines ${pinned.map((e) => e.line).join(', ')}). A file-wide entry would wave every one of them through.\n` +
          `      Name the element it is for: "${x.key}@<a class only that element carries>".`,
      );
      continue;
    }
    if (x.used === 0) {
      const named = pinned.filter((e) => x.marker === null || e.classes.has(x.marker));
      problems.push(
        `EXEMPT has "${x.key}", and it exempts nothing: ` +
          (named.length
            ? `the element it names (line ${named.map((e) => e.line).join(', ')}) accounts for its inset through ${named[0].satisfiedBy}.`
            : pinned.length
              ? `no element pinned to the ${x.edge} edge in that file carries the class "${x.marker}".`
              : `${x.file} pins nothing to the ${x.edge} edge.`) +
          '\n      Delete the entry — a dead exemption waves through the next thing written into that file.',
      );
    }
  }

  /* ── 4. the scaffold pads its top with a TOKEN ──────────────────────────────────────────────── */
  let scaffoldNote;
  if (fs.existsSync(SCAFFOLD)) {
    const { literals } = lex(unix(read(SCAFFOLD)));
    const classes = literals.map((l) => l.text).join(' ');
    const carrier = [...classes.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]).find((name) => tokens.top.has(name));
    if (classes.includes('safe-area-inset-top')) {
      problems.push(
        `${SCAFFOLD} pads the top with a literal env(safe-area-inset-top).\n` +
          '      The scaffold is the one place every screen gets its top inset from, and the zero-inset\n' +
          '      floor lives in the token: with the literal, a browser that reports no inset puts the\n' +
          `      header on the window edge. Use a token that carries it (${[...tokens.top].sort().join(', ') || 'none is declared yet'}).`,
      );
    } else if (!carrier) {
      problems.push(
        `${SCAFFOLD} uses no token that carries the top inset (${[...tokens.top].sort().join(', ') || 'none is declared yet'}).\n` +
          '      No app bar sits above a Pulse screen, so the scaffold itself has to keep the header out\n' +
          '      from under the notch — for every screen at once.',
      );
    }
    scaffoldNote = carrier ? `scaffold pads by var(${carrier})` : 'scaffold: see below';
  } else {
    const arrived = SCAFFOLD_SIBLINGS.filter((f) => fs.existsSync(f));
    if (arrived.length) {
      problems.push(
        `${arrived.join(' and ')} exist${arrived.length === 1 ? 's' : ''}, and ${SCAFFOLD} does not.\n` +
          '      The scaffold leg of this gate waits for that file. If the scaffold landed under another\n' +
          '      name, point SCAFFOLD at it — a leg whose subject has moved passes forever.',
      );
    }
    scaffoldNote = `scaffold leg waiting for ${SCAFFOLD}`;
  }

  /* ── report ─────────────────────────────────────────────────────────────────────────────────── */

  const insetUsers = files.filter((f) => read(f).includes('safe-area-inset')).length;
  const pinnedFiles = new Set(elements.map((e) => e.file)).size;
  const names = (set) => (set.size ? [...set].sort().join(' ') : 'none');
  // The summary REPORTS what was measured. It used to print "viewport-fit=cover" unconditionally,
  // which meant the one run where that was false printed it anyway — a header stating the thing the
  // body was in the middle of refuting.
  console.log(
    `check-safe-area: viewport-fit ${coverMode ? 'cover' : 'MISSING'}, ` +
      `${elements.length} edge-pinned element(s) in ${pinnedFiles} file(s), ` +
      `${insetUsers} file(s) name an inset, ${EXEMPT.size} exemption(s)`,
  );
  console.log(`                 tokens that carry the inset${tokensFile ? ` (${tokensFile})` : ''} — top: ${names(tokens.top)} · bottom: ${names(tokens.bottom)}`);
  console.log(`                 ${scaffoldNote}`);

  if (explain) {
    console.log('');
    for (const el of elements) {
      const verdict = el.satisfiedBy ? el.satisfiedBy : el.exemptBy ? `EXEMPT "${el.exemptBy}"` : 'UNACCOUNTED';
      console.log(`  ${`${el.file}:${el.line}`.padEnd(44)} ${el.pin.padEnd(6)} ${el.edge.padEnd(6)} ${el.via.padEnd(28).slice(0, 28)} ${verdict}`);
    }
  }

  if (problems.length) {
    console.log('');
    for (const p of problems) console.log(`  ${p}`);
    console.log(`\ncheck-safe-area FAILED — ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('check-safe-area: OK — every edge-pinned element accounts for its inset');
}

// Importing this file (`verify-gates.mjs` reads the carrying tokens from it) must not run the gate.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
