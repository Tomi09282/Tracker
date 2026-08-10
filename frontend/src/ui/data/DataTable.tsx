import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../primitives/Pressable';

export type SortDirection = 'asc' | 'desc';

export interface Column<Row> {
  /** Stable key. Also the sort key sent to the server, when the column is sortable. */
  key: string;
  header: string;
  /** Omit to make the column unsortable — most are. */
  sortable?: boolean;
  /** Right-align numbers. Text left, numbers right; nothing else. */
  numeric?: boolean;
  render: (row: Row) => ReactNode;
}

/**
 * The dense table, once.
 *
 * ═══ THE STICKY HEADER IN THIS APP HAD NEVER STUCK ═════════════════════════════════════════════
 *
 * The admin moderation queue shipped with `sticky top-0` on its `thead` inside a wrapper whose only
 * job was `overflow-x-auto`. Measured on the real screen with twelve rows: scrolling the page 600px
 * moved the header 600px. Not "stuck late" or "stuck at the wrong offset" — it had never stuck at
 * all, and it looked completely correct in the markup.
 *
 * The reason is that `position: sticky` sticks to the nearest SCROLLING ancestor. `overflow-x: auto`
 * makes an element a scroll container on BOTH axes — the computed `overflow-y` is forced from
 * `visible` to `auto` — so the header's reference was that wrapper, not the page. And the wrapper
 * had no height limit, so it never scrolled: `scrollHeight === clientHeight`, measured. Sticky
 * inside a container that cannot scroll does nothing, silently, forever.
 *
 * So the wrapper is capped at `--table-max-h` and scrolls for real. That is what makes the header
 * stick, and it is why the token exists rather than a hardcoded height.
 *
 * ═══ aria-sort GOES ON THE th, AND THE BUTTON IS A Pressable ═══════════════════════════════════
 *
 * `aria-sort` is a property of the COLUMN HEADER, not of the control inside it — on the button it
 * is ignored, which is the failure that looks like success. And a raw `<button>` outside `src/ui`
 * fails this project's build, for the same reason every other primitive is shared: a control that
 * grows its own focus ring and its own 44px floor is a control that gets one of them wrong.
 *
 * Exactly one column may be sorted at a time, so every other header carries `aria-sort="none"`
 * rather than nothing — a screen reader announcing "sortable" with no state is worse than silent.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  caption,
  empty,
  className,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string | number;
  sort?: { key: string; direction: SortDirection };
  /** Called with the column key. The CALLER decides what the next direction is — see below. */
  onSort?: (key: string) => void;
  /** Required. A table with no caption is a table a screen-reader user meets with no idea what it is. */
  caption: string;
  empty?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div
      className={cn(
        // BOTH axes, deliberately. `overflow-x-auto` alone already made this a Y scroll container
        // by CSS rule — writing only one axis hid that fact from every reader of this file.
        'overflow-auto rounded-card border border-[var(--surface-border)]',
        'max-h-[var(--table-max-h)]',
        className,
      )}
    >
      <table className="w-full min-w-[640px] border-collapse text-left">
        {/* Visually hidden, not absent: the caption is the table's name for anybody who cannot see
            the heading above it. */}
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-[var(--z-sticky)] bg-surface-2">
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  // On the TH. On the button it is ignored — and ignored quietly.
                  aria-sort={c.sortable ? (active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                  className={cn('text-micro uppercase px-4 py-3 text-text-3', c.numeric && 'text-right')}
                >
                  {c.sortable && onSort ? (
                    <Pressable
                      variant="ghost"
                      density="compact"
                      className={cn('-mx-2 gap-1', c.numeric && 'ml-auto')}
                      onClick={() => onSort(c.key)}
                    >
                      {c.header}
                      {active ? (
                        sort.direction === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3.5" aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                      )}
                    </Pressable>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-t border-[var(--surface-border)] transition-colors hover:bg-surface-2"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'text-body-s min-h-[var(--table-row-h)] px-4 py-2 text-text-1',
                    c.numeric && 'tabular-nums text-right',
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The next sort state for a header click.
 *
 * Shared so every table agrees on what a second click means. Clicking a NEW column starts
 * ascending; clicking the active one flips. There is deliberately no third "unsorted" state — a
 * table that loses its order on the third click is a table people click three times by accident.
 */
export function nextSort(current: { key: string; direction: SortDirection } | undefined, key: string) {
  if (current?.key !== key) return { key, direction: 'asc' as SortDirection };
  return { key, direction: current.direction === 'asc' ? ('desc' as SortDirection) : ('asc' as SortDirection) };
}
