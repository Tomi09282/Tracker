import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { DueChips, DueFields, FieldGroup, ZoneDoor, dueOnFor, type DueChoice } from '../tasks/formParts';
import { mintClientKey, retryable, useCreateTask, useLifeosStart, useTasks } from '../tasks/tasksData';

/** The server's bound on a task title (`POST /tasks`, api.md). */
const TITLE_MAX = 120;

type TimeMode = 'at' | 'allDay';

/**
 * "Van valami a fejedben?" — the quick capture, frame `lifeos/capture` (design round B;
 * `capture.body.js`): the kit bottom sheet, opened by "Rögzítés +" on Ma (package S-ma mounts it;
 * until then `/tasks?capture=1`). Its body 16 apart:
 *
 *   Mi az?        one field, focused, with the frame's example line as its hint
 *   (Hova?)       WHERE it goes. The approved frame offers Feladat / Esemény; an event needs the
 *                 Phase-5 route (`POST /events`), so in Phase 3 the only destination is a task and
 *                 a one-option switch would be a control that chooses nothing: the group is not
 *                 drawn until Esemény can work (package deviation; plan: "hide that option").
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
  const [clientKey] = useState(mintClientKey);
  const [text, setText] = useState('');
  const [due, setDue] = useState<DueChoice>('today');
  const [mode, setMode] = useState<TimeMode>('allDay');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [tried, setTried] = useState(false);

  const textError = tried && !text.trim() ? t('capture.textRequired') : undefined;
  const dateError = tried && due === 'date' && !date ? t('tasks.dateRequired') : undefined;

  const submit = () => {
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
      status={create.isPending ? 'busy' : create.isError ? 'error' : 'idle'}
      onRetry={create.isError && retryable(create.error) ? submit : undefined}
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
        timeLabel={t('tasks.dueTime')}
        min={today ?? undefined}
        dateError={dateError}
      />

      {create.isError ? (
        <NoticeLine tone="danger" role="alert">
          {t('tasks.failed')}
        </NoticeLine>
      ) : null}

      {notStarted ? <ZoneDoor /> : null}

      <Pressable variant="primary" size="lg" className="w-full" busy={create.isPending} disabled={!today} onClick={submit}>
        {t('common.save')}
      </Pressable>
    </Sheet>
  );
}
