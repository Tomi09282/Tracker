/**
 * check-type-scale — the scale has three homes, and they have to agree.
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
 * ═══ THE THREE LEGS ════════════════════════════════════════════════════════════════════════════
 *
 * 1. THE TWO LISTS MATCH. Every `--text-<step>` of `tokens.css` is in `TYPE_STEPS` of `cn.ts`, and
 *    the other way round.
 *
 * 2. A STEP IS A PLAIN LENGTH. `--text-<step>` is `<number>rem`, `px` or `em` — never `min()`,
 *    `clamp()`, `calc()` or a `var()`. This used to be a silent skip: a step written as
 *    `min(124px, 31vw)` was simply not counted, so it could be missing from `cn.ts` with the gate
 *    green. Pulse's one fluid size (the giant numeral) is a plain step plus a cap that lives
 *    OUTSIDE the `--text-` namespace and is applied as an inline font-size, so nothing here had to
 *    be widened — and the skip became a failure.
 *
 * 3. FAMILY AND CASE ARE BOUND ONCE, AND TO EXACTLY THE RIGHT STEPS. Tailwind 4 reads three
 *    modifiers per step (`--line-height`, `--letter-spacing`, `--font-weight`). It has none for the
 *    family or for `text-transform`, and in Pulse the family IS part of the role: an eyebrow in the
 *    body face is not an eyebrow. So the binding is one block of CSS,
 *
 *        @layer components {
 *          /* type-binding:start *\/
 *          .text-giant, .text-num, .text-display-xl, .text-display, .text-eyebrow { font-family: var(--font-display); }
 *          .text-data-l, .text-data, .text-micro { font-family: var(--font-mono); }
 *          .text-display-xl, .text-display, .text-eyebrow, .text-micro { text-transform: uppercase; }
 *          /* type-binding:end *\/
 *        }
 *
 *    — a third copy of the step list, and the one nobody sees drift: drop `.text-eyebrow` from it
 *    and every section label in the product turns into sentence-case Geist, with a green build and
 *    call sites that read `text-eyebrow` exactly as before. This leg reads the block and compares it
 *    with `ROSTER` below, in both directions. It also holds the block inside `@layer components`:
 *    unlayered CSS beats every layer, so outside it an explicit `font-body` or `normal-case` at a
 *    call site would silently stop working.
 *
 *    The leg is DORMANT while the Pulse ramp does not exist (no block, and none of the steps that
 *    only Pulse has). It says so on every run. The first Pulse step or the block itself wakes it,
 *    and from then on a missing block is a failure.
 *
 * ═══ WHAT IT CANNOT DO ═════════════════════════════════════════════════════════════════════════
 *
 * It cannot catch the original defect. That one lived in a dependency's runtime classification, not
 * in the source text, and reproducing it here would mean reimplementing the group resolution that
 * is the thing under test. This checks what IS checkable: that the three lists match.
 *
 * It does not know which face a NEW step should have. A step that is in none of the three roster
 * lists is a body-face, sentence-case step — which is also what the browser does with it. Giving a
 * new step the display face means editing `ROSTER` and the block in one commit.
 *
 * It reads the block as text, not the cascade: a later rule elsewhere that overrides the family of
 * a step is invisible here.
 *
 * Run: node scripts/check-type-scale.mjs   (cwd `frontend/`; wired into `npm run build`)
 */
import fs from 'node:fs/promises';

const LF = String.fromCharCode(10);
const TOKENS = 'src/ui/tokens/tokens.css';
const CN = 'src/lib/cn.ts';

/** Where the binding block may live. Exactly one of them holds it. */
const BINDING_HOMES = ['src/index.css', TOKENS];

/**
 * The faces and the case of the ramp — Pulse System §2.2, PLAN.md 3.3.
 *
 * This is the design, written down once; the block in the stylesheet is its implementation. A step
 * that is in no list here is body face, sentence case, and must not appear in the block with a
 * family or a case.
 */
const ROSTER = {
  display: {
    steps: ['giant', 'num', 'display-xl', 'display', 'eyebrow'],
    property: 'font-family',
    value: 'var(--font-display)',
    means: 'the display face',
    lost: 'it renders in the body face',
  },
  mono: {
    steps: ['data-l', 'data', 'micro'],
    property: 'font-family',
    value: 'var(--font-mono)',
    means: 'the mono face',
    lost: 'it renders in the body face',
  },
  uppercase: {
    steps: ['display-xl', 'display', 'eyebrow', 'micro'],
    property: 'text-transform',
    value: 'uppercase',
    means: 'upper case',
    lost: 'it renders in sentence case',
  },
};

/**
 * `display` and `micro` are ALSO names of the ramp that Pulse replaces, so their presence says
 * nothing about whether the Pulse ramp has landed. Every other roster step exists only in Pulse:
 * one of them, declared or listed, makes the binding leg mandatory.
 */
const PRE_PULSE_HOMONYMS = new Set(['display', 'micro']);

const PLAIN_LENGTH = /^[\d.]+(rem|px|em)$/;

const css = await fs.readFile(TOKENS, 'utf8');
const cn = await fs.readFile(CN, 'utf8');

/**
 * Comments (and, on request, string contents) replaced by spaces of the same length. Newlines are
 * kept, so an offset in the result is the same offset — and the same line — in the file.
 */
function blank(text, { strings = false } = {}) {
  const spaces = (s) => s.replace(/[^\r\n]/g, ' ');
  let out = text.replace(/\/\*[\s\S]*?\*\//g, spaces);
  if (strings) out = out.replace(/"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'/g, spaces);
  return out;
}

const lineOf = (text, offset) => text.slice(0, offset).split(LF).length;
const squash = (s) => s.trim().replace(/\s+/g, ' ');
const quoteList = (names) => names.map((n) => `\`text-${n}\``).join(', ');

const problems = [];

// ─── legs 1 and 2: the step list, and what a step may be ──────────────────────────────────────

/*
 * A type step is `--text-<name>: <length>`.
 *
 * Two things have to be excluded and both are load-bearing:
 *   `--text-1` / `-2` / `-3` are the INK tokens — same prefix, different meaning, and they belong
 *   in the colour group where the merger already puts them.
 *   `--text-body--font-weight` and friends are Tailwind 4's per-step modifiers, not steps.
 *
 * Everything else in the namespace is a step, and a step whose value is not a plain length is
 * reported (leg 2) instead of being skipped.
 */
const cssCode = blank(css);
const declared = new Set();
const notPlain = [];
for (const m of cssCode.matchAll(/(?<![\w-])--text-([A-Za-z0-9_-]+)\s*:\s*([^;{}]+);/g)) {
  const name = m[1];
  const value = squash(m[2]);
  if (name.includes('--')) continue;
  if (/^[0-9]+$/.test(name)) continue;
  declared.add(name);
  if (!PLAIN_LENGTH.test(value)) notPlain.push({ name, value, line: lineOf(cssCode, m.index) });
}

const listBlock = cn.match(/const TYPE_STEPS = \[([\s\S]*?)\]/);
if (!listBlock) {
  console.error(`check-type-scale: could not find TYPE_STEPS in ${CN} — has it been renamed?`);
  process.exit(1);
}
const listed = new Set([...listBlock[1].matchAll(/'([A-Za-z0-9_-]+)'/g)].map((m) => m[1]));

for (const s of [...declared].filter((x) => !listed.has(x)).sort()) {
  problems.push(
    `  \`text-${s}\` is declared in ${TOKENS} but not listed in ${CN}.` +
      LF +
      `      Any cn() call that puts it beside an ink token will silently drop it — the element` +
      LF +
      `      renders at the inherited size. Add '${s}' to TYPE_STEPS. See ADR-0019.`,
  );
}
for (const s of [...listed].filter((x) => !declared.has(x)).sort()) {
  problems.push(
    `  \`${s}\` is listed in ${CN} but no --text-${s} exists in ${TOKENS}.` +
      LF +
      `      Either the step was removed and this entry is stale, or the name is a typo — in` +
      LF +
      `      which case the REAL step is unprotected and this line is hiding it.`,
  );
}
for (const { name, value, line } of notPlain) {
  problems.push(
    `  \`--text-${name}\` is \`${value}\` (${TOKENS}:${line}) — a type step must be a plain length in rem, px or em.` +
      LF +
      `      Keep the step a plain length and put a fluid cap in a token OUTSIDE the --text- namespace` +
      LF +
      `      (\`--giant-fluid: min(var(--text-giant), 31vw)\`), applied as an inline font-size. If this is` +
      LF +
      `      not a type step at all, it must not be named --text-…: the namespace is the step list.`,
  );
}

// ─── leg 3: family and case, bound once ───────────────────────────────────────────────────────

const START = /\/\*\s*type-binding:start\s*\*\//g;
const END = /\/\*\s*type-binding:end\s*\*\//g;

/** The at-rules and rules that are open at `offset` — outermost first. */
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

/** Every style rule of `text`, each with the at-rules around it. Returns a reason when it cannot. */
function readRules(text, ancestry, out) {
  let from = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ';') {
      from = i + 1;
    } else if (ch === '}') {
      return 'a `}` closes something that was opened before the block began';
    } else if (ch === '{') {
      const prelude = squash(text.slice(from, i));
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') depth -= 1;
        j += 1;
      }
      if (depth > 0) return `\`${prelude} {\` is still open where the block ends`;
      const body = text.slice(i + 1, j - 1);
      if (prelude.startsWith('@')) {
        const reason = readRules(body, [...ancestry, prelude], out);
        if (reason) return reason;
      } else {
        out.push({ prelude, body, ancestry });
      }
      i = j;
      from = j;
      continue;
    }
    i += 1;
  }
  const rest = squash(text.slice(from));
  return rest ? `\`${rest}\` is not a rule` : null;
}

const template =
  `        @layer components {` +
  LF +
  `          /* type-binding:start */` +
  LF +
  Object.values(ROSTER)
    .map((r) => `          ${r.steps.map((s) => `.text-${s}`).join(', ')} { ${r.property}: ${r.value}; }`)
    .join(LF) +
  LF +
  `          /* type-binding:end */` +
  LF +
  `        }`;

const found = [];
let strayMarkers = 0;
for (const file of BINDING_HOMES) {
  const raw = file === TOKENS ? css : await fs.readFile(file, 'utf8');
  const starts = [...raw.matchAll(START)];
  const ends = [...raw.matchAll(END)];
  if (starts.length === 1 && ends.length === 1 && starts[0].index < ends[0].index) {
    found.push({ file, raw, from: starts[0].index + starts[0][0].length, to: ends[0].index, at: starts[0].index });
  } else {
    strayMarkers += starts.length + ends.length;
  }
}

const rosterSteps = [...new Set(Object.values(ROSTER).flatMap((r) => r.steps))];
const heralds = rosterSteps.filter((s) => !PRE_PULSE_HOMONYMS.has(s));
const pulseStepsPresent = heralds.filter((s) => declared.has(s) || listed.has(s));
const bindingDue = found.length > 0 || strayMarkers > 0 || pulseStepsPresent.length > 0;

let bindingSummary = '';

if (bindingDue) {
  if (strayMarkers > 0 || found.length > 1) {
    problems.push(
      `  The type-binding markers are not one pair: there must be exactly one \`/* type-binding:start */\`` +
        LF +
        `      followed by one \`/* type-binding:end */\`, in ONE of ${BINDING_HOMES.join(' or ')}.` +
        LF +
        `      Two blocks are two copies of the binding, and the second one is the one that drifts.`,
    );
  } else if (found.length === 0) {
    problems.push(
      `  The Pulse ramp is declared (${quoteList(pulseStepsPresent)}) and there is no type-binding block.` +
        LF +
        `      Without it every display, mono and upper-case step renders as sentence-case body text.` +
        LF +
        `      Add to ${BINDING_HOMES[0]}:` +
        LF +
        template,
    );
  } else {
    const { file, raw, from, to, at } = found[0];
    const code = blank(raw, { strings: true });
    const where = `${file}:${lineOf(raw, at)}`;
    const rules = [];
    const broken = readRules(code.slice(from, to), openBlocksAt(code, at), rules);

    if (broken) {
      problems.push(
        `  The type-binding block (${where}) does not hold whole rules: ${broken}.` +
          LF +
          `      Both markers go INSIDE \`@layer components { … }\`, around complete rules.`,
      );
    } else {
      const bound = { display: new Set(), mono: new Set(), uppercase: new Set() };
      const mentioned = new Set();
      const outside = new Set();

      for (const rule of rules) {
        const layered = rule.ancestry.length === 1 && /^@layer\s+components$/i.test(rule.ancestry[0]);
        if (!layered) outside.add(rule.ancestry.length ? rule.ancestry.join(' > ') : 'no layer at all');

        if (rule.body.includes('{')) {
          problems.push(
            `  The type-binding block (${where}) nests a rule inside \`${rule.prelude}\`.` +
              LF +
              `      Keep it flat: \`.text-<step>, … { font-family | text-transform }\` and nothing else.`,
          );
          continue;
        }

        const steps = [];
        for (const selector of rule.prelude.split(',').map((s) => s.trim())) {
          const m = /^\.text-([A-Za-z0-9_-]+)$/.exec(selector);
          if (!m) {
            problems.push(
              `  \`${selector}\` is in the type-binding block (${where}), which binds type STEPS only.` +
                LF +
                `      Only \`.text-<step>\` selectors belong between the markers; a heading, a state or a` +
                LF +
                `      descendant selector bound here gets a face nobody asked for. Move it to its own rule.`,
            );
            continue;
          }
          steps.push(m[1]);
          mentioned.add(m[1]);
        }

        for (const declaration of rule.body.split(';')) {
          const colon = declaration.indexOf(':');
          if (colon === -1) continue;
          const property = declaration.slice(0, colon).trim().toLowerCase();
          const value = declaration.slice(colon + 1).trim();
          if (property !== 'font-family' && property !== 'text-transform') continue;
          const face = Object.keys(ROSTER).find(
            (key) =>
              ROSTER[key].property === property &&
              (property === 'text-transform' ? value.toLowerCase() : value.replace(/\s+/g, '')) === ROSTER[key].value,
          );
          if (!face) {
            const allowed = Object.values(ROSTER)
              .filter((r) => r.property === property)
              .map((r) => `\`${r.value}\``)
              .join(' or ');
            problems.push(
              `  \`${property}: ${squash(value)}\` on \`${rule.prelude}\` in the type-binding block (${where}).` +
                LF +
                `      A binding is ${allowed}, written exactly so — no literal family, no fallback, no` +
                LF +
                `      !important. Body face and sentence case are the default and are not bound at all.`,
            );
            continue;
          }
          for (const s of steps) bound[face].add(s);
        }
      }

      if (outside.size) {
        problems.push(
          `  The type-binding block (${where}) is not directly inside \`@layer components\` (found: ${[...outside].join('; ')}).` +
            LF +
            `      Unlayered CSS beats every layer, and \`@layer utilities\` ties with the utilities: either` +
            LF +
            `      way an explicit \`font-body\` or \`normal-case\` at a call site stops overriding the binding.` +
            LF +
            `      A binding inside \`@media\` or \`@supports\` holds only some of the time.`,
        );
      }

      for (const s of [...mentioned].filter((x) => !declared.has(x)).sort()) {
        problems.push(
          `  The type-binding block (${where}) binds \`.text-${s}\`, and no --text-${s} exists in ${TOKENS}.` +
            LF +
            `      The rule styles nothing. Either the step is gone and this selector is stale, or the name` +
            LF +
            `      is a typo and the REAL step is unbound.`,
        );
      }

      for (const [face, role] of Object.entries(ROSTER)) {
        for (const s of role.steps.filter((x) => !bound[face].has(x))) {
          problems.push(
            `  \`text-${s}\` is ${role.means} in the ramp, and the type-binding block (${where}) does not` +
              LF +
              `      give \`.text-${s}\` \`${role.property}: ${role.value}\` — ${role.lost} at every call site,` +
              LF +
              `      and no call site looks wrong. Put the selector back.`,
          );
        }
        for (const s of [...bound[face]].filter((x) => !role.steps.includes(x)).sort()) {
          problems.push(
            `  The type-binding block (${where}) gives \`.text-${s}\` \`${role.property}: ${role.value}\`, and the ramp` +
              LF +
              `      does not: ${role.means} is ${quoteList(role.steps)}. If the design changed, ROSTER in` +
              LF +
              `      scripts/check-type-scale.mjs and the block change in the same commit.`,
          );
        }
      }

      bindingSummary = `; bound: ${bound.display.size} display, ${bound.mono.size} mono, ${bound.uppercase.size} upper case`;
    }
  }

  for (const s of rosterSteps.filter((x) => !declared.has(x))) {
    problems.push(
      `  The ramp has a \`text-${s}\` step (ROSTER in scripts/check-type-scale.mjs) and no --text-${s} exists in ${TOKENS}.` +
        LF +
        `      Either the Pulse ramp is only half declared, or the step was removed and the roster is stale.`,
    );
  }
}

if (problems.length) {
  console.error(`check-type-scale: ${problems.length} problem(s)` + LF);
  for (const p of problems) console.error(p);
  console.error(LF);
  process.exit(1);
}

if (!bindingDue) {
  console.log(
    `check-type-scale: note — the family binding is not checked yet: no type-binding block, and none of ` +
      `${quoteList(heralds)} is declared. The first of them makes it mandatory.`,
  );
}
console.log(`check-type-scale: OK — ${declared.size} step(s), declared and merged alike${bindingSummary}`);
