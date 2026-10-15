import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import './scratch.css';
import '@/i18n';
import { specimens } from '@/features/playground/kit/data';
import { LedgerRow } from '@/ui/data/LedgerRow';
import { Fraction } from '@/ui/data/Numeral';
import { RowStack } from '@/ui/data/RowStack';
import { SegmentBar } from '@/ui/data/SegmentBar';
import { Sparkline } from '@/ui/feedback/Sparkline';
import type { TrendPoint } from '@/ui/feedback/TrendChart';
import { Pic } from '@/ui/media/Pic';

/*
 * F10 stage-2 scratch kit host — NOT part of the product. It renders the lane's real files (the
 * slot's `ui/data/LedgerRow.tsx`, `SegmentBar.tsx` `Stepper`, the specimen page) with the app's
 * real CSS, outside the app's router and shell:
 *   #board          the two board cells of stage 2 at the component board's own coordinates
 *                   (ledgerRow: column 2, x 473, y 3448 · the count cell with the stepper:
 *                   column 3, x 906, y 2109), the page starting at board y 2080
 *   #<frame>        a 402-wide page with the ledger rows / the step bar exactly where the frame's
 *                   geometry puts their kit layer
 */

const BOARD_Y0 = 2080;

const At = ({ x, y, w, children }: { x: number; y: number; w?: number; children: ReactNode }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w }}>{children}</div>
);

function Cell({ label, gap }: { label: string; gap: number }) {
  const s = specimens.find((x) => x.label === label);
  return (
    <section className="flex flex-col" style={{ gap }}>
      <p className="text-micro text-text-3" style={{ marginRight: '-0.1em' }}>
        {label}
      </p>
      {s ? s.node : <p className="text-cap text-danger">missing</p>}
    </section>
  );
}

function Board() {
  const states = specimens.find((s) => s.label.startsWith('ledgerRow · rest'));
  return (
    <div style={{ position: 'relative', width: 1300, height: 1700 }}>
      <At x={906} y={2109 - BOARD_Y0} w={354}>
        <Cell label="segBar · count 4 / 7 — stepper(2, 5)" gap={20} />
      </At>
      <At x={473} y={3448 - BOARD_Y0} w={354}>
        <Cell label="ledgerRow · label | note | numeral on one baseline" gap={12} />
      </At>
      {/* off the board: the states cell, in column 1's empty band (for the record, not for a pair) */}
      <At x={40} y={2100 - BOARD_Y0} w={354}>
        <section className="flex flex-col gap-3">
          <p className="text-micro text-text-3">{states?.label}</p>
          {states?.node}
        </section>
      </At>
    </div>
  );
}

const DAY = 86400000;
const dated = (start: string, step: number, values: (number | null)[]): TrendPoint[] =>
  values.flatMap((value, i) => (value == null ? [] : [{ date: new Date(Date.parse(`${start}T00:00:00Z`) + i * step * DAY).toISOString().slice(0, 10), value }]));
const WEIGHT = dated('2026-07-17', 3, [
  88.4, 88.1, 87.9, 87.5, 87.6, 87.2, 87, null, null, null, null, null, null, 85.6, 85.3, 85.4, 84.9, 84.7, 84.8, 84.3, 84, 84.1,
  83.6, 83.4, 83.1,
]);
const noop = () => undefined;

const FRAMES: Record<string, { h: number; node: () => ReactNode }> = {
  // settings-1 "Ledger": rule/section 335, rows 336 / 413 / 490, rule/section 566
  'settings-1': {
    h: 874,
    node: () => (
      <At x={24} y={335} w={354}>
        <RowStack open close>
          <LedgerRow label="Érmék" labelTrail={<Pic slot="coin" width={22} />} note="Egyenleged" value="190" onClick={noop} />
          <LedgerRow label="Eredmények" note="feloldva" value={<Fraction value="4" of="7" />} onClick={noop} />
          <LedgerRow label="Testsúly" note={<Sparkline series={WEIGHT} width={118} height={28} />} value="83,1" unit="kg" onClick={noop} />
        </RowStack>
      </At>
    ),
  },
  // coach-dashboard-1 "Counts": rule 918, Csapatok 919 (a link), Élő kódok 996 (not a button), rule 1072
  'coach-dashboard-1': {
    h: 1459,
    node: () => (
      <At x={24} y={918} w={354}>
        <RowStack open close>
          <LedgerRow label="Csapatok" value={3} onClick={noop} />
          <LedgerRow label="Élő kódok" value={2} chevronSpace />
        </RowStack>
      </At>
    ),
  },
  // client-detail-2: the meal heads, no chevron, kcal on the edge
  'client-detail-2': {
    h: 2091,
    node: () => (
      <>
        {[
          ['Reggeli', 443, 511],
          ['Ebéd', 537, 859],
          ['Edzés utáni', 327, 1207],
          ['Vacsora', 373, 1490],
        ].map(([label, kcal, y]) => (
          <At key={label} x={24} y={y as number} w={354}>
            <LedgerRow label={label} value={kcal} unit="kcal" />
          </At>
        ))}
      </>
    ),
  },
  // onboarding-3 "Step bar": the thin segment bar alone under the step numeral (2 / 5 lit), y 220
  'onboarding-3': {
    h: 874,
    node: () => (
      <At x={24} y={220} w={354}>
        <SegmentBar thin value={2} total={5} label="Kérdőív" />
      </At>
    ),
  },
};

function App() {
  const key = location.hash.slice(1) || 'board';
  if (key === 'board') return <Board />;
  const frame = FRAMES[key];
  return <div style={{ position: 'relative', width: '100%', height: frame?.h ?? 874 }}>{frame ? frame.node() : <p>no such frame</p>}</div>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <App />
    </MemoryRouter>
  </StrictMode>,
);
