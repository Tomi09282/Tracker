/**
 * check-type-scale — the scale has two homes, and they have to agree.
 *
 * ═══ WHY ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * `tailwind-merge` decides conflicts by classifying a class into a group, and it ships knowing
 * stock Tailwind's names. This project's steps are custom — `text-title-1`, `text-body-s` — and so
 * are its ink tokens, `text-text-1` / `-2` / `-3`. Unconfigured, the merger files all of them under
 * text-COLOUR and keeps the last one, so `cn('text-title-1', 'text-text-1')` returns just the
 * colour and the size is silently deleted. Measured: 41 call sites across 27 files were rendering
 * at the inherited body size instead of their declared step. See ADR-0019.
 *
 * `cn.ts` now declares the steps, which fixes it — for the steps it lists. A step added to
 * `tokens.css` and not added there is a step that silently does not survive `cn()`, with no error,
 * no warning, and source code that looks entirely correct. That is what this gate watches.
 *
 * ═══ WHAT IT CANNOT DO ═════════════════════════════════════════════════════════════════════════
 *
 * It cannot catch the original defect. That one lived in a dependency's runtime classification, not
 * in the source text, and reproducing it here would mean reimplementing the group resolution that
 * is the thing under test. This checks the one thing that IS checkable: that the two lists match.
 *
 * Run: node scripts/check-type-scale.mjs   (wired into `npm run build`)
 */
import fs from 'node:fs/promises';

const LF = String.fromCharCode(10);
const TOKENS = 'src/ui/tokens/tokens.css';
const CN = 'src/lib/cn.ts';

const css = await fs.readFile(TOKENS, 'utf8');
const cn = await fs.readFile(CN, 'utf8');

/*
 * A type step is `--text-<name>: <size>`, where the value is a length.
 *
 * Two things have to be excluded and both are load-bearing:
 *   `--text-1` / `-2` / `-3` are the INK tokens — same prefix, different meaning, and they belong
 *   in the colour group where the merger already puts them.
 *   `--text-body--font-weight` and friends are Tailwind 4's per-step modifiers, not steps.
 */
const declared = new Set();
for (const m of css.matchAll(/^\s*--text-([a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
  const name = m[1];
  const value = m[2].trim();
  if (name.includes('--')) continue;
  if (/^[0-9]+$/.test(name)) continue;
  if (!/^[\d.]+(rem|px|em)$/.test(value)) continue;
  declared.add(name);
}

const block = cn.match(/const TYPE_STEPS = \[([\s\S]*?)\]/);
if (!block) {
  console.error(`check-type-scale: could not find TYPE_STEPS in ${CN} — has it been renamed?`);
  process.exit(1);
}
const listed = new Set([...block[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));

const missing = [...declared].filter((s) => !listed.has(s)).sort();
const extra = [...listed].filter((s) => !declared.has(s)).sort();

if (missing.length || extra.length) {
  console.error(`check-type-scale: ${missing.length + extra.length} problem(s)` + LF);
  for (const s of missing) {
    console.error(
      `  \`text-${s}\` is declared in ${TOKENS} but not listed in ${CN}.` +
        LF +
        `      Any cn() call that puts it beside an ink token will silently drop it — the element` +
        LF +
        `      renders at the inherited size. Add '${s}' to TYPE_STEPS. See ADR-0019.`,
    );
  }
  for (const s of extra) {
    console.error(
      `  \`${s}\` is listed in ${CN} but no --text-${s} exists in ${TOKENS}.` +
        LF +
        `      Either the step was removed and this entry is stale, or the name is a typo — in` +
        LF +
        `      which case the REAL step is unprotected and this line is hiding it.`,
    );
  }
  console.error(LF);
  process.exit(1);
}

console.log(`check-type-scale: OK — ${declared.size} step(s), declared and merged alike`);
