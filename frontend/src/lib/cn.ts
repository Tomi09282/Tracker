import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * THE TYPE STEPS HAVE TO BE DECLARED, OR THE MERGER DELETES THEM.
 *
 * `tailwind-merge` resolves a conflict by deciding which GROUP a class belongs to, and it knows
 * stock Tailwind's names. This project's scale is custom — `text-title-1`, `text-body-s`,
 * `text-caption` — and so are its ink tokens, `text-text-1` / `text-text-2` / `text-text-3`. To an
 * unconfigured merger every one of those is `text-<something>`, so it files them all under
 * text-COLOUR and keeps the last one it sees.
 *
 * Measured before this file was fixed, with the project's own installed tailwind-merge:
 *
 *   cn('text-title-1 tabular-nums', 'text-text-1')  ->  'tabular-nums text-text-1'
 *   cn('text-body-s',               'text-text-2')  ->  'text-text-2'
 *   cn('text-caption',              'text-warning') ->  'text-warning'
 *   cn('text-micro uppercase',      'text-text-3')  ->  'uppercase text-text-3'
 *
 * The size is gone in all four. Every component that composes a type step with an ink token in one
 * `cn()` call has been rendering at the INHERITED body size instead of its declared step — and
 * silently, because the class is dropped at runtime and nothing in the source looks wrong. It was
 * found in `SummaryTile`, whose 26px figure had been rendering at 15px on six screens; the same
 * shape appears wherever a variant picks a colour beside a size.
 *
 * There is no gate for this and there cannot easily be one: the defect lives in a dependency's
 * classification, not in the source text. The defence is this declaration being complete — a type
 * step added to `tokens.css` and not added here is a step that silently does not survive `cn()`.
 *
 * `--text-1`, `--text-2` and `--text-3` are deliberately absent: those are the INK tokens, spelled
 * `text-text-N` at the call site, and they belong in the colour group where the merger already
 * puts them.
 */
const TYPE_STEPS = [
  'display',
  'title-1',
  'title-2',
  'title-3',
  'body',
  'body-s',
  'body-strong',
  'caption',
  'micro',
  'timer',
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // An explicit literal beats the colour group's catch-all validator, which is exactly the
      // disambiguation the merger was missing.
      'font-size': [{ text: [...TYPE_STEPS] }],
    },
  },
});

/**
 * Merge class names with Tailwind conflict resolution.
 *
 * The conflict resolution is what matters: a caller passing `px-6` must actually override the
 * primitive's `px-4` instead of both landing in the class list and the cascade deciding by
 * source order. Without it, component composition silently stops working.
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
