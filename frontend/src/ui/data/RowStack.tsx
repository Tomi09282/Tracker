import { Children, Fragment, isValidElement, type AriaRole, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * A stack of rows divided by hairlines — kit `rowStack(rows, { open, close })`.
 *
 * This is what a list is in Pulse. Not tiles 8 px apart with a fill and a radius each: rows on the
 * gutter, one 1 px rule (white 8 %) between two neighbours, nothing before the first and nothing
 * after the last — unless the stack is a table of its own, in which case a strong rule (white 14 %)
 * opens it (`open`) and closes it (`close`).
 *
 * ═══ THE RULE IS A PIXEL OF ITS OWN ═════════════════════════════════════════════════════════════
 *
 * In the frames a rule is not painted over a row, it stands between two: row 56, rule 1, row 56. So
 * the pitch of a list is 57, and a border drawn INSIDE a 56 px row would put every row one pixel
 * higher than the one before it — six rows down, the list is 5 px off its frame. Here each row gets
 * a wrapper that carries the rule as its top border and the row keeps its own full height under it.
 *
 * That is also why this component wraps its children rather than leaving the rule to the row: the
 * wrapper is the `<li>`, so a stack is a real list for assistive tech (`role="list"` is written out
 * because Safari drops the implicit one from a list without markers) and a row can be a link, a
 * button or plain text without knowing where it stands.
 *
 * Children are the rows. Fragments are opened up, `null` / `false` are skipped, so a conditional
 * row costs no rule. A stack with no rows renders nothing — an empty list is an `EmptyState`.
 */
export interface RowStackProps {
  /** A strong rule above the first row. */
  open?: boolean;
  /** A strong rule under the last row. */
  close?: boolean;
  /**
   * Take the top padding off the first row and the bottom padding off the last one (a `ListRow`
   * or a `ListRowSkeleton`): the list's text then stands where a section's content stands
   * (coach-plans-1, 16 under the section head). Additive, kit gap G-data 4.
   */
  trim?: boolean;
  /**
   * `ul` (the default), `ol` when the order is the content, `div` when the rows are not list items —
   * the options of a radio group, a set of switches under a `fieldset`.
   */
  as?: 'ul' | 'ol' | 'div';
  /** Only with `as="div"`: `radiogroup`, `group`, `menu`. A list keeps `role="list"`. */
  role?: AriaRole;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  children?: ReactNode;
}

interface Row {
  key: string;
  node: ReactNode;
}

/** The rows in order, fragments opened up, every one with a key that is unique in the stack. */
function rowsOf(children: ReactNode, prefix = ''): Row[] {
  const rows: Row[] = [];
  Children.toArray(children).forEach((child, index) => {
    const key = `${prefix}${isValidElement(child) && child.key !== null ? child.key : index}`;
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      rows.push(...rowsOf(child.props.children, `${key}/`));
    } else {
      rows.push({ key, node: child });
    }
  });
  return rows;
}

export function RowStack({ open = false, close = false, trim = false, as: Tag = 'ul', role, className, children, ...rest }: RowStackProps) {
  const rows = rowsOf(children);
  if (rows.length === 0) return null;
  const Item = Tag === 'div' ? 'div' : 'li';
  return (
    <Tag
      data-kit="rowStack"
      role={Tag === 'div' ? role : 'list'}
      className={cn(
        'flex w-full flex-col',
        open && 'border-t border-hair-strong',
        close && 'border-b border-hair-strong',
        className,
      )}
      {...rest}
    >
      {rows.map((row, index) => (
        <Item
          key={row.key}
          className={
            cn(
              index > 0 && 'border-t border-hair',
              trim && index === 0 && '[&_[data-row-pad]]:pt-0',
              trim && index === rows.length - 1 && '[&_[data-row-pad]]:pb-0',
            ) || undefined
          }
        >
          {row.node}
        </Item>
      ))}
    </Tag>
  );
}
