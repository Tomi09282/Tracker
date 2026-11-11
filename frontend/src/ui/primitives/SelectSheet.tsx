import { forwardRef, useId, useRef, useState, type ForwardedRef, type KeyboardEvent, type Ref } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ListRow } from '../data/ListRow';
import { RowStack } from '../data/RowStack';
import { Sheet } from '../feedback/variants/E14E20';
import { FieldFrame, fieldDescribedBy, fieldIds, fieldLine, type FieldTone } from './Field';

export interface SelectOption<V extends string = string> {
  value: V;
  /** The option's words, `body-m`. */
  label: string;
  /** A line under it, `cap` `text-2` (what the option means). */
  sub?: string;
  disabled?: boolean;
}

export interface SelectSheetProps<V extends string = string> {
  /** The field's label — and the sheet's title, unless `sheetTitle` says otherwise. */
  label: string;
  /** The chosen value, or `null` for none (the placeholder shows). */
  value: V | null;
  options: readonly SelectOption<V>[];
  onChange: (value: V) => void;
  /** Shown while nothing is chosen, `text-3`. */
  placeholder?: string;
  /** The sheet's title when it should differ from the field's label. */
  sheetTitle?: string;
  hint?: string;
  hintTone?: FieldTone;
  error?: string;
  marker?: string;
  markerTone?: FieldTone;
  labelHidden?: boolean;
  disabled?: boolean;
  id?: string;
  /** A form name: the value is also carried by a hidden input, so a plain `<form>` submits it. */
  name?: string;
  /** Placement only. */
  className?: string;
}

/**
 * A choice from a short list — the field `Mit mérsz` of `progress-1`, and every native `<select>`
 * of today (Pulse System §4: "pickers are sheets").
 *
 * The trigger is the underline field — `cap-m` label, a 44 pt line with the chosen words in `body`
 * `text-1` (the placeholder in `text-3`) and the 20 pt chevron in `text-2` with its ink on the line's
 * end — and it is a button: a tap, Enter, Space or Alt+ArrowDown opens the bottom `Sheet`, titled
 * with the label. In the sheet the options are list rows on hairlines: the chosen one in `text-1`
 * with the lime tick of `setCheck` (24 pt) on the right, the others in `text-2` (the board's flow
 * screen). A tap chooses and closes; focus returns to the trigger.
 *
 * Semantics: the trigger is named by its label AND its value (`aria-labelledby` both), says it
 * opens a dialog (`aria-haspopup="dialog"`, `aria-expanded`); the rows are a `radiogroup` of
 * `radio`s with `aria-checked`, and ArrowUp / ArrowDown move between them.
 */
function SelectSheetInner<V extends string = string>(
  {
    label,
    value,
    options,
    onChange,
    placeholder,
    sheetTitle,
    hint,
    hintTone,
    error,
    marker,
    markerTone,
    labelHidden,
    disabled,
    id,
    name,
    className,
  }: SelectSheetProps<V>,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  const autoId = useId();
  const triggerId = id ?? autoId;
  const valueId = `${triggerId}-value`;
  const [open, setOpen] = useState(false);
  const rows = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([]);
  const chosen = options.find((o) => o.value === value) ?? null;

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onRowsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = rows.current.filter((r): r is HTMLButtonElement => !!r && !r.hasAttribute('aria-disabled'));
    const at = list.findIndex((r) => r === document.activeElement);
    const next = list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const choose = (next: V) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <FieldFrame
      kit="selectSheet"
      controlId={triggerId}
      label={label}
      hint={hint}
      hintTone={hintTone}
      error={error}
      marker={marker}
      markerTone={markerTone}
      labelHidden={labelHidden}
      disabled={disabled}
      labelAs="span"
      className={className}
    >
      <button
        ref={ref}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${fieldIds(triggerId).labelId} ${valueId}`}
        aria-describedby={fieldDescribedBy(triggerId, { marker, hint, error })}
        aria-invalid={error ? true : undefined}
        onClick={() => setOpen(true)}
        onKeyDown={onTriggerKey}
        className={cn(
          'flex h-11 w-full cursor-pointer items-start gap-2.5 bg-transparent p-0 text-start',
          // The line answers focus the way every field does: 2 px lime. The ring is not drawn — the line is the indicator.
          'outline-none focus-visible:outline-none',
          'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)] active:opacity-[var(--pressed-opacity)]',
          'disabled:cursor-default',
          fieldLine({ disabled, error: !!error }),
        )}
      >
        <span
          id={valueId}
          className={cn('flex h-11 min-w-0 flex-1 items-center truncate text-body', disabled ? 'text-text-3' : chosen ? 'text-text-1' : 'text-text-3')}
        >
          {chosen?.label ?? placeholder ?? ''}
        </span>
        <span aria-hidden className="flex h-11 shrink-0 items-center text-text-2 [&_svg]:size-5 [&_svg]:stroke-[1.75]">
          <ChevronDown />
        </span>
      </button>
      {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}

      <Sheet open={open} onClose={() => setOpen(false)} title={sheetTitle ?? label}>
        <div onKeyDown={onRowsKey}>
          <RowStack as="div" role="radiogroup" aria-label={sheetTitle ?? label}>
            {options.map((o, i) => {
              const on = o.value === value;
              return (
                <ListRow
                  key={o.value}
                  title={o.label}
                  sub={o.sub}
                  tone={on ? 'default' : 'muted'}
                  role="radio"
                  aria-checked={on}
                  tabIndex={on || (value === null && i === 0) ? 0 : -1}
                  disabled={o.disabled}
                  actionRef={(el) => {
                    rows.current[i] = el;
                  }}
                  onClick={() => choose(o.value)}
                  trailing={
                    on ? (
                      // `setCheck` done: the 24 pt lime tick, stroke 2.5, in a 44 slot.
                      <span aria-hidden className="flex size-11 items-center justify-center text-accent [&_svg]:size-6 [&_svg]:stroke-[2.5]">
                        <Check />
                      </span>
                    ) : (
                      <span aria-hidden className="size-11" />
                    )
                  }
                />
              );
            })}
          </RowStack>
        </div>
      </Sheet>
    </FieldFrame>
  );
}

export const SelectSheet = forwardRef(SelectSheetInner) as <V extends string = string>(
  props: SelectSheetProps<V> & { ref?: Ref<HTMLButtonElement> },
) => ReturnType<typeof SelectSheetInner>;
