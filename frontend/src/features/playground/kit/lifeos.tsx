import { useEffect, useRef, useState, type ReactNode } from "react";
import { Countdown } from "../../../ui/data/Countdown";
import { DayRail, type DayRailDay } from "../../../ui/primitives/DayRail";
import {
  RecurrencePicker,
  type Recurrence,
  type RecurrencePickerLabels,
} from "../../../ui/primitives/RecurrencePicker";
import { TimeTrigger } from "../../../ui/primitives/TimeTrigger";
import { WeekdayChips } from "../../../ui/primitives/WeekdayChips";

/*
 * The G-lifeos kit lane's page of the kit specimen (`/playground`, kit section): DayRail,
 * TimeTrigger, RecurrencePicker, WeekdayChips, Countdown — reference
 * `docs/pipeline/pulse/kit/lifeos.md`.
 *
 * The Figma component board has no cell for any of these (they are round B's own, drawn in the
 * frames that use them), so every cell is listed after the board. The first cell of each component
 * is drawn AS ITS FRAME DRAWS IT, with the frame's words, so a capture can be laid over the frame's
 * crop: calendar-1's rail, habit-form's and task-form's weekday rows, task-form's recurrence group,
 * the time fields of task-form / habit-form / event-form, focus-2's countdown. The cells after it
 * show the states: rest, pressed and keyboard focus (forced with `data-force`, the idiom of
 * `control()` — a capture cannot hold a press), busy, disabled.
 *
 * Every specimen section is a named region ("lifeos · <cell>") so a capture script can scroll it
 * into view by name.
 *
 * Internal QA page: never translated (check-i18n exempts `features/playground/`). Words: the frames'.
 */

export interface KitSpecimen {
  kit: string;
  label: string;
  node: ReactNode;
  gap?: number;
  w?: number;
}

/** A specimen's caption — the state it shows (mono, quiet; the host's own mark, not the kit's). */
const State = ({ children }: { children: ReactNode }) => (
  <p className="text-micro text-text-3">{children}</p>
);

/** A named region a capture can scroll to; 354 wide, the frames' content width. */
const Region = ({
  name,
  children,
  gap = "gap-6",
}: {
  name: string;
  children: ReactNode;
  gap?: "gap-4" | "gap-6" | "gap-8";
}) => (
  <section
    aria-label={`lifeos · ${name}`}
    className={`flex w-[354px] flex-col ${gap}`}
  >
    {children}
  </section>
);

/**
 * Forces `data-force` on the n-th element matching `selector` inside the wrapper — the pressed and
 * focus looks shown without a finger or a keyboard (playground only; nothing in the product does it).
 */
function Forced({
  selector,
  index,
  force,
  children,
}: {
  selector: string;
  index: number;
  force: "pressed" | "focus";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelectorAll(selector)[index];
    el?.setAttribute("data-force", force);
  });
  return <div ref={ref}>{children}</div>;
}

/* ── DayRail: calendar-1 (October 2026, week 43, Wednesday 21 selected and today) ─────────────── */

const WEEK: DayRailDay[] = [
  { date: "2026-10-19", busy: true },
  { date: "2026-10-20", busy: true },
  { date: "2026-10-21", busy: true },
  { date: "2026-10-22" },
  { date: "2026-10-23", busy: true },
  { date: "2026-10-24", busy: true },
  { date: "2026-10-25" },
];

function Rail({
  initial = "2026-10-21",
  busy,
  disabled,
}: {
  initial?: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  const [day, setDay] = useState(initial);
  return (
    <DayRail
      label="Október 2026 · 43. hét"
      days={WEEK}
      value={day}
      onChange={setDay}
      today="2026-10-21"
      busyLabel="van program"
      busy={busy}
      disabled={disabled}
    />
  );
}

function Rails() {
  return (
    <Region name="dayRail calendar-1">
      <Rail />
      <State>pressed (Cs)</State>
      <Forced selector="[role=radio]" index={3} force="pressed">
        <Rail />
      </Forced>
      <State>keyboard focus (P)</State>
      <Forced selector="[role=radio]" index={4} force="focus">
        <Rail />
      </Forced>
      <State>another day selected (Szo 24) — today keeps the ink weekday</State>
      <Rail initial="2026-10-24" />
      <State>busy — the dots are held back</State>
      <Rail busy />
      <State>disabled</State>
      <Rail disabled />
    </Region>
  );
}

/* ── WeekdayChips: habit-form (H–P) and task-form (V) ─────────────────────────────────────────── */

function Days({
  initial,
  disabled,
  busyDay,
  failedDay,
}: {
  initial: number;
  disabled?: boolean;
  busyDay?: number;
  failedDay?: number;
}) {
  const [mask, setMask] = useState(initial);
  return (
    <WeekdayChips
      label="Ütemezés"
      value={mask}
      onChange={setMask}
      disabled={disabled}
      busyDay={busyDay}
      failedDay={failedDay}
    />
  );
}

function WeekdayRows() {
  return (
    <Region name="weekdayChips habit-form" gap="gap-4">
      <Days initial={0b0011111} />
      <State>task-form · V</State>
      <Days initial={0b1000000} />
      <State>pressed (Szo)</State>
      <Forced selector="button" index={5} force="pressed">
        <Days initial={0b0011111} />
      </Forced>
      <State>keyboard focus (Cs)</State>
      <Forced selector="button" index={3} force="focus">
        <Days initial={0b0011111} />
      </Forced>
      <State>busy (Szo) · failed (V)</State>
      <Days initial={0b0011111} busyDay={5} failedDay={6} />
      <State>disabled</State>
      <Days initial={0b0011111} disabled />
    </Region>
  );
}

/* ── RecurrencePicker: task-form (Hetente, Sunday; "Minden vasárnap 20:00") ───────────────────── */

const LABELS: RecurrencePickerLabels = {
  none: "Nincs",
  daily: "Naponta",
  weekly: "Hetente",
  monthly: "Havonta",
  // Not in a round-B frame (only the weekly state is drawn): the specimen's own words.
  interval: "Every N days",
  monthDay: "Day of the month",
};

function Picker({
  initial,
  hint,
  disabled,
  busy,
}: {
  initial: Recurrence | null;
  hint?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const [rule, setRule] = useState<Recurrence | null>(initial);
  return (
    <RecurrencePicker
      label="Ismétlődés"
      value={rule}
      onChange={setRule}
      labels={LABELS}
      anchor="2026-10-25"
      hint={hint}
      disabled={disabled}
      busy={busy}
    />
  );
}

function Pickers() {
  return (
    <Region name="recurrencePicker task-form">
      <Picker
        initial={{ type: "weekly", weekdayMask: 0b1000000 }}
        hint="Minden vasárnap 20:00"
      />
      <State>none</State>
      <Picker initial={null} />
      <State>daily · every 2 days</State>
      <Picker initial={{ type: "daily", interval: 2 }} />
      <State>monthly · day 25</State>
      <Picker initial={{ type: "monthly", day: 25 }} />
      <State>keyboard focus (Hetente)</State>
      <Forced selector="[role=radio]" index={2} force="focus">
        <Picker initial={{ type: "weekly", weekdayMask: 0b1000000 }} />
      </Forced>
      <State>pressed (Havonta)</State>
      <Forced selector="[role=radio]" index={3} force="pressed">
        <Picker initial={{ type: "weekly", weekdayMask: 0b1000000 }} />
      </Forced>
      <State>busy (saving the kind)</State>
      <Picker initial={{ type: "weekly", weekdayMask: 0b1000000 }} busy />
      <State>disabled</State>
      <Picker initial={{ type: "weekly", weekdayMask: 0b1000000 }} disabled />
    </Region>
  );
}

/* ── TimeTrigger: task-form (165), habit-form (full, hint), event-form (106, mono) ────────────── */

function Time(props: {
  label: string;
  initial: string;
  face?: "body" | "mono";
  hint?: string;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { initial, ...rest } = props;
  const [v, setV] = useState(initial);
  return <TimeTrigger {...rest} value={v} onChange={setV} />;
}

function Times() {
  return (
    <Region name="timeTrigger task-form habit-form event-form">
      <div className="flex gap-6">
        <div className="w-[165px]" />
        <Time label="Határidő ideje" initial="20:00" className="w-[165px]" />
      </div>
      <Time
        label="Emlékeztető ideje"
        initial="07:30"
        hint="Csak az ütemezett napokon, és csak amíg nincs kipipálva."
      />
      <State>event-form · mono clock figures, 106 wide</State>
      <div className="flex" style={{ gap: 18 }}>
        <div className="w-[106px]" />
        <Time label="Kezdés" initial="16:00" face="mono" className="w-[106px]" />
        <Time label="Vége" initial="16:45" face="mono" className="w-[106px]" />
      </div>
      <State>error · disabled · empty</State>
      <Time label="Vége" initial="15:30" face="mono" error="A vége a kezdés után legyen." />
      <Time label="Emlékeztető ideje" initial="07:30" disabled />
      <Time label="Emlékeztető ideje" initial="" placeholder="--:--" />
    </Region>
  );
}

/* ── Countdown: focus-2 "34:42" (giant), a live tick, num, pending ────────────────────────────── */

function Ticking() {
  const [s, setS] = useState(34 * 60 + 42);
  useEffect(() => {
    const id = window.setInterval(
      () => setS((n) => (n > 0 ? n - 1 : 50 * 60)),
      1000,
    );
    return () => window.clearInterval(id);
  }, []);
  return <Countdown seconds={s} />;
}

function Countdowns() {
  return (
    <Region name="countdown focus-2" gap="gap-8">
      <Countdown seconds={34 * 60 + 42} srText="34 perc 42 másodperc" />
      <State>ticking (live) — the digits never move sideways</State>
      <Ticking />
      <State>11:11 / 00:00 — the same cells</State>
      <div className="flex flex-col gap-4">
        <Countdown seconds={11 * 60 + 11} />
        <Countdown seconds={0} />
      </div>
      <State>num · pending (paused) · from an hour</State>
      <div className="flex flex-col gap-4">
        <Countdown seconds={5 * 60} size="num" />
        <Countdown seconds={5 * 60} size="num" tone="pending" />
        <Countdown seconds={3600 + 5 * 60 + 9} size="num" />
      </div>
    </Region>
  );
}

export const specimens: KitSpecimen[] = [
  {
    kit: "dayRail",
    label:
      "dayRail · calendar-1 week (Sze 21 selected + today, busy dots) / pressed / focus / busy / disabled",
    gap: 20,
    node: <Rails />,
  },
  {
    kit: "weekdayChips",
    label:
      "weekdayChips · habit-form H–P / task-form V / pressed / focus / busy + failed / disabled",
    gap: 20,
    node: <WeekdayRows />,
  },
  {
    kit: "recurrencePicker",
    label:
      "recurrencePicker · task-form Hetente + V / none / daily / monthly / focus / pressed / busy / disabled",
    gap: 20,
    node: <Pickers />,
  },
  {
    kit: "timeTrigger",
    label:
      "timeTrigger · task-form 20:00 / habit-form 07:30 + hint / event-form mono / error / disabled / empty",
    gap: 20,
    node: <Times />,
  },
  {
    kit: "countdown",
    label: "countdown · focus-2 34:42 giant / ticking / num / pending / h:mm:ss",
    gap: 20,
    node: <Countdowns />,
  },
];

export default function LifeosKit() {
  return (
    <div className="flex flex-col gap-12">
      {specimens.map((s, i) => (
        <section key={i} className="flex flex-col gap-3">
          <p className="text-micro text-text-3">{s.label}</p>
          {s.node}
        </section>
      ))}
    </div>
  );
}
