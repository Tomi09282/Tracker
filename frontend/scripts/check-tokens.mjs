#!/usr/bin/env node
/**
 * check-tokens.mjs — the design-system gate. Runs before tsc in `npm run build`.
 *
 * The previous implementation failed because raw values drifted away from the VISUAL DESIGN
 * BIBLE one component at a time and nothing caught it (ADR-0006). This script makes that class
 * of drift a BUILD FAILURE, not a review finding.
 *
 * It refuses to let anything but the token file carry a raw color, radius, duration or
 * off-grid spacing, and it refuses interactive elements that opt out of the 44px floor.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve('src');
const TOKEN_FILE = path.join(SRC, 'ui', 'tokens', 'tokens.css');
const EXT = new Set(['.ts', '.tsx', '.css']);

/** Tailwind's stock palette. Using it means bypassing the semantic layer entirely. */
const TW_PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

const RULES = [
  {
    id: 'raw-hex',
    re: /#[0-9a-fA-F]{3,8}\b/g,
    msg: 'raw hex color — use a semantic token',
  },
  {
    id: 'raw-color-fn',
    re: /\b(?:rgba?|hsla?)\s*\(\s*\d/g,
    msg: 'raw rgb()/hsl() literal — use a semantic token',
  },
  {
    id: 'tailwind-palette',
    re: new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|divide|placeholder)-(?:${TW_PALETTE})-\\d{2,3}\\b`, 'g'),
    msg: "Tailwind's stock palette — the app only knows surface/text/accent/semantic tokens",
  },
  {
    id: 'raw-duration',
    re: /\bduration-\[\s*\d+m?s\s*\]/g,
    msg: 'raw duration — use duration-[var(--duration-*)]',
  },
  {
    id: 'raw-duration-in-animate',
    // `animate-[skeleton-sweep_1.2s_linear_infinite]` — a duration hidden inside an arbitrary
    // ANIMATION utility, which `raw-duration` above never looked at. This is the shape that hid a
    // 2s from five consecutive Bible audits: a skeleton is only on screen while data is in flight,
    // so a probe that waits for the screen to settle can never see one. A static rule does not
    // care whether the element was ever rendered.
    //
    // It also caught the reverse of the same defect — `animate-[hold-fill_550ms_...]` sitting
    // beside `const HOLD_MS = 550`, two literals that had to agree with a comment claiming they
    // did. Underscores are Tailwind's space separator inside arbitrary values.
    re: /\banimate-\[[^\]]*?[_[]\d+(?:\.\d+)?m?s[_\]]/g,
    msg: 'raw duration inside animate-[…] — pass a token: animate-[name_var(--duration-*)_…]',
  },
  {
    id: 'raw-radius',
    re: /\brounded-\[\s*\d+(?:px|rem)\s*\]/g,
    msg: 'raw radius — use rounded-card / rounded-button / rounded-chip / rounded-field',
  },
  {
    id: 'raw-easing',
    re: /cubic-bezier\s*\(/g,
    msg: 'raw easing curve — use var(--ease-standard)',
  },
  {
    id: 'off-grid-spacing',
    // p-[13px], gap-[7px], mt-[30px] … anything not a multiple of 4.
    re: /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-[xy])-\[\s*(\d+)px\s*\]/g,
    msg: 'off-grid spacing — the 4px grid is the only spacing scale',
    check: (m) => Number(m[1]) % 4 !== 0,
  },
  {
    id: 'tiny-target',
    // size-N / h-N on a Tailwind step below 11 (=44px) applied to something interactive.
    re: /<(?:button|a)\b[^>]*\b(?:size|h|min-h)-(\d{1,2})\b/g,
    msg: 'interactive element below the 44px floor — use min-h-[var(--target-min)]',
    check: (m) => Number(m[1]) < 11,
  },
  {
    id: 'raw-button',
    // The structural half of the 44px guarantee: outside src/ui/ there is no way to hand-roll
    // a control, so nothing can bypass the primitive's floor and five interaction states.
    re: /<button\b/g,
    msg: 'raw <button> — compose src/ui/primitives/Pressable instead',
    uiExempt: true,
  },
];

/** `src/ui/` is where primitives are DEFINED, so the primitive rules do not apply to it. */
const UI_DIR = path.join(SRC, 'ui');

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (EXT.has(path.extname(e.name))) yield full;
  }
}

/** Tailwind generates these. A typo in the projects own col-* utilities is still caught. */
const TAILWIND_COLUMN_UTILITIES = new Set(['col-span', 'col-start', 'col-end', 'col-auto']);
const violations = [];

/*
 * Rule set two: a reference that points at nothing.
 *
 * The rules above police raw VALUES. They cannot see the opposite failure — a name that looks
 * like a token, passes every check, and resolves to the empty string at runtime. That failure has
 * now happened twice on this project:
 *
 *   - `max-w-[var(--measure-form)]` — the token was never declared, so the computed value was
 *     `max-width: none` and the form ran edge to edge on desktop.
 *   - `size-icon-s` — written as if Tailwind generated it from `--icon-sm`. There is no `--size-*`
 *     theme namespace, so the class was inert and every icon silently fell back to 24px.
 *
 * Neither produced an error, a warning, or a failed build. Both were found by measuring the DOM.
 * This is the gate that would have caught them at build time instead.
 */
const tokenSource = await fs.readFile(TOKEN_FILE, 'utf8');
// NOT anchored to the line start. It used to be `/^\s*(--[a-z0-9-]+)\s*:/gim`, which sees only the
// FIRST declaration on a line — and `tokens.css` puts pairs together for readability:
//
//     --danger:  #F87171;  --on-danger:  #2A0A0C;
//
// so `--on-danger`, `--on-success`, `--on-warning` and `--on-info` were invisible to this gate.
// Four legitimately declared tokens that the build would reject on use, which is how a gate stops
// being a guard and starts being an obstacle people route around.
//
// Measured when found: 163 tokens visible, 167 declared.
const declared = new Set([...tokenSource.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
// Tailwind declares its own; `env()` and inherited CSS vars are not ours to verify.
const IGNORED_PREFIXES = ['--tw-', '--radix-', '--safe-'];

const indexCss = await fs.readFile(path.join(SRC, 'index.css'), 'utf8');

/** Utility classes this project defines by hand, so a reference to one is not a typo. */
const localUtilities = new Set([...indexCss.matchAll(/^\s*\.([a-z0-9-]+)\s*\{/gim)].map((m) => m[1]));

/*
 * Tailwind's built-in animation utilities carry durations this project never declared:
 * animate-pulse is 2s, animate-spin/bounce/ping are 1s. Nine feature files reached for
 * animate-pulse across three phases and every Bible audit reported "0 rogue durations", because
 * all of them measured SETTLED screens and a skeleton is only up while data is in flight.
 *
 * Banning them outright was rejected: a rule enforced by deleting the convenient thing gets routed
 * around, and the next screen writes the duration inline where nothing greps for it. So a built-in
 * may be USED exactly when index.css has re-pointed it at a token.
 *
 * The set is READ from index.css rather than typed here. An audit that carries its own copy of what
 * it audits will eventually disagree with it — this file learned that when its token list was typed
 * from memory, omitted --duration-instant, and reported a violation that did not exist.
 */
const BUILTIN_ANIMATIONS = ['pulse', 'spin', 'bounce', 'ping'];
const pinnedAnimations = new Set(
  [...indexCss.matchAll(/\.animate-([a-z]+)\s*\{[^}]*animation-duration:\s*var\(\s*--duration-[a-z-]+\s*\)/g)].map(
    (m) => m[1],
  ),
);

for await (const file of walk(SRC)) {
  if (path.resolve(file) === TOKEN_FILE) continue; // the one file allowed raw values
  const text = await fs.readFile(file, 'utf8');

  // A whole file may opt out of the COLOR rules when its colors are data rather than styling —
  // a palette of picker presets, or the black/white constants a contrast formula compares
  // against. The marker requires a written reason on the same line, so the exemption shows up
  // in review as a claim someone made rather than as silence.
  const fileExempt = /token-lint-disable-file:\s*\S+/.test(text);

  const lines = text.split('\n');

  /*
   * Custom properties this FILE provides itself, via a style object.
   *
   * `var(--x)` is normally required to name a design token, and that rule caught two silent
   * layout bugs. But a value that comes from JavaScript is not a token and has no business in
   * tokens.css — `SetRow` drives its hold-fill animation from `const HOLD_MS`, and it must go
   * through a custom property because the animation lives on an `::after` pseudo-element, which
   * an inline style cannot reach.
   *
   * So the test is not a naming convention anybody has to remember: a var is locally provided if
   * this same file assigns it. Nothing to learn, nothing to spell right, and a typo still fails —
   * `--hold-fill-ms` used in the class and `--hold-fil-ms` set in the style object do not match.
   */
  const locallyProvided = new Set([...text.matchAll(/['"](--[a-z0-9-]+)['"]\s*:/gi)].map((m) => m[1]));

  lines.forEach((line, i) => {
    // A line may opt out with an explicit, reviewed justification.
    if (line.includes('token-lint-disable')) return;

    // A line that is ONLY a comment is prose, not shipped style. It was flagging itself: the
    // comment recording the `animate-[hold-fill_550ms_…]` defect quotes the defect, and a gate
    // that punishes the note explaining a fix is a gate people stop writing notes for. A trailing
    // comment on a line of real code is still checked, because that line still renders.
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;

    for (const rule of RULES) {
      if (rule.uiExempt && path.resolve(file).startsWith(UI_DIR)) continue;
      // The file-level exemption covers colors only. Radii, durations, spacing and hand-rolled
      // controls are never data, so those rules keep applying.
      if (fileExempt && (rule.id === 'raw-hex' || rule.id === 'raw-color-fn')) continue;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        if (rule.check && !rule.check(m)) continue;
        violations.push({
          file: path.relative(process.cwd(), file),
          line: i + 1,
          rule: rule.id,
          found: m[0].trim(),
          msg: rule.msg,
        });
      }
    }

    // Every `var(--x)` must name a token that tokens.css actually declares.
    //
    // The name must be CLOSED — followed by `)` or a `,` fallback. Without that, a template
    // literal like `var(--accent-${step})` reports its static prefix `--accent-` as undeclared,
    // which is a false positive: the name is assembled at runtime and this script cannot know it.
    // A gate that cries wolf is a gate someone switches off.
    for (const m of line.matchAll(/var\(\s*(--[a-z0-9-]+)\s*[,)]/gi)) {
      const name = m[1];
      if (declared.has(name) || locallyProvided.has(name) || IGNORED_PREFIXES.some((p) => name.startsWith(p))) continue;
      violations.push({
        file: path.relative(process.cwd(), file),
        line: i + 1,
        rule: 'undeclared-token',
        found: `var(${name})`,
        msg: `${name} is not declared in ui/tokens/tokens.css — it resolves to nothing at runtime, which is a silent layout bug, not an error.`,
      });
    }

    // A built-in animation utility is only allowed once index.css has pinned its duration to a
    // token. Restricted to .ts/.tsx on purpose: CSS files DECLARE these classes and prose in a
    // comment names them, and a gate that flags its own definition is a gate someone switches off.
    if (path.extname(file) === '.ts' || path.extname(file) === '.tsx') {
      for (const m of line.matchAll(/(?<![.\w-])animate-([a-z]+)\b/g)) {
        if (!BUILTIN_ANIMATIONS.includes(m[1]) || pinnedAnimations.has(m[1])) continue;
        violations.push({
          file: path.relative(process.cwd(), file),
          line: i + 1,
          rule: 'unpinned-builtin-animation',
          found: m[0],
          msg: `Tailwind's animate-${m[1]} carries a duration no token declares. Pin it in index.css: .animate-${m[1]} { animation-duration: var(--duration-ambient); }`,
        });
      }
    }

    /*
     * A `size-icon-*` style utility must be a class this project actually defines. Tailwind
     * silently ignores a class it cannot generate, so a typo here costs nothing at build time
     * and everything at render time.
     *
     * ═══ EXCEPT THAT `col-` IS ALSO TAILWIND'S OWN PREFIX ══════════════════════════════════════
     *
     * The rule was written to catch typos in this project's `col-mobile` and `col-wide`. Measured:
     * it also flags `col-span-3`, `col-start-2` and `col-end-4` — real Tailwind grid utilities that
     * ARE generated. So the twelve-column layout the admin panel was specced with could not be
     * written at all without the build going red, and the only way to discover that was to try it.
     *
     * A gate that forbids the correct answer sends people to a worse one — here, a flex fallback
     * that cannot express column spans. Tailwind's own grid-column utilities are named, so a typo
     * in `col-mobile` is still caught and `col-span-3` is not.
     */
    for (const m of line.matchAll(/\b(size-icon-[a-z0-9-]+|col-[a-z]+|screen-x)\b/gi)) {
      if (localUtilities.has(m[1])) continue;
      if (TAILWIND_COLUMN_UTILITIES.has(m[1].toLowerCase())) continue;
      violations.push({
        file: path.relative(process.cwd(), file),
        line: i + 1,
        rule: 'undefined-utility',
        found: m[1],
        msg: `.${m[1]} is not defined in src/index.css and Tailwind cannot generate it — the class is inert.`,
      });
    }
  });
}

if (violations.length === 0) {
  console.log('check-tokens: OK — no raw values outside the token layer');
  process.exit(0);
}

console.error(`\ncheck-tokens: ${violations.length} violation(s)\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.found}`);
  console.error(`      ${v.msg}`);
}
console.error('\nFix these or annotate the line with `token-lint-disable` and a reason.\n');
process.exit(1);
