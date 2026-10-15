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
  /** Placement only. */
  className?: string;
  /** For the kit specimen and captures only: hold the pressed look or the focus ring. */
  'data-force'?: 'pressed' | 'focus';
}

/**
 * A binary on/off switch — the kit's `uiSwitch` (Pulse System §4 "Switch"; figma-build/app-kit.js
 * line 238; measured box: `_components.json`, cell "uiSwitch · on / off / disabled").
 *
 * The one control in Pulse that is a shape: a 48 × 28 track, fully round (14), a 22 pt knob 3 in
 * from the edge. On: `accent` track, knob in the canvas (`accent-fg`). Off: `surface-3` track,
 * knob in `text-2`. Disabled: 40 % — its reason is the row's sub line. No shadow on the knob.
 *
 * A REAL `role="switch"` with `aria-checked`, not a styled checkbox with a hidden input: a screen
 * reader announces it as "on / off", which is true of a setting that takes effect at once.
 *
 * NOTHING SLIDES (Pulse §2.4 "Ignite"). A change is the fill and the knob lighting up where they
 * land: the track's colour and the knob on either side cross-fade in `--duration-fast`. Reduced
 * motion: instant.
 *
 * THE TARGET IS 48 × 44, THE LAYOUT 48 × 28: the button is the track's width and the 44 pt floor
 * high, the track centred in it, and the 16 above and below are given back in negative margins — a
 * switch at the end of a row ends on the row's right edge and does not make the row taller. The focus ring
 * is drawn around the track (2 off it), where the eye is, not around the invisible frame.
 *
 * `data-kit="uiSwitch"` is on the track — the box the Figma layer `Switch/…` measures.
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
  'data-force': force,
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
      data-force={force}
      onClick={() => onChange(!checked)}
      className={cn(
        // 48 x 44 is the target; `-my-2` gives the 16 back, so the LAYOUT is the 48 x 28 track and a
        // row holding a switch keeps the 56 of a plain row (the board's "Beszédhang" row).
        'group relative -my-2 flex h-11 w-12 shrink-0 items-center outline-none',
        'cursor-pointer disabled:cursor-not-allowed',
        // Pressed is 60 %, as for rows and links; no scale — only the pill moves.
        'enabled:active:opacity-[var(--pressed-opacity)] data-[force=pressed]:opacity-[var(--pressed-opacity)]',
        'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        className,
      )}
    >
      <span
        aria-hidden
        data-kit="uiSwitch"
        className={cn(
          'relative block h-7 w-12 rounded-full',
          checked ? 'bg-accent' : 'bg-surface-3',
          'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none',
          'group-disabled:opacity-[var(--disabled-opacity)]',
          // The focus ring around the track. `outline-solid` is explicit: in Tailwind 4 an
          // `outline-none` elsewhere would leave a 2 px outline of style none (see Segment).
          'group-focus-visible:outline-2 group-focus-visible:outline-solid group-focus-visible:outline-offset-2 group-focus-visible:outline-[var(--focus-ring)]',
          'group-data-[force=focus]:outline-2 group-data-[force=focus]:outline-solid group-data-[force=focus]:outline-offset-2 group-data-[force=focus]:outline-[var(--focus-ring)]',
        )}
      >
        {/* Two knobs, one lit: the off knob on the left, the on knob on the right. */}
        <span
          data-kit-part="knob"
          className={cn(
            'absolute left-[3px] top-[3px] size-[22px] rounded-full bg-text-2',
            'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none',
            checked ? 'opacity-0' : 'opacity-100',
          )}
        />
        <span
          data-kit-part="knob"
          className={cn(
            'absolute right-[3px] top-[3px] size-[22px] rounded-full bg-accent-fg',
            'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none',
            checked ? 'opacity-100' : 'opacity-0',
          )}
        />
      </span>
    </button>
  );
}
