import { cn } from '../../lib/cn';

export interface CheckMarkProps {
  /** Done (a set logged, the chosen option): the bare lime tick. Otherwise the ring. */
  done: boolean;
  /** Placement only. */
  className?: string;
}

/**
 * The set check and the radio mark of a single-choice list — the kit's `setCheck` (Pulse System §4
 * "Set check"; figma-build/app-kit.js line 239; measured box: `_components.json`, cell
 * "setCheck · done (lime tick) / to do (ring)").
 *
 * A 44 pt frame with the mark centred: to do = a 24 pt ring, 1.5 pt `edge`; done = the bare Lucide
 * tick at 24, stroke 2.5, in `accent` — no disc, no box. A change is an ignite: the tick and the
 * ring cross-fade in `--duration-fast` where they are; nothing scales or slides. Reduced motion:
 * instant.
 *
 * A PICTURE, NOT A CONTROL. It is `aria-hidden` and takes no input: the button or the row around it
 * carries the role and the state (`aria-checked` on a radio row, the set row's own check button),
 * the pressed look, the focus ring and the 44 pt target. Reference: docs/pipeline/pulse/kit/selection.md.
 */
export function CheckMark({ done, className }: CheckMarkProps) {
  return (
    <span aria-hidden data-kit="setCheck" className={cn('relative inline-block size-11 shrink-0', className)}>
      <span
        data-kit-part="ring"
        className={cn(
          'absolute left-2.5 top-2.5 size-6 rounded-full border-[1.5px] border-edge',
          'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none',
          done ? 'opacity-0' : 'opacity-100',
        )}
      />
      <svg
        data-kit-part="tick"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          'absolute left-2.5 top-2.5 size-6 text-accent',
          'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none',
          done ? 'opacity-100' : 'opacity-0',
        )}
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}
