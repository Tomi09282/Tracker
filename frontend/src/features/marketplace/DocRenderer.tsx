import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

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

function Inline({ nodes }: { nodes: InlineNode[] }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.k) {
      case 'text':
        // A JSX TEXT CHILD. React escapes it, and there is no other path.
        return <span key={i}>{n.v}</span>;
      case 'strong':
        return <strong key={i}>{n.v}</strong>;
      case 'em':
        return <em key={i}>{n.v}</em>;
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
              className="text-accent underline underline-offset-2"
            >
              {n.v}
            </a>
            {/* THE HOST, ALWAYS, NEVER ONLY WHEN IT LOOKS SUSPICIOUS. A link label is
                author-controlled text and can say anything; showing where it actually goes is the
                only defence against a label that reads like a bank. `dir="ltr"` and bidi isolation
                because a right-to-left host would otherwise reorder the punctuation around it. */}
            {host ? (
              <span
                className="text-caption text-text-3"
                dir="ltr"
                style={{ unicodeBidi: 'isolate' }}
              >
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

export function DocRenderer({ doc, className }: { doc: BlockNode[] | null; className?: string }) {
  if (!Array.isArray(doc)) return null;

  return (
    <div className={`flex flex-col gap-group ${className ?? ''}`}>
      {doc.map((b, i) => {
        const inline = (b.c ?? []) as InlineNode[];
        switch (b.k) {
          case 'p':
            // `measure` caps the line length at 70ch. A body that runs the full width of a desktop
            // window is unreadable, and this is the one screen in the product where a stranger
            // reads several paragraphs.
            return (
              <p key={i} className="text-body measure text-text-1">
                <Inline nodes={inline} />
              </p>
            );
          case 'h':
            // LEVEL 2 OR 3 ONLY — the PAGE owns its h1. A body that could mint one would break the
            // document outline of every screen it appears on, which is the thing a screen reader
            // navigates by.
            return b.level === 3 ? (
              <h3 key={i} className="text-title-3 mt-2 text-text-1">
                <Inline nodes={inline} />
              </h3>
            ) : (
              <h2 key={i} className="text-title-2 mt-2 text-text-1">
                <Inline nodes={inline} />
              </h2>
            );
          case 'quote':
            return (
              <blockquote
                key={i}
                className="text-body measure border-l-2 border-accent pl-3 text-text-2"
              >
                <Inline nodes={inline} />
              </blockquote>
            );
          case 'ul':
          case 'ol': {
            const items = (b.c ?? []) as BlockNode[];
            const List = b.k === 'ol' ? 'ol' : 'ul';
            /*
             * ICON-LED ROWS, NOT BULLETS — and the single most important shape change on the post
             * detail. A bullet list is exactly the form that made the previous design read as data
             * fields: the same sentences, no visual entry point, nothing for the eye to land on.
             * A glyph in a tinted holder gives each row an anchor, so three answers can be scanned
             * instead of read.
             *
             * It lives HERE rather than in `PostPage`, because the alternative is a hand-built
             * markup path beside the parser — two renderers, two sanitisers, and one of them will
             * be the weaker one. The coach's bio and their post body get the same treatment, which
             * is the whole reason there is one renderer.
             *
             * The ordinal is NOT `aria-hidden`: `list-style: none` (which flex implies) suppresses
             * list semantics in some screen readers, so an ordered list has to carry its own
             * numbers as text. The unordered marker is decoration and is hidden.
             */
            return (
              <List key={i} className="measure flex flex-col gap-tight">
                {items.map((li, j) => (
                  <li key={j} className="text-body flex items-start gap-tight text-text-1">
                    <span
                      aria-hidden={b.k === 'ul' || undefined}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-chip bg-[var(--tile-tint)] text-[var(--tile-tint-fg)]"
                    >
                      {b.k === 'ol' ? (
                        <span className="text-caption tabular-nums">{j + 1}</span>
                      ) : (
                        <Check className="size-icon-s" strokeWidth={2.5} />
                      )}
                    </span>
                    <span className="min-w-0 pt-2">
                      <Inline nodes={(li.c ?? []) as InlineNode[]} />
                    </span>
                  </li>
                ))}
              </List>
            );
          }
          default:
            // `li` at the top level, or a kind from a future version. Nothing, rather than a
            // throw: less content beats a blank feed.
            return null;
        }
      })}
    </div>
  );
}
