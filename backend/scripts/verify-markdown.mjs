/**
 * verify-markdown — attack the parser that stands between a stranger's keyboard and every reader.
 *
 * This is the file that makes the public surface safe, so it is attacked with REAL PAYLOADS rather
 * than reviewed. Every assertion below is either "this text must survive as text" or "this input
 * must be refused by name" — never "it looks fine".
 *
 * The property being defended: NO STEP IN THE PRODUCT TURNS A STORED STRING INTO MARKUP. The
 * frontend has zero HTML sinks and this parser produces no HTML, so a payload that reaches the
 * page reaches it as characters a reader sees, which is the whole point.
 *
 * Run: npm run verify:markdown
 */
import {
  parseBody,
  assertDocShape,
  isSafeHttpUrl,
  normaliseSource,
  excerptOf,
  LIMITS,
  MarkdownError,
} from '../src/public/markdown.js';

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (passed += 1) : (failed += 1);
};

const refused = (label, fn, code) => {
  try {
    fn();
    check(label, false, 'ACCEPTED');
  } catch (e) {
    check(label, e instanceof MarkdownError && (!code || e.code === code), `${e.code ?? e.message}`);
  }
};

/** Every string that ends up anywhere in the tree. */
const textOf = (doc) => {
  const out = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      if (typeof n.v === 'string') out.push(n.v);
      if (Array.isArray(n.c)) walk(n.c);
    }
  };
  walk(doc);
  return out.join(' ');
};

const kinds = (doc) => {
  const out = new Set();
  const walk = (nodes) => {
    for (const n of nodes) {
      out.add(n.k);
      if (Array.isArray(n.c)) walk(n.c);
    }
  };
  walk(doc);
  return out;
};

console.log('\n── SCRIPT PAYLOADS ARE ORDINARY CHARACTERS ─────────────────────────────────────');

for (const payload of [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  '<iframe src="https://evil.example"></iframe>',
  '<style>*{background:url(https://evil.example/leak)}</style>',
  '</p><script>alert(1)</script><p>',
  '<a href="javascript:alert(1)">click</a>',
  '<base href="//evil.example">',
  '"><script>alert(1)</script>',
  "';alert(1);//",
]) {
  const { doc } = parseBody(payload);
  assertDocShape(doc);
  const survivedVerbatim = textOf(doc).includes(payload.replace(/\s+/g, ' ').trim());
  const noMarkupKinds = ![...kinds(doc)].some((k) => !['p', 'text'].includes(k));
  check(
    `payload survives as TEXT, produces no node: ${payload.slice(0, 38)}`,
    survivedVerbatim && noMarkupKinds,
    [...kinds(doc)].join(','),
  );
}

console.log('\n── THE SCHEME ALLOWLIST ────────────────────────────────────────────────────────');

const unsafe = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'java\tscript:alert(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'vbscript:msgbox(1)',
  'blob:https://evil.example/x',
  'file:///etc/passwd',
  '//evil.example',
  'https:/\\evil.example',
  'https://bank.example@evil.example/login',
  'https://user:pw@evil.example/',
  '  https://ok.example  ',
];
for (const u of unsafe) {
  check(`refused as an href: ${u.slice(0, 44)}`, !isSafeHttpUrl(u));
}
for (const u of ['https://example.com', 'http://example.com/a?b=c#d', 'https://xn--kzd.example/']) {
  check(`accepted as an href: ${u}`, isSafeHttpUrl(u));
}

console.log('\n── A BAD LINK KEEPS ITS CHARACTERS ─────────────────────────────────────────────');

{
  const { doc } = parseBody('[click me](javascript:alert(1))');
  assertDocShape(doc);
  check(
    'an unsafe link is NOT dropped — the author sees what they typed',
    textOf(doc).includes('[click me](javascript:alert(1))') && !kinds(doc).has('link'),
    textOf(doc),
  );
}
{
  const { doc } = parseBody('[real](https://example.com/x)');
  assertDocShape(doc);
  const link = doc[0].c.find((n) => n.k === 'link');
  check('a safe link becomes a link node with its href intact', link?.href === 'https://example.com/x', link?.href);
}

console.log('\n── DEPTH IS STRUCTURAL, NOT BOUNDED ────────────────────────────────────────────');

const depth = (nodes, d = 1) =>
  Math.max(d, ...nodes.map((n) => (Array.isArray(n.c) ? depth(n.c, d + 1) : d)));

// DEFENCE IN DEPTH, IN THE LITERAL SENSE. 3000 quote markers never even reach the grammar: the
// line bound refuses them first. That ordering is worth asserting rather than assuming, because it
// means the expensive guarantee below is not the only thing standing there.
refused('3000 quote markers on one line are refused by the LINE bound first', () => parseBody('>'.repeat(3000)), 'line_too_long');

{
  // And inside the bound, where the grammar does run: 399 markers, and the tree is still three
  // levels. A quote holds INLINE content, so '>>>>' is a quote whose text starts with three
  // greater-than signs — not four nested quotes. There is nowhere to put a fourth level.
  const { doc } = parseBody('>'.repeat(399));
  assertDocShape(doc);
  check(
    '399 quote markers produce a tree THREE levels deep, not 399',
    depth(doc) <= 3,
    `depth ${depth(doc)}, kinds ${[...kinds(doc)].join(',')}`,
  );
}
{
  // The same for lists, across many lines rather than one long one — the shape a real nesting
  // attempt takes. Every marker lands in the SAME list; indentation buys no depth.
  const nested = Array.from({ length: 100 }, (_, i) => `${'  '.repeat(i % 20)}- item ${i}`).join('\n');
  const { doc } = parseBody(nested);
  assertDocShape(doc);
  check(
    'a hundred progressively indented list markers cannot nest either',
    depth(doc) <= 3,
    `depth ${depth(doc)}, blocks ${doc.length}`,
  );
}

console.log('\n── BIDI AND INVISIBLE CHARACTERS ───────────────────────────────────────────────');

{
  // RLO is the homoglyph/filename-spoofing primitive. It goes.
  const s = normaliseSource('safe‮gnp.exe');
  check('the RLO override is stripped', !s.includes('‮'), JSON.stringify(s));
}
{
  // ZWJ STAYS. It is how every profession and gender emoji is built, and banning the block would
  // reject ordinary posts with an error naming a character nobody can see.
  const s = normaliseSource('🏋️‍♀️ edzés');
  check('ZWJ survives, so emoji do not break apart', s.includes('‍'), JSON.stringify(s.slice(0, 12)));
}
refused(
  'but a body stuffed with joiners is refused by count, not by ban',
  () => parseBody(`a${'‍'.repeat(LIMITS.zeroWidthJoiners + 1)}b`),
  'too_many_joiners',
);

console.log('\n── `<` IS ALLOWED, BECAUSE THE DOOR IS ALREADY BRICKED UP ──────────────────────');

{
  const { doc } = parseBody('pihenő < 60 mp, és <12 ismétlés');
  assertDocShape(doc);
  check(
    'a legitimate less-than survives — refusing it would break real posts',
    textOf(doc).includes('< 60 mp') && textOf(doc).includes('<12'),
    textOf(doc),
  );
}

console.log('\n── LIMITS ARE PARSER ERRORS WITH A CODE, NEVER CHECK CONSTRAINTS ───────────────');

refused('an empty body', () => parseBody('   \n\n  '), 'empty');
refused('over the character bound', () => parseBody('a'.repeat(LIMITS.chars + 1)), 'too_long');
refused('over the line bound', () => parseBody('a\n'.repeat(LIMITS.lines + 1)), 'too_many_lines');
refused('a single enormous line', () => parseBody('a'.repeat(LIMITS.lineChars + 1)), 'line_too_long');
refused(
  'more links than a post has business carrying',
  () => parseBody(Array.from({ length: LIMITS.links + 1 }, (_, i) => `[l](https://e.example/${i})`).join('\n\n')),
  'too_many_links',
);

console.log('\n── THE SHAPE GUARD REFUSES WHAT THE PARSER COULD NEVER EMIT ────────────────────');

refused('an unknown block kind', () => assertDocShape([{ k: 'html', c: [] }]), 'unknown_block_kind');
refused('an unknown inline kind', () => assertDocShape([{ k: 'p', c: [{ k: 'image', v: 'x' }] }]), 'unknown_inline_kind');
refused(
  'a link node whose href was tampered with after parsing',
  () => assertDocShape([{ k: 'p', c: [{ k: 'link', v: 'x', href: 'javascript:alert(1)' }] }]),
  'unsafe_href',
);
refused('an inline node that tries to nest', () => assertDocShape([{ k: 'p', c: [{ k: 'strong', v: 'a', c: [] }] }]), 'inline_must_not_nest');
refused('a heading claiming h1', () => assertDocShape([{ k: 'h', level: 1, c: [] }]), 'bad_heading_level');
refused('an orphan list item', () => assertDocShape([{ k: 'li', c: [] }]), 'orphan_li');

console.log('\n── AND THE ORDINARY CASE STILL WORKS ───────────────────────────────────────────');

{
  const src = [
    '## 8 hetes erőprogram',
    '',
    'Heti **négy** edzés, *fokozatos* terheléssel.',
    '',
    '- Hétfő: guggolás',
    '- Szerda: fekvenyomás',
    '',
    '> A bemelegítés nem opcionális.',
    '',
    'Jelentkezés: [itt](https://example.com/jelentkezes)',
  ].join('\n');
  const { doc, excerpt, version } = parseBody(src);
  assertDocShape(doc);
  const k = kinds(doc);
  check(
    'a real post parses into the expected kinds',
    k.has('h') && k.has('p') && k.has('ul') && k.has('li') && k.has('quote') && k.has('strong') && k.has('em') && k.has('link'),
    [...k].sort().join(','),
  );
  check('the heading is level 2, never 1 — the page owns its h1', doc[0].level === 2);
  check('the excerpt is derived from the DOCUMENT, so it carries no markdown punctuation',
    !excerpt.includes('**') && !excerpt.includes('##') && excerpt.length > 0,
    `"${excerpt.slice(0, 60)}"`);
  check('and the document is versioned', version === 1);
}
{
  // Across LINES, not one long one — a 500-character line is refused by the line bound before
  // the excerpt is ever built, which the assertion above already covers.
  const { excerpt } = parseBody(
    Array.from({ length: 10 }, () => 'lorem ipsum dolor sit amet '.repeat(3)).join('\n'),
  );
  check('a long excerpt is truncated with an ellipsis', excerpt.endsWith('…') && excerpt.length <= 200, `${excerpt.length} chars`);
}

console.log(`\n${failed === 0 ? 'PROBE OK' : 'PROBE FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
