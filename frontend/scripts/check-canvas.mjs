/**
 * check-canvas — the canvas colour is written four times, and three of the four cannot read a token.
 *
 * ═══ WHY ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * The app is one near-black room, and the colour of that room has to be known in places that are
 * painted before any stylesheet exists:
 *
 *   src/ui/tokens/tokens.css       --surface-0 in `:root`        the page itself — the source
 *   index.html                     <meta name="theme-color">     the browser chrome and the overscroll
 *                                                                area, from the first byte of HTML
 *   public/manifest.webmanifest    theme_color                   the title bar and the task-switcher
 *                                                                card of the installed app
 *   public/manifest.webmanifest    background_color              the splash screen the OS shows while
 *                                                                the installed app starts
 *
 * HTML and JSON cannot say `var(--surface-0)`, so the last three are copies typed by hand. Change
 * the token and miss one, and the app opens with a flash of the OLD canvas — in the status bar, in
 * the overscroll, or on the splash screen — and then corrects itself. Nothing is red, no test
 * renders a splash screen, and on a developer's desktop browser none of the three is even visible.
 * It is a defect only a phone shows, for a fraction of a second, on a cold start.
 *
 * So the four are compared here, on every build.
 *
 * ═══ WHAT IT CANNOT DO ═════════════════════════════════════════════════════════════════════════
 *
 * It compares the DEFAULT canvas only: the `--surface-0` of an unconditional `:root` rule — at the
 * top level, or wrapped in nothing but `@layer`. A rule that re-declares the token for some elements
 * or some conditions (`[data-theme='…']`, `@media`, `@supports`) is counted and printed, not
 * compared — a static meta tag has one value and cannot follow it.
 *
 * It does not reach the copies outside the frontend source: the background baked into the PNG
 * icons (`backend/scripts/build-icons.mjs`), the pack table of the database, and the canvas baked
 * into the Pulse image assets. The last one is held by `check:assets`; the first two belong to the
 * backend.
 *
 * It requires a hex literal in all four places. A canvas written as `rgb()` or as a `var()` is
 * reported rather than resolved: three of the four readers are not CSS engines.
 *
 * Run: node scripts/check-canvas.mjs   (cwd `frontend/`; wired into `npm run build`)
 */
import fs from 'node:fs/promises';

const LF = String.fromCharCode(10);
const TOKENS = 'src/ui/tokens/tokens.css';
const HTML = 'index.html';
const MANIFEST = 'public/manifest.webmanifest';
const TOKEN = '--surface-0';

const lineOf = (text, offset) => text.slice(0, offset).split(LF).length;
const squash = (s) => s.trim().replace(/\s+/g, ' ');
const spaces = (s) => s.replace(/[^\r\n]/g, ' ');

/** `#RGB` or `#RRGGBB` as upper-case `#RRGGBB`; anything else is not a canvas this gate can compare. */
function hex(value) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
  if (!m) return null;
  const digits = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${digits.toUpperCase()}`;
}

async function read(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    console.error(`check-canvas: cannot read ${file} — run from frontend/; has the file been moved?`);
    process.exit(1);
  }
}

const problems = [];

// ─── 1. the source: --surface-0 of the unconditional :root rule ───────────────────────────────

const css = await read(TOKENS);
/* Comments and string contents blanked to spaces of the same length: offsets and lines survive,
   and a brace or a comma inside a comment or a quoted attribute value cannot derail the walk. */
const cssCode = css
  .replace(/\/\*[\s\S]*?\*\//g, spaces)
  .replace(/"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'/g, spaces);

/** The rules and at-rules open at `offset` — outermost first. */
function openBlocksAt(text, offset) {
  const stack = [];
  let from = 0;
  for (let i = 0; i < offset; i += 1) {
    const ch = text[i];
    if (ch === '{') {
      stack.push(squash(text.slice(from, i)));
      from = i + 1;
    } else if (ch === '}') {
      stack.pop();
      from = i + 1;
    } else if (ch === ';') {
      from = i + 1;
    }
  }
  return stack;
}

const defaults = [];
const overrides = [];
for (const m of cssCode.matchAll(/(?<![\w-])--surface-0\s*:\s*([^;{}]+)(?=[;}])/g)) {
  const open = openBlocksAt(cssCode, m.index);
  const line = lineOf(cssCode, m.index);
  /* The default: a rule whose selector list names `:root`, with nothing around it that could
     switch it off. `@layer` only orders the cascade; `@media`, `@supports` and a parent selector
     make the declaration conditional. */
  const isDefault =
    open.length > 0 &&
    open.at(-1).split(',').some((selector) => selector.trim() === ':root') &&
    open.slice(0, -1).every((wrapper) => /^@layer\s+[\w-]+$/i.test(wrapper));
  (isDefault ? defaults : overrides).push({ value: squash(m[1]), line });
}

let canvas = null;
let canvasAt = TOKENS;
if (defaults.length === 0) {
  problems.push(
    `  ${TOKENS} declares no \`${TOKEN}\` in an unconditional \`:root\` rule (top level, or inside \`@layer\` only).` +
      LF +
      `      That declaration is the canvas every other copy is compared with. If the token moved or was` +
      LF +
      `      renamed, this gate has to move with it — a gate whose subject is gone passes forever.`,
  );
} else if (new Set(defaults.map((d) => hex(d.value) ?? d.value)).size > 1) {
  problems.push(
    `  ${TOKENS} declares \`${TOKEN}\` in \`:root\` more than once, with different values: ` +
      defaults.map((d) => `\`${d.value}\` (line ${d.line})`).join(', ') +
      `.` +
      LF +
      `      The last one wins in the browser; the copies in ${HTML} and ${MANIFEST} can only match one.`,
  );
} else {
  const { value, line } = defaults.at(-1);
  canvasAt = `${TOKENS}:${line}`;
  canvas = hex(value);
  if (!canvas) {
    problems.push(
      `  \`${TOKEN}\` is \`${value}\` (${canvasAt}) — the canvas must be a hex literal (#RRGGBB).` +
        LF +
        `      ${HTML} and ${MANIFEST} repeat it by hand and cannot resolve a \`var()\` or a colour function;` +
        LF +
        `      a value this gate cannot read is a value it cannot compare.`,
    );
  }
}

// ─── 2. the three copies ──────────────────────────────────────────────────────────────────────

const copies = [];

const html = await read(HTML);
const htmlCode = html.replace(/<!--[\s\S]*?-->/g, spaces);
const metas = [];
for (const tag of htmlCode.matchAll(/<meta\b[^>]*>/gi)) {
  const attrs = {};
  for (const a of tag[0].matchAll(/([A-Za-z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
  }
  if ((attrs.name ?? '').toLowerCase() === 'theme-color') metas.push({ attrs, line: lineOf(htmlCode, tag.index) });
}
if (metas.length !== 1) {
  problems.push(
    `  ${HTML} has ${metas.length} \`<meta name="theme-color">\` tag(s); there must be exactly one.` +
      LF +
      (metas.length === 0
        ? `      Without it the browser chrome and the overscroll area take the browser's own colour.`
        : `      One canvas, one tag: with several, which one a browser picks is its own business.`),
  );
} else if ('media' in metas[0].attrs) {
  problems.push(
    `  The \`<meta name="theme-color">\` of ${HTML} (line ${metas[0].line}) carries a \`media\` attribute.` +
      LF +
      `      The app has one canvas in every condition; a conditional tag leaves the others uncovered.`,
  );
} else {
  copies.push({
    what: `\`<meta name="theme-color">\``,
    where: `${HTML}:${metas[0].line}`,
    value: metas[0].attrs.content ?? '',
    shows: 'the browser chrome and the overscroll area flash the other colour until the stylesheet lands',
  });
}

const manifestText = await read(MANIFEST);
let manifest = null;
try {
  manifest = JSON.parse(manifestText);
} catch (err) {
  problems.push(`  ${MANIFEST} is not valid JSON — ${err.message}`);
}
if (manifest) {
  const fields = [
    ['theme_color', 'the title bar and the task-switcher card of the installed app keep the other colour'],
    ['background_color', 'the installed app starts on a splash screen of the other colour'],
  ];
  for (const [field, shows] of fields) {
    const at = manifestText.search(new RegExp(`"${field}"\\s*:`));
    const where = at === -1 ? MANIFEST : `${MANIFEST}:${lineOf(manifestText, at)}`;
    if (typeof manifest[field] !== 'string') {
      problems.push(
        `  ${MANIFEST} has no \`${field}\` string.` +
          LF +
          `      Without it the installed app falls back to the system's own colour for that surface.`,
      );
      continue;
    }
    copies.push({ what: `\`${field}\``, where, value: manifest[field], shows });
  }
}

for (const copy of copies) {
  const value = hex(copy.value);
  if (!value) {
    problems.push(
      `  ${copy.what} is \`${copy.value}\` (${copy.where}) — it must be a hex literal (#RRGGBB),` +
        LF +
        `      the same one as \`${TOKEN}\`${canvas ? ` (${canvas})` : ''}.`,
    );
  } else if (canvas && value !== canvas) {
    problems.push(
      `  ${copy.what} is ${value} (${copy.where}), and \`${TOKEN}\` is ${canvas} (${canvasAt}).` +
        LF +
        `      On a phone ${copy.shows}.` +
        LF +
        `      The token is the source: set the copy to ${canvas} — or, if the canvas really changed, change all four.`,
    );
  }
}

if (problems.length) {
  console.error(`check-canvas: ${problems.length} problem(s)` + LF);
  for (const p of problems) console.error(p);
  console.error(LF);
  process.exit(1);
}

if (overrides.length) {
  console.log(
    `check-canvas: note — ${overrides.length} other rule(s) re-declare \`${TOKEN}\` (${TOKENS} line ` +
      `${overrides.map((o) => o.line).join(', ')}); a static theme-color cannot follow them, so they are not compared.`,
  );
}
console.log(
  `check-canvas: OK — ${canvas} in all four places (${TOKEN}, theme-color, manifest theme_color and background_color)`,
);
