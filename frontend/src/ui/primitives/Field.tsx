import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  /** Persistent helper text. A placeholder is not a label and not a hint. */
  hint?: string;
  error?: string;
  className?: string;
  /**
   * A glyph inside the field's leading edge — an envelope on an e-mail, a lock on a password.
   *
   * Decoration with a job: it tells you what a field wants before you have read its label, which
   * is how a form is actually scanned. It is `aria-hidden` by construction — the label is what
   * names the field, and a glyph that also announced itself would say the same thing twice.
   */
  leading?: ReactNode;
  trailing?: ReactNode;
}

/**
 * Text input with a visible label.
 *
 * Two rules from the Bible and the UX guidelines are structural here rather than left to the
 * caller: the label is always rendered (placeholder-only labelling disappears the moment the
 * user types), and the input is at least 44 px tall — the previous build's search field was
 * 24 px, which is the single worst target in the whole audit.
 *
 * The error is wired through `aria-describedby` and `role="alert"`, so a screen reader hears it
 * when it appears rather than only on the next focus.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, className, leading, trailing, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    // `gap-tight` (8px) rather than the old 1.5 step (6px): the label, the input and the hint or
    // error are one group, and `--spacing-tight` is the name for that relationship. 6px was also
    // the one distance in this component that was not on the 4px grid.
    <div className={cn('flex flex-col gap-tight', className)}>
      <label htmlFor={inputId} className="text-body-s text-text-2">
        {label}
      </label>

      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hint && hintId, error && errorId) || undefined}
          className={cn(
            'w-full rounded-field bg-[var(--field-bg)] px-3',
            // The floor, again — an input is a control like any other, and it reads the same
            // pack-owned height as `control.ts` so a field and the button beside it cannot end up
            // different heights in a pack that declares taller controls.
            'min-h-[var(--control-h)]',
            'text-body text-text-1 placeholder:text-text-3',
            // The glyph occupies the leading edge, so the text has to start after it. 44px, which
            // is the same floor every control obeys — a narrower inset would put the caret against
            // the icon on the first character typed.
            leading && 'ps-[var(--target-min)]',
            // Border WIDTH from the pack (Mono's 2px), border COLOR from the field's own token —
            // `--field-border` existed and nothing read it, so a field could never diverge from a
            // card even though the alias was there to let it.
            'border-[length:var(--border-width)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            error ? 'border-[var(--danger)]' : 'border-[var(--field-border)]',
            'outline-none focus-visible:border-accent focus-visible:outline-2',
            'focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
            'disabled:pointer-events-none disabled:opacity-45',
            trailing && 'pr-12',
          )}
          {...rest}
        />
        {leading ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 flex w-[var(--target-min)] items-center justify-center text-text-3"
          >
            {leading}
          </span>
        ) : null}
        {trailing ? (
          <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span>
        ) : null}
      </div>

      {hint && !error ? (
        <p id={hintId} className="text-caption text-text-3">
          {hint}
        </p>
      ) : null}

      {/* Errors sit directly below the field they belong to, never collected at the top.
          Colour + ICON + message, all three at once: roughly 12% of users have a colour-vision
          deficiency, and for them a red border and red text is an unstyled sentence. `gap-tight`
          is the named 8px step for icon-to-text inside one group — the same relationship the
          wrapper above uses. */}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-caption flex items-center gap-tight text-[var(--danger)]"
        >
          <AlertCircle size={16} strokeWidth={2} aria-hidden className="shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
});
