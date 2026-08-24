/**
 * check-aurora — nothing may paint over the light the whole design floats on.
 *
 * ═══ WHY THIS GATE EXISTS ══════════════════════════════════════════════════════════════════════
 *
 * `AuroraBackdrop` is `fixed inset-0 -z-10`, and its docblock states the precondition in words:
 * it works "under a transparent body". `AppLayout` then wrapped it in
 *
 *     <div className="min-h-dvh bg-surface-0">
 *
 * A negative-z child paints AFTER its stacking context's background but BEFORE the background of
 * any non-context ancestor. That wrapper creates no stacking context, so the paint order was: body
 * background, aurora, then the wrapper's opaque `--surface-0` straight over the top.
 *
 * Every screen inside `AppLayout` was glass over flat black. The four public routes mount their own
 * backdrop with no such wrapper — which is why the LOGIN screen looked right and nothing behind it
 * did, and is exactly why it survived review: the one screen that worked was the one everybody used
 * to check that it worked.
 *
 * There is no error for this, no console warning, and no other gate that can see it. One class on
 * one line silently deletes the visual foundation of the entire product. That is precisely the
 * shape of defect this project writes gates for.
 *
 * ═══ WHAT IT CHECKS ════════════════════════════════════════════════════════════════════════════
 *
 * In every file that renders `<AuroraBackdrop`, it walks the JSX from the start of the file to the
 * mount, keeping a stack of open elements, and reports any ANCESTOR carrying a background utility.
 * Siblings are ignored on purpose — a sibling's background does not cover the backdrop, and a gate
 * that flagged them would be reporting correct code, which is how a gate gets switched off.
 *
 * `bg-transparent` is allowed, because saying so explicitly is a reasonable thing to write.
 *
 * Run: node scripts/check-aurora.mjs   (wired into `npm run build`)
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('src');
const LF = String.fromCharCode(10);

/** Any utility that paints a background. `bg-[image:...]` is a gradient and covers just as well. */
const BG = /\bbg-(?!transparent\b)[\w[\]().,%/-]+/;

const files = [];
const walk = async (dir) => {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name.endsWith('.tsx')) files.push(full);
  }
};
await walk(ROOT);

const problems = [];
let mounts = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (rel === 'ui/shell/AuroraBackdrop.tsx') continue;

  const source = await fs.readFile(file, 'utf8');
  if (!source.includes('<AuroraBackdrop')) continue;

  const lines = source.split(LF);

  // One pass per mount, because a file may render the backdrop in several branches — the
  // marketplace pages each mount it in their loading, error and loaded returns.
  lines.forEach((line, index) => {
    if (!line.includes('<AuroraBackdrop')) return;
    mounts += 1;

    /** Open elements above this point, innermost last. */
    const stack = [];
    for (let i = 0; i < index; i += 1) {
      const text = lines[i];
      // Opening tags that are not self-closed and not closed on their own line.
      for (const m of text.matchAll(/<([A-Za-z][\w.]*)\b/g)) {
        const tag = m[1];
        const after = text.slice(m.index);
        const selfClosed = after.includes('/>');
        const closedHere = after.includes(`</${tag}>`);
        if (selfClosed || closedHere) continue;
        stack.push({ tag, line: i + 1, className: null });
      }
      for (const m of text.matchAll(/<\/([A-Za-z][\w.]*)>/g)) {
        const tag = m[1];
        for (let s = stack.length - 1; s >= 0; s -= 1) {
          if (stack[s].tag === tag) {
            stack.splice(s, 1);
            break;
          }
        }
      }
      // A className may sit on a later line than its tag, which is the normal formatting here.
      const bg = text.match(BG);
      if (bg && stack.length) {
        const owner = stack[stack.length - 1];
        if (owner.className === null) owner.className = { value: bg[0], line: i + 1 };
      }
    }

    for (const el of stack) {
      if (!el.className) continue;
      problems.push(
        `${rel}:${el.className.line} — <${el.tag}> wraps the AuroraBackdrop mounted on line ` +
          `${index + 1} and paints \`${el.className.value}\` over it. A negative-z backdrop is ` +
          `covered by any opaque ancestor background; the base colour belongs on \`body\` ` +
          `(src/index.css already paints it there). See ADR-0018.`,
      );
    }
  });
}

if (problems.length) {
  console.error(`check-aurora: ${problems.length} problem(s)` + LF);
  for (const p of problems) console.error(`  ${p}`);
  console.error(LF);
  process.exit(1);
}

console.log(`check-aurora: ${mounts} backdrop mount(s), no ancestor paints over any of them`);
