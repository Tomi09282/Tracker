import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  /** Persistent helper text. A placeholder is not a label and not a hint. */
  hint?: string;
  error?: string;
  className?: string;
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
  { label, hint, error, className, trailing, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
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
            // The floor, again — an input is a control like any other.
            'min-h-[var(--target-min)]',
            'text-body text-text-1 placeholder:text-text-3',
            'border transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            error ? 'border-[var(--danger)]' : 'border-[var(--surface-border)]',
            'outline-none focus-visible:border-accent focus-visible:outline-2',
            'focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
            'disabled:pointer-events-none disabled:opacity-45',
            trailing && 'pr-12',
          )}
          {...rest}
        />
        {trailing ? (
          <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span>
        ) : null}
      </div>

      {hint && !error ? (
        <p id={hintId} className="text-caption text-text-3">
          {hint}
        </p>
      ) : null}

      {/* Errors sit directly below the field they belong to, never collected at the top. */}
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
});
