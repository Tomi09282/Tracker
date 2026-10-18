import { useTranslation } from 'react-i18next';
import { NotificationBell } from '../chat/NotificationBell';
import { ListRow } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Pic } from '../../ui/media/Pic';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { LedgerLine } from './LedgerLine';
import { dayCount, dayLabel, earnedTodayMinor } from './model';
import { TodayHabits, TodayHabitsSkeleton } from './TodayHabits';
import { TodayHero } from './TodayHero';
import { TodayNutrition } from './TodayNutrition';
import { TodayTasks, type CaptureDoor } from './TodayTasks';
import { TodayWorkout } from './TodayWorkout';
import { useLifeosToday } from './useLifeosToday';

/**
 * Ma — the first tab, at `/`. Frames `lifeos/ma-1` (a training day), `ma-2` (a rest day with
 * everything done), `ma-3` (a brand-new user), `ma-4` (the daily draw pending), design round B
 * (approved 2026-10-18). It replaces the Kezdőlap: the plan's session, the day's food and the door
 * to the library live on here, beside the day's habits and tasks.
 *
 * ═══ THE COMPOSITION OF THE FRAMES (`figma-build/lifeos/ma-*.part.js` on `ma.common.js`) ═══════
 *
 *   Screen top="root"          the scaffold: header at y 72, blocks 32 apart
 *   ScreenHeader greet         "Szia!" + the logical day ("Hétfő, október 19."), the bell
 *   LedgerLine (8 under)       coin · "190 ÉRME · SZINT 4" · the XP bar · › — the door to Érmék
 *   TodayHero                  "MA" + the giant "3/10", "Ma eddig +18 ÉRME", the day bar, the caption
 *   TodayWorkout               MAI EDZÉS with THE lime pill (Indítás / Folytatás)
 *   TodayHabits                SZOKÁSOK (Összes ›): tap to log
 *   TodayTasks                 FELADATOK (Rögzítés +): tap to complete, "Kész ma · 2 ›"
 *   TodayNutrition             TÁPLÁLKOZÁS (Megnyitás ›): Kalória, Fehérje
 *   the library row            "Gyakorlatok" with the barbell still, last (owner, 2026-10-17)
 *
 * NOT YET: NAPI DOBÁS (the daily challenge, plan phase 4), FÓKUSZ (phase 6) and KÖVETKEZŐ (the next
 * event, phase 5) have no server yet, so they are not drawn — no teaser, no placeholder (D3: never a
 * control that does nothing). ma-4's draw is therefore not reachable; its other blocks are.
 *
 * ═══ DATA ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `GET /lifeos/today` (useLifeosToday) carries the wallet, the workout flags, the habits and the
 * tasks; the plan's session is the Kezdőlap's own query (`/my-plans/today`, useTodayPlan) because
 * starting a workout needs its plan day. A backend before migration 032 sends no habits / tasks:
 * those two sections are then not drawn and the hero counts the workout alone.
 *
 * A failed LifeOS read: the ledger line and the hero print the dash (the danger line with "Újra" under
 * the hero) and the habit / task sections wait — the session, the food and the library still work.
 *
 * "Rögzítés" goes to the tasks page (`capture`, default `/tasks`) until S-tasks' capture sheet is
 * merged; request R-S-ma-02 then opens the sheet over Ma instead.
 */
export function TodayPage({ capture = { to: '/tasks' } }: { capture?: CaptureDoor }) {
  const { t, i18n } = useTranslation();
  const lifeos = useLifeosToday();
  const day = lifeos.data;

  // The APP's language, not the browser's, and the LOGICAL day (a day that starts at 04:00 is still
  // yesterday at 02:00) once the server has said which day it is.
  const date = dayLabel(day?.today ?? null, i18n.language);
  const count = day ? dayCount(day) : null;
  const timeZone = day?.timezone ?? null;

  return (
    <Screen top="root">
      {/* Header and ledger line are one group, 8 apart (`maHeader`). No page title: the lit tab says where you are. */}
      <div className="flex flex-col gap-2">
        <ScreenHeader
          kind="greet"
          title={t('home.greeting')}
          sub={<span className="block truncate first-letter:uppercase">{date}</span>}
          trailing={<NotificationBell />}
        />
        <LedgerLine wallet={day?.wallet} failed={lifeos.isError && !day} />
      </div>

      <TodayHero
        count={count}
        earnedMinor={day ? earnedTodayMinor(day) : null}
        pending={lifeos.isPending}
        failed={lifeos.isError && !day}
        onRetry={() => void lifeos.refetch()}
      />

      <TodayWorkout pointsFull={day?.workout.due ? day.workout.pointsFull : null} />

      {lifeos.isPending ? (
        <TodayHabitsSkeleton />
      ) : day ? (
        <>
          <TodayHabits habits={day.habits ?? null} timeZone={timeZone} />
          <TodayTasks tasks={day.tasks ?? null} today={day.today} timeZone={timeZone} onCapture={capture} />
        </>
      ) : null}

      <TodayNutrition date={todayLocal()} />

      {/* The permanent way to the exercise library (D2), last on Ma (owner, 2026-10-17; round B
          draws it with the barbell still and a line saying what is there). */}
      <RowStack open>
        <ListRow
          lead={<Pic slot="equip-barbell" width={48} />}
          title={t('nav.library')}
          sub={t('today.librarySub')}
          to="/library"
          chevron
        />
      </RowStack>
    </Screen>
  );
}

/** Local calendar day — the nutrition screen's own day key (toISOString() is UTC). */
function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
