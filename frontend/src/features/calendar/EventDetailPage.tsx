import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Bell, MapPin, Repeat } from 'lucide-react';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Rule } from '../../ui/data/Rule';
import { ConfirmSheet } from '../../ui/feedback/ConfirmSheet';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { useToast } from '../../ui/feedback/ToastHost';
import { TextLink } from '../../ui/primitives/TextLink';
import { ApiError } from '../../lib/api';
import type { CalendarEvent, DayKey } from '../../lib/lifeos-api';
import { useCalendarEvent, useDeleteEvent } from './calendarApi';
import { reminderLine, ruleTitle, untilDay, weekdayMonthDay } from './calendarFormat';
import { EventSheet } from './EventSheet';
import { TightSection } from './TightSection';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One event, pushed from a Naptár agenda row — frame `lifeos/event-detail` (design round B, Figma
 * 175:901; `event-detail.part.js` on the kit):
 *
 *   header       pushed "‹ NAPTÁR", the event's title, "Szerkesztés" as the header's text link
 *   when         the day as the eyebrow ("SZOMBAT, OKTÓBER 24.", the occurrence the row was opened
 *                on, else the next one), 8 under it the range as `num` figures (the start `text-1`,
 *                "– 10:00" `text-3`, as the agenda's time column), 8 under it the length in mono
 *   RÉSZLETEK    kit list rows with 20 pt lead glyphs: the place (pin; its first part the title, the
 *                rest the sub), the rule (repeat; "Minden héten, szombaton" over "December 19-ig ·
 *                még 9 alkalom"), the reminders (bell; "15 perccel és 1 nappal előtte" over
 *                "Értesítés a csengő alatt" — the plan's no-push honesty)
 *   JEGYZET      the notes in `body`
 *   danger zone  a rule, then "Esemény törlése" as danger text; it asks first (ConfirmSheet). Every
 *                occurrence goes with the event: api.md has no single-occurrence delete, so the
 *                sheet offers no "Csak ez az alkalom" (round B README question 5, answered by the API)
 *
 * No pill. Behaviour the frame does not draw: an all-day event ("EGÉSZ NAP", and the run of days),
 * an event with no place / rule / reminders / notes (the row or section is simply not there),
 * loading, a failed read ("Újra"), a missing event (404 — another account's event is the same) and a
 * failed delete (a toast; the sheet closes, the event stays).
 */
export function EventDetailPage() {
  const { id: idParam } = useParams();
  const [params] = useSearchParams();
  const id = idParam && /^\d{1,9}$/.test(idParam) ? Number(idParam) : null;
  const onParam = params.get('on');
  const on: DayKey | null = onParam && DAY_RE.test(onParam) ? onParam : null;
  const { t } = useTranslation();
  const query = useCalendarEvent(id, on);
  const notFound = id === null || (query.error instanceof ApiError && query.error.status === 404);
  const event = query.data?.event;
  const [editing, setEditing] = useState(false);

  return (
    <Screen top="push">
      <ScreenHeader
        kind="push"
        title={event?.title ?? (notFound ? undefined : '')}
        trailing={
          event ? (
            <TextLink aria-haspopup="dialog" onClick={() => setEditing(true)}>
              {t('calendar.detail.edit')}
            </TextLink>
          ) : undefined
        }
      />
      {notFound ? (
        <NoticeLine tone="danger" role="alert" action={<TextLink to="/calendar">{t('calendar.title')}</TextLink>}>
          {t('calendar.detail.missing')}
        </NoticeLine>
      ) : query.isError && !event ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11" onClick={() => void query.refetch()} busy={query.isFetching}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('calendar.failed')}
        </NoticeLine>
      ) : !event ? (
        <RowStack as="div">
          {[0, 1, 2].map((i) => (
            <ListRowSkeleton key={i} sub index={i} />
          ))}
        </RowStack>
      ) : (
        <EventDetail event={event} />
      )}
      <EventSheet target={editing && event ? { mode: 'edit', event } : null} onClose={() => setEditing(false)} />
    </Screen>
  );
}

/** "Hajós Alfréd Nemzeti Sportuszoda · Budapest, Margitsziget" → the place over the rest. */
function splitPlace(location: string): { title: string; sub: string | null } {
  const at = location.indexOf(' · ');
  return at > 0 ? { title: location.slice(0, at), sub: location.slice(at + 3) } : { title: location, sub: null };
}

function EventDetail({ event }: { event: CalendarEvent }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const navigate = useNavigate();
  const { toast } = useToast();
  const remove = useDeleteEvent();
  const [asking, setAsking] = useState(false);

  // The occurrence the row was opened on, else the next one, else the event's own first.
  const occ = event.occurrence ?? event.next;
  const day = occ?.date ?? event.date;
  const allDay = event.allDay;
  const startTime = occ ? occ.startTime : event.startTime;
  const endTime = occ ? occ.endTime : event.endTime;
  const minutes = occ?.durationMinutes ?? event.durationMinutes;
  const lengthWord = allDay
    ? event.endDate !== event.date
      ? t('calendar.form.days', { count: daySpan(event.date, event.endDate) })
      : null
    : minutes !== null && minutes > 0
      ? minutes > 120 && minutes % 60 === 0
        ? t('calendar.form.hours', { count: minutes / 60 })
        : t('calendar.form.minutes', { count: minutes })
      : null;

  const place = event.location ? splitPlace(event.location) : null;
  const rule = event.recurrence ? ruleTitle(event.recurrence, event.date, locale, t) : null;
  const ruleSub = event.recurrence
    ? [event.untilDate ? t('calendar.detail.until', { date: untilDay(event.untilDate, locale) }) : null, event.remaining !== null ? t('calendar.detail.remaining', { count: event.remaining }) : null]
        .filter(Boolean)
        .join(' · ') || null
    : null;
  const reminders = reminderLine(event.reminders, locale, t);

  return (
    <>
      <div className="flex w-full flex-col gap-2">
        <p className="text-eyebrow text-text-2 uppercase">{weekdayMonthDay(day, locale)}</p>
        {allDay ? (
          <p className="text-num text-text-1 uppercase">{t('calendar.allDay')}</p>
        ) : (
          <p className="flex items-baseline gap-3 text-num" aria-label={endTime ? `${startTime} – ${endTime}` : (startTime ?? '')}>
            <span className="text-text-1">{startTime}</span>
            {endTime ? (
              <>
                <span aria-hidden className="text-text-3">
                  –
                </span>
                <span className="text-text-3">{endTime}</span>
              </>
            ) : null}
          </p>
        )}
        {lengthWord ? <p className="text-data text-text-2">{lengthWord}</p> : null}
      </div>

      {place || rule || reminders ? (
        <TightSection title={t('calendar.detail.details')}>
          <RowStack>
            {place ? <ListRow lead={<MapPin />} title={place.title} sub={place.sub ?? undefined} /> : null}
            {rule ? <ListRow lead={<Repeat />} title={rule} sub={ruleSub ?? undefined} /> : null}
            {reminders ? <ListRow lead={<Bell />} title={reminders} sub={t('calendar.detail.bell')} /> : null}
          </RowStack>
        </TightSection>
      ) : null}

      {event.notes ? (
        <Section title={t('calendar.detail.notes')}>
          <p className="whitespace-pre-line text-body text-text-1">{event.notes}</p>
        </Section>
      ) : null}

      <div className="flex w-full flex-col gap-2">
        <Rule />
        <TextLink text="body" weight="medium" tone="danger" className="self-start" aria-haspopup="dialog" onClick={() => setAsking(true)}>
          {t('calendar.detail.delete')}
        </TextLink>
      </div>

      <ConfirmSheet
        open={asking}
        onClose={() => setAsking(false)}
        title={t('calendar.detail.deleteTitle')}
        message={event.recurrence ? t('calendar.detail.deleteAll') : undefined}
        confirmLabel={t('common.delete')}
        busy={remove.isPending}
        onConfirm={() =>
          remove.mutate(event.id, {
            onSuccess: () => {
              setAsking(false);
              void navigate('/calendar', { replace: true });
            },
            onError: () => {
              setAsking(false);
              toast(t('calendar.failed'), 'error');
            },
          })
        }
      />
    </>
  );
}

function daySpan(a: DayKey, b: DayKey): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by ?? 0, (bm ?? 1) - 1, bd ?? 1) - Date.UTC(ay ?? 0, (am ?? 1) - 1, ad ?? 1)) / 86_400_000) + 1;
}
