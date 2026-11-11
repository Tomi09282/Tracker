import { Fragment, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * The counterpart to `backend/src/public/markdown.js`. It walks a CLOSED NODE TREE into React
 * elements — and there is no string anywhere in it that becomes markup.
 *
 * ═══ NO `dangerouslySetInnerHTML`, AND THAT IS THE WHOLE ARCHITECTURE ══════════════════════════
 *
 * The frontend's count of HTML sinks is ZERO, measured before the parser was designed: no
 * `dangerouslySetInnerHTML`, no `innerHTML`, no `insertAdjacentHTML`. The single grep hit is a
 * comment in `ChatPanel.tsx` promising their absence. This file is the reason that zero survives
 * a phase that added user-generated public content, which is the phase where it usually dies.
 *
 * Every text node below is a JSX TEXT CHILD, which React escapes. `<script>alert(1)</script>`
 * arrives here as an eleven-character string and leaves as eleven visible characters.
 *
 * ═══ NO DEPTH PROP, AND NO RECURSION GUARD, BECAUSE THE GRAMMAR HAS NO DEPTH ═══════════════════
 *
 * block → (li) → inline. Three levels, fixed. `'>'.repeat(399)` is a quote whose TEXT begins with
 * greater-than signs, not 399 nested quotes, because a quote holds inline content and there is
 * nowhere to put a fourth level.
 *
 * A lexer-based tree would need a depth counter here, and the day one was missing a crafted post
 * would blank the public feed with a RangeError in every visitor's browser — with nothing in the
 * server log, because the server was fine.
 *
 * ═══ AN UNKNOWN KIND RENDERS NOTHING, NOT AN ERROR ═════════════════════════════════════════════
 *
 * The server validates the document against the same closed vocabulary before storing it, so an
 * unknown kind should be unreachable. "Should be" is why this returns null instead of throwing: a
 * document from a future version must degrade to less content, never to a blank feed.
 */

export interface InlineNode {
  k: 'text' | 'strong' | 'em' | 'link' | 'br';
  v?: string;
  href?: string;
}

export interface BlockNode {
  k: 'p' | 'h' | 'ul' | 'ol' | 'li' | 'quote';
  level?: 2 | 3;
  c?: (InlineNode | BlockNode)[];
}

/**
 * The client's half of the scheme allowlist.
 *
 * THE SERVER ALREADY CHECKED THIS, and it is checked again here anyway — not from distrust of the
 * server, but because this component may one day render a document from somewhere else (a cached
 * response, a future draft preview, a test fixture) and the guarantee should belong to the
 * renderer rather than to its current caller.
 *
 * Allowlist, never a `javascript:` denylist: `JaVaScRiPt:`, tab-split schemes, `data:`, `vbscript:`
 * and every scheme nobody has thought of fail by default.
 */
function safeHref(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hostOf(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

/**
 * The two looks of one document grammar (post-detail-1/-2/-3, coach-profile-2).
 *
 *   post   the post body: prose in `text-1`; an h2 is the eyebrow WITHOUT a rule (the page's own
 *          strong rules belong to its structure, so a post with a dozen headings never becomes a
 *          ladder of rules), 32 above, 16 to its blocks; ticks in `text-2`; numerals and the
 *          hanging quote mark in the display face, `text-3`; the quote's words `body-m`.
 *   bio    the coach's introduction: prose and list rows in `text-2`, ticks in `text-3`, only bold
 *          spans and the quote lifted to `text-1`; an h2 is the 22 / 28 `title`, parts 28 apart,
 *          8 to their blocks; the quote is a 2 pt ink bar beside `body` words.
 *
 * Both share the geometry: marks in a 20 pt column on the gutter, every indented block (list
 * text, quote text) on ONE second edge 32 in (x 56 on a 24 pt gutter), blocks 16 apart.
 */
type DocVariant = 'post' | 'bio';

const LOOK = {
  post: {
    parts: 'gap-8', // 32 between an h2's part and what came before
    head: 'gap-4', // h2 -> its blocks
    prose: 'text-text-1',
    tick: 'text-text-2',
    tickStroke: 2.6,
  },
  bio: {
    parts: 'gap-7', // 28
    head: 'gap-2', // 8
    prose: 'text-text-2',
    tick: 'text-text-3',
    tickStroke: 2,
  },
} as const;

function Inline({ nodes }: { nodes: InlineNode[] }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.k) {
      case 'text':
        // A JSX TEXT CHILD. React escapes it, and there is no other path.
        return <span key={i}>{n.v}</span>;
      case 'strong':
        // post-detail-3 "bold run": SemiBold in the main ink, in either look.
        return (
          <strong key={i} className="font-semibold text-text-1">
            {n.v}
          </strong>
        );
      case 'em':
        // post-detail-3 "italic run" — a PROPOSAL awaiting the owner: Geist has no italic cut, so
        // the run stays Regular and drops to the second ink (deviations.md). Still an `<em>`, so a
        // screen reader keeps the stress.
        return (
          <em key={i} className="not-italic text-text-2">
            {n.v}
          </em>
        );
      case 'br':
        return <br key={i} />;
      case 'link': {
        const href = safeHref(n.href);
        // A link whose href does not survive the check renders as its LABEL, still visible. The
        // reader loses the link, never the sentence.
        if (!href) return <span key={i}>{n.v}</span>;
        const host = hostOf(href);
        return (
          <span key={i}>
            <a
              href={href}
              // `noopener` so the destination cannot reach back through window.opener; `nofollow
              // ugc` so this surface cannot be used to buy somebody else's search ranking, which
              // is the first thing a public posting surface gets used for.
              rel="noopener noreferrer nofollow ugc"
              target="_blank"
              // post-detail-3 "link": the label in the main ink, underlined — never lime (the lamp
              // is the screen's one pill and the verified tick, not a hyperlink).
              className="text-text-1 underline underline-offset-2"
            >
              {n.v}
            </a>
            {/* THE HOST, ALWAYS, NEVER ONLY WHEN IT LOOKS SUSPICIOUS. A link label is
                author-controlled text and can say anything; showing where it actually goes is the
                only defence against a label that reads like a bank. `dir="ltr"` and bidi isolation
                because a right-to-left host would otherwise reorder the punctuation around it. */}
            {host ? (
              <span className="text-cap text-text-2" dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                {' '}
                ({host})
              </span>
            ) : null}
          </span>
        );
      }
      default:
        return null;
    }
  });
}

/** One block that is not an h2. `null` for `li` at the top level or a kind from a future version. */
function Block({ b, variant, clamp }: { b: BlockNode; variant: DocVariant; clamp?: number }): ReactNode {
  const look = LOOK[variant];
  const inline = (b.c ?? []) as InlineNode[];
  switch (b.k) {
    case 'p':
      // `measure` caps the line length at 70ch. A body that runs the full width of a desktop
      // window is unreadable, and this is the one screen in the product where a stranger reads
      // several paragraphs. `clamp` cuts the collapsed bio after its lines (coach-profile-1).
      return (
        <p className={cn('text-body measure', look.prose, clamp === 2 && 'line-clamp-2', clamp === 3 && 'line-clamp-3')}>
          <Inline nodes={inline} />
        </p>
      );
    case 'h':
      // A level-3 heading inside a part (post-detail-3: `bodyB`, no icon). Level 2 opens a part
      // and never reaches this function. The PAGE owns its h1: the grammar has no level 1.
      return (
        <h3 className="text-body-b text-text-1">
          <Inline nodes={inline} />
        </h3>
      );
    case 'quote':
      return variant === 'post' ? (
        // A hanging opening mark in the mark column (display face, `text-3` — the numerals'
        // grammar), its top on the first line's cap height; the words `body-m`, balanced so a
        // quote never ends on one orphan word. 8 more air above (24 clear) — post-detail-2.
        <blockquote className="measure flex gap-3 pt-2">
          <span aria-hidden className="text-display mt-0.5 h-5.5 w-5 shrink-0 overflow-hidden text-text-3">
            “
          </span>
          <span className="text-body-m text-balance min-w-0 text-text-1">
            <Inline nodes={inline} />
          </span>
        </blockquote>
      ) : (
        // coach-profile-2: a 2 pt ink bar the height of the words, 30 to the words (`body`, ink).
        <blockquote className="measure flex gap-7.5">
          <span aria-hidden className="w-0.5 shrink-0 self-stretch bg-text-1" />
          <span className="text-body min-w-0 text-text-1">
            <Inline nodes={inline} />
          </span>
        </blockquote>
      );
    case 'ul':
    case 'ol': {
      const items = (b.c ?? []) as BlockNode[];
      /*
       * MARKS IN A COLUMN, NOT BULLETS IN A TILE. Each row has an anchor for the eye — the quiet
       * tick of an unordered list, the condensed numeral of an ordered one — in a 20 pt column on
       * the gutter, the words on the second edge 12 after it. No holder, no fill.
       *
       * It lives HERE rather than in the pages, because the alternative is a hand-built markup
       * path beside the parser — two renderers, two sanitisers, and one of them will be the
       * weaker one.
       *
       * The ordinal is NOT `aria-hidden`: `list-style: none` (which flex implies) suppresses list
       * semantics in some screen readers, so an ordered list has to carry its own numbers as text.
       * The tick is decoration and is hidden.
       */
      if (b.k === 'ol') {
        return (
          // post-detail-2: rows 20 apart; the numeral (display 32 / 34, `text-3`) and the first
          // text line share one baseline, so the words are pushed 9 down from the numeral's ink.
          <ol className="measure flex flex-col gap-5">
            {items.map((li, j) => (
              <li key={j} className={cn('text-body flex items-start gap-3', look.prose)}>
                <span className="text-display w-5 shrink-0 text-text-3 -mt-1 tabular-nums">{j + 1}</span>
                <span className="min-w-0 pt-2.25">
                  <Inline nodes={(li.c ?? []) as InlineNode[]} />
                </span>
              </li>
            ))}
          </ol>
        );
      }
      return (
        // post-detail-1 / coach-profile-2: rows 12 apart, the 16 px tick centred in a 20 x 22 mark.
        <ul className="measure flex flex-col gap-3">
          {items.map((li, j) => (
            <li key={j} className={cn('text-body flex items-start gap-3', look.prose)}>
              <span aria-hidden className={cn('inline-flex h-5.5 w-5 shrink-0 items-center justify-center', look.tick)}>
                <Check className="size-4" strokeWidth={look.tickStroke} />
              </span>
              <span className="min-w-0">
                <Inline nodes={(li.c ?? []) as InlineNode[]} />
              </span>
            </li>
          ))}
        </ul>
      );
    }
    default:
      // `li` at the top level, or a kind from a future version. Nothing, rather than a throw:
      // less content beats a blank feed.
      return null;
  }
}

/**
 * The document, grouped into parts: every level-2 heading opens a part that holds the blocks up
 * to the next one; whatever stands before the first heading is a part with no heading.
 */
interface Part {
  head: BlockNode | null;
  blocks: BlockNode[];
}

function partsOf(doc: BlockNode[]): Part[] {
  const parts: Part[] = [];
  for (const b of doc) {
    if (b && b.k === 'h' && b.level !== 3) parts.push({ head: b, blocks: [] });
    else if (parts.length === 0) parts.push({ head: null, blocks: [b] });
    else parts[parts.length - 1].blocks.push(b);
  }
  return parts;
}

export function DocRenderer({
  doc,
  className,
  variant = 'post',
  clamp,
}: {
  doc: BlockNode[] | null;
  className?: string;
  /** Additive (S-public-pages): the coach's bio look. Default `post` — every existing caller keeps it. */
  variant?: DocVariant;
  /** Additive: cut the FIRST paragraph after this many lines (the collapsed bio, coach-profile-1). */
  clamp?: 2 | 3;
}) {
  if (!Array.isArray(doc)) return null;
  const look = LOOK[variant];
  let firstP = true;

  return (
    <div className={cn('flex flex-col', look.parts, className)}>
      {partsOf(doc).map((part, i) => {
        const blocks = (
          <div className="flex flex-col gap-4">
            {part.blocks.map((b, j) => {
              const clampThis = clamp !== undefined && b.k === 'p' && firstP;
              if (b.k === 'p') firstP = false;
              const node = <Block b={b} variant={variant} clamp={clampThis ? clamp : undefined} />;
              return node ? <Fragment key={j}>{node}</Fragment> : null;
            })}
          </div>
        );
        if (!part.head) return <Fragment key={i}>{blocks}</Fragment>;
        const inline = (part.head.c ?? []) as InlineNode[];
        return (
          <section key={i} className={cn('flex flex-col', look.head)}>
            {/* LEVEL 2 — the PAGE owns its h1, and a body that could mint one would break the
                document outline a screen reader navigates by. post: the eyebrow with no rule;
                bio: the 22 / 28 title. */}
            <h2 className={variant === 'post' ? 'text-eyebrow text-text-2' : 'text-title text-text-1'}>
              <Inline nodes={inline} />
            </h2>
            {part.blocks.length ? blocks : null}
          </section>
        );
      })}
    </div>
  );
}
