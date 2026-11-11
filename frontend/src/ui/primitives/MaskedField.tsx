import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Field, type FieldProps } from './Field';

export interface MaskedFieldProps extends Omit<FieldProps, 'type' | 'trailing' | 'kit'> {
  /** Offer the reveal control. Default `true` (`auth-2`); `false` keeps the value masked for good. */
  revealable?: boolean;
  /** Controlled reveal state. Leave both out and the field keeps its own. */
  revealed?: boolean;
  onRevealedChange?: (revealed: boolean) => void;
  /** The reveal control's names. Default `common.showPassword` / `common.hidePassword`. */
  showLabel?: string;
  hideLabel?: string;
}

/**
 * A masked value — the password line of `auth-1` / `auth-2`.
 *
 * The underline `Field` with `type="password"` (whose masked value is already drawn as the frame's
 * 6 pt discs on an 11 pt pitch — the F12 stage-1 tokens) and, on the trailing edge, the reveal
 * control `Button/reveal`: a 44 × 44 target with the 20 pt eye in `text-2`, its ink against the
 * line's end. While masked it shows the struck eye ("Jelszó megjelenítése"); revealed, the open eye
 * ("Jelszó elrejtése"), `aria-pressed` saying which. A revealed value is ordinary 16 pt text.
 *
 * Focus stays in the input when the eye is tapped with a pointer (the button does not take it on
 * pointer-down), so the keyboard does not drop on a phone mid-password.
 */
export const MaskedField = forwardRef<HTMLInputElement, MaskedFieldProps>(function MaskedField(
  { revealable = true, revealed: revealedProp, onRevealedChange, showLabel, hideLabel, disabled, autoComplete, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const [own, setOwn] = useState(false);
  const revealed = revealable && (revealedProp ?? own);

  const toggle = () => {
    const next = !revealed;
    if (revealedProp === undefined) setOwn(next);
    onRevealedChange?.(next);
  };

  return (
    <Field
      ref={ref}
      kit="maskedField"
      type={revealed ? 'text' : 'password'}
      autoComplete={autoComplete ?? 'current-password'}
      spellCheck={false}
      autoCapitalize="off"
      disabled={disabled}
      trailing={
        revealable ? (
          <button
            type="button"
            aria-label={revealed ? (hideLabel ?? t('common.hidePassword')) : (showLabel ?? t('common.showPassword'))}
            aria-pressed={revealed}
            disabled={disabled}
            onPointerDown={(e) => e.preventDefault()}
            onClick={toggle}
            className={cn(
              // auth-2 "Button/reveal": 44 × 44 on the line's end, the 20 pt glyph against its right edge.
              'flex size-11 shrink-0 cursor-pointer items-center justify-end text-text-2',
              '[&_svg]:size-5 [&_svg]:stroke-[1.75]',
              'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)] active:opacity-[var(--pressed-opacity)]',
              'disabled:pointer-events-none disabled:opacity-[var(--disabled-opacity)]',
              'rounded-2 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
            )}
          >
            {revealed ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
          </button>
        ) : undefined
      }
      {...rest}
    />
  );
});
