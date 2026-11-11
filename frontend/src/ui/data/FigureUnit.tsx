import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';

/*
 * FigureUnit — an inline figure with its unit on one baseline (kit gap G-data 10):
 *
 *     108 kg          figure: mono, unit: `cap` text-2, 4 apart
 *
 * client-detail-3 (a record row's value: "108" `dataL` 16 / 20 text-1 + "kg", x 330-378) and the
 * macro row's figure draw it. Two steps:
 *
 *   dataL   16 / 20, text-1 — a value that is the point of its row (a record, a macro)
 *   data    13 / 18, text-2 — a trailing value among others (a price in a byline)
 *
 * A number is formatted in the app language; a string is drawn as given ("131,3"). `null` /
 * `undefined` is a read that failed or has not arrived and prints the dash, never a 0.
 *
 * This is the figure of a ROW. The big figures (`num`, `giant`) are `Numeral`, whose ink-tight box
 * and roller this one does not need.
 */

export interface FigureUnitProps {
  value: string | number | null | undefined;
  /** The unit after the figure ("kg", "kcal", "Ft"). */
  unit?: string;
  /** Default `dataL`. */
  step?: 'dataL' | 'data';
  /** The figure's ink. Default: `ink` at `dataL`, `quiet` (text-2) at `data`. */
  tone?: 'ink' | 'quiet' | 'warn';
  /** For a numeric `value`. */
  format?: Intl.NumberFormatOptions;
  /** What a screen reader says instead of "108 kg". */
  srText?: string;
  /** Placement only. */
  className?: string;
}

const INK = { ink: 'text-text-1', quiet: 'text-text-2', warn: 'text-warning' } as const;

export function FigureUnit({ value, unit, step = 'dataL', tone, format, srText, className }: FigureUnitProps) {
  const { i18n } = useTranslation();
  const absent = value === null || value === undefined || value === '';
  const figure = absent ? '—' : typeof value === 'number' ? value.toLocaleString(i18n.language, format) : value;
  const ink = INK[tone ?? (step === 'dataL' ? 'ink' : 'quiet')];
  return (
    <span data-kit="figureUnit" className={cn('inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap', className)}>
      {srText ? <span className="sr-only">{srText}</span> : null}
      <span aria-hidden={srText ? true : undefined} className={cn(step === 'dataL' ? 'text-data-l' : 'text-data', absent ? 'text-text-3' : ink)}>
        {figure}
      </span>
      {unit && !absent ? (
        <span aria-hidden={srText ? true : undefined} className="text-cap text-text-2">
          {unit}
        </span>
      ) : null}
    </span>
  );
}
