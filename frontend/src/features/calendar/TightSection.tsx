import { useId, type ReactNode } from 'react';
import { Rule } from '../../ui/data/Rule';
import { SectionHeader } from '../../ui/data/SectionHeader';

/**
 * The kit `sect` with round B's calendar spacing: `sect(content, title, { gap: 8 })` in
 * `cfk.common.js` / `event-detail.part.js` stands EVERY part 8 apart — the strong rule, the head and
 * the content (the kit `Section` stands them 16 apart, its default). Measured on the frames:
 * calendar-1 rule y 308.5 → "SZERDA, OKTÓBER 21." centre 327.5 → the first agenda row's time 367.5;
 * event-detail rule → "RÉSZLETEK" → the place row the same.
 *
 * The parts are the kit's own (`Rule strong`, `SectionHeader` without its rule); only the gap is
 * this frame's.
 */
export function TightSection({ title, trailing, children }: { title: string; trailing?: ReactNode; children?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex w-full flex-col gap-2">
      <Rule strong />
      <SectionHeader title={title} titleId={id} trailing={trailing} rule={false} />
      {children}
    </section>
  );
}
