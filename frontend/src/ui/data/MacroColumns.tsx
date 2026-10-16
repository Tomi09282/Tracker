import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { Numeral } from './Numeral';
import { ProgressBar } from './ProgressBar';
import { StatBlock } from './StatBlock';

export interface MacroColumn {
  /** The name over the figure ("Fehérje"). Also the accessible name of the column and of its bar. */
  name: string;
  /** A string is drawn as given ("37,9"); a number is formatted in the app language. */
  value: string | number;
  /** The unit after the figure ("g", "cm", "%"). */
  unit?: string;
  /** value ÷ target. Not given or `null` = no target: no bar. Over 1 = over target: figure and bar in `warn`. */
  ratio?: number | null;
  /** The line under the bar ("cél 180 g", a date). */
  caption?: string;
}

export interface MacroColumnsProps {
  /** Two to four columns; they share the width equally, 16 apart. */
  columns: readonly MacroColumn[];
  /**
   * `data` (default): the macro row of Home and Haladás — name in `cap`, the figure in mono `dataL`.
   * `num`: the same instrument one size up, as Táplálkozás draws it — the name as an eyebrow over a
   * `num` numeral (a `StatBlock`), then the bar and the caption.
   */
  size?: 'data' | 'num';
  /**
   * The number of equal tracks the width is cut into. Default `columns.length`. A row with FEWER
   * columns than tracks keeps the full rows' column width (progress-1: a short last row stays
   * 76.5 pt per column) — kit gap G-data 13, additive.
   */
  tracks?: number;
  /** Placement only. The row fills the width it is given. */
  className?: string;
}

/**
 * The macro row (kit `macroCol`, once per column; `app-kit.js` `macroCol`): no tiles, no glyphs.
 *
 *   data  name (cap, text-2) → 4 → figure (dataL, text-1; unit cap text-2 4 after it, on its
 *         baseline) → 8 → 4 pt bar → 8 → caption (cap, text-3). home-1: 4 × 76.5 on 354, 80 tall.
 *   num   eyebrow → 8 → `num` numeral + unit (a `StatBlock`) → 12 → bar → 8 → caption.
 *         nutrition-1: 3 × 107.3, 109 tall.
 *
 * A column without a target has no bar (Haladás draws a date as its caption instead); a column
 * over its target draws its figure and its bar in `warn`. Columns stand at the top of the row and
 * hug their own content — one without a bar is shorter, as on the board.
 */
export function MacroColumns({ columns, size = 'data', tracks, className }: MacroColumnsProps) {
  const { i18n } = useTranslation();
  const n = Math.max(1, Math.floor(tracks ?? columns.length));
  return (
    <div data-kit="macroColumns" className={cn('grid w-full items-start gap-4', className)} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      {columns.map((column) => {
        const over = typeof column.ratio === 'number' && column.ratio > 1;
        const figure = typeof column.value === 'number' ? column.value.toLocaleString(i18n.language) : column.value;
        const bar = typeof column.ratio === 'number' ? <ProgressBar value={column.ratio} label={column.name} /> : null;
        if (size === 'num') {
          return (
            <div key={column.name} data-kit="macroCol" className="flex min-w-0 flex-col gap-3">
              <StatBlock label={column.name}>
                <Numeral value={figure} unit={column.unit} tone={over ? 'warn' : 'ink'} />
              </StatBlock>
              {bar || column.caption ? (
                <div className="flex flex-col gap-2">
                  {bar}
                  {column.caption ? <span className="truncate text-cap text-text-3">{column.caption}</span> : null}
                </div>
              ) : null}
            </div>
          );
        }
        return (
          <div key={column.name} data-kit="macroCol" role="group" aria-label={column.name} className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-col gap-1">
              <span className="truncate text-cap text-text-2">{column.name}</span>
              <span className="flex items-baseline gap-1">
                <span className={cn('text-data-l', over ? 'text-warning' : 'text-text-1')}>{figure}</span>
                {column.unit ? <span className="text-cap text-text-2">{column.unit}</span> : null}
              </span>
            </div>
            {bar}
            {column.caption ? <span className="truncate text-cap text-text-3">{column.caption}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
