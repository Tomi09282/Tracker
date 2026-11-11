import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { Dot, type DotTone } from '../../../ui/data/Dot';
import type { AdminPostState } from './adminPostsApi';

/** "2026. 10. 02." and "2026. 10. 30. 18:00": an epoch-second instant, in the reader's language. */
export function useStamp() {
  const { i18n } = useTranslation();
  return {
    date: (s: number) =>
      new Date(s * 1000).toLocaleDateString(i18n.language, { year: 'numeric', month: '2-digit', day: '2-digit' }),
    /** `zone`: the zone an event happens in (an IANA name from the server); an admin's own clock otherwise. */
    dateTime: (s: number, zone?: string | null) => {
      const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
      try {
        return new Date(s * 1000).toLocaleString(i18n.language, zone ? { ...opts, timeZone: zone } : opts);
      } catch {
        return new Date(s * 1000).toLocaleString(i18n.language, opts);
      }
    },
  };
}

/** The kind of a post in words ("Esemény"); a kind the bundle does not know is shown as the server sent it. */
export function useKindLabel() {
  const { t } = useTranslation();
  return (kind: string) => t(`marketplace.kind.${kind}`, { defaultValue: kind });
}

/**
 * The state of a post: a 6 pt dot and the state word in `micro` (admin-market-v2). The dot carries the
 * state without colour doing all the work: live is a filled mark, a draft is a ring, a withdrawn post
 * is grey and a taken-down one is red. `lamp` makes the live dot the lime one — only the post page does
 * that, where it is the screen's one lime shape; in the list it is ink.
 */
export function PostStateTag({ state, lamp = false, className }: { state: AdminPostState; lamp?: boolean; className?: string }) {
  const { t } = useTranslation();
  const tone: DotTone = state === 'live' ? (lamp ? 'live' : 'ink') : state === 'draft' ? 'ring' : state === 'withdrawn' ? 'quiet' : 'danger';
  return (
    <span data-state={state} className={cn('inline-flex items-center gap-1.5', className)}>
      <Dot tone={tone} />
      <span className={cn('whitespace-nowrap text-micro', state === 'removed' ? 'text-danger' : state === 'live' ? 'text-text-1' : 'text-text-2')}>
        {t(`adminPosts.state.${state}`)}
      </span>
    </span>
  );
}
