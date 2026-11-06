import { type ReactNode } from 'react';
import { Link, type To } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Section } from '../../../ui/data/SectionHeader';

/**
 * One fact of the account page (frames `admin-account-detail-*`): the label on the left in `body`
 * `text-2`, the value on the right in mono, a floor of 48 and the hairline of its `RowStack`. With a
 * `to` the whole row is a door and ends in the chevron.
 *
 * It is not a `ListRow`: those stand 56 high and draw their value in `text-2`; the account page is a
 * ledger of read-only facts, 48 a row, with the value in ink - the way the frames set it.
 */
export function FactRow({
  label,
  value,
  big = false,
  tone = 'ink',
  to,
}: {
  label: string;
  value: ReactNode;
  /** `data-l` 16 (a count) instead of `data` 13 (a date, a word). */
  big?: boolean;
  /** `warn`: the value waits for someone to act (a lock-out, a forced change). */
  tone?: 'ink' | 'warn';
  to?: To;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate text-body text-text-2">{label}</span>
      <span className={cn('shrink-0 text-end', big ? 'text-data-l' : 'text-data', tone === 'warn' ? 'text-warning' : 'text-text-1')}>{value}</span>
      {to !== undefined ? <ChevronRight aria-hidden className="-me-1.25 size-4 shrink-0 text-text-3" strokeWidth={1.75} /> : null}
    </>
  );
  const row = 'flex min-h-12 w-full items-center gap-4 py-2.5 text-start';
  return to !== undefined ? (
    <Link
      to={to}
      className={cn(row, 'cursor-pointer transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)] active:opacity-[var(--pressed-opacity)]')}
    >
      {body}
    </Link>
  ) : (
    <div className={row}>{body}</div>
  );
}

/**
 * One line of a coin ledger: the short date in mono `text-3`, the reason in `body` with an optional
 * `cap` note under it, the signed amount in mono at the end. 48 a row, 64 with a note.
 */
export function LedgerLine({
  date,
  title,
  note,
  amount,
  wideDate = false,
}: {
  date: string;
  title: string;
  note?: string | null;
  amount: string;
  /** The date carries its year (the whole ledger): a wider first column. */
  wideDate?: boolean;
}) {
  return (
    <div className={cn('flex w-full items-center gap-3 py-2.5', note ? 'min-h-16' : 'min-h-12')}>
      <span className={cn('shrink-0 text-data text-text-3', wideDate ? 'w-26' : 'w-14')}>{date}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body text-text-1">{title}</span>
        {note ? <span className="truncate text-cap text-text-2">{note}</span> : null}
      </span>
      <span className="shrink-0 text-data-l text-text-1">{amount}</span>
    </div>
  );
}

/**
 * A section of the account page: the kit's section (strong rule, eyebrow, the content), set 8 apart
 * throughout - rule, eyebrow and rows - as the frames draw it (`sect(..., { gap: 8 })`), where the kit's
 * default section stands 16 apart. `gap={8}` sets ALL of it: a `className` gap on the head lost to the
 * kit's own 16 and left every label 8 pt low (review S-admin-accounts 3).
 */
export function AccountSection({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <Section gap={8} title={title} trailing={trailing}>
      {children}
    </Section>
  );
}
