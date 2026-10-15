import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { MacroColumns } from '../../../ui/data/MacroColumns';
import { Fraction, Numeral } from '../../../ui/data/Numeral';
import { ProgressBar } from '../../../ui/data/ProgressBar';
import { SegmentBar } from '../../../ui/data/SegmentBar';
import type { Segment } from '../../../ui/data/SegmentBar';
import { StatBlock } from '../../../ui/data/StatBlock';
import { CountUp } from '../../../ui/feedback/CountUp';
import { Switch } from '../../../ui/primitives/Switch';

/*
 * The data lane's page of the kit specimen (`/playground`, kit section). Internal QA page, English.
 *
 * The first four cells ARE the four data cells of the Figma component board (`Pulse — Components`,
 * column 3: `statBlock`, `segBar` week, `segBar` count, `macroCol`), label for label, with the
 * board's own sample figures, and the nodes inside a cell stand as far apart as the board's
 * `cell()` puts them (`app-components.body.js` 85-90): 24 between the two stat blocks, 20 between
 * the count bar and the stepper and between the macro row and the meter. The host adds the label
 * and the label's gap.
 *
 * The cells after them hold what the board does not draw: the giant numeral exactly as the three
 * frames that carry it compose it (home-1, coins-1, progress-1) and the workout countdown, the
 * tones and units, and the same components while their value CHANGES (behind a switch, so a
 * capture of the board never catches a figure mid-roll).
 *
 * Nothing in this lane is interactive — a figure, a bar and a block take no focus and no pointer —
 * so there is no pressed, disabled, busy or keyboard-focus state to show. The states a figure HAS
 * are shown instead: ink, pending and warn; on target, over and without one; lit, planned and off;
 * standing, ticking and rolling. (The one control on the page, the switch of the last cell, is the
 * selection lane's.)
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. A cell of the Figma board carries the board's label verbatim. */
  label: string;
  node: ReactNode;
}

const WEEK: Segment[] = [
  { state: 'on', label: 'H' },
  { state: 'off', label: 'K' },
  { state: 'on', label: 'Sze' },
  { state: 'off', label: 'Cs' },
  { state: 'half', label: 'P', today: true },
  { state: 'half', label: 'Szo' },
  { state: 'off', label: 'V' },
];

const Stack = ({ gap, children }: { gap: 'gap-5' | 'gap-6' | 'gap-8' | 'gap-12'; children: ReactNode }) => (
  <div className={`flex w-full flex-col items-start ${gap}`}>{children}</div>
);

/** The board's `stepper(2, 5)` — the lane's stage-2 component, drawn here from the bar it is made of. */
const StepperSketch = () => (
  <div className="flex w-full items-center gap-4">
    <SegmentBar thin label="2 / 5" value={2} total={5} className="flex-1" />
    <span className="text-data text-text-2">2 / 5</span>
  </div>
);

/** Steps through `values` while `on`; stands on the first one otherwise. */
function useCycle<T>(values: readonly T[], everyMs: number, on: boolean): T {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!on) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => setIndex((i) => (i + 1) % values.length), everyMs);
    return () => clearInterval(timer);
  }, [values.length, everyMs, on]);
  return values[index] as T;
}

const BALANCES = [190, 215, 1450, 1399, 90] as const;
const DONE = [2, 3, 4, 1] as const;
const CLOCK = ['2:59', '2:58', '1:11', '0:07', '10:00'] as const;
const KCAL = [1840, 2210, 2680, 640] as const;

function Changing() {
  const [on, setOn] = useState(false);
  const id = useId();
  const balance = useCycle(BALANCES, 2000, on);
  const done = useCycle(DONE, 2000, on);
  const clock = useCycle(CLOCK, 1000, on);
  const kcal = useCycle(KCAL, 2000, on);
  return (
    <Stack gap="gap-8">
      <div className="flex items-center gap-3">
        <Switch checked={on} onChange={setOn} labelledBy={id} />
        <span id={id} className="text-cap text-text-2">
          change the values (every 1 – 2 s)
        </span>
      </div>
      <StatBlock label="Egyenleged">
        <Numeral size="giant" value={balance} mode="roll" />
      </StatBlock>
      <StatBlock label="Heti edzés">
        <Fraction size="giant" value={done} of={4} mode="roll" />
      </StatBlock>
      <SegmentBar label="Heti edzés" value={done} total={4} />
      <Numeral size="giant" value={clock} mode="tick" />
      <div className="flex w-full flex-col gap-2">
        <Numeral value={kcal} mode="roll" tone={kcal > 2600 ? 'warn' : 'ink'} unit="kcal" />
        <ProgressBar label="Kalória" value={kcal} max={2600} tone="accent" />
      </div>
      <p className="text-body text-text-2">
        CountUp in running text: <CountUp to={kcal} from={1840} /> kcal
      </p>
    </Stack>
  );
}

export const specimens: KitSpecimen[] = [
  {
    kit: 'statBlock',
    label: 'statBlock · fraction (giant) / numeral (num) + caption',
    node: (
      <Stack gap="gap-6">
        <StatBlock label="Heti edzés">
          <Fraction size="giant" value="2" of="4" />
        </StatBlock>
        <StatBlock label="Egyenleged" caption="érme">
          <Numeral value="190" />
        </StatBlock>
      </Stack>
    ),
  },
  {
    kit: 'segBar',
    label: 'segBar · week: on / half / off + today dot',
    node: <SegmentBar label="Heti edzés" segments={WEEK} />,
  },
  {
    kit: 'segBar',
    label: 'segBar · count 4 / 7 — stepper(2, 5)',
    node: (
      <Stack gap="gap-5">
        <SegmentBar label="4 / 7" value={4} total={7} />
        <StepperSketch />
      </Stack>
    ),
  },
  {
    kit: 'macroCol',
    label: 'macroCol · on target / over (warn) / no target — progressBar',
    node: (
      <Stack gap="gap-5">
        <MacroColumns
          columns={[
            { name: 'Kalória', value: '1840', ratio: 1840 / 2600, caption: 'cél 2600' },
            { name: 'Fehérje', value: '128', unit: 'g', ratio: 128 / 180, caption: 'cél 180 g' },
            { name: 'Szénhidrát', value: '305', unit: 'g', ratio: 305 / 290, caption: 'cél 290 g' },
            { name: 'Zsír', value: '52', unit: 'g' },
          ]}
        />
        <ProgressBar label="Kalória" value={0.62} />
      </Stack>
    ),
  },
  {
    kit: 'numeral',
    label: 'numeral · giant on the gutter — home-1 / coins-1 / progress-1 · workout-2 countdown (tick: fixed digit cells)',
    node: (
      <Stack gap="gap-8">
        <StatBlock label="Heti edzés">
          <Fraction size="giant" value="2" of="4" />
        </StatBlock>
        <StatBlock label="Egyenleged">
          <Numeral size="giant" value="190" />
        </StatBlock>
        <StatBlock label="Testsúly">
          <Numeral size="giant" value="83,1" unit="kg" />
        </StatBlock>
        <Numeral size="giant" value="2:59" mode="tick" />
      </Stack>
    ),
  },
  {
    kit: 'numeral',
    label: 'numeral · num: ink / pending / warn · unit · fraction 4 / 7 — macroCol size num (the nutrition trio, over = warn)',
    node: (
      <Stack gap="gap-8">
        <div className="flex flex-wrap items-end gap-6">
          <Numeral value="83,1" unit="kg" />
          <Fraction value="4" of="7" />
          <Numeral value="305" tone="warn" unit="g" />
          <Numeral value="0" tone="pending" />
          <Numeral value="1 656" />
        </div>
        <MacroColumns
          size="num"
          columns={[
            { name: 'Fehérje', value: 128, unit: 'g', ratio: 128 / 180, caption: 'cél 180 g' },
            { name: 'Szénhidrát', value: 305, unit: 'g', ratio: 305 / 290, caption: 'cél 290 g' },
            { name: 'Zsír', value: 52, unit: 'g', ratio: 52 / 70, caption: 'cél 70 g' },
          ]}
        />
      </Stack>
    ),
  },
  {
    kit: 'progressBar',
    label: 'progressBar · ink / the live datum (lime) / over (warn) / empty (1 pt sliver)',
    node: (
      <Stack gap="gap-5">
        <ProgressBar label="Kalória" value={1840} max={2600} />
        <ProgressBar label="Kalória" value={1840} max={2600} tone="accent" />
        <ProgressBar label="Szénhidrát" value={305} max={290} />
        <ProgressBar label="Zsír" value={0} max={70} />
      </Stack>
    ),
  },
  {
    kit: 'numeral',
    label: 'numeral · changing — roll (balance, count) / tick (countdown) / bar grows / CountUp',
    node: <Changing />,
  },
];

/** The page laid out by itself (the host prefers `specimens`). */
export default function DataKit() {
  return (
    <div className="flex w-[354px] flex-col gap-12">
      {specimens.map((specimen) => (
        <section key={specimen.label} className="flex flex-col gap-3">
          <p className="text-micro text-text-3">{specimen.label}</p>
          {specimen.node}
        </section>
      ))}
    </div>
  );
}
