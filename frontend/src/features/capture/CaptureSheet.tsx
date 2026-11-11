import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { DueChips, DueFields, FieldGroup, ZoneDoor, dueOnFor, type DueChoice } from '../tasks/formParts';
import { mintClientKey, retryable, useCreateTask, useLifeosStart, useTasks } from '../tasks/tasksData';
import { mintEventKey, retryable as eventRetryable, useCreateEvent } from '../calendar/calendarApi';
import { captureEventBody, captureEventDay, captureWords } from '../calendar/captureEvent';

/** The server's bound on a task title (`POST /tasks`, api.md). */
const TITLE_MAX = 120;

type TimeMode = 'at' | 'allDay';

/** Where a capture goes (frame capture "Hova?"): a task (POST /tasks) or an event (POST /events). */
type Target = 'task' | 'event';

/**
 * "Van valami a fejedben?" — the quick capture, frame `lifeos/capture` (design round B;
 * `capture.body.js`): the kit bottom sheet, opened by "Rögzítés +" on Ma (package S-ma mounts it;
 * until then `/tasks?capture=1`). Its body 16 apart:
 *
 *   Mi az?        one field, focused, with the frame's example line as its hint
 *   Hova?         WHERE it goes: Feladat / Esemény, an equal-cell segmented switch (S-calendar,
 *                 plan Phase 5: the event half writes `POST /events`). Esemény offers the same Ma ·
 *                 Holnap · Dátum (an event has a day), Időpontban / Egész nap, and the start field
 *                 says "Emlékeztető 1 órával előtte" (the reminder it sets); an event at a time
 *                 lasts an hour, its page edits the rest.
 *   Mikor?        Ma · Holnap · Dátum as lime-marked chips, exactly the frame's three (a task with no
 *                 deadline is made in the task sheet with "Nincs"; the fix round dropped the fourth
 *                 chip "Bármikor" the first build added). Under it: Időpontban / Egész nap (a hug
 *                 segmented switch) — "Időpontban" adds the time (api.md: "Ma / Holnap / Dátum
 *                 are `dueOn`, Időpontban adds `dueTime`")
 *   Dátum + time  the pair of 165 pt fields (the date only for "Dátum", the time only "Időpontban")
 *   Mentés        THE lime pill — off, with the door "Nap és időzóna ›" above it, while LifeOS has
 *                 not started (no zone on the server, so no logical today to write against)
 *
 * It writes `POST /tasks` with the default priority (Közepes, the server's default) — exactly the
 * call api.md names "Rögzítés · Feladat". A failed write keeps the sheet and the words: the danger
 * dot and "Újra" in the header, one danger line in the body. Not queued offline (plan L9).
 */
export function CaptureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <CaptureBody key={open ? 'open' : 'closed'} open={open} onClose={onClose} />;
}

function CaptureBody({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  // The logical today comes from the server (the user's zone and day start), never from the device.
  const tasks = useTasks();
  const today = tasks.data?.today ?? null;
  useLifeosStart(tasks.data);
  const notStarted = tasks.data !== undefined && !tasks.data.started;
  const create = useCreateTask();
  const createEvent = useCreateEvent();
  const [clientKey] = useState(mintClientKey);
  const [eventKey] = useState(mintEventKey);
  const [target, setTarget] = useState<Target>('task');
  const [text, setText] = useState('');
  const [due, setDue] = useState<DueChoice>('today');
  const [mode, setMode] = useState<TimeMode>('allDay');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [tried, setTried] = useState(false);

  const words = captureWords(t);
  const textError = tried && !text.trim() ? t('capture.textRequired') : undefined;
  const dateError = tried && due === 'date' && !date ? t('tasks.dateRequired') : undefined;
  const isEvent = target === 'event';
  // An event at a time needs its start.
  const startError = tried && isEvent && mode === 'at' && !time ? words.startRequired : undefined;
  const write = isEvent ? createEvent : create;

  const submitEvent = () => {
    setTried(true);
    if (!text.trim() || (due === 'date' && !date) || (mode === 'at' && !time)) return;
    // An event lands on the CALENDAR day (captureEvent.ts); at a time it lasts an hour, one reminder.
    const day = captureEventDay(due === 'none' ? 'today' : due, date);
    createEvent.mutate(captureEventBody(eventKey, text.trim().slice(0, TITLE_MAX), day, mode === 'at' ? time : null), {
      onSuccess: onClose,
    });
  };

  const submit = () => {
    if (isEvent) return submitEvent();
    setTried(true);
    // "Időpontban" with no time chosen is a task due by the end of the day (as "Egész nap").
    if (!today || !text.trim() || (due === 'date' && !date)) return;
    const dueOn = dueOnFor(due, today, date);
    create.mutate(
      {
        clientKey,
        title: text.trim().slice(0, TITLE_MAX),
        ...(dueOn ? { dueOn } : {}),
        ...(dueOn && mode === 'at' && time ? { dueTime: time } : {}),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('capture.title')}
      status={write.isPending ? 'busy' : write.isError ? 'error' : 'idle'}
      onRetry={
        isEvent
          ? createEvent.isError && eventRetryable(createEvent.error)
            ? submit
            : undefined
          : create.isError && retryable(create.error)
            ? submit
            : undefined
      }
    >
      <Field
        label={t('capture.what')}
        value={text}
        maxLength={TITLE_MAX}
        autoFocus
        hint={t('capture.example')}
        error={textError}
        onChange={(e) => setText(e.target.value)}
      />

      <FieldGroup label={words.where}>
        {() => (
          <Segmented
            layout="cells"
            label={words.where}
            value={target}
            onChange={setTarget}
            options={[
              { value: 'task', label: words.task },
              { value: 'event', label: words.event },
            ]}
          />
        )}
      </FieldGroup>

      <FieldGroup label={t('capture.when')}>
        {() => (
          <div className="flex flex-col">
            <DueChips label={t('capture.when')} choices={['today', 'tomorrow', 'date']} value={due} onChange={setDue} />
            <Segmented
              className="self-start"
              label={t('capture.when')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'at', label: t('capture.atTime') },
                { value: 'allDay', label: t('capture.allDay') },
              ]}
            />
          </div>
        )}
      </FieldGroup>

      <DueFields
        date={date}
        onDate={setDate}
        time={time}
        onTime={setTime}
        showDate={due === 'date'}
        showTime={mode === 'at'}
        timeLabel={isEvent ? words.start : t('tasks.dueTime')}
        timeOptional={!isEvent}
        timeHint={isEvent ? words.reminderHint : undefined}
        timeError={startError}
        min={today ?? undefined}
        dateError={dateError}
      />

      {write.isError ? (
        <NoticeLine tone="danger" role="alert">
          {isEvent ? words.failed : t('tasks.failed')}
        </NoticeLine>
      ) : null}

      {notStarted ? <ZoneDoor /> : null}

      <Pressable variant="primary" size="lg" className="w-full" busy={write.isPending} disabled={isEvent ? notStarted : !today} onClick={submit}>
        {t('common.save')}
      </Pressable>
    </Sheet>
  );
}
