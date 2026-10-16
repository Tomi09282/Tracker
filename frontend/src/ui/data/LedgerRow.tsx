import { ChevronRight } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { Numeral } from './Numeral';
import type { NumeralMode } from './Numeral';

/** What the row stands for when it cannot show a figure: a failed or a pending read. Never a 0. */
export const LEDGER_DASH = '—';

/** The second label + figure of a two-pair ledger line (admin-1 "GYAKORLAT 1656 · MÉDIAFÁJL 3"). */
export interface LedgerPair {
  /** The eyebrow before the figure. */
  label: ReactNode;
  /** As `LedgerRow value`: a figure, a node, or `null` / `undefined` for the dash. */
  value: ReactNode;
  unit?: string;
  format?: Intl.NumberFormatOptions;
  srText?: string;
}

export interface LedgerRowProps {
  /** The eyebrow on the left ("Érmék") — `eyebrow` 16 / 20 Bold, upper case, `text-2`. Also the row's name. */
  label: ReactNode;
  /** A small node 8 after the label, centred on its caps — the 22 pt coin of the Profil row (`<Pic slot="coin" width={22} />`). */
  labelTrail?: ReactNode;
  /**
   * The middle column, from x 112. A string is `cap` 13 / 18 `text-2` on the row's baseline
   * ("Egyenleged"); a node (a `Sparkline` 118 × 28) stands with its bottom 1 pt under the baseline,
   * as the frames place it.
   */
  note?: ReactNode;
  /**
   * The figure, right-aligned by its ink. A string or a number is a `num` `Numeral` (a number is
   * formatted in the app language); a node is drawn as given (a `Fraction`). `null` / `undefined`
   * — a read that failed or has not arrived — prints the dash, never a 0: pass the query's value
   * as it is (`data?.count`), never `data?.count ?? 0`.
   */
  value: ReactNode;
  /** The unit after the figure, `cap` `text-2`, its ink 6 after the figure's ink, on the baseline ("kg", "kcal"). */
  unit?: string;
  /** For a numeric `value`. */
  format?: Intl.NumberFormatOptions;
  /** `roll` for a figure that changes while it is on screen (a balance). Default `static`. */
  mode?: NumeralMode;
  /** What a screen reader says for the figure instead of the drawn digits. */
  srText?: string;
  /** The read failed: the dash, whatever `value` holds. */
  failed?: boolean;
  /** The read is under way: the dash, and the row is `aria-busy`. */
  busy?: boolean;
  /** A route: the whole row is the link, with the chevron. */
  to?: string;
  /** An action: the whole row is the button, with the chevron. */
  onClick?: () => void;
  /** The 16 pt chevron. Default: shown when the row is a link or a button. */
  chevron?: boolean;
  /**
   * Keep the chevron's column (the figure ends on x 334) although no chevron is drawn — a row that
   * opens nothing under one that does, so both figures stand in one column (coach-dashboard-1
   * "Élő kódok" under "Csapatok"). Default: as `chevron`; without either the figure ends on x 354.
   */
  chevronSpace?: boolean;
  /** An interactive row that cannot be used now: 40 %, refuses the press, still focusable (as a disabled `ListRow`). */
  disabled?: boolean;
  /** Specimen only (the kit board): show the pressed or the keyboard-focus state without a press or a focus. */
  force?: 'pressed' | 'focus';
  /** Placement only. The row fills the width it is given. */
  className?: string;
  /**
   * A SECOND label + figure on the same baseline (kit gap G-data 10, admin-1): the row then reads
   * `label · figure` from the left edge (the figure's ink 12 after the label's) and `pair.label ·
   * pair.value` ending on the right edge by ink. `note` is not drawn in this form.
   */
  pair?: LedgerPair;
}

/**
 * The interactive row's states — a `ListRow`'s (lane F9): pressed 60 % in `--duration-instant`,
 * disabled 40 % with `aria-disabled` (a row that turns disabled while it has the focus keeps it),
 * the 2 px lime ring 2 px off the box under the keyboard. `data-force` draws the same declarations
 * for the kit board.
 */
const INTERACTIVE = [
  'cursor-pointer select-none rounded-2 text-left',
  'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)]',
  'active:opacity-[var(--pressed-opacity)] data-[force=pressed]:opacity-[var(--pressed-opacity)]',
  'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
  'data-[force=focus]:outline-solid data-[force=focus]:outline-2 data-[force=focus]:outline-offset-2 data-[force=focus]:outline-[var(--focus-ring)]',
  'aria-disabled:pointer-events-none aria-disabled:opacity-[var(--disabled-opacity)]',
].join(' ');

/**
 * The unit: its INK 6 after the figure's ink (every frame). The figure's box is its ink; the unit's
 * box starts about 1 pt before its first glyph's ink (Geist "k" / "c" at 13), so the box gap is 5.
 */
const UNIT = '-mr-px ml-[5px] font-body text-cap text-text-2'; // token-lint-disable — an ink-to-ink distance measured in the frames (6), not a layout gap

const isFigure = (value: ReactNode): value is string | number => typeof value === 'string' || typeof value === 'number';
const isAbsent = (value: ReactNode) => value === null || value === undefined || typeof value === 'boolean';

/**
 * THE LEDGER ROW (kit `ledgerRow`, `app-kit.js` 264-273; Pulse System 4 "Ledger row"): 76 high,
 * label | note | figure on ONE baseline at 57 — the eyebrow on the edge, the note from x 112, the
 * `num` figure ending by its ink on x 334 (on x 354 without the chevron), the chevron's 16 pt box
 * at x 343, y 30. Coach dashboard, Profil, client nutrition: a stat is a ledger line, never a tile.
 *
 * The one baseline is the flex container's: a 57 pt strut opens the row, every column aligns its
 * own baseline to the strut's bottom edge — the eyebrow, the note and the figure are all set ON it,
 * whatever their faces and sizes.
 *
 * No rule of its own: rows are stacked between hairlines by the list that holds them.
 */
export function LedgerRow({
  label,
  labelTrail,
  note,
  value,
  unit,
  format,
  mode = 'static',
  srText,
  failed = false,
  busy = false,
  to,
  onClick,
  chevron,
  chevronSpace,
  disabled = false,
  force,
  className,
  pair,
}: LedgerRowProps) {
  const labelId = useId();
  const interactive = to !== undefined || onClick !== undefined;
  const showChevron = chevron ?? interactive;
  const dash = failed || busy || isAbsent(value);

  const figure = dash ? (
    <Numeral value={LEDGER_DASH} tone="pending" />
  ) : isFigure(value) ? (
    <Numeral value={value} format={format} mode={mode} srText={srText} />
  ) : (
    value
  );

  const pairDash = pair ? isAbsent(pair.value) || failed || busy : false;
  const pairFigure = !pair ? null : pairDash ? (
    <Numeral value={LEDGER_DASH} tone="pending" />
  ) : isFigure(pair.value) ? (
    <Numeral value={pair.value} format={pair.format} srText={pair.srText} />
  ) : (
    pair.value
  );

  const body = pair ? (
    <>
      <span aria-hidden className="h-[57px] w-0 shrink-0" />
      <span className="flex min-w-0 items-baseline gap-3">
        <span id={labelId} className="text-eyebrow text-text-2">
          {label}
        </span>
        <span className="flex shrink-0 items-baseline">
          {figure}
          {unit && !dash ? <span className={UNIT}>{unit}</span> : null}
        </span>
      </span>
      <span className="ml-auto flex min-w-0 items-baseline gap-3 pl-3">
        <span className="text-eyebrow text-text-2">{pair.label}</span>
        <span className="flex shrink-0 items-baseline">
          {pairFigure}
          {pair.unit && !pairDash ? <span className={UNIT}>{pair.unit}</span> : null}
        </span>
      </span>
      {showChevron ? (
        <ChevronRight aria-hidden size={16} strokeWidth={1.75} className="absolute -right-[5px] top-[30px] text-text-3" />
      ) : null}
    </>
  ) : (
    <>
      <span aria-hidden className="h-[57px] w-0 shrink-0" />
      <span className="flex min-w-28 shrink-0 items-center gap-2 pr-3">
        <span id={labelId} className="text-eyebrow text-text-2">
          {label}
        </span>
        {labelTrail ? <span className="flex shrink-0">{labelTrail}</span> : null}
      </span>
      {note === undefined || note === null ? null : typeof note === 'string' ? (
        <span className="min-w-0 flex-1 overflow-x-clip text-ellipsis whitespace-nowrap font-body text-cap text-text-2">{note}</span>
      ) : (
        <span className="relative top-px flex min-w-0 flex-1">{note}</span>
      )}
      <span className="ml-auto flex shrink-0 items-baseline">
        {figure}
        {unit && !dash ? <span className={UNIT}>{unit}</span> : null}
      </span>
      {showChevron ? (
        <ChevronRight aria-hidden size={16} strokeWidth={1.75} className="absolute -right-[5px] top-[30px] text-text-3" />
      ) : null}
    </>
  );

  const shell = cn('relative flex h-[76px] w-full items-baseline', (chevronSpace ?? showChevron) && 'pr-5', className);
  const common = {
    'data-kit': 'ledgerRow',
    'data-force': force,
    'aria-busy': busy || undefined,
  } as const;

  if (to !== undefined) {
    return (
      <Link
        {...common}
        to={to}
        aria-disabled={disabled || undefined}
        onClick={disabled ? (event) => event.preventDefault() : onClick}
        className={cn(shell, INTERACTIVE)}
      >
        {body}
      </Link>
    );
  }
  if (onClick !== undefined) {
    return (
      <button {...common} type="button" aria-disabled={disabled || undefined} onClick={disabled ? undefined : onClick} className={cn(shell, INTERACTIVE)}>
        {body}
      </button>
    );
  }
  return (
    <div {...common} role="group" aria-labelledby={labelId} className={shell}>
      {body}
    </div>
  );
}
