import { useTranslation } from 'react-i18next';
import { Chip, ChipRow } from './ChipRow';
import { WEEKDAYS, maskHas, maskToggle, weekdayLong, weekdayShort } from './weekdays';

/*
 * WeekdayChips — the seven weekdays as a multi-select chip row (lane G-lifeos, kit gap F.2).
 *
 * Source: round B `habit-form` ("Chips/weekdays · WeekdayChips", H–P chosen) and `task-form`
 * (V chosen, under Hetente) — `figma-build/lifeos/habit-form.body.js`, `task-form.body.js`:
 * `chipRow(['H','K','Sze','Cs','P','Szo','V'], [..])`, i.e. the kit's own `chipRow`
 * (`app-kit.js` 211): words in `body-m`, 24 apart, a 44 pt frame each; idle `text-2`, chosen
 * `text-1` with the 2 pt LIME mark under the word (y 37 of 44). Nothing is drawn here that
 * `ChipRow` / `Chip` do not already draw: this file is the weekday model on top of them.
 *
 * The value is f_app's weekday mask: bit 0 = Monday … bit 6 = Sunday. Each chip is a
 * `role="checkbox"` (independent choices) named by the full weekday ("szerda"); the row is a
 * `group` named by `label`. Busy / failed / disabled / pressed / focus are `Chip`'s.
 *
 * Reference: docs/pipeline/pulse/kit/lifeos.md.
 */

export interface WeekdayChipsProps {
  /** The accessible name of the row ("Ütemezés", "Ismétlődés napjai"). */
  label: string;
  /** Weekday mask, bit 0 = Monday … bit 6 = Sunday (0..127). */
  value: number;
  /** The new mask after a tap. The caller decides whether an empty mask is allowed. */
  onChange: (mask: number) => void;
  /** The whole row is unavailable: 40 %. */
  disabled?: boolean;
  /** A chip that is being saved shows three dots: the weekday index (0 = Monday). */
  busyDay?: number;
  /** The last change of this weekday failed: its word is `danger`. */
  failedDay?: number;
  /** Placement only. */
  className?: string;
}

export function WeekdayChips({ label, value, onChange, disabled = false, busyDay, failedDay, className }: WeekdayChipsProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  return (
    <div data-kit="weekdayChips" className={className}>
      {/* Disabled is set on each chip (40 % once); the row's own `disabled` would dim it a second time. */}
      <ChipRow label={label}>
        {WEEKDAYS.map((d) => (
          <Chip
            key={d}
            role="checkbox"
            selected={maskHas(value, d)}
            busy={busyDay === d}
            failed={failedDay === d}
            disabled={disabled}
            aria-label={weekdayLong(d, locale)}
            onClick={() => onChange(maskToggle(value, d))}
          >
            {weekdayShort(d, locale)}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}
