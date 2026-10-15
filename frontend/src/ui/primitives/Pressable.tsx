import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { control, kitName, type ControlVariants } from './control';

export interface PressableProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>,
    ControlVariants {
  className?: string;
  /** Renders the busy state: keeps the size, blocks input, announces to assistive tech. */
  busy?: boolean;
  /**
   * Leading glyph. On a text link it is drawn at 16 px in `text-2` (in the danger colour on a
   * danger link); on the bridged looks it is sized by the caller from the icon tokens.
   */
  icon?: ReactNode;
  /** Trailing glyph — the chevron of an inline link. 16 px, `text-2`, also on a danger link. */
  trail?: ReactNode;
  children?: ReactNode;
}

export interface ControlBodyProps extends Pick<ControlVariants, 'variant' | 'shape' | 'tone'> {
  busy?: boolean;
  icon?: ReactNode;
  trail?: ReactNode;
  children?: ReactNode;
}

/**
 * The inside of a control: lead glyph, label, trail glyph — and the three dots while it is busy.
 *
 * Its own component because a control is not always a `<button>`: the router-link form of the
 * text link (`TextLink`) is an anchor with exactly this inside.
 *
 * BUSY SWAPS THE LABEL FOR THREE DOTS AND KEEPS THE BOX.
 * The children stay in the flow under `invisible`, so the control holds its exact width and the
 * row it sits in does not reflow at the moment the user is waiting to see whether anything
 * happened. The dots are centred over that reserved space: 6 pt each, 6 apart, in the ink of the
 * label, at 100 / 60 / 30 % — the kit's `btnPrimary({ state: 'busy' })`.
 *
 * They ripple left to right on the ambient loop (opacity only). Each dot's animation starts
 * mid-cycle, at the opacity it is drawn with, so a held first frame — a capture, or reduced
 * motion, where the loop goes — is exactly the drawing. Pulse never shows a spinner.
 */
export function ControlBody({ variant, shape, tone, busy = false, icon, trail, children }: ControlBodyProps) {
  // A glyph beside the words of a link is `text-2`; the words carry the action. On a danger link
  // the LEAD glyph belongs to the words and takes their colour, the trail chevron does not.
  const textLink = variant === 'link' && shape !== 'icon';
  const lead = textLink && icon != null ? <span className={cn('contents', tone !== 'danger' && 'text-text-2')}>{icon}</span> : icon;
  const tail = textLink && trail != null ? <span className="contents text-text-2">{trail}</span> : trail;

  return (
    <>
      {busy ? (
        <span aria-hidden data-kit-part="busy" className="absolute inset-0 flex items-center justify-center gap-1.5">
          <i className="size-1.5 rounded-full bg-current animate-busy-1 motion-reduce:animate-none" />
          <i className="size-1.5 rounded-full bg-current opacity-60 animate-busy-2 motion-reduce:animate-none" />
          <i className="size-1.5 rounded-full bg-current opacity-30 animate-busy-3 motion-reduce:animate-none" />
        </span>
      ) : null}
      <span className={cn('contents', busy && 'invisible')}>
        {lead}
        {children}
        {tail}
      </span>
    </>
  );
}

/**
 * The single interactive primitive. The lime pill, the text link, the bare icon button — and, on
 * screens that have not been rebuilt, the bridged buttons, chips and menu triggers — are all this
 * component with different variants, which is what makes the 44 px floor and the interaction
 * states impossible to forget.
 *
 *     <Pressable variant="primary" size="lg">Indítás</Pressable>            the pill (56)
 *     <Pressable variant="primary" size="sm">Küldés</Pressable>             the small pill (44)
 *     <Pressable variant="link" trail={<ChevronRight />}>Megnyitás</Pressable>
 *     <Pressable variant="link" text="body" tone="danger">Kijelentkezés</Pressable>
 *     <Pressable variant="link" shape="icon" aria-label="…"><Bell /></Pressable>
 *
 * A link that NAVIGATES is `TextLink` with `to` — navigation is an anchor.
 *
 * Raw `<button>` elements are rejected by `check-tokens.mjs` outside `src/ui/`, so there is no
 * second path. Reference: docs/pipeline/pulse/kit/actions.md.
 */
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  { className, variant, shape, density, selected, size, tone, text, busy = false, icon, trail, children, disabled, type, ...rest },
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
      // The kit function this control is an instance of — absent on a bridged look. Before
      // `rest`, so a composite that IS another kit component (the header's back button) can
      // name itself.
      data-kit={kitName({ variant, shape, size })}
      className={cn(control({ variant, shape, density, selected, size, tone, text }), 'relative', className)}
      {...rest}
    >
      <ControlBody variant={variant} shape={shape} tone={tone} busy={busy} icon={icon} trail={trail}>
        {children}
      </ControlBody>
    </button>
  );
});
