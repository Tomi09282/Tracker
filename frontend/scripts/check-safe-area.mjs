// scripts/check-safe-area.mjs — every element that touches a screen edge accounts for the inset.
//
// ═══ THE RULE, AND WHY IT IS A GATE ════════════════════════════════════════════════════════════
//
// `index.html` sets `viewport-fit=cover`. That is what makes `env(safe-area-inset-*)` report
// anything — and it is also what lets the layout extend UNDER the notch, the home indicator and the
// rounded corners. Cover mode without insets is strictly worse than not having it.
//
// So: a fixed or absolutely-positioned element pinned to an edge must account for that edge's
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
// Run: node scripts/check-safe-area.mjs
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const INDEX_HTML = 'index.html';
const GLOBAL_CSS = 'src/index.css';

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts|css)$/.test(e.name)) files.push(p);
  }
})(SRC);

const read = (p) => fs.readFileSync(p, 'utf8');
const problems = [];

/* ── 1. cover mode is on, because none of the rest means anything without it ──────────────────── */
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

/* ── 2. the horizontal gutter accounts for a landscape notch ──────────────────────────────────── */
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

/* ── 3. edge-pinned fixed elements account for their edge ─────────────────────────────────────── */

/**
 * Elements exempt from the rule, each with the reason.
 *
 * An exemption is a written decision. "It looked fine on my laptop" is exactly the reasoning this
 * gate exists to replace, and on a laptop every inset is zero.
 */
const EXEMPT = new Map([
  ['ui/feedback/variants/E14E20.tsx:top', 'the sheet pins to the BOTTOM; its top-0 case is the centred dialog, which never touches an edge'],
  ['ui/shell/OfflineIndicator.tsx:bottom', 'sticky to the top of the layout column; it never reaches the bottom edge'],
]);

for (const file of files) {
  if (!/\.tsx$/.test(file)) continue;
  const rel = path.relative('.', file).replace(/\\/g, '/').replace(/^src\//, '');
  const src = read(file);
  // Only CODE. A comment explaining the rule must not be read as an instance of breaking it — the
  // same trap that made two backend gates report the routes they had just been fixed on.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  for (const [edge, inset, pad] of [
    ['top-0', 'safe-area-inset-top', 'pt-'],
    ['bottom-0', 'safe-area-inset-bottom', 'pb-'],
  ]) {
    /*
     * ═══ THE WINDOW MAY CROSS A QUOTE, AND IT HAD TO LEARN TO ══════════════════════════════════
     *
     * This was `fixed[^'"`]*\bEDGE\b` — the two tokens had to sit in ONE string literal with no
     * quote between them. Real className code does not oblige:
     *
     *     cn('fixed inset-x-0', open ? 'bottom-0' : '-bottom-full')
     *
     * `ui/feedback/variants/E14E20.tsx` — the bottom SHEET, the one element in the product whose
     * whole job is to sit on the bottom edge of a phone — was never examined by this rule. Measured
     * by running the strict and loose forms side by side over every .tsx:
     *
     *     bottom-0   MISSED BY THE REGEX  ui/feedback/variants/E14E20.tsx   accounts: yes
     *
     * It happens to pad itself, so there was no live defect. That is the worse case, not the better
     * one: the file was compliant, the gate was green, and the gate was green for the wrong reason.
     * Remove the padding and nothing would have said so.
     *
     * A bounded window rather than "both tokens anywhere in the file", because file-scope would pair
     * an unrelated `fixed` with an unrelated `bottom-0` two hundred lines apart. 400 characters is
     * comfortably more than any className expression here and far less than a component.
     */
    const WINDOW = 400;
    if (!new RegExp(`fixed[\\s\\S]{0,${WINDOW}}?\\b${edge}\\b|\\b${edge}\\b[\\s\\S]{0,${WINDOW}}?fixed`).test(code))
      continue;
    const key = `${rel}:${edge.replace('-0', '')}`;
    if (EXEMPT.has(key)) continue;
    // Either the element pads itself, or it uses a token that already carries the inset.
    const accounts =
      code.includes(inset) ||
      code.includes('--content-pad-b') ||
      new RegExp(`${pad}\\[var\\(--`).test(code);
    if (!accounts) {
      problems.push(
        `${rel} pins a fixed element to ${edge} and never mentions ${inset}.\n` +
          `      On a notched device that edge is under the ${edge === 'top-0' ? 'notch' : 'home indicator'}.\n` +
          `      Pad it, use a token that carries the inset, or add "${key}" to EXEMPT with a reason.`,
      );
    }
  }
}

// A stale exemption hides a regression: the file changed, the reason no longer applies, and the
// entry keeps waving it through.
for (const key of EXEMPT.keys()) {
  const [rel] = key.split(':');
  if (!fs.existsSync(path.join(SRC, rel))) {
    problems.push(`EXEMPT names ${rel}, which no longer exists — delete the entry`);
  }
}

const insetUsers = files.filter((f) => read(f).includes('safe-area-inset')).length;
// The summary REPORTS what was measured. It used to print "viewport-fit=cover" unconditionally,
// which meant the one run where that was false printed it anyway — a header stating the thing the
// body was in the middle of refuting.
console.log(
  `check-safe-area: viewport-fit ${coverMode ? 'cover' : 'MISSING'}, ` +
    `${insetUsers} file(s) use an inset, ${EXEMPT.size} exemption(s)`,
);

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  ${p}`);
  console.log(`\ncheck-safe-area FAILED — ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('check-safe-area: OK — every edge-pinned element accounts for its inset');
