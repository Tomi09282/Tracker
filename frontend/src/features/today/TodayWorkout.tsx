import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Dot } from '../../ui/data/Dot';
import { ListRow } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Section } from '../../ui/data/SectionHeader';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { useCurrentWorkout, useStartWorkout } from '../workout/useWorkout';
import { nextDay, signed } from './model';
import { useTodayPlan, useWeekPlan, type TodayDay } from './useTodayPlan';

/**
 * MAI EDZÉS — frames ma-1 / ma-3 / ma-4 (`workoutSect` of `ma.common.js`: home-1's block 1:1 with
 * "+30 érme") and ma-2 (the rest day). The behaviour is the Kezdőlap's, moved here unchanged:
 *
 *   section head     "MAI EDZÉS" + ONE trailing: the meta "18:00 · 5 gyakorlat" (time in ink), or
 *                    the live dot + "Edzés folyamatban" / "Kész"
 *   the day          its name in display-XL, the plan in body (+ " · +30 érme" — what the server's
 *                    rules pay for a full workout, while it is still to do)
 *   THE lime pill    Indítás (a session to start) or Folytatás (one running) — the screen's only pill
 *
 * Undrawn states, in the same language (owner answer Q4):
 * · A rest day (ma-2): "Pihenőnap" as the day, and tomorrow's session from the week query
 *   ("Holnap: Alsótest – guggolás · 18:00"); no action.
 * · Already trained: the day and the plan, the lit dot + "Kész"; no action.
 * · Several sessions today: the first one still to do is the subject; the others are rows under
 *   it, each with its own "Indítás" as a text link — one pill per screen.
 * · Nothing scheduled: the empty state (title + one line), no action — the Gyakorlatok row at the
 *   end of Ma is the way to the library.
 * · Starting: every Indítás is busy together (one shared mutation). A failed start is silent.
 * · Loading: blocks where the lines will be.
 */
export function TodayWorkout({ pointsFull }: { pointsFull: number | null }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const today = useTodayPlan();
  const current = useCurrentWorkout();
  const start = useStartWorkout();

  const days = today.data?.days ?? [];
  const live = current.data?.log ?? null;
  const subject = days.find((d) => !d.is_rest && d.log_id == null) ?? days[0] ?? null;
  const others = days.filter((d) => d !== subject);
  const restDay = !live && subject != null && subject.is_rest === 1;

  // Tomorrow, for the rest-day line: the week window from tomorrow, its first day.
  const tomorrow = today.data?.date ? nextDay(today.data.date) : null;
  const week = useWeekPlan(restDay ? tomorrow : null, 1);
  const next = (week.data?.occurrences ?? []).find((o) => o.date === tomorrow && !o.is_rest) ?? null;

  const begin = async (day: TodayDay) => {
    await start.mutateAsync({ plan_day_id: day.day_id });
    void navigate('/workout');
  };

  // "18:00 · 5 gyakorlat": the time in ink, the rest quiet (the frame's two fills of one line).
  const meta = (day: TodayDay): ReactNode => (
    <span className="text-data text-text-1">
      {day.start_time ? day.start_time : null}
      <span className="text-text-2">
        {day.start_time ? ' · ' : null}
        {t('home.exerciseCount', { count: day.exercise_count })}
      </span>
    </span>
  );

  const status = (): ReactNode => {
    if (live) return <LiveStatus>{t('home.inProgress')}</LiveStatus>;
    if (!subject || subject.is_rest) return null;
    if (subject.log_id != null) return <LiveStatus>{t('home.done')}</LiveStatus>;
    return meta(subject);
  };

  if (today.isPending) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  // Empty AND error: a client who cannot be told what is scheduled needs the same way out as one
  // with nothing scheduled (the Kezdőlap's rule).
  if (!live && !subject) {
    return (
      <Section title={t('home.todayTitle')}>
        <EmptyState title={t('home.emptyTitle')} body={t('home.emptyBody')} />
      </Section>
    );
  }

  const pays = (day: TodayDay) =>
    pointsFull !== null && pointsFull > 0 && !day.is_rest && day.log_id == null
      ? ` · ${t('today.coins', { value: signed(pointsFull, i18n.language) })}`
      : '';

  return (
    <Section title={t('home.todayTitle')} trailing={status()}>
      <div className="flex flex-col gap-5">
        {live ? (
          // A session already running outranks the schedule and takes the screen's only pill.
          <>
            <p className="text-display-xl break-words text-text-1">{live.title ?? t('workout.freestyle')}</p>
            <Pressable variant="primary" size="lg" className="w-full" onClick={() => void navigate('/workout')}>
              {t('home.resume')}
            </Pressable>
          </>
        ) : subject ? (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-display-xl break-words text-text-1">{restDay ? t('home.restDay') : subject.day_name}</p>
              <p className="text-body text-text-2">
                {restDay && next
                  ? `${t('today.tomorrow', { name: next.day_name })}${next.start_time ? ` · ${next.start_time}` : ''}`
                  : `${subject.plan_name}${pays(subject)}`}
              </p>
            </div>
            {!subject.is_rest && subject.log_id == null ? (
              <Pressable
                variant="primary"
                size="lg"
                className="w-full"
                busy={start.isPending}
                // A session already running would be RESUMED by the server rather than replaced,
                // so "start" would be a lie about what the tap does.
                disabled={live != null}
                onClick={() => void begin(subject)}
              >
                {t('home.start')}
              </Pressable>
            ) : null}
            {others.length > 0 ? (
              <RowStack>
                {others.map((day) => (
                  <ListRow
                    key={`${day.plan_id}-${day.day_id}-${day.slot}`}
                    title={day.day_name}
                    sub={day.plan_name}
                    value={day.is_rest || day.log_id != null ? undefined : meta(day)}
                    trailing={
                      day.is_rest ? (
                        <span className="text-cap text-text-2">{t('home.restDay')}</span>
                      ) : day.log_id != null ? (
                        <LiveStatus>{t('home.done')}</LiveStatus>
                      ) : undefined
                    }
                    control={
                      !day.is_rest && day.log_id == null ? (
                        <TextLink busy={start.isPending} disabled={live != null} onClick={() => void begin(day)}>
                          {t('home.start')}
                        </TextLink>
                      ) : undefined
                    }
                  />
                ))}
              </RowStack>
            ) : null}
          </>
        ) : null}
      </div>
    </Section>
  );
}

/** A status that is lit: the 6 pt lime dot and the words in ink (kit: "Status/live"). */
function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-cap-m text-text-1">
      <Dot tone="live" />
      {children}
    </span>
  );
}
