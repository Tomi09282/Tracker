import { cn } from '../../lib/cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Labels the control for assistive tech. Pass the id of a visible label, or `label`. */
  labelledBy?: string;
  label?: string;
  describedBy?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * A binary on/off switch.
 *
 * A REAL `role="switch"` with `aria-checked`, not a styled checkbox with a hidden input. The two
 * look identical and read completely differently: a screen reader announces a switch as "on/off"
 * and a checkbox as "checked/unchecked", and only the first is true of a setting that takes effect
 * immediately with no form to submit.
 *
 * It lives in `src/ui/primitives` because that is where the token gate permits a raw `<button>` —
 * and the gate is right to push it here. A toggle is not a one-screen concern; the first one was
 * written for the cue settings and the second will not be.
 *
 * THE TARGET IS 44 px EVEN THOUGH THE TRACK IS 24 px TALL. The visible switch is small by
 * convention, but a control you cannot reliably hit is not a control. The padding is transparent
 * and the track is centred inside it, so the hit area is the Bible's floor while the graphic stays
 * the size people expect.
 */
export function Switch({
  checked,
  onChange,
  labelledBy,
  label,
  describedBy,
  disabled,
  id,
  className,
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        // The hit area, not the graphic. `grid place-items-center` keeps the track centred in it.
        'grid size-11 shrink-0 place-items-center rounded-field',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative block h-6 w-11 rounded-full',
          'transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
          checked ? 'bg-accent' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-surface-1 shadow-[var(--shadow-overlay)]',
            'transition-[left] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
            checked ? 'left-[1.375rem]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}
