import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Field, type FieldProps } from './Field';

export interface SearchFieldProps
  extends Omit<FieldProps, 'leading' | 'trailing' | 'type' | 'marker' | 'markerTone' | 'labelHidden' | 'kit'> {
  /**
   * The field's name for assistive tech ("Keresés", "Keresés e-mailben"). Rendered `sr-only`: the
   * kit's `searchField` draws no label — the glass and the placeholder say what the line is for.
   */
  label: string;
  /** Draw the label above the line after all (`plan-editor-3` "Gyakorlat keresése" is a labelled search). */
  labelVisible?: boolean;
  /**
   * Called after the clear control emptied the field. The field clears itself either way — a
   * controlled caller receives the usual `onChange` with an empty value first — so this is only for
   * a caller that wants to know (reset a page cursor, collapse results).
   */
  onClear?: () => void;
  /** The clear control's accessible name. Default `common.clearSearch` ("Keresés törlése"). */
  clearLabel?: string;
}

/** Sets an input's value the way a keystroke would, so React's `onChange` fires for a controlled caller. */
function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * The search line — kit `searchField` (`app-kit.js` 237: `inputField(null, { lead: 'search', ph })`).
 *
 * It IS the underline field, with no visible label, the 20 pt search glass in `text-2` on the
 * leading edge (10 before the placeholder: `marketplace-1`, `nutrition-1`, `admin-3`) and, while
 * there is something to clear, the 20 pt `x` in `text-2` with its ink against the trailing edge
 * (the board's "focus + clear"). Every state is the field's: 1 px `edge`, 2 px lime + lime caret on
 * focus, `text-3` placeholder.
 *
 * The clear control is a real button with its own name and a 44 × 44 target; its glyph is drawn
 * where the kit draws it (the last 20 pt of the line), so the target overhangs the line's end by
 * 12 into the gutter rather than pushing the glyph inwards. After a clear, focus goes back to the
 * input — the user cleared it to type something else.
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { label, labelVisible = false, onClear, clearLabel, value, defaultValue, onChange, disabled, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current as HTMLInputElement);

  // Whether there is anything to clear. A controlled field says so through `value`; an
  // uncontrolled one is followed through its own `onChange`.
  const [typed, setTyped] = useState(() => String(defaultValue ?? '').length > 0);
  const filled = value !== undefined ? String(value).length > 0 : typed;

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (value === undefined) setTyped(e.target.value.length > 0);
      onChange?.(e);
    },
    [onChange, value],
  );

  const clear = () => {
    const el = input.current;
    if (!el) return;
    setNativeValue(el, '');
    el.focus();
    onClear?.();
  };

  return (
    <Field
      ref={input}
      kit="searchField"
      label={label}
      labelHidden={!labelVisible}
      type="search"
      inputMode="search"
      enterKeyHint="search"
      autoComplete="off"
      value={value}
      defaultValue={defaultValue}
      onChange={handleChange}
      disabled={disabled}
      leading={<Search />}
      trailing={
        filled && !disabled ? (
          <button
            type="button"
            aria-label={clearLabel ?? t('common.clearSearch')}
            onClick={clear}
            className={cn(
              // A 44 × 44 target whose 20 pt glyph ends on the line's end: the box overhangs by 12.
              '-mr-3 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-2',
              '[&_svg]:size-5 [&_svg]:stroke-[1.75]',
              'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)] active:opacity-[var(--pressed-opacity)]',
              'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
            )}
          >
            <X aria-hidden />
          </button>
        ) : undefined
      }
      {...rest}
    />
  );
});
