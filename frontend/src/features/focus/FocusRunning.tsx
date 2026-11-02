import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/shell/Screen';
import { Dock } from '../../ui/shell/Dock';
import { Countdown } from '../../ui/data/Countdown';
import { Dot } from '../../ui/data/Dot';
import { ProgressBar } from '../../ui/data/ProgressBar';
import { Section } from '../../ui/data/SectionHeader';
import { ConfirmSheet } from '../../ui/feedback/ConfirmSheet';
import { useToast } from '../../ui/feedback/ToastHost';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import type { FocusFinishResponse, FocusSession } from '../../lib/lifeos-api';
import { useCancelFocus, useFinishFocus, useFocusCheckin, useFocusCurrent, type FocusCurrent } from './focusApi';
import { useServerNow } from './focusClock';
import { ratio } from './focusFormat';

/**
 * focus-2 — the running block (`figma-build/lifeos/focus-2.body.js`). No header: the screen opens
 * 8 under a root header's line (y 80) with the session itself.
 *
 *   session     the live dot + "FÓKUSZBAN" (micro), the block's title (title 22)
 *   clock       the kit Countdown (fixed-width digit cells, DEV-003), 20 under it the lime progress
 *               line — the screen's live datum — and 8 under that start · "15 / 50 perc" · end, mono
 *   ELLENŐRZÉS  "1 / 3" in the head; "Rajta vagy még? …", the one lime pill "Rajta vagyok" (4 of air)
 *   dock        "Befejezés" (ink) and "Feladás" (danger) as text, above the tab bar; Feladás asks
 *               first in the kit ConfirmSheet (it pays nothing)
 *
 * The countdown is the client timer of `focusClock.ts`, corrected to the server's clock; it runs
 * only while this page is open. When it reaches the end, or the next check-in becomes due, the page
 * reads the block again: the server says whether it ran out and how many check-ins count.
 *
 * Undrawn states, in the same language: a block without check-ins (no ELLENŐRZÉS section); no
 * check-in due yet (the pill is there, off, until the clock earns the next one); every check-in
 * answered (the pill off); a PLANNED block (the dot off, "Következő blokk · 14:00", the whole plan
 * in the pending tone; Befejezés is not offered — the server refuses to finish a block that has not
 * started); a block that RAN OUT while nobody looked (the countdown at 0, the line full, the dot
 * half, "Lejárt az idő": Befejezés pays it, Feladás drops it).
 */
export function FocusRunning({
  current,
  session,
  onFinished,
}: {
  current: FocusCurrent;
  session: FocusSession;
  onFinished: (result: FocusFinishResponse) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const query = useFocusCurrent();
  const checkin = useFocusCheckin();
  const finish = useFinishFocus();
  const cancel = useCancelFocus();
  const [confirm, setConfirm] = useState(false);

  const active = session.status === 'active';
  const planned = session.status === 'planned';
  const now = useServerNow(current.now, current.receivedAt, active || planned);

  // The clock crossed a line the server decides on: read the block again, once per line.
  const asked = useRef('');
  const line =
    planned && now >= session.startsAt
      ? `start-${session.id}`
      : active && now >= session.endsAt
        ? `end-${session.id}`
        : active && session.nextCheckinAt !== null && !session.checkinDue && now >= session.nextCheckinAt
          ? `checkin-${session.id}-${session.nextCheckinAt}`
          : '';
  useEffect(() => {
    if (line && asked.current !== line) {
      asked.current = line;
      void query.refetch();
    }
  }, [line, query]);

  const total = Math.max(1, session.endsAt - session.startsAt);
  const left = active ? Math.max(0, Math.ceil(session.endsAt - now)) : planned ? session.plannedMinutes * 60 : 0;
  const share = active ? Math.min(1, Math.max(0, (now - session.startsAt) / total)) : planned ? 0 : 1;
  const elapsed = active
    ? Math.min(session.plannedMinutes, Math.max(0, Math.floor((now - session.startsAt) / 60)))
    : session.elapsedMinutes;
  const due =
    active &&
    session.checkinsDone < session.checkinsMax &&
    (session.checkinDue || (session.nextCheckinAt !== null && now >= session.nextCheckinAt));

  const failed = () => toast(t('focus.writeFailed'), 'error');
  const min = Math.floor(left / 60);
  const sec = left % 60;

  return (
    <Screen top="root">
      <div className="mt-2 flex w-full flex-col gap-2">
        <p className="flex items-center gap-2">
          <Dot tone={active ? 'live' : planned ? 'off' : 'half'} />
          <span className="text-micro text-text-2">
            {active ? t('focus.live') : planned ? `${t('focus.planned')} · ${session.startTime ?? ''}` : t('focus.ended')}
          </span>
        </p>
        <h1 className="text-title text-text-1">{session.title}</h1>
      </div>

      <div className="flex w-full flex-col gap-5">
        <Countdown seconds={left} tone={active ? 'ink' : 'pending'} srText={t('focus.left', { min, sec })} />
        <div className="flex w-full flex-col gap-2">
          <ProgressBar
            value={share}
            tone="accent"
            label={t('focus.title')}
            valueText={t('focus.progress', {
              done: elapsed,
              of: session.plannedMinutes,
            })}
          />
          <p aria-hidden className="flex w-full justify-between text-data">
            <span className="text-text-3">{session.startTime}</span>
            <span className="text-text-2">
              {t('focus.progress', {
                done: elapsed,
                of: session.plannedMinutes,
              })}
            </span>
            <span className="text-text-3">{session.endTime}</span>
          </p>
        </div>
      </div>

      {session.checkinMinutes > 0 && session.checkinsMax > 0 ? (
        <Section
          title={t('focus.checkin')}
          trailing={
            // While a check-in is due the head names the prompt being asked ("1 / 3": the first of
            // three, focus-2); once answered it is the count done — so a tap never moves the figure.
            <span className="text-data text-text-2">
              {ratio(due ? Math.min(session.checkinsMax, session.checkinsDone + 1) : session.checkinsDone, session.checkinsMax)}
            </span>
          }
        >
          {active ? <p className="text-body text-text-1">{t('focus.checkinAsk', { coins: current.rules.checkinPoint })}</p> : null}
          {active ? (
            <div className="pt-1">
              <Pressable
                variant="primary"
                size="lg"
                className="w-full"
                disabled={!due}
                busy={checkin.isPending}
                onClick={() => checkin.mutate(session.id, { onError: failed })}
              >
                {t('focus.checkinCta')}
              </Pressable>
            </div>
          ) : null}
        </Section>
      ) : null}

      <Dock>
        <div className="flex w-full items-center justify-between">
          {planned ? (
            <span />
          ) : (
            <TextLink
              text="body"
              busy={finish.isPending}
              onClick={() =>
                finish.mutate(session.id, {
                  onSuccess: onFinished,
                  onError: failed,
                })
              }
            >
              {t('focus.finish')}
            </TextLink>
          )}
          <TextLink text="body" tone="danger" aria-haspopup="dialog" onClick={() => setConfirm(true)}>
            {t('focus.giveUp')}
          </TextLink>
        </div>
      </Dock>

      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('focus.giveUpTitle')}
        message={t('focus.giveUpBody')}
        confirmLabel={t('focus.giveUp')}
        cancelLabel={t('common.cancel')}
        busy={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(session.id, {
            onSuccess: () => setConfirm(false),
            onError: () => {
              setConfirm(false);
              failed();
            },
          })
        }
      />
    </Screen>
  );
}
