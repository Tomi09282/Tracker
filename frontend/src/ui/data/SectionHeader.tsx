import { isValidElement, useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Rule } from './Rule';

/**
 * The head of a section — kit `secHead` / `sect`: a strong rule, 16 below it the eyebrow, and at
 * most ONE trailing node on the eyebrow's baseline.
 *
 *     ──────────────────────────────────────────────   Rule/section, white 14 %
 *                                                       16
 *     MAI EDZÉS                    18:00 · 5 gyakorlat   Section/<title>, 354 × 20
 *                                                       16 (the parent's gap, `gap-group`)
 *     content
 *
 * It replaces the 44 px tinted icon tile beside a title. Pulse draws no icon in a heading: the rule
 * gives the boundary its mass and the eyebrow names it, in the display face, upper-case, `text-2`.
 *
 * ═══ THE TRAILING NODE SITS ON THE BASELINE, NOT ON THE CENTRE LINE ═════════════════════════════
 *
 * The head row is exactly one eyebrow line tall (20 px) whatever trails it: a count, a status, a
 * 44 px text link, a hug segmented switch. The tall ones overhang the row above and below instead
 * of stretching it — otherwise a section with a link would start 12 px lower than a section
 * without one, and the 16 / 16 rhythm would depend on what happens to sit on the right.
 *
 * So the trailing node lives in a 20 px box of its own that centres it, and the row aligns that
 * box with the eyebrow by BASELINE. A centred flex box hands its first child's baseline upward,
 * which makes this the kit's own arithmetic (`secHead`: text centred in its node, its baseline on
 * the eyebrow's) without a single measured offset in the source.
 *
 * The one exception is drawn in `coach-dashboard-1` ("Csatlakozási kódok" + the small pill "Új
 * kód"): a 44 pt control the head makes ROOM for. `trailingInFlow` grows the row to 44 and centres
 * the eyebrow on it.
 *
 * A trailing node whose last part is a glyph — a `TextLink` / `Pressable` with a `trail`, i.e.
 * "Megnyitás ›" — is pulled 5 px past the right edge, as the kit does it (`secHead`: dx = 5 when
 * the last child is a glyph): the chevron's box is 16 wide and its ink ends 6 px short of it, so
 * the TIP lands on the content edge instead of the empty box.
 *
 * The old `icon` prop and `action` (the old name of `trailing`) left in the closing cleanup (F19
 * row 3). `title` OR `children`, never both: `children` is the slot of the two screens that still write
 * their own heading element, and a rebuilt screen has no reason to use it.
 */

type HeadingTag = 'h2' | 'h3';

interface SectionHeaderBase {
  /**
   * ONE node on the eyebrow's baseline, ending on the right edge: a count or meta
   * (`<span className="text-data text-text-2">6</span>`), a status, a text link, a hug segmented
   * switch. Never a second one, never a lime pill (but see `trailingInFlow`).
   */
  trailing?: ReactNode;
  /**
   * The trailing node is a 44 pt control the head makes room for (the small pill of
   * `coach-dashboard-1`): the row grows to 44 and the eyebrow is centred on it.
   */
  trailingInFlow?: boolean;
  /**
   * The strong rule above the eyebrow. `false` for the block directly under a screen header (the
   * hero has no rule) and for a head inside a group that already opened with one.
   */
  rule?: boolean;
  /** The heading level of the eyebrow. `h2` unless the section sits inside another section. */
  heading?: HeadingTag;
  /** Placement only. */
  className?: string;
}

export type SectionHeaderProps = SectionHeaderBase &
  (
    | {
        title: string;
        /** Set it when a `section` names itself with `aria-labelledby`. */
        titleId?: string;
        children?: never;
      }
    | { children: ReactNode; title?: never; titleId?: never }
  );

const present = (node: ReactNode) => node !== undefined && node !== null && node !== false;

/** The kit's `dx = 5`: the trailing node ends in a glyph (a link or button with a `trail`). */
const endsInGlyph = (node: ReactNode) => isValidElement<{ trail?: ReactNode }>(node) && present(node.props.trail);

export function SectionHeader(props: SectionHeaderProps) {
  const {
    title,
    titleId,
    children,
    trailing,
    trailingInFlow = false,
    rule = true,
    heading: Heading = 'h2',
    className,
  } = props;
  const tail = trailing;
  return (
    <div className={cn('flex w-full flex-col gap-group', className)}>
      {rule ? <Rule strong /> : null}
      <div
        data-kit="sect"
        className={cn(
          'flex w-full justify-between gap-group',
          // A call site's own heading (the `children` bridge) may be taller than an eyebrow line:
          // the row grows with it instead of letting it run into the content below.
          trailingInFlow ? 'min-h-11 items-center' : children !== undefined ? 'min-h-5 items-baseline' : 'h-5 items-baseline',
        )}
      >
        {children ?? (
          <Heading id={titleId} className="text-eyebrow min-w-0 flex-1 truncate text-text-2">
            {title}
          </Heading>
        )}
        {present(tail) ? (
          <div className={cn('flex shrink-0 items-center', !trailingInFlow && 'h-5', endsInGlyph(tail) && '-me-1.25')}>
            {tail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A whole section — kit `sect`: the head above, then the content 16 below it, in a `<section>` that
 * is named by its own eyebrow. Sections stand 32 apart; that distance belongs to whatever stacks
 * them (`gap-section` on the page column), not to this component.
 */
export interface SectionProps {
  title: string;
  /** See `SectionHeader.trailing`. */
  trailing?: ReactNode;
  /** See `SectionHeader.trailingInFlow`. */
  trailingInFlow?: boolean;
  /** See `SectionHeader.rule`. */
  rule?: boolean;
  /** See `SectionHeader.heading`. */
  heading?: HeadingTag;
  children?: ReactNode;
  id?: string;
  /** Placement, or another gap between head and content (`gap-3` where a frame draws 12). */
  className?: string;
}

export function Section({ title, trailing, trailingInFlow, rule, heading, children, id, className }: SectionProps) {
  const titleId = useId();
  return (
    <section id={id} aria-labelledby={titleId} className={cn('flex w-full flex-col gap-group', className)}>
      <SectionHeader
        title={title}
        titleId={titleId}
        trailing={trailing}
        trailingInFlow={trailingInFlow}
        rule={rule}
        heading={heading}
      />
      {children}
    </section>
  );
}
