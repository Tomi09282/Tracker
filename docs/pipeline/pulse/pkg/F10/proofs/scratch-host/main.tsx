import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './scratch.css';
import '@/i18n';
import { specimens } from '@/features/playground/kit/data';
import { MacroColumns } from '@/ui/data/MacroColumns';
import { Fraction, Numeral } from '@/ui/data/Numeral';
import { ProgressBar } from '@/ui/data/ProgressBar';
import { SegmentBar } from '@/ui/data/SegmentBar';
import type { Segment } from '@/ui/data/SegmentBar';
import { StatBlock } from '@/ui/data/StatBlock';

/*
 * F10 scratch kit host — NOT part of the repository. It renders the data lane's specimens (the
 * real files of the slot, with the app's real CSS) in two layouts:
 *   #board          column 3 of the Figma component board, at the board's own coordinates
 *                   (left 906; top so that _components-2.png lines up: board y - 1265)
 *   #<frame>        a 402-wide page with the lane's components placed exactly where the frame's
 *                   geometry puts their kit layer (Stat/..., Week bar, Macro row, Progress, Clock)
 */

const At = ({ x, y, w, children }: { x: number; y: number; w?: number; children: ReactNode }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w }}>{children}</div>
);

const BOARD_CELLS = [
  { label: 'statBlock · fraction (giant) / numeral (num) + caption', gap: 24 },
  { label: 'segBar · week: on / half / off + today dot', gap: 12 },
  { label: 'segBar · count 4 / 7 — stepper(2, 5)', gap: 20 },
  { label: 'macroCol · on target / over (warn) / no target — progressBar', gap: 20 },
];

function Board() {
  const extra = specimens.filter((s) => !BOARD_CELLS.some((c) => c.label === s.label));
  return (
    <div style={{ position: 'relative', width: 1300, minHeight: 1313 }}>
      <At x={906} y={1645 - 1273} w={354}>
        <div className="flex flex-col" style={{ gap: 48 }}>
          {BOARD_CELLS.map((cell) => {
            const s = specimens.find((x) => x.label === cell.label);
            return (
              <section key={cell.label} data-cell={cell.label} className="flex flex-col" style={{ gap: cell.gap }}>
                <p className="text-micro text-text-3">{cell.label}</p>
                {s ? s.node : <p className="text-cap text-danger">missing</p>}
              </section>
            );
          })}
        </div>
      </At>
      <At x={40} y={1645 - 1273} w={354}>
        <div className="flex flex-col" style={{ gap: 48 }}>
          {extra.slice(0, 2).map((s) => (
            <section key={s.label} className="flex flex-col gap-3">
              <p className="text-micro text-text-3">{s.label}</p>
              {s.node}
            </section>
          ))}
        </div>
      </At>
      <At x={473} y={1645 - 1273} w={354}>
        <div className="flex flex-col" style={{ gap: 48 }}>
          {extra.slice(2).map((s) => (
            <section key={s.label} className="flex flex-col gap-3">
              <p className="text-micro text-text-3">{s.label}</p>
              {s.node}
            </section>
          ))}
        </div>
      </At>
    </div>
  );
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

const FRAMES: Record<string, () => ReactNode> = {
  'home-1': () => (
    <>
      <At x={24} y={152}>
        <StatBlock label="Heti edzés">
          <Fraction size="giant" value="2" of="4" />
        </StatBlock>
      </At>
      <At x={24} y={299} w={354}>
        <SegmentBar label="Heti edzés" segments={WEEK} />
      </At>
      <At x={24} y={659} w={354}>
        <MacroColumns
          columns={[
            { name: 'Kalória', value: '1840', ratio: 1840 / 2600, caption: 'cél 2600' },
            { name: 'Fehérje', value: '128', unit: 'g', ratio: 128 / 180, caption: 'cél 180 g' },
            { name: 'Szénhidrát', value: '210', unit: 'g', ratio: 210 / 290, caption: 'cél 290 g' },
            { name: 'Zsír', value: '52', unit: 'g', ratio: 52 / 70, caption: 'cél 70 g' },
          ]}
        />
      </At>
    </>
  ),
  'coins-1': () => (
    <At x={24} y={178}>
      <StatBlock label="Egyenleged">
        <Numeral size="giant" value="190" mode="roll" />
      </StatBlock>
    </At>
  ),
  'progress-1': () => (
    <>
      <At x={24} y={204}>
        <StatBlock label="Testsúly">
          <Numeral size="giant" value="83,1" unit="kg" />
        </StatBlock>
      </At>
      <At x={24} y={650} w={354}>
        <MacroColumns
          columns={[
            { name: 'Kar (jobb)', value: '37,9', unit: 'cm', caption: '2026-09-11' },
            { name: 'Testzsír', value: '18,6', unit: '%', caption: '2026-10-02' },
            { name: 'Mellkas', value: '105,1', unit: 'cm', caption: '2026-09-11' },
            { name: 'Derék', value: '87,5', unit: 'cm', caption: '2026-09-25' },
          ]}
        />
      </At>
    </>
  ),
  'nutrition-1': () => (
    <>
      <At x={24} y={166}>
        <StatBlock label="Kalória">
          <Numeral size="giant" value="1840" />
        </StatBlock>
      </At>
      <At x={24} y={316} w={354}>
        <ProgressBar label="Kalória" value={1840} max={2600} tone="accent" />
      </At>
      <At x={24} y={397} w={354}>
        <MacroColumns
          size="num"
          columns={[
            { name: 'Fehérje', value: 128, unit: 'g', ratio: 128 / 180, caption: 'cél 180 g' },
            { name: 'Szénhidrát', value: 210, unit: 'g', ratio: 210 / 290, caption: 'cél 290 g' },
            { name: 'Zsír', value: 52, unit: 'g', ratio: 52 / 70, caption: 'cél 70 g' },
          ]}
        />
      </At>
    </>
  ),
  'workout-2': () => (
    <>
      <At x={24} y={632}>
        <Numeral size="giant" value="2:59" mode="tick" />
      </At>
      <At x={24} y={750} w={354}>
        <ProgressBar label="Pihenő" value={179} max={180} tone="accent" />
      </At>
    </>
  ),
  'workout-2-static': () => (
    <At x={24} y={632}>
      <Numeral size="giant" value="2:59" />
    </At>
  ),
  'coach-dashboard-1': () => (
    <At x={24} y={200}>
      <StatBlock label="Kliensek">
        <Numeral size="giant" value="6" />
      </StatBlock>
    </At>
  ),
  'admin-1': () => (
    <At x={24} y={178}>
      <StatBlock label="Felhasználó">
        <Numeral size="giant" value="19" />
      </StatBlock>
    </At>
  ),
};

function App() {
  const key = location.hash.slice(1) || 'board';
  if (key === 'board') return <Board />;
  const Frame = FRAMES[key];
  return <div style={{ position: 'relative', width: '100%', height: 874 }}>{Frame ? <Frame /> : <p>no such frame</p>}</div>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
