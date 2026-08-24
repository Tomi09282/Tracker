/**
 * The two-letter stand-in for a face.
 *
 * It was an inline `email.slice(0, 2)` in three places, at three sizes, with three different
 * background tokens — and the redesign puts it on the roster row, on the client detail anchor and
 * in the archive confirmation, so the third copy was about to become the fourth.
 *
 * `aria-hidden` by construction: the e-mail it abbreviates is always rendered beside it, and a
 * screen reader spelling out "A N" before reading the address says the same thing twice, badly.
 *
 * ═══ WHY A `size` PROP AND NOT A `className` ═══════════════════════════════════════════════════
 *
 * `cn` is `twMerge`, and `twMerge` cannot tell a font-size token from a colour token when the
 * scale is custom: it files `text-title-1` and `text-text-1` in the same bucket and keeps only the
 * last one. A `className` escape hatch here would have silently dropped the anchor's type size and
 * rendered a 104px avatar with 15px initials in it. Two fixed sizes, written as literals that
 * never pass through the merger, cannot fail that way.
 *
 * NOT PROMOTED TO `src/ui/` — that directory is frozen for this pass. It belongs there; see the
 * report's `needsShared`.
 */
const SIZES = {
  sm: 'inline-grid size-11 shrink-0 place-items-center rounded-chip bg-surface-2 text-body uppercase text-text-2',
  lg: 'inline-grid size-[104px] shrink-0 place-items-center rounded-chip bg-surface-2 text-title-1 uppercase text-text-1',
} as const;

export function Monogram({ email, size = 'sm' }: { email: string; size?: keyof typeof SIZES }) {
  return (
    <span aria-hidden className={SIZES[size]}>
      {email.slice(0, 2)}
    </span>
  );
}
