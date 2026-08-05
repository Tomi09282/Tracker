import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { control, type ControlVariants } from './control';

export interface PressableProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>,
    ControlVariants {
  className?: string;
  /** Renders the busy state: keeps the size, blocks input, announces to assistive tech. */
  busy?: boolean;
  /** Leading icon. Sized by the caller from the icon tokens (16 / 20 / 24). */
  icon?: ReactNode;
  children?: ReactNode;
}

/**
 * The single interactive primitive. Buttons, icon buttons, filter chips and menu triggers are
 * all this component with different variants — which is what makes the 44 px floor and the
 * five interaction states impossible to forget.
 *
 * Raw `<button>` elements are rejected by `check-tokens.mjs` outside `src/ui/`, so there is no
 * second path.
 */
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  { className, variant, shape, density, busy = false, icon, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // Explicit default: an unspecified button inside a form submits it, which has caused more
      // accidental submissions than any other HTML default.
      type={type ?? 'button'}
      // aria-busy drives both the styling and the screen-reader announcement from one source.
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={cn(control({ variant, shape, density }), className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});
