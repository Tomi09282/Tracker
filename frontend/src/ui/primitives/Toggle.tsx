import { Chip } from './ChipRow';

export interface ToggleProps {
  /** The option is chosen. */
  on: boolean;
  /** The word (already translated). */
  label: string;
  onToggle: () => void;
  /** The option cannot be changed right now: 40 %. */
  disabled?: boolean;
  /** A save of this option is in flight: three dots over the word. */
  busy?: boolean;
}

/**
 * A multi-select chip — one of several independent choices (equipment, a sex option that can be
 * left unanswered). The kit's `chipRow` word with the lime mark, `role="checkbox"` +
 * `aria-checked`: a screen reader hears "checked / not checked", which is what the choice is.
 *
 * Put several in a `ChipRow wrap`; alone, in a call site's own `gap-tight` row, the words still
 * stand 24 apart (see `ChipRow.tsx`). Reference: docs/pipeline/pulse/kit/selection.md.
 */
export function Toggle({ on, label, onToggle, disabled, busy }: ToggleProps) {
  return (
    <Chip role="checkbox" selected={on} onClick={onToggle} disabled={disabled} busy={busy}>
      {label}
    </Chip>
  );
}
