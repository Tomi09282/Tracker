import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { Bell, Check, MessageCircle } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import './scratch.css';
import '@/i18n';
import { pulseSrcSet } from '@/assets/pulse';
import { Dot } from '@/ui/data/Dot';
import { LedgerRow } from '@/ui/data/LedgerRow';
import { ListRow } from '@/ui/data/ListRow';
import { MacroColumns } from '@/ui/data/MacroColumns';
import { Monogram } from '@/ui/data/Monogram';
import { Numeral } from '@/ui/data/Numeral';
import { RoleKey } from '@/ui/data/RoleKey';
import { RowStack } from '@/ui/data/RowStack';
import { SegmentBar } from '@/ui/data/SegmentBar';
import type { SegmentSlot } from '@/ui/data/SegmentBar';
import { SplitBar, SplitLegend } from '@/ui/data/SplitBar';
import { StatusLine } from '@/ui/data/StatusLine';
import { EmptyState } from '@/ui/feedback/EmptyState';
import { UserPhoto } from '@/ui/media/UserPhoto';
import { specimens } from '@/features/playground/kit/gap-data';

/*
 * G-data scratch kit host — NOT part of the product. It renders the lane's real files (the slot's
 * `ui/data/*`, `ui/feedback/EmptyState.tsx`, `ui/media/UserPhoto.tsx`, the specimen page) with the
 * app's real CSS and fonts, outside the app's router and shell:
 *
 *   #<frame>   a 402-wide page with the gap component(s) exactly where the frame's geometry puts
 *              the layer it reproduces (the screens that will use them are not rebuilt yet)
 *   #kit       the specimen page `features/playground/kit/gap-data.tsx`, cells 354 wide
 *
 * Every figure below is the frame's own sample data (`.pulse/geometry/<frame>.json`).
 */

const At = ({ x, y, w, h, children }: { x: number; y: number; w?: number; h?: number; children: ReactNode }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w, height: h }}>{children}</div>
);
const noop = () => undefined;

const strip = (open: number | null): SegmentSlot[] =>
  [1, 2, 3, 4, 5, 6, 7].map((n) => {
    const rest = n === 2 || n === 4 || n === 7;
    return { state: open === n ? 'on' : rest ? 'off' : 'half', label: n, onPress: noop, pressed: rest ? undefined : open === n, srText: `${n}. nap` };
  });

const Verified = () => <Check aria-label="Ellenőrzött edző" size={14} strokeWidth={2.5} className="text-text-1" />;
const byline = (coach: string, verified = false) => (
  <span className="inline-flex items-center gap-[5px]">
    {coach}
    {verified ? <Verified /> : null}
  </span>
);

const FRAMES: Record<string, { h: number; node: () => ReactNode }> = {
  // 1 · RoleKey stack 8 ("Muscle labels" 24,274)
  'exercise-detail-1': {
    h: 1708,
    node: () => (
      <At x={24} y={274} w={142}>
        <RoleKey items={[{ role: 'primary', label: 'Mell' }, { role: 'secondary', label: 'Oldalsó vállizom' }, { role: 'secondary', label: 'Tricepsz' }]} roleLabels={{ primary: 'Fő célizom', secondary: 'Segédizom' }} />
      </At>
    ),
  },
  // 1 · RoleKey legend 6 ("Legend" 24,256)
  'workout-1': {
    h: 874,
    node: () => (
      <At x={24} y={256} w={172}>
        <RoleKey size={6} items={[{ role: 'primary', label: 'Fő célizom' }, { role: 'secondary', label: 'Segédizom' }]} />
      </At>
    ),
  },
  // 1 · RoleKey inline 8 ("Target muscles" 24,676)
  'admin-2': {
    h: 1607,
    node: () => (
      <At x={24} y={676} w={354}>
        <RoleKey layout="inline" items={[{ role: 'primary', label: 'Négyfejű combizom' }, { role: 'secondary', label: 'Farizom' }]} />
      </At>
    ),
  },
  // 1 · Dot in a ListRow trailing: the unread mark (rows 417 / 474)
  'notifications-1': {
    h: 874,
    node: () => (
      <At x={24} y={417} w={354}>
        <RowStack>
          <ListRow to="#" lead={<MessageCircle />} title="kovacs.peter" trailing={<span className="flex items-center gap-2"><Dot /><span className="text-data text-text-1">5 perce</span></span>} />
          <ListRow to="#" lead={<Bell />} title="Felszerelés frissítve" sub="Az edződ módosította az eszközeidet." trailing={<span className="flex items-center gap-2"><Dot /><span className="text-data text-text-1">2 órája</span></span>} />
        </RowStack>
      </At>
    ),
  },
  // 1 · StatusLine in the plan row (1070) · 5 · Monogram 124 + lime dot (116)
  'client-detail-1': {
    h: 1394,
    node: () => (
      <>
        <At x={24} y={116}>
          <Monogram initials="TD" size={124} dot dotLabel="A kliens saját fiókkal rendelkezik" />
        </At>
        <At x={24} y={1070} w={354}>
          <ListRow to="#" chevron lines={2} title="Felső/alsó szplit – 12 hetes blokk" sub={<StatusLine tone="live" word="Aktív" meta="7 nap · 7 napos ciklus · 2026-07-13" />} />
        </At>
      </>
    ),
  },
  // 5 · Monogram 96 (coach-chat-1, 24,112)
  'coach-chat-1': {
    h: 874,
    node: () => (
      <At x={24} y={112}>
        <Monogram initials="TD" size={96} />
      </At>
    ),
  },
  // 2 · SplitBar grid ("Team split" 24,350)
  'coach-dashboard-1': {
    h: 1459,
    node: () => (
      <At x={24} y={350} w={354}>
        <SplitBar parts={[{ label: 'Erőemelő csapat', count: 2 }, { label: 'Reggeli csoport', count: 2 }, { label: 'Online kliensek', count: 1 }, { label: 'Csapat nélkül', count: 1 }]} />
      </At>
    ),
  },
  'coach-dashboard-3': {
    h: 1594,
    node: () => (
      <At x={24} y={347} w={354}>
        <SplitBar parts={[{ label: 'Erőemelő csapat', count: 2 }, { label: 'Reggeli csoport', count: 2 }, { label: 'Online kliensek', count: 1 }, { label: 'Csapat nélkül', count: 2 }]} />
      </At>
    ),
  },
  // 2 · SplitBar inline ("Status" 24,316) · 4 · plan rows, trimmed stack ("Templates" 24,517)
  'coach-plans-1': {
    h: 1274,
    node: () => (
      <>
        <At x={24} y={316} w={354}>
          <SplitBar legend="inline" parts={[{ label: 'Aktív', count: 4, tone: 'live' }, { label: 'Piszkozat', count: 1, tone: 'half' }, { label: 'Szünetel', count: 0, tone: 'warn' }, { label: 'Lezárva', count: 1, tone: 'off' }]} />
        </At>
        <At x={24} y={517} w={354}>
          <RowStack trim>
            <ListRow to="#" chevron pad="loose" titleSize="title" lines={2} subFace="data" title="Push / Pull / Láb – 6 nap" sub="Piszkozat · 6 nap · 7 napos ciklus" />
            <ListRow to="#" chevron pad="loose" titleSize="title" lines={2} subFace="data" subInk="ink" subLead={<Check />} title="Felső/alsó szplit – 12 hetes blokk" sub="Aktív · 7 nap · 7 napos ciklus" />
            <ListRow to="#" chevron pad="loose" titleSize="title" lines={2} subFace="data" subInk="ink" subLead={<Check />} title="Kezdő teljes test – 8 hét" sub="Aktív · 7 nap · 7 napos ciklus" />
          </RowStack>
        </At>
      </>
    ),
  },
  // 2 · SplitBar none ("Split bar" 24,328) + SplitLegend stack ("Legend" 259.2,201.5) · 10 · LedgerRow pair ("Ledger" 24,366)
  'admin-1': {
    h: 1138,
    node: () => {
      const roles = [{ label: 'Tagok', count: 15 }, { label: 'Edzők', count: 3 }, { label: 'Adminok', count: 1 }];
      return (
        <>
          <At x={259.2} y={201.5} w={120} h={110.5}>
            <SplitLegend layout="stack" parts={roles} className="h-full" />
          </At>
          <At x={24} y={328} w={354}>
            <SplitBar legend="none" parts={roles} />
          </At>
          <At x={24} y={366} w={354}>
            <RowStack open close>
              <LedgerRow label="Gyakorlat" value={1656} pair={{ label: 'Médiafájl', value: 3 }} />
            </RowStack>
          </At>
        </>
      );
    },
  },
  // 4 · feed rows: kicker, byline, price on the sub line ("Post list" 24,624)
  'marketplace-1': {
    h: 1176,
    node: () => (
      <At x={24} y={624} w={354}>
        <RowStack close>
          <ListRow to="#" pad="loose" kickerLead="Közlemény" kicker="Budapest · 2026. 10. 05." title="Novembertől két új időpont" sub={byline('Kovács Péter', true)} />
          <ListRow to="#" pad="loose" kickerLead="Esemény" kicker="Budapest · 2026. 10. 30." title="Guggolás-technika műhely – október 30." sub={byline('Kovács Péter', true)} value="12 000 Ft" valueOn="sub" />
          <ListRow to="#" pad="loose" kickerLead="Program" kicker="Budapest · 2026. 09. 18." title="Őszi erőblokk – 8 hetes csoportos program" sub={byline('Kovács Péter', true)} value="69 000 Ft" valueOn="sub" />
          <ListRow to="#" pad="loose" kickerLead="Program" kicker="Szeged · 2026. 09. 09." title="Félmaraton 12 hét alatt – kezdőknek" sub={byline('Szilágyi Réka')} value="32 000 Ft" valueOn="sub" />
          <ListRow to="#" pad="loose" kickerLead="Közlemény" kicker="Online · 2026. 08. 25." title="Ingyenes kalisztenika bemelegítő sorozat" sub={byline('Fehér Tamás')} />
        </RowStack>
      </At>
    ),
  },
  // 10 · figure + unit values ("Records" 24,934)
  'client-detail-3': {
    h: 1542,
    node: () => (
      <At x={24} y={934} w={354}>
        <RowStack>
          <ListRow title="Bench Press" sub="becsült 1RM · 2026-10-07" value="108" valueUnit="kg" />
          <ListRow title="Barbell Squat" sub="becsült 1RM · 2026-10-05" value="131.3" valueUnit="kg" />
          <ListRow title="Barbell Hip Thrust" sub="becsült 1RM · 2026-09-26" value="133.3" valueUnit="kg" />
          <ListRow title="Bent Over Barbell Row" sub="becsült 1RM · 2026-09-25" value="98.2" valueUnit="kg" />
        </RowStack>
      </At>
    ),
  },
  // 13 · SegmentBar slots ("Cycle strip" 24,252)
  'plan-editor-1': {
    h: 874,
    node: () => (
      <At x={24} y={252} w={354}>
        <SegmentBar label="7 napos ciklus" slots={strip(null)} />
      </At>
    ),
  },
  'plan-editor-2': {
    h: 2078,
    node: () => (
      <At x={24} y={252} w={354}>
        <SegmentBar label="7 napos ciklus" slots={strip(5)} />
      </At>
    ),
  },
  // 13 · Numeral dot (hero "Active variant/D" 24,232 · rail "Letter/D" 24,927)
  'style-studio-1': {
    h: 1226,
    node: () => (
      <>
        <At x={24} y={232}>
          <Numeral size="giant" value="D" dot />
        </At>
        <At x={24} y={927}>
          <Numeral value="D" dot />
        </At>
      </>
    ),
  },
  // 13 · EmptyState narrow ("Empty state" 24,365)
  'notifications-2': {
    h: 874,
    node: () => (
      <At x={24} y={365} w={354}>
        <EmptyState measure="narrow" title="Nincs értesítés" body="Ha üzenetet kapsz vagy változik a terved, itt jelenik meg." />
      </At>
    ),
  },
  // 13 · MacroColumns tracks ("Metric row" 24,650)
  'progress-1': {
    h: 1687,
    node: () => (
      <At x={24} y={650} w={354}>
        <MacroColumns
          tracks={4}
          columns={[
            { name: 'Kar (jobb)', value: '37,9', unit: 'cm', caption: '2026-09-11' },
            { name: 'Testzsír', value: '18,6', unit: '%', caption: '2026-10-02' },
            { name: 'Mellkas', value: '105,1', unit: 'cm', caption: '2026-09-11' },
            { name: 'Derék', value: '87,5', unit: 'cm', caption: '2026-09-25' },
          ]}
        />
      </At>
    ),
  },
  // 11 · UserPhoto feather + bleed (the cover, 4:3, under the top bar). The frame's cover art is a
  // sample photograph that is not in the product; the stand-in is the one opaque image it ships.
  'post-detail-1': {
    h: 1166,
    node: () => (
      <At x={24} y={96} w={354}>
        <UserPhoto src={pulseSrcSet('texture-monogram').src} alt="" ratio={4 / 3} feather bleed />
      </At>
    ),
  },
};

function Kit() {
  return (
    <div className="flex flex-col gap-12 p-6" style={{ width: 402 }}>
      {specimens.map((s, i) => (
        <section key={i} data-cell={i} className="flex flex-col gap-3">
          <p className="text-micro text-text-3">{s.label}</p>
          {s.node}
        </section>
      ))}
    </div>
  );
}

function App() {
  const key = location.hash.slice(1) || 'kit';
  if (key === 'kit') return <Kit />;
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
