import { Loader2 } from 'lucide-react';
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
  { className, variant, shape, density, selected, busy = false, icon, children, disabled, type, ...rest },
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
      className={cn(control({ variant, shape, density, selected }), 'relative', className)}
      {...rest}
    >
      {/* BUSY SWAPS THE LABEL FOR A SPINNER AND KEEPS THE BOX.
          `busy` set `aria-busy` and `disabled` and nothing else, so a submitting `Belépek` was a
          dimmed button with its label still on it — indistinguishable from a button that is simply
          not available, which is the one reading it must never have. The screen-reader half was
          already correct and the visible half said nothing.

          The children stay in the flow under `invisible`, so the button holds its exact width and
          the row it sits in does not reflow at the moment the user is waiting to see whether
          anything happened. The spinner is absolutely centred over that reserved space.

          `motion-reduce:animate-none` because a spinner is the one indicator that must not vanish
          under reduced motion — a still ring beside `aria-busy` still says "working", where nothing
          at all would say "broken". */}
      {busy ? (
        <Loader2
          aria-hidden
          className="absolute size-icon-m animate-spin motion-reduce:animate-none"
          strokeWidth={2}
        />
      ) : null}
      <span className={cn('contents', busy && 'invisible')}>
        {icon}
        {children}
      </span>
    </button>
  );
});
