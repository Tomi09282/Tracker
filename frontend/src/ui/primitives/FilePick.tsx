import { forwardRef, useState, type ChangeEvent, type FocusEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { control, kitName, type ControlVariants } from './control';
import { ControlBody } from './Pressable';

export interface FilePickProps extends Pick<ControlVariants, 'variant' | 'size' | 'tone' | 'text'> {
  /** The trigger's words: "Fájl választása" (`progress-3`), "Kép választása" (`compose-post`). */
  children: ReactNode;
  /** Called with the chosen files (never empty). The input is reset after, so the same file can be chosen again. */
  onFiles: (files: File[]) => void;
  /** The native `accept` list ("image/jpeg,image/png,image/webp"). The server still sniffs the real type. */
  accept?: string;
  multiple?: boolean;
  /** The camera, where the platform offers it (`user` / `environment`). */
  capture?: 'user' | 'environment';
  disabled?: boolean;
  /** An upload is in flight: three dots in place of the words, `aria-busy`, no second pick. */
  busy?: boolean;
  /** Lead / trail glyph, as on `Pressable` / `TextLink` (a bare Lucide icon). */
  icon?: ReactNode;
  trail?: ReactNode;
  id?: string;
  name?: string;
  'aria-describedby'?: string;
  /** Placement only (`w-full` for the docked pill of `progress-3`). */
  className?: string;
  /** Kit specimen and captures only: hold the pressed look or the keyboard ring (the actions kit's convention). */
  'data-force'?: 'pressed' | 'focus';
}

/**
 * A file chooser — the heir of the two raw `<input type="file">` of today (`ProgressPage`'s photo,
 * `PostEditorPage`'s cover).
 *
 * A labelled trigger over a visually hidden native input: the trigger is any look of the actions
 * kit (`variant` / `size` / `tone` / `text` exactly as on `Pressable` — `progress-3` draws the 56 pt
 * lime pill "Fájl választása", a cover slot the text link "Kép választása"), drawn on a `<label>`
 * that holds the input, so a tap anywhere on it opens the platform's own file dialog and the label's
 * words are the input's name. The input stays in the tab order (it is `sr-only`, not `display:
 * none`): its keyboard focus lights the trigger's lime ring, Enter / Space open the dialog, and the
 * trigger shows the actions kit's pressed, disabled and busy looks.
 */
export const FilePick = forwardRef<HTMLInputElement, FilePickProps>(function FilePick(
  {
    children,
    onFiles,
    accept,
    multiple,
    capture,
    disabled = false,
    busy = false,
    icon,
    trail,
    variant = 'primary',
    size,
    tone,
    text,
    id,
    name,
    'aria-describedby': describedBy,
    className,
    'data-force': force,
  },
  ref,
) {
  // The trigger draws the ring the actions kit draws for keyboard focus (`data-force="focus"`): the
  // focused element is the hidden input, and only its own `:focus-visible` says it came from a key.
  const [keyFocus, setKeyFocus] = useState(false);
  const off = disabled || busy;

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length > 0) onFiles(files);
  };

  return (
    <label
      data-kit="filePick"
      data-kit-look={kitName({ variant, shape: 'button', size })}
      data-force={keyFocus ? 'focus' : force}
      aria-disabled={off || undefined}
      aria-busy={busy || undefined}
      className={cn(
        control({ variant, size, tone, text }),
        'relative',
        // A <label> cannot be :disabled — the recipe's disabled pill (`surface-2`, `text-3`, no glow),
        // keyed on aria-disabled. The one legal use of the sheet's surface outside it (Pulse System 2.1).
        variant === 'primary' &&
          !busy &&
          'aria-disabled:pointer-events-none aria-disabled:bg-[var(--surface-2)] aria-disabled:text-text-3 aria-disabled:before:hidden',
        variant === 'primary' && busy && 'pointer-events-none before:hidden',
        className,
      )}
    >
      <ControlBody variant={variant === 'link' ? 'link' : undefined} tone={tone} busy={busy} icon={icon} trail={trail}>
        {children}
      </ControlBody>
      <input
        ref={ref}
        id={id}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture}
        disabled={off}
        aria-describedby={describedBy}
        onChange={onChange}
        onFocus={(e: FocusEvent<HTMLInputElement>) => setKeyFocus(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setKeyFocus(false)}
        className="sr-only"
      />
    </label>
  );
});
