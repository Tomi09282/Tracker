import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow } from '../../ui/data/ListRow';
import { TextLink } from '../../ui/primitives/TextLink';
import type { NextEvent } from '../../lib/lifeos-api';

/**
 * KÖVETKEZŐ — the next event on Ma, mounted by `features/today/TodayPage.tsx` (request
 * R-S-calendar-03; the section is the calendar's, so its words live here). Frame `lifeos/ma-1`,
 * `ma-1.part.js`: `sect('Következő', { tr: textLink('Naptár', { trail: 'chev' }) })` over one kit
 * list row: the title, the place in the sub line, the start as the mono value, the chevron.
 * Package S-calendar, plan Phase 5.
 *
 * `GET /lifeos/today` → `nextEvent`: the next occurrence that STARTS after now within 7 calendar
 * days, or null — then the section is not drawn (no teaser, D3). An event on another day than
 * today names its weekday before the place ("Szerda · Trattoria Toscana"); an all-day event says
 * "Egész nap" instead of a clock. The row opens the event on that day; "Naptár ›" opens the tab.
 *
 * The frame's "· emlékeztető 18:30" is the event's first reminder (`nextEvent.firstReminder`, B-lifeos-polish):
 * drawn when the server sends one, never otherwise.
 */
export function NextEventSection({ next, today }: { next: NextEvent | null | undefined; today: string | null }) {
  const { t, i18n } = useTranslation();
  if (!next) return null;
  const weekday =
    today && next.date !== today
      ? (() => {
          const [y, m, d] = next.date.split('-').map(Number);
          const word = new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1));
          return word.charAt(0).toLocaleUpperCase(i18n.language) + word.slice(1);
        })()
      : null;
  // The first reminder, when the event has one ("Trattoria Toscana · emlékeztető 18:30"): the server's wall-clock time (B-lifeos-polish).
  const reminder = next.firstReminder ? t('habits.reminderAt', { time: next.firstReminder.time }) : null;
  const sub = [weekday, next.location, reminder].filter(Boolean).join(' · ') || undefined;
  return (
    <Section
      title={t('calendar.next.title')}
      trailing={
        <TextLink to="/calendar" trail={<ChevronRight />}>
          {t('calendar.title')}
        </TextLink>
      }
    >
      <RowStack>
        <ListRow
          title={next.title}
          sub={sub}
          value={next.allDay ? t('calendar.allDay') : (next.startTime ?? undefined)}
          to={`/calendar/events/${next.eventId}?on=${next.date}`}
          chevron
        />
      </RowStack>
    </Section>
  );
}
