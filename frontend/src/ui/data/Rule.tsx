import { cn } from '../../lib/cn';

/**
 * A hairline — kit `rule(strong)`.
 *
 * Pulse has no boxes, so a rule is one of the few things that says "a new thing starts here". There
 * are exactly two of them and they are not interchangeable:
 *
 *   strong   white 14 %   opens a section, closes a table           (Figma layer `Rule/section`)
 *   row      white  8 %   between two rows of one list              (Figma layer `Rule/row`)
 *
 * Both are 1 px tall, full width of whatever holds them, and decoration: under 3:1 on purpose, never
 * the only carrier of a state — which is why the element is hidden from assistive tech instead of
 * being an `<hr>` that a screen reader announces as "separator" forty times on a long page.
 *
 * `SectionHeader` draws its own strong rule and `RowStack` its own row rules; reach for this
 * component only for a rule that belongs to neither (the line under a toast band, the close of a
 * hand-built table).
 */
export interface RuleProps {
  /** The section rule (white 14 %). Default: the row rule (white 8 %). */
  strong?: boolean;
  /** Placement only (a margin, `absolute bottom-0`). Never a colour or a height. */
  className?: string;
}

export function Rule({ strong = false, className }: RuleProps) {
  return (
    <div
      aria-hidden
      data-kit="rule"
      data-strong={strong ? '' : undefined}
      className={cn('h-px w-full shrink-0', strong ? 'bg-hair-strong' : 'bg-hair', className)}
    />
  );
}
